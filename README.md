# Chetana

**Live:** [chetana.activemirror.ai](https://chetana.activemirror.ai)

Chetana is a simple scam checker: screenshot anything suspicious, ask Chetana, and get the next safest step.

It is intentionally narrow:

- scan
- explain
- share
- report
- learn

The goal is simple: turn suspicious content into a clear next step for a real person, without pretending to be a full fraud platform.

## What v0 handles first

- suspicious text from WhatsApp, SMS, email, Telegram, or social media
- screenshots of suspicious messages
- short voice notes transcribed on Chetana's own host, with raw audio deleted after transcription
- QR or UPI payment requests
- payment confirmation screenshots that may be fake

## Core output

Each scan returns:

- verdict: `high_risk`, `caution`, `needs_review`, or `low_signal`
- risk level, evidence state, and incident state
- scam type
- plain-language reasons
- confidence band
- safest next action
- structured guidance and recovery language
- optional share shield
- optional evidence pack

## v0 principles

- no "safe" verdict
- if evidence is weak, default to `needs_review` or `low_signal`, not reassurance
- show reasons, not just labels
- keep official recovery rails visible
- do not fake certainty
- keep scan and chat analysis local-first
- do not imply government affiliation

## v0 API

Public `v0` endpoints added in this build:

```bash
POST /api/v0/scan
GET  /api/v0/voice/status
POST /api/v0/voice/transcribe
POST /api/v0/evidence
POST /api/v0/events
POST /api/v0/trust/send-guard
POST /api/v0/trust/recovery
POST /api/v0/trust/merchant
POST /api/v0/trust/bundle
```

Analytics endpoints:

```bash
GET  /api/v1/analytics/summary
GET  /api/stats/live
```

Partner / institutional endpoints:

```bash
GET  /api/v1/capabilities
POST /api/v1/scan
POST /api/v1/trust/bundle
POST /api/v1/recovery
POST /api/v1/link/check
POST /api/v1/upi/check
POST /api/v1/phone/check
```

Example:

```bash
curl -X POST https://chetana.activemirror.ai/api/v0/scan \
  -H "Content-Type: application/json" \
  -d '{
    "input_type": "text",
    "text": "Urgent: your bank account will be blocked today. Pay Rs 500 now to reactivate it.",
    "language_hint": "en",
    "session_id": "example-session"
  }'
```

## Build surfaces

- **Frontend:** Vite 5 + React 18 + TypeScript + Framer Motion
- **Backend:** FastAPI + Python 3.11
- **v0 runtime:** deterministic verdict engine plus local-first explanation, evidence, and event logging
- **voice runtime:** bounded `whisper.cpp` large-v3-turbo q5 transcription; no external speech API
- **analytics engine:** canonical rollups from `~/.mirrordna/chetana/v0/events.jsonl` with funnel, daily, verdict, scam-type, and language summaries
- **Infra:** FastAPI serves the built frontend

## Model policy

Chetana keeps the scam scan contract local-first.

- primary local chat ladder: `phi4-mini`, `mirrorstudent`, then allowlisted optional local models
- local reserve models: `vajra-shield`, `sarvam-translate`, `qwen2.5vl`
- cloud chat fallback is off by default; Anthropic or OpenAI require explicit operator opt-in
- Gemini is intentionally not part of the Chetana chat ladder
- caller-supplied model choice is blocked; the backend only accepts an allowlisted non-Gemini roster
- local chat attempts are budget-capped before cloud fallback to avoid hanging on dead models

Relevant backend env vars:

```bash
CHETANA_OLLAMA_CHAT_MODELS=phi4-mini,mirrorstudent:latest,hf.co/Mungert/sarvam-m-GGUF:Q4_K_M,chetana-guard-fast,qwen2.5:7b,llama3.2:3b
CHETANA_CLOUD_FALLBACK=false
CHETANA_ENABLE_ANTHROPIC=false
CHETANA_ENABLE_OPENAI=false
CHETANA_ANTHROPIC_MODEL=claude-3-5-haiku-latest
CHETANA_OPENAI_MODEL=gpt-4.1-mini
CHETANA_CHAT_MAX_REQUESTS=12
CHETANA_CHAT_WINDOW_S=60
CHETANA_LOCAL_LLM_BUDGET_S=14
CHETANA_LLM_MAX_INPUT_CHARS=1200
CHETANA_LLM_MAX_OUTPUT_TOKENS=400
```

The public chat route is rate-limited and does not allow caller-supplied model selection, tool use, arbitrary model injection, or Gemini fallback. `/api/llm/status` separates configured local models from models actually present and reports whether cloud fallback is enabled.

## Local dev

```bash
git clone https://github.com/MirrorDNA-Reflection-Protocol/chetana-site.git
cd chetana-site/frontend && npm install && npm run dev
cd ../backend && pip install -r requirements.txt
./scripts/install_voice_runtime.sh
uvicorn app.main:app --port 8093
```

## Recovery rails

If you've been scammed:
- **National Cybercrime Helpline: 1930**
- **File a report: [cybercrime.gov.in](https://cybercrime.gov.in)**
- Women helpline: 181

Act within the first hour for the best chance of recovery.

## Institutional pilots

Chetana has a bank, CSR, government, and merchant-network sponsorship path at `?page=partners`.

The current source-backed sweep is in [docs/CHETANA_INSTITUTIONAL_PARTNERSHIP_SWEEP_2026_07_08.md](docs/CHETANA_INSTITUTIONAL_PARTNERSHIP_SWEEP_2026_07_08.md).

The position is intentionally narrow: Chetana is an independent scam checker and partner API, not a government service or official fraud-intelligence authority.

## Legal

Advisory tool only. Verdicts are automated assessments — not legal determinations.
Not affiliated with Government of India, RBI, UIDAI, CERT-IN, or any law enforcement agency.
Built by [ActiveMirror](https://activemirror.ai).
