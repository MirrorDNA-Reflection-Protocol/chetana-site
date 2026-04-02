# Chetana v0

**Live:** [chetana.activemirror.ai](https://chetana.activemirror.ai)

Chetana v0 is a simple check-before-you-act tool for suspicious digital messages and payment requests in India.

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
- QR or UPI payment requests
- payment confirmation screenshots that may be fake

## Core output

Each scan returns:

- verdict: `safe`, `risky`, or `unclear`
- scam type
- plain-language reasons
- confidence band
- safest next action
- optional share shield
- optional evidence pack

## v0 principles

- only three verdict states
- if evidence is weak, default to `unclear`
- show reasons, not just labels
- keep official recovery rails visible
- do not fake certainty
- do not imply government affiliation

## v0 API

Public `v0` endpoints added in this build:

```bash
POST /api/v0/scan
POST /api/v0/evidence
POST /api/v0/events
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
- **v0 runtime:** deterministic verdict engine plus evidence and event logging
- **Infra:** FastAPI serves the built frontend

## Local dev

```bash
git clone https://github.com/MirrorDNA-Reflection-Protocol/chetana-site.git
cd chetana-site/frontend && npm install && npm run dev
cd ../backend && pip install -r requirements.txt
uvicorn app.main:app --port 8093
```

## Recovery rails

If you've been scammed:
- **National Cybercrime Helpline: 1930**
- **File a report: [cybercrime.gov.in](https://cybercrime.gov.in)**
- Women helpline: 181

Act within the first hour for the best chance of recovery.

## Legal

Advisory tool only. Verdicts are automated assessments — not legal determinations.
Not affiliated with Government of India, RBI, UIDAI, CERT-IN, or any law enforcement agency.
Built by [ActiveMirror](https://activemirror.ai).
