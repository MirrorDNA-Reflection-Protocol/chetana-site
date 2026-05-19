"""
Chetana — P0 Incident Mode: FastAPI router.

Endpoints:
  POST /api/incident/start          → enter incident mode, returns Screen 1 (Stabilize)
  GET  /api/incident/status/{id}    → session state
  POST /api/incident/action         → drive the flow (next / alert_family / call_1930 / etc.)
  POST /api/incident/upi/decode     → UPI action decoder stub (P0)

Session store is in-memory (TTL-style dict).
Replace with Redis or DB for production.

P0 scope (from docs/03_IMPLEMENTATION_BACKLOG.md):
  - Incident Mode route + UI
  - Decision tree
  - 1930 CTA
  - Cybercrime portal handoff
  - Evidence capture stub
  - UPI action decoder endpoint stub
"""
from __future__ import annotations

import logging
import json
import time
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .decision_tree import (
    advance_step,
    build_family_screen,
    decode_upi_action,
    get_screen,
    resolve_category,
)
from .models import (
    FollowUpOutcome,
    IncidentActionRequest,
    IncidentActionResponse,
    IncidentCategory,
    IncidentSession,
    IncidentStartRequest,
    IncidentStartResponse,
    IncidentStatusResponse,
    IncidentStepName,
    RiskBand,
)

logger = logging.getLogger("chetana.incident")

router = APIRouter(prefix="/api/incident", tags=["incident"])

# ── Durable session store ────────────────────────────────────────────────────
_SESSION_ROOT = Path.home() / ".mirrordna" / "chetana" / "incident_sessions"
_SESSION_ROOT.mkdir(parents=True, exist_ok=True)
_SESSION_TTL_SECONDS = 7 * 24 * 3600  # 7 days


def _session_path(incident_id: str) -> Path:
    return _SESSION_ROOT / f"{incident_id}.json"


def _load_record(incident_id: str) -> dict[str, Any]:
    path = _session_path(incident_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Incident session {incident_id!r} not found.")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.error("Failed to read incident session %s: %s", incident_id, exc)
        raise HTTPException(status_code=500, detail="Incident session could not be loaded.")


def _find_session_by_scan(scan_id: str) -> IncidentSession | None:
    for path in _SESSION_ROOT.glob("*.json"):
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
            created_at = float(record.get("created_at_epoch", 0))
            session_data = record.get("session", {})
            if session_data.get("scan_id") != scan_id:
                continue
            if time.time() - created_at > _SESSION_TTL_SECONDS:
                path.unlink(missing_ok=True)
                continue
            session = IncidentSession.model_validate(session_data)
            if not session.completed:
                return session
        except Exception:
            continue
    return None


def _get_session(incident_id: str) -> IncidentSession:
    record = _load_record(incident_id)
    created_at = float(record.get("created_at_epoch", 0))
    if time.time() - created_at > _SESSION_TTL_SECONDS:
        _session_path(incident_id).unlink(missing_ok=True)
        raise HTTPException(status_code=410, detail="Incident session expired.")
    return IncidentSession.model_validate(record.get("session", {}))


def _save_session(session: IncidentSession) -> None:
    path = _session_path(session.incident_id)
    created_at = time.time()
    if path.exists():
        try:
            created_at = float(json.loads(path.read_text(encoding="utf-8")).get("created_at_epoch", created_at))
        except Exception:
            created_at = time.time()
    record = {
        "created_at_epoch": created_at,
        "updated_at_epoch": time.time(),
        "session": session.model_dump(mode="json"),
    }
    path.write_text(json.dumps(record, ensure_ascii=True, indent=2), encoding="utf-8")


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/start", response_model=IncidentStartResponse, summary="Enter incident mode")
async def start_incident(req: IncidentStartRequest) -> IncidentStartResponse:
    """
    Entry point: called when a scan result is RED (risk_level=red).
    Returns the first screen (Stabilize) and an incident_id for subsequent calls.

    CTA on result card: "Protect me now"
    """
    if req.risk_level not in (RiskBand.red, RiskBand.amber):
        raise HTTPException(
            status_code=400,
            detail="Incident mode is only available for red or amber risk results.",
        )

    if req.scan_id:
        existing = _find_session_by_scan(req.scan_id)
        if existing is not None:
            screen = get_screen(existing)
            logger.info("Incident resumed: id=%s category=%s risk=%s", existing.incident_id, existing.category, existing.risk_level)
            return IncidentStartResponse(
                incident_id=existing.incident_id,
                step=existing.current_step,
                screen=screen,
            )

    category = resolve_category(req.category, req.score)

    session = IncidentSession(
        scan_id=req.scan_id,
        risk_level=req.risk_level,
        category=category,
        score=req.score,
        processing_path=req.processing_path,
        guardian_recommended=req.guardian_recommended,
        raw_signals=req.raw_signals or [],
        current_step=IncidentStepName.stabilize,
        steps_visited=[IncidentStepName.stabilize],
    )
    _save_session(session)

    screen = get_screen(session)
    logger.info("Incident started: id=%s category=%s risk=%s", session.incident_id, category, req.risk_level)

    return IncidentStartResponse(
        incident_id=session.incident_id,
        step=session.current_step,
        screen=screen,
    )


@router.get("/status/{incident_id}", response_model=IncidentStatusResponse, summary="Session status")
async def get_status(incident_id: str) -> IncidentStatusResponse:
    """Current state of an incident session — step, category, guardian status."""
    session = _get_session(incident_id)
    return IncidentStatusResponse(
        incident_id=session.incident_id,
        current_step=session.current_step,
        category=session.category,
        risk_level=session.risk_level,
        completed=session.completed,
        steps_visited=session.steps_visited,
        guardian_alerted=session.guardian_alerted,
    )


@router.post("/action", response_model=IncidentActionResponse, summary="Drive incident flow")
async def incident_action(req: IncidentActionRequest) -> IncidentActionResponse:
    """
    Drive the incident flow forward.

    Actions:
      next              — advance to next screen
      alert_family      — mark guardian_alerted, then advance
      call_1930         — log CTA click (client dials tel:1930), no advance
      cybercrime_portal — log CTA click (client opens URL), no advance
      save_evidence     — stub: acknowledge, no advance (P1: real capture)
      follow_up_outcome — record follow-up result, mark completed
    """
    session = _get_session(req.incident_id)

    if session.completed:
        raise HTTPException(status_code=409, detail="Incident session already completed.")

    action = req.action.lower().strip()

    # ── Handle actions that don't advance the screen ──────────────────────────
    if action == "call_1930":
        logger.info("1930 CTA clicked: incident=%s", session.incident_id)
        # Client should dial tel:1930 — return current screen unchanged
        screen = get_screen(session)
        return IncidentActionResponse(
            incident_id=session.incident_id,
            step=session.current_step,
            screen=screen,
        )

    if action == "cybercrime_portal":
        logger.info("Cybercrime portal CTA clicked: incident=%s", session.incident_id)
        screen = get_screen(session)
        return IncidentActionResponse(
            incident_id=session.incident_id,
            step=session.current_step,
            screen=screen,
        )

    if action == "save_evidence":
        logger.info("Evidence capture triggered: incident=%s", session.incident_id)
        
        # Prepare payload for Kavach evidence bundle
        # In a real system, we'd fetch the actual scan result from Kavach or DB.
        # For this P1 integration, we reconstruct from session state.
        import httpx
        KAVACH_URL = "http://127.0.0.1:8790"
        
        scan_payload = {
            "threat_score": session.score or 0,
            "risk_level": session.risk_level.value,
            "signals": session.raw_signals,
            "category": session.category.value,
            "metadata": {"source_hash": session.scan_id or "manual_entry"}
        }
        
        bundle_req = {
            "scan_result": scan_payload,
            "notes": (req.payload or {}).get("notes", "Evidence captured via Chetana Incident Mode.")
        }
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(f"{KAVACH_URL}/api/evidence/bundle", json=bundle_req)
                if resp.status_code == 200:
                    data = resp.json()
                    session.evidence_pack_id = data.get("id")
                    _save_session(session)
                    logger.info("Evidence bundle created: %s", session.evidence_pack_id)
        except Exception as e:
            logger.error("Failed to create evidence bundle: %s", e)
            # Fallback: keep current screen, maybe show error in UI later

        screen = get_screen(session)
        return IncidentActionResponse(
            incident_id=session.incident_id,
            step=session.current_step,
            screen=screen,
        )

    # ── Alert family (Screen 1 or 4) ──────────────────────────────────────────
    if action == "alert_family":
        session.guardian_alerted = True
        _save_session(session)
        # If already on family screen, advance; otherwise go to family screen directly
        if session.current_step != IncidentStepName.family:
            session.current_step = IncidentStepName.family
            if IncidentStepName.family not in session.steps_visited:
                session.steps_visited.append(IncidentStepName.family)
            _save_session(session)
        screen = build_family_screen(session)
        return IncidentActionResponse(
            incident_id=session.incident_id,
            step=session.current_step,
            screen=screen,
        )

    # ── Record follow-up outcome (Screen 5) ───────────────────────────────────
    if action == "follow_up_outcome":
        if session.current_step != IncidentStepName.follow_up:
            raise HTTPException(
                status_code=400,
                detail="follow_up_outcome action only valid on follow_up screen.",
            )
        outcome_val = (req.payload or {}).get("outcome")
        if outcome_val:
            try:
                session.follow_up_outcome = FollowUpOutcome(outcome_val)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Unknown outcome: {outcome_val!r}")
        session.completed = True
        _save_session(session)
        logger.info(
            "Incident completed: id=%s outcome=%s", session.incident_id, session.follow_up_outcome
        )
        screen = get_screen(session)
        return IncidentActionResponse(
            incident_id=session.incident_id,
            step=session.current_step,
            screen=screen,
        )

    # ── Default: "next" — advance the flow ───────────────────────────────────
    if action == "next":
        session = advance_step(session)
        _save_session(session)
        screen = get_screen(session)
        return IncidentActionResponse(
            incident_id=session.incident_id,
            step=session.current_step,
            screen=screen,
        )

    raise HTTPException(status_code=400, detail=f"Unknown action: {action!r}")


# ── UPI decoder stub ──────────────────────────────────────────────────────────

class UPIDecodeRequest(BaseModel):
    upi_string: str


@router.post("/upi/decode", summary="Decode UPI action type (P0 stub)")
async def decode_upi(req: UPIDecodeRequest) -> dict[str, Any]:
    """
    P0 stub: classify what a UPI string is asking the user to do.
    Returns action_type, risk, explanation, safe_to_proceed.
    P1: integrate with Kavach UPI classifier at /api/upi/check.
    """
    result = decode_upi_action(req.upi_string)
    logger.info("UPI decode: input=%r action_type=%s risk=%s", req.upi_string[:60], result["action_type"], result["risk"])
    return result
