# Chetana — India's Free AI Scam Checker

**Live:** [chetana.activemirror.ai](https://chetana.activemirror.ai)

Paste any suspicious SMS, WhatsApp message, link, UPI ID, or phone number. Get an instant risk verdict — free, in seconds, in 12 Indian languages.

---

## What it checks

| Input | What Chetana does |
|-------|-------------------|
| SMS / WhatsApp message | Pattern match against 25+ scam types, urgency detection, impersonation signals |
| URL / link | Phishing database lookup, domain age, redirect chains, VirusTotal |
| UPI ID | Fraud database match, known scam UPI patterns |
| Phone number | Scam report lookup, telemarketer flags |
| Image / video | Deepfake detection (AI-powered) |
| Voice clip | AI voice clone detection |
| QR code | Decode + destination safety check |

**12 Indian languages:** English, Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Odia, Urdu

---

## API

Public REST API — no auth required for basic checks.

```
GET  /api/docs              # Interactive API docs (Swagger)
POST /api/scan/full         # Full text scan (message, SMS, forward)
POST /api/link/check        # URL / phishing check
POST /api/upi/check         # UPI ID fraud lookup
POST /api/phone/check       # Phone number scam lookup
POST /api/chat              # Conversational assistant
GET  /api/radar/public      # Live scam weather (India threat feed)
```

Example:
```bash
curl -X POST https://chetana.activemirror.ai/api/scan/full \
  -H "Content-Type: application/json" \
  -d '{"text": "Your KYC is expiring. Click here to update: bit.ly/xyz", "lang": "en"}'
```

Response:
```json
{
  "verdict": "SUSPICIOUS",
  "risk_score": 87,
  "why_flagged": ["KYC urgency trigger", "URL shortener redirect", "financial impersonation"],
  "action_eligibility": "WARN",
  "explanation": "..."
}
```

---

## Telegram Bot

[@chetnaShieldBot](https://t.me/chetnaShieldBot) — paste any message directly into Telegram.

Commands: `/check`, `/weather`, `/atlas`, `/help`

---

## Stack

- **Frontend:** Vite 5 + React 18 + TypeScript + Framer Motion
- **Backend:** FastAPI + Python 3.11
- **Intelligence:** Kavach — live threat feeds (PhishTank, URLhaus, OTX, VirusTotal, CERT-IN)
- **AI:** ActiveMirror MirrorDNA — scam pattern models, deepfake detection, voice clone analysis
- **Infra:** Cloudflare Tunnel → local FastAPI

---

## Self-host

```bash
git clone https://github.com/MirrorDNA-Reflection-Protocol/chetana-site.git
cd chetana-site/frontend && npm install && npm run dev
cd ../backend && pip install -r requirements.txt
uvicorn app.main:app --port 8093
```

The frontend dev server proxies API calls to `localhost:8093`.

---

## Emergency helplines

If you've been scammed:
- **National Cybercrime Helpline: 1930**
- **File a report: [cybercrime.gov.in](https://cybercrime.gov.in)**
- Women helpline: 181

Act within the first hour for the best chance of recovery.

---

## Legal

Advisory tool only. Verdicts are automated assessments — not legal determinations.
Not affiliated with Government of India, RBI, UIDAI, CERT-IN, or any law enforcement agency.
Built by [ActiveMirror](https://activemirror.ai) (N1 Intelligence) · Bengaluru, India.
