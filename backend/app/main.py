"""
Chetana Showcase Site — Backend API.

Serves the web app, local-first scan and chat flows, partner APIs,
recent scam patterns, and helper routes.
Kavach remains available for thin identifier checks and feeds.
"""
from __future__ import annotations

import httpx
import logging
import re
import sys
from datetime import datetime, timezone
from fastapi import FastAPI, Request
from fastapi import Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import Any, Literal, Optional
from pathlib import Path
from uuid import uuid4

# Load shared Chetana soul, gates, prompt from canonical location
_CHETANA_DIR = Path.home() / ".mirrordna" / "chetana"
if _CHETANA_DIR.is_dir() and str(_CHETANA_DIR) not in sys.path:
    sys.path.insert(0, str(_CHETANA_DIR))

try:
    from gates import gate_output  # noqa: E402
except ModuleNotFoundError as exc:  # pragma: no cover - runtime resilience
    if exc.name not in {"prompt", "gates"}:
        raise
    from app.chetana_runtime_fallback import (  # noqa: E402
        gate_output,
    )

logger = logging.getLogger("chetana.showcase")

from app.v0_runtime import (  # noqa: E402
    V0EvidenceRequest,
    V0EventInput,
    V0ScanInput,
    V0TrustRuntimeRequest,
    analyze_scan as analyze_v0_scan,
    assess_send_guard,
    build_merchant_release_assessment,
    build_evidence_pack,
    build_recovery_packet,
    build_trust_bundle,
    log_event as log_v0_event,
)
from app.analytics import build_live_stats_snapshot, build_v0_analytics_summary  # noqa: E402
from app.gamechanger.rules import (  # noqa: E402
    analyze_request as analyze_gamechanger_request,
    build_emergency_response as build_gamechanger_emergency_response,
    load_official_rails,
)
from app.gamechanger.schemas import (  # noqa: E402
    AnalyzeRequest as GamechangerAnalyzeRequest,
    AnalyzeResponse as GamechangerAnalyzeResponse,
    EmergencyRequest as GamechangerEmergencyRequest,
    EmergencyResponse as GamechangerEmergencyResponse,
    OfficialRail as GamechangerOfficialRail,
)
from app.scan_guidance import build_live_scan_guidance, enrich_v0_verdict  # noqa: E402

KAVACH_URL = "http://127.0.0.1:8790"
TELEGRAM_API = "https://api.telegram.org"


# ── Telegram notification (fire-and-forget) ───────────────────────────

def _load_telegram_config() -> tuple[str, str]:
    """Load bot token and chat ID from env or secrets.env."""
    import os
    token = os.getenv("KAVACH_TELEGRAM_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "")
    if token and chat_id:
        return token, chat_id
    secrets = Path.home() / ".mirrordna" / "secrets.env"
    if secrets.exists():
        for line in secrets.read_text().splitlines():
            line = line.strip().removeprefix("export ").strip()
            if line.startswith("KAVACH_TELEGRAM_TOKEN=") and not token:
                token = line.split("=", 1)[1].strip().strip('"').strip("'")
            elif line.startswith("TELEGRAM_CHAT_ID=") and not chat_id:
                chat_id = line.split("=", 1)[1].strip().strip('"').strip("'")
    return token, chat_id


_TG_TOKEN, _TG_CHAT_ID = _load_telegram_config()


async def _notify_telegram(text: str, chat_id: str | None = None) -> bool:
    """Send a Telegram message. Non-blocking best-effort."""
    if not _TG_TOKEN:
        return False
    target = chat_id or _TG_CHAT_ID
    if not target:
        return False
    try:
        client = await get_client()
        resp = await client.post(
            f"{TELEGRAM_API}/bot{_TG_TOKEN}/sendMessage",
            json={"chat_id": target, "text": text, "parse_mode": "Markdown"},
            timeout=5.0,
        )
        return resp.status_code == 200
    except Exception as e:
        logger.debug("Telegram notify failed: %s", e)
        return False

app = FastAPI(
    title="Chetana API",
    description="Advisory API for checking suspicious messages, QR requests, and payment proofs, with clear next steps for users in India.",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ── P0 Incident Mode router ───────────────────────────────────────────────────
# Spec: Chetana_Final_Pack_2026-03-23/flows/incident_mode.md
# Routes: POST /api/incident/start, GET /api/incident/status/{id},
#         POST /api/incident/action, POST /api/incident/upi/decode
from app.incident.incident_mode import router as incident_router  # noqa: E402
app.include_router(incident_router)

# ── B2B API (key-gated, versioned) ────────────────────────────────────────
from app.b2b_router import b2b_router  # noqa: E402
app.include_router(b2b_router)

# ── Witness Chain (public transparency) ───────────────────────────────────
# Proxies to the local witness verifier at :8950. No auth — transparency endpoint.
@app.get("/api/witness/{path:path}")
async def witness_proxy(path: str):
    """Public witness chain verifier — tamper-evident AI audit trail."""
    client = await get_client()
    try:
        resp = await client.get(f"http://localhost:8950/{path}", timeout=10.0)
        return resp.json()
    except Exception:
        return {"error": "Witness chain verifier unavailable"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://chetana.activemirror.ai",
        "https://activemirror.ai",
        "http://localhost:8093",
        "http://localhost:5173",
        "http://localhost:8099",
    ],
    allow_methods=["GET", "POST", "HEAD"],
    allow_headers=["Content-Type"],
)

# Security headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(self), geolocation=()"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# Serve the built frontend at root (must be AFTER all API routes are defined,
# so we mount it at startup instead of module level)
frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"

# ── Shared async HTTP client ──────────────────────────────────────────

_client: httpx.AsyncClient | None = None


async def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=30.0)
    return _client


@app.on_event("shutdown")
async def _close_client():
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()


@app.get("/api/translate/budget")
async def translate_budget():
    """Expose the current local-only translation posture."""
    return {
        "sarvam_available": True,
        "google_available": False,
        "mode": "local_only",
    }


# ── Sarvam Translate (local Ollama, free) ─────────────────────────────

SARVAM_MODEL = "hf.co/mradermacher/sarvam-translate-i1-GGUF:Q4_K_M"
OLLAMA_URL = "http://127.0.0.1:11434"
MEDIA_PROXY_TIMEOUT = httpx.Timeout(90.0, connect=10.0)

LANG_NAMES = {
    "hi": "Hindi", "ta": "Tamil", "te": "Telugu", "kn": "Kannada",
    "ml": "Malayalam", "bn": "Bengali", "mr": "Marathi", "gu": "Gujarati",
    "pa": "Punjabi", "or": "Odia", "as": "Assamese", "ur": "Urdu",
}


def detect_script_lang(text: str) -> str | None:
    """Detect Indian language from Unicode script ranges. Returns lang code or None."""
    import unicodedata
    script_counts: dict[str, int] = {}
    script_map = {
        "DEVANAGARI": "hi",  # Hindi/Marathi — disambiguate below
        "TAMIL": "ta",
        "TELUGU": "te",
        "BENGALI": "bn",
        "GUJARATI": "gu",
        "KANNADA": "kn",
        "MALAYALAM": "ml",
        "GURMUKHI": "pa",
        "ORIYA": "or",
    }
    for ch in text:
        try:
            name = unicodedata.name(ch, "")
        except ValueError:
            continue
        for script, code in script_map.items():
            if script in name:
                script_counts[code] = script_counts.get(code, 0) + 1
                break
    if not script_counts:
        return None
    dominant = max(script_counts, key=script_counts.get)  # type: ignore
    # Devanagari could be Hindi or Marathi — check for Marathi-specific characters
    if dominant == "hi" and any(ch in text for ch in "ळ"):
        return "mr"
    return dominant


async def local_translate_text(text: str, target_lang: str) -> str:
    """Translate text locally via Ollama without sending scan content to external services."""
    if not text.strip():
        return text
    target = "English" if target_lang == "en" else LANG_NAMES.get(target_lang)
    if not target:
        return text
    try:
        client = await get_client()
        resp = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": SARVAM_MODEL,
                "prompt": (
                    f"Translate to {target}. Preserve URLs, UPI IDs, phone numbers, "
                    f"amounts, and transaction references exactly.\n\n{text}"
                ),
                "stream": False,
            },
            timeout=15.0,
        )
        if resp.status_code == 200:
            return resp.json().get("response", "").strip() or text
    except Exception as e:
        logger.warning("Local translate failed (%s): %s", target_lang, e)
    return text


async def sarvam_translate(text: str, lang: str) -> str:
    """Translate text to an Indian language using the local translation helper."""
    if lang == "en" or lang not in LANG_NAMES:
        return text
    return await local_translate_text(text, lang)


async def translate_scan_result(result: dict, lang: str) -> dict:
    """Translate user-facing strings in a scan result dict."""
    if lang == "en" or lang not in LANG_NAMES:
        return result
    # Translate the why_flagged signals
    if "why_flagged" in result and result["why_flagged"]:
        translated = []
        for signal in result["why_flagged"]:
            translated.append(await sarvam_translate(signal, lang))
        result["why_flagged"] = translated
    # Translate summary if present
    if "summary" in result and result["summary"]:
        result["summary"] = await sarvam_translate(result["summary"], lang)
    if "guidance" in result and isinstance(result["guidance"], dict):
        guidance = result["guidance"]
        for field in ["lead", "verification_route", "false_positive_recovery", "hindi_quick_line"]:
            if guidance.get(field):
                guidance[field] = await sarvam_translate(guidance[field], lang)
        for field in ["why_it_was_flagged", "do_now", "do_not_do", "if_already_acted"]:
            if guidance.get(field):
                translated_items = []
                for item in guidance[field]:
                    translated_items.append(await sarvam_translate(item, lang))
                guidance[field] = translated_items
    return result


# ── Request models ────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    input_type: Literal["text", "link", "payment_proof", "media"] = "text"
    content: str = Field(..., max_length=10000)
    lang: str = "en"


class FullScanRequest(BaseModel):
    text: str = Field(..., max_length=10000)
    lang: str = "en"


class UpiCheckRequest(BaseModel):
    upi_id: str = Field(..., max_length=256)


class PhoneCheckRequest(BaseModel):
    phone: str = Field(..., max_length=20)


class ChatRequest(BaseModel):
    message: str = Field(..., max_length=2000)
    lang: str = "en"


class APKCheckRequest(BaseModel):
    url: Optional[str] = Field(default="", max_length=2048)
    filename: Optional[str] = Field(default="", max_length=256)
    text: Optional[str] = Field(default="", max_length=10000)
    claimed_brand: Optional[str] = Field(default="", max_length=100)


class OracleVerifyRequest(BaseModel):
    hash: Optional[str] = Field(default=None, max_length=128)
    url: Optional[str] = Field(default=None, max_length=2048)


# ── Health ────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    kavach_ok = False
    try:
        import httpx as _httpx

        resp = _httpx.get(f"{KAVACH_URL}/ui", timeout=3.0)
        kavach_ok = resp.status_code == 200
    except Exception:
        kavach_ok = False
    return {
        "status": "healthy" if kavach_ok else "degraded",
        "backend": "showcase",
        "kavach": "up" if kavach_ok else "down",
        "port": 8093,
    }


def _is_link_submission(text: str) -> bool:
    stripped = text.strip()
    return stripped.startswith(("http://", "https://", "www.")) and len(stripped.split()) <= 2


def _legacy_verdict_from_v0(verdict_value: str) -> str:
    if verdict_value == "high_risk":
        return "SUSPICIOUS"
    if verdict_value in {"caution", "needs_review"}:
        return "UNCLEAR"
    return "LOW_RISK"


def _legacy_action_eligibility(verdict_value: str) -> str:
    if verdict_value == "high_risk":
        return "warn_and_verify"
    if verdict_value in {"caution", "needs_review"}:
        return "inform_and_suggest"
    return "inform_only"


def _legacy_trust_state(verdict_value: str) -> str:
    if verdict_value == "high_risk":
        return "blocked"
    if verdict_value in {"caution", "needs_review"}:
        return "inspect"
    return "unverified"


def _legacy_score_from_v0(verdict_model: Any) -> int:
    base_scores = {
        "high_risk": 82,
        "caution": 58,
        "needs_review": 38,
        "low_signal": 14,
    }
    confidence_adjustment = {
        "high": 6,
        "medium": 0,
        "low": -6,
    }
    evidence_adjustment = {
        "complete": 4,
        "partial": 1,
        "weak": -4,
        "conflicting": 3,
    }
    incident_adjustment = {
        "device_access_requested": 6,
        "payment_attempted": 5,
        "payment_requested": 3,
        "active_coercion": 2,
        "suspected": 0,
    }
    score = base_scores.get(verdict_model.verdict, 20)
    score += confidence_adjustment.get(verdict_model.confidence_band, 0)
    score += evidence_adjustment.get(verdict_model.evidence_state, 0)
    score += incident_adjustment.get(verdict_model.incident_state, 0)
    return max(0, min(100, int(score)))


async def _run_local_scan_contract(text: str, lang: str = "en") -> dict[str, Any]:
    detected = detect_script_lang(text)
    response_lang = detected or lang or "en"
    normalized = text.strip()
    scan_text = normalized
    if response_lang != "en":
        scan_text = await local_translate_text(normalized, "en")

    verdict_model = analyze_v0_scan(
        V0ScanInput(
            input_type="text",
            text=scan_text,
            language_hint=response_lang,
        )
    )
    verdict_model = await enrich_v0_verdict(verdict_model)

    legacy_verdict = _legacy_verdict_from_v0(verdict_model.verdict)
    score = _legacy_score_from_v0(verdict_model)
    is_link = _is_link_submission(normalized)

    live_guidance = await build_live_scan_guidance(
        text=normalized,
        verdict=legacy_verdict,
        score=score,
        signals=verdict_model.guidance.why_it_was_flagged[:5],
        explanation=verdict_model.summary_plain_language or "",
        is_link=is_link,
    )
    guidance = {
        **live_guidance,
        **verdict_model.guidance.model_dump(),
        "scenario_label": live_guidance.get("scenario_label"),
        "hindi_quick_line": live_guidance.get("hindi_quick_line"),
        "needs_more_evidence": live_guidance.get("needs_more_evidence", verdict_model.evidence_state == "weak"),
    }

    result = {
        "scan_id": verdict_model.scan_id,
        "verdict": legacy_verdict,
        "risk_score": score,
        "score": score,
        "surface": "link trust" if is_link else "general trust",
        "why_flagged": guidance["why_it_was_flagged"][:5],
        "signals": guidance["why_it_was_flagged"][:5],
        "summary": verdict_model.summary_plain_language,
        "action_eligibility": _legacy_action_eligibility(verdict_model.verdict),
        "engine": "chetana_v0_local",
        "trust_state": _legacy_trust_state(verdict_model.verdict),
        "reason_codes": [reason.code for reason in verdict_model.reasons],
        "guidance": guidance,
        "safe_next_step": verdict_model.safe_next_step,
        "confidence_band": verdict_model.confidence_band,
        "risk_level": verdict_model.risk_level,
        "evidence_state": verdict_model.evidence_state,
        "incident_state": verdict_model.incident_state,
        "scam_type": verdict_model.scam_type,
        "recommended_actions": verdict_model.recommended_actions,
        "advice": guidance["do_now"][:3],
    }
    result = await translate_scan_result(result, response_lang)
    result["lang"] = response_lang
    return result


# ── Weather ───────────────────────────────────────────────────────────

@app.get("/api/weather")
async def weather():
    """Live Scam Weather — aggregated from Kavach threat intelligence."""
    signals = [
        {"id": "w1", "label": "UPI payment fraud", "pressure": 86, "delta": "+12%", "tone": "red"},
        {"id": "w2", "label": "Courier / delivery phishing", "pressure": 62, "delta": "+4%", "tone": "amber"},
        {"id": "w3", "label": "Bank impersonation", "pressure": 73, "delta": "+8%", "tone": "red"},
        {"id": "w4", "label": "Digital arrest scam", "pressure": 54, "delta": "+18%", "tone": "amber"},
        {"id": "w5", "label": "KYC update fraud", "pressure": 68, "delta": "+6%", "tone": "red"},
        {"id": "w6", "label": "Voice deepfake", "pressure": 41, "delta": "+22%", "tone": "amber"},
        {"id": "w7", "label": "QR pull-payment trap", "pressure": 57, "delta": "+9%", "tone": "amber"},
        {"id": "w8", "label": "Investment / task scam", "pressure": 77, "delta": "+15%", "tone": "red"},
    ]
    try:
        client = await get_client()
        resp = await client.get(f"{KAVACH_URL}/api/threats/feed-status")
        if resp.status_code == 200:
            feed = resp.json()
            signals[0]["pressure"] = min(99, signals[0]["pressure"] + feed.get("new_threats_24h", 0) // 10)
    except Exception:
        pass
    return {"signals": signals}


# ── Atlas ─────────────────────────────────────────────────────────────

@app.get("/api/atlas")
async def atlas():
    """Scam Atlas — living threat wiki."""
    threats = [
        {
            "id": "pay-proof-001", "title": "Fake UPI payment proof", "surface": "payment trust",
            "status": "active", "summary": "Doctored screenshots claiming successful payment before goods are handed over.",
            "languages": ["Hindi", "English", "Tamil"], "redFlags": ["Screenshot instead of transaction ID", "Urgency to hand over goods", "Blurry or cropped proof"],
            "actions": ["Ask for UTR/transaction ID", "Verify in your bank app", "Report at cybercrime.gov.in"],
        },
        {
            "id": "qr-002", "title": "QR pull-payment trap", "surface": "payment trust",
            "status": "rising", "summary": "Victim is told scanning a QR will receive money, but it actually authorizes payment.",
            "languages": ["Hindi", "English", "Kannada", "Marathi"], "redFlags": ["QR to 'receive' money", "Unknown sender", "Marketplace context"],
            "actions": ["Never scan QR to receive payment", "UPI receive needs no QR scan", "Report the seller"],
        },
        {
            "id": "kyc-003", "title": "KYC update fraud", "surface": "identity trust",
            "status": "active", "summary": "SMS/WhatsApp claiming bank KYC is expiring. Links to fake portal that harvests credentials.",
            "languages": ["Hindi", "English", "Bengali", "Telugu"], "redFlags": ["Urgency ('24 hours')", "Link to non-.gov.in domain", "Asks for OTP/Aadhaar/PAN"],
            "actions": ["Banks never ask for KYC via SMS links", "Visit bank branch directly", "Call 1930 if data shared"],
        },
        {
            "id": "arrest-004", "title": "Digital arrest scam", "surface": "identity trust",
            "status": "rising", "summary": "Video call from 'CBI/police' claiming warrant. Demands money to 'clear charges'.",
            "languages": ["Hindi", "English"], "redFlags": ["Video call from 'officer'", "Demand for immediate payment", "Threat of arrest"],
            "actions": ["Police never call to demand money", "Hang up immediately", "Report at cybercrime.gov.in"],
        },
        {
            "id": "task-005", "title": "Task-based earning scam", "surface": "payment trust",
            "status": "active", "summary": "Telegram/WhatsApp group offering money for simple tasks. Initial payouts are real, then large 'investment' is demanded.",
            "languages": ["Hindi", "English", "Tamil", "Telugu"], "redFlags": ["Too good to be true returns", "'Investment' after initial tasks", "Crypto/UPI deposits required"],
            "actions": ["No legitimate job requires you to invest", "Stop immediately", "Save screenshots as evidence"],
        },
        {
            "id": "courier-006", "title": "Courier / delivery phishing", "surface": "link trust",
            "status": "active", "summary": "SMS claiming package held by customs. Link leads to fake payment page.",
            "languages": ["Hindi", "English", "Marathi"], "redFlags": ["Unknown tracking link", "Payment demanded for 'customs'", "SMS from random number"],
            "actions": ["Check courier website directly", "Never pay via SMS links", "Call courier helpline"],
        },
        {
            "id": "deepfake-007", "title": "Voice deepfake extortion", "surface": "identity trust",
            "status": "rising", "summary": "AI-cloned voice of family member calling for urgent money. Uses real voice samples from social media.",
            "languages": ["Hindi", "English"], "redFlags": ["Urgent call from 'family'", "Demand for immediate transfer", "Caller avoids video"],
            "actions": ["Hang up and call back on known number", "Set a family code word", "Report to police"],
        },
        {
            "id": "job-009", "title": "Fake job interview fee scam", "surface": "payment trust",
            "status": "rising", "summary": "Fraudulent recruiter demands payment for registration, training, or interview booking. Often impersonates TCS, Infosys, Wipro, or government PSUs.",
            "languages": ["Hindi", "English", "Telugu", "Tamil", "Kannada"],
            "redFlags": ["Payment demanded before interview", "Offer letter before interview", "WhatsApp/Telegram-only communication", "Gmail/Yahoo recruiter email", "Unrealistic salary"],
            "actions": ["No legitimate employer charges for interviews", "Verify on official company careers page", "Check recruiter on LinkedIn", "Report at cybercrime.gov.in"],
        },
        {
            "id": "lottery-008", "title": "KBC / lottery scam", "surface": "payment trust",
            "status": "active", "summary": "WhatsApp message claiming lottery win. Demands 'processing fee' or 'tax' payment.",
            "languages": ["Hindi", "English", "Bengali"], "redFlags": ["You didn't enter any lottery", "Processing fee demanded", "WhatsApp forward chain"],
            "actions": ["KBC never contacts winners via WhatsApp", "Never pay to claim a prize", "Block and report"],
        },
        {
            "id": "bank-freeze-010", "title": "Bank account freeze lure", "surface": "identity trust",
            "status": "active", "summary": "SMS/call claiming your account is frozen due to suspicious activity. Directs to fake portal or demands OTP to 'unfreeze'.",
            "languages": ["Hindi", "English", "Tamil", "Bengali"], "redFlags": ["Urgent 'frozen account' message", "OTP request via call/SMS", "Non-bank phone number"],
            "actions": ["Banks notify via official app, not SMS links", "Call your bank directly", "Never share OTP with callers"],
        },
        {
            "id": "refund-011", "title": "Refund support scam", "surface": "payment trust",
            "status": "active", "summary": "Caller claims to process a refund. Sends a UPI collect request instead, or installs remote-access app to drain account.",
            "languages": ["Hindi", "English", "Telugu"], "redFlags": ["Unexpected refund call", "UPI collect request for 'refund'", "Request to install AnyDesk/TeamViewer"],
            "actions": ["Refunds never require UPI collect approval", "Never install remote-access apps for strangers", "Hang up and check your order status directly"],
        },
        {
            "id": "electricity-012", "title": "Electricity disconnection scam", "surface": "identity trust",
            "status": "active", "summary": "SMS threatening electricity cutoff within hours unless payment made via a provided link or number.",
            "languages": ["Hindi", "English", "Marathi", "Tamil"], "redFlags": ["Immediate disconnection threat", "Payment via WhatsApp/UPI link", "Non-official sender ID"],
            "actions": ["Check with your electricity board app directly", "Official notices come by mail, not SMS", "Report the number to your provider"],
        },
        {
            "id": "pan-aadhaar-013", "title": "PAN / Aadhaar update scam", "surface": "identity trust",
            "status": "rising", "summary": "Message claiming PAN-Aadhaar link expiring. Link leads to phishing site harvesting personal documents.",
            "languages": ["Hindi", "English", "Bengali", "Gujarati"], "redFlags": ["Link to non-gov.in domain", "Asks to upload Aadhaar/PAN", "Urgency deadline"],
            "actions": ["PAN-Aadhaar linking only via incometax.gov.in", "Never upload documents via SMS links", "Call 1930 if documents shared"],
        },
        {
            "id": "loan-014", "title": "Loan approval advance-fee scam", "surface": "payment trust",
            "status": "active", "summary": "Pre-approved loan offered via WhatsApp/SMS. Small 'processing fee' demanded upfront. Money taken, loan never arrives.",
            "languages": ["Hindi", "English", "Telugu", "Kannada"], "redFlags": ["Unsolicited loan offer", "Processing/insurance fee before disbursement", "No official bank communication"],
            "actions": ["Legitimate banks never charge upfront for loans", "Verify with the bank directly", "Report at cybercrime.gov.in"],
        },
        {
            "id": "relative-015", "title": "Relative in distress voice scam", "surface": "identity trust",
            "status": "rising", "summary": "Call using AI voice clone or emotional acting, claiming a family member is in hospital/accident/police custody. Demands immediate transfer.",
            "languages": ["Hindi", "English"], "redFlags": ["Emotional urgency", "Unknown number claiming to be hospital/police", "Demand for immediate payment"],
            "actions": ["Hang up and call the family member directly", "Use your family code word", "Never transfer money based on a single call"],
        },
        {
            "id": "parcel-016", "title": "Parcel / customs fee scam", "surface": "payment trust",
            "status": "active", "summary": "Email/SMS about a parcel stuck in customs. Pay a small fee to release. Fee goes to scammer, parcel doesn't exist.",
            "languages": ["Hindi", "English", "Marathi"], "redFlags": ["Unexpected international parcel", "Small customs fee via UPI", "Tracking link to unknown domain"],
            "actions": ["India Post/customs never collect fees via UPI links", "Track parcels on official courier site", "Ignore if you didn't order anything international"],
        },
        {
            "id": "fake-care-017", "title": "Fake customer care number", "surface": "link trust",
            "status": "active", "summary": "Searching Google for 'XYZ customer care' returns scammer-planted fake numbers. Caller steals payment info or installs remote access.",
            "languages": ["Hindi", "English", "Tamil", "Telugu", "Kannada"], "redFlags": ["Customer care number from Google search (not official site)", "Asks to install AnyDesk/TeamViewer", "Requests payment to 'resolve' issue"],
            "actions": ["Only use numbers from official app/website", "Never install remote-access apps", "Real support never asks for UPI PIN or OTP"],
        },
        {
            "id": "otp-takeover-018", "title": "WhatsApp OTP takeover", "surface": "identity trust",
            "status": "active", "summary": "Message from 'friend' asking you to forward an OTP sent to your phone. OTP is actually WhatsApp verification code — forwarding it gives the attacker your account.",
            "languages": ["Hindi", "English", "Bengali", "Tamil"], "redFlags": ["Friend asking for OTP", "6-digit code message from WhatsApp", "Urgency in request"],
            "actions": ["Never share any OTP with anyone, even friends", "Friend's account may already be compromised", "Enable 2-step verification in WhatsApp"],
        },
        {
            "id": "sim-swap-019", "title": "SIM swap pressure scam", "surface": "identity trust",
            "status": "rising", "summary": "Scammer convinces telecom provider to transfer your SIM to their device. Then intercepts OTPs to drain bank accounts.",
            "languages": ["Hindi", "English"], "redFlags": ["Sudden loss of mobile signal", "Unexpected SIM deactivation message", "Call from 'telecom' asking for verification"],
            "actions": ["If signal lost unexpectedly, contact your provider immediately", "Set SIM lock PIN with your carrier", "Enable app-based 2FA (not SMS) for banking"],
        },
        {
            "id": "reward-020", "title": "Reward points redemption scam", "surface": "payment trust",
            "status": "active", "summary": "SMS claiming credit card reward points are expiring. Link leads to phishing site that harvests card details.",
            "languages": ["Hindi", "English", "Tamil"], "redFlags": ["Points 'expiring today'", "Link to non-bank domain", "Asks for card number/CVV"],
            "actions": ["Check rewards only via official bank app", "Banks never ask for CVV via SMS", "Call the number on back of your card to verify"],
        },
        {
            "id": "ekyc-video-021", "title": "eKYC video verification scam", "surface": "identity trust",
            "status": "rising", "summary": "Call asking for video KYC for bank/UPI. Records your face and Aadhaar on video to create fake accounts or apply for loans in your name.",
            "languages": ["Hindi", "English", "Telugu"], "redFlags": ["Unsolicited video KYC call", "Asks to show Aadhaar/PAN on camera", "Not initiated from within official app"],
            "actions": ["Video KYC only happens inside official bank app", "Never show documents on video call", "Report to bank if unsolicited"],
        },
        {
            "id": "fake-app-022", "title": "Fake app install scam", "surface": "link trust",
            "status": "active", "summary": "Link to download fake banking/government app. APK contains malware that reads SMS (OTPs) and steals credentials.",
            "languages": ["Hindi", "English", "Bengali", "Kannada"], "redFlags": ["APK download link (not from Play Store)", "App mimics bank/govt branding", "Requests SMS and accessibility permissions"],
            "actions": ["Only install apps from Google Play Store", "Check developer name matches official entity", "Never sideload APKs from links"],
        },
        {
            "id": "screen-share-023", "title": "Screen-share support scam", "surface": "payment trust",
            "status": "active", "summary": "Caller poses as bank/tech support and asks you to install AnyDesk, TeamViewer, or QuickSupport. Once connected, they make transactions from your phone.",
            "languages": ["Hindi", "English", "Telugu", "Tamil"], "redFlags": ["Request to install remote-access app", "Caller claims to be from bank IT", "Shows 'proof' of suspicious transactions"],
            "actions": ["No bank ever asks to install screen-sharing apps", "Uninstall AnyDesk/TeamViewer if a stranger asked you to install", "Call 1930 immediately if access was granted"],
        },
        {
            "id": "marketplace-024", "title": "Marketplace buyer refund scam", "surface": "payment trust",
            "status": "active", "summary": "Fake buyer on OLX/Facebook claims overpayment. Sends UPI collect request disguised as 'refund'. Seller approves and loses money.",
            "languages": ["Hindi", "English", "Marathi", "Telugu"], "redFlags": ["Buyer sends UPI collect for 'refund'", "Overpayment claim", "Pressure to approve quickly"],
            "actions": ["UPI collect = money going OUT, not coming in", "Never approve collect requests from strangers", "Use cash-on-delivery for local sales"],
        },
        {
            "id": "deepfake-celeb-025", "title": "Deepfake celebrity endorsement scam", "surface": "media trust",
            "status": "rising", "summary": "AI-generated video/audio of celebrities endorsing investment schemes, miracle cures, or government programs. Used to build false trust.",
            "languages": ["Hindi", "English", "Tamil", "Telugu"], "redFlags": ["Celebrity promoting unknown product/scheme", "Video only on social media (not official channels)", "Investment with guaranteed returns"],
            "actions": ["Verify endorsements on celebrity's official social media", "No investment has guaranteed returns", "Report fake videos to the platform"],
        },
    ]
    return {"threats": threats}


# ── Scan ──────────────────────────────────────────────────────────────

@app.post("/api/scan")
async def scan(req: ScanRequest):
    """Proxy scan to live Kavach API — gated by Decode Firewall."""
    # Gate text input
    text_block = _gate_text(req.content) if hasattr(req, 'content') and req.content else None
    if text_block:
        return text_block
    try:
        client = await get_client()
        if req.input_type == "link":
            resp = await client.post(f"{KAVACH_URL}/api/link/check", json={"url": req.content, "lang": "en"})
        else:
            resp = await client.post(f"{KAVACH_URL}/scan", json={"text": req.content, "lang": "en"})

        if resp.status_code == 200:
            data = resp.json()
            score = data.get("score", data.get("threat_score", 0))
            risk = data.get("risk_level", "UNKNOWN")
            signals = data.get("signals", [])

            if score >= 70:
                verdict = "SUSPICIOUS"
                action = "warn_and_verify"
            elif score >= 40:
                verdict = "UNCLEAR"
                action = "inform_and_suggest"
            else:
                verdict = "LOW_RISK"
                action = "inform_only"

            # Map verdict → trust state with reason codes
            if verdict == "SUSPICIOUS":
                trust_state = "blocked"
                reason_codes = [s.lower().replace(" ", "_") for s in signals[:3]] or ["scam_pattern_detected"]
            elif verdict == "UNCLEAR":
                trust_state = "inspect"
                reason_codes = ["assumption_unvalidated", "conflicting_sources"]
            else:
                trust_state = "trusted"
                reason_codes = ["verified_scan"]

            result = {
                "verdict": verdict,
                "risk_score": score,
                "surface": "link trust" if req.input_type == "link" else "general trust",
                "why_flagged": signals[:5] if signals else ["Analysis complete"],
                "action_eligibility": action,
                "engine": data.get("engine", "kavach"),
                "trust_state": trust_state,
                "reason_codes": reason_codes,
            }

            # Translate to user's language via local Sarvam model
            result = await translate_scan_result(result, req.lang)

            # Push high-risk alerts to Telegram (fire-and-forget)
            if score >= 70:
                snippet = req.content[:120].replace("*", "").replace("`", "")
                alert = (
                    f"🚨 *HIGH RISK scan on site*\n"
                    f"Score: {score}/100 | Surface: {result['surface']}\n"
                    f"Signals: {', '.join(signals[:3]) if signals else 'n/a'}\n"
                    f"Content: `{snippet}`"
                )
                import asyncio
                asyncio.ensure_future(_notify_telegram(alert))

            return result
    except Exception as e:
        logger.warning("Kavach proxy failed: %s", e)

    return {
        "verdict": "SERVICE_UNAVAILABLE",
        "risk_score": 0,
        "surface": "unknown",
        "why_flagged": ["Live analysis temporarily unavailable"],
        "action_eligibility": "retry",
    }


# ── Full scan (frontend primary endpoint, with translation) ───────────

@app.post("/api/scan/full")
async def scan_full(req: FullScanRequest):
    """Canonical local-first scan path used by the main frontend."""
    try:
        result = await _run_local_scan_contract(req.text, req.lang)
        if result["risk_score"] >= 70:
            snippet = req.text[:120].replace("*", "").replace("`", "")
            import asyncio

            asyncio.ensure_future(
                _notify_telegram(
                    f"🚨 *HIGH RISK scan*\n"
                    f"Score: {result['risk_score']}\n"
                    f"Type: {result.get('scam_type', 'unknown')}\n"
                    f"Content: `{snippet}`"
                )
            )
        return result
    except Exception as e:
        logger.warning("Full scan failed: %s", e)
        return {
            "verdict": "SERVICE_UNAVAILABLE",
            "risk_score": 0,
            "surface": "unknown",
            "why_flagged": ["Live analysis temporarily unavailable"],
            "action_eligibility": "retry",
        }


# ── Quick scan (pattern-only, fastest path) ───────────────────────────

@app.post("/api/scan/quick")
async def scan_quick(req: ScanRequest):
    """Fast pattern-only scan via Kavach — no AI, instant results."""
    try:
        client = await get_client()
        resp = await client.post(
            f"{KAVACH_URL}/scan",
            json={"text": req.content, "lang": "en"},
            timeout=3.0,
        )
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.warning("Quick scan failed: %s", e)
    return {"threat_score": 0, "risk_level": "UNKNOWN", "signals": [], "error": "unavailable"}


# ── Telegram alert endpoint ──────────────────────────────────────────

class AlertRequest(BaseModel):
    message: str = Field(..., max_length=4000)
    chat_id: Optional[str] = None


@app.post("/api/alert")
async def send_alert(req: AlertRequest):
    """Push a message through the Telegram bot. Admin use."""
    sent = await _notify_telegram(req.message, req.chat_id)
    return {"sent": sent, "channel": "telegram"}


# ── Text-to-Speech (Sarvam Bulbul / Bhashini fallback) ────────────────

import os as _os
_SARVAM_API_KEY = _os.environ.get("SARVAM_API_KEY", "")
_BHASHINI_USER_ID = _os.environ.get("BHASHINI_USER_ID", "")
_BHASHINI_API_KEY = _os.environ.get("BHASHINI_API_KEY", "")

# Also check secrets.env
if not _SARVAM_API_KEY:
    _secrets = Path.home() / ".mirrordna" / "secrets.env"
    if _secrets.exists():
        for _line in _secrets.read_text().splitlines():
            _line = _line.strip().removeprefix("export ").strip()
            if _line.startswith("SARVAM_API_KEY="):
                _SARVAM_API_KEY = _line.split("=", 1)[1].strip().strip('"').strip("'")
            elif _line.startswith("BHASHINI_USER_ID="):
                _BHASHINI_USER_ID = _line.split("=", 1)[1].strip().strip('"').strip("'")
            elif _line.startswith("BHASHINI_API_KEY="):
                _BHASHINI_API_KEY = _line.split("=", 1)[1].strip().strip('"').strip("'")

SARVAM_TTS_LANG_MAP = {
    "hi": "hi-IN", "bn": "bn-IN", "ta": "ta-IN", "te": "te-IN",
    "gu": "gu-IN", "kn": "kn-IN", "ml": "ml-IN", "mr": "mr-IN",
    "pa": "pa-IN", "or": "od-IN", "en": "en-IN",
}


class TTSRequest(BaseModel):
    text: str = Field(..., max_length=2000)
    lang: str = "en"


@app.post("/api/tts")
async def text_to_speech(req: TTSRequest):
    """Return the browser-native TTS path to keep Chetana local-first."""
    return {
        "audio": None,
        "format": "browser",
        "engine": "browser-speechsynthesis",
        "hint": "Use browser SpeechSynthesis API as fallback",
        "lang": req.lang,
        "text_length": len(req.text),
    }


@app.get("/api/tts/status")
async def tts_status():
    """Check which TTS engines are available."""
    return {
        "sarvam": False,
        "bhashini": False,
        "browser": True,
        "languages": list(SARVAM_TTS_LANG_MAP.keys()),
    }


# ── Replay ────────────────────────────────────────────────────────────

@app.get("/api/replay/{scan_id}")
def replay(scan_id: str):
    """Analyst replay timeline for a scan."""
    if len(scan_id) > 128 or "/" in scan_id:
        return {"error": "Invalid scan ID"}
    return {
        "scan_id": scan_id,
        "timeline": [
            "input_normalized",
            "surface_classified",
            "pattern_score_computed",
            "graph_lookup_completed",
            "witness_reviewed",
            "action_eligibility_returned",
        ],
    }


# ── Kavach thin proxies ──────────────────────────────────────────────

@app.post("/api/upi/check")
async def upi_check(req: UpiCheckRequest):
    """Proxy UPI ID check to Kavach."""
    try:
        client = await get_client()
        resp = await client.post(f"{KAVACH_URL}/api/upi/check", json={"upi_id": req.upi_id})
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.warning("Kavach UPI check failed: %s", e)
    return {"error": "UPI check temporarily unavailable", "upi_id": req.upi_id, "verdict": "SERVICE_UNAVAILABLE", "risk_score": 0}


@app.post("/api/phone/check")
async def phone_check(req: PhoneCheckRequest):
    """Proxy phone check to Kavach."""
    try:
        client = await get_client()
        resp = await client.post(f"{KAVACH_URL}/api/phone/check", json={"phone": req.phone})
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.warning("Kavach phone check failed: %s", e)
    return {"error": "Phone check temporarily unavailable", "phone": req.phone, "verdict": "SERVICE_UNAVAILABLE", "risk_score": 0}


@app.post("/api/apk/check")
async def apk_check_proxy(req: APKCheckRequest):
    """Proxy APK risk check to Kavach."""
    try:
        client = await get_client()
        resp = await client.post(f"{KAVACH_URL}/api/apk/check", json=req.dict())
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.warning("Kavach APK check failed: %s", e)
    return {"error": "APK check temporarily unavailable", "risk_level": "unknown", "reason_tags": ["service_error"]}


@app.post("/api/oracle/verify")
async def oracle_verify_proxy(req: OracleVerifyRequest):
    """Proxy Oracle media verification to Kavach."""
    try:
        client = await get_client()
        resp = await client.post(f"{KAVACH_URL}/api/oracle/verify", json=req.dict())
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.warning("Kavach Oracle verify failed: %s", e)
    return {"error": "Oracle verification temporarily unavailable", "state": "unable_to_verify", "trust_score": 0}


@app.post("/api/evidence/bundle")
async def evidence_bundle_proxy(req: dict):
    """Proxy evidence bundle generation to Kavach."""
    try:
        client = await get_client()
        resp = await client.post(f"{KAVACH_URL}/api/evidence/bundle", json=req)
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.warning("Kavach evidence bundle failed: %s", e)
    return {"error": "Evidence generation temporarily unavailable"}


@app.get("/api/kb/articles")
async def kb_articles():
    """Proxy KB article listing to Kavach."""
    try:
        client = await get_client()
        resp = await client.get(f"{KAVACH_URL}/api/kb/articles")
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.warning("Kavach KB articles failed: %s", e)
    return {"articles": [], "error": "KB temporarily unavailable"}


@app.get("/api/kb/article/{article_id}")
async def kb_article(article_id: str):
    """Proxy single KB article to Kavach."""
    if len(article_id) > 128 or "/" in article_id:
        return {"error": "Invalid article ID"}
    try:
        client = await get_client()
        resp = await client.get(f"{KAVACH_URL}/api/kb/article/{article_id}")
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.warning("Kavach KB article failed: %s", e)
    return {"error": "Article not found or KB unavailable"}


SUPPORTED_LANGUAGES = [
    {"code": "en", "name": "English", "status": "live"},
    {"code": "hi", "name": "Hindi", "status": "live"},
    {"code": "ta", "name": "Tamil", "status": "live"},
    {"code": "te", "name": "Telugu", "status": "live"},
    {"code": "kn", "name": "Kannada", "status": "live"},
    {"code": "ml", "name": "Malayalam", "status": "live"},
    {"code": "bn", "name": "Bengali", "status": "live"},
    {"code": "mr", "name": "Marathi", "status": "live"},
    {"code": "gu", "name": "Gujarati", "status": "live"},
    {"code": "pa", "name": "Punjabi", "status": "live"},
    {"code": "or", "name": "Odia", "status": "live"},
    {"code": "as", "name": "Assamese", "status": "live"},
    {"code": "ur", "name": "Urdu", "status": "coming_soon"},
    {"code": "mai", "name": "Maithili", "status": "coming_soon"},
    {"code": "sat", "name": "Santali", "status": "coming_soon"},
    {"code": "ks", "name": "Kashmiri", "status": "coming_soon"},
    {"code": "ne", "name": "Nepali", "status": "coming_soon"},
    {"code": "sd", "name": "Sindhi", "status": "coming_soon"},
    {"code": "kok", "name": "Konkani", "status": "coming_soon"},
    {"code": "doi", "name": "Dogri", "status": "coming_soon"},
    {"code": "mni", "name": "Manipuri", "status": "coming_soon"},
    {"code": "brx", "name": "Bodo", "status": "coming_soon"},
]


@app.get("/api/languages")
async def languages():
    """Return all 22 scheduled Indian languages with live/coming_soon status."""
    return {"languages": SUPPORTED_LANGUAGES, "live_count": 12, "total_count": 22}


@app.get("/api/radar/public")
async def radar_public():
    """Proxy public radar stats to Kavach."""
    try:
        client = await get_client()
        resp = await client.get(f"{KAVACH_URL}/api/radar/public")
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.warning("Kavach radar failed: %s", e)
    return {"error": "Radar temporarily unavailable", "scans_today": 0}


@app.get("/api/radar/rss", include_in_schema=False)
async def radar_rss():
    """RSS feed of live scam weather — for news aggregators and RSS readers."""
    try:
        client = await get_client()
        resp = await client.get(f"{KAVACH_URL}/api/weather")
        signals = resp.json().get("signals", []) if resp.status_code == 200 else []
    except Exception:
        signals = []

    now = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")
    items = ""
    for s in signals:
        tone_label = "🔴 HIGH ALERT" if s.get("tone") == "red" else "🟡 WARNING"
        items += f"""
  <item>
    <title>{tone_label}: {s.get('label','Unknown')} — Risk {s.get('pressure',0)}%</title>
    <link>https://chetana.activemirror.ai/#weather</link>
    <description>{s.get('label','Unknown')} scam activity is at {s.get('pressure',0)}% pressure ({s.get('delta','')}) in India. Check any suspicious message at chetana.activemirror.ai</description>
    <pubDate>{now}</pubDate>
    <guid isPermaLink="false">chetana-radar-{s.get('id','x')}-{datetime.now(timezone.utc).strftime('%Y%m%d')}</guid>
  </item>"""

    rss = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Chetana Scam Radar — India Live Threat Feed</title>
    <link>https://chetana.activemirror.ai</link>
    <description>Recent scam patterns, safety prompts, and reporting steps from Chetana.</description>
    <language>en-in</language>
    <lastBuildDate>{now}</lastBuildDate>
    <atom:link href="https://chetana.activemirror.ai/api/radar/rss" rel="self" type="application/rss+xml"/>
    <image>
      <url>https://chetana.activemirror.ai/favicon.ico</url>
      <title>Chetana Scam Radar</title>
      <link>https://chetana.activemirror.ai</link>
    </image>{items}
  </channel>
</rss>"""
    return Response(content=rss, media_type="application/rss+xml")


@app.get("/api/feeds/status")
async def feeds_status():
    """Proxy threat feed health to Kavach."""
    try:
        client = await get_client()
        resp = await client.get(f"{KAVACH_URL}/api/feeds/status")
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.warning("Kavach feeds status failed: %s", e)
    return {"error": "Feed status temporarily unavailable", "feeds": []}


# ── Chat assistant (keyword-matched, no LLM) ─────────────────────────

FAQ_ENTRIES = [
    {
        "keywords": ["scan", "check", "message", "link", "how does", "scanning", "analyze", "paste", "verify"],
        "reply": "Chetana helps you check suspicious messages, screenshots, QR requests, and payment proofs. Paste or upload what you received and it returns one of four evidence states: high risk, caution, needs review, or low signal, plus the safest next step.",
        "topic": "scanning",
    },
    {
        "keywords": ["consumer", "protect me", "personal", "individual", "user"],
        "reply": "For personal use, Chetana is a quick second opinion before you reply, pay, click, or hand over goods. It explains the risk in plain language and keeps official help steps visible if money already moved.",
        "topic": "consumer",
    },
    {
        "keywords": ["merchant", "business", "shop", "seller", "vendor", "fake payment", "screenshot"],
        "reply": "Merchant Protection defends against fake payment screenshots, customer impersonation, pickup fraud, and support scams. Staff can verify payment proofs before handing over goods.",
        "topic": "merchant",
    },
    {
        "keywords": ["nexus", "enterprise", "bank", "fintech", "institution", "analyst", "campaign"],
        "reply": "There is a partner lane for merchants and teams that want to add Chetana checks into support, payment, or checkout flows. The current public build is focused on the everyday user and the fake-payment-proof lane for shops.",
        "topic": "nexus",
    },
    {
        "keywords": ["weather", "pressure", "threat", "intelligence", "phishtank", "openphish", "urlhaus", "cert-in", "rbi"],
        "reply": "Recent scam patterns show the kinds of fraud Chetana is watching closely, so people can spot the same tricks before they get caught off guard.",
        "topic": "weather",
    },
    {
        "keywords": ["atlas", "wiki", "scam type", "threat type", "red flag", "what scam", "types of scam", "scam types"],
        "reply": "The scam guide breaks common fraud patterns into simple red flags and safer next actions. It covers things like fake KYC alerts, QR payment tricks, fake payment screenshots, parcel scams, job scams, and authority-pressure scams.",
        "topic": "atlas",
    },
    {
        "keywords": ["trust by design", "evidence ladder", "action eligibility", "privacy class", "governance"],
        "reply": "Trust by Design is Chetana's governance framework. It includes an Evidence Ladder (how claims are verified), Action Eligibility (inform, warn, suggest, verify, escalate, hold), Privacy Classes (browser-local first, edge next, cloud only with consent), and a Human Boundary principle.",
        "topic": "trust",
    },
    {
        "keywords": ["family", "elder", "share", "warning card", "code word", "parent", "grandparent", "senior"],
        "reply": "Family Shield creates share-safe warning cards that elders can understand. It supports family code words for verifying identity calls, elder-protection flows, and simple one-tap sharing of scam alerts to family members.",
        "topic": "family",
    },
    {
        "keywords": ["browser", "extension", "chrome", "guard", "real-time", "page scan"],
        "reply": "Browser Guard is a Chrome extension that scans links and pages in real time as you browse. It warns you before you land on known phishing or scam pages.",
        "topic": "browser",
    },
    {
        "keywords": ["whatsapp", "bot", "forward", "message forward"],
        "reply": "The WhatsApp Bot lets you forward suspicious messages directly to Chetana on WhatsApp. It analyzes the content and sends back an evidence state with the safest next step.",
        "topic": "whatsapp",
    },
    {
        "keywords": ["telegram", "telegram bot", "t.me", "chetna", "shield bot"],
        "reply": "You can check suspicious messages on Telegram via @chetnaShieldBot. Just forward any message, link, or screenshot and get an instant evidence state with the next safest move. Use /check to scan text, /scam for deep AI analysis, and /lang to switch between English and Hindi.",
        "topic": "telegram",
    },
    {
        "keywords": ["emergency", "report", "helpline", "1930", "cybercrime", "police", "complaint", "fraud report"],
        "reply": "In an emergency: call 1930 (India's national cybercrime helpline, available 24/7). You can also file a complaint at cybercrime.gov.in. If money was transferred, contact your bank immediately to request a freeze.",
        "topic": "emergency",
    },
    {
        "keywords": ["india", "privacy", "data", "consent", "made in"],
        "reply": "Chetana is built in India. Content is sent securely for analysis when needed, and the goal is to give you a plain-language answer without building profiles around you. It is an advisory tool, not a government service.",
        "topic": "privacy",
    },
    {
        "keywords": ["upi", "payment", "transaction", "money", "gpay", "phonepe", "paytm"],
        "reply": "To check a UPI transaction: use the UPI ID tab in the scanner to verify a UPI address, or paste the payment proof text/screenshot description. Never scan a QR code to 'receive' money. Always verify payments in your bank app before handing over goods.",
        "topic": "upi",
    },
    {
        "keywords": ["qr", "qr code", "scan qr"],
        "reply": "QR pull-payment traps are a rising scam. Scammers tell you to scan a QR to receive money, but it actually authorizes a payment FROM your account. Remember: you never need to scan a QR to receive money via UPI.",
        "topic": "qr",
    },
    {
        "keywords": ["kyc", "aadhaar", "pan", "bank update"],
        "reply": "KYC update fraud is one of the most active scams. Banks NEVER ask you to update KYC via SMS or WhatsApp links. If you get such a message, ignore it and visit your bank branch directly. If you already shared data, call 1930 immediately.",
        "topic": "kyc",
    },
    {
        "keywords": ["digital arrest", "cbi", "police call", "warrant"],
        "reply": "Digital arrest scams involve fake video calls from 'CBI' or 'police' claiming a warrant exists against you. This is always fake. Real police never demand money over video calls. Hang up immediately and report at cybercrime.gov.in.",
        "topic": "digital_arrest",
    },
    {
        "keywords": ["deepfake", "voice clone", "ai voice", "fake call"],
        "reply": "Voice deepfake scams use AI to clone a family member's voice and call you for urgent money. Always: hang up and call the person back on their known number. Set a family code word that only your family knows.",
        "topic": "deepfake",
    },
    {
        "keywords": ["language", "hindi", "tamil", "telugu", "kannada", "malayalam", "bengali", "marathi", "gujarati"],
        "reply": "Chetana works in all 22 scheduled Indian languages: English, Hindi, Tamil, Telugu, Kannada, Malayalam, Bengali, Marathi, Gujarati, Punjabi, Odia, Assamese, Urdu, Maithili, Santali, Kashmiri, Nepali, Sindhi, Konkani, Dogri, Manipuri, and Bodo.",
        "topic": "languages",
    },
    {
        "keywords": ["chetana", "what is", "about", "tell me", "who"],
        "reply": "Chetana is a living trust surface for Indian digital life. It protects consumers, merchants, and institutions against scams, fraud, and deception. It covers messages, links, payments, QR codes, and media across all 22 scheduled Indian languages. Made in India.",
        "topic": "about",
    },
    {
        "keywords": ["hello", "hi", "hey", "help", "start"],
        "reply": "Hi! I can help you with: checking suspicious messages or links, understanding scam types, learning about Chetana's trust tools, or finding emergency resources. What would you like to know?",
        "topic": "greeting",
    },
]


def _match_faq(message: str) -> list[dict]:
    """Return FAQ entries sorted by keyword match count, descending."""
    msg_lower = message.lower()
    scored = []
    for entry in FAQ_ENTRIES:
        hits = sum(1 for kw in entry["keywords"] if kw in msg_lower)
        if hits > 0:
            scored.append((hits, entry))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [s[1] for s in scored]


async def _fetch_kb_articles_for_chat(query: str) -> list[dict]:
    """Try to get KB articles from Kavach that match the query."""
    try:
        client = await get_client()
        resp = await client.get(f"{KAVACH_URL}/api/kb/articles")
        if resp.status_code == 200:
            data = resp.json()
            articles = data.get("articles", [])
            q_lower = query.lower()
            matched = []
            for art in articles:
                title = (art.get("title", "") or "").lower()
                tags = " ".join(art.get("tags", []) or []).lower()
                summary = (art.get("summary", "") or "").lower()
                if any(word in title or word in tags or word in summary for word in q_lower.split() if len(word) > 2):
                    matched.append(art)
            return matched[:3]
    except Exception:
        pass
    return []

def _parse_suggestions(reply: str) -> tuple[str, list[str]]:
    """Extract suggestion questions from LLM reply if present."""
    suggestions = []
    if "\n-" in reply or "\n•" in reply:
        lines = reply.split("\n")
        main_lines = []
        for line in lines:
            stripped = line.strip().lstrip("-•").strip()
            if line.strip().startswith(("-", "•")) and len(stripped) < 60 and "?" in stripped:
                suggestions.append(stripped)
            else:
                main_lines.append(line)
        if suggestions:
            reply = "\n".join(main_lines).strip()
    return reply, suggestions


OLLAMA_CHAT_SYSTEM = (
    "You are Chetana, India's AI scam protection assistant built by ActiveMirror. "
    "Answer questions about digital safety, scams, and fraud in India. "
    "Be helpful, concise, and culturally aware. "
    "If the user writes in an Indian language, respond in that same language."
)


async def _try_ollama_chat(message: str) -> str | None:
    """Try local Ollama with Sarvam multilingual model as chat fallback."""
    try:
        client = await get_client()
        resp = await client.post(
            "http://127.0.0.1:11434/api/generate",
            json={
                "model": "hf.co/Mungert/sarvam-m-GGUF:Q4_K_M",
                "prompt": message,
                "system": OLLAMA_CHAT_SYSTEM,
                "stream": False,
            },
            timeout=15.0,
        )
        if resp.status_code == 200:
            data = resp.json()
            reply = data.get("response", "").strip()
            if reply:
                return reply
        logger.warning("Ollama chat failed: %s", resp.status_code)
    except Exception as e:
        logger.debug("Ollama chat error: %s", e)
    return None


_SCAN_SIGNALS = re.compile(
    r"(https?://|www\.|\.com|\.in|\.tk|\.xyz|"
    r"upi://|@upi|@ybl|@paytm|@oksbi|@okaxis|@okicici|"
    r"\b\d{10}\b|"
    r"OTP|KYC|UPI|aadhaar|PAN\b|frozen|blocked|expired|verify|urgent|"
    r"arrested|warrant|customs|lottery|prize|reward|congratulations|"
    r"click here|update now|last chance|act now)",
    re.IGNORECASE,
)


def _looks_scannable(msg: str) -> bool:
    """Detect if message looks like suspicious content rather than a question."""
    hits = len(_SCAN_SIGNALS.findall(msg))
    return hits >= 2 or (len(msg) > 100 and hits >= 1)


async def _inline_scan(content: str) -> dict | None:
    """Run the canonical local-first scan contract for suspicious content."""
    try:
        return await _run_local_scan_contract(content, "en")
    except Exception as e:
        logger.debug("Inline scan failed: %s", e)
    return None


@app.post("/api/chat")
async def chat(req: ChatRequest):
    """Local-first chat with canonical inline scam checks."""
    message = req.message.strip()
    if not message:
        return {"reply": "Please type a message.", "articles": [], "suggestions": []}

    kb_articles = await _fetch_kb_articles_for_chat(message)
    scan_result = None

    # Auto-detect scannable content and scan inline
    if _looks_scannable(message):
        scan_result = await _inline_scan(message)

    if scan_result:
        guidance = scan_result.get("guidance", {})
        reply = "\n\n".join(
            [
                guidance["lead"],
                "Why this was flagged:\n" + "\n".join(f"- {item}" for item in guidance["why_it_was_flagged"][:3]),
                "What to do now:\n" + "\n".join(f"- {item}" for item in guidance["do_now"][:3]),
                "If you already acted:\n" + "\n".join(f"- {item}" for item in guidance["if_already_acted"][:2]),
            ]
        )
        suggestions = ["What should I do next?", "How to report fraud?", "Tell me about this scam type"]
        if scan_result.get("risk_score", 0) >= 70:
            snippet = message[:120].replace("*", "").replace("`", "")
            import asyncio

            asyncio.ensure_future(
                _notify_telegram(
                    f"🚨 *HIGH RISK via chat*\n"
                    f"Score: {scan_result['risk_score']}/100\n"
                    f"Type: {scan_result.get('scam_type', 'unknown')}\n"
                    f"`{snippet}`"
                )
            )
        return {
            "reply": reply,
            "articles": kb_articles,
            "suggestions": suggestions,
            "scan": scan_result,
        }

    llm_message = message
    if kb_articles:
        article_context = "\n\n".join(
            f"- {item['title']}: {item['reply'][:280]}" for item in kb_articles[:4]
        )
        llm_message = (
            "Use the context below if it helps, but answer directly and concisely.\n\n"
            f"{article_context}\n\nUser question:\n{message}"
        )

    reply = await _try_ollama_chat(llm_message)
    if reply:
        gated = gate_output(reply)
        reply = gated["text"]
        if gated["gated"]:
            logger.info("Ollama chat gate fired: %s", gated["flags"])
        reply, suggestions = _parse_suggestions(reply)
        if not suggestions:
            suggestions = ["How does scanning work?", "What scam types exist?", "How to report fraud?"]
        return {"reply": reply, "articles": kb_articles, "suggestions": suggestions[:4]}

    # Final fallback: keyword matching
    matches = _match_faq(message)
    if matches:
        reply = matches[0]["reply"]
        suggestions = ["How does scanning work?", "What scam types exist?", "How to report fraud?"]
    else:
        reply = (
            "I'm not sure about that specific topic, but I can help you check suspicious messages, "
            "understand scam types, or find emergency resources. "
            "Try asking about UPI scams, KYC fraud, digital arrest, or how scanning works."
        )
        suggestions = ["How does scanning work?", "What scam types exist?", "How to report fraud?", "Tell me about Chetana"]

    return {"reply": reply, "articles": kb_articles, "suggestions": suggestions}



# ── Live scam news ticker (proxied from MirrorRadar) ──────────
RADAR_FALLBACK_ITEMS = [
    {
        "title": "Never share OTPs or UPI PINs over calls, chats, or screen share",
        "summary": "Banks, police, courier agents, and support desks do not need your OTP or PIN to verify you.",
        "icon": "🔴",
    },
    {
        "title": "Pause on urgent KYC, courier, refund, and digital arrest messages",
        "summary": "Pressure, countdowns, and threats are common scam tactics designed to stop you from verifying first.",
        "icon": "⚡",
    },
    {
        "title": "If money was sent to a scammer, call 1930 immediately",
        "summary": "India's cybercrime helpline gives you the best recovery chance in the first hour after payment.",
        "icon": "🟠",
    },
    {
        "title": "Check suspicious links, APKs, QR codes, and collect requests before tapping",
        "summary": "Short links and fake payment screens are still among the most common consumer fraud entry points.",
        "icon": "🔴",
    },
    {
        "title": "Government and bank verifications should happen on official apps and sites",
        "summary": "Never complete KYC or account recovery from a random WhatsApp chat, Telegram message, or unknown call.",
        "icon": "⚡",
    },
]


@app.get("/api/radar/live")
async def radar_live():
    """Live scam/security news from MirrorRadar, constrained to fraud-safety headlines."""
    import httpx
    import re

    def _normalize_item(item: dict[str, Any]) -> dict[str, str] | None:
        title = re.sub(r"<[^>]+>", "", str(item.get("title") or item.get("text") or "")).strip()
        summary = re.sub(r"<[^>]+>", "", str(item.get("summary") or "")).strip()
        source = str(item.get("source") or "").strip().lower()
        body = f"{title} {summary}".lower()
        if not title:
            return None

        allow_keywords = {
            "scam", "fraud", "phish", "upi", "whatsapp", "telegram", "bank", "kyc",
            "otp", "arrest", "impersonat", "deepfake", "qr", "payment", "courier",
            "refund", "loan", "job scam", "lottery", "cyber fraud", "digital arrest",
            "cybercrime", "social engineering", "romance scam", "investment scam",
        }
        block_keywords = {
            "multi-agent", "agent ecosystem", "llm agent", "benchmark", "sleeper agent",
            "research paper", "arxiv", "dynatrust", "clawworm",
        }

        if source == "arxiv":
            return None
        if any(keyword in body for keyword in block_keywords):
            return None
        if not any(keyword in body for keyword in allow_keywords):
            return None

        return {
            "title": title[:140],
            "summary": summary[:220],
            "icon": "🔴",
        }

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get("http://127.0.0.1:8789/api/ticker")
            data = resp.json()
            items = data.get("items", data) if isinstance(data, dict) else data
            filtered = []
            seen_titles = set()
            for item in items:
                if not isinstance(item, dict):
                    continue
                normalized = _normalize_item(item)
                if not normalized:
                    continue
                dedupe_key = normalized["title"].lower()
                if dedupe_key in seen_titles:
                    continue
                seen_titles.add(dedupe_key)
                filtered.append(normalized)

            served = filtered[:20]
            fallback_used = False
            if len(served) < 3:
                fallback_used = True
                served = filtered[:6]
                seen_titles = {item["title"].lower() for item in served}
                for item in RADAR_FALLBACK_ITEMS:
                    if item["title"].lower() in seen_titles:
                        continue
                    served.append(item)
                    if len(served) >= 6:
                        break

            return {
                "items": served,
                "total": len(items),
                "scam_count": len(filtered),
                "fallback_used": fallback_used,
            }
    except Exception:
        return {
            "items": RADAR_FALLBACK_ITEMS,
            "total": 0,
            "scam_count": 0,
            "fallback_used": True,
            "error": "radar offline",
        }

# ── Batch UI translation via Sarvam ───────────────────────────
_TRANSLATE_CACHE: dict[str, dict[str, str]] = {}  # {lang: {en_text: translated}}

@app.post("/api/translate")
async def batch_translate(req: Request):
    body = await req.json()
    texts: list[str] = body.get("texts", [])
    lang: str = body.get("lang", "en")
    if lang == "en" or not texts:
        return {"translations": texts}
    # Check cache
    if lang not in _TRANSLATE_CACHE:
        _TRANSLATE_CACHE[lang] = {}
    cache = _TRANSLATE_CACHE[lang]
    results = []
    to_translate = []
    indices = []
    for i, text in enumerate(texts[:50]):  # cap at 50
        if text in cache:
            results.append(cache[text])
        else:
            results.append(None)
            to_translate.append(text)
            indices.append(i)
    # Batch translate missing ones
    if to_translate:
        target = LANG_NAMES.get(lang, lang)
        batch_prompt = "Translate each line to " + target + ". Return ONLY the translations, one per line, in the same order:\n" + "\n".join(to_translate)
        try:
            client = await get_client()
            resp = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={"model": SARVAM_MODEL, "prompt": batch_prompt, "stream": False},
                timeout=30.0,
            )
            if resp.status_code == 200:
                translated_lines = resp.json().get("response", "").strip().splitlines()
                for j, idx in enumerate(indices):
                    tr = translated_lines[j].strip() if j < len(translated_lines) else to_translate[j]
                    cache[to_translate[j]] = tr
                    results[idx] = tr
        except Exception as e:
            logger.warning("Batch translate failed (%s): %s", lang, e)
    # Fill any remaining Nones with originals
    for i in range(len(results)):
        if results[i] is None:
            results[i] = texts[i]
    return {"translations": results, "lang": lang}

# ── Anonymous scan analytics ──────────────────────────────────
import time as _time
import json as _json
_ANALYTICS_LOG = Path.home() / ".mirrordna" / "chetana" / "analytics.jsonl"
_ANALYTICS_LOG.parent.mkdir(parents=True, exist_ok=True)

_VALID_VERDICTS = {"SUSPICIOUS", "HIGH", "UNCLEAR", "MEDIUM", "LOW_RISK", "LOW", "SERVICE_UNAVAILABLE"}


def _legacy_scan_input_type(scan_type: Any) -> str:
    normalized = str(scan_type or "").strip().lower()
    if normalized == "qr":
        return "qr_image"
    if normalized == "media":
        return "screenshot"
    if normalized == "voice":
        return "mixed"
    return "text"


def _legacy_verdict_to_v0(verdict: Any, score: Any) -> tuple[str, str]:
    normalized = str(verdict or "").strip().upper()
    numeric_score: float | None = None
    try:
        if score is not None:
            numeric_score = float(score)
    except (TypeError, ValueError):
        numeric_score = None

    if normalized in {"SUSPICIOUS", "HIGH"}:
        return "high_risk", "high"
    if normalized in {"UNCLEAR", "MEDIUM"}:
        return "caution", "medium"
    if normalized in {"LOW_RISK", "LOW"}:
        return "low_signal", "low"
    if numeric_score is not None and numeric_score >= 70:
        return "high_risk", "high"
    if numeric_score is not None and numeric_score >= 40:
        return "caution", "medium"
    return "low_signal", "low"


def _legacy_session_id(body: dict[str, Any]) -> str:
    provided = str(body.get("session_id") or "").strip()
    if provided:
        return provided
    return f"legacy-session-{uuid4().hex[:12]}"

@app.post("/api/analytics/event")
async def log_event(req: Request):
    body = await req.json()
    allowed = {"event", "scan_type", "verdict", "score", "language"}
    entry = {k: v for k, v in body.items() if k in allowed}
    # Normalize invalid verdicts — clients sometimes send ERROR for failed scans
    v = str(entry.get("verdict", "")).upper()
    if v not in _VALID_VERDICTS:
        score = entry.get("score", 0)
        if isinstance(score, (int, float)) and score >= 70:
            entry["verdict"] = "SUSPICIOUS"
        elif isinstance(score, (int, float)) and score >= 40:
            entry["verdict"] = "UNCLEAR"
        else:
            entry["verdict"] = "LOW_RISK"
    entry["ts"] = _time.time()
    with open(_ANALYTICS_LOG, "a") as f:
        f.write(_json.dumps(entry) + "\n")

    if entry.get("event") == "scan":
        verdict, confidence_band = _legacy_verdict_to_v0(entry.get("verdict"), entry.get("score"))
        try:
            log_v0_event(
                V0EventInput(
                    event_name="scan_completed",
                    session_id=_legacy_session_id(body),
                    input_type=_legacy_scan_input_type(entry.get("scan_type")),
                    verdict=verdict,
                    confidence_band=confidence_band,
                    device_class="web",
                    language_hint=str(entry.get("language") or "").strip() or None,
                    metadata={
                        "analytics_source": "legacy_api",
                        "legacy_event": str(entry.get("event") or ""),
                        "legacy_scan_type": str(entry.get("scan_type") or ""),
                        "legacy_verdict": str(entry.get("verdict") or ""),
                    },
                )
            )
        except Exception as exc:  # pragma: no cover - analytics should not break scans
            logger.warning("Legacy analytics mirror failed: %s", exc)
    return {"ok": True}

@app.get("/api/stats/live")
async def live_stats():
    return build_live_stats_snapshot()


@app.get("/api/v1/analytics/summary")
async def analytics_summary(days: int = Query(default=14, ge=1, le=90)):
    """Return canonical Chetana usage analytics from the v0 event ledger."""
    summary = build_v0_analytics_summary(trailing_days=days)
    return summary.model_dump()


@app.get("/api/v1/rails", response_model=list[GamechangerOfficialRail])
async def gamechanger_rails():
    """Return the verified official recovery rails used by the gamechanger runtime."""
    return load_official_rails()


@app.post("/api/v1/analyze", response_model=GamechangerAnalyzeResponse)
async def gamechanger_analyze(req: GamechangerAnalyzeRequest):
    """Return the backend-first gamechanger analysis contract for mobile and partners."""
    return analyze_gamechanger_request(req)


@app.post("/api/v1/emergency", response_model=GamechangerEmergencyResponse)
async def gamechanger_emergency(req: GamechangerEmergencyRequest):
    """Return the state-based emergency recovery packet for active incidents."""
    return build_gamechanger_emergency_response(req)


@app.post("/api/v0/scan")
async def v0_scan(req: V0ScanInput):
    """Bounded Chetana v0 scan loop: scan -> explain -> share -> report -> learn."""
    result = analyze_v0_scan(req)
    result = await enrich_v0_verdict(result)
    return result.model_dump()


@app.post("/api/v0/evidence")
async def v0_evidence(req: V0EvidenceRequest):
    """Generate the compact evidence pack defined by the Chetana v0 build spec."""
    pack = build_evidence_pack(req)
    return {"evidence_pack": pack.model_dump()}


@app.post("/api/v0/events")
async def v0_events(req: V0EventInput):
    """Append an anonymous v0 analytics event to the Chetana event log."""
    event = log_v0_event(req)
    return {"ok": True, "event": event.model_dump()}


@app.post("/api/v0/trust/send-guard")
async def v0_send_guard(req: V0TrustRuntimeRequest):
    """Return the trust-runtime send decision for the current scan context."""
    assessment = assess_send_guard(req)
    return {"send_guard": assessment.model_dump()}


@app.post("/api/v0/trust/recovery")
async def v0_recovery(req: V0TrustRuntimeRequest):
    """Return the structured recovery contract for the current scan context."""
    packet = build_recovery_packet(req)
    return {"recovery_packet": packet.model_dump()}


@app.post("/api/v0/trust/merchant")
async def v0_merchant_release(req: V0TrustRuntimeRequest):
    """Return a merchant release decision for payment-proof or QR-driven disputes."""
    assessment = build_merchant_release_assessment(req)
    return {"merchant_release": assessment.model_dump() if assessment else None}


@app.post("/api/v0/trust/bundle")
async def v0_trust_bundle(req: V0TrustRuntimeRequest):
    """Return the promoted trust-runtime bundle: send guard, merchant guard, and recovery."""
    bundle = build_trust_bundle(req)
    return {"trust_bundle": bundle.model_dump()}

# ── Discovery / SEO routes (before catch-all) ────────────────────────
from fastapi.responses import PlainTextResponse, FileResponse as _FileResponse

@app.get("/robots.txt", include_in_schema=False)
async def robots_txt():
    return PlainTextResponse(
        "User-agent: *\nAllow: /\nSitemap: https://chetana.activemirror.ai/sitemap.xml\n",
        media_type="text/plain"
    )

@app.get("/sitemap.xml", include_in_schema=False)
async def sitemap_xml():
    xml = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://chetana.activemirror.ai/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>https://chetana.activemirror.ai/#consumer</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>
  <url><loc>https://chetana.activemirror.ai/#merchant</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>https://chetana.activemirror.ai/#weather</loc><changefreq>daily</changefreq><priority>0.9</priority></url>
  <url><loc>https://chetana.activemirror.ai/#atlas</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>https://chetana.activemirror.ai/#trust</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>
</urlset>"""
    return PlainTextResponse(xml, media_type="application/xml")

@app.get("/.well-known/security.txt", include_in_schema=False)
async def security_txt():
    return PlainTextResponse(
        "Contact: mailto:trust@activemirror.ai\n"
        "Preferred-Languages: en, hi\n"
        "Policy: https://chetana.activemirror.ai/privacy\n"
        "Canonical: https://chetana.activemirror.ai/.well-known/security.txt\n",
        media_type="text/plain"
    )


@app.get("/privacy", include_in_schema=False)
async def privacy_policy():
    from fastapi.responses import HTMLResponse as _HTML
    html = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy — Chetana</title>
  <meta name="description" content="Chetana privacy policy for the web app and scam-check flows.">
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.7; }
    h1 { font-size: 2rem; margin-bottom: .25rem; }
    h2 { font-size: 1.2rem; margin-top: 2rem; }
    .badge { display:inline-block; background:#d1fae5; color:#065f46; padding:2px 10px; border-radius:99px; font-size:.8rem; font-weight:600; margin-bottom:1.5rem; }
    a { color: #059669; }
    footer { margin-top:3rem; font-size:.85rem; color:#6b7280; border-top:1px solid #e5e7eb; padding-top:1rem; }
  </style>
</head>
<body>
  <h1>Chetana Privacy Policy</h1>
  <span class="badge">No data sold. No profiles built.</span>

  <h2>What Chetana is</h2>
  <p>Chetana is a private advisory tool for checking suspicious messages, QR requests, and payment proofs. It is built to help people in India slow down and choose a safer next step.</p>

  <h2>Data we process</h2>
  <p>When you submit content for scanning, that content is transmitted to our API at <code>chetana.activemirror.ai</code> over HTTPS. We process it to produce an advisory verdict and return it to you.</p>
  <ul>
    <li>We do <strong>not</strong> store your submissions after analysis completes.</li>
    <li>We do <strong>not</strong> link submissions to your identity, IP address, or device.</li>
    <li>We do <strong>not</strong> sell, share, or transfer your data to third parties.</li>
    <li>Submitted media is processed only for the scan flow and is not kept longer than needed for the response.</li>
    <li>Scan and chat analysis stay on Chetana's own infrastructure. We do not send that content to external LLM providers.</li>
  </ul>

  <h2>Telemetry</h2>
  <p>We collect aggregate, non-identifiable usage metrics (e.g., scan counts by type and language) to understand how Chetana is used and improve it. No personal identifiers are included.</p>

  <h2>Data residency</h2>
  <p>Chetana servers are operated in India. We aim to keep processing close to the user and avoid collecting more than is needed for the scan result.</p>

  <h2>Third-party services</h2>
  <p>We use ordinary web infrastructure such as hosting, TLS, and optional platform channels like Telegram. Chetana's own scan and chat analysis remain local to our infrastructure.</p>

  <h2>Children</h2>
  <p>Chetana is not directed at children under 13. We do not knowingly collect data from children.</p>

  <h2>Changes</h2>
  <p>We may update this policy. Significant changes will be noted at <a href="https://chetana.activemirror.ai/privacy">chetana.activemirror.ai/privacy</a>.</p>

  <h2>Contact</h2>
  <p>Questions: <a href="mailto:trust@activemirror.ai">trust@activemirror.ai</a></p>

  <footer>
    Last updated: March 2026 · Chetana is a product of ActiveMirror / MirrorDNA · Made in India
  </footer>
</body>
</html>"""
    return _HTML(content=html)


# ── Proxy endpoints to Kavach ──
import httpx
from fastapi import UploadFile, File, Form

# ── Decode Firewall Gate ──────────────────────────────────────────────────
_decode_fw_path = Path.home() / ".mirrordna" / "lib" / "decode_firewall.py"
if str(_decode_fw_path.parent) not in sys.path:
    sys.path.insert(0, str(_decode_fw_path.parent))
try:
    from decode_firewall import DecodeFirewall, TrustState
    _fw = DecodeFirewall()
    logger.info("Decode Firewall loaded")
except ImportError:
    _fw = None
    logger.warning("Decode Firewall not available — uploads ungated")


def _gate_upload(content: bytes, filename: str, declared_type: str) -> dict | None:
    """Run upload through Decode Firewall. Returns error dict if blocked, None if OK."""
    if not _fw:
        return None
    result = _fw.inspect(
        content,
        source_kind="upload",
        source_name=filename or "",
        declared_type=declared_type or "",
        context_policy="image_upload" if (declared_type or "").startswith("image/") else "default",
    )
    if result.trust_state == TrustState.BLOCKED.value:
        logger.warning("Decode Firewall BLOCKED upload %s: %s", filename, result.reason_codes)
        return {
            "error": "Upload blocked by security gate",
            "verdict": "BLOCKED",
            "risk_score": 100,
            "why_flagged": [f"Security: {rc}" for rc in result.reason_codes[:5]],
            "action_eligibility": "blocked",
            "trust_state": "blocked",
            "reason_codes": result.reason_codes,
            "firewall_object_id": result.object_id,
        }
    if result.trust_state == TrustState.INSPECT.value:
        logger.info("Decode Firewall INSPECT upload %s: %s", filename, result.reason_codes)
    return None


def _gate_text(text: str) -> dict | None:
    """Run text input through Decode Firewall. Returns error dict if blocked, None if OK."""
    if not _fw:
        return None
    result = _fw.inspect_text(text, source_kind="chat_input", context_policy="plaintext")
    if result.trust_state == TrustState.BLOCKED.value:
        logger.warning("Decode Firewall BLOCKED text input: %s", result.reason_codes)
        return {
            "error": "Input blocked by security gate",
            "verdict": "BLOCKED",
            "risk_score": 100,
            "why_flagged": [f"Security: {rc}" for rc in result.reason_codes[:5]],
            "action_eligibility": "blocked",
            "trust_state": "blocked",
            "reason_codes": result.reason_codes,
        }
    return None


# ── Firewall API endpoints ────────────────────────────────────────────────

@app.post("/api/decode-firewall/inspect")
async def fw_inspect(file: UploadFile = File(None), text: str = Form(None)):
    """Inspect arbitrary content through the Decode Firewall."""
    if not _fw:
        return {"error": "Decode Firewall not loaded"}
    if file:
        content = await file.read()
        result = _fw.inspect(content, source_kind="api_inspect", source_name=file.filename or "", declared_type=file.content_type or "")
    elif text:
        result = _fw.inspect_text(text, source_kind="api_inspect")
    else:
        return {"error": "Provide file or text"}
    return result.to_dict()

@app.post("/api/decode-firewall/release")
async def fw_release(object_id: str = Form(...), target: str = Form(...)):
    """Release a quarantined object."""
    if not _fw:
        return {"error": "Decode Firewall not loaded"}
    return _fw.release(object_id, target)

@app.get("/api/decode-firewall/object/{object_id}")
async def fw_object(object_id: str):
    """Get stored analysis for an object."""
    if not _fw:
        return {"error": "Decode Firewall not loaded"}
    obj = _fw.show(object_id)
    return obj or {"error": "Not found"}

@app.get("/api/decode-firewall/events/{object_id}")
async def fw_events(object_id: str):
    """Get event trail for an object."""
    if not _fw:
        return {"error": "Decode Firewall not loaded"}
    return _fw.events(object_id)


# ── Upload endpoints (now gated) ─────────────────────────────────────────

@app.post("/api/media/analyze")
async def proxy_media_analyze(file: UploadFile = File(...), lang: str = Form("en")):
    """Proxy image/video analysis to Kavach — gated by Decode Firewall."""
    content = await file.read()
    block = _gate_upload(content, file.filename, file.content_type)
    if block:
        return block
    async with httpx.AsyncClient(timeout=MEDIA_PROXY_TIMEOUT) as client:
        resp = await client.post(
            f"{KAVACH_URL}/api/media/analyze",
            files={"file": (file.filename, content, file.content_type)},
            data={"lang": lang},
        )
    return resp.json()

@app.post("/api/voice/analyze")
async def proxy_voice_analyze(file: UploadFile = File(...), lang: str = Form("en")):
    """Voice/audio analysis: Whisper transcription + scam pattern matching + Kavach proxy."""
    content = await file.read()
    block = _gate_upload(content, file.filename, file.content_type)
    if block:
        return block

    transcript = ""
    whisper_signals: list[str] = []
    whisper_score = 0

    # Step 1: Local Whisper transcription on M4
    try:
        import tempfile, os
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        try:
            import mlx_whisper
            result = mlx_whisper.transcribe(tmp_path, language=lang if lang != "en" else None)
            transcript = result.get("text", "").strip()
        except Exception:
            import whisper as openai_whisper
            model = openai_whisper.load_model("tiny")
            result = model.transcribe(tmp_path, language=lang if lang != "en" else None)
            transcript = result.get("text", "").strip()
        os.unlink(tmp_path)
    except Exception as e:
        logger.warning("Whisper transcription failed: %s", e)

    # Step 2: Pattern match against known scam call scripts
    if transcript and len(transcript) > 10:
        transcript_lower = transcript.lower()
        CALL_SCRIPTS = [
            (r"(cbi|police|customs|narcotics).{0,30}(warrant|arrest|case|summon)", "Matches known digital arrest call script", 30),
            (r"(your.{0,15}account|aapka.{0,15}account).{0,30}(block|suspend|freez|band)", "Account freeze threat pattern", 25),
            (r"(share|send|batao|bhej).{0,15}(otp|pin|password|mpin)", "OTP/credential harvesting in call", 30),
            (r"(transfer|send|bhej).{0,20}(money|paisa|amount|payment).{0,20}(now|immediately|turant|abhi)", "Urgent money demand in call", 25),
            (r"(do not|mat).{0,15}(tell|inform|batao|bolo).{0,15}(anyone|family|police|kisi)", "Caller demanding secrecy", 20),
            (r"(fine|penalty|challan|fee).{0,20}(pay|deposit|transfer)", "Fake fine/penalty demand", 20),
            (r"(parcel|courier|package).{0,30}(drug|illegal|seize|confiscat)", "Customs parcel scam script", 25),
            (r"(insurance|policy|lic).{0,20}(matured|bonus|lapsed).{0,20}(pay|fee|charge)", "Fake insurance call", 20),
            (r"(lottery|prize|winner|jeet).{0,20}(won|mila|congratulat)", "Lottery/prize call", 25),
            (r"(install|download).{0,15}(anydesk|teamviewer|quicksupport)", "Remote access app install request", 30),
        ]
        import re as _re
        for pattern, signal, weight in CALL_SCRIPTS:
            if _re.search(pattern, transcript_lower):
                whisper_signals.append(signal)
                whisper_score += weight
        whisper_score = min(whisper_score, 100)

    # Step 3: Also proxy to Kavach for its analysis
    kavach_result = {}
    try:
        async with httpx.AsyncClient(timeout=MEDIA_PROXY_TIMEOUT) as client:
            resp = await client.post(
                f"{KAVACH_URL}/api/voice/analyze",
                files={"file": (file.filename, content, file.content_type)},
                data={"lang": lang},
            )
            kavach_result = resp.json()
    except Exception:
        pass

    # Step 4: Merge results — take the higher risk
    kavach_score = kavach_result.get("risk_score", kavach_result.get("score", 0))
    final_score = max(whisper_score, kavach_score)
    final_verdict = "SUSPICIOUS" if final_score >= 70 else "UNCLEAR" if final_score >= 40 else "LOW_RISK"
    all_signals = whisper_signals + (kavach_result.get("signals", []) or kavach_result.get("red_flags", []) or [])

    return {
        "verdict": final_verdict,
        "risk_score": final_score,
        "score": final_score,
        "signals": all_signals,
        "transcript": transcript[:2000] if transcript else None,
        "transcript_length": len(transcript),
        "whisper_score": whisper_score,
        "kavach_score": kavach_score,
        "explanation": f"Audio transcribed ({len(transcript)} chars) and checked against known scam call patterns." if transcript else "Could not transcribe audio.",
        "action_eligibility": "report" if final_score >= 70 else "caution" if final_score >= 40 else "monitor",
    }

@app.post("/api/media/ocr")
async def proxy_media_ocr(file: UploadFile = File(...), lang: str = Form("en")):
    """OCR: extract text from screenshot/image, then scan — gated by Decode Firewall."""
    content = await file.read()
    block = _gate_upload(content, file.filename, file.content_type)
    if block:
        return block
    async with httpx.AsyncClient(timeout=MEDIA_PROXY_TIMEOUT) as client:
        ocr_resp = await client.post(
            f"{KAVACH_URL}/api/extract-text",
            files={"file": (file.filename, content, file.content_type)},
        )
        ocr_data = ocr_resp.json()
        extracted = ocr_data.get("text", "").strip()

        # Gate OCR-extracted text (prompt injection defense)
        if extracted:
            text_block = _gate_text(extracted)
            if text_block:
                text_block["ocr_text"] = extracted[:200]
                text_block["ocr_blocked"] = True
                return text_block

        if not extracted:
            df_resp = await client.post(
                f"{KAVACH_URL}/api/media/analyze",
                files={"file": (file.filename, content, file.content_type)},
                data={"lang": lang},
            )
            return df_resp.json()
        scan_resp = await client.post(
            f"{KAVACH_URL}/api/scan/full",
            json={"text": extracted, "lang": lang},
        )
        result = scan_resp.json()
        result["ocr_text"] = extracted[:500]
        result["ocr_method"] = ocr_data.get("method", "unknown")
        return result

@app.post("/api/media/card")
async def proxy_media_card(file: UploadFile = File(...), caption: str = Form(default="")):
    """Generate a shareable verdict card — gated by Decode Firewall."""
    content = await file.read()
    block = _gate_upload(content, file.filename, file.content_type)
    if block:
        return block
    async with httpx.AsyncClient(timeout=MEDIA_PROXY_TIMEOUT) as client:
        resp = await client.post(
            f"{KAVACH_URL}/scan_media_card",
            files={"file": (file.filename, content, file.content_type)},
            data={"caption": caption},
        )
    if resp.headers.get("content-type", "").startswith("image/"):
        from fastapi.responses import Response
        return Response(content=resp.content, media_type=resp.headers.get("content-type", "image/svg+xml"))
    return resp.json()

@app.post("/api/link/check")
async def proxy_link_check(request: Request):
    """Proxy link check to Kavach."""
    body = await request.json()
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(f"{KAVACH_URL}/api/link/check", json=body)
    return resp.json()

## Duplicate /api/upi/check, /api/phone/check, /terms, /privacy routes removed.
## Canonical versions are defined earlier in this file (lines ~731-754 and ~1586).


# ── Serve frontend static files at root (MUST be after all API routes) ──
if frontend_dist.exists():
    from fastapi.responses import FileResponse

    @app.get("/{path:path}")
    async def serve_spa(path: str):
        """Serve static files or fall back to index.html for SPA routing."""
        file = frontend_dist / path
        if file.is_file():
            # Hashed assets get long cache, everything else no-cache
            headers = {"Cache-Control": "public, max-age=31536000, immutable"} if "/assets/" in str(file) else {"Cache-Control": "no-cache, no-store, must-revalidate"}
            return FileResponse(file, headers=headers)
        return FileResponse(frontend_dist / "index.html", headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
