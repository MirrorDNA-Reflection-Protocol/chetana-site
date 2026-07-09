from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


KavachIndicatorKind = Literal["upi", "phone", "merchant_payment_proof"]
KavachRiskLevel = Literal["high", "medium", "low", "invalid"]
KavachSource = Literal["chetana_local_kavach_seed"]


class V0KavachIndicator(_StrictModel):
    kind: KavachIndicatorKind
    value: str
    normalized: str
    risk_level: KavachRiskLevel
    score: int = Field(ge=0, le=100)
    matched: bool = False
    match_type: str | None = None
    signals: list[str] = Field(default_factory=list, max_length=8)
    advice: list[str] = Field(default_factory=list, max_length=4)
    provider: dict[str, str | bool] | None = None
    reports: int = 0


class V0KavachEnrichment(_StrictModel):
    source: KavachSource = "chetana_local_kavach_seed"
    checked_at_utc: str
    risk_level: KavachRiskLevel
    max_score: int = Field(ge=0, le=100)
    indicators: list[V0KavachIndicator] = Field(default_factory=list, max_length=10)
    summary: str
    no_match_is_safe: bool = False


_DATA_PATH = Path(__file__).parent / "gamechanger" / "data" / "kavach_local_seed.json"

_UPI_PROVIDERS = {
    "oksbi": "SBI / Google Pay",
    "sbi": "SBI (State Bank of India)",
    "okaxis": "Axis Bank",
    "axl": "Axis Bank",
    "axis": "Axis Bank",
    "okhdfcbank": "HDFC Bank",
    "hdfcbank": "HDFC Bank",
    "okicici": "ICICI Bank",
    "icici": "ICICI Bank",
    "boi": "Bank of India",
    "pnb": "Punjab National Bank",
    "cnrb": "Canara Bank",
    "ubin": "Union Bank of India",
    "iob": "Indian Overseas Bank",
    "idbi": "IDBI Bank",
    "kotak": "Kotak Mahindra Bank",
    "indus": "IndusInd Bank",
    "rbl": "RBL Bank",
    "federal": "Federal Bank",
    "yesbank": "Yes Bank",
    "bob": "Bank of Baroda",
    "paytm": "Paytm",
    "ybl": "PhonePe",
    "ibl": "PhonePe (ICICI)",
    "apl": "Amazon Pay",
    "yapl": "Amazon Pay",
    "gpay": "Google Pay",
    "waicici": "WhatsApp Pay (ICICI)",
    "wahdfcbank": "WhatsApp Pay (HDFC)",
    "waaxis": "WhatsApp Pay (Axis)",
    "wasbi": "WhatsApp Pay (SBI)",
    "freecharge": "Freecharge",
    "postbank": "India Post Payments Bank",
    "airtel": "Airtel Payments Bank",
    "jio": "Jio Payments Bank",
}

_UPI_FORMAT_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9.\-_]{0,48}@[a-zA-Z]{2,}$")
_UPI_IN_TEXT_RE = re.compile(r"\b[a-zA-Z0-9][a-zA-Z0-9.\-_]{0,48}@[a-zA-Z]{2,}\b")
_PHONE_IN_TEXT_RE = re.compile(r"(?:\+91[- ]?)?([6-9]\d{9})\b")
_AMOUNT_RE = re.compile(r"(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.\d{1,2})?)", re.IGNORECASE)
_TX_REF_RE = re.compile(
    r"\b(?:utr|rrn|ref(?:erence)?|txn|transaction)\s*[:#-]?\s*([A-Za-z0-9]{6,24})\b",
    re.IGNORECASE,
)

_FRAUD_NAME_PATTERNS = {
    "refund",
    "kyc",
    "update",
    "verify",
    "winner",
    "lottery",
    "prize",
    "customs",
    "clearance",
    "rbi",
    "income.tax",
    "sbi",
    "police",
    "cbi",
    "free",
    "offer",
    "lucky",
    "army",
    "canteen",
    "electricity",
    "bill.pay",
    "job.offer",
    "hr.dept",
    "loan.approve",
    "emi.refund",
    "cashback",
    "govt",
    "pmkisan",
    "subsidy",
}
_IMPERSONATION_WORDS = {"sbi", "rbi", "hdfc", "icici", "axis", "pnb", "govt", "police", "customs"}
_MERCHANT_HIGH_RISK_TERMS = (
    "pending",
    "processing",
    "initiated",
    "queued",
    "will reflect",
    "screenshot",
    "proof",
    "collect request",
    "approve request",
    "request money",
    "mandate",
    "tap approve",
)
_MERCHANT_PRESSURE_TERMS = (
    "handover now",
    "dispatch now",
    "release order",
    "driver waiting",
    "urgent delivery",
    "send item now",
)


@lru_cache(maxsize=1)
def _load_seed() -> dict[str, Any]:
    try:
        return json.loads(_DATA_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"upi": {"patterns": [], "suspicious_keywords": [], "flagged": {}}, "phones": {"patterns": [], "flagged": {}}}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _risk_from_score(score: int) -> KavachRiskLevel:
    if score >= 70:
        return "high"
    if score >= 35:
        return "medium"
    return "low"


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        item = str(value).strip()
        key = item.lower()
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def _clean_phone(phone: str) -> str:
    cleaned = re.sub(r"[\s\-+()]", "", phone.strip())
    if cleaned.startswith("91") and len(cleaned) == 12:
        cleaned = cleaned[2:]
    if cleaned.startswith("0") and len(cleaned) == 11:
        cleaned = cleaned[1:]
    return cleaned


def _provider_for_upi(upi_id: str) -> dict[str, str | bool]:
    if "@" not in upi_id:
        return {"handle": "", "provider": "Unknown", "known": False}
    handle = upi_id.split("@", 1)[1]
    provider = _UPI_PROVIDERS.get(handle)
    return {"handle": handle, "provider": provider or f"Unknown ({handle})", "known": provider is not None}


def _check_upi(upi_id: str, seed: dict[str, Any]) -> V0KavachIndicator:
    normalized = upi_id.strip().lower()
    signals: list[str] = []
    score = 0
    matched = False
    match_type: str | None = None
    reports = 0
    provider = _provider_for_upi(normalized)

    if not _UPI_FORMAT_RE.match(normalized):
        return V0KavachIndicator(
            kind="upi",
            value=upi_id,
            normalized=normalized,
            risk_level="invalid",
            score=0,
            signals=["Invalid UPI ID format."],
            advice=["Do not use this as a verified UPI handle."],
            provider=provider,
        )

    upi_seed = seed.get("upi", {})
    flagged = upi_seed.get("flagged", {})
    if normalized in flagged:
        entry = flagged[normalized]
        matched = True
        match_type = str(entry.get("type", "reported_upi"))
        reports = int(entry.get("reports", 1) or 1)
        signals.append(f"Known reported UPI pattern: {match_type.replace('_', ' ')}.")
        score += 80

    for pattern in upi_seed.get("patterns", []):
        marker = str(pattern.get("contains", "")).lower()
        if marker and marker in normalized:
            matched = True
            match_type = match_type or "pattern_match"
            signals.append(str(pattern.get("note", f"Matched UPI pattern: {marker}.")))
            score += 20
            break

    username = normalized.split("@", 1)[0]
    seed_keywords = {str(item).lower() for item in upi_seed.get("suspicious_keywords", [])}
    matched_words = sorted(word for word in (_FRAUD_NAME_PATTERNS | seed_keywords) if word and word in username)
    if matched_words:
        matched = True
        match_type = match_type or "suspicious_username"
        signals.append(f"Suspicious words in UPI name: {', '.join(matched_words[:4])}.")
        score += min(len(matched_words) * 15, 40)

    impersonated = sorted(word for word in _IMPERSONATION_WORDS if word in username)
    if impersonated:
        matched = True
        match_type = match_type or "impersonation_pattern"
        signals.append(f"Possible authority or bank impersonation in UPI name: {', '.join(impersonated[:4])}.")
        score += 20

    if any(char.isdigit() for char in username) and len(username) > 15:
        signals.append("Long UPI username with numbers may be auto-generated.")
        score += 10

    if not bool(provider["known"]):
        signals.append(f"Unknown UPI provider handle: @{provider['handle']}.")
        score += 5

    score = min(score, 100)
    risk_level = _risk_from_score(score)
    if risk_level == "high":
        advice = [
            "Do not send money to this UPI ID.",
            "Verify through the official bank or payment app.",
            "If money already moved, call 1930 and contact the bank or PSP.",
        ]
    elif risk_level == "medium":
        advice = [
            "Pause before paying this UPI ID.",
            "Verify the recipient through a trusted route outside this chat.",
        ]
    else:
        advice = [
            "No known local match was found, but this does not prove the UPI ID is safe.",
            "Verify the recipient before paying.",
        ]

    return V0KavachIndicator(
        kind="upi",
        value=upi_id,
        normalized=normalized,
        risk_level=risk_level,
        score=score,
        matched=matched,
        match_type=match_type,
        signals=signals[:8],
        advice=advice,
        provider=provider,
        reports=reports,
    )


def _check_phone(phone: str, seed: dict[str, Any]) -> V0KavachIndicator:
    normalized = _clean_phone(phone)
    signals: list[str] = []
    score = 0
    matched = False
    match_type: str | None = None
    reports = 0

    if not re.match(r"^[6-9]\d{9}$", normalized):
        return V0KavachIndicator(
            kind="phone",
            value=phone,
            normalized=normalized,
            risk_level="invalid",
            score=0,
            signals=["Invalid Indian mobile number format."],
            advice=["Use a valid 10-digit Indian mobile number for lookup."],
        )

    phone_seed = seed.get("phones", {})
    flagged = phone_seed.get("flagged", {})
    if normalized in flagged:
        entry = flagged[normalized]
        matched = True
        match_type = str(entry.get("type", "reported_phone"))
        reports = int(entry.get("reports", 1) or 1)
        signals.append(f"Known reported phone pattern: {match_type.replace('_', ' ')}.")
        score += 80

    for pattern in phone_seed.get("patterns", []):
        prefix = str(pattern.get("prefix", ""))
        if prefix and normalized.startswith(prefix):
            matched = True
            match_type = match_type or str(pattern.get("type", "prefix_pattern"))
            signals.append(str(pattern.get("note", f"Matched phone prefix: {prefix}.")))
            score += 20
            break

    score = min(score, 100)
    risk_level = _risk_from_score(score)
    if risk_level == "high":
        advice = [
            "Do not call back or share information with this number.",
            "Report suspected fraud communication on Chakshu.",
            "If money or codes were exposed, call 1930.",
        ]
    elif risk_level == "medium":
        advice = [
            "Treat this number as unverified.",
            "Use an official number you already trust before responding.",
        ]
    else:
        advice = [
            "No known local match was found, but this does not prove the number is safe.",
            "If the call or message pressured you, report it on Chakshu.",
        ]

    return V0KavachIndicator(
        kind="phone",
        value=phone,
        normalized=normalized,
        risk_level=risk_level,
        score=score,
        matched=matched,
        match_type=match_type,
        signals=signals[:8],
        advice=advice,
        reports=reports,
    )


def _check_merchant_payment_proof(text: str) -> V0KavachIndicator | None:
    blob = text.lower()
    if not blob:
        return None
    if not any(term in blob for term in ("payment", "paid", "utr", "transaction", "screenshot", "release", "dispatch")):
        return None

    signals: list[str] = []
    score = 0
    if any(term in blob for term in _MERCHANT_HIGH_RISK_TERMS):
        signals.append("Payment proof contains pending, screenshot, approval, or request-money language.")
        score += 35
    if any(term in blob for term in _MERCHANT_PRESSURE_TERMS):
        signals.append("Sender is pressuring immediate handover or dispatch.")
        score += 20
    if not _TX_REF_RE.search(text):
        signals.append("No clear UTR, RRN, or transaction reference was found.")
        score += 15
    if not _AMOUNT_RE.search(text):
        signals.append("No clear INR amount was found in the proof text.")
        score += 10
    if not signals:
        return None

    score = min(score, 100)
    risk_level = _risk_from_score(score)
    advice = [
        "Do not release goods on a customer-controlled screenshot alone.",
        "Verify the amount and reference inside the real bank or PSP ledger.",
    ]
    return V0KavachIndicator(
        kind="merchant_payment_proof",
        value="payment proof text",
        normalized="payment_proof",
        risk_level=risk_level,
        score=score,
        matched=score >= 35,
        match_type="merchant_payment_proof",
        signals=signals,
        advice=advice,
    )


def build_kavach_enrichment(
    *,
    text: str,
    upi_ids: list[str] | None = None,
    phone_numbers: list[str] | None = None,
    input_type: str = "text",
) -> V0KavachEnrichment | None:
    seed = _load_seed()
    indicators: list[V0KavachIndicator] = []
    text = text or ""

    all_upis = _unique([*(upi_ids or []), *_UPI_IN_TEXT_RE.findall(text)])
    all_phones = _unique([*(phone_numbers or []), *_PHONE_IN_TEXT_RE.findall(text)])

    for upi_id in all_upis[:5]:
        indicators.append(_check_upi(upi_id, seed))
    for phone in all_phones[:5]:
        indicators.append(_check_phone(phone, seed))

    if input_type == "payment_screenshot":
        merchant = _check_merchant_payment_proof(text)
        if merchant:
            indicators.append(merchant)

    if not indicators:
        return None

    max_score = max(indicator.score for indicator in indicators)
    risk_level = _risk_from_score(max_score)
    high = [item for item in indicators if item.risk_level == "high"]
    medium = [item for item in indicators if item.risk_level == "medium"]
    if high:
        summary = "Local Kavach enrichment found high-risk identifier or payment-proof signals."
    elif medium:
        summary = "Local Kavach enrichment found caution-level identifier or payment-proof signals."
    else:
        summary = "Local Kavach enrichment found no known high-risk match. That is not a safety guarantee."

    return V0KavachEnrichment(
        checked_at_utc=_now(),
        risk_level=risk_level,
        max_score=max_score,
        indicators=indicators[:10],
        summary=summary,
        no_match_is_safe=False,
    )
