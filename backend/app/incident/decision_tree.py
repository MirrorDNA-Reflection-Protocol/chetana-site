"""
Chetana — P0 Incident Mode: Decision tree.

5-screen decision tree derived from:
  flows/01_INCIDENT_MODE.md (Chetana_Final_Pack_2026-03-23)
  content/digital_arrest_copy.md
  content/result_card_copy.md
  docs/05_TRUST_BY_DESIGN_INTEGRATION.md

Copy is sourced directly from the canonical Final Pack spec.
"""
from __future__ import annotations

from typing import Optional

from .models import (
    IncidentCategory,
    IncidentSession,
    IncidentStepName,
    FamilyScreen,
    FollowUpScreen,
    FollowUpOutcome,
    NextActionsScreen,
    ProcessingPath,
    StabilizeScreen,
    WhatThisIsScreen,
)

# ── Constants ─────────────────────────────────────────────────────────────────

HELPLINE          = "1930"
CYBERCRIME_PORTAL = "https://cybercrime.gov.in"

# Processing disclosure per path — Trust by Design requirement
_PROCESSING_DISCLOSURE = {
    ProcessingPath.local:  "Processed on-device. Not sent remotely. Not stored.",
    ProcessingPath.remote: "Some data sent to remote classification service. Not stored beyond this session.",
    ProcessingPath.mixed:  "Processed partly on-device, partly remotely. Not stored beyond this session.",
}


# ── Category metadata ─────────────────────────────────────────────────────────

_CATEGORY_META: dict[IncidentCategory, dict] = {
    IncidentCategory.authority_impersonation: {
        "label": "Authority impersonation",
        "explanation": (
            "Someone is posing as a government official, police, CBI, RBI, customs, or court "
            "to pressure you into acting immediately."
        ),
        "known_signals": [
            "Use of official-sounding titles or agency names",
            "Demand for immediate payment or compliance",
        ],
        "suspected_signals": [
            "Request for secrecy ('do not tell anyone')",
            "Threat of arrest or legal action if you don't comply",
        ],
    },
    IncidentCategory.digital_arrest: {
        "label": "Digital arrest",
        "explanation": (
            "This pattern matches a high-pressure impersonation scam. "
            "Real authorities do not force instant payment over a call, "
            "demand secrecy, or isolate you from family."
        ),
        "known_signals": [
            "Police / CBI / customs / court / RBI impersonation",
            "Instruction to stay on video call",
            "'Isolate yourself' or 'do not tell anyone'",
        ],
        "suspected_signals": [
            "Demand to pay fine immediately over call",
            "Fear-inducing language about arrest or warrant",
        ],
    },
    IncidentCategory.kyc: {
        "label": "KYC / account blocked",
        "explanation": (
            "You are being told your account or KYC is blocked and you must act immediately "
            "to restore access. Legitimate banks never do this over a cold message."
        ),
        "known_signals": [
            "Urgent account-block language",
            "Request to click a link to update KYC",
        ],
        "suspected_signals": [
            "Link pattern inconsistent with expected institution flow",
            "Request for OTP, PIN, or card details",
        ],
    },
    IncidentCategory.upi_collect: {
        "label": "UPI collect scam",
        "explanation": (
            "You are being asked to approve a UPI collect request or mandate. "
            "Approving a collect request sends money OUT of your account — it does not receive money."
        ),
        "known_signals": [
            "Request to approve a UPI collect/mandate link",
        ],
        "suspected_signals": [
            "Framed as receiving a refund or prize",
        ],
    },
    IncidentCategory.qr: {
        "label": "QR scam",
        "explanation": (
            "You are being asked to scan a QR code to receive money or link a service. "
            "Scanning a payment QR code always sends money — it cannot receive it."
        ),
        "known_signals": [
            "QR code sent by an unknown party",
        ],
        "suspected_signals": [
            "Claim that scanning will credit money to your account",
        ],
    },
    IncidentCategory.linking: {
        "label": "WhatsApp / device linking",
        "explanation": (
            "You are being asked to link a device, scan a QR, or approve a pairing code. "
            "This can give an attacker full access to your WhatsApp or account."
        ),
        "known_signals": [
            "Request to scan a QR to 'link' or 'verify'",
        ],
        "suspected_signals": [
            "Pairing code sent by an unknown contact",
        ],
    },
    IncidentCategory.investment_job_mule: {
        "label": "Investment / job / money mule",
        "explanation": (
            "This contact involves unusually high return promises, an unsolicited job offer, "
            "or a request to receive and forward money. These are common vectors for financial fraud."
        ),
        "known_signals": [
            "Guaranteed high returns or part-time income",
        ],
        "suspected_signals": [
            "Request to receive money into your account and transfer it forward",
        ],
    },
    IncidentCategory.unknown: {
        "label": "Unknown — high risk",
        "explanation": (
            "Chetana detected high-risk signals but the specific pattern is not fully identified. "
            "Treat this as a scam until independently verified."
        ),
        "known_signals": [],
        "suspected_signals": [
            "High overall risk score",
        ],
    },
}


# ── Screen builders ───────────────────────────────────────────────────────────

def build_stabilize_screen(session: IncidentSession) -> StabilizeScreen:
    """
    Screen 1 — Stabilize.
    Copy verbatim from flows/incident_mode.md.
    """
    return StabilizeScreen(
        headline="This looks risky. Act fast, do not panic.",
        do_nots=[
            "Do not send money.",
            "Do not share OTP, PIN, card, Aadhaar, or bank details.",
            "Do not stay on the call while making payments.",
        ],
        ctas=["next", "alert_family", "call_1930"],
        processing_disclosure=_PROCESSING_DISCLOSURE.get(
            session.processing_path,
            _PROCESSING_DISCLOSURE[ProcessingPath.local],
        ),
    )


def build_what_this_is_screen(session: IncidentSession) -> WhatThisIsScreen:
    """
    Screen 2 — Category diagnosis.
    Trust by Design: show known vs suspected separately.
    """
    meta = _CATEGORY_META.get(session.category, _CATEGORY_META[IncidentCategory.unknown])

    # Inject raw signals from scanner into known signals if provided
    known_signals = list(meta["known_signals"])
    if session.raw_signals:
        for sig in session.raw_signals:
            if sig not in known_signals:
                known_signals.insert(0, sig)

    return WhatThisIsScreen(
        category=session.category,
        category_label=meta["label"],
        explanation=meta["explanation"],
        known_signals=known_signals,
        suspected_signals=meta["suspected_signals"],
        trust_note=(
            "This is what Chetana detected. Some signals are confirmed; "
            "others are suspected and require your judgment to verify."
        ),
    )


def build_next_actions_screen(session: IncidentSession) -> NextActionsScreen:
    """
    Screen 3 — 3 concrete next steps.
    Copy from flows/incident_mode.md Screen 3.
    """
    return NextActionsScreen(
        actions=[
            "Stop responding to this contact immediately.",
            "Capture evidence: screenshot messages, note the number or link.",
            "Use the official reporting route below.",
        ],
        ctas=["call_1930", "cybercrime_portal", "save_evidence"],
        helpline=HELPLINE,
        portal_url=CYBERCRIME_PORTAL,
        evidence_stub=True,   # P0: stub — full capture in P1
    )


def build_family_screen(session: IncidentSession) -> FamilyScreen:
    """
    Screen 4 — Parivar / guardian alert.
    Consent-scoped per docs/05_TRUST_BY_DESIGN_INTEGRATION.md Family layer.
    """
    return FamilyScreen(
        prompt="Do you want to alert a trusted contact?",
        options=[
            "share_alert",        # send a summary to a family contact
            "guardian_notified",  # mark guardian as already aware
            "checking_for_parent",  # "I am checking this for my parent"
        ],
        consent_note=(
            "Family contacts stay on your device. "
            "An alert is only sent if you choose to send it."
        ),
    )


def build_follow_up_screen(session: IncidentSession) -> FollowUpScreen:
    """
    Screen 5 — Post-incident triage.
    """
    return FollowUpScreen(
        question="What happened?",
        options=list(FollowUpOutcome),
        callback_guidance_available=True,
    )


# ── Navigation ────────────────────────────────────────────────────────────────

_STEP_ORDER = [
    IncidentStepName.stabilize,
    IncidentStepName.what_this_is,
    IncidentStepName.next_actions,
    IncidentStepName.family,
    IncidentStepName.follow_up,
]

_SCREEN_BUILDER = {
    IncidentStepName.stabilize:    build_stabilize_screen,
    IncidentStepName.what_this_is: build_what_this_is_screen,
    IncidentStepName.next_actions: build_next_actions_screen,
    IncidentStepName.family:       build_family_screen,
    IncidentStepName.follow_up:    build_follow_up_screen,
}


def get_screen(session: IncidentSession):
    """Return the screen model for the session's current step."""
    builder = _SCREEN_BUILDER[session.current_step]
    return builder(session)


def advance_step(session: IncidentSession) -> IncidentSession:
    """Move the session to the next step in the flow."""
    idx = _STEP_ORDER.index(session.current_step)
    if idx < len(_STEP_ORDER) - 1:
        session.current_step = _STEP_ORDER[idx + 1]
    else:
        session.completed = True
    if session.current_step not in session.steps_visited:
        session.steps_visited.append(session.current_step)
    return session


def resolve_category(hint: Optional[IncidentCategory], score: Optional[int]) -> IncidentCategory:
    """
    Determine incident category from scanner hint.
    Falls back to 'unknown' if no hint provided.
    Score >= 80 with no hint → unknown-high-risk (still 'unknown' band).
    """
    if hint is not None:
        return hint
    return IncidentCategory.unknown


# ── UPI decoder stub (P0) ─────────────────────────────────────────────────────

def decode_upi_action(upi_string: str) -> dict:
    """
    Stub: classify what a UPI string is asking the user to do.
    P0: returns structural placeholder.
    P1: integrate with Kavach UPI classifier.

    Returns:
        {
            "action_type": "pay" | "collect" | "mandate" | "qr_link" | "unknown",
            "risk": "low" | "medium" | "high",
            "explanation": str,
            "safe_to_proceed": bool
        }
    """
    lower = upi_string.lower()

    if "collect" in lower or "cr" in lower:
        return {
            "action_type": "collect",
            "risk": "high",
            "explanation": (
                "This is a collect request. Approving it sends money OUT of your account. "
                "Only approve if you initiated this transaction."
            ),
            "safe_to_proceed": False,
        }
    if "mandate" in lower or "autopay" in lower:
        return {
            "action_type": "mandate",
            "risk": "high",
            "explanation": (
                "This is a recurring mandate request. "
                "Approving allows repeated deductions from your account."
            ),
            "safe_to_proceed": False,
        }
    if upi_string.startswith("upi://"):
        return {
            "action_type": "pay",
            "risk": "medium",
            "explanation": "Standard UPI payment link. Verify the recipient VPA before approving.",
            "safe_to_proceed": None,  # depends on recipient trust
        }

    return {
        "action_type": "unknown",
        "risk": "medium",
        "explanation": "Could not classify this UPI string. Do not proceed until you verify the source.",
        "safe_to_proceed": False,
    }
