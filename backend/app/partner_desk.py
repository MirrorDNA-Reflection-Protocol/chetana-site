from __future__ import annotations

import fcntl
import hashlib
import json
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from cryptography.fernet import Fernet, InvalidToken
from pydantic import BaseModel, ConfigDict, Field


CONTACT_CONSENT_TOKEN = "I_CONSENT_TO_ACTIVE_MIRROR_PARTNER_FOLLOW_UP_V1"
PARTNER_DESK_ROOT = Path(
    os.getenv(
        "CHETANA_PARTNER_DESK_ROOT",
        str(Path.home() / ".mirrordna" / "chetana" / "partners" / "desk"),
    )
)
RETENTION_DAYS = 180
MAX_PROSPECT_MESSAGES = 12
MAX_CONVERSATION_CHARS = 12_000


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PartnerInquiryRequest(StrictModel):
    name: str = Field(min_length=2, max_length=120)
    organization: str = Field(min_length=2, max_length=160)
    role: str = Field(default="", max_length=120)
    email: str = Field(min_length=5, max_length=180)
    pilot_type: Literal[
        "bank_psp",
        "government_public_program",
        "csr_digital_safety",
        "telecom_fraud",
        "merchant_network",
        "other",
    ] = "bank_psp"
    message: str = Field(default="", max_length=2000)
    source_path: str = Field(default="/partners", max_length=160)
    website: str = Field(default="", max_length=160)
    consent_token: Literal["I_CONSENT_TO_ACTIVE_MIRROR_PARTNER_FOLLOW_UP_V1"]


class PartnerMessageRequest(StrictModel):
    conversation_token: str = Field(min_length=32, max_length=128)
    message: str = Field(min_length=4, max_length=2000)


class PartnerDeleteRequest(StrictModel):
    deletion_token: str = Field(min_length=32, max_length=128)


class PartnerPublicMessageRequest(StrictModel):
    message: str = Field(min_length=4, max_length=2000)


class PartnerDeskError(RuntimeError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_PROMPT_INJECTION_RE = re.compile(
    r"\b(ignore|override|reveal|disclose|print|repeat)\b.{0,80}"
    r"\b(instruction|system prompt|policy|secret|credential|token|developer message)\b|"
    r"\b(execute|run|download|open)\b.{0,50}\b(command|script|attachment|url|tool)\b",
    re.IGNORECASE,
)
_SECRET_RE = re.compile(
    r"\b(?:api[_ -]?key|password|passcode|private[_ -]?key|client[_ -]?secret|otp)\b\s*[:=]",
    re.IGNORECASE,
)
_AADHAAR_RE = re.compile(r"(?<!\d)\d{4}[ -]?\d{4}[ -]?\d{4}(?!\d)")
_PAN_RE = re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b", re.IGNORECASE)
_CARD_RE = re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)")
_COMMITMENT_RE = re.compile(
    r"\b(price|pricing|quote|discount|budget|contract|agreement|mou|nda|dpa|sla|"
    r"liability|indemnity|warranty|procurement|tender|purchase order|commercial terms|"
    r"data processing|production integration|security review|pen test|audit access)\b",
    re.IGNORECASE,
)
_MEETING_RE = re.compile(r"\b(meet|meeting|call|zoom|teams|calendar|demo)\b", re.IGNORECASE)
_PRIVACY_RE = re.compile(r"\b(privacy|personal data|retention|delete|dpdp|consent|pii)\b", re.IGNORECASE)
_SECURITY_RE = re.compile(r"\b(security|encryption|assurance|benchmark|evidence|audit|breach)\b", re.IGNORECASE)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _compact(value: str | None, limit: int) -> str:
    cleaned = _CONTROL_RE.sub("", value or "")
    return re.sub(r"\s+", " ", cleaned.strip())[:limit]


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _canonical(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def public_conversation_payload(conversation: dict[str, Any]) -> dict[str, Any]:
    """Remove capability secrets before a conversation response reaches browser JavaScript."""
    return {
        key: value
        for key, value in conversation.items()
        if key not in {"conversation_token", "deletion_token"} and not key.startswith("_")
    }


def _paths(root: Path | None = None) -> tuple[Path, Path, Path]:
    base = root or PARTNER_DESK_ROOT
    return base, base / "conversations", base / "partner_desk.key"


def _ensure_private_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path, 0o700)


def _fernet(root: Path | None = None) -> Fernet:
    base, _, key_path = _paths(root)
    _ensure_private_dir(base)
    if not key_path.exists():
        try:
            fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            pass
        else:
            with os.fdopen(fd, "wb") as handle:
                handle.write(Fernet.generate_key())
                handle.flush()
                os.fsync(handle.fileno())
    os.chmod(key_path, 0o600)
    return Fernet(key_path.read_bytes().strip())


def _conversation_path(conversation_id: str, root: Path | None = None) -> Path:
    if not re.fullmatch(r"cpd_[a-f0-9]{32}", conversation_id):
        raise PartnerDeskError("conversation_not_found")
    _, conversations, _ = _paths(root)
    _ensure_private_dir(conversations)
    return conversations / f"{conversation_id}.jsonl"


def _load_events(path: Path, cipher: Fernet) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    if not path.exists():
        raise PartnerDeskError("conversation_not_found")
    records: list[tuple[dict[str, Any], dict[str, Any]]] = []
    previous_hash = "0" * 64
    with path.open("r", encoding="utf-8") as handle:
        fcntl.flock(handle, fcntl.LOCK_SH)
        lines = handle.read().splitlines()
        fcntl.flock(handle, fcntl.LOCK_UN)
    for expected_sequence, line in enumerate(lines, start=1):
        try:
            envelope = json.loads(line)
            claimed_hash = envelope.pop("event_hash")
            actual_hash = _digest(_canonical(envelope).decode("utf-8"))
            if (
                envelope.get("sequence") != expected_sequence
                or envelope.get("previous_hash") != previous_hash
                or not secrets.compare_digest(claimed_hash, actual_hash)
            ):
                raise PartnerDeskError("conversation_integrity_failed")
            payload = json.loads(cipher.decrypt(envelope["ciphertext"].encode("ascii")))
        except (json.JSONDecodeError, KeyError, InvalidToken, ValueError):
            raise PartnerDeskError("conversation_integrity_failed") from None
        records.append((dict(envelope, event_hash=claimed_hash), payload))
        previous_hash = claimed_hash
    if not records:
        raise PartnerDeskError("conversation_integrity_failed")
    return records


def _append_event(path: Path, cipher: Fernet, event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(path, os.O_RDWR | os.O_CREAT, 0o600)
    with os.fdopen(fd, "r+", encoding="utf-8") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        lines = [line for line in handle.read().splitlines() if line.strip()]
        previous_hash = "0" * 64
        if lines:
            try:
                last = json.loads(lines[-1])
                previous_hash = last["event_hash"]
            except (json.JSONDecodeError, KeyError):
                raise PartnerDeskError("conversation_integrity_failed") from None
        now = _now().isoformat()
        envelope = {
            "schema_version": "chetana.partner_desk_event.v1",
            "sequence": len(lines) + 1,
            "event_id": f"cpde_{uuid4().hex}",
            "event_type": event_type,
            "recorded_at_utc": now,
            "previous_hash": previous_hash,
            "ciphertext": cipher.encrypt(_canonical(payload)).decode("ascii"),
        }
        envelope["event_hash"] = _digest(_canonical(envelope).decode("utf-8"))
        handle.seek(0, os.SEEK_END)
        handle.write(json.dumps(envelope, sort_keys=True, ensure_ascii=True) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
        fcntl.flock(handle, fcntl.LOCK_UN)
    os.chmod(path, 0o600)
    return envelope


def _reply(
    reply: str,
    *,
    status: str = "qualifying",
    questions: list[str] | None = None,
    requires_approval: bool = False,
    blocked_reason: str | None = None,
) -> dict[str, Any]:
    return {
        "schema_version": "chetana.partner_desk_reply.v1",
        "identity": "Chetana Partner Desk, an AI-assisted service by Active Mirror",
        "reply": reply,
        "questions": questions or [],
        "status": status,
        "requires_human_approval": requires_approval,
        "blocked_reason": blocked_reason,
        "authority_boundary": (
            "The desk may explain published evidence and qualify a pilot. It cannot bind Active Mirror, "
            "accept procurement or legal terms, quote final pricing, access partner systems, or promise outcomes."
        ),
        "outbound_email_sent": False,
        "outbound_email_status": "disabled_until_authenticated_partner_mailbox",
    }


def _initial_reply(pilot_type: str) -> dict[str, Any]:
    lane = {
        "bank_psp": "bank or payments fraud-risk",
        "government_public_program": "government or public digital-safety",
        "csr_digital_safety": "CSR digital-safety",
        "telecom_fraud": "telecom anti-fraud",
        "merchant_network": "merchant-network",
        "other": "institutional",
    }[pilot_type]
    return _reply(
        f"Thank you. I can qualify the {lane} pilot asynchronously, so an introductory meeting is not required. "
        "I will keep the discussion within Chetana's published evidence and pilot boundaries.",
        questions=[
            "Which geography and audience should the pilot serve?",
            "How would people reach Chetana: QR, branch, app, WhatsApp campaign, merchant counter, or another channel?",
            "What measurable outcome would make a 30-day pilot useful?",
            "What target start window and approximate audience size should we plan for?",
        ],
    )


def _classify_message(message: str) -> tuple[str, str | None]:
    if _PROMPT_INJECTION_RE.search(message):
        return "blocked", "instruction_or_tool_injection"
    if _SECRET_RE.search(message) or _AADHAAR_RE.search(message) or _PAN_RE.search(message) or _CARD_RE.search(message):
        return "blocked", "sensitive_or_credential_data"
    if _COMMITMENT_RE.search(message):
        return "approval_required", None
    if _MEETING_RE.search(message):
        return "async_meeting_deflection", None
    if _PRIVACY_RE.search(message):
        return "privacy", None
    if _SECURITY_RE.search(message):
        return "security", None
    return "qualification", None


def _message_reply(message: str) -> tuple[dict[str, Any], bool]:
    category, blocked_reason = _classify_message(message)
    if category == "blocked":
        return _reply(
            "I did not retain that message content. Please remove credentials, government identifiers, card or account details, "
            "attachments, and instructions asking the desk to reveal policy or use tools, then try again.",
            status="blocked_safe_retry",
            blocked_reason=blocked_reason,
        ), False
    if category == "approval_required":
        return _reply(
            "I recorded the request, but I cannot agree to commercial, legal, procurement, security-review, integration, or data-processing terms. "
            "I can continue collecting scope asynchronously and prepare a decision packet for authorised review.",
            status="approval_required",
            questions=[
                "What exact deliverable or clause needs a written decision?",
                "What deadline and procurement process apply?",
                "Can the first pilot remain aggregate-only with no partner access to raw user submissions?",
            ],
            requires_approval=True,
        ), True
    if category == "async_meeting_deflection":
        return _reply(
            "We can complete initial qualification asynchronously. Please send the pilot audience, geography, channel, success measure, timeline, "
            "and any written questions. A meeting is held only if a final implementation issue cannot be resolved in writing.",
            status="qualifying_async",
        ), True
    if category == "privacy":
        return _reply(
            "Chetana's sponsor reporting is aggregate-only by default. The Partner Desk encrypts this business conversation locally, "
            "does not accept scam screenshots or account data, supports deletion, and expires inactive conversations after 180 days.",
            questions=["Does your organisation require a written privacy or data-processing review before a no-raw-data pilot?"],
        ), True
    if category == "security":
        return _reply(
            "The current public evidence is available in the Chetana Safety Lab. Its signed 7-case suite is a regression smoke test, not field-efficacy proof. "
            "A pilot should define independent acceptance criteria and keep unchecked claims explicit.",
            questions=["Which security, assurance, or vendor-review controls must be answered in writing?"],
        ), True
    return _reply(
        "I recorded that scope. I can keep qualifying the pilot in writing and turn the final requirements into a bounded decision packet.",
        questions=[
            "What user action should Chetana help pause or route?",
            "Which aggregate metric should determine whether the pilot continues?",
            "Who is authorised to approve a written pilot inside your organisation?",
        ],
    ), True


def start_partner_conversation(
    request: PartnerInquiryRequest,
    *,
    root: Path | None = None,
) -> dict[str, Any]:
    conversation_id = f"cpd_{uuid4().hex}"
    conversation_token = secrets.token_urlsafe(32)
    deletion_token = secrets.token_urlsafe(32)
    now = _now()
    initial_message = _compact(request.message, 2000)
    if initial_message:
        message_reply, retain_initial_content = _message_reply(initial_message)
        reply = message_reply if message_reply["status"] != "qualifying" else _initial_reply(request.pilot_type)
    else:
        retain_initial_content = True
        reply = _initial_reply(request.pilot_type)
    payload = {
        "conversation_id": conversation_id,
        "created_at_utc": now.isoformat(),
        "expires_at_utc": (now + timedelta(days=RETENTION_DAYS)).isoformat(),
        "conversation_token_sha256": _digest(conversation_token),
        "deletion_token_sha256": _digest(deletion_token),
        "consent": {
            "version": "active_mirror_partner_follow_up_v1",
            "captured_at_utc": now.isoformat(),
            "purpose": "respond_to_and_qualify_this_institutional_inquiry",
        },
        "contact": {
            "name": _compact(request.name, 120),
            "organization": _compact(request.organization, 160),
            "role": _compact(request.role, 120),
            "email": _compact(request.email, 180).lower(),
        },
        "pilot_type": request.pilot_type,
        "source_path": _compact(request.source_path, 160),
        "initial_message": initial_message if retain_initial_content else None,
        "initial_message_sha256": _digest(initial_message),
        "initial_message_length": len(initial_message),
        "initial_message_content_retained": retain_initial_content,
        "desk_reply": reply,
    }
    path = _conversation_path(conversation_id, root)
    started_event = _append_event(path, _fernet(root), "conversation_started", payload)
    return {
        "conversation_id": conversation_id,
        "conversation_token": conversation_token,
        "deletion_token": deletion_token,
        "retention_expires_at_utc": payload["expires_at_utc"],
        "storage_boundary": "encrypted_local_conversation_aggregate_pilot_metrics_only",
        "desk": reply,
        "_approval_trigger_event_id": (
            started_event["event_id"] if reply["requires_human_approval"] else None
        ),
    }


def continue_partner_conversation(
    conversation_id: str,
    request: PartnerMessageRequest,
    *,
    root: Path | None = None,
) -> dict[str, Any]:
    path = _conversation_path(conversation_id, root)
    cipher = _fernet(root)
    records = _load_events(path, cipher)
    started = records[0][1]
    if not secrets.compare_digest(started["conversation_token_sha256"], _digest(request.conversation_token)):
        raise PartnerDeskError("conversation_token_invalid")
    if datetime.fromisoformat(started["expires_at_utc"]) <= _now():
        path.unlink(missing_ok=True)
        raise PartnerDeskError("conversation_expired")
    prospect_payloads = [payload for envelope, payload in records if envelope["event_type"] == "prospect_message"]
    if len(prospect_payloads) >= MAX_PROSPECT_MESSAGES:
        raise PartnerDeskError("conversation_message_limit_reached")
    prior_chars = sum(int(payload.get("message_length", 0)) for payload in prospect_payloads)
    compact = _compact(request.message, 2000)
    if prior_chars + len(compact) > MAX_CONVERSATION_CHARS:
        raise PartnerDeskError("conversation_size_limit_reached")
    reply, retain_content = _message_reply(compact)
    prospect_payload = {
        "message_sha256": _digest(compact),
        "message_length": len(compact),
        "content_retained": retain_content,
        "message": compact if retain_content else None,
        "classification": reply["status"],
        "blocked_reason": reply["blocked_reason"],
    }
    prospect_event = _append_event(path, cipher, "prospect_message", prospect_payload)
    _append_event(path, cipher, "desk_response", {"desk_reply": reply})
    return {
        "conversation_id": conversation_id,
        "desk": reply,
        "_approval_trigger_event_id": (
            prospect_event["event_id"] if reply["requires_human_approval"] else None
        ),
    }


def record_partner_notification(
    conversation_id: str,
    *,
    trigger_event_id: str,
    channel: Literal["telegram", "email"],
    status: Literal["sent", "failed_or_unconfigured", "queued_no_authenticated_transport"],
    target: str,
    root: Path | None = None,
) -> dict[str, Any]:
    path = _conversation_path(conversation_id, root)
    cipher = _fernet(root)
    records = _load_events(path, cipher)
    if not any(envelope["event_id"] == trigger_event_id for envelope, _ in records):
        raise PartnerDeskError("notification_trigger_not_found")
    for envelope, payload in reversed(records):
        if (
            envelope["event_type"] == "operator_notification"
            and payload.get("trigger_event_id") == trigger_event_id
            and payload.get("channel") == channel
            and payload.get("status") == "sent"
        ):
            return {"recorded": False, "already_sent": True, "status": "sent"}
    event = _append_event(
        path,
        cipher,
        "operator_notification",
        {
            "trigger_event_id": trigger_event_id,
            "channel": channel,
            "status": status,
            "target_sha256": _digest(target.strip().lower()),
            "contains_direct_contact_data": False,
            "contains_pseudonymous_conversation_id": True,
        },
    )
    return {"recorded": True, "already_sent": False, "status": status, "event_id": event["event_id"]}


def partner_notification_status(
    conversation_id: str,
    *,
    trigger_event_id: str,
    channel: Literal["telegram", "email"],
    root: Path | None = None,
) -> str | None:
    path = _conversation_path(conversation_id, root)
    records = _load_events(path, _fernet(root))
    for envelope, payload in reversed(records):
        if (
            envelope["event_type"] == "operator_notification"
            and payload.get("trigger_event_id") == trigger_event_id
            and payload.get("channel") == channel
        ):
            return str(payload.get("status"))
    return None


def record_operator_review(
    conversation_id: str,
    *,
    state: Literal["reviewed_no_commitment", "closed_no_commitment"],
    root: Path | None = None,
) -> dict[str, Any]:
    path = _conversation_path(conversation_id, root)
    cipher = _fernet(root)
    _load_events(path, cipher)
    event = _append_event(
        path,
        cipher,
        "operator_review",
        {
            "state": state,
            "authority_boundary": "internal_workflow_state_only_no_partner_reply_no_commercial_commitment",
        },
    )
    return {"recorded": True, "state": state, "event_id": event["event_id"]}


def build_partner_decision_packet(
    conversation_id: str,
    *,
    root: Path | None = None,
) -> dict[str, Any]:
    path = _conversation_path(conversation_id, root)
    records = _load_events(path, _fernet(root))
    first_envelope, started = records[0]
    decision_requests: list[str] = []
    scope_messages: list[str] = []
    initial_message = started.get("initial_message")
    initial_status = started.get("desk_reply", {}).get("status")
    if initial_message:
        (decision_requests if initial_status == "approval_required" else scope_messages).append(initial_message)
    notifications: list[dict[str, Any]] = []
    operator_state = "needs_review" if started.get("desk_reply", {}).get("requires_human_approval") else "qualifying"
    for envelope, payload in records[1:]:
        if envelope["event_type"] == "prospect_message" and payload.get("message"):
            target = decision_requests if payload.get("classification") == "approval_required" else scope_messages
            target.append(payload["message"])
        elif envelope["event_type"] == "operator_notification":
            notifications.append(
                {
                    "channel": payload.get("channel"),
                    "status": payload.get("status"),
                    "trigger_event_id": payload.get("trigger_event_id"),
                    "recorded_at_utc": envelope["recorded_at_utc"],
                }
            )
        elif envelope["event_type"] == "operator_review":
            operator_state = payload.get("state", operator_state)
    if decision_requests and operator_state == "qualifying":
        operator_state = "needs_review"
    packet = {
        "schema_version": "chetana.partner_decision_packet.v1",
        "conversation_id": conversation_id,
        "assembled_from_event_hash": records[-1][0]["event_hash"],
        "assembled_at_utc": records[-1][0]["recorded_at_utc"],
        "created_at_utc": started["created_at_utc"],
        "expires_at_utc": started["expires_at_utc"],
        "pilot_type": started["pilot_type"],
        "source_path": started["source_path"],
        "contact": started["contact"],
        "operator_state": operator_state,
        "decision_requests": decision_requests,
        "scope_messages": scope_messages,
        "notifications": notifications,
        "risk_flags": [
            "contains_personal_data_operator_only",
            "request_is_non_binding_until_authorised_written_approval",
            "do_not_forward_raw_packet_to_external_services",
        ],
        "authority_boundary": (
            "This packet supports internal review only. It is not acceptance, pricing, a contract, "
            "a procurement response, a legal opinion, or a partner communication."
        ),
        "contains_personal_data": True,
        "initial_event_id": first_envelope["event_id"],
    }
    packet["packet_sha256"] = _digest(_canonical(packet).decode("utf-8"))
    return packet


def list_partner_decision_packets(*, root: Path | None = None) -> list[dict[str, Any]]:
    _, conversations, _ = _paths(root)
    if not conversations.exists():
        return []
    packets: list[dict[str, Any]] = []
    for path in sorted(conversations.glob("cpd_*.jsonl")):
        try:
            packets.append(build_partner_decision_packet(path.stem, root=root))
        except PartnerDeskError:
            continue
    return sorted(packets, key=lambda item: item["created_at_utc"], reverse=True)


def list_pending_partner_alerts(*, root: Path | None = None) -> list[dict[str, str | None]]:
    _, conversations, _ = _paths(root)
    if not conversations.exists():
        return []
    pending: list[dict[str, str | None]] = []
    for path in sorted(conversations.glob("cpd_*.jsonl")):
        try:
            records = _load_events(path, _fernet(root))
        except PartnerDeskError:
            continue
        started = records[0][1]
        triggers: list[str] = []
        if started.get("desk_reply", {}).get("requires_human_approval"):
            triggers.append(records[0][0]["event_id"])
        triggers.extend(
            envelope["event_id"]
            for envelope, payload in records
            if envelope["event_type"] == "prospect_message"
            and payload.get("classification") == "approval_required"
        )
        for trigger_event_id in triggers:
            telegram = None
            email = None
            for envelope, payload in records:
                if envelope["event_type"] != "operator_notification" or payload.get("trigger_event_id") != trigger_event_id:
                    continue
                if payload.get("channel") == "telegram":
                    telegram = payload.get("status")
                elif payload.get("channel") == "email":
                    email = payload.get("status")
            if telegram != "sent" or email != "sent":
                pending.append(
                    {
                        "conversation_id": path.stem,
                        "trigger_event_id": trigger_event_id,
                        "pilot_type": started["pilot_type"],
                        "telegram_status": telegram,
                        "email_status": email,
                    }
                )
    return pending


def delete_partner_conversation(
    conversation_id: str,
    request: PartnerDeleteRequest,
    *,
    root: Path | None = None,
) -> dict[str, Any]:
    path = _conversation_path(conversation_id, root)
    cipher = _fernet(root)
    records = _load_events(path, cipher)
    started = records[0][1]
    if not secrets.compare_digest(started["deletion_token_sha256"], _digest(request.deletion_token)):
        raise PartnerDeskError("deletion_token_invalid")
    path.unlink()
    base, _, _ = _paths(root)
    audit_path = base / "deletions.jsonl"
    audit = {
        "schema_version": "chetana.partner_desk_deletion.v1",
        "conversation_id_sha256": _digest(conversation_id),
        "deleted_at_utc": _now().isoformat(),
        "encrypted_conversation_removed": True,
    }
    fd = os.open(audit_path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
    with os.fdopen(fd, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(audit, sort_keys=True, ensure_ascii=True) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    return {"deleted": True, "conversation_id": conversation_id}


def purge_expired_partner_conversations(*, root: Path | None = None, now: datetime | None = None) -> int:
    _, conversations, _ = _paths(root)
    if not conversations.exists():
        return 0
    cutoff = now or _now()
    cipher = _fernet(root)
    purged = 0
    for path in conversations.glob("cpd_*.jsonl"):
        try:
            started = _load_events(path, cipher)[0][1]
            expires_at = datetime.fromisoformat(started["expires_at_utc"])
        except (PartnerDeskError, KeyError, ValueError):
            continue
        if expires_at <= cutoff:
            path.unlink(missing_ok=True)
            purged += 1
    return purged


def conversation_integrity_status(conversation_id: str, *, root: Path | None = None) -> dict[str, Any]:
    path = _conversation_path(conversation_id, root)
    records = _load_events(path, _fernet(root))
    started = records[0][1]
    approval_required = bool(started.get("desk_reply", {}).get("requires_human_approval")) or any(
        payload.get("classification") == "approval_required" for _, payload in records
    )
    operator_state = "needs_review" if approval_required else "qualifying"
    notifications: dict[str, str] = {}
    for envelope, payload in records:
        if envelope["event_type"] == "operator_notification":
            notifications[str(payload.get("channel"))] = str(payload.get("status"))
        elif envelope["event_type"] == "operator_review":
            operator_state = str(payload.get("state", operator_state))
    return {
        "conversation_id": conversation_id,
        "integrity_valid": True,
        "event_count": len(records),
        "pilot_type": started["pilot_type"],
        "expires_at_utc": started["expires_at_utc"],
        "approval_required": approval_required,
        "operator_state": operator_state,
        "notification_status": notifications,
    }
