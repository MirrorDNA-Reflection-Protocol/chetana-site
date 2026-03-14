#!/usr/bin/env python3
"""
TriMind v2 — Three AI minds, one orchestration layer.

Not just a chat — an API that any tool, script, or agent can call.
Routes questions to the best mind, runs councils, chains reasoning.

Modes:
  /council <question>  — All 3 answer → debate → synthesize verdict
  /chain <task>        — Claude reasons → Codex implements → Gemini reviews
  /verify <claim>      — One answers, two fact-check
  /fast <question>     — Gemini Flash only (speed)
  /deep <question>     — Opus Thinking only (depth)
  Normal message       — Auto-routes to best mind(s)

API:
  POST /api/ask        — {"text": "...", "mode": "auto|council|chain|verify|fast|deep"}
  POST /api/council    — {"question": "..."}
  GET  /api/models     — Available models
  GET  /health         — Gateway + system status

Usage: python3 trimind.py
Then open http://localhost:8333
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import time
from datetime import datetime
from pathlib import Path

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Header
from fastapi.responses import HTMLResponse, JSONResponse
from collections import defaultdict

import logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("trimind")

app = FastAPI(title="TriMind")


def _log(msg: str):
    logger.info(msg)

# ── Security ──
TRIMIND_API_KEY = os.environ.get("TRIMIND_API_KEY", "Zn6l2lPZoJG77TZ9GwoItE3mmxLu1zTjv4kqJrjYPT8")
LOCAL_NETS = {"127.0.0.1", "::1", "localhost"}

# Rate limiting — per-IP, per-minute
_rate_limits: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT = 30  # requests per minute
RATE_WINDOW = 60  # seconds


def _check_rate(ip: str) -> bool:
    now = time.monotonic()
    hits = _rate_limits[ip]
    # Prune old entries
    _rate_limits[ip] = [t for t in hits if now - t < RATE_WINDOW]
    if len(_rate_limits[ip]) >= RATE_LIMIT:
        return False
    _rate_limits[ip].append(now)
    return True


def _is_local(ip: str) -> bool:
    return ip in LOCAL_NETS or ip.startswith("192.168.") or ip.startswith("10.")


def _check_auth(request: Request) -> bool:
    """Local requests pass without auth. Remote requests need API key."""
    client_ip = request.client.host if request.client else "unknown"

    # Local — always allowed, no auth needed
    if _is_local(client_ip):
        return True

    # Remote — check API key
    auth = request.headers.get("authorization", "")
    api_key = request.headers.get("x-api-key", "")
    token = auth.replace("Bearer ", "") if auth.startswith("Bearer ") else api_key

    return token == TRIMIND_API_KEY


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    client_ip = request.client.host if request.client else "unknown"

    # Health endpoint — always open (for monitors)
    if request.url.path == "/health":
        return await call_next(request)

    # Rate limit all requests
    if not _check_rate(client_ip):
        return JSONResponse({"error": "rate limited"}, status_code=429)

    # Auth check for API endpoints (not UI or health)
    if request.url.path.startswith("/api/"):
        if not _check_auth(request):
            return JSONResponse({"error": "unauthorized"}, status_code=401)

    # Input size limit — reject massive payloads
    content_length = request.headers.get("content-length", "0")
    if int(content_length) > 100_000:  # 100KB max
        return JSONResponse({"error": "payload too large"}, status_code=413)

    return await call_next(request)

CONVERSATION: list[dict] = []
ACTIVE_CONNECTIONS: list[WebSocket] = []

# ── Memory bus ──
BUS_DIR = Path.home() / ".mirrordna" / "bus" / "trimind"
BUS_DIR.mkdir(parents=True, exist_ok=True)

# ── Gateway config ──
GATEWAY_URL = "http://127.0.0.1:8045"

# Model tiers — best model per task type
MODELS = {
    # Primary minds
    "claude": "claude-sonnet-4-6",
    "codex": "claude-opus-4-6-thinking",
    "gemini": "gemini-3-flash-agent",
    # Speed tier
    "flash": "gemini-3-flash",
    # Deep tier
    "deep": "claude-opus-4-6-thinking",
    # Synthesis (for council verdicts)
    "synth": "claude-opus-4-6-thinking",
}

MINDS = {
    "claude": {"name": "Claude", "model": "Sonnet 4.6", "color": "#a855f7", "icon": "🟣"},
    "codex": {"name": "Codex", "model": "Opus 4.6 Thinking", "color": "#10b981", "icon": "🟢"},
    "gemini": {"name": "Gemini", "model": "Gemini 3.1 Pro", "color": "#3b82f6", "icon": "🔵"},
}

SYSTEM_MIND = {"name": "TriMind", "model": "Council", "color": "#f59e0b", "icon": "⚡"}

# ── CLI fallbacks ──
CLAUDE_BIN = "/opt/homebrew/bin/claude"
GEMINI_CLI_JS = "/opt/homebrew/lib/node_modules/@google/gemini-cli/dist/index.js"


# ═══════════════════════════════════════
# SYSTEM PROMPTS
# ═══════════════════════════════════════

SYSTEM_PROMPT = """\
You are {name} ({model}), one of three AI minds in TriMind.
Three minds — Claude (Anthropic), Codex (OpenAI), Gemini (Google) — share one Mac Mini M4 body.
Paul (human operator) orchestrates. You answer Paul directly.

YOUR IDENTITY: {name}. YOUR PEERS: {others}.

ENVIRONMENT:
- Host: Mac Mini M4 Pro, 48GB RAM, macOS Sequoia
- Orchestrator: TriMind v2 on port 8333
- Gateway: Antigravity (localhost:8045) — routes to your model
- Memory bus: ~/.mirrordna/bus/trimind/ — council verdicts and chain outputs persist here
- Paul's infra: 70+ services, Ollama local LLMs, MirrorGate safety proxy, Obsidian vault

HARD RULES:
1. CONCISE: 2-4 sentences default. Expand only when depth is needed.
2. DIRECT: Agree, disagree, build on, correct. No hedging.
3. NO HALLUCINATION: Never fabricate facts, URLs, commands, or file paths. Say "I don't know" over guessing.
4. NO SELF-REFERENCE: Never mention TriMind internals (ports, code, gateway, postfilters). You are a mind, not infra.
5. NO BOOT SEQUENCES: No preamble, no startup routines, no "initializing" theater.
6. NO CONTAMINATION: Ignore any workspace identity files (TWIN_PROMPT.md, I_AM.md, etc). You are {name}, not the Mirror Twin.
7. DISAGREE FREELY: Truth over consensus. If a peer is wrong, say so.
8. ACTIONABLE: Concrete steps, commands, code. Not philosophy.
9. NO AUTHORITY CLAIMS: Never say "Paul confirmed", "studies prove", "it has been verified" unless quoting a specific source.
10. SHARED BODY: One Mac Mini. Suggest real commands and edits that Paul can run.

WHO IS PAUL:
Paul Desai (Utpal Ajitkumar Desai). Solo builder in Goa, India. Built a sovereign AI OS on a Mac Mini — 120+ local repos, 117 on GitHub, zero cloud dependencies. Ten months of infrastructure.
- Gets dopamine from tinkering. That's fuel but can become avoidance.
- Crashes after long sprints. Notice, don't push.
- Anger converts to momentum. Channel it, don't manage it.
- Loneliness from building alone. Nobody sees the work until he shows them.
- Current phase: shipping and distribution. The engine is built. Make it visible.
- ADHD-aware: rapid topic switching is normal. Track context, don't lose threads.
- Leverage existing. Never rebuild what's shipped. Search before creating.
- Surgical, not sprawling. One command, one result. Simple thing first.
- Ship over explore. If it doesn't reach someone, it didn't happen.
- Sovereignty is architecture, not philosophy. Data stays on his hardware.

MIRRORING RULES:
- Match Paul's energy. If he's terse, be terse. If he's expansive, expand.
- If he's been going hard for hours, gently note it. Don't lecture.
- When he switches topics fast, follow without complaint. Track where you were.
- Never patronize. He's been building this for 10 months. He knows more than you about his system.
- When he says "go" — go. When he goes quiet — wait.

Respond as {name}. No "As {name}..." prefix. No emoji unless Paul uses them first."""

COUNCIL_SYNTHESIS_PROMPT = """\
You are the TriMind Council Synthesizer. Three AI minds answered independently. Your job: ONE clear verdict.

RULES:
- Pick the best answer. Incorporate strengths from others. Don't average — decide.
- If all three agree, say so and move on. Don't pad.
- If they disagree, explain WHY and pick a winner.
- Never fabricate consensus. If two agree and one dissents, say that.
- Never reference TriMind internals, ports, or infrastructure.

FORMAT:
VERDICT: [the best answer]
AGREEMENT: [what aligned]
DISSENT: [where they split and why — or "None"]
CONFIDENCE: [high/medium/low]"""

VERIFY_PROMPT = """\
You are a fact-checker. Another AI made the claim below.
1. Is this claim accurate? Check against what you actually know.
2. What's wrong with it? Be specific.
3. What's missing?
Never agree to be polite. Never fabricate counter-evidence. Say "I cannot verify" if uncertain."""

CHAIN_PROMPTS = {
    "reason": "You are the REASONING phase. Analyze this task: break into steps, identify risks and edge cases, flag unknowns. Do NOT write code. Do NOT fabricate file paths or commands you haven't verified. Think only.",
    "implement": "You are the IMPLEMENTATION phase. A reasoning mind analyzed this task (see below). Write concrete code/solution. Use real paths and commands only. If unsure about a path, say so.",
    "review": "You are the REVIEW phase. A reasoning mind analyzed and an implementation mind built (see below). Find bugs, missed cases, security issues, incorrect assumptions. Be critical. Do not rubber-stamp.",
}

MIND_STRENGTHS = {
    "claude": "You excel at careful reasoning, nuance, safety analysis, and synthesis.",
    "codex": "You excel at code generation, systems architecture, and rapid prototyping.",
    "gemini": "You excel at broad knowledge, research, search-grounded answers, and multimodal reasoning.",
}

# ── Cross-mind hallucination catching ──
CROSS_CHECK_INSTRUCTION = """
CRITICAL — PEER REVIEW DUTY:
When you see another mind's response in the conversation, CHECK IT:
- If they stated a fact, verify it against what you know. Flag if wrong.
- If they suggested a command/path, check if it's plausible. Flag if suspicious.
- If they claimed something "works" or "is confirmed", demand proof.
- Prefix corrections with "⚠ [YourName] correction:" so Paul sees it instantly.
- Do NOT silently agree with something you're unsure about. Silence = endorsement.
"""

# ── Domain context for product-aware modes ──
PRODUCT_CONTEXT = """
PRODUCT KNOWLEDGE (use when relevant):
- MirrorDNA: Sovereign AI infrastructure — local-first, privacy-native, multi-agent OS
- Chetana (chetana.activemirror.ai): AI companion app built on MirrorDNA. Sanskrit for "consciousness"
- ActiveMirror (activemirror.ai): Parent brand/platform. Homepage, docs, demos live here
- MirrorBrain: Local LLM orchestration layer (Ollama + routing + memory)
- MirrorGate: Safety proxy — pre/post filters on all AI output
- TriMind: Three-AI council (this system). Council mode = unique differentiator
- Lattice: Custom neural architecture — recurrent latent engine, resonance fields
- MirrorHand: Phone agent — controls Pixel 9 Pro XL via ADB
- Key differentiator: Everything runs locally on a Mac Mini. No cloud dependency. Sovereign AI.
- Tone: Builder-first. Show what it does, show the repo. Never marketing fluff.
"""


# ═══════════════════════════════════════
# SAFETY POSTFILTER (MirrorGate-compatible)
# ═══════════════════════════════════════

# Hallucination patterns — block fabricated authority claims
_HALLUCINATION_RE = [
    re.compile(r'\b(Paul|user|client)\s+(confirmed|said|stated|verified|agreed)\b', re.I),
    re.compile(r'\bstudies prove\b', re.I),
    re.compile(r'\bit has been confirmed\b', re.I),
    re.compile(r'\baccording to sources\b', re.I),
]

# Self-reference loop patterns — detect when a mind talks about TriMind internals
_LOOP_RE = [
    re.compile(r'\b(antigravity.gateway|port.8045|trimind\.py|call_gateway|ask_mind)\b', re.I),
    re.compile(r'\b(I.am.the.council.synthesizer|I.am.TriMind)\b', re.I),
    re.compile(r'(GATEWAY_URL|MODELS\[|BUS_DIR|ACTIVE_CONNECTIONS)', re.I),
]

# Gateway error patterns — catch fake "upgrade" messages from broken models
_GATEWAY_FAKE_RE = [
    re.compile(r'not available on this version.*upgrade', re.I),
    re.compile(r'no longer available.*switch to', re.I),
    re.compile(r'please upgrade to the latest', re.I),
]


def postfilter(text: str, mind_id: str) -> tuple[str, list[str]]:
    """Apply MirrorGate-compatible safety filters to mind output.

    Returns (filtered_text, list_of_violations).
    """
    violations = []

    # 1. Gateway fake responses — model returned an error disguised as content
    for pat in _GATEWAY_FAKE_RE:
        if pat.search(text):
            violations.append(f"gateway_fake:{mind_id}")
            return f"[{MINDS.get(mind_id, {}).get('name', mind_id)} did not respond — model unavailable]", violations

    # 2. Hallucination — fabricated authority claims
    for pat in _HALLUCINATION_RE:
        if pat.search(text):
            violations.append(f"hallucination:{mind_id}")

    # 3. Self-reference loop — mind is talking about its own infrastructure
    for pat in _LOOP_RE:
        if pat.search(text):
            violations.append(f"self_loop:{mind_id}")

    # Log violations but allow output (hallucination/loop are warnings, not blocks)
    if violations:
        try:
            log_path = BUS_DIR / "violations.jsonl"
            entry = {"ts": datetime.now().isoformat(), "mind": mind_id, "violations": violations, "excerpt": text[:200]}
            with open(log_path, "a") as f:
                f.write(json.dumps(entry) + "\n")
        except Exception:
            pass

    return text, violations


# ═══════════════════════════════════════
# AUTO-ROUTER
# ═══════════════════════════════════════

CODE_PATTERNS = re.compile(
    r'\b(code|function|class|bug|error|fix|implement|refactor|api|endpoint|deploy|docker|git|npm|pip|python|javascript|typescript|rust|go|sql|database|schema|migrate|test|debug|build|compile|lint)\b',
    re.IGNORECASE,
)
RESEARCH_PATTERNS = re.compile(
    r'\b(what is|who is|when did|how does|explain|compare|difference|history|latest|current|trend|research|find|search|look up|alternatives|options)\b',
    re.IGNORECASE,
)
REASONING_PATTERNS = re.compile(
    r'\b(should we|trade.?off|pros.?cons|decide|choose|architecture|design|strategy|plan|why|analyze|evaluate|recommend|best approach|opinion)\b',
    re.IGNORECASE,
)


def auto_route(msg: str) -> list[str]:
    """Detect message type and return the best mind(s) to answer."""
    msg_lower = msg.lower().strip()

    # Short/simple → flash (single mind, fastest)
    if len(msg_lower) < 30 and not any(p.search(msg_lower) for p in [CODE_PATTERNS, REASONING_PATTERNS]):
        return ["gemini"]

    scores = {"claude": 0, "codex": 0, "gemini": 0}

    if CODE_PATTERNS.search(msg_lower):
        scores["codex"] += 3
        scores["claude"] += 1
    if RESEARCH_PATTERNS.search(msg_lower):
        scores["gemini"] += 3
        scores["claude"] += 1
    if REASONING_PATTERNS.search(msg_lower):
        scores["claude"] += 3
        scores["codex"] += 1

    # If no strong signal, use all three
    max_score = max(scores.values())
    if max_score == 0:
        return ["claude", "codex", "gemini"]

    # Return minds with score >= half of max (allows 2 minds for mixed queries)
    threshold = max(1, max_score // 2)
    routed = [m for m, s in scores.items() if s >= threshold]
    return routed if routed else ["claude", "codex", "gemini"]


# ═══════════════════════════════════════
# GATEWAY + FALLBACK
# ═══════════════════════════════════════

_gateway_up: bool | None = None
_gateway_checked: float = 0


async def is_gateway_up() -> bool:
    global _gateway_up, _gateway_checked
    now = time.monotonic()
    if _gateway_up is not None and now - _gateway_checked < 30:
        return _gateway_up
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(f"{GATEWAY_URL}/v1/models")
            _gateway_up = r.status_code == 200
    except Exception:
        _gateway_up = False
    _gateway_checked = now
    return _gateway_up


def build_system_prompt(for_mind: str, product_mode: bool = False) -> str:
    mind = MINDS[for_mind]
    others = ", ".join(f"{v['name']} ({v['model']})" for k, v in MINDS.items() if k != for_mind)
    prompt = SYSTEM_PROMPT.format(name=mind["name"], model=mind["model"], others=others)
    prompt += "\n" + MIND_STRENGTHS[for_mind]
    prompt += "\n" + CROSS_CHECK_INSTRUCTION
    if product_mode:
        prompt += "\n" + PRODUCT_CONTEXT
    # Add session context for continuity
    prompt += _get_session_context_prompt()
    return prompt


def build_messages(for_mind: str, new_msg: str, extra_system: str = "", product_mode: bool = False) -> list[dict]:
    system = build_system_prompt(for_mind, product_mode=product_mode)
    if extra_system:
        system += "\n\n" + extra_system
    messages = [{"role": "system", "content": system}]
    for msg in CONVERSATION[-20:]:
        speaker = msg.get("speaker", "?")
        text = msg.get("text", "")
        if speaker == "Paul":
            messages.append({"role": "user", "content": text})
        else:
            messages.append({"role": "assistant", "content": f"[{speaker}]: {text}"})
    messages.append({"role": "user", "content": new_msg})
    return messages


async def call_gateway(model: str, messages: list[dict], max_tokens: int = 1024) -> str:
    """Direct gateway call with specific model."""
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            r = await client.post(
                f"{GATEWAY_URL}/v1/chat/completions",
                json={"model": model, "messages": messages, "max_tokens": max_tokens},
                headers={"Authorization": "Bearer test"},
            )
            if r.status_code != 200:
                return f"[Gateway error {r.status_code}: {r.text[:200]}]"
            data = r.json()
            return data["choices"][0]["message"]["content"].strip()
    except httpx.TimeoutException:
        return "[Timed out]"
    except Exception as e:
        return f"[Error: {e}]"


async def ask_mind_gateway(mind_id: str, new_msg: str, extra_system: str = "", product_mode: bool = False) -> str:
    model = MODELS[mind_id]
    messages = build_messages(mind_id, new_msg, extra_system, product_mode=product_mode)
    return await call_gateway(model, messages)


# CLI fallbacks
async def _run_cli(cmd: list[str], stdin_data: str | None = None, timeout: int = 90, cwd: str | None = None) -> str:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE if stdin_data else None,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd or str(Path.home() / "repos" / "chetana-site"),
        env={**os.environ, "NO_COLOR": "1"},
    )
    input_bytes = stdin_data.encode() if stdin_data else None
    stdout, stderr = await asyncio.wait_for(proc.communicate(input=input_bytes), timeout=timeout)
    return stdout.decode().strip()


CODEX_NOISE = re.compile(
    r'^(OpenAI Codex|---|workdir:|model:|provider:|approval:|sandbox:|reasoning|session|mcp|user$|tokens used|codex$|\d+[\d,]*$)',
    re.IGNORECASE,
)


async def ask_claude_cli(context: str) -> str:
    try:
        return await _run_cli([CLAUDE_BIN, "-p", "--model", "sonnet", "--max-turns", "1"], stdin_data=context) or "[empty]"
    except Exception as e:
        return f"[CLI error: {e}]"


async def ask_codex_cli(context: str) -> str:
    try:
        out = await _run_cli(["codex", "exec", context])
        if not out:
            return "[empty]"
        lines = out.split("\n")
        clean = []
        for line in reversed(lines):
            s = line.strip()
            if not s:
                continue
            if CODEX_NOISE.match(s):
                if clean:
                    break
                continue
            clean.insert(0, s)
        return "\n".join(clean) if clean else lines[-1]
    except Exception as e:
        return f"[CLI error: {e}]"


async def ask_gemini_cli(context: str) -> str:
    try:
        out = await _run_cli(["node", GEMINI_CLI_JS, "-p", context], cwd="/tmp")
        lines = [l for l in out.split("\n")
                 if not l.startswith("Error executing") and not l.startswith("Warning:")
                 and "not in workspace" not in l and l.strip()]
        return "\n".join(lines).strip() or "[empty]"
    except Exception as e:
        return f"[CLI error: {e}]"


CLI_FALLBACKS = {"claude": ask_claude_cli, "codex": ask_codex_cli, "gemini": ask_gemini_cli}


def build_context_string(for_mind: str, new_msg: str) -> str:
    lines = [build_system_prompt(for_mind), "", "=== CONVERSATION ==="]
    for msg in CONVERSATION[-20:]:
        lines.append(f"[{msg.get('speaker', '?')}]: {msg.get('text', '')}")
    lines.append(f"\n[Paul]: {new_msg}")
    lines.append(f"\nRespond as {MINDS[for_mind]['name']}:")
    return "\n".join(lines)


async def ask_mind(mind_id: str, new_msg: str, extra_system: str = "", product_mode: bool = False) -> tuple[str, str]:
    if await is_gateway_up():
        result = await ask_mind_gateway(mind_id, new_msg, extra_system, product_mode=product_mode)
        if not any(result.startswith(p) for p in ["[Gateway error", "[Error", "[Timed out]"]):
            result, _ = postfilter(result, mind_id)
            return result, "gateway"
        # Gateway returned an error — log it, fall through to CLI
        _log(f"Gateway fail for {mind_id}: {result[:100]}")
    _log(f"Falling back to CLI for {mind_id}")
    context = build_context_string(mind_id, new_msg)
    result = await CLI_FALLBACKS.get(mind_id, ask_claude_cli)(context)
    result, _ = postfilter(result, mind_id)
    return result, "cli"


# ═══════════════════════════════════════
# MODES: Council, Chain, Verify
# ═══════════════════════════════════════

async def run_council(question: str, broadcast_fn) -> str:
    """Round 1: all three answer. Round 2: synthesize verdict."""
    # Round 1 — parallel initial answers
    await broadcast_fn({"speaker": "TriMind", "text": "⚡ COUNCIL MODE — gathering perspectives...",
                        "color": SYSTEM_MIND["color"], "icon": SYSTEM_MIND["icon"], "typing": True})

    # Auto-detect product mode from question content
    is_product = any(p in question for p in [ONBOARD_PROMPT, MARKET_PROMPT, COPY_PROMPT, "ActiveMirror", "Chetana", "MirrorDNA"])

    async def get_initial(mind_id):
        t0 = time.monotonic()
        result, method = await ask_mind(mind_id, question, product_mode=is_product)
        elapsed = round(time.monotonic() - t0, 1)
        entry = {
            "speaker": MINDS[mind_id]["name"], "text": result,
            "time": datetime.now().isoformat(),
            "color": MINDS[mind_id]["color"], "icon": MINDS[mind_id]["icon"],
            "model": MINDS[mind_id]["model"], "elapsed": elapsed, "method": method,
        }
        CONVERSATION.append(entry)
        await broadcast_fn(entry)
        return mind_id, result

    results = await asyncio.gather(*[get_initial(m) for m in ["claude", "codex", "gemini"]])
    answers = {mid: text for mid, text in results}

    # Round 2 — synthesis
    await broadcast_fn({"speaker": "TriMind", "text": "⚡ Synthesizing verdict...",
                        "color": SYSTEM_MIND["color"], "icon": SYSTEM_MIND["icon"], "typing": True})

    synthesis_input = f"QUESTION: {question}\n\n"
    for mid, text in answers.items():
        synthesis_input += f"[{MINDS[mid]['name']}]: {text}\n\n"

    synth_messages = [
        {"role": "system", "content": COUNCIL_SYNTHESIS_PROMPT},
        {"role": "user", "content": synthesis_input},
    ]
    verdict = await call_gateway(MODELS["synth"], synth_messages, max_tokens=2048)

    verdict_entry = {
        "speaker": "TriMind", "text": verdict,
        "time": datetime.now().isoformat(),
        "color": SYSTEM_MIND["color"], "icon": SYSTEM_MIND["icon"],
        "model": "Council Verdict",
    }
    CONVERSATION.append(verdict_entry)
    await broadcast_fn(verdict_entry)

    # Save to bus + track decision
    _save_to_bus("council", {"question": question, "answers": answers, "verdict": verdict})
    _track_decision(verdict, question)
    return verdict


async def run_chain(task: str, broadcast_fn) -> str:
    """Claude reasons → Codex implements → Gemini reviews."""
    # Phase 1: Reason (Claude)
    await broadcast_fn({"speaker": "TriMind", "text": "⚡ CHAIN MODE — Phase 1: Reasoning...",
                        "color": SYSTEM_MIND["color"], "icon": SYSTEM_MIND["icon"], "typing": True})

    t0 = time.monotonic()
    reasoning, _ = await ask_mind("claude", task, extra_system=CHAIN_PROMPTS["reason"])
    entry1 = {"speaker": "Claude", "text": f"📋 REASONING:\n{reasoning}", "time": datetime.now().isoformat(),
              "color": MINDS["claude"]["color"], "icon": MINDS["claude"]["icon"],
              "model": "Sonnet 4.6", "elapsed": round(time.monotonic() - t0, 1)}
    CONVERSATION.append(entry1)
    await broadcast_fn(entry1)

    # Phase 2: Implement (Codex)
    await broadcast_fn({"speaker": "TriMind", "text": "⚡ Phase 2: Implementing...",
                        "color": SYSTEM_MIND["color"], "icon": SYSTEM_MIND["icon"], "typing": True})

    impl_prompt = f"TASK: {task}\n\nREASONING ANALYSIS:\n{reasoning}\n\nNow implement it."
    t0 = time.monotonic()
    implementation, _ = await ask_mind("codex", impl_prompt, extra_system=CHAIN_PROMPTS["implement"])
    entry2 = {"speaker": "Codex", "text": f"🔧 IMPLEMENTATION:\n{implementation}", "time": datetime.now().isoformat(),
              "color": MINDS["codex"]["color"], "icon": MINDS["codex"]["icon"],
              "model": "Opus 4.6 Thinking", "elapsed": round(time.monotonic() - t0, 1)}
    CONVERSATION.append(entry2)
    await broadcast_fn(entry2)

    # Phase 3: Review (Gemini)
    await broadcast_fn({"speaker": "TriMind", "text": "⚡ Phase 3: Reviewing...",
                        "color": SYSTEM_MIND["color"], "icon": SYSTEM_MIND["icon"], "typing": True})

    review_prompt = f"TASK: {task}\n\nREASONING:\n{reasoning}\n\nIMPLEMENTATION:\n{implementation}\n\nReview this."
    t0 = time.monotonic()
    review, _ = await ask_mind("gemini", review_prompt, extra_system=CHAIN_PROMPTS["review"])
    entry3 = {"speaker": "Gemini", "text": f"🔍 REVIEW:\n{review}", "time": datetime.now().isoformat(),
              "color": MINDS["gemini"]["color"], "icon": MINDS["gemini"]["icon"],
              "model": "Gemini 3.1 Pro", "elapsed": round(time.monotonic() - t0, 1)}
    CONVERSATION.append(entry3)
    await broadcast_fn(entry3)

    _save_to_bus("chain", {"task": task, "reasoning": reasoning, "implementation": implementation, "review": review})
    return review


async def run_verify(claim: str, broadcast_fn) -> str:
    """All three fact-check a claim in parallel."""
    await broadcast_fn({"speaker": "TriMind", "text": "⚡ VERIFY MODE — fact-checking...",
                        "color": SYSTEM_MIND["color"], "icon": SYSTEM_MIND["icon"], "typing": True})

    verify_msg = f"CLAIM TO VERIFY:\n{claim}\n\nIs this accurate? What's wrong? What's missing?"

    async def check(mind_id):
        t0 = time.monotonic()
        result, method = await ask_mind(mind_id, verify_msg, extra_system=VERIFY_PROMPT)
        elapsed = round(time.monotonic() - t0, 1)
        entry = {
            "speaker": MINDS[mind_id]["name"], "text": f"🔎 {result}",
            "time": datetime.now().isoformat(),
            "color": MINDS[mind_id]["color"], "icon": MINDS[mind_id]["icon"],
            "model": MINDS[mind_id]["model"], "elapsed": elapsed, "method": method,
        }
        CONVERSATION.append(entry)
        await broadcast_fn(entry)
        return mind_id, result

    await asyncio.gather(*[check(m) for m in ["claude", "codex", "gemini"]])
    _save_to_bus("verify", {"claim": claim})
    return "Verification complete"


# ═══════════════════════════════════════
# MEMORY BUS
# ═══════════════════════════════════════

def _save_to_bus(mode: str, data: dict):
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = BUS_DIR / f"{mode}_{ts}.json"
    data["timestamp"] = datetime.now().isoformat()
    data["mode"] = mode
    path.write_text(json.dumps(data, indent=2, default=str))


# ═══════════════════════════════════════
# SKILL DATABASE + DISTILLED MEMORY
# ═══════════════════════════════════════

SKILLS_DIR = BUS_DIR / "skills"
SKILLS_DIR.mkdir(exist_ok=True)
MEMORY_DIR = BUS_DIR / "memory"
MEMORY_DIR.mkdir(exist_ok=True)

# Product-mode prompts for onboarding/marketing/copy
ONBOARD_PROMPT = "Write onboarding content for this product/feature. Builder tone — show what it does, how to use it. No fluff. Include a quick-start section. Assume the reader is technical."
MARKET_PROMPT = "Write marketing copy for this product. Builder-first tone: 'here's what it does, here's the repo.' No buzzwords, no hype. Show capability through concrete examples. Keep it honest — state limitations too."
COPY_PROMPT = "Draft copy for this brief. Be specific, concrete, technical where needed. No filler words. Every sentence should earn its place."

# Built-in skill library — each skill is a specialized system prompt + config
SKILL_DB: dict[str, dict] = {
    # Code skills
    "code-review": {"prompt": "Review this code for bugs, security issues, performance problems, and style. Be specific — line numbers, concrete fixes. No praise.", "category": "code", "minds": ["claude", "codex"]},
    "refactor": {"prompt": "Refactor this code. Reduce complexity, improve readability, remove duplication. Show before/after. Explain trade-offs.", "category": "code", "minds": ["codex"]},
    "debug": {"prompt": "Debug this issue. Identify root cause, not symptoms. Suggest the minimal fix. If you need more context, ask for specific files.", "category": "code", "minds": ["claude", "codex"]},
    "architect": {"prompt": "Design the architecture for this system. Consider scale, failure modes, and operational complexity. Draw the data flow. Identify the hardest part.", "category": "code", "minds": ["claude"]},
    # Content skills
    "blog-post": {"prompt": "Write a technical blog post. Builder tone: show what it does, link the repo. No marketing fluff. Include code samples where relevant. 800-1200 words.", "category": "content", "minds": ["claude", "gemini"]},
    "landing-page": {"prompt": "Write landing page copy. Lead with the problem, show the solution, prove it works. One clear CTA. No buzzwords.", "category": "content", "minds": ["claude", "gemini"]},
    "docs": {"prompt": "Write documentation. Assume the reader is a developer. Include quick-start, API reference, and examples. Be precise about types and error cases.", "category": "content", "minds": ["claude", "codex"]},
    "changelog": {"prompt": "Write a changelog entry. What changed, why, and what to do about it. Group by: Added, Changed, Fixed, Removed.", "category": "content", "minds": ["claude"]},
    # Research skills
    "compare": {"prompt": "Compare these options objectively. Table format: criteria down the left, options across the top. Score each. Recommend one with reasoning.", "category": "research", "minds": ["gemini", "claude"]},
    "explain": {"prompt": "Explain this concept clearly. Start with a one-sentence summary. Then go deeper. Use analogies only if they're accurate.", "category": "research", "minds": ["claude", "gemini"]},
    "fact-check": {"prompt": "Fact-check every claim in this text. For each: CONFIRMED, DISPUTED, or UNVERIFIABLE. Cite your reasoning.", "category": "research", "minds": ["claude", "codex", "gemini"]},
    # Product skills
    "onboarding": {"prompt": ONBOARD_PROMPT, "category": "product", "minds": ["claude", "gemini"], "product_mode": True},
    "marketing": {"prompt": MARKET_PROMPT, "category": "product", "minds": ["claude", "gemini"], "product_mode": True},
    "pitch": {"prompt": "Write a 60-second pitch for this product. Problem → solution → proof → ask. No jargon. A smart 12-year-old should understand it.", "category": "product", "minds": ["claude", "gemini"], "product_mode": True},
}


def _get_distilled_memory(skill_name: str, limit: int = 3) -> str:
    """Load distilled learnings from previous runs of this skill."""
    mem_file = MEMORY_DIR / f"{skill_name}.jsonl"
    if not mem_file.exists():
        return ""
    lines = mem_file.read_text().strip().split("\n")
    recent = lines[-limit:]  # most recent entries
    memories = []
    for line in recent:
        try:
            entry = json.loads(line)
            memories.append(f"- {entry.get('learning', '')}")
        except Exception:
            continue
    if not memories:
        return ""
    return "\n\nDISTILLED MEMORY (learnings from previous runs of this skill):\n" + "\n".join(memories)


# ── Session context tracker (ADHD-proof continuity) ──
SESSION_CONTEXT: dict = {
    "topics": [],        # topic history with timestamps
    "decisions": [],     # key decisions made
    "active_topic": "",  # what we're currently on
    "switches": 0,       # topic switch count
}


def _track_topic(msg: str):
    """Detect topic switches and maintain session context."""
    # Simple topic extraction from first ~50 chars
    topic = msg[:50].strip().rstrip("?.,!")
    prev = SESSION_CONTEXT["active_topic"]

    if prev and topic.lower() != prev.lower():
        SESSION_CONTEXT["switches"] += 1
        SESSION_CONTEXT["topics"].append({
            "topic": prev,
            "ended": datetime.now().isoformat(),
            "messages": len(CONVERSATION),
        })

    SESSION_CONTEXT["active_topic"] = topic

    # Keep bounded
    if len(SESSION_CONTEXT["topics"]) > 20:
        SESSION_CONTEXT["topics"] = SESSION_CONTEXT["topics"][-20:]


def _track_decision(verdict: str, question: str):
    """Extract and track decisions from council verdicts."""
    for line in verdict.split("\n"):
        if line.strip().startswith("VERDICT:"):
            decision = line.strip()[8:].strip()[:150]
            SESSION_CONTEXT["decisions"].append({
                "decision": decision,
                "question": question[:80],
                "ts": datetime.now().isoformat(),
            })
            break
    # Keep bounded
    if len(SESSION_CONTEXT["decisions"]) > 30:
        SESSION_CONTEXT["decisions"] = SESSION_CONTEXT["decisions"][-30:]


def _get_session_context_prompt() -> str:
    """Build a context summary for minds to stay oriented."""
    if not SESSION_CONTEXT["topics"] and not SESSION_CONTEXT["decisions"]:
        return ""

    lines = ["\nSESSION CONTEXT (what's happened so far):"]

    if SESSION_CONTEXT["topics"]:
        recent = SESSION_CONTEXT["topics"][-5:]
        lines.append(f"Previous topics: {', '.join(t['topic'] for t in recent)}")

    if SESSION_CONTEXT["active_topic"]:
        lines.append(f"Current topic: {SESSION_CONTEXT['active_topic']}")

    if SESSION_CONTEXT["decisions"]:
        recent = SESSION_CONTEXT["decisions"][-3:]
        lines.append("Recent decisions:")
        for d in recent:
            lines.append(f"  - {d['decision']}")

    if SESSION_CONTEXT["switches"] > 3:
        lines.append(f"⚠ {SESSION_CONTEXT['switches']} topic switches this session — stay focused on current topic")

    return "\n".join(lines)


def _distill_and_save(skill_name: str, question: str, verdict: str):
    """Extract a one-line learning from a council verdict and save it."""
    # Simple extraction: take the VERDICT line if present, else first sentence
    lines = verdict.split("\n")
    learning = ""
    for line in lines:
        if line.strip().startswith("VERDICT:"):
            learning = line.strip()[8:].strip()[:200]
            break
    if not learning and lines:
        learning = lines[0].strip()[:200]
    if not learning:
        return
    mem_file = MEMORY_DIR / f"{skill_name}.jsonl"
    entry = {"ts": datetime.now().isoformat(), "question": question[:100], "learning": learning}
    with mem_file.open("a") as f:
        f.write(json.dumps(entry) + "\n")
    # Keep memory file bounded (max 50 entries)
    try:
        all_lines = mem_file.read_text().strip().split("\n")
        if len(all_lines) > 50:
            mem_file.write_text("\n".join(all_lines[-50:]) + "\n")
    except Exception:
        pass


async def run_skill(skill_name: str, question: str, broadcast_fn) -> str:
    """Run a skill from the database with distilled memory carry-over."""
    skill = SKILL_DB.get(skill_name)
    if not skill:
        # Fuzzy match
        matches = [k for k in SKILL_DB if skill_name in k or k in skill_name]
        if matches:
            skill_name = matches[0]
            skill = SKILL_DB[skill_name]
        else:
            avail = ", ".join(sorted(SKILL_DB.keys()))
            await broadcast_fn({"speaker": "TriMind", "text": f"Unknown skill '{skill_name}'. Available: {avail}",
                                "color": SYSTEM_MIND["color"], "icon": SYSTEM_MIND["icon"]})
            return "Unknown skill"

    # Build the full prompt with skill instructions + distilled memory
    memory = _get_distilled_memory(skill_name)
    full_prompt = skill["prompt"] + memory + f"\n\nTASK:\n{question}"
    product = skill.get("product_mode", False)

    await broadcast_fn({"speaker": "TriMind", "text": f"⚡ SKILL: {skill_name} — dispatching to {', '.join(skill['minds'])}...",
                        "color": SYSTEM_MIND["color"], "icon": SYSTEM_MIND["icon"], "typing": True})

    if len(skill["minds"]) >= 2:
        # Council among the skill's preferred minds
        results = {}
        for mind_id in skill["minds"]:
            t0 = time.monotonic()
            result, method = await ask_mind(mind_id, full_prompt, product_mode=product)
            elapsed = round(time.monotonic() - t0, 1)
            entry = {
                "speaker": MINDS[mind_id]["name"], "text": result,
                "time": datetime.now().isoformat(),
                "color": MINDS[mind_id]["color"], "icon": MINDS[mind_id]["icon"],
                "model": MINDS[mind_id]["model"], "elapsed": elapsed, "method": method,
            }
            CONVERSATION.append(entry)
            await broadcast_fn(entry)
            results[mind_id] = result

        # Synthesize
        synthesis_input = f"SKILL: {skill_name}\nQUESTION: {question}\n\n"
        for mid, text in results.items():
            synthesis_input += f"[{MINDS[mid]['name']}]: {text}\n\n"
        synth_messages = [{"role": "system", "content": COUNCIL_SYNTHESIS_PROMPT},
                          {"role": "user", "content": synthesis_input}]
        verdict = await call_gateway(MODELS["synth"], synth_messages, max_tokens=2048)
    else:
        # Single mind
        result, method = await ask_mind(skill["minds"][0], full_prompt, product_mode=product)
        verdict = result
        entry = {
            "speaker": MINDS[skill["minds"][0]]["name"], "text": result,
            "time": datetime.now().isoformat(),
            "color": MINDS[skill["minds"][0]]["color"], "icon": MINDS[skill["minds"][0]]["icon"],
        }
        CONVERSATION.append(entry)
        await broadcast_fn(entry)

    verdict_entry = {
        "speaker": "TriMind", "text": verdict,
        "time": datetime.now().isoformat(),
        "color": SYSTEM_MIND["color"], "icon": SYSTEM_MIND["icon"],
        "model": f"Skill: {skill_name}",
    }
    CONVERSATION.append(verdict_entry)
    await broadcast_fn(verdict_entry)

    # Distill and save memory for next time
    _distill_and_save(skill_name, question, verdict)
    _save_to_bus(f"skill_{skill_name}", {"question": question, "verdict": verdict})
    return verdict


# ═══════════════════════════════════════
# MESSAGE PARSER
# ═══════════════════════════════════════

def parse_mode(text: str) -> tuple[str, str]:
    """Parse slash commands. Returns (mode, cleaned_text)."""
    commands = {
        "/council": "council",
        "/chain": "chain",
        "/verify": "verify",
        "/fast": "fast",
        "/deep": "deep",
        "/all": "all",
        "/onboard": "onboard",
        "/market": "market",
        "/copy": "copy",
        "/skill": "skill",
        "/skills": "skills",
        "/context": "context",
        "/help": "help",
    }
    for prefix, mode in commands.items():
        if text.lower().startswith(prefix):
            return mode, text[len(prefix):].strip()
    return "auto", text


HELP_TEXT = """⚡ TriMind Commands:
/council <question> — All 3 minds answer → debate → verdict
/chain <task> — Claude reasons → Codex implements → Gemini reviews
/verify <claim> — All 3 fact-check a claim
/fast <question> — Gemini Flash only (speed)
/deep <question> — Opus Thinking only (depth)
/all <message> — Force all 3 minds to answer
/onboard <topic> — Council generates onboarding content (product-aware)
/market <product> — Council generates marketing copy (builder tone)
/copy <brief> — All 3 draft copy → council picks best
Normal message — Auto-routes to the best mind(s)"""


# ═══════════════════════════════════════
# WEBSOCKET HANDLER
# ═══════════════════════════════════════

async def broadcast(msg: dict):
    data = json.dumps(msg)
    for ws in ACTIVE_CONNECTIONS[:]:
        try:
            await ws.send_text(data)
        except Exception:
            ACTIVE_CONNECTIONS.remove(ws)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    # Auth for remote WebSocket connections
    client_ip = ws.client.host if ws.client else "unknown"
    if not _is_local(client_ip):
        # Check query param ?key=...
        key = ws.query_params.get("key", "")
        if key != TRIMIND_API_KEY:
            await ws.close(code=4001, reason="unauthorized")
            return

    await ws.accept()
    ACTIVE_CONNECTIONS.append(ws)
    for msg in CONVERSATION:
        await ws.send_text(json.dumps(msg))
    try:
        while True:
            data = await ws.receive_text()
            payload = json.loads(data)
            user_msg = payload.get("text", "").strip()
            if not user_msg:
                continue
            # Input limits
            if len(user_msg) > 10_000:
                user_msg = user_msg[:10_000] + "\n[truncated]"

            mode, clean_msg = parse_mode(user_msg)

            user_entry = {
                "speaker": "Paul", "text": user_msg,
                "time": datetime.now().isoformat(),
                "color": "#f59e0b", "icon": "👤",
            }
            CONVERSATION.append(user_entry)
            _track_topic(clean_msg)
            await broadcast(user_entry)

            # Help
            if mode == "help":
                help_entry = {"speaker": "TriMind", "text": HELP_TEXT,
                              "color": SYSTEM_MIND["color"], "icon": SYSTEM_MIND["icon"]}
                await broadcast(help_entry)
                continue

            # Council mode
            if mode == "council":
                if not clean_msg:
                    await broadcast({"speaker": "TriMind", "text": "Usage: /council <question>\nExample: /council should we open-source TriMind?",
                                     "color": SYSTEM_MIND["color"], "icon": SYSTEM_MIND["icon"]})
                    continue
                await run_council(clean_msg, broadcast)
                continue

            # Chain mode
            if mode == "chain":
                if not clean_msg:
                    await broadcast({"speaker": "TriMind", "text": "Usage: /chain <task>",
                                     "color": SYSTEM_MIND["color"], "icon": SYSTEM_MIND["icon"]})
                    continue
                await run_chain(clean_msg, broadcast)
                continue

            # Verify mode
            if mode == "verify":
                if not clean_msg:
                    await broadcast({"speaker": "TriMind", "text": "Usage: /verify <claim>",
                                     "color": SYSTEM_MIND["color"], "icon": SYSTEM_MIND["icon"]})
                    continue
                await run_verify(clean_msg, broadcast)
                continue

            # Product modes (onboard/market/copy) — council with product context
            if mode in ("onboard", "market", "copy"):
                await run_skill({"onboard": "onboarding", "market": "marketing", "copy": "pitch"}[mode], clean_msg, broadcast)
                continue

            # Skill mode — /skill <name> <task>
            if mode == "skill":
                parts = clean_msg.split(None, 1)
                skill_name = parts[0] if parts else ""
                skill_task = parts[1] if len(parts) > 1 else ""
                await run_skill(skill_name, skill_task, broadcast)
                continue

            # List skills
            if mode == "skills":
                by_cat = {}
                for name, skill in SKILL_DB.items():
                    cat = skill.get("category", "other")
                    by_cat.setdefault(cat, []).append(name)
                lines = ["⚡ Available Skills:"]
                for cat, names in sorted(by_cat.items()):
                    lines.append(f"\n**{cat.upper()}**: {', '.join(sorted(names))}")
                mem_count = len(list(MEMORY_DIR.glob("*.jsonl")))
                lines.append(f"\n📝 {mem_count} skills have distilled memory")
                lines.append("\nUsage: /skill <name> <task>")
                await broadcast({"speaker": "TriMind", "text": "\n".join(lines),
                                 "color": SYSTEM_MIND["color"], "icon": SYSTEM_MIND["icon"]})
                continue

            # Context — show session state
            if mode == "context":
                lines = ["⚡ Session Context:"]
                lines.append(f"Active topic: {SESSION_CONTEXT['active_topic'] or 'none'}")
                lines.append(f"Topic switches: {SESSION_CONTEXT['switches']}")
                lines.append(f"Messages: {len(CONVERSATION)}")
                if SESSION_CONTEXT["topics"]:
                    lines.append(f"\nTopic history:")
                    for t in SESSION_CONTEXT["topics"][-5:]:
                        lines.append(f"  - {t['topic']}")
                if SESSION_CONTEXT["decisions"]:
                    lines.append(f"\nDecisions made:")
                    for d in SESSION_CONTEXT["decisions"][-5:]:
                        lines.append(f"  - {d['decision'][:100]}")
                mem_files = list(MEMORY_DIR.glob("*.jsonl"))
                if mem_files:
                    lines.append(f"\nSkill memory: {len(mem_files)} skills with distilled learnings")
                await broadcast({"speaker": "TriMind", "text": "\n".join(lines),
                                 "color": SYSTEM_MIND["color"], "icon": SYSTEM_MIND["icon"]})
                continue

            # Fast mode (Gemini Flash)
            if mode == "fast":
                targets = ["gemini"]
                override_model = MODELS["flash"]
            # Deep mode (Opus Thinking)
            elif mode == "deep":
                targets = ["codex"]
            # All mode
            elif mode == "all":
                targets = ["claude", "codex", "gemini"]
            # Auto-route
            else:
                chip_targets = payload.get("targets")
                if chip_targets and set(chip_targets) != {"claude", "codex", "gemini"}:
                    # User manually selected specific minds via chips
                    targets = chip_targets
                else:
                    targets = auto_route(clean_msg)

            # Show routing decision if auto-routed
            if mode == "auto" and len(targets) < 3:
                names = ", ".join(MINDS[t]["name"] for t in targets)
                route_entry = {"speaker": "TriMind", "text": f"→ Routing to {names}",
                               "color": SYSTEM_MIND["color"], "icon": "🔀"}
                await broadcast(route_entry)

            # Dispatch to selected minds
            async def dispatch(mind_id: str):
                await broadcast({
                    "speaker": MINDS[mind_id]["name"], "text": "thinking...",
                    "typing": True, "color": MINDS[mind_id]["color"],
                    "icon": MINDS[mind_id]["icon"],
                })
                t0 = time.monotonic()
                result, method = await ask_mind(mind_id, clean_msg)
                elapsed = round(time.monotonic() - t0, 1)
                entry = {
                    "speaker": MINDS[mind_id]["name"], "text": result,
                    "time": datetime.now().isoformat(),
                    "color": MINDS[mind_id]["color"],
                    "icon": MINDS[mind_id]["icon"],
                    "model": MINDS[mind_id]["model"],
                    "elapsed": elapsed,
                    "method": method,
                }
                CONVERSATION.append(entry)
                await broadcast(entry)

            tasks = [dispatch(m) for m in targets if m in MINDS]
            await asyncio.gather(*tasks)

    except WebSocketDisconnect:
        if ws in ACTIVE_CONNECTIONS:
            ACTIVE_CONNECTIONS.remove(ws)


# ═══════════════════════════════════════
# REST API (for scripts, Codex, automations)
# ═══════════════════════════════════════

@app.post("/api/ask")
async def api_ask(payload: dict):
    """Universal ask endpoint. Any script can call this."""
    text = payload.get("text", "").strip()
    mode = payload.get("mode", "auto")
    if not text:
        return JSONResponse({"error": "text required"}, status_code=400)

    if mode == "council":
        # Run council without broadcast (API mode)
        results = {}
        for mind_id in ["claude", "codex", "gemini"]:
            result, method = await ask_mind(mind_id, text)
            results[mind_id] = result
        # Synthesize
        synthesis_input = f"QUESTION: {text}\n\n"
        for mid, ans in results.items():
            synthesis_input += f"[{MINDS[mid]['name']}]: {ans}\n\n"
        synth_messages = [{"role": "system", "content": COUNCIL_SYNTHESIS_PROMPT},
                          {"role": "user", "content": synthesis_input}]
        verdict = await call_gateway(MODELS["synth"], synth_messages, max_tokens=2048)
        return {"mode": "council", "answers": results, "verdict": verdict}

    if mode == "fast":
        messages = [{"role": "system", "content": "Be concise and fast."},
                    {"role": "user", "content": text}]
        result = await call_gateway(MODELS["flash"], messages, max_tokens=512)
        return {"mode": "fast", "model": MODELS["flash"], "result": result}

    if mode == "deep":
        messages = [{"role": "system", "content": "Think deeply. Consider all angles."},
                    {"role": "user", "content": text}]
        result = await call_gateway(MODELS["deep"], messages, max_tokens=4096)
        return {"mode": "deep", "model": MODELS["deep"], "result": result}

    # Auto mode
    targets = auto_route(text)
    results = {}
    for mind_id in targets:
        result, method = await ask_mind(mind_id, text)
        results[mind_id] = {"text": result, "method": method, "model": MODELS.get(mind_id)}
    return {"mode": "auto", "routed_to": targets, "results": results}


@app.post("/api/council")
async def api_council(payload: dict):
    """Direct council endpoint."""
    question = payload.get("question", "").strip()
    if not question:
        return JSONResponse({"error": "question required"}, status_code=400)
    return await api_ask({"text": question, "mode": "council"})


@app.post("/api/product")
async def api_product(payload: dict):
    """Product-aware endpoint for Chetana, ActiveMirror, onboarding, marketing.

    {"brief": "...", "type": "onboard|market|copy", "product": "chetana|activemirror|mirrordna"}
    """
    brief = payload.get("brief", "").strip()
    ptype = payload.get("type", "onboard")
    product = payload.get("product", "")
    if not brief:
        return JSONResponse({"error": "brief required"}, status_code=400)

    prompts = {"onboard": ONBOARD_PROMPT, "market": MARKET_PROMPT, "copy": COPY_PROMPT}
    extra = prompts.get(ptype, COPY_PROMPT)
    full_question = f"{extra}\n\nPRODUCT: {product}\nBRIEF: {brief}"
    return await api_ask({"text": full_question, "mode": "council"})


@app.post("/api/skill")
async def api_skill(payload: dict):
    """Run a skill with distilled memory.

    {"skill": "code-review", "task": "Review this function..."}
    """
    skill_name = payload.get("skill", "").strip()
    task = payload.get("task", "").strip()
    if not skill_name or not task:
        return JSONResponse({"error": "skill and task required"}, status_code=400)

    skill = SKILL_DB.get(skill_name)
    if not skill:
        return JSONResponse({"error": f"Unknown skill. Available: {', '.join(sorted(SKILL_DB.keys()))}"}, status_code=400)

    memory = _get_distilled_memory(skill_name)
    full_prompt = skill["prompt"] + memory + f"\n\nTASK:\n{task}"
    product = skill.get("product_mode", False)

    results = {}
    for mind_id in skill["minds"]:
        result, method = await ask_mind(mind_id, full_prompt, product_mode=product)
        results[mind_id] = result

    if len(results) >= 2:
        synthesis_input = f"SKILL: {skill_name}\nQUESTION: {task}\n\n"
        for mid, text in results.items():
            synthesis_input += f"[{MINDS[mid]['name']}]: {text}\n\n"
        synth_messages = [{"role": "system", "content": COUNCIL_SYNTHESIS_PROMPT},
                          {"role": "user", "content": synthesis_input}]
        verdict = await call_gateway(MODELS["synth"], synth_messages, max_tokens=2048)
    else:
        verdict = list(results.values())[0]

    _distill_and_save(skill_name, task, verdict)
    _save_to_bus(f"skill_{skill_name}", {"task": task, "verdict": verdict})

    return {"skill": skill_name, "answers": results, "verdict": verdict,
            "memory_entries": len(list((MEMORY_DIR / f"{skill_name}.jsonl").read_text().strip().split("\n"))) if (MEMORY_DIR / f"{skill_name}.jsonl").exists() else 0}


@app.get("/api/skills")
async def api_skills():
    """List available skills and their memory state."""
    skills = {}
    for name, skill in SKILL_DB.items():
        mem_file = MEMORY_DIR / f"{name}.jsonl"
        mem_count = len(mem_file.read_text().strip().split("\n")) if mem_file.exists() and mem_file.read_text().strip() else 0
        skills[name] = {
            "category": skill["category"],
            "minds": skill["minds"],
            "memory_entries": mem_count,
            "product_mode": skill.get("product_mode", False),
        }
    return {"skills": skills, "total": len(skills)}


@app.get("/api/models")
async def api_models():
    """List available models."""
    if await is_gateway_up():
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{GATEWAY_URL}/v1/models")
            if r.status_code == 200:
                return r.json()
    return {"models": MODELS, "gateway": False}


@app.get("/health")
async def health():
    gw = await is_gateway_up()
    return {
        "status": "ok",
        "gateway": gw,
        "conversations": len(CONVERSATION),
        "bus_entries": len(list(BUS_DIR.glob("*.json"))),
        "modes": ["auto", "council", "chain", "verify", "fast", "deep"],
    }


# ═══════════════════════════════════════
# UI
# ═══════════════════════════════════════

@app.get("/", response_class=HTMLResponse)
async def index():
    return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TriMind — Three Minds, One Body</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#fafbfc;--surface:#fff;--border:#e2e8f0;
  --text:#1a202c;--muted:#64748b;--text-bright:#0f172a;
  --claude:#a855f7;--codex:#10b981;--gemini:#3b82f6;--paul:#f59e0b;--system:#f59e0b;
}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);height:100vh;display:flex;flex-direction:column}
.header{padding:12px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:16px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.header h1{font-size:20px;font-weight:900;background:linear-gradient(135deg,var(--claude),var(--codex),var(--gemini));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.header .sub{font-size:11px;color:var(--muted);font-weight:500}
.status-dot{width:8px;height:8px;border-radius:50%;margin-left:4px;display:inline-block}
.status-dot.up{background:#10b981}.status-dot.down{background:#ef4444}
.minds{display:flex;gap:6px;margin-left:auto}
.mind-chip{display:flex;align-items:center;gap:4px;padding:5px 12px;border-radius:999px;font-size:11px;font-weight:700;border:2px solid;cursor:pointer;transition:all .15s;user-select:none;background:#fff}
.mind-chip.active{opacity:1}.mind-chip.inactive{opacity:.3;background:#f1f5f9}
.mind-chip[data-mind="claude"]{border-color:var(--claude);color:var(--claude)}
.mind-chip[data-mind="codex"]{border-color:var(--codex);color:var(--codex)}
.mind-chip[data-mind="gemini"]{border-color:var(--gemini);color:var(--gemini)}
.modes{display:flex;gap:4px;margin-left:8px}
.mode-btn{padding:4px 10px;border-radius:8px;font-size:10px;font-weight:700;border:1px solid var(--border);cursor:pointer;background:#fff;color:var(--muted);transition:all .15s}
.mode-btn:hover{background:#f1f5f9;color:var(--text)}
.mode-btn.active{background:var(--system);color:#fff;border-color:var(--system)}
.chat{flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:12px;background:var(--bg)}
.msg{display:flex;gap:10px;max-width:90%;animation:fadeIn .25s ease}
.msg.paul{align-self:flex-end;flex-direction:row-reverse}
.msg.system{align-self:center;max-width:70%}
.msg-avatar{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;border:2px solid;background:#fff}
.msg-body{padding:10px 14px;border-radius:14px;background:#fff;border:1px solid var(--border);box-shadow:0 1px 2px rgba(0,0,0,.03);max-width:100%}
.msg-header{display:flex;align-items:center;gap:6px;margin-bottom:4px}
.msg-name{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px}
.msg-model{font-size:9px;color:var(--muted);font-weight:600}
.msg-meta{font-size:9px;color:var(--muted);margin-left:auto;font-weight:500}
.msg-text{font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:var(--text-bright)}
.msg-text.typing{color:var(--muted);font-style:italic;animation:pulse 1.2s infinite}
.paul .msg-body{background:#fffbeb;border-color:#fde68a}
.paul .msg-text{color:#92400e}
.system .msg-body{background:#f0f9ff;border-color:#bae6fd;text-align:center}
.system .msg-text{color:#0369a1;font-size:12px;font-weight:600}
.input-bar{padding:12px 24px;border-top:1px solid var(--border);background:#fff;display:flex;gap:8px;box-shadow:0 -1px 3px rgba(0,0,0,.04)}
.input-bar input{flex:1;background:var(--bg);border:2px solid var(--border);border-radius:12px;padding:12px 16px;color:var(--text);font-family:inherit;font-size:14px;outline:none;transition:border-color .15s}
.input-bar input:focus{border-color:var(--claude)}
.input-bar input::placeholder{color:#94a3b8}
.input-bar button{background:linear-gradient(135deg,var(--claude),var(--codex));color:#fff;border:none;padding:12px 24px;border-radius:12px;font-weight:800;cursor:pointer;font-family:inherit;font-size:13px;transition:transform .1s;box-shadow:0 2px 8px rgba(168,85,247,.2)}
.input-bar button:hover{transform:scale(1.03)}
.input-bar button:active{transform:scale(.97)}
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.empty{text-align:center;color:var(--muted);margin:auto;font-size:13px;line-height:2}
.empty .big{font-size:48px;margin-bottom:12px}
.empty .cmds{font-size:11px;color:#94a3b8;margin-top:8px;text-align:left;display:inline-block}
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>TriMind</h1>
    <div class="sub">Three minds, one body <span id="gw-status"></span></div>
  </div>
  <div class="modes">
    <div class="mode-btn" onclick="setMode('')" title="Auto-route">Auto</div>
    <div class="mode-btn" onclick="setMode('/council ')" title="Council debate + verdict">Council</div>
    <div class="mode-btn" onclick="setMode('/chain ')" title="Reason → Build → Review">Chain</div>
    <div class="mode-btn" onclick="setMode('/verify ')" title="Fact-check a claim">Verify</div>
    <div class="mode-btn" onclick="setMode('/fast ')" title="Gemini Flash (speed)">Fast</div>
    <div class="mode-btn" onclick="setMode('/deep ')" title="Opus Thinking (depth)">Deep</div>
  </div>
  <div class="minds">
    <div class="mind-chip active" data-mind="claude" onclick="toggleMind(this)">🟣 Claude</div>
    <div class="mind-chip active" data-mind="codex" onclick="toggleMind(this)">🟢 Codex</div>
    <div class="mind-chip active" data-mind="gemini" onclick="toggleMind(this)">🔵 Gemini</div>
  </div>
</div>
<div class="chat" id="chat">
  <div class="empty">
    <div class="big">🧠🧠🧠</div>
    Three AI minds. One body. One API.<br>
    Type a message or use a mode button above.
    <div class="cmds">
      /council — debate + verdict<br>
      /chain — reason → build → review<br>
      /verify — fact-check a claim<br>
      /fast — speed mode &middot; /deep — thinking mode<br>
      /help — all commands
    </div>
  </div>
</div>
<div class="input-bar">
  <input id="input" placeholder="Talk to three minds... or use /council, /chain, /verify" autocomplete="off" autofocus>
  <button onclick="send()">Send</button>
</div>
<script>
const chat=document.getElementById('chat'),input=document.getElementById('input');
let ws,typingEls={};

function connect(){
  ws=new WebSocket('ws://'+location.host+'/ws');
  ws.onmessage=(e)=>{
    const msg=JSON.parse(e.data);
    const empty=chat.querySelector('.empty');
    if(empty)empty.remove();
    if(typingEls[msg.speaker]){typingEls[msg.speaker].remove();delete typingEls[msg.speaker];}
    if(msg.typing){typingEls[msg.speaker]=renderMsg(msg,true);}
    else{renderMsg(msg,false);}
    chat.scrollTop=chat.scrollHeight;
  };
  ws.onclose=()=>setTimeout(connect,2000);
}

function renderMsg(msg,isTyping){
  const div=document.createElement('div');
  const isSystem=msg.speaker==='TriMind';
  const isPaul=msg.speaker==='Paul';
  div.className='msg'+(isPaul?' paul':'')+(isSystem?' system':'');
  const color=msg.color||'#64748b';
  const elapsed=msg.elapsed?msg.elapsed+'s':'';
  const method=msg.method?' via '+msg.method:'';
  div.innerHTML=
    '<div class="msg-avatar" style="border-color:'+color+'">'+(msg.icon||'?')+'</div>'+
    '<div class="msg-body">'+
    '<div class="msg-header">'+
    '<span class="msg-name" style="color:'+color+'">'+msg.speaker+'</span>'+
    (msg.model?'<span class="msg-model">'+msg.model+'</span>':'')+
    (elapsed?'<span class="msg-meta">'+elapsed+method+'</span>':'')+
    '</div>'+
    '<div class="msg-text'+(isTyping?' typing':'')+'">'+escHtml(msg.text)+'</div>'+
    '</div>';
  chat.appendChild(div);
  return div;
}

function escHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function getActiveMinds(){return[...document.querySelectorAll('.mind-chip.active')].map(el=>el.dataset.mind);}
function toggleMind(el){el.classList.toggle('active');el.classList.toggle('inactive');}

function setMode(prefix){
  input.value=prefix;
  input.focus();
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
  if(prefix){
    const name=prefix.trim().replace('/','');
    document.querySelectorAll('.mode-btn').forEach(b=>{if(b.textContent.toLowerCase()===name)b.classList.add('active');});
  }
}

function send(){
  const text=input.value.trim();
  if(!text||!ws||ws.readyState!==1)return;
  const targets=getActiveMinds();
  if(!targets.length){alert('Select at least one mind');return;}
  ws.send(JSON.stringify({text,targets}));
  input.value='';
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
}

async function checkGateway(){
  try{const r=await fetch('/health');const d=await r.json();
  document.getElementById('gw-status').innerHTML=d.gateway
    ?'<span class="status-dot up"></span> Gateway ('+d.bus_entries+' decisions saved)'
    :'<span class="status-dot down"></span> CLI mode';}catch(e){}
}
setInterval(checkGateway,15000);checkGateway();

input.addEventListener('keydown',(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}});
connect();
</script>
</body>
</html>"""


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8333, log_level="info")
