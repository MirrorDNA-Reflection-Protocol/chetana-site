from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Iterable
from urllib.parse import parse_qs, urlparse

from .schemas import AnalyzeRequest, AnalyzeResponse, EmergencyRequest, EmergencyResponse, OfficialRail, RiskLevel

DATA_DIR = Path(__file__).resolve().parent / "data"
OFFICIAL_RAILS_PATH = DATA_DIR / "official_rails.json"

AUTHORITY_WORDS = [
    "kyc", "bank", "rbi", "npci", "electricity", "power", "tata power", "adani",
    "telecom", "airtel", "jio", "vi", "gas", "indane", "bharat gas", "hp gas",
    "rto", "challan", "parivahan", "mparivahan", "police", "cbi", "ed", "court",
    "customs", "income tax", "aadhaar", "pan", "courier", "fedex", "dhl", "blue dart",
]
URGENCY_WORDS = [
    "urgent", "immediately", "last warning", "blocked", "disconnect", "suspend",
    "today", "within 24 hours", "arrest", "fine", "penalty", "legal action", "final notice",
]
APK_WORDS = [".apk", "install this app", "download app", "allow from this source", "unknown sources", "sideload"]
OTP_WORDS = ["otp", "one-time password", "upi pin", "pin", "mpin", "password", "cvv"]
REMOTE_WORDS = ["anydesk", "teamviewer", "quicksupport", "screen share", "share screen", "remote access", "remote support"]
FINANCIAL_WORDS = [
    "upi", "payment", "bank account", "refund", "reward", "cashback", "wallet",
    "transfer", "collect request", "credit card", "debit card", "netbanking",
]
LOAN_WORDS = ["loan", "bnpl", "pay later", "credit limit", "mandate", "e-nach", "nach", "emi", "overdraft"]
ECHALLAN_WORDS = ["challan", "traffic fine", "vehicle penalty", "parivahan", "mparivahan", "license suspension"]
COURIER_WORDS = ["courier", "parcel", "customs", "fedex", "dhl", "blue dart"]
JOB_WORDS = ["job", "salary", "vacancy", "data entry", "customer support", "crypto job", "gaming job", "work from home"]
SEA_COUNTRIES = ["cambodia", "laos", "myanmar", "thailand", "golden triangle", "myawaddy"]
VOICE_WORDS = ["voice", "call", "video call", "family emergency", "accident", "kidnap", "hospital", "do not tell anyone"]
MULE_WORDS = ["rent account", "upi rent", "sim rent", "receive funds", "forward money", "commission", "atm card", "passbook"]
DIGITAL_ARREST_WORDS = ["digital arrest", "safe account", "money laundering", "fake warrant", "parcel contains drugs", "video call interrogation"]
INVESTMENT_WORDS = ["investment", "trading", "telegram group", "guaranteed return", "tax to withdraw", "double your money"]
PERSONAL_DETAIL_WORDS = ["consumer number", "meter number", "service request", "address", "date of birth", "last four digits"]
SHORTENER_HOSTS = ["bit.ly", "tinyurl.com", "t.co", "cutt.ly", "is.gd", "lnkd.in", "shorturl.at"]
UPI_FINANCIAL_PATTERN = re.compile(r"upi|bank|payment|refund|account|wallet", re.I)
APK_PATTERN = re.compile(r"\.apk\b|\bapk\b|install\s+(this\s+)?app|download\s+(this\s+)?(apk|app)|allow from this source|unknown sources|sideload", re.I)

THREAT_LABELS = {
    "fake_ekyc_apk": "Fake KYC / authority APK",
    "fake_echallan": "Fake e-challan / authority payment",
    "apk_malware": "APK / sideload malware",
    "qr_payment_tampering": "QR payment tampering",
    "qr_receive_money_scam": "Fake refund or receive-money QR",
    "qr_phishing": "QR-to-phishing / quishing",
    "remote_access_takeover": "Remote access takeover",
    "otp_pin_capture": "OTP / PIN capture",
    "voice_deepfake_call": "Voice impersonation / deepfake pressure",
    "cyber_slavery_recruitment": "Overseas cyber-slavery recruitment",
    "mule_account_recruitment": "Mule-account / SIM rental",
    "digital_arrest": "Digital arrest / coercive authority scam",
    "financial_flow_anomaly": "Verification payment / loan / mandate anomaly",
    "fake_customer_support": "Fake customer support",
    "investment_trading_scam": "Investment / trading scam",
    "courier_customs_scam": "Courier / customs scam",
    "job_scam": "Job scam",
}


def _has_any(text: str, words: Iterable[str]) -> bool:
    return any(word in text for word in words)


def _unique(items: Iterable[str]) -> list[str]:
    out: list[str] = []
    for item in items:
        if item and item not in out:
            out.append(item)
    return out


def _safe_url(raw: str):
    try:
        return urlparse(raw)
    except Exception:
        return None


@lru_cache(maxsize=1)
def load_official_rails() -> list[OfficialRail]:
    data = json.loads(OFFICIAL_RAILS_PATH.read_text(encoding="utf-8"))
    return [OfficialRail.model_validate(item) for item in data]


@lru_cache(maxsize=1)
def _rail_map() -> dict[str, OfficialRail]:
    return {rail.rail_id: rail for rail in load_official_rails()}


def _rails_by_id(rail_ids: Iterable[str]) -> list[OfficialRail]:
    catalog = _rail_map()
    return [catalog[rail_id] for rail_id in _unique(rail_ids) if rail_id in catalog]


def _level_from_score(score: int) -> RiskLevel:
    if score >= 80:
        return "critical"
    if score >= 55:
        return "dangerous"
    if score >= 35:
        return "suspicious"
    if score >= 15:
        return "caution"
    return "safe"


def _share_warning(threat_types: list[str], risk_level: RiskLevel) -> str:
    if "digital_arrest" in threat_types:
        return "Digital arrest warning: no real authority asks you to move money into a safe account."
    if "qr_receive_money_scam" in threat_types:
        return "QR warning: do not scan a QR code to receive money, refund, or cashback."
    if "fake_ekyc_apk" in threat_types or "apk_malware" in threat_types:
        return "APK warning: do not install apps sent over WhatsApp, SMS, Telegram, email, or QR."
    if "mule_account_recruitment" in threat_types:
        return "Mule-account warning: never rent your bank account, UPI ID, SIM, ATM card, or passbook."
    if "cyber_slavery_recruitment" in threat_types:
        return "Job warning: tourist visa plus agent fee plus digital work can indicate trafficking or forced scam work."
    if risk_level in {"critical", "dangerous"}:
        return "Pause here. This matches a known high-risk fraud pattern."
    return "Verify independently before you pay, install, travel, or share secrets."


def _select_rail_ids(threats: list[str], req: AnalyzeRequest) -> list[str]:
    rails: list[str] = []
    financial = bool({
        "fake_ekyc_apk",
        "fake_echallan",
        "qr_payment_tampering",
        "qr_receive_money_scam",
        "otp_pin_capture",
        "remote_access_takeover",
        "investment_trading_scam",
        "courier_customs_scam",
        "financial_flow_anomaly",
        "digital_arrest",
    }.intersection(threats))

    if financial or req.already_paid or req.already_shared_otp or req.already_gave_remote_access:
        rails.extend(["CYBER_HELPLINE_1930", "NCRP_PORTAL", "RBI_CMS"])
    if "digital_arrest" in threats:
        rails.append("ERSS_112")
    if "cyber_slavery_recruitment" in threats or req.mode == "job":
        rails.extend(["MEA_EMIGRATE", "MEA_OVERSEAS_EMPLOYMENT"])
    if req.mode == "qr":
        rails.append("NCRP_SUSPECT_REPOSITORY")
    return _unique(rails)


def analyze_request(req: AnalyzeRequest) -> AnalyzeResponse:
    text = " ".join(
        part
        for part in [
            req.text,
            req.qr_payload or "",
            req.destination_country or "",
            req.visa_type or "",
            req.recruiter_channel or "",
        ]
        if part
    ).lower()

    score = 0
    evidence: list[str] = []
    threat_types: list[str] = []
    missing_info: list[str] = []

    authority = _has_any(text, AUTHORITY_WORDS)
    urgency = _has_any(text, URGENCY_WORDS)
    apk = bool(APK_PATTERN.search(text)) or req.mode == "apk" or bool(req.apk_permissions) or bool(req.apk_file_name)
    otp_pin = _has_any(text, OTP_WORDS)
    remote = _has_any(text, REMOTE_WORDS)
    financial = _has_any(text, FINANCIAL_WORDS)
    loan = _has_any(text, LOAN_WORDS)
    echallan = _has_any(text, ECHALLAN_WORDS)
    courier = _has_any(text, COURIER_WORDS)
    personal_details = _has_any(text, PERSONAL_DETAIL_WORDS)
    job = _has_any(text, JOB_WORDS)
    overseas = _has_any(text, SEA_COUNTRIES) or (job and ("tourist visa" in text or req.passport_requested or req.agent_fee_inr > 0))
    voice = req.mode == "call" and (_has_any(text, VOICE_WORDS) or "urgent transfer" in text or "callback" in text)
    mule = _has_any(text, MULE_WORDS)
    digital_arrest = _has_any(text, DIGITAL_ARREST_WORDS)
    investment = _has_any(text, INVESTMENT_WORDS)
    financial_flow = "₹1" in req.text or "rs 1" in text or "verification payment" in text or loan

    if authority:
        score += 15
        evidence.append("Authority or institution claim detected.")
    if urgency:
        score += 15
        evidence.append("Urgency, threat, or deadline language detected.")
    if apk:
        score += 45
        evidence.append("APK, sideload, or install-app instruction detected.")
        threat_types.append("apk_malware")
    if otp_pin:
        score += 50
        evidence.append("OTP, PIN, password, or CVV request detected.")
        threat_types.append("otp_pin_capture")
    if remote:
        score += 50
        evidence.append("Remote access or screen-share request detected.")
        threat_types.append("remote_access_takeover")
    if echallan:
        score += 25
        evidence.append("E-challan / RTO / traffic penalty context detected.")
        threat_types.append("fake_echallan")
    if courier:
        score += 25
        evidence.append("Courier / parcel / customs payment context detected.")
        threat_types.append("courier_customs_scam")
    if digital_arrest:
        score += 80
        evidence.append("Digital arrest or coercive authority pattern detected.")
        threat_types.append("digital_arrest")
    if mule:
        score += 70
        evidence.append("Mule-account, UPI rental, SIM rental, or fund-forwarding pattern detected.")
        threat_types.append("mule_account_recruitment")
    if overseas:
        score += 45
        evidence.append("High-risk overseas digital work or recruiter pattern detected.")
        threat_types.append("cyber_slavery_recruitment")
    if voice:
        score += 45
        evidence.append("Voice/video impersonation or urgent transfer pressure detected.")
        threat_types.append("voice_deepfake_call")
    if investment:
        score += 35
        evidence.append("Investment, trading, or withdrawal-tax scam language detected.")
        threat_types.append("investment_trading_scam")
    if financial_flow:
        score += 35
        evidence.append("Verification payment, loan, mandate, or credit anomaly detected.")
        threat_types.append("financial_flow_anomaly")
    if personal_details:
        score += 15
        evidence.append("Personal details are used as trust bait.")
    if authority and apk:
        threat_types.append("fake_ekyc_apk")
    if financial and authority and not apk and (otp_pin or remote or urgency):
        threat_types.append("fake_customer_support")
    if job and "job_scam" not in threat_types:
        threat_types.append("job_scam")

    qr_payload = (req.qr_payload or "").strip()
    if qr_payload:
        parsed = _safe_url(qr_payload)
        lower_qr = qr_payload.lower()
        if lower_qr.startswith("upi://pay"):
            score += 25
            evidence.append("UPI payment QR detected.")
            threat_types.append("qr_payment_tampering")
            if req.user_says_receiving_money:
                score += 45
                evidence.append("Context says receive/refund, but the QR is a payment URI.")
                threat_types.append("qr_receive_money_scam")
            params = parse_qs(urlparse(qr_payload).query)
            qr_name = (params.get("pn") or [""])[0]
            if req.expected_merchant and qr_name and req.expected_merchant.lower() not in qr_name.lower():
                score += 20
                evidence.append(f"Merchant mismatch: expected {req.expected_merchant}, QR says {qr_name}.")
            if params.get("am"):
                evidence.append(f"QR includes a prefilled amount: {(params.get('am') or [''])[0]}.")
        if parsed and parsed.scheme in {"http", "https"}:
            host = parsed.netloc.lower()
            if parsed.scheme != "https":
                score += 15
                evidence.append("QR URL is not HTTPS.")
                threat_types.append("qr_phishing")
            if any(host == short or host.endswith("." + short) for short in SHORTENER_HOSTS):
                score += 25
                evidence.append("QR URL uses a shortener.")
                threat_types.append("qr_phishing")
            if host.startswith("xn--") or re.fullmatch(r"\d{1,3}(\.\d{1,3}){3}", host):
                score += 25
                evidence.append("QR URL uses a suspicious hostname pattern.")
                threat_types.append("qr_phishing")
            if ".apk" in lower_qr or "download" in lower_qr:
                score += 70
                evidence.append("QR appears to lead to an APK or download flow.")
                threat_types.extend(["qr_phishing", "apk_malware"])
        if req.physical_qr_looks_tampered:
            score += 35
            evidence.append("User reports possible physical QR tampering or sticker overlay.")
            threat_types.append("qr_payment_tampering")

    if req.already_installed:
        score += 40
        evidence.append("User indicates a suspicious app may already be installed.")
    if req.already_paid:
        score += 30
        evidence.append("User indicates money may already have moved.")
    if req.already_shared_otp:
        score += 35
        evidence.append("User indicates OTP, PIN, or password may already have been shared.")
    if req.already_gave_remote_access:
        score += 45
        evidence.append("User indicates screen-share or remote access may already have been granted.")

    text_length = len(req.text.strip())
    insufficient_evidence = not evidence and not qr_payload and not req.apk_permissions and text_length < 40
    if insufficient_evidence:
        missing_info.append("Paste the full message, upload a screenshot, or decode the QR before trusting it.")
    if authority and not req.expected_sender:
        missing_info.append("Official sender/source has not been independently verified.")
    if qr_payload.lower().startswith("upi://pay") and not req.expected_merchant:
        missing_info.append("Expected merchant or recipient name is not provided.")
    if apk and not req.apk_permissions:
        missing_info.append("APK permissions or manifest summary are not available yet.")
    if overseas and not req.destination_country:
        missing_info.append("Destination country should be captured explicitly for overseas job checks.")

    hard_critical = any(
        [
            authority and apk,
            echallan and apk,
            digital_arrest,
            mule,
            otp_pin and UPI_FINANCIAL_PATTERN.search(text),
            remote and UPI_FINANCIAL_PATTERN.search(text),
            req.already_installed and apk,
            req.already_gave_remote_access,
        ]
    )

    if hard_critical:
        risk_level: RiskLevel = "critical"
    else:
        risk_level = _level_from_score(min(score, 100))

    if insufficient_evidence and risk_level == "safe":
        risk_level = "caution"
        evidence.append("The current material is too thin to clear safely.")

    if not evidence:
        evidence.append("No strong scam indicators fired, but the current material is still not a trust guarantee.")

    confidence = min(0.98, max(0.35, min(score, 100) / 100 + (0.15 if risk_level == "critical" else 0.0)))
    threat_types = _unique(threat_types or ["unknown"])

    do_not_do = [
        "Do not share OTP, UPI PIN, passwords, card details, or screen-share access.",
        "Do not trust phone numbers, URLs, or payment handles found only inside the suspicious contact.",
    ]
    recommended_actions = [
        "Verify independently using the official app, official website, or a number you already trust.",
    ]
    if risk_level in {"critical", "dangerous"}:
        recommended_actions.insert(0, "Stop. Do not proceed with the requested action.")
    if apk:
        do_not_do.append("Do not install APKs received over WhatsApp, SMS, Telegram, email, browser pop-ups, or QR codes.")
        recommended_actions.append("Use only the Play Store or the official institution website for app installs.")
    if "qr_payment_tampering" in threat_types or "qr_receive_money_scam" in threat_types:
        do_not_do.append("Do not scan a QR code to receive money, refunds, rewards, or cashback.")
        recommended_actions.append("Before entering UPI PIN, verify payee name, VPA, and amount.")
    if remote:
        do_not_do.append("Do not install remote support apps or continue screen sharing during banking or payment activity.")
        recommended_actions.append("End the call or chat and contact the institution independently.")
    if overseas:
        do_not_do.append("Do not travel on a tourist visa for work or hand over your passport to a recruiter.")
        recommended_actions.append("Verify recruiter registration, visa category, and the job through official overseas employment channels.")
    if mule:
        do_not_do.append("Do not rent, lend, or share your bank account, UPI ID, SIM, ATM card, or passbook.")
        recommended_actions.append("Report mule-account recruitment through official cybercrime channels.")
    if req.already_installed or req.already_paid or req.already_shared_otp or req.already_gave_remote_access:
        recommended_actions.insert(0, "Use another clean device to call your bank or payment provider immediately.")
        recommended_actions.append("Open emergency mode and preserve evidence before the trail disappears.")

    rail_ids = _select_rail_ids(threat_types, req)

    return AnalyzeResponse(
        mode=req.mode,
        risk_level=risk_level,
        score=min(score, 100),
        confidence=round(confidence, 2),
        threat_types=threat_types,
        evidence=_unique(evidence),
        missing_info=_unique(missing_info),
        do_not_do=_unique(do_not_do),
        recommended_actions=_unique(recommended_actions),
        share_warning=_share_warning(threat_types, risk_level),
        insufficient_evidence=insufficient_evidence,
        official_rails=_rails_by_id(rail_ids),
    )


def build_emergency_response(req: EmergencyRequest) -> EmergencyResponse:
    if req.trigger in {"apk_installed", "gave_remote_access", "clicked_link"}:
        incident_type = "device_compromise"
        severity = "critical"
        immediate_steps = [
            "Turn on airplane mode or disconnect the device from the network.",
            "Do not open banking, UPI, wallet, or loan apps on the suspected device.",
            "Use another clean device to call your bank or payment provider immediately.",
            "Revoke accessibility, device-admin, notification-listener, and screen-share permissions if present.",
        ]
        rail_ids = ["CYBER_HELPLINE_1930", "NCRP_PORTAL", "RBI_CMS"]
    elif req.trigger in {"paid_money", "qr_paid", "bank_account_draining"}:
        incident_type = "active_financial_fraud"
        severity = "critical"
        immediate_steps = [
            "Call your bank or payment provider immediately from another device and request blocking or hold action.",
            "Block UPI, cards, netbanking, wallet, and linked payment instruments.",
            "Call 1930 as fast as possible while the fund-freeze window is still open.",
            "Capture the transaction ID, payee VPA, amount, date, and screenshot before evidence disappears.",
        ]
        rail_ids = ["CYBER_HELPLINE_1930", "NCRP_PORTAL", "RBI_CMS", "NCRP_SUSPECT_REPOSITORY"]
    elif req.trigger == "shared_otp":
        incident_type = "credential_compromise"
        severity = "dangerous"
        immediate_steps = [
            "Stop using the compromised session or app immediately.",
            "Call your bank or payment provider from another device.",
            "Reset PINs, passwords, and recovery settings from a clean device.",
            "Watch for mandates, loans, UPI approvals, and new beneficiary changes.",
        ]
        rail_ids = ["CYBER_HELPLINE_1930", "NCRP_PORTAL", "RBI_CMS"]
    elif req.trigger == "digital_arrest":
        incident_type = "coercive_authority_extortion"
        severity = "critical"
        immediate_steps = [
            "End the call or video session immediately.",
            "Do not transfer money to any safe account or verification account.",
            "Call a trusted family member or colleague on a known number.",
            "If you feel physically unsafe or are being actively threatened, use 112.",
        ]
        rail_ids = ["CYBER_HELPLINE_1930", "NCRP_PORTAL", "ERSS_112"]
    else:
        incident_type = "overseas_job_or_trafficking_risk"
        severity = "priority"
        immediate_steps = [
            "Do not board, do not surrender your passport, and do not hand over your phone.",
            "Call family or a trusted contact immediately.",
            "Verify the recruiter, employer, and visa path through official overseas employment channels.",
            "If already abroad or under active coercion, contact local police and the nearest Indian mission.",
        ]
        rail_ids = ["MEA_EMIGRATE", "MEA_OVERSEAS_EMPLOYMENT", "ERSS_112"]

    preserve_evidence = [
        "Preserve screenshots, chat logs, phone numbers, URLs, APK files, and payment details.",
        "Capture transaction IDs, UTR numbers, recipient handles, and timestamps.",
        "Keep recruiter details, tickets, visa copies, offer letters, and passport copies if job/travel is involved.",
    ]
    do_not_do = [
        "Do not keep negotiating with the scammer while you are trying to recover.",
        "Do not rely on the suspicious device alone for verification if compromise is possible.",
        "Do not delay the first bank and 1930 contact if money, OTP, or remote access is involved.",
    ]
    escalation_order = [
        "Stabilize the device and payment surface.",
        "Contact the official rail with the fastest freeze / reporting path.",
        "Preserve evidence and write down the timeline.",
        "Escalate to police, regulator, or overseas-employment authority as needed.",
    ]
    handoff_script = (
        "I need to report a likely cyber fraud incident right now. "
        "The trigger was "
        + req.trigger.replace("_", " ")
        + ". "
        "I have the screenshots, phone numbers, payment details, and timeline ready."
    )

    return EmergencyResponse(
        incident_type=incident_type,
        severity=severity,
        immediate_steps=immediate_steps,
        preserve_evidence=preserve_evidence,
        do_not_do=do_not_do,
        official_rails=_rails_by_id(rail_ids),
        escalation_order=escalation_order,
        handoff_script=handoff_script,
    )
