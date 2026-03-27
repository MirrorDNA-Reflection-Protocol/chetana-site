"""
Chetana — P0 Incident Mode: Pydantic models.

Mirrors the IncidentModeResult JSON schema from:
  Chetana_Final_Pack_2026-03-23/api/incident_mode.schema.json

5-screen flow: Stabilize → WhatThisIs → NextActions → Family → FollowUp
"""
from __future__ import annotations

from enum import Enum
from typing import Any, List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


# ── Enumerations ──────────────────────────────────────────────────────────────

class RiskBand(str, Enum):
    green  = "green"
    amber  = "amber"
    red    = "red"


class ConfidenceBand(str, Enum):
    high   = "high"
    medium = "medium"
    low    = "low"


class IncidentCategory(str, Enum):
    authority_impersonation = "authority_impersonation"
    digital_arrest          = "digital_arrest"
    kyc                     = "kyc"
    upi_collect             = "upi_collect"
    qr                      = "qr"
    linking                 = "linking"     # device/WhatsApp/account linking
    investment_job_mule     = "investment_job_mule"
    unknown                 = "unknown"


class ProcessingPath(str, Enum):
    local  = "local"
    remote = "remote"
    mixed  = "mixed"


class IncidentStepName(str, Enum):
    stabilize    = "stabilize"
    what_this_is = "what_this_is"
    next_actions = "next_actions"
    family       = "family"
    follow_up    = "follow_up"


class FollowUpOutcome(str, Enum):
    money_sent       = "money_sent"
    account_linked   = "account_linked"
    reported         = "reported"
    no_action        = "no_action"
    need_callback    = "need_callback"


# ── Request / Response bodies ─────────────────────────────────────────────────

class IncidentStartRequest(BaseModel):
    """
    Caller sends a risk_level + optional category hint to enter incident mode.
    The scan_id links back to the originating scan result.
    """
    scan_id:          Optional[str]               = Field(None, description="Originating scan result ID")
    risk_level:       RiskBand                    = Field(RiskBand.red, description="Risk band from scanner")
    category:         Optional[IncidentCategory]  = Field(None, description="Category hint from scanner")
    score:            Optional[int]               = Field(None, ge=0, le=100, description="Scam score 0-100")
    processing_path:  ProcessingPath              = Field(ProcessingPath.local)
    guardian_recommended: bool                    = Field(False)
    raw_signals:      Optional[List[str]]         = Field(None, description="Red-flag signals from scan")


class IncidentStartResponse(BaseModel):
    incident_id:    str
    step:           IncidentStepName
    screen:         "StabilizeScreen"


class IncidentStatusResponse(BaseModel):
    incident_id:    str
    current_step:   IncidentStepName
    category:       Optional[IncidentCategory]
    risk_level:     RiskBand
    completed:      bool
    steps_visited:  List[IncidentStepName]
    guardian_alerted: bool


class IncidentActionRequest(BaseModel):
    incident_id:    str
    action:         str   # "next", "alert_family", "call_1930", "cybercrime_portal",
                          # "save_evidence", "follow_up_outcome"
    payload:        Optional[dict[str, Any]] = None


class IncidentActionResponse(BaseModel):
    incident_id:    str
    step:           IncidentStepName
    screen:         Any   # one of the Screen models below


# ── Per-screen content models ─────────────────────────────────────────────────

class StabilizeScreen(BaseModel):
    """Screen 1 — immediate do-not-panic anchors."""
    step: IncidentStepName = IncidentStepName.stabilize
    headline: str
    do_nots: List[str]
    ctas: List[str]           # ["next", "alert_family", "call_1930"]
    processing_disclosure: str


class WhatThisIsScreen(BaseModel):
    """Screen 2 — category diagnosis."""
    step: IncidentStepName = IncidentStepName.what_this_is
    category: IncidentCategory
    category_label: str
    explanation: str
    known_signals: List[str]
    suspected_signals: List[str]
    trust_note: str           # "Here is what is known / suspected / needs verification"


class NextActionsScreen(BaseModel):
    """Screen 3 — 3 concrete steps + CTA buttons."""
    step: IncidentStepName = IncidentStepName.next_actions
    actions: List[str]
    ctas: List[str]           # ["call_1930", "cybercrime_portal", "save_evidence"]
    helpline: str             # "1930"
    portal_url: str           # "https://cybercrime.gov.in"
    evidence_stub: bool       # evidence capture stub (P0: stub only)


class FamilyScreen(BaseModel):
    """Screen 4 — Parivar / guardian alert."""
    step: IncidentStepName = IncidentStepName.family
    prompt: str
    options: List[str]        # ["share_alert", "guardian_notified", "checking_for_parent"]
    consent_note: str


class FollowUpScreen(BaseModel):
    """Screen 5 — post-incident triage."""
    step: IncidentStepName = IncidentStepName.follow_up
    question: str
    options: List[FollowUpOutcome]
    callback_guidance_available: bool


# ── In-memory session store (production: replace with Redis / DB) ─────────────

class IncidentSession(BaseModel):
    incident_id:      str               = Field(default_factory=lambda: str(uuid4()))
    scan_id:          Optional[str]     = None
    risk_level:       RiskBand          = RiskBand.red
    category:         IncidentCategory  = IncidentCategory.unknown
    score:            Optional[int]     = None
    processing_path:  ProcessingPath    = ProcessingPath.local
    guardian_recommended: bool          = False
    raw_signals:      List[str]         = Field(default_factory=list)
    current_step:     IncidentStepName  = IncidentStepName.stabilize
    steps_visited:    List[IncidentStepName] = Field(default_factory=list)
    guardian_alerted: bool              = False
    completed:        bool              = False
    follow_up_outcome: Optional[FollowUpOutcome] = None
    evidence_pack_id:  Optional[str]     = None  # Result of P1: real capture
