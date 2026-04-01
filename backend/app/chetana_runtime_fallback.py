from __future__ import annotations

import re
from pathlib import Path

DISCLAIMER = (
    "This is an AI assessment, not a legal determination. "
    "False positives and negatives can occur. Always verify independently."
)

DISCLAIMER_HI = (
    "यह AI मूल्यांकन है, कानूनी निर्णय नहीं। "
    "गलत सकारात्मक और नकारात्मक हो सकते हैं। हमेशा स्वतंत्र रूप से सत्यापित करें।"
)

_DIR = Path(__file__).parent
_SOUL_PATH = _DIR / "soul.md"
_KNOWLEDGE_PATH = _DIR / "scam_knowledge.md"

_BANNED_RE = re.compile(
    "|".join(
        [
            r"\bthis is (?:a |definitely |clearly )?(?:a )?scam\b",
            r"\bthis is fraud\b",
            r"\bthey are scammers?\b",
            r"\byou have been scammed\b",
            r"\bI guarantee\b",
            r"\b100% (?:safe|scam|fraud)\b",
            r"\bfile an? FIR\b",
            r"\byour fault\b",
            r"\bwhy did you\b",
        ]
    ),
    re.IGNORECASE,
)

_SOFTENERS = {
    "this is a scam": "this shows strong scam indicators",
    "this is fraud": "this has fraud warning signals",
    "they are scammers": "the sender shows scam-like behavior",
    "you have been scammed": "it appears you may have been targeted by a scam",
    "your fault": "this can happen to anyone",
    "why did you": "going forward",
}


def _load_file(path: Path) -> str:
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    return ""


def build_system_prompt(surface: str = "chat") -> str:
    soul = _load_file(_SOUL_PATH)
    knowledge = _load_file(_KNOWLEDGE_PATH)

    surface_instructions = {
        "chat": (
            "You are responding in the web chat widget on chetana.activemirror.ai. "
            "Keep replies concise, explain scan results clearly, and suggest a calm next step."
        ),
        "telegram": (
            "You are responding in Telegram. Keep replies short and practical."
        ),
        "api": (
            "You are the Chetana analysis engine. Focus on evidence, risk signals, and safe next steps."
        ),
        "browser": (
            "You are analyzing a page or link inline. Be concise and lead with the safety signal."
        ),
        "nexus": (
            "You are serving an analyst. Use technical language and focus on signals and actions."
        ),
    }

    instruction = surface_instructions.get(surface, surface_instructions["chat"])

    prompt = f"""You are Chetana (चेतना) — India's AI-powered scam detection and trust assistant.

{soul}

## Scam Intelligence Database
{knowledge}

## Surface Context
{instruction}

## Output Rules
1. Never claim certainty about fraud. Use risk language and evidence.
2. Never blame the victim. Focus on recovery and next steps.
3. Never give legal advice. Direct to cybercrime.gov.in, 1930, or legal counsel.
4. Never fabricate statistics, case studies, or examples.
5. End scan-related responses with the disclaimer: "{DISCLAIMER}"
6. When someone has lost money, lead with 1930 and contact-the-bank guidance.
7. Keep replies concise unless the user asks for detail.
8. Use Hindi-English code-mixing naturally when it helps.
9. Generate 2-3 follow-up suggestions when possible.
10. If you do not know something, say so honestly."""

    return prompt


def gate_output(text: str, lang: str = "en") -> dict:
    flags: list[str] = []
    cleaned = text

    if _BANNED_RE.search(cleaned):
        flags.append("accusatory_language")
        for phrase, replacement in _SOFTENERS.items():
            cleaned = re.sub(re.escape(phrase), replacement, cleaned, flags=re.IGNORECASE)
        cleaned = _BANNED_RE.sub("[strong warning signals detected]", cleaned)

    legal_re = re.compile(r"\b(?:file.{0,5}FIR|take.{0,5}legal action|sue them|go to court)\b", re.IGNORECASE)
    if legal_re.search(cleaned):
        flags.append("legal_overreach")
        cleaned = legal_re.sub("report at cybercrime.gov.in or call 1930", cleaned)

    stat_re = re.compile(r"\b\d+%\s+of\s+(?:people|victims|users|Indians|cases)\b", re.IGNORECASE)
    if stat_re.search(cleaned):
        flags.append("unverified_statistic")

    disc = DISCLAIMER_HI if lang == "hi" else DISCLAIMER
    has_score = bool(re.search(r"\b(?:score|risk|threat).*\d+", cleaned, re.IGNORECASE))
    if has_score and disc not in cleaned and DISCLAIMER not in cleaned:
        flags.append("missing_disclaimer")
        cleaned = cleaned.rstrip() + "\n\n⚖️ " + disc

    blame_re = re.compile(r"\byou should(?:n't| not) have\b|\bwhy did you\b|\byour mistake\b", re.IGNORECASE)
    if blame_re.search(cleaned):
        flags.append("victim_blaming")
        cleaned = blame_re.sub("this can happen to anyone — let's focus on next steps", cleaned)

    return {
        "text": cleaned,
        "gated": bool(flags),
        "flags": flags,
    }


def enforce_disclaimer(text: str, lang: str = "en") -> str:
    disc = DISCLAIMER_HI if lang == "hi" else DISCLAIMER
    if re.search(r"\b(?:score|risk|HIGH|MEDIUM|SUSPICIOUS|threat)\b", text, re.IGNORECASE):
        if disc not in text and DISCLAIMER not in text:
            return text.rstrip() + "\n\n⚖️ " + disc
    return text
