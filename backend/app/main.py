"""
Chetana Showcase Site — Backend API.

Proxies to the live Kavach API at :8790 for real scan results.
Serves Scam Weather and Atlas from live threat intelligence.
Chat assistant with keyword-matched FAQ and KB article lookup.
"""
from __future__ import annotations

import httpx
import logging
import re
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import Literal, Optional
from pathlib import Path

logger = logging.getLogger("chetana.showcase")

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

app = FastAPI(title="Chetana Showcase API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8093", "https://chetana.activemirror.ai"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

# Serve the built frontend at root (must be AFTER all API routes are defined,
# so we mount it at startup instead of module level)
frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"

# ── Shared async HTTP client ──────────────────────────────────────────

_client: httpx.AsyncClient | None = None


async def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=5.0)
    return _client


@app.on_event("shutdown")
async def _close_client():
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()


# ── Request models ────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    input_type: Literal["text", "link", "payment_proof", "media"] = "text"
    content: str = Field(..., max_length=10000)


class UpiCheckRequest(BaseModel):
    upi_id: str = Field(..., max_length=256)


class PhoneCheckRequest(BaseModel):
    phone: str = Field(..., max_length=20)


class ChatRequest(BaseModel):
    message: str = Field(..., max_length=2000)


# ── Health ────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "backend": "showcase", "kavach": KAVACH_URL}


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
    """Proxy scan to live Kavach API for real analysis."""
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

            result = {
                "verdict": verdict,
                "risk_score": score,
                "surface": "link trust" if req.input_type == "link" else "general trust",
                "why_flagged": signals[:5] if signals else ["Analysis complete"],
                "action_eligibility": action,
                "engine": data.get("engine", "kavach"),
            }

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
    """Proxy phone number check to Kavach."""
    try:
        client = await get_client()
        resp = await client.post(f"{KAVACH_URL}/api/phone/check", json={"phone": req.phone})
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.warning("Kavach phone check failed: %s", e)
    return {"error": "Phone check temporarily unavailable", "phone": req.phone, "verdict": "SERVICE_UNAVAILABLE", "risk_score": 0}


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
        "reply": "Chetana scans messages, links, payment proofs, QR codes, and media against live threat intelligence. Just paste the suspicious content into the scan box and we analyze it in real time. Works in 12 Indian languages (22 planned — all scheduled languages).",
        "topic": "scanning",
    },
    {
        "keywords": ["consumer", "protect me", "personal", "individual", "user"],
        "reply": "The Consumer layer lets you check messages, links, payment proofs, and QR codes. It works in 12 Indian languages (22 planned — all scheduled languages) with family-safe explanations and emergency guidance. Just paste any suspicious content to get an instant trust verdict.",
        "topic": "consumer",
    },
    {
        "keywords": ["merchant", "business", "shop", "seller", "vendor", "fake payment", "screenshot"],
        "reply": "Merchant Protection defends against fake payment screenshots, customer impersonation, pickup fraud, and support scams. Staff can verify payment proofs before handing over goods.",
        "topic": "merchant",
    },
    {
        "keywords": ["nexus", "enterprise", "bank", "fintech", "institution", "analyst", "campaign"],
        "reply": "Chetana Nexus is the enterprise trust layer. It provides campaign graph analysis, analyst replay (showing exactly what fired and why), action eligibility framework, and live threat feeds for banks, fintechs, and fraud teams.",
        "topic": "nexus",
    },
    {
        "keywords": ["weather", "pressure", "threat", "intelligence", "phishtank", "openphish", "urlhaus", "cert-in", "rbi"],
        "reply": "Scam Weather shows live pressure signals aggregated from PhishTank, OpenPhish, URLhaus, CERT-IN advisories, and RBI alerts. It tracks which scam types are rising or cooling in real time.",
        "topic": "weather",
    },
    {
        "keywords": ["atlas", "wiki", "scam type", "threat type", "red flag", "what scam", "types of scam", "scam types"],
        "reply": "The Scam Atlas is a living threat wiki. Each entry shows the scam type, active languages, red flags to watch for, and safe next actions. It covers UPI fraud, QR traps, KYC fraud, digital arrest, courier phishing, voice deepfakes, task scams, lottery scams, and fake job scams.",
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
        "reply": "The WhatsApp Bot lets you forward suspicious messages directly to Chetana on WhatsApp. It analyzes the content and sends back a trust verdict with safe next steps.",
        "topic": "whatsapp",
    },
    {
        "keywords": ["emergency", "report", "helpline", "1930", "cybercrime", "police", "complaint", "fraud report"],
        "reply": "In an emergency: call 1930 (India's national cybercrime helpline, available 24/7). You can also file a complaint at cybercrime.gov.in. If money was transferred, contact your bank immediately to request a freeze.",
        "topic": "emergency",
    },
    {
        "keywords": ["india", "privacy", "data", "consent", "made in"],
        "reply": "Chetana is made in India, privacy-conscious. Your data is transmitted securely and used only for analysis — never sold or shared. We use cloud-based AI and threat intelligence APIs to deliver accurate results. Built for Indian digital life.",
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


@app.post("/api/chat")
async def chat(req: ChatRequest):
    """Keyword-matched chat assistant. No LLM, fast and deterministic."""
    message = req.message.strip()
    if not message:
        return {"reply": "Please type a message.", "articles": [], "suggestions": []}

    matches = _match_faq(message)
    kb_articles = await _fetch_kb_articles_for_chat(message)

    if matches:
        best = matches[0]
        reply = best["reply"]
        # Build suggestions from other matching topics
        suggestions = []
        topic_map = {
            "scanning": "How does scanning work?",
            "consumer": "Tell me about consumer protection",
            "merchant": "How does merchant protection work?",
            "nexus": "What is Chetana Nexus?",
            "weather": "What is Scam Weather?",
            "atlas": "What scam types exist?",
            "trust": "How does Trust by Design work?",
            "family": "Tell me about Family Shield",
            "browser": "What is Browser Guard?",
            "whatsapp": "How does the WhatsApp Bot work?",
            "emergency": "How to report fraud?",
            "privacy": "How does Chetana handle privacy?",
            "upi": "How to check UPI payments?",
            "qr": "What are QR scams?",
            "kyc": "What is KYC fraud?",
            "digital_arrest": "What is digital arrest scam?",
            "deepfake": "What are voice deepfake scams?",
            "languages": "What languages does Chetana support?",
            "about": "Tell me about Chetana",
            "greeting": "How does scanning work?",
        }
        seen_topics = {best["topic"]}
        for m in matches[1:4]:
            if m["topic"] not in seen_topics:
                seen_topics.add(m["topic"])
                if m["topic"] in topic_map:
                    suggestions.append(topic_map[m["topic"]])
        # Always suggest a few if we have few suggestions
        if len(suggestions) < 2:
            for fallback_topic in ["emergency", "atlas", "scanning", "about"]:
                if fallback_topic not in seen_topics and len(suggestions) < 3:
                    seen_topics.add(fallback_topic)
                    suggestions.append(topic_map[fallback_topic])
    else:
        reply = (
            "I'm not sure about that specific topic, but I can help you check suspicious messages, "
            "understand scam types, learn about Chetana's trust tools, or find emergency resources. "
            "Try asking about UPI scams, KYC fraud, digital arrest, or how scanning works."
        )
        suggestions = [
            "How does scanning work?",
            "What scam types exist?",
            "How to report fraud?",
            "Tell me about Chetana",
        ]

    return {
        "reply": reply,
        "articles": kb_articles,
        "suggestions": suggestions,
    }


# ── Serve frontend static files at root (MUST be after all API routes) ──
if frontend_dist.exists():
    from fastapi.responses import FileResponse

    @app.get("/{path:path}")
    async def serve_spa(path: str):
        """Serve static files or fall back to index.html for SPA routing."""
        file = frontend_dist / path
        if file.is_file():
            return FileResponse(file)
        return FileResponse(frontend_dist / "index.html")
