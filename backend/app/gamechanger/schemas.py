from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )


RiskLevel = Literal["safe", "caution", "suspicious", "dangerous", "critical"]
Mode = Literal["message", "qr", "call", "job", "apk", "emergency"]
SourceChannel = Literal["whatsapp", "sms", "telegram", "email", "browser", "qr", "unknown"]
EmergencyTrigger = Literal[
    "apk_installed",
    "clicked_link",
    "paid_money",
    "qr_paid",
    "shared_otp",
    "gave_remote_access",
    "digital_arrest",
    "job_travel",
    "bank_account_draining",
]
EmergencySeverity = Literal["priority", "dangerous", "critical"]


class OfficialRail(CamelModel):
    rail_id: str
    name: str
    channel: str
    url: str
    contact: Optional[str] = None
    use_when: List[str] = Field(default_factory=list)
    verified_on: str
    source_url: str


class AnalyzeRequest(CamelModel):
    mode: Mode = "message"
    text: str = ""
    qr_payload: Optional[str] = None
    expected_merchant: Optional[str] = None
    expected_sender: Optional[str] = None
    user_says_receiving_money: bool = False
    physical_qr_looks_tampered: bool = False
    already_installed: bool = False
    already_paid: bool = False
    already_shared_otp: bool = False
    already_gave_remote_access: bool = False
    source_channel: SourceChannel = "unknown"
    destination_country: Optional[str] = None
    visa_type: Optional[str] = None
    recruiter_channel: Optional[str] = None
    passport_requested: bool = False
    agent_fee_inr: int = 0
    apk_permissions: List[str] = Field(default_factory=list)
    apk_file_name: Optional[str] = None


class AnalyzeResponse(CamelModel):
    mode: Mode
    risk_level: RiskLevel
    score: int = Field(ge=0, le=100)
    confidence: float = Field(ge=0, le=1)
    threat_types: List[str]
    evidence: List[str]
    missing_info: List[str]
    do_not_do: List[str]
    recommended_actions: List[str]
    share_warning: str
    insufficient_evidence: bool = False
    official_rails: List[OfficialRail] = Field(default_factory=list)


class EmergencyRequest(CamelModel):
    trigger: EmergencyTrigger
    threat_types: List[str] = Field(default_factory=list)
    notes: str = ""


class EmergencyResponse(CamelModel):
    incident_type: str
    severity: EmergencySeverity
    immediate_steps: List[str]
    preserve_evidence: List[str]
    do_not_do: List[str]
    official_rails: List[OfficialRail]
    escalation_order: List[str]
    handoff_script: str
