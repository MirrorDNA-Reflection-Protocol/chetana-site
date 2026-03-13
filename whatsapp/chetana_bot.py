"""
Chetana WhatsApp Bot — FSM for Jugalbandi Manager.

This file gets pasted into the JB Manager UI when installing the bot.
It defines the conversation flow for scam detection via WhatsApp.

Flow:
  1. User sends a suspicious message/link/UPI ID
  2. Bot calls Chetana /api/scan/full
  3. Bot returns verdict in user's language
  4. If high-risk, bot offers reporting guidance
"""
import httpx
from pydantic import BaseModel
from typing import Dict, Any, Optional
from jb_manager_bot import AbstractFSM
from jb_manager_bot.data_models import (
    FSMOutput, Message, MessageType, Status, FSMIntent,
    TextMessage, ButtonMessage, Option,
)

# When running inside Docker, host.docker.internal reaches the host machine.
# Change this if Chetana runs elsewhere.
CHETANA_URL = "http://host.docker.internal:8093"


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

    # -- State handlers --

    def on_enter_language_selection(self):
        self._on_enter_select_language()

    def on_enter_welcome(self):
        self.status = Status.WAIT_FOR_ME
        self.send_message(FSMOutput(
            intent=FSMIntent.SEND_MESSAGE,
            message=Message(
                message_type=MessageType.TEXT,
                text=TextMessage(
                    body=(
                        "Namaste! I'm Chetana, your scam detection assistant.\n\n"
                        "Forward me any suspicious message, link, or UPI ID "
                        "and I'll tell you if it's safe."
                    )
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
                text=TextMessage(
                    body="Please share the message or link you want to check:"
                ),
            ),
        ))
        self.status = Status.MOVE_FORWARD

    def on_enter_wait_input(self):
        self.status = Status.WAIT_FOR_USER_INPUT

    def on_enter_scan_calling(self):
        """Call Chetana's /api/scan/full endpoint."""
        self.status = Status.WAIT_FOR_ME
        self.variables.user_text = self.current_input

        # Show a "scanning" message
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
            self.variables.explanation = data.get(
                "explanation", "No details available."
            )
        except Exception:
            self.variables.threat_score = 0
            self.variables.risk_level = "ERROR"
            self.variables.explanation = (
                "Could not reach the scan service. Please try again later."
            )

        self.status = Status.MOVE_FORWARD

    def on_enter_show_result(self):
        self.status = Status.WAIT_FOR_ME
        score = self.variables.threat_score or 0
        risk = self.variables.risk_level or "UNKNOWN"
        expl = self.variables.explanation or ""

        indicators = {
            "SAFE": "SAFE",
            "LOW": "LOW RISK",
            "MEDIUM": "MEDIUM RISK",
            "HIGH": "HIGH RISK",
            "CRITICAL": "CRITICAL",
            "ERROR": "ERROR",
        }
        label = indicators.get(risk, "UNKNOWN")

        body = f"*{label}* (threat score: {score}/100)\n\n{expl}"
        self.send_message(FSMOutput(
            intent=FSMIntent.SEND_MESSAGE,
            message=Message(
                message_type=MessageType.TEXT,
                text=TextMessage(body=body),
            ),
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
                    header="",
                    footer="",
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
        self.variables.wants_report = (
            "yes" if ("yes" in inp or "1" in inp or "report" in inp) else "no"
        )
        self.status = Status.MOVE_FORWARD

    def on_enter_report_info(self):
        self.status = Status.WAIT_FOR_ME
        self.send_message(FSMOutput(
            intent=FSMIntent.SEND_MESSAGE,
            message=Message(
                message_type=MessageType.TEXT,
                text=TextMessage(
                    body=(
                        "To report this scam:\n\n"
                        "1. File a complaint at https://cybercrime.gov.in (NCRP)\n"
                        "2. Call 1930 (National Cyber Crime Helpline)\n"
                        "3. Screenshot the suspicious message as evidence\n"
                        "4. Block the sender\n\n"
                        "Stay safe!"
                    )
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
                text=TextMessage(
                    body="Stay alert, stay safe. Send me another message anytime."
                ),
            ),
        ))
        self.status = Status.MOVE_FORWARD

    # -- Conditions --

    def is_high_risk(self):
        return (self.variables.threat_score or 0) >= 60

    def wants_to_report(self):
        return self.variables.wants_report == "yes"
