# Chetana

**Automated scam detection for Indian consumers -- SMS, WhatsApp, UPI, deepfakes, voice clones -- across 12 Indian languages.**

[![Live](https://img.shields.io/badge/live-chetana.activemirror.ai-0a66c2)](https://chetana.activemirror.ai)
[![License: MIT](https://img.shields.io/badge/license-MIT-grey.svg)](LICENSE)

---

Chetana is a check-before-you-act tool that turns suspicious digital content into a clear next step. Paste a message, upload a screenshot, or submit a UPI ID -- Chetana returns a verdict, an explanation, and a recommended action. It does not guess when evidence is weak: unclear inputs receive an `unclear` verdict, not a false confidence score.

Live at [chetana.activemirror.ai](https://chetana.activemirror.ai).

## How It Works

```
+------------------+       +------------------+       +------------------+
|   User Input     |       |  Verdict Engine  |       |     Response     |
|                  | ----> |                  | ----> |                  |
|  Text, image,    |       |  Deterministic   |       |  Verdict + type  |
|  QR code, UPI ID |       |  classification  |       |  + reasons +     |
|                  |       |  + evidence log  |       |  next action     |
+------------------+       +------------------+       +------------------+
                                    |
                                    v
                           +------------------+
                           |  Evidence Pack   |
                           |  (optional)      |
                           |  Shareable proof |
                           +------------------+
```

**Supported input types:**
- Suspicious text from WhatsApp, SMS, email, Telegram, or social media
- Screenshots of suspicious messages
- QR codes and UPI payment requests
- Payment confirmation screenshots (fake receipt detection)

**Output for every scan:**
- Verdict: `safe`, `risky`, or `unclear` -- three states only, no ambiguity
- Scam type classification
- Plain-language reasoning
- Confidence band
- Recommended next action
- Optional share shield and evidence pack

## API

Chetana exposes a public v0 API for programmatic scam checks.

```bash
# Scan a suspicious message
curl -X POST https://chetana.activemirror.ai/api/v0/scan \
  -H "Content-Type: application/json" \
  -d '{
    "input_type": "text",
    "text": "Urgent: your bank account will be blocked today. Pay Rs 500 now.",
    "language_hint": "en",
    "session_id": "example-session"
  }'
```

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v0/scan` | Submit content for scam analysis |
| `POST /api/v0/evidence` | Retrieve evidence pack for a scan |
| `POST /api/v0/events` | Event logging |

## Architecture

| Layer | Technology |
|-------|------------|
| Frontend | Vite 5, React 18, TypeScript, Tailwind CSS, Framer Motion |
| Backend | FastAPI, Python 3.11, Pydantic |
| OCR | Tesseract.js (client-side image text extraction) |
| On-device ML | Hugging Face Transformers (browser inference) |
| Deployment | FastAPI serves the built frontend as a single-origin application |

## Local Development

```bash
git clone https://github.com/MirrorDNA-Reflection-Protocol/chetana-site.git
cd chetana-site

# Frontend
cd frontend
npm install
npm run dev

# Backend (separate terminal)
cd backend
pip install -r requirements.txt
uvicorn app.main:app --port 8093
```

## Design Principles

- **Three verdicts only.** `safe`, `risky`, or `unclear`. No numeric risk scores that imply false precision.
- **Default to unclear.** When evidence is weak, the system says so rather than guessing.
- **Show reasoning.** Every verdict includes the factors that produced it.
- **Surface recovery rails.** Official reporting channels are always visible, never buried.
- **No government affiliation.** Chetana is an advisory tool. Verdicts are automated assessments, not legal determinations.

## Recovery Resources

If you have been scammed:

- **National Cybercrime Helpline: 1930**
- **File a report: [cybercrime.gov.in](https://cybercrime.gov.in)**
- Women helpline: 181

Act within the first hour for the best chance of recovery.

## Compliance

Chetana is built within the Active Mirror governed AI framework. See [COMPLIANCE.md](COMPLIANCE.md) for control mappings against the EU AI Act, India DPDP Act 2023, SOC 2 Type II, and ISO 27001:2022.

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md). Do not use public GitHub issues for security reports.

---

Not affiliated with the Government of India, RBI, UIDAI, CERT-IN, or any law enforcement agency.

Built by [Active Mirror](https://activemirror.ai) -- governed AI for institutional work.
