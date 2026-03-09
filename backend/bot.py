#!/usr/bin/env python3
"""
Chetana Telegram Bot — Consumer trust surface via Telegram.

Commands:
    /start, /help     — Welcome + command list
    /check <text>     — Scan text/link for scams
    /weather          — Live Scam Weather pressure cards
    /atlas            — Scam Atlas threat wiki (browsable)
    /brief            — Founder-level threat briefing
    /status           — Backend health check

Connects to the existing chetana-site API at :8093.
Does NOT duplicate intelligence — just a thin frontend.

Token: env TELEGRAM_BOT_TOKEN → Keychain → ~/.mirrordna/secrets.env
"""
import asyncio
import logging
import os
import signal
import subprocess
import sys
from pathlib import Path

import httpx
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    filters,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
log = logging.getLogger("chetana.bot")

API_URL = os.environ.get("CHETANA_API_URL", "http://127.0.0.1:8093")
BROWSER_API_URL = os.environ.get("CHETANA_BROWSER_API", "http://127.0.0.1:8798")


def load_token() -> str:
    """Load Telegram bot token from env → Keychain → secrets.env."""
    val = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if val:
        return val
    try:
        r = subprocess.run(
            ["security", "find-generic-password", "-s", "TELEGRAM_BOT_TOKEN", "-w"],
            capture_output=True, text=True, timeout=5,
        )
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip()
    except Exception:
        pass
    secrets = Path.home() / ".mirrordna" / "secrets.env"
    if secrets.exists():
        for line in secrets.read_text().splitlines():
            if line.startswith("TELEGRAM_BOT_TOKEN="):
                return line.split("=", 1)[1].strip()
    return ""


# ── API helpers ──────────────────────────────────────────────────────

_client: httpx.AsyncClient | None = None


async def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=15.0)
    return _client


async def api_get(path: str) -> dict:
    client = await get_client()
    r = await client.get(f"{API_URL}{path}")
    r.raise_for_status()
    return r.json()


async def api_post(path: str, body: dict) -> dict:
    client = await get_client()
    r = await client.post(f"{API_URL}{path}", json=body)
    r.raise_for_status()
    return r.json()


# ── Formatters ───────────────────────────────────────────────────────

RISK_EMOJI = {
    "SUSPICIOUS": "\u26a0\ufe0f",  # warning
    "LOW_RISK": "\u2705",          # check
    "UNCLEAR": "\u2753",           # question
    "SERVICE_UNAVAILABLE": "\u274c",  # cross
}

TONE_EMOJI = {"red": "\U0001f534", "amber": "\U0001f7e0", "green": "\U0001f7e2"}


def format_scan_result(data: dict) -> str:
    verdict = data.get("verdict", "UNKNOWN")
    score = data.get("risk_score", 0)
    emoji = RISK_EMOJI.get(verdict, "\u2753")
    surface = data.get("surface", "general")

    lines = [
        f"{emoji} *Verdict: {verdict}*",
        f"Risk Score: {score}/100",
        f"Surface: {surface}",
    ]

    flags = data.get("why_flagged", [])
    if flags:
        lines.append("\n*Why flagged:*")
        for f in flags[:5]:
            lines.append(f"  \u2022 {f}")

    action = data.get("action_eligibility", "")
    if action:
        action_map = {
            "warn_and_verify": "\u26a0\ufe0f Verify through official channels before acting.",
            "inform_and_suggest": "\U0001f4a1 Proceed with caution. Double-check details.",
            "inform_only": "\u2705 Appears safe. Stay vigilant.",
            "retry": "\U0001f504 Service temporarily unavailable. Try again.",
        }
        lines.append(f"\n*Action:* {action_map.get(action, action)}")

    lines.append(
        "\n\U0001f6a8 _Emergency: Call 1930 (India cybercrime helpline)_"
    )
    return "\n".join(lines)


def format_weather(data: dict) -> str:
    signals = data.get("signals", [])
    if not signals:
        return "No weather data available."

    lines = ["\U0001f321\ufe0f *Scam Weather — Live Pressure*\n"]
    for s in signals:
        emoji = TONE_EMOJI.get(s.get("tone", ""), "\u26aa")
        lines.append(
            f"{emoji} *{s['label']}*: {s['pressure']}% ({s['delta']})"
        )

    lines.append("\n_Data from live threat intelligence feeds._")
    return "\n".join(lines)


def format_atlas_list(threats: list) -> str:
    if not threats:
        return "No atlas entries available."

    lines = ["\U0001f4d6 *Scam Atlas — Threat Wiki*\n"]
    for i, t in enumerate(threats, 1):
        status_icon = "\U0001f534" if t.get("status") == "rising" else "\U0001f7e0"
        lines.append(f"{i}. {status_icon} *{t['title']}* ({t.get('surface', '')})")

    lines.append("\n_Tap a number to see details. E.g. /atlas 1_")
    return "\n".join(lines)


def format_atlas_detail(t: dict) -> str:
    status_icon = "\U0001f534" if t.get("status") == "rising" else "\U0001f7e0"
    lines = [
        f"{status_icon} *{t['title']}*",
        f"Surface: {t.get('surface', 'N/A')}",
        f"Status: {t.get('status', 'N/A')}",
        f"\n{t.get('summary', '')}",
    ]

    langs = t.get("languages", [])
    if langs:
        lines.append(f"\n\U0001f310 Languages: {', '.join(langs)}")

    flags = t.get("redFlags", [])
    if flags:
        lines.append("\n\U0001f6a9 *Red Flags:*")
        for f in flags:
            lines.append(f"  \u2022 {f}")

    actions = t.get("actions", [])
    if actions:
        lines.append("\n\u2705 *Safe Actions:*")
        for a in actions:
            lines.append(f"  \u2192 {a}")

    return "\n".join(lines)


# ── Handlers ─────────────────────────────────────────────────────────

async def cmd_start(update: Update, context) -> None:
    text = (
        "\U0001f6e1\ufe0f *Chetana — Trust Surface for Indian Digital Life*\n\n"
        "I protect you against scams, fraud, and deception.\n\n"
        "*Commands:*\n"
        "/check `<message or link>` — Scan for scams\n"
        "/weather — Live scam pressure\n"
        "/atlas — Scam types wiki\n"
        "/brief — Threat briefing\n"
        "/status — System health\n\n"
        "_Forward me any suspicious message and I'll analyze it._\n\n"
        "\U0001f6a8 Emergency: Call *1930* (India cybercrime helpline)"
    )
    await update.message.reply_text(text, parse_mode="Markdown")


async def cmd_check(update: Update, context) -> None:
    text = " ".join(context.args) if context.args else ""
    if not text:
        await update.message.reply_text(
            "Usage: /check `<paste suspicious message or link>`",
            parse_mode="Markdown",
        )
        return

    await update.message.reply_text("\U0001f50d Scanning...")

    # Detect if input is a link
    input_type = "link" if text.startswith("http") else "text"

    try:
        data = await api_post("/api/scan", {"input_type": input_type, "content": text})
        await update.message.reply_text(
            format_scan_result(data), parse_mode="Markdown"
        )
    except Exception as e:
        log.warning("Scan failed: %s", e)
        await update.message.reply_text(
            "\u274c Scan temporarily unavailable. Try again in a moment."
        )


async def cmd_weather(update: Update, context) -> None:
    try:
        data = await api_get("/api/weather")
        await update.message.reply_text(
            format_weather(data), parse_mode="Markdown"
        )
    except Exception as e:
        log.warning("Weather failed: %s", e)
        await update.message.reply_text("\u274c Weather data temporarily unavailable.")


async def cmd_atlas(update: Update, context) -> None:
    try:
        data = await api_get("/api/atlas")
        threats = data.get("threats", [])
    except Exception as e:
        log.warning("Atlas failed: %s", e)
        await update.message.reply_text("\u274c Atlas temporarily unavailable.")
        return

    # If a number argument given, show detail
    if context.args:
        try:
            idx = int(context.args[0]) - 1
            if 0 <= idx < len(threats):
                await update.message.reply_text(
                    format_atlas_detail(threats[idx]), parse_mode="Markdown"
                )
                return
        except ValueError:
            pass

    await update.message.reply_text(
        format_atlas_list(threats), parse_mode="Markdown"
    )


async def cmd_brief(update: Update, context) -> None:
    try:
        weather = await api_get("/api/weather")
        signals = weather.get("signals", [])
    except Exception:
        signals = []

    red = [s for s in signals if s.get("tone") == "red"]
    rising = [s for s in signals if "+" in s.get("delta", "") and int(s.get("delta", "+0").strip("+%")) >= 10]

    lines = ["\U0001f4cb *Threat Briefing*\n"]

    if red:
        lines.append(f"\U0001f534 *{len(red)} high-pressure threats:*")
        for s in red:
            lines.append(f"  \u2022 {s['label']} ({s['pressure']}%, {s['delta']})")

    if rising:
        lines.append(f"\n\U0001f4c8 *Fastest rising:*")
        rising.sort(key=lambda s: int(s.get("delta", "+0").strip("+%")), reverse=True)
        for s in rising[:3]:
            lines.append(f"  \u2022 {s['label']} ({s['delta']})")

    if not red and not rising:
        lines.append("No elevated threats detected.")

    lines.append(
        "\n_Briefing generated from live threat intelligence._"
    )
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def cmd_status(update: Update, context) -> None:
    lines = ["\U0001f4e1 *System Status*\n"]

    for name, url in [
        ("Showcase API", f"{API_URL}/health"),
        ("Browser Guard", f"{BROWSER_API_URL}/health"),
    ]:
        try:
            client = await get_client()
            r = await client.get(url, timeout=5.0)
            if r.status_code == 200:
                lines.append(f"\u2705 {name}: UP")
            else:
                lines.append(f"\u274c {name}: {r.status_code}")
        except Exception:
            lines.append(f"\u274c {name}: DOWN")

    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def handle_message(update: Update, context) -> None:
    """Handle forwarded messages or plain text as scan input."""
    text = update.message.text or ""
    if not text.strip():
        return

    await update.message.reply_text("\U0001f50d Scanning forwarded message...")

    input_type = "link" if text.startswith("http") else "text"
    try:
        data = await api_post("/api/scan", {"input_type": input_type, "content": text})
        await update.message.reply_text(
            format_scan_result(data), parse_mode="Markdown"
        )
    except Exception as e:
        log.warning("Message scan failed: %s", e)
        await update.message.reply_text(
            "\u274c Scan temporarily unavailable. Try again in a moment."
        )


# ── Main ─────────────────────────────────────────────────────────────

def main():
    token = load_token()
    if not token:
        log.error(
            "No TELEGRAM_BOT_TOKEN found. Set it in env, Keychain, or ~/.mirrordna/secrets.env\n"
            "Create a bot via @BotFather on Telegram, then:\n"
            "  security add-generic-password -s TELEGRAM_BOT_TOKEN -a mirror-admin -w 'YOUR_TOKEN'"
        )
        sys.exit(1)

    log.info("Starting Chetana Telegram bot...")
    app = Application.builder().token(token).build()

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_start))
    app.add_handler(CommandHandler("check", cmd_check))
    app.add_handler(CommandHandler("weather", cmd_weather))
    app.add_handler(CommandHandler("atlas", cmd_atlas))
    app.add_handler(CommandHandler("brief", cmd_brief))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    log.info("Bot polling started. Ctrl+C to stop.")
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
