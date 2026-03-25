"""
Chetana B2B API Router — /api/v1/ endpoints with API key authentication.

Mount this onto the main FastAPI app:
    from app.b2b_router import b2b_router
    app.include_router(b2b_router)

All endpoints mirror the public API but require X-API-Key header,
enforce rate limits, and return structured JSON responses suitable
for machine consumption.
"""

from __future__ import annotations

from fastapi import APIRouter, Request, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
import httpx
import time

from app.api_keys import require_api_key

b2b_router = APIRouter(prefix="/api/v1", tags=["B2B API"])

KAVACH_URL = "http://127.0.0.1:8790"


# ── Models ────────────────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000, description="Message text to analyze")
    lang: str = Field("en", description="Language code (en, hi, ta, te)")

class LinkRequest(BaseModel):
    url: str = Field(..., description="URL to check against threat feeds")

class UPIRequest(BaseModel):
    upi_id: str = Field(..., description="UPI ID to validate (e.g. name@upi)")

class PhoneRequest(BaseModel):
    phone: str = Field(..., description="Phone number to check")

class ScanResponse(BaseModel):
    scan_id: str = ""
    verdict: str = Field(..., description="SAFE, SUSPICIOUS, or SCAM")
    score: int = Field(..., ge=0, le=100, description="Threat score 0-100")
    risk_level: str = ""
    signals: List[str] = []
    explanation: str = ""
    disclaimer: str = "This is an AI-assisted assessment, not legal advice. When in doubt, verify independently."


# ── Shared client ─────────────────────────────────────────────────────────

_client: httpx.AsyncClient | None = None

async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=30.0)
    return _client


# ── Endpoints ─────────────────────────────────────────────────────────────

@b2b_router.post("/scan", response_model=ScanResponse, summary="Scan text for scam indicators")
async def scan_text(req: ScanRequest, key_info: dict = Depends(require_api_key)):
    """Full text scan against live threat intelligence. Returns verdict + signals."""
    client = await _get_client()
    try:
        resp = await client.post(f"{KAVACH_URL}/scan", json={"text": req.text, "lang": req.lang})
        if resp.status_code == 200:
            data = resp.json()
            score = data.get("score", data.get("threat_score", 0))
            signals = data.get("signals", [])
            if score >= 70:
                verdict = "SCAM"
            elif score >= 40:
                verdict = "SUSPICIOUS"
            else:
                verdict = "SAFE"
            return ScanResponse(
                scan_id=data.get("scan_id", ""),
                verdict=verdict,
                score=score,
                risk_level=data.get("risk_level", ""),
                signals=signals,
                explanation=data.get("explanation", ""),
            )
        return ScanResponse(verdict="ERROR", score=0, explanation=f"Upstream error: {resp.status_code}")
    except httpx.ConnectError:
        return ScanResponse(verdict="ERROR", score=0, explanation="Detection engine unavailable")


@b2b_router.post("/link/check", summary="Check URL against threat feeds")
async def check_link(req: LinkRequest, key_info: dict = Depends(require_api_key)):
    """Check a URL against URLhaus (11K+ URLs), PhishTank (15K+ URLs), and AI analysis."""
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
    """Check a UPI ID for known scam patterns and threat feed matches."""
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
    """Check a phone number against known scam databases."""
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
    """Returns your current usage stats and limits."""
    from app.api_keys import TIERS
    tier = key_info["tier"]
    return {
        "name": key_info["name"],
        "tier": tier,
        "limits": TIERS[tier],
    }
