from __future__ import annotations

import hashlib
import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

InputType = Literal["screenshot", "text", "qr_image", "payment_screenshot", "mixed"]
VerdictValue = Literal["safe", "risky", "unclear"]
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
    "verdict_safe",
    "verdict_risky",
    "verdict_unclear",
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


def _safe_reason() -> V0Reason:
    return V0Reason(
        code="unverifiable_contact",
        label="No clear scam signal found",
        explanation="Chetana did not find strong pressure, payment, impersonation, or link-risk markers in the material you shared. If money or account access is involved, still verify through an official source.",
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
    if verdict == "risky":
        return f"This {surface} looks risky. Do not act on it yet. Start with {first_action}."
    if verdict == "unclear":
        return f"There are warning signs in this {surface}, but not enough proof for a confident call. Treat it as unclear and {first_action}."
    return f"Chetana did not find a strong scam signal in this {surface}. If the stakes are high, still {first_action}."


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
        verdict: VerdictValue = "unclear"
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
        verdict = "risky"
    elif score >= 20 or reasons:
        verdict = "unclear"
    else:
        verdict = "safe"

    if verdict == "safe" and not reasons:
        reasons["unverifiable_contact"] = _safe_reason()

    if verdict == "risky":
        confidence = "high" if score >= 75 or len(reasons) >= 3 else "medium"
    elif verdict == "unclear":
        confidence = "medium" if score >= 35 or len(reasons) >= 2 else "low"
    else:
        confidence = "medium" if official_host_found else "low"

    actions: list[RecommendedAction] = []
    if verdict == "risky":
        actions.extend(["do_not_pay", "verify_with_official_source"])
        if payload.input_type != "text":
            actions.append("save_evidence")
        if "asks_for_money" in reasons or "impersonates_authority" in reasons or payload.input_type == "payment_screenshot":
            actions.append("report_and_block")
        elif "move_off_platform" in reasons:
            actions.append("share_with_family")
    elif verdict == "unclear":
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
    if verdict == "unclear":
        notes = "Chetana defaults to unclear when the evidence is thin."
    elif verdict == "risky":
        notes = "Use an official app, website, or helpline you already trust before you do anything."

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
        share_shield_eligible=verdict in {"risky", "unclear"},
        evidence_pack_eligible=verdict in {"risky", "unclear"},
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
