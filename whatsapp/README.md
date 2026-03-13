# Chetana WhatsApp Channel via Jugalbandi Manager

## What is Jugalbandi Manager?

[Jugalbandi Manager](https://github.com/OpenNyAI/Jugalbandi-Manager) (JB Manager) is an open-source (Apache 2.0) conversational chatbot platform built by OpenNyAI. It provides:

- **Multi-channel delivery**: WhatsApp, Telegram, custom web — one bot, many surfaces
- **Multilingual voice + text**: Bhashini speech models out of the box (with Azure fallback)
- **FSM-based conversation flows**: Python classes define states, transitions, conditions, and plugin calls
- **Kafka-based microservices**: channel, language, flow, retriever, indexer — loosely coupled via topics
- **pgvector + RAG**: Built-in document indexing and retrieval

### Why it fits Chetana

Chetana already has a working scam-detection backend at `localhost:8093` with `/api/scan/full` (accepts `{text, lang}`, returns threat score + signals + translated explanation). Jugalbandi gives us:

1. **WhatsApp delivery** — users forward suspicious messages to a WhatsApp number, get back a scam verdict in their language
2. **Bhashini translation** — JB Manager handles Hindi/Tamil/Telugu/etc. speech-to-text and translation natively, complementing Chetana's Sarvam-based translation
3. **Conversation state** — the FSM handles multi-turn flows (e.g., "scan this" -> result -> "report it" -> filing flow)
4. **No new backend needed** — we write a custom FSM that calls Chetana's existing API as a plugin

## Prerequisites

### Required

| Item | How to get it |
|------|---------------|
| **WhatsApp Business API access** | Apply via [Meta Business Suite](https://business.facebook.com/) or use a BSP (e.g., Gupshup, Twilio). You need a verified WABA (WhatsApp Business Account) with a phone number. |
| **Bhashini API key** | Register at [bhashini.gov.in](https://bhashini.gov.in/ulca/user/register). Get `BHASHINI_USER_ID`, `BHASHINI_API_KEY`, and `BHASHINI_PIPELINE_ID`. |
| **Docker + Docker Compose** | For running JB Manager's microservices locally or on a server. |
| **ngrok or public URL** | WhatsApp webhook callbacks need a public HTTPS endpoint. For dev, ngrok works. For prod, a real domain. |
| **Chetana backend running** | `localhost:8093` with `/api/scan/full` operational (proxies to Kavach at :8790). |

### Optional (but recommended)

| Item | Purpose |
|------|---------|
| Azure OpenAI API key | JB's FSM parser uses an LLM to interpret free-form user input into structured options |
| OpenAI API key | Alternative to Azure OpenAI for the parser |

## Architecture

```
User (WhatsApp)
    |
    v
WhatsApp Cloud API  -->  webhook callback
    |
    v
JB Manager (channel service)
    |  Kafka
    v
JB Manager (language service)  -- Bhashini STT/TTS/translate
    |  Kafka
    v
JB Manager (flow service)  -- runs ChetanaFSM
    |
    |  HTTP POST to localhost:8093/api/scan/full
    v
Chetana Backend (Kavach proxy)
    |
    v
Flow service formats response --> language service --> channel service --> WhatsApp
```

## Step-by-Step Setup

### 1. Clone Jugalbandi Manager

```bash
cd ~/repos
git clone https://github.com/OpenNyAI/Jugalbandi-Manager.git
cd Jugalbandi-Manager
```

### 2. Configure environment

Copy the env template and fill in required values:

```bash
cp .env.template .env
```

Minimum `.env` values:

```env
# -- Server --
SERVER_HOST=http://localhost:8000

# -- Kafka (local, no SASL) --
KAFKA_BROKER=kafka:9092
KAFKA_USE_SASL=false
KAFKA_LANGUAGE_TOPIC=language
KAFKA_FLOW_TOPIC=flow
KAFKA_RETRIEVER_TOPIC=retriever
KAFKA_INDEXER_TOPIC=indexer
KAFKA_CHANNEL_TOPIC=channel

# -- Postgres --
POSTGRES_DATABASE_USERNAME=postgres
POSTGRES_DATABASE_PASSWORD=postgres
POSTGRES_DATABASE_HOST=postgres
POSTGRES_DATABASE_NAME=postgres
POSTGRES_DATABASE_PORT=5432

# -- Bhashini (required for multilingual) --
BHASHINI_USER_ID=<your-bhashini-user-id>
BHASHINI_API_KEY=<your-bhashini-api-key>
BHASHINI_PIPELINE_ID=<your-bhashini-pipeline-id>

# -- WhatsApp --
WA_API_HOST=https://graph.facebook.com/v17.0

# -- Storage (local for dev) --
STORAGE_TYPE=local

# -- Encryption --
ENCRYPTION_KEY=<generate-with-python: from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())>
```

### 3. Write the Chetana FSM bot

Create `chetana_bot.py` (see `docs/tutorials/car_wash.py` for the pattern). The FSM:

```python
"""
Chetana WhatsApp Bot — FSM for Jugalbandi Manager.

Flow:
  1. User sends a message (text or forwarded WhatsApp message)
  2. Bot asks what they want to check (or auto-detects)
  3. Bot calls Chetana /api/scan/full with the text
  4. Bot returns the verdict in the user's language
  5. If high-risk, bot offers to help file a report
"""
import httpx
from pydantic import BaseModel
from typing import Dict, Any, Optional
from jb_manager_bot import AbstractFSM
from jb_manager_bot.data_models import (
    FSMOutput, Message, MessageType, Status, FSMIntent,
    TextMessage, ButtonMessage, Option,
)

CHETANA_URL = "http://host.docker.internal:8093"  # Docker -> host machine


class ChetanaVariables(BaseModel):
    user_text: Optional[str] = None
    scan_result: Optional[dict] = None
    threat_score: Optional[int] = None
    risk_level: Optional[str] = None
    explanation: Optional[str] = None
    wants_report: Optional[str] = None


class ChetanaFSM(AbstractFSM):
    states = [
        "zero",
        "language_selection",
        "welcome",
        "ask_input",
        "wait_input",
        "scan_calling",
        "show_result",
        "ask_report",
        "wait_report",
        "report_logic",
        "report_info",
        "goodbye",
        "end",
    ]
    transitions = [
        {"source": "zero", "dest": "language_selection", "trigger": "next"},
        {"source": "language_selection", "dest": "welcome", "trigger": "next"},
        {"source": "welcome", "dest": "ask_input", "trigger": "next"},
        {"source": "ask_input", "dest": "wait_input", "trigger": "next"},
        {"source": "wait_input", "dest": "scan_calling", "trigger": "next"},
        {"source": "scan_calling", "dest": "show_result", "trigger": "next"},
        {"source": "show_result", "dest": "ask_report", "trigger": "next",
         "conditions": "is_high_risk"},
        {"source": "show_result", "dest": "goodbye", "trigger": "next"},
        {"source": "ask_report", "dest": "wait_report", "trigger": "next"},
        {"source": "wait_report", "dest": "report_logic", "trigger": "next"},
        {"source": "report_logic", "dest": "report_info", "trigger": "next",
         "conditions": "wants_to_report"},
        {"source": "report_logic", "dest": "goodbye", "trigger": "next"},
        {"source": "report_info", "dest": "goodbye", "trigger": "next"},
        {"source": "goodbye", "dest": "end", "trigger": "next"},
    ]
    conditions = {"is_high_risk", "wants_to_report"}
    output_variables = set()
    variable_names = ChetanaVariables

    def __init__(self, send_message, credentials=None):
        self.credentials = credentials or {}
        self.variables = self.variable_names()
        super().__init__(send_message=send_message)

    def on_enter_language_selection(self):
        self._on_enter_select_language()

    def on_enter_welcome(self):
        self.status = Status.WAIT_FOR_ME
        self.send_message(FSMOutput(
            intent=FSMIntent.SEND_MESSAGE,
            message=Message(
                message_type=MessageType.TEXT,
                text=TextMessage(
                    body="Namaste! I'm Chetana. Forward me any suspicious message, "
                         "link, or UPI ID and I'll tell you if it's a scam."
                ),
            ),
        ))
        self.status = Status.MOVE_FORWARD

    def on_enter_ask_input(self):
        self.status = Status.WAIT_FOR_ME
        self.send_message(FSMOutput(
            intent=FSMIntent.SEND_MESSAGE,
            message=Message(
                message_type=MessageType.TEXT,
                text=TextMessage(body="Please share the message or link you want to check:"),
            ),
        ))
        self.status = Status.MOVE_FORWARD

    def on_enter_wait_input(self):
        self.status = Status.WAIT_FOR_USER_INPUT

    def on_enter_scan_calling(self):
        self.status = Status.WAIT_FOR_ME
        self.variables.user_text = self.current_input
        self.send_message(FSMOutput(
            intent=FSMIntent.SEND_MESSAGE,
            message=Message(
                message_type=MessageType.TEXT,
                text=TextMessage(body="Scanning... one moment."),
            ),
        ))
        try:
            resp = httpx.post(
                f"{CHETANA_URL}/api/scan/full",
                json={"text": self.variables.user_text, "lang": "en"},
                timeout=15.0,
            )
            data = resp.json()
            self.variables.scan_result = data
            self.variables.threat_score = data.get("threat_score", 0)
            self.variables.risk_level = data.get("risk_level", "UNKNOWN")
            self.variables.explanation = data.get("explanation", "No details available.")
        except Exception:
            self.variables.threat_score = 0
            self.variables.risk_level = "ERROR"
            self.variables.explanation = "Could not reach the scan service. Try again later."
        self.status = Status.MOVE_FORWARD

    def on_enter_show_result(self):
        self.status = Status.WAIT_FOR_ME
        score = self.variables.threat_score or 0
        risk = self.variables.risk_level or "UNKNOWN"
        expl = self.variables.explanation or ""
        emoji = {"SAFE": "✅", "LOW": "🟡", "MEDIUM": "🟠", "HIGH": "🔴", "CRITICAL": "🚨"}.get(risk, "❓")
        body = f"{emoji} *Risk: {risk}* (score {score}/100)\n\n{expl}"
        self.send_message(FSMOutput(
            intent=FSMIntent.SEND_MESSAGE,
            message=Message(message_type=MessageType.TEXT, text=TextMessage(body=body)),
        ))
        self.status = Status.MOVE_FORWARD

    def on_enter_ask_report(self):
        self.status = Status.WAIT_FOR_ME
        self.send_message(FSMOutput(
            intent=FSMIntent.SEND_MESSAGE,
            message=Message(
                message_type=MessageType.BUTTON,
                button=ButtonMessage(
                    body="This looks risky. Would you like help reporting it?",
                    header="", footer="",
                    options=[
                        Option(option_id="1", option_text="Yes, help me report"),
                        Option(option_id="2", option_text="No thanks"),
                    ],
                ),
            ),
        ))
        self.status = Status.MOVE_FORWARD

    def on_enter_wait_report(self):
        self.status = Status.WAIT_FOR_USER_INPUT

    def on_enter_report_logic(self):
        self.status = Status.WAIT_FOR_ME
        inp = (self.current_input or "").lower()
        self.variables.wants_report = "yes" if "yes" in inp or "1" in inp else "no"
        self.status = Status.MOVE_FORWARD

    def on_enter_report_info(self):
        self.status = Status.WAIT_FOR_ME
        self.send_message(FSMOutput(
            intent=FSMIntent.SEND_MESSAGE,
            message=Message(
                message_type=MessageType.TEXT,
                text=TextMessage(
                    body="To report this scam:\n"
                         "1. File at https://cybercrime.gov.in (NCRP)\n"
                         "2. Call 1930 (Cyber Crime Helpline)\n"
                         "3. Screenshot the message as evidence\n\n"
                         "Stay safe!"
                ),
            ),
        ))
        self.status = Status.MOVE_FORWARD

    def on_enter_goodbye(self):
        self.status = Status.WAIT_FOR_ME
        self.send_message(FSMOutput(
            intent=FSMIntent.SEND_MESSAGE,
            message=Message(
                message_type=MessageType.TEXT,
                text=TextMessage(body="Stay alert, stay safe. Send me another message anytime."),
            ),
        ))
        self.status = Status.MOVE_FORWARD

    def is_high_risk(self):
        return (self.variables.threat_score or 0) >= 60

    def wants_to_report(self):
        return self.variables.wants_report == "yes"
```

### 4. Start JB Manager with Chetana config

Use the docker-compose scaffold in this directory:

```bash
cd ~/repos/chetana-site/whatsapp
docker compose up -d
```

This starts Kafka, Postgres, and the JB Manager services. Chetana's backend stays on the host at `:8093`.

### 5. Install the bot via JB Manager UI

1. Open `http://localhost:4173` (JB Manager frontend)
2. Click "Install new bot"
3. Paste the full contents of `chetana_bot.py` as the FSM
4. Set bot name: `chetana-whatsapp`
5. No extra credentials needed (Chetana API has no auth)
6. For WhatsApp channel: enter your WABA phone number
7. Set the webhook callback URL:
   - Dev: `https://<your-ngrok-id>.ngrok.io`
   - Prod: `https://your-domain.com`
   - Register this URL in Meta Business Suite -> WhatsApp -> Configuration -> Webhook URL
8. Activate the bot (click play icon)

### 6. Configure WhatsApp webhook

In Meta Business Suite:
1. Go to WhatsApp > Configuration
2. Set Webhook URL to: `http(s)://<your-server>:8000/channel/whatsapp/webhook`
3. Set Verify Token to match your JB Manager config
4. Subscribe to `messages` webhook field

### 7. Test

Send a message to your WhatsApp Business number. The flow:
- User: "Is this a scam? You have won Rs 50 lakh in KBC lottery..."
- Chetana (via JB): scans, returns HIGH risk with explanation
- Chetana: offers to help report

## Estimated Effort

| Task | Time | Notes |
|------|------|-------|
| WhatsApp Business API approval | 1-7 days | Meta review process; can be instant with a BSP |
| Bhashini API registration | 1 day | Usually approved same day |
| JB Manager local setup | 2-3 hours | Docker compose, env config, verify services start |
| Write + test ChetanaFSM | 4-6 hours | FSM code above is 80% done; needs testing with real JB Manager |
| ngrok / public URL setup | 30 min | For dev testing |
| WhatsApp webhook config | 1 hour | Meta Business Suite configuration |
| End-to-end testing | 2-3 hours | Multi-language, voice messages, edge cases |
| **Total (dev ready)** | **~2-3 days** | Excludes WABA approval wait time |

## What This Does NOT Cover

- **Production deployment**: You'll need a real server, TLS, monitoring, rate limiting
- **Voice message handling**: JB Manager supports it via Bhashini STT, but the FSM above only handles text. Add a voice-to-text state if needed.
- **Conversation history / analytics**: JB Manager has Metabase built in, but dashboards need configuration
- **Multiple bot instances**: The scaffold assumes one bot; JB Manager supports many

## Key Files

| File | Purpose |
|------|---------|
| `README.md` | This file |
| `docker-compose.yml` | Minimal JB Manager + Chetana scaffold |
| `chetana_bot.py` | FSM bot code (copy into JB Manager UI) |

## References

- [Jugalbandi Manager repo](https://github.com/OpenNyAI/Jugalbandi-Manager)
- [JB Manager docs](https://opennyai.github.io/Jugalbandi-Manager/)
- [WhatsApp Cloud API docs](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Bhashini registration](https://bhashini.gov.in/ulca/user/register)
- [Chetana /api/scan/full](http://localhost:8093/docs) — accepts `{text: str, lang: str}`, returns threat assessment
