from __future__ import annotations

import hashlib
import json
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

InputType = Literal["screenshot", "text", "qr_image", "payment_screenshot", "mixed"]
VerdictValue = Literal["high_risk", "caution", "needs_review", "low_signal"]
ScamType = Literal[
    "investment_scam",
    "fake_kyc",
    "upi_qr_scam",
    "fake_payment_proof",
    "parcel_customs_scam",
    "job_scam",
    "impersonation_pressure_scam",
    "unknown_suspicious_pattern",
]
ConfidenceBand = Literal["low", "medium", "high"]
ReasonCode = Literal[
    "urgency_pressure",
    "asks_for_money",
    "suspicious_return_claim",
    "impersonates_authority",
    "identity_mismatch",
    "suspicious_url",
    "qr_payload_mismatch",
    "payment_screenshot_anomaly",
    "move_off_platform",
    "threat_language",
    "language_inconsistency",
    "hidden_or_shortened_link",
    "unverifiable_contact",
]
RecommendedAction = Literal[
    "do_not_pay",
    "verify_with_official_source",
    "share_with_family",
    "save_evidence",
    "report_and_block",
    "scan_again_with_more_context",
    "treat_as_unclear",
]
EventName = Literal[
    "app_open",
    "scan_started",
    "scan_completed",
    "verdict_high_risk",
    "verdict_caution",
    "verdict_needs_review",
    "verdict_low_signal",
    "share_tapped",
    "share_completed",
    "report_tapped",
    "evidence_saved",
    "first_scan",
    "repeat_scan_7d",
]
ShareChannel = Literal["whatsapp", "sms", "telegram", "copy_link", "other"]
ReportTarget = Literal["block_only", "family_only", "manual_report", "other"]
DeviceClass = Literal["android_phone", "ios_phone", "web", "desktop", "unknown"]
ConsentClass = Literal["C0", "C1", "C2", "C3", "C4"]
PayloadClass = Literal["derived_state", "cross_surface_signal", "save_intent", "export_artifact"]
PersistenceClass = Literal["P0", "P1", "P2", "P3"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class V0Reason(StrictModel):
    code: ReasonCode
    label: str
    explanation: str


class V0Entities(StrictModel):
    phone_numbers: list[str] = Field(default_factory=list)
    urls: list[str] = Field(default_factory=list)
    upi_ids: list[str] = Field(default_factory=list)
    amounts: list[str] = Field(default_factory=list)
    merchant_names: list[str] = Field(default_factory=list)
    person_names: list[str] = Field(default_factory=list)


class V0Verdict(StrictModel):
    scan_id: str
    timestamp_utc: str
    input_type: InputType
    language_hint: str | None = None
    verdict: VerdictValue
    scam_type: ScamType
    confidence_band: ConfidenceBand
    reasons: list[V0Reason] = Field(min_length=1, max_length=5)
    entities: V0Entities | None = None
    summary_plain_language: str | None = None
    recommended_actions: list[RecommendedAction] = Field(min_length=1, max_length=4)
    share_shield_eligible: bool = False
    evidence_pack_eligible: bool = False
    notes: str | None = None


class V0ScanInput(StrictModel):
    input_type: InputType
    text: str = Field(default="", max_length=20000)
    language_hint: str | None = None
    source_name: str | None = None
    session_id: str | None = None


class V0EvidencePack(StrictModel):
    incident_id: str
    timestamp_utc: str
    input_hash: str
    input_type: InputType
    extracted_entities: V0Entities
    verdict: VerdictValue
    reasons: list[V0Reason]
    confidence_band: ConfidenceBand
    scan_summary: str
    share_card_id: str | None = None
    exportable_text_summary: str
    thumbnail_reference: str | None = None
    user_notes: str | None = None


class V0EvidenceRequest(StrictModel):
    verdict: V0Verdict
    input_text: str = Field(default="", max_length=20000)
    user_notes: str | None = None
    share_card_id: str | None = None
    thumbnail_reference: str | None = None


class V0Event(StrictModel):
    event_id: str
    event_name: EventName
    timestamp_utc: str
    session_id: str
    user_id_hash: str | None = None
    scan_id: str | None = None
    input_type: InputType | None = None
    verdict: VerdictValue | None = None
    scam_type: str | None = None
    confidence_band: ConfidenceBand | None = None
    share_channel: ShareChannel | None = None
    report_target: ReportTarget | None = None
    latency_ms: int | None = Field(default=None, ge=0)
    device_class: DeviceClass | None = None
    language_hint: str | None = None
    consent_class: ConsentClass = "C0"
    payload_class: PayloadClass = "derived_state"
    persistence_class: PersistenceClass = "P1"
    metadata: dict[str, Any] = Field(default_factory=dict)


class V0EventInput(StrictModel):
    event_name: EventName
    session_id: str
    user_id_hash: str | None = None
    scan_id: str | None = None
    input_type: InputType | None = None
    verdict: VerdictValue | None = None
    scam_type: str | None = None
    confidence_band: ConfidenceBand | None = None
    share_channel: ShareChannel | None = None
    report_target: ReportTarget | None = None
    latency_ms: int | None = Field(default=None, ge=0)
    device_class: DeviceClass | None = None
    language_hint: str | None = None
    consent_class: ConsentClass = "C0"
    payload_class: PayloadClass = "derived_state"
    persistence_class: PersistenceClass = "P1"
    metadata: dict[str, Any] = Field(default_factory=dict)


REASON_META: dict[ReasonCode, dict[str, Any]] = {
    "urgency_pressure": {
        "label": "Urgency pressure",
        "weight": 14,
        "explanation": "The message tries to rush you so you act before you verify.",
    },
    "asks_for_money": {
        "label": "Asks for money",
        "weight": 18,
        "explanation": "It asks for payment, transfer, deposit, or an advance fee.",
    },
    "suspicious_return_claim": {
        "label": "Suspicious return claim",
        "weight": 26,
        "explanation": "It promises guaranteed returns or unusually easy profit.",
    },
    "impersonates_authority": {
        "label": "Pretends to be an authority",
        "weight": 24,
        "explanation": "It claims to be from a bank, police, customs, or another authority.",
    },
    "identity_mismatch": {
        "label": "Identity mismatch",
        "weight": 18,
        "explanation": "The claimed identity does not match the contact details or link.",
    },
    "suspicious_url": {
        "label": "Suspicious link or domain",
        "weight": 18,
        "explanation": "The link does not look like a normal official domain.",
    },
    "qr_payload_mismatch": {
        "label": "QR payload mismatch",
        "weight": 22,
        "explanation": "The QR or payment payload points somewhere different from what the sender claims.",
    },
    "payment_screenshot_anomaly": {
        "label": "Payment screenshot anomaly",
        "weight": 24,
        "explanation": "The payment proof is missing details or looks inconsistent with a real confirmation.",
    },
    "move_off_platform": {
        "label": "Tries to move you off-platform",
        "weight": 10,
        "explanation": "It tries to move the conversation into a less safe or less verifiable channel.",
    },
    "threat_language": {
        "label": "Threat or penalty language",
        "weight": 18,
        "explanation": "It uses fear, penalties, arrest, or account blocking to pressure you.",
    },
    "language_inconsistency": {
        "label": "Language inconsistency",
        "weight": 8,
        "explanation": "The language looks unnatural or inconsistent with a normal official message.",
    },
    "hidden_or_shortened_link": {
        "label": "Hidden or shortened link",
        "weight": 12,
        "explanation": "The link is shortened or hides the true destination.",
    },
    "unverifiable_contact": {
        "label": "Unverifiable contact details",
        "weight": 10,
        "explanation": "The sender gives contact details that are hard to verify independently.",
    },
}


OFFICIAL_HOST_HINTS = (
    "gov.in",
    "cybercrime.gov.in",
    "onlinesbi.sbi",
    "sbi.co.in",
    "hdfcbank.com",
    "icicibank.com",
    "axisbank.com",
    "phonepe.com",
    "paytm.com",
    "google.com",
)
SHORTENER_HOSTS = {"bit.ly", "tinyurl.com", "shorturl.at", "is.gd", "t.co", "rb.gy"}
SUSPICIOUS_TLDS = {".top", ".xyz", ".buzz", ".icu", ".click", ".shop", ".loan", ".cam", ".win"}
BANK_WORDS = ("sbi", "hdfc", "icici", "axis", "bank", "kyc", "aadhaar", "pan", "rbi", "upi")

PHONE_RE = re.compile(r"(?<!\d)(?:\+91[\s-]?)?[6-9]\d{9}(?!\d)")
URL_RE = re.compile(r"(https?://[^\s]+|www\.[^\s]+)", re.IGNORECASE)
UPI_RE = re.compile(r"\b[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}\b")
AMOUNT_RE = re.compile(r"(?:₹\s?\d[\d,]*|\bRs\.?\s?\d[\d,]*|\bINR\s?\d[\d,]*)", re.IGNORECASE)
MERCHANT_RE = re.compile(r"\b(?:merchant|payee|receiver|beneficiary)[:\-]?\s*([A-Z][A-Za-z0-9 &.-]{2,})")
PERSON_RE = re.compile(r"\b(?:mr|mrs|ms|dr)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)")

URGENCY_RE = re.compile(r"\b(urgent|immediately|now|today|last chance|within\s+\d+\s*(?:minutes?|hours?)|abhi|turant|fauran|jaldi)\b", re.IGNORECASE)
MONEY_RE = re.compile(r"\b(pay|payment|transfer|send money|deposit|advance fee|processing fee|security deposit|upi|collect request|refund fee|scan and pay)\b", re.IGNORECASE)
RETURN_RE = re.compile(r"\b(guaranteed return|assured return|fixed return|double your money|daily profit|risk[- ]free profit)\b", re.IGNORECASE)
AUTHORITY_RE = re.compile(r"\b(bank|sbi|hdfc|icici|axis|rbi|uidai|aadhaar|pan|kyc|police|cbi|crime branch|customs|income tax|court|government|govt|sarkar)\b", re.IGNORECASE)
THREAT_RE = re.compile(r"\b(arrest|blocked|suspended|penalty|fine|legal action|case registered|jail|freeze)\b", re.IGNORECASE)
OFFPLATFORM_RE = re.compile(r"\b(telegram|whatsapp me|personal number|private number|call me on another number|move to another app)\b", re.IGNORECASE)
PARCEL_RE = re.compile(r"\b(parcel|courier|delivery|customs|shipment|reschedule|india post|bluedart|delhivery)\b", re.IGNORECASE)
JOB_RE = re.compile(r"\b(job|recruitment|work from home|part time|salary|hr team|interview)\b", re.IGNORECASE)
INVESTMENT_RE = re.compile(r"\b(invest|trading|crypto|forex|returns?|profit|stock tip|double your money)\b", re.IGNORECASE)
PAYMENT_SCREENSHOT_RE = re.compile(r"\b(paid|payment successful|payment complete|credited|debited|success|successful)\b", re.IGNORECASE)
TXN_RE = re.compile(r"\b(?:utr|txn|transaction|reference|ref no|order id|bank ref)\b", re.IGNORECASE)
WEIRD_TEXT_RE = re.compile(r"(?:[A-Z]{5,}|[!?]{3,}|₹\d+\s+FREE)")

_V0_ROOT = Path.home() / ".mirrordna" / "chetana" / "v0"
_V0_ROOT.mkdir(parents=True, exist_ok=True)
V0_EVENTS_LOG = _V0_ROOT / "events.jsonl"


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def generate_scan_id() -> str:
    return f"chetana-scan-{uuid4().hex[:12]}"


def generate_event_id() -> str:
    return f"chetana-event-{uuid4().hex[:12]}"


def _append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + "\n")


def build_event(payload: V0EventInput) -> V0Event:
    return V0Event(
        event_id=generate_event_id(),
        timestamp_utc=now_utc(),
        **payload.model_dump(),
    )


def log_event(payload: V0EventInput) -> V0Event:
    event = build_event(payload)
    _append_jsonl(V0_EVENTS_LOG, event.model_dump())
    return event


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        item = value.strip()
        if not item:
            continue
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(item)
    return ordered


def extract_entities(text: str) -> V0Entities:
    urls = _unique(URL_RE.findall(text))
    phone_numbers = _unique(PHONE_RE.findall(text))
    upi_ids = _unique(UPI_RE.findall(text))
    amounts = _unique(AMOUNT_RE.findall(text))
    merchant_names = _unique(match.group(1) for match in MERCHANT_RE.finditer(text))
    person_names = _unique(match.group(1) for match in PERSON_RE.finditer(text))
    return V0Entities(
        phone_numbers=phone_numbers[:5],
        urls=urls[:5],
        upi_ids=upi_ids[:5],
        amounts=amounts[:5],
        merchant_names=merchant_names[:5],
        person_names=person_names[:5],
    )


def _host_from_url(url: str) -> str:
    candidate = url if url.startswith(("http://", "https://")) else f"https://{url}"
    parsed = urlparse(candidate)
    return parsed.netloc.lower().strip()


def _looks_official(host: str) -> bool:
    return any(host.endswith(hint) or host == hint for hint in OFFICIAL_HOST_HINTS)


def _is_suspicious_host(host: str) -> bool:
    return any(host.endswith(tld) for tld in SUSPICIOUS_TLDS)


def _add_reason(
    reasons: dict[ReasonCode, V0Reason],
    scorebox: list[int],
    code: ReasonCode,
    explanation: str | None = None,
) -> None:
    if code in reasons:
        return
    meta = REASON_META[code]
    reasons[code] = V0Reason(
        code=code,
        label=str(meta["label"]),
        explanation=explanation or str(meta["explanation"]),
    )
    scorebox[0] += int(meta["weight"])


def _detect_scam_type(text: str, input_type: InputType) -> ScamType:
    scores: dict[ScamType, int] = defaultdict(int)
    if INVESTMENT_RE.search(text) or RETURN_RE.search(text):
        scores["investment_scam"] += 3
    if re.search(r"\b(kyc|aadhaar|pan|account update|re-kyc)\b", text, re.IGNORECASE):
        scores["fake_kyc"] += 3
    if input_type == "qr_image" or re.search(r"\b(qr|upi|collect request|upi id)\b", text, re.IGNORECASE):
        scores["upi_qr_scam"] += 3
    if input_type == "payment_screenshot" or re.search(r"\b(payment screenshot|utr|transaction successful|paid screenshot)\b", text, re.IGNORECASE):
        scores["fake_payment_proof"] += 3
    if PARCEL_RE.search(text):
        scores["parcel_customs_scam"] += 3
    if JOB_RE.search(text):
        scores["job_scam"] += 3
    if AUTHORITY_RE.search(text) or THREAT_RE.search(text):
        scores["impersonation_pressure_scam"] += 3
    if not scores:
        return "unknown_suspicious_pattern"
    return max(scores.items(), key=lambda item: item[1])[0]


def _low_signal_reason() -> V0Reason:
    return V0Reason(
        code="unverifiable_contact",
        label="Low signal from the material provided",
        explanation="Chetana did not get enough strong pressure, payment, impersonation, or link-risk markers to make a stronger call. If money or account access is involved, still verify through an official source.",
    )


def _build_summary(verdict: VerdictValue, scam_type: ScamType, actions: list[RecommendedAction]) -> str:
    labels = {
        "investment_scam": "investment pitch",
        "fake_kyc": "KYC or account update request",
        "upi_qr_scam": "UPI or QR request",
        "fake_payment_proof": "payment proof",
        "parcel_customs_scam": "parcel or customs message",
        "job_scam": "job offer",
        "impersonation_pressure_scam": "authority pressure message",
        "unknown_suspicious_pattern": "message",
    }
    surface = labels[scam_type]
    first_action = actions[0].replace("_", " ")
    if verdict == "high_risk":
        return f"This {surface} looks high risk. Do not act on it yet. Start with {first_action}."
    if verdict == "caution":
        return f"This {surface} shows multiple warning signs. Slow down and {first_action}."
    if verdict == "needs_review":
        return f"There are warning signs in this {surface}, but not enough proof for a confident call. Treat it as needing review and {first_action}."
    return f"Chetana has low signal on this {surface} from the material provided. If the stakes are high, still {first_action}."


def analyze_scan(payload: V0ScanInput) -> V0Verdict:
    text = _normalize_text(payload.text)
    reasons: dict[ReasonCode, V0Reason] = {}
    scorebox = [0]
    entities = extract_entities(text)

    if not text:
        _add_reason(
            reasons,
            scorebox,
            "unverifiable_contact",
            "There is not enough extracted text or payload here to make a confident call.",
        )
        verdict: VerdictValue = "needs_review"
        confidence: ConfidenceBand = "low"
        actions: list[RecommendedAction] = ["scan_again_with_more_context", "treat_as_unclear"]
        summary = _build_summary(verdict, "unknown_suspicious_pattern", actions)
        return V0Verdict(
            scan_id=generate_scan_id(),
            timestamp_utc=now_utc(),
            input_type=payload.input_type,
            language_hint=payload.language_hint,
            verdict=verdict,
            scam_type="unknown_suspicious_pattern",
            confidence_band=confidence,
            reasons=list(reasons.values())[:5],
            entities=entities,
            summary_plain_language=summary,
            recommended_actions=actions,
            share_shield_eligible=True,
            evidence_pack_eligible=True,
            notes="Need more context before a stronger verdict.",
        )

    if URGENCY_RE.search(text):
        _add_reason(reasons, scorebox, "urgency_pressure")
    if MONEY_RE.search(text):
        _add_reason(reasons, scorebox, "asks_for_money")
    if RETURN_RE.search(text):
        _add_reason(reasons, scorebox, "suspicious_return_claim")
    if AUTHORITY_RE.search(text):
        _add_reason(reasons, scorebox, "impersonates_authority")
    if THREAT_RE.search(text):
        _add_reason(reasons, scorebox, "threat_language")
    if OFFPLATFORM_RE.search(text):
        _add_reason(reasons, scorebox, "move_off_platform")
    if WEIRD_TEXT_RE.search(text):
        _add_reason(reasons, scorebox, "language_inconsistency")

    official_host_found = False
    suspicious_host_found = False
    for url in entities.urls:
        host = _host_from_url(url)
        if not host:
            continue
        if host in SHORTENER_HOSTS:
            _add_reason(reasons, scorebox, "hidden_or_shortened_link")
        if _looks_official(host):
            official_host_found = True
        else:
            _add_reason(reasons, scorebox, "unverifiable_contact")
        if _is_suspicious_host(host):
            suspicious_host_found = True
            _add_reason(reasons, scorebox, "suspicious_url")
        if any(word in text.lower() for word in BANK_WORDS) and not _looks_official(host):
            _add_reason(
                reasons,
                scorebox,
                "identity_mismatch",
                "The message claims an official identity, but the link does not look official.",
            )

    if payload.input_type == "qr_image":
        if entities.upi_ids or entities.urls:
            _add_reason(
                reasons,
                scorebox,
                "qr_payload_mismatch",
                "The QR payload points to a payment handle or destination you should verify before paying.",
            )
        elif "qr" in text.lower():
            _add_reason(
                reasons,
                scorebox,
                "qr_payload_mismatch",
                "The QR context is not clear enough to verify safely from the material provided.",
            )

    if payload.input_type == "payment_screenshot":
        if PAYMENT_SCREENSHOT_RE.search(text) and not TXN_RE.search(text):
            _add_reason(
                reasons,
                scorebox,
                "payment_screenshot_anomaly",
                "The payment proof talks about success but does not show a clear transaction reference.",
            )
        if re.search(r"\b(edit|cropped|forwarded|share screenshot)\b", text, re.IGNORECASE):
            _add_reason(reasons, scorebox, "payment_screenshot_anomaly")

    if entities.upi_ids and payload.input_type != "payment_screenshot":
        _add_reason(
            reasons,
            scorebox,
            "unverifiable_contact",
            "The request depends on a UPI handle that you should verify independently.",
        )

    if suspicious_host_found and ("impersonates_authority" in reasons or "asks_for_money" in reasons):
        scorebox[0] += 10
    if payload.input_type == "payment_screenshot" and "asks_for_money" in reasons:
        scorebox[0] += 8

    score = min(scorebox[0], 100)
    risky_combo = (
        ("impersonates_authority" in reasons and "asks_for_money" in reasons)
        or "payment_screenshot_anomaly" in reasons
        or "suspicious_return_claim" in reasons
        or ("qr_payload_mismatch" in reasons and "asks_for_money" in reasons)
    )

    if risky_combo or score >= 60:
        verdict = "high_risk"
    elif score >= 35:
        verdict = "caution"
    elif score >= 15 or reasons:
        verdict = "needs_review"
    else:
        verdict = "low_signal"

    if verdict == "low_signal" and not reasons:
        reasons["unverifiable_contact"] = _low_signal_reason()

    if verdict == "high_risk":
        confidence = "high" if score >= 75 or len(reasons) >= 3 else "medium"
    elif verdict == "caution":
        confidence = "medium" if score >= 45 or len(reasons) >= 3 else "low"
    elif verdict == "needs_review":
        confidence = "medium" if score >= 35 or len(reasons) >= 2 else "low"
    else:
        confidence = "low"

    actions: list[RecommendedAction] = []
    if verdict == "high_risk":
        actions.extend(["do_not_pay", "verify_with_official_source"])
        if payload.input_type != "text":
            actions.append("save_evidence")
        if "asks_for_money" in reasons or "impersonates_authority" in reasons or payload.input_type == "payment_screenshot":
            actions.append("report_and_block")
        elif "move_off_platform" in reasons:
            actions.append("share_with_family")
    elif verdict == "caution":
        actions.extend(["verify_with_official_source", "scan_again_with_more_context"])
        if payload.input_type != "text":
            actions.append("save_evidence")
        if "asks_for_money" in reasons or "impersonates_authority" in reasons:
            actions.append("share_with_family")
    elif verdict == "needs_review":
        actions.extend(["scan_again_with_more_context", "verify_with_official_source", "treat_as_unclear"])
        if payload.input_type != "text":
            actions.append("save_evidence")
    else:
        actions.append("verify_with_official_source")

    deduped_actions: list[RecommendedAction] = []
    for action in actions:
        if action not in deduped_actions:
            deduped_actions.append(action)

    scam_type = _detect_scam_type(text, payload.input_type)
    summary = _build_summary(verdict, scam_type, deduped_actions)
    notes: str | None = None
    if verdict == "needs_review":
        notes = "Needs review means pause and verify with more context or an official source before you act."
    elif verdict == "caution":
        notes = "Caution means Chetana found multiple warning signs, even if it cannot confirm the full story from the current material."
    elif verdict == "high_risk":
        notes = "Use an official app, website, or helpline you already trust before you do anything."
    elif verdict == "low_signal":
        notes = "Low signal does not mean safe. It means the current material did not provide enough strong evidence for a stronger call."

    return V0Verdict(
        scan_id=generate_scan_id(),
        timestamp_utc=now_utc(),
        input_type=payload.input_type,
        language_hint=payload.language_hint,
        verdict=verdict,
        scam_type=scam_type,
        confidence_band=confidence,
        reasons=list(reasons.values())[:5],
        entities=entities,
        summary_plain_language=summary,
        recommended_actions=deduped_actions[:4],
        share_shield_eligible=verdict in {"high_risk", "caution", "needs_review"},
        evidence_pack_eligible=verdict in {"high_risk", "caution", "needs_review"},
        notes=notes,
    )


def build_evidence_pack(payload: V0EvidenceRequest) -> V0EvidencePack:
    text = _normalize_text(payload.input_text)
    input_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
    verdict = payload.verdict
    scan_summary = verdict.summary_plain_language or "Chetana scan summary unavailable."
    exportable_summary = "\n".join(
        [
            f"Chetana result: {verdict.verdict.upper()}",
            f"Scam type: {verdict.scam_type.replace('_', ' ')}",
            f"Confidence: {verdict.confidence_band}",
            f"Summary: {scan_summary}",
            "Reasons:",
            *[f"- {reason.label}: {reason.explanation}" for reason in verdict.reasons],
            "Recommended actions:",
            *[f"- {action.replace('_', ' ')}" for action in verdict.recommended_actions],
        ]
    )
    return V0EvidencePack(
        incident_id=verdict.scan_id,
        timestamp_utc=now_utc(),
        input_hash=input_hash,
        input_type=verdict.input_type,
        extracted_entities=verdict.entities or V0Entities(),
        verdict=verdict.verdict,
        reasons=verdict.reasons,
        confidence_band=verdict.confidence_band,
        scan_summary=scan_summary,
        share_card_id=payload.share_card_id,
        exportable_text_summary=exportable_summary,
        thumbnail_reference=payload.thumbnail_reference,
        user_notes=payload.user_notes,
    )


SendGuardDecision = Literal["ALLOW", "CONFIRM", "COOLDOWN", "HARD_STOP"]
MerchantReleaseDecision = Literal["VERIFIED", "PENDING", "DO_NOT_RELEASE", "EXPIRED"]
RecoveryIncidentType = Literal[
    "AUTHORIZED_PUSH_PAYMENT_FRAUD",
    "WRONG_RECIPIENT_TRANSFER",
    "MERCHANT_PAYMENT_DISPUTE",
    "IMPERSONATION_ATTEMPT_BLOCKED",
    "PAYMENT_DISPUTE",
]
RecoveryRailId = Literal["BANK_APP_SUPPORT", "CYBER_HELPLINE_1930", "NCRP_PORTAL", "RBI_CMS"]


class V0OfficialRail(StrictModel):
    rail_id: RecoveryRailId
    name: str
    channel: str
    contact: str | None = None
    official_url: str
    verified_on: str
    use_when: list[str] = Field(default_factory=list)


class V0CasePacket(StrictModel):
    amount_inr: int | None = None
    transaction_reference: str | None = None
    phone_numbers: list[str] = Field(default_factory=list)
    urls: list[str] = Field(default_factory=list)
    upi_ids: list[str] = Field(default_factory=list)
    merchant_names: list[str] = Field(default_factory=list)
    summary: str


class V0RecoveryPacket(StrictModel):
    packet_id: str
    generated_at_utc: str
    incident_type: RecoveryIncidentType
    summary: str
    immediate_actions: list[str] = Field(min_length=1)
    official_rails: list[V0OfficialRail] = Field(min_length=1)
    escalation_order: list[str] = Field(min_length=1)
    handoff_script: str
    case_packet: V0CasePacket


class V0SendGuardAssessment(StrictModel):
    assessment_id: str
    assessed_at_utc: str
    decision: SendGuardDecision
    risk_score: int = Field(ge=0, le=100)
    manipulation_signals: list[str] = Field(default_factory=list)
    decision_reasons: list[str] = Field(default_factory=list)
    interventions: list[str] = Field(default_factory=list)
    recommended_actions: list[str] = Field(default_factory=list)
    recovery_packet: V0RecoveryPacket | None = None


class V0MerchantReleaseAssessment(StrictModel):
    session_id: str
    assessed_at_utc: str
    merchant_label: str | None = None
    amount_inr: int | None = None
    decision: MerchantReleaseDecision
    proof_score: int = Field(ge=0, le=100)
    risk_score: int = Field(ge=0, le=100)
    hold_until_utc: str | None = None
    decision_reasons: list[str] = Field(default_factory=list)
    recommended_actions: list[str] = Field(default_factory=list)
    recovery_packet: V0RecoveryPacket | None = None


class V0TrustRuntimeRequest(StrictModel):
    verdict: V0Verdict
    input_text: str = Field(default="", max_length=20000)
    source_name: str | None = None
    money_moved: bool = False
    goods_released: bool = False


class V0TrustBundle(StrictModel):
    send_guard: V0SendGuardAssessment
    merchant_release: V0MerchantReleaseAssessment | None = None
    recovery_packet: V0RecoveryPacket | None = None


_TX_REFERENCE_RE = re.compile(
    r"\b(?:utr|txn|transaction|reference|ref(?:erence)?(?:\s*(?:no|id))?)[:#\s-]*([A-Z0-9-]{6,})\b",
    re.IGNORECASE,
)
_TRUST_RUNTIME_VERIFIED_ON = "2026-04-12"
_OFFICIAL_RAILS: dict[RecoveryRailId, V0OfficialRail] = {
    "BANK_APP_SUPPORT": V0OfficialRail(
        rail_id="BANK_APP_SUPPORT",
        name="Bank app / PSP / bank complaint flow",
        channel="in_app_or_bank_support",
        official_url="https://www.npci.org.in/what-we-do/upi/dispute-redressal-mechanism/",
        verified_on=_TRUST_RUNTIME_VERIFIED_ON,
        use_when=[
            "UPI disputes or wrong-recipient transfers",
            "merchant-side payment confirmation issues",
            "first complaint to the app, PSP, or bank that processed the payment",
        ],
    ),
    "CYBER_HELPLINE_1930": V0OfficialRail(
        rail_id="CYBER_HELPLINE_1930",
        name="National Cybercrime Helpline",
        channel="phone",
        contact="1930",
        official_url="https://i4c.mha.gov.in/ncrp.aspx",
        verified_on=_TRUST_RUNTIME_VERIFIED_ON,
        use_when=[
            "suspected digital payment fraud",
            "active scam attempts or money already moved",
            "urgent freeze / trace escalation",
        ],
    ),
    "NCRP_PORTAL": V0OfficialRail(
        rail_id="NCRP_PORTAL",
        name="National Cybercrime Reporting Portal",
        channel="web",
        contact="https://cybercrime.gov.in",
        official_url="https://cybercrime.gov.in",
        verified_on=_TRUST_RUNTIME_VERIFIED_ON,
        use_when=[
            "formal cyber fraud complaint",
            "online reporting and status tracking",
        ],
    ),
    "RBI_CMS": V0OfficialRail(
        rail_id="RBI_CMS",
        name="RBI Complaint Management System",
        channel="web",
        contact="https://cms.rbi.org.in",
        official_url="https://rbi.org.in/commonman/english/Scripts/FAQs.aspx?Id=3580",
        verified_on=_TRUST_RUNTIME_VERIFIED_ON,
        use_when=[
            "bank or PSP complaint remained unresolved",
            "regulated-entity escalation after the bank path is exhausted",
        ],
    ),
}


def _first_amount_inr(entities: V0Entities | None) -> int | None:
    if not entities:
        return None
    for raw in entities.amounts:
        digits = re.sub(r"[^\d]", "", raw)
        if digits:
            return int(digits)
    return None


def _transaction_reference(text: str) -> str | None:
    match = _TX_REFERENCE_RE.search(text)
    if not match:
        return None
    return match.group(1).upper()


def _reason_codes(verdict: V0Verdict) -> set[ReasonCode]:
    return {reason.code for reason in verdict.reasons}


def _verdict_base_risk(verdict: VerdictValue) -> int:
    if verdict == "high_risk":
        return 82
    if verdict == "caution":
        return 58
    if verdict == "needs_review":
        return 36
    return 14


def _build_case_packet(
    verdict: V0Verdict,
    text: str,
    summary: str,
) -> V0CasePacket:
    entities = verdict.entities or V0Entities()
    return V0CasePacket(
        amount_inr=_first_amount_inr(entities),
        transaction_reference=_transaction_reference(text),
        phone_numbers=entities.phone_numbers,
        urls=entities.urls,
        upi_ids=entities.upi_ids,
        merchant_names=entities.merchant_names,
        summary=summary,
    )


def _incident_type_for_request(payload: V0TrustRuntimeRequest) -> RecoveryIncidentType:
    verdict = payload.verdict
    codes = _reason_codes(verdict)
    if payload.goods_released or verdict.input_type == "payment_screenshot":
        return "MERCHANT_PAYMENT_DISPUTE"
    if payload.money_moved and (
        "asks_for_money" in codes
        or "impersonates_authority" in codes
        or "payment_screenshot_anomaly" in codes
        or verdict.scam_type in {"upi_qr_scam", "fake_payment_proof", "fake_kyc"}
    ):
        return "AUTHORIZED_PUSH_PAYMENT_FRAUD"
    if "impersonates_authority" in codes or "threat_language" in codes:
        return "IMPERSONATION_ATTEMPT_BLOCKED"
    if verdict.scam_type in {"upi_qr_scam", "fake_payment_proof"} or (verdict.entities and verdict.entities.upi_ids):
        return "PAYMENT_DISPUTE"
    return "WRONG_RECIPIENT_TRANSFER" if payload.money_moved else "IMPERSONATION_ATTEMPT_BLOCKED"


def _rails_for_incident(incident_type: RecoveryIncidentType) -> list[V0OfficialRail]:
    if incident_type == "AUTHORIZED_PUSH_PAYMENT_FRAUD":
        order = ["CYBER_HELPLINE_1930", "NCRP_PORTAL", "BANK_APP_SUPPORT", "RBI_CMS"]
    elif incident_type == "IMPERSONATION_ATTEMPT_BLOCKED":
        order = ["CYBER_HELPLINE_1930", "NCRP_PORTAL"]
    else:
        order = ["BANK_APP_SUPPORT", "NCRP_PORTAL", "RBI_CMS"]
    return [_OFFICIAL_RAILS[rail_id] for rail_id in order]


def _immediate_actions(
    incident_type: RecoveryIncidentType,
    *,
    money_moved: bool,
    goods_released: bool,
) -> list[str]:
    if incident_type == "AUTHORIZED_PUSH_PAYMENT_FRAUD":
        return [
            "End the live call or chat with the other party immediately.",
            "Do not share OTP, UPI PIN, card PIN, password, or screen-share access.",
            "Call 1930 and contact the bank or payment app that processed the transfer right away.",
            "Preserve screenshots, timestamps, transaction references, and beneficiary details.",
        ]
    if incident_type == "MERCHANT_PAYMENT_DISPUTE":
        return [
            "Do not release goods on a screenshot alone." if not goods_released else "Goods already moved. Preserve every proof item now.",
            "Ask for the UTR / transaction reference and verify it in the real bank or PSP dashboard.",
            "Record the merchant-side ledger view, amount, timestamp, and customer identifier.",
            "If deception is suspected, also report through 1930 and cybercrime.gov.in.",
        ]
    if incident_type == "PAYMENT_DISPUTE":
        return [
            "Stop any additional payment attempts to the same recipient.",
            "Capture the UTR / transaction reference, amount, and beneficiary details.",
            "Use the sender app or bank complaint flow first.",
            "If fraud is suspected or the caller is still active, also use 1930 and cybercrime.gov.in.",
        ]
    if incident_type == "WRONG_RECIPIENT_TRANSFER":
        return [
            "Stop any additional transfers to the same beneficiary.",
            "Raise a complaint in the sender app or bank flow immediately.",
            "Preserve the amount, timestamp, UTR, and beneficiary details.",
            "Escalate to RBI CMS only if the bank / PSP response remains unsatisfactory.",
        ]
    return [
        "Cut the active call or chat and verify the claim outside the live channel.",
        "Do not click links or share any codes, PINs, or documents.",
        "Keep the message, screenshot, phone number, and link trail.",
        "If any money or credentials were exposed, escalate through 1930 and cybercrime.gov.in.",
    ]


def _handoff_script(
    incident_type: RecoveryIncidentType,
    verdict: V0Verdict,
    text: str,
) -> str:
    case_packet = _build_case_packet(verdict, text, verdict.summary_plain_language or "Chetana trust-runtime packet.")
    parts = [f"I need help with {incident_type.replace('_', ' ').lower()}."]
    if case_packet.amount_inr is not None:
        parts.append(f"The amount involved is INR {case_packet.amount_inr}.")
    if case_packet.transaction_reference:
        parts.append(f"The transaction reference is {case_packet.transaction_reference}.")
    if case_packet.upi_ids:
        parts.append(f"The UPI ID involved is {case_packet.upi_ids[0]}.")
    parts.append("I have screenshots or message evidence ready.")
    return " ".join(parts)


def build_recovery_packet(payload: V0TrustRuntimeRequest) -> V0RecoveryPacket:
    text = _normalize_text(payload.input_text)
    verdict = payload.verdict
    incident_type = _incident_type_for_request(payload)
    summary = verdict.summary_plain_language or "Chetana trust-runtime packet."
    rails = _rails_for_incident(incident_type)
    if incident_type in {"MERCHANT_PAYMENT_DISPUTE", "PAYMENT_DISPUTE"} and verdict.verdict == "high_risk":
        rails = [_OFFICIAL_RAILS["CYBER_HELPLINE_1930"], _OFFICIAL_RAILS["NCRP_PORTAL"], *rails]
        deduped: list[V0OfficialRail] = []
        seen: set[RecoveryRailId] = set()
        for rail in rails:
            if rail.rail_id in seen:
                continue
            seen.add(rail.rail_id)
            deduped.append(rail)
        rails = deduped
    return V0RecoveryPacket(
        packet_id=f"chetana-recovery-{uuid4().hex[:12]}",
        generated_at_utc=now_utc(),
        incident_type=incident_type,
        summary=summary,
        immediate_actions=_immediate_actions(
            incident_type,
            money_moved=payload.money_moved,
            goods_released=payload.goods_released,
        ),
        official_rails=rails,
        escalation_order=[rail.name for rail in rails],
        handoff_script=_handoff_script(incident_type, verdict, text),
        case_packet=_build_case_packet(verdict, text, summary),
    )


def assess_send_guard(payload: V0TrustRuntimeRequest) -> V0SendGuardAssessment:
    verdict = payload.verdict
    codes = _reason_codes(verdict)
    risk_score = _verdict_base_risk(verdict.verdict)
    manipulation_signals: list[str] = []
    decision_reasons: list[str] = []
    interventions: list[str] = []

    if "urgency_pressure" in codes:
        risk_score += 8
        manipulation_signals.append("Urgency pressure")
    if "impersonates_authority" in codes:
        risk_score += 10
        manipulation_signals.append("Authority impersonation")
        interventions.append("CUT_CALL_NOW")
    if "threat_language" in codes:
        risk_score += 8
        manipulation_signals.append("Threat or penalty language")
        interventions.append("CUT_CALL_NOW")
    if "move_off_platform" in codes:
        risk_score += 6
        manipulation_signals.append("Off-channel pressure")
        interventions.append("VERIFY_OUTSIDE_ACTIVE_CHANNEL")
    if "asks_for_money" in codes or verdict.input_type in {"payment_screenshot", "qr_image"}:
        risk_score += 12
    if "payment_screenshot_anomaly" in codes:
        risk_score += 14

    risk_score = max(0, min(risk_score, 100))

    if payload.money_moved or (risk_score >= 76 and ("asks_for_money" in codes or "payment_screenshot_anomaly" in codes)):
        decision: SendGuardDecision = "HARD_STOP"
    elif risk_score >= 56:
        decision = "COOLDOWN"
    elif risk_score >= 30:
        decision = "CONFIRM"
    else:
        decision = "ALLOW"

    if decision in {"COOLDOWN", "HARD_STOP"}:
        interventions.append("VERIFY_WITH_TRUSTED_PERSON")
    if decision == "HARD_STOP":
        decision_reasons.append("The risk score is high enough that the safest move is to stop before money or access changes hands.")
    elif decision == "COOLDOWN":
        decision_reasons.append("Multiple warning signs are present, so slow the interaction down and verify outside the active channel.")
    elif decision == "CONFIRM":
        decision_reasons.append("The current material is not strong enough to clear the request. Confirm through an official source first.")
    else:
        decision_reasons.append("Chetana has low signal from the current material, but official verification is still safer than assumption.")

    if verdict.recommended_actions:
        decision_reasons.append(f"Top safe action: {verdict.recommended_actions[0].replace('_', ' ')}.")

    deduped_interventions: list[str] = []
    for item in interventions:
        if item not in deduped_interventions:
            deduped_interventions.append(item)

    recovery_packet = build_recovery_packet(payload) if decision == "HARD_STOP" or payload.money_moved else None
    return V0SendGuardAssessment(
        assessment_id=f"chetana-send-{uuid4().hex[:12]}",
        assessed_at_utc=now_utc(),
        decision=decision,
        risk_score=risk_score,
        manipulation_signals=manipulation_signals,
        decision_reasons=decision_reasons,
        interventions=deduped_interventions,
        recommended_actions=[action.replace("_", " ") for action in verdict.recommended_actions],
        recovery_packet=recovery_packet,
    )


def build_merchant_release_assessment(
    payload: V0TrustRuntimeRequest,
    send_guard: V0SendGuardAssessment | None = None,
) -> V0MerchantReleaseAssessment | None:
    verdict = payload.verdict
    if verdict.input_type != "payment_screenshot" and verdict.scam_type not in {"fake_payment_proof", "upi_qr_scam"}:
        return None

    text = _normalize_text(payload.input_text)
    entities = verdict.entities or V0Entities()
    amount_inr = _first_amount_inr(entities)
    risk_score = send_guard.risk_score if send_guard else _verdict_base_risk(verdict.verdict)
    proof_score = 0
    decision_reasons: list[str] = []

    if _transaction_reference(text):
        proof_score += 35
        decision_reasons.append("A transaction reference is present.")
    else:
        decision_reasons.append("No clear UTR or transaction reference was found.")
    if amount_inr is not None:
        proof_score += 15
    if entities.upi_ids:
        proof_score += 10
    if entities.merchant_names:
        proof_score += 10
    if any(_looks_official(_host_from_url(url)) for url in entities.urls):
        proof_score += 15
    if "payment_screenshot_anomaly" in _reason_codes(verdict):
        proof_score -= 35
        decision_reasons.append("The screenshot looks incomplete or inconsistent.")
    if verdict.verdict == "high_risk":
        proof_score -= 20
    proof_score = max(0, min(proof_score, 100))

    hold_until_utc: str | None = None
    if payload.goods_released:
        decision: MerchantReleaseDecision = "EXPIRED"
        decision_reasons.append("The release window has already passed because the goods were released.")
    elif "payment_screenshot_anomaly" in _reason_codes(verdict) or verdict.verdict == "high_risk":
        decision = "DO_NOT_RELEASE"
        decision_reasons.append("Screenshot-only proof is not strong enough to release goods.")
    elif proof_score >= 70 and risk_score < 45:
        decision = "VERIFIED"
        decision_reasons.append("The payment proof has enough supporting detail to verify before release.")
    else:
        decision = "PENDING"
        hold_until_utc = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
        decision_reasons.append("Wait for a real bank / PSP confirmation before releasing goods.")

    recommended_actions: list[str]
    if decision == "DO_NOT_RELEASE":
        recommended_actions = [
            "Do not release goods on a customer-controlled screenshot alone.",
            "Ask for the UTR or transaction reference and check the real ledger.",
            "If pressure continues, escalate through 1930 and the bank / PSP rail.",
        ]
    elif decision == "PENDING":
        recommended_actions = [
            "Hold release for up to 15 minutes while you verify in the real app or bank view.",
            "Check the transaction reference and merchant ledger together.",
        ]
    elif decision == "VERIFIED":
        recommended_actions = [
            "Match the amount, merchant name, and transaction reference before release.",
            "Keep a screenshot of the verified ledger for your records.",
        ]
    else:
        recommended_actions = [
            "Goods already moved. Preserve the full proof chain and use the dispute rails next.",
        ]

    recovery_packet = build_recovery_packet(payload) if decision in {"DO_NOT_RELEASE", "EXPIRED"} else None
    merchant_label = entities.merchant_names[0] if entities.merchant_names else payload.source_name
    return V0MerchantReleaseAssessment(
        session_id=f"chetana-sale-{uuid4().hex[:12]}",
        assessed_at_utc=now_utc(),
        merchant_label=merchant_label,
        amount_inr=amount_inr,
        decision=decision,
        proof_score=proof_score,
        risk_score=risk_score,
        hold_until_utc=hold_until_utc,
        decision_reasons=decision_reasons,
        recommended_actions=recommended_actions,
        recovery_packet=recovery_packet,
    )


def build_trust_bundle(payload: V0TrustRuntimeRequest) -> V0TrustBundle:
    send_guard = assess_send_guard(payload)
    merchant_release = build_merchant_release_assessment(payload, send_guard=send_guard)
    recovery_packet = send_guard.recovery_packet or (merchant_release.recovery_packet if merchant_release else None)
    if recovery_packet is None and payload.verdict.verdict in {"high_risk", "caution"}:
        recovery_packet = build_recovery_packet(payload)
    return V0TrustBundle(
        send_guard=send_guard,
        merchant_release=merchant_release,
        recovery_packet=recovery_packet,
    )
