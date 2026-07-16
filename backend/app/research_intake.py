from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


RESEARCH_CONSENT_TOKEN = "I_CONSENT_TO_CHETANA_RESEARCH_DATA_DONATION_V1"
RESEARCH_ROOT = Path(
    os.getenv(
        "CHETANA_RESEARCH_ROOT",
        str(Path.home() / ".mirrordna" / "chetana" / "research"),
    )
)
CANDIDATE_LOG = RESEARCH_ROOT / "candidates.jsonl"
DELETION_LOG = RESEARCH_ROOT / "deletions.jsonl"
RETENTION_DAYS = 90


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ResearchCandidateRequest(StrictModel):
    scan_id: str = Field(min_length=8, max_length=96)
    feedback_type: Literal["missed_scam", "too_cautious", "scammed_after_scan"]
    input_type: Literal["text", "screenshot", "qr_image", "payment_screenshot", "mixed"]
    language_hint: str = Field(default="und", min_length=2, max_length=16)
    text: str = Field(min_length=12, max_length=8000)
    consent_token: Literal["I_CONSENT_TO_CHETANA_RESEARCH_DATA_DONATION_V1"]


class ResearchCandidateResponse(StrictModel):
    accepted: Literal[True] = True
    candidate_id: str
    status: Literal["quarantined_pending_review"] = "quarantined_pending_review"
    redaction_count: int = Field(ge=0)
    retention_expires_at_utc: str
    deletion_token: str
    storage_boundary: str


class ResearchDeletionRequest(StrictModel):
    candidate_id: str = Field(min_length=8, max_length=96)
    deletion_token: str = Field(min_length=32, max_length=128)


class ResearchDeletionResponse(StrictModel):
    deleted: bool
    candidate_id: str
    reason: str


_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
_UPI_RE = re.compile(r"\b[A-Z0-9._-]{2,}@[A-Z][A-Z0-9.-]{1,}\b", re.IGNORECASE)
_PHONE_RE = re.compile(r"(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)")
_LONG_NUMBER_RE = re.compile(r"(?<!\d)\d{6,18}(?!\d)")
_URL_RE = re.compile(r"https?://[^\s<>]+", re.IGNORECASE)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _redact_url(match: re.Match[str]) -> str:
    try:
        host = urlsplit(match.group(0)).hostname
    except ValueError:
        host = None
    return f"[URL:{host}]" if host else "[URL]"


def redact_research_text(text: str) -> tuple[str, int]:
    compact = re.sub(r"[\t\r ]+", " ", text.strip())
    redactions = 0
    for pattern, replacement in (
        (_URL_RE, _redact_url),
        (_EMAIL_RE, "[EMAIL]"),
        (_UPI_RE, "[UPI_ID]"),
        (_PHONE_RE, "[PHONE]"),
        (_LONG_NUMBER_RE, "[NUMBER]"),
    ):
        compact, count = pattern.subn(replacement, compact)
        redactions += count
    return compact[:8000], redactions


def _records(path: Path) -> list[dict]:
    if not path.exists():
        return []
    records: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return records


def _write_records(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path.parent, 0o700)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write("".join(json.dumps(item, sort_keys=True, ensure_ascii=True) + "\n" for item in records))
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    finally:
        temporary.unlink(missing_ok=True)


def purge_expired_candidates(
    *,
    candidate_log: Path | None = None,
    now: datetime | None = None,
) -> int:
    path = candidate_log or CANDIDATE_LOG
    records = _records(path)
    cutoff = now or _now()
    retained: list[dict] = []
    purged = 0
    for record in records:
        expires_at = record.get("retention_expires_at_utc")
        try:
            expiry = datetime.fromisoformat(expires_at) if isinstance(expires_at, str) else None
        except ValueError:
            expiry = None
        if expiry is not None and expiry.tzinfo is not None and expiry <= cutoff:
            purged += 1
        else:
            retained.append(record)
    if purged:
        _write_records(path, retained)
    return purged


def accept_research_candidate(
    request: ResearchCandidateRequest,
    *,
    candidate_log: Path | None = None,
) -> ResearchCandidateResponse:
    path = candidate_log or CANDIDATE_LOG
    purge_expired_candidates(candidate_log=path)
    sanitized_text, redaction_count = redact_research_text(request.text)
    now = _now()
    candidate_id = f"crc_{uuid4().hex}"
    deletion_token = secrets.token_urlsafe(32)
    payload = {
        "schema_version": "chetana.research_candidate.v0.1",
        "candidate_id": candidate_id,
        "received_at_utc": now.isoformat(),
        "retention_expires_at_utc": (now + timedelta(days=RETENTION_DAYS)).isoformat(),
        "status": "quarantined_pending_review",
        "scan_id_hash": _hash(request.scan_id),
        "feedback_type": request.feedback_type,
        "input_type": request.input_type,
        "language_hint": request.language_hint,
        "sanitized_text": sanitized_text,
        "sanitized_text_sha256": _hash(sanitized_text),
        "raw_text_stored": False,
        "redaction_count": redaction_count,
        "consent_version": "chetana_research_donation_v1",
        "deletion_token_sha256": _hash(deletion_token),
        "promotion_state": "blocked_pending_two_person_adjudication",
    }
    records = _records(path)
    records.append(payload)
    _write_records(path, records)
    return ResearchCandidateResponse(
        candidate_id=candidate_id,
        redaction_count=redaction_count,
        retention_expires_at_utc=payload["retention_expires_at_utc"],
        deletion_token=deletion_token,
        storage_boundary="sanitized_text_only_sanitized_digest_90_day_retention",
    )


def delete_research_candidate(
    request: ResearchDeletionRequest,
    *,
    candidate_log: Path | None = None,
    deletion_log: Path | None = None,
) -> ResearchDeletionResponse:
    path = candidate_log or CANDIDATE_LOG
    purge_expired_candidates(candidate_log=path)
    records = _records(path)
    match = next((item for item in records if item.get("candidate_id") == request.candidate_id), None)
    if not match:
        return ResearchDeletionResponse(deleted=False, candidate_id=request.candidate_id, reason="candidate_not_found")
    if not secrets.compare_digest(match.get("deletion_token_sha256", ""), _hash(request.deletion_token)):
        return ResearchDeletionResponse(deleted=False, candidate_id=request.candidate_id, reason="deletion_token_invalid")
    _write_records(path, [item for item in records if item.get("candidate_id") != request.candidate_id])
    audit_path = deletion_log or DELETION_LOG
    audit_records = _records(audit_path)
    audit_records.append(
        {
            "schema_version": "chetana.research_deletion.v0.1",
            "candidate_id_hash": _hash(request.candidate_id),
            "deleted_at_utc": _now().isoformat(),
            "sanitized_candidate_removed": True,
        }
    )
    _write_records(audit_path, audit_records)
    return ResearchDeletionResponse(deleted=True, candidate_id=request.candidate_id, reason="candidate_deleted")
