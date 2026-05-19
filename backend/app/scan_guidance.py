from __future__ import annotations

import json
import os
import re
import time
from typing import Any

import httpx

from app.v0_runtime import V0Guidance, V0Verdict

OLLAMA_URL = "http://127.0.0.1:11434"
GUIDANCE_REFINE_ENABLED = os.getenv("CHETANA_GUIDANCE_REFINE", "").strip().lower() in {"1", "true", "yes", "on"}
GUIDANCE_TOTAL_BUDGET_S = float(os.getenv("CHETANA_GUIDANCE_BUDGET_S", "1.2"))
GUIDANCE_MODELS: tuple[tuple[str, float], ...] = (
    ("chetana-guard-fast", 0.8),
    ("phi4-mini", 1.0),
)

MONEY_RE = re.compile(r"\b(upi|qr|pay|payment|transfer|deposit|advance fee|collect request|refund)\b", re.IGNORECASE)
AUTHORITY_RE = re.compile(r"\b(bank|rbi|police|cbi|customs|court|govt|government|kyc|aadhaar|pan)\b", re.IGNORECASE)
REMOTE_RE = re.compile(r"\b(anydesk|teamviewer|quicksupport|screen ?share|remote access|install app|apk)\b", re.IGNORECASE)


def _clean_text(value: Any, *, limit: int = 220) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(text) > limit:
        return text[: limit - 1].rstrip() + "…"
    return text


def _unique_trimmed(values: list[Any], *, limit: int, fallback: list[str]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = _clean_text(value)
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(text)
        if len(cleaned) >= limit:
            break
    return cleaned or fallback[:limit]


def _extract_json(raw: str) -> dict[str, Any] | None:
    try:
        return json.loads(raw)
    except Exception:
        pass
    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(raw[start:end])
        except Exception:
            return None
    return None


async def _local_json(prompt: str) -> dict[str, Any] | None:
    if not GUIDANCE_REFINE_ENABLED:
        return None
    started = time.monotonic()
    async with httpx.AsyncClient(timeout=5.0) as client:
        for model, timeout_s in GUIDANCE_MODELS:
            remaining = GUIDANCE_TOTAL_BUDGET_S - (time.monotonic() - started)
            if remaining <= 0:
                break
            try:
                resp = await client.post(
                    f"{OLLAMA_URL}/api/generate",
                    json={
                        "model": model,
                        "prompt": prompt,
                        "stream": False,
                        "keep_alive": "5m",
                    },
                    timeout=min(timeout_s, max(0.25, remaining)),
                )
                if resp.status_code != 200:
                    continue
                parsed = _extract_json(resp.json().get("response", ""))
                if parsed:
                    parsed["_model"] = model
                    return parsed
            except Exception:
                continue
    return None


def _scenario_for_live_scan(text: str, is_link: bool) -> str:
    if REMOTE_RE.search(text):
        return "Remote access or fake support request"
    if is_link:
        return "Suspicious link or fake website"
    if MONEY_RE.search(text):
        return "Payment or UPI pressure request"
    if AUTHORITY_RE.search(text):
        return "Authority or account verification pressure"
    return "Suspicious message or social engineering attempt"


def _deterministic_live_guidance(
    *,
    text: str,
    verdict: str,
    score: int,
    signals: list[str],
    explanation: str,
    is_link: bool,
) -> dict[str, Any]:
    signal_list = _unique_trimmed(
        signals,
        limit=4,
        fallback=[explanation or "The current material shows warning signs that need independent verification."],
    )
    scenario_label = _scenario_for_live_scan(text, is_link)
    needs_more_evidence = verdict in {"UNCLEAR", "MEDIUM"} and score < 55 and len(signals) < 2
    money_risk = bool(MONEY_RE.search(text))
    remote_risk = bool(REMOTE_RE.search(text))

    if needs_more_evidence:
        lead = "Not enough evidence yet to clear this safely."
    elif verdict in {"SUSPICIOUS", "HIGH"}:
        lead = "Pause here. This looks risky enough that you should not act from the current message."
    elif verdict in {"UNCLEAR", "MEDIUM"}:
        lead = "Pause here. There are warning signs and this should be verified outside the live channel."
    else:
        lead = "No strong scam signal was found, but high-stakes actions still need independent verification."

    do_now = [
        "Break the live pressure loop and verify through an official app, website, or known number you already trust.",
    ]
    if remote_risk:
        do_now.insert(0, "Refuse any app install, screen-share, or accessibility request immediately.")
    elif money_risk:
        do_now.insert(0, "Do not pay, approve, or scan anything until you verify the request outside the live channel.")
    elif is_link:
        do_now.insert(0, "Do not open the link again or download anything from it.")

    do_not_do = [
        "Do not share OTPs, PINs, passwords, or full ID details.",
        "Do not trust contact details, payment handles, or links inside the suspicious message alone.",
    ]
    if money_risk:
        do_not_do.append("Do not transfer money or approve a collect request until the real app or ledger confirms it.")
    if remote_risk:
        do_not_do.append("Do not install AnyDesk, TeamViewer, APKs, or enable screen-share for a stranger.")

    if_already_acted = [
        "If money already moved, call 1930 and contact your bank or payment app immediately.",
        "Preserve screenshots, links, UPI IDs, transaction references, and sender details before they disappear.",
    ]
    if remote_risk:
        if_already_acted.insert(0, "If you installed anything or granted screen access, end the session and remove the app or dangerous permission from a clean path.")

    verification_route = (
        "Verify inside the official bank / PSP app or merchant ledger."
        if money_risk
        else "Use the official app, official website, or known phone number you already trust."
    )
    if remote_risk:
        verification_route = "Use the official bank, telecom, or support app you already trust. Never verify through the caller's install or screen-share path."

    return {
        "lead": lead,
        "scenario_label": scenario_label,
        "why_it_was_flagged": signal_list,
        "do_now": _unique_trimmed(do_now, limit=5, fallback=["Verify independently before you act."]),
        "do_not_do": _unique_trimmed(do_not_do, limit=5, fallback=["Do not act from the suspicious message alone."]),
        "if_already_acted": _unique_trimmed(if_already_acted, limit=4, fallback=["Use official recovery rails immediately."]),
        "verification_route": verification_route,
        "false_positive_recovery": (
            "If you think this is legitimate, re-check it with the full chat, a clearer screenshot, or the official app view. "
            "Do not override the warning until a second trusted source confirms it."
        ),
        "hindi_quick_line": (
            "पैसे मत भेजो. पहले आधिकारिक ऐप या नंबर से जाँच करो."
            if money_risk
            else "रुकिए. पहले आधिकारिक स्रोत से जाँच कीजिए."
        ),
        "needs_more_evidence": needs_more_evidence,
        "source": "deterministic",
    }


async def build_live_scan_guidance(
    *,
    text: str,
    verdict: str,
    score: int,
    signals: list[str],
    explanation: str = "",
    is_link: bool = False,
) -> dict[str, Any]:
    guidance = _deterministic_live_guidance(
        text=text,
        verdict=verdict,
        score=score,
        signals=signals,
        explanation=explanation,
        is_link=is_link,
    )
    prompt = (
        "You are rewriting scam-safety guidance for Chetana. "
        "Do not change the risk level, scenario, or actions. "
        "Do not add new facts. Do not claim certainty. Do not blame the user. "
        "Return only JSON with keys lead, why_it_was_flagged, do_now, do_not_do, if_already_acted, verification_route, false_positive_recovery, hindi_quick_line.\n\n"
        f"Authoritative context:\n{json.dumps(guidance, ensure_ascii=True)}"
    )
    refined = await _local_json(prompt)
    if not refined:
        return guidance

    return {
        **guidance,
        "lead": _clean_text(refined.get("lead") or guidance["lead"]),
        "why_it_was_flagged": _unique_trimmed(refined.get("why_it_was_flagged") or guidance["why_it_was_flagged"], limit=4, fallback=guidance["why_it_was_flagged"]),
        "do_now": _unique_trimmed(refined.get("do_now") or guidance["do_now"], limit=5, fallback=guidance["do_now"]),
        "do_not_do": _unique_trimmed(refined.get("do_not_do") or guidance["do_not_do"], limit=5, fallback=guidance["do_not_do"]),
        "if_already_acted": _unique_trimmed(refined.get("if_already_acted") or guidance["if_already_acted"], limit=4, fallback=guidance["if_already_acted"]),
        "verification_route": _clean_text(refined.get("verification_route") or guidance["verification_route"]),
        "false_positive_recovery": _clean_text(refined.get("false_positive_recovery") or guidance["false_positive_recovery"], limit=260),
        "hindi_quick_line": _clean_text(refined.get("hindi_quick_line") or guidance["hindi_quick_line"], limit=140),
        "source": "ollama",
    }


async def enrich_v0_verdict(verdict: V0Verdict) -> V0Verdict:
    guidance = verdict.guidance.model_dump()
    prompt = (
        "You are rewriting scam-safety guidance for Chetana v0. "
        "Do not change the verdict, risk level, evidence state, incident state, or recommended actions. "
        "Do not add new facts, legal claims, or certainty. Do not blame the user. "
        "Return only JSON with keys lead, why_it_was_flagged, do_now, do_not_do, if_already_acted, verification_route, false_positive_recovery, calm_script.\n\n"
        f"Authoritative context:\n{json.dumps(guidance, ensure_ascii=True)}"
    )
    refined = await _local_json(prompt)
    if not refined:
        return verdict

    updated_guidance = verdict.guidance.model_copy(
        update={
            "lead": _clean_text(refined.get("lead") or verdict.guidance.lead),
            "why_it_was_flagged": _unique_trimmed(
                refined.get("why_it_was_flagged") or verdict.guidance.why_it_was_flagged,
                limit=5,
                fallback=verdict.guidance.why_it_was_flagged,
            ),
            "do_now": _unique_trimmed(
                refined.get("do_now") or verdict.guidance.do_now,
                limit=5,
                fallback=verdict.guidance.do_now,
            ),
            "do_not_do": _unique_trimmed(
                refined.get("do_not_do") or verdict.guidance.do_not_do,
                limit=5,
                fallback=verdict.guidance.do_not_do,
            ),
            "if_already_acted": _unique_trimmed(
                refined.get("if_already_acted") or verdict.guidance.if_already_acted,
                limit=4,
                fallback=verdict.guidance.if_already_acted,
            ),
            "verification_route": _clean_text(refined.get("verification_route") or verdict.guidance.verification_route),
            "false_positive_recovery": _clean_text(
                refined.get("false_positive_recovery") or verdict.guidance.false_positive_recovery,
                limit=260,
            ),
            "calm_script": _clean_text(refined.get("calm_script") or verdict.guidance.calm_script, limit=200),
            "source": "ollama",
        }
    )
    return verdict.model_copy(update={"guidance": updated_guidance})
