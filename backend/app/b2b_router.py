"""
Chetana Partner API Router — /api/v1/ endpoints with API key authentication.

This is the institutional lane for banks, merchants, platforms, and public-sector
teams that need machine-friendly scam detection plus recovery guidance.
"""

from __future__ import annotations

from typing import Any, List, Literal, Optional

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api_keys import require_api_key
from app.scan_guidance import enrich_v0_verdict
from app.v0_runtime import (
    V0ScanInput,
    V0TrustRuntimeRequest,
    analyze_scan,
    build_recovery_packet,
    build_trust_bundle,
)

b2b_router = APIRouter(prefix="/api/v1", tags=["Partner API"])

KAVACH_URL = "http://127.0.0.1:8790"


class ScanRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=20000, description="Message, transcript, OCR text, or payment context to analyze")
    lang: str = Field("en", description="Language hint (en, hi, ta, te, etc.)")
    input_type: Literal["text", "payment_screenshot", "qr_image", "mixed", "screenshot"] = Field(
        "text",
        description="Observed surface for the intake payload",
    )
    source_name: Optional[str] = Field(None, description="Optional source system or channel name")
    money_moved: bool = Field(False, description="Whether money has already moved")
    goods_released: bool = Field(False, description="Whether goods or access were already released")


class LinkRequest(BaseModel):
    url: str = Field(..., description="URL to check against threat feeds")


class UPIRequest(BaseModel):
    upi_id: str = Field(..., description="UPI ID to validate (e.g. name@upi)")


class PhoneRequest(BaseModel):
    phone: str = Field(..., description="Phone number to check")


class PartnerScanResponse(BaseModel):
    scan_id: str
    verdict: str = Field(..., description="high_risk, caution, needs_review, or low_signal")
    risk_level: str
    confidence_band: str
    evidence_state: str
    incident_state: str
    scam_type: str
    score: int = Field(..., ge=0, le=100, description="Normalized risk score for routing and queueing")
    reason_codes: List[str] = Field(default_factory=list)
    reasons: List[str] = Field(default_factory=list)
    recommended_actions: List[str] = Field(default_factory=list)
    safe_next_step: Optional[str] = None
    guidance: dict[str, Any] = Field(default_factory=dict)
    disclaimer: str = (
        "Automated trust assessment only. Use official institutional review and recovery processes for final action."
    )


_client: httpx.AsyncClient | None = None


async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=30.0)
    return _client


def _normalized_score(verdict_value: str, confidence_band: str, incident_state: str) -> int:
    base = {
        "high_risk": 82,
        "caution": 58,
        "needs_review": 38,
        "low_signal": 14,
    }.get(verdict_value, 20)
    confidence_adj = {"high": 6, "medium": 0, "low": -6}.get(confidence_band, 0)
    incident_adj = {
        "device_access_requested": 6,
        "payment_attempted": 5,
        "payment_requested": 3,
        "active_coercion": 2,
        "suspected": 0,
    }.get(incident_state, 0)
    return max(0, min(100, base + confidence_adj + incident_adj))


async def _run_partner_scan(req: ScanRequest):
    verdict = analyze_scan(
        V0ScanInput(
            input_type=req.input_type,
            text=req.text,
            language_hint=req.lang,
            source_name=req.source_name,
        )
    )
    verdict = await enrich_v0_verdict(verdict)
    score = _normalized_score(verdict.verdict, verdict.confidence_band, verdict.incident_state)
    response = PartnerScanResponse(
        scan_id=verdict.scan_id,
        verdict=verdict.verdict,
        risk_level=verdict.risk_level,
        confidence_band=verdict.confidence_band,
        evidence_state=verdict.evidence_state,
        incident_state=verdict.incident_state,
        scam_type=verdict.scam_type,
        score=score,
        reason_codes=[reason.code for reason in verdict.reasons],
        reasons=[reason.explanation for reason in verdict.reasons],
        recommended_actions=verdict.recommended_actions,
        safe_next_step=verdict.safe_next_step,
        guidance=verdict.guidance.model_dump(),
    )
    return verdict, response


@b2b_router.get("/capabilities", summary="Describe institutional API surfaces")
async def capabilities(key_info: dict = Depends(require_api_key)):
    return {
        "product": "Chetana Partner API",
        "positioning": "Verify-before-action trust and recovery API for banks, platforms, merchants, and public-sector fraud teams.",
        "surfaces": [
            "text and transcript intake",
            "payment screenshot and QR review",
            "trust bundle for send guard and recovery",
            "official recovery rails and handoff scripts",
            "link, UPI, and phone thin checks",
        ],
        "key_holder": key_info["name"],
    }


@b2b_router.post("/scan", response_model=PartnerScanResponse, summary="Canonical institutional scam scan")
async def scan_text(req: ScanRequest, key_info: dict = Depends(require_api_key)):
    """Run the canonical Chetana trust contract for institutional workflows."""
    _, response = await _run_partner_scan(req)
    return response


@b2b_router.post("/trust/bundle", summary="Full trust bundle for institutional decisioning")
async def trust_bundle(req: ScanRequest, key_info: dict = Depends(require_api_key)):
    """Return scan contract plus send-guard, merchant, and recovery outputs."""
    verdict, response = await _run_partner_scan(req)
    bundle = build_trust_bundle(
        V0TrustRuntimeRequest(
            verdict=verdict,
            input_text=req.text,
            source_name=req.source_name,
            money_moved=req.money_moved,
            goods_released=req.goods_released,
        )
    )
    return {
        "scan": response.model_dump(),
        "trust_bundle": bundle.model_dump(),
    }


@b2b_router.post("/recovery", summary="Recovery-only packet for active incidents")
async def recovery(req: ScanRequest, key_info: dict = Depends(require_api_key)):
    """Return the structured recovery packet for official rails and escalation order."""
    verdict, response = await _run_partner_scan(req)
    packet = build_recovery_packet(
        V0TrustRuntimeRequest(
            verdict=verdict,
            input_text=req.text,
            source_name=req.source_name,
            money_moved=req.money_moved,
            goods_released=req.goods_released,
        )
    )
    return {
        "scan": response.model_dump(),
        "recovery_packet": packet.model_dump(),
    }


@b2b_router.post("/link/check", summary="Check URL against threat feeds")
async def check_link(req: LinkRequest, key_info: dict = Depends(require_api_key)):
    client = await _get_client()
    try:
        resp = await client.post(f"{KAVACH_URL}/api/link/check", json={"url": req.url, "lang": "en"})
        if resp.status_code == 200:
            return resp.json()
        return {"error": f"Upstream error: {resp.status_code}"}
    except httpx.ConnectError:
        return {"error": "Detection engine unavailable"}


@b2b_router.post("/upi/check", summary="Validate UPI ID")
async def check_upi(req: UPIRequest, key_info: dict = Depends(require_api_key)):
    client = await _get_client()
    try:
        resp = await client.post(f"{KAVACH_URL}/api/upi/check", json={"upi_id": req.upi_id})
        if resp.status_code == 200:
            return resp.json()
        return {"error": f"Upstream error: {resp.status_code}"}
    except httpx.ConnectError:
        return {"error": "Detection engine unavailable"}


@b2b_router.post("/phone/check", summary="Check phone number")
async def check_phone(req: PhoneRequest, key_info: dict = Depends(require_api_key)):
    client = await _get_client()
    try:
        resp = await client.post(f"{KAVACH_URL}/api/phone/check", json={"phone": req.phone})
        if resp.status_code == 200:
            return resp.json()
        return {"error": f"Upstream error: {resp.status_code}"}
    except httpx.ConnectError:
        return {"error": "Detection engine unavailable"}


@b2b_router.get("/usage", summary="Check your API usage")
async def check_usage(key_info: dict = Depends(require_api_key)):
    from app.api_keys import TIERS

    tier = key_info["tier"]
    return {
        "name": key_info["name"],
        "tier": tier,
        "limits": TIERS[tier],
        "positioning": "Use /api/v1/scan for machine-safe verdicts, /api/v1/trust/bundle for full recovery-aware decisions.",
    }
