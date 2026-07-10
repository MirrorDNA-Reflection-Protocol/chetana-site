"""
Chetana WhatsApp Bot — Direct Meta Cloud API webhook handler.

No BSP, no Jugalbandi, no Kafka. Just:
  User forwards message → Meta webhook → v0 scan → reply.

Env vars needed:
  WHATSAPP_VERIFY_TOKEN   — any string you set in Meta dashboard
  WHATSAPP_ACCESS_TOKEN   — permanent token from Meta Business
  WHATSAPP_PHONE_NUMBER_ID — phone number ID from Meta dashboard

Mount in main.py:
  from app.whatsapp_webhook import whatsapp_router
  app.include_router(whatsapp_router)
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import time
from typing import Any

import httpx
from fastapi import APIRouter, Request, Response, Query

from app.v0_runtime import V0ScanInput, V0Verdict, analyze_scan, log_event, V0EventInput

logger = logging.getLogger("chetana.whatsapp")

whatsapp_router = APIRouter(prefix="/api/webhook", tags=["whatsapp"])

# ── Config ───────────────────────────────────────────────────────────

VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN", "chetana-verify-2026")
ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN", "")
PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
META_API = "https://graph.facebook.com/v21.0"

# Rate limiting: max 5 scans per phone per minute
_rate_map: dict[str, list[float]] = {}
RATE_LIMIT = 5
RATE_WINDOW = 60


# ── Webhook verification (GET) ──────────────────────────────────────

@whatsapp_router.get("/whatsapp")
async def verify_webhook(
    mode: str = Query(None, alias="hub.mode"),
    token: str = Query(None, alias="hub.verify_token"),
    challenge: str = Query(None, alias="hub.challenge"),
):
    """Meta sends a GET to verify the webhook URL."""
    if mode == "subscribe" and token == VERIFY_TOKEN:
        logger.info("Webhook verified")
        return Response(content=challenge, media_type="text/plain")
    logger.warning(f"Webhook verification failed: mode={mode}")
    return Response(content="Forbidden", status_code=403)


# ── Webhook receiver (POST) ─────────────────────────────────────────

@whatsapp_router.post("/whatsapp")
async def receive_message(request: Request):
    """Receive inbound WhatsApp messages from Meta Cloud API."""
    body = await request.json()

    # Meta sends various webhook types; we only care about messages
    entries = body.get("entry", [])
    for entry in entries:
        for change in entry.get("changes", []):
            value = change.get("value", {})
            messages = value.get("messages", [])
            for msg in messages:
                await _handle_message(msg, value)

    # Always return 200 to Meta (they retry on non-200)
    return {"status": "ok"}


# ── Message handler ─────────────────────────────────────────────────

async def _handle_message(msg: dict, value: dict):
    """Process a single inbound message."""
    msg_type = msg.get("type", "")
    sender = msg.get("from", "")
    msg_id = msg.get("id", "")

    if not sender:
        return

    # Rate check
    if _is_rate_limited(sender):
        await _send_reply(
            sender,
            "⏳ Too many checks in a short time. Please wait a minute and try again."
        )
        return

    # Extract text based on message type
    text = ""
    if msg_type == "text":
        text = msg.get("text", {}).get("body", "")
    elif msg_type in ("image", "document"):
        # For now, acknowledge media but ask for text
        await _send_reply(
            sender,
            "📸 I can't scan images on WhatsApp yet — please *copy and paste* "
            "the suspicious text here and I'll check it for you."
        )
        return
    elif msg_type == "audio":
        await _send_reply(
            sender,
            "🎤 I can't process voice messages on WhatsApp yet — please "
            "type or paste the suspicious message text."
        )
        return
    else:
        # Reactions, stickers, contacts, etc.
        return

    text = text.strip()
    if not text:
        return

    # Handle greetings / short messages
    if len(text) < 10 and text.lower() in (
        "hi", "hello", "hey", "help", "start", "namaste",
        "hii", "helo", "hola", "/start",
    ):
        await _send_welcome(sender)
        return

    # ── Run the scan ─────────────────────────────────────────────
    logger.info(f"Scan request from {sender[-4:]}: {len(text)} chars")

    try:
        verdict = analyze_scan(V0ScanInput(
            input_type="text",
            text=text,
            source_name="whatsapp",
            session_id=f"wa-{sender[-6:]}",
        ))
        reply = _format_verdict(verdict)
    except Exception as e:
        logger.error(f"Scan failed: {e}")
        reply = (
            "⚠️ Sorry, I couldn't check that message right now. "
            "Please try again in a moment.\n\n"
            "If you think you've been scammed, call *1930* immediately."
        )

    await _send_reply(sender, reply)

    # Log the event
    try:
        log_event(V0EventInput(
            event="scan_completed",
            session_id=f"wa-{sender[-6:]}",
            device_class="android_phone",
            input_type="text",
            scan_id=verdict.scan_id if 'verdict' in dir() else None,
        ))
    except Exception:
        pass  # Non-critical


# ── Verdict formatter ───────────────────────────────────────────────

VERDICT_EMOJI = {
    "high_risk": "🔴",
    "caution": "🟡",
    "needs_review": "🟠",
    "low_signal": "🟢",
}

VERDICT_LABEL = {
    "high_risk": "HIGH RISK — Likely a Scam",
    "caution": "CAUTION — Suspicious Signs",
    "needs_review": "UNCLEAR — Needs More Context",
    "low_signal": "LOW RISK — Appears Okay",
}


def _format_verdict(v: V0Verdict) -> str:
    """Format a V0Verdict into a WhatsApp-friendly plain text reply."""
    emoji = VERDICT_EMOJI.get(v.verdict, "⚪")
    label = VERDICT_LABEL.get(v.verdict, v.verdict.upper())

    lines = [
        f"{emoji} *{label}*",
        "",
        f"_{v.guidance.lead}_",
        "",
    ]

    # Why flagged
    if v.guidance.why_it_was_flagged:
        lines.append("*Why:*")
        for reason in v.guidance.why_it_was_flagged[:3]:
            lines.append(f"• {reason}")
        lines.append("")

    # What to do now
    if v.guidance.do_now:
        lines.append("*Do now:*")
        for step in v.guidance.do_now[:3]:
            lines.append(f"✅ {step}")
        lines.append("")

    # What NOT to do
    if v.guidance.do_not_do and v.verdict in ("high_risk", "caution"):
        lines.append("*Don't:*")
        for step in v.guidance.do_not_do[:2]:
            lines.append(f"❌ {step}")
        lines.append("")

    # Emergency info for high risk
    if v.verdict == "high_risk":
        lines.extend([
            "─────────────",
            "🚨 *Already paid or shared details?*",
            "1. Call your bank NOW to freeze the transaction",
            "2. Call *1930* (National Cyber Crime Helpline)",
            "3. File report: cybercrime.gov.in",
            "─────────────",
            "",
        ])

    # Safe next step
    if v.safe_next_step:
        lines.append(f"👉 {v.safe_next_step}")
        lines.append("")

    lines.append("_Forward any suspicious message to check it._")
    lines.append("— Chetana by Active Mirror")

    return "\n".join(lines)


# ── Welcome message ─────────────────────────────────────────────────

async def _send_welcome(phone: str):
    """Send the welcome / help message."""
    welcome = (
        "🛡️ *Chetana — Free Scam Check*\n"
        "\n"
        "Forward or paste any suspicious message and "
        "I'll tell you if it's a scam.\n"
        "\n"
        "I can check:\n"
        "• SMS and WhatsApp messages\n"
        "• Links and URLs\n"
        "• UPI payment requests\n"
        "• Phone numbers\n"
        "• Bank/KYC update messages\n"
        "\n"
        "English checks. Hindi support is in beta.\n"
        "No data stored. No login required.\n"
        "\n"
        "_Just paste the message below_ 👇"
    )
    await _send_reply(phone, welcome)


# ── Reply sender ────────────────────────────────────────────────────

async def _send_reply(phone: str, text: str):
    """Send a text message back via Meta Cloud API."""
    if not ACCESS_TOKEN or not PHONE_NUMBER_ID:
        logger.error("WhatsApp credentials not configured")
        return

    url = f"{META_API}/{PHONE_NUMBER_ID}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "text",
        "text": {"body": text},
    }

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.post(
                url,
                json=payload,
                headers={"Authorization": f"Bearer {ACCESS_TOKEN}"},
            )
            if resp.status_code != 200:
                logger.error(f"Send failed {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            logger.error(f"Send error: {e}")


# ── Rate limiter ────────────────────────────────────────────────────

def _is_rate_limited(phone: str) -> bool:
    """Simple sliding-window rate limiter per phone number."""
    now = time.time()
    if phone not in _rate_map:
        _rate_map[phone] = []

    # Clean old entries
    _rate_map[phone] = [t for t in _rate_map[phone] if now - t < RATE_WINDOW]

    if len(_rate_map[phone]) >= RATE_LIMIT:
        return True

    _rate_map[phone].append(now)
    return False
