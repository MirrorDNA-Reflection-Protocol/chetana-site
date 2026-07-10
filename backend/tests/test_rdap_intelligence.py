from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient

from app.main import app
from app.rdap_intelligence import RdapClient, RdapLookupError, normalize_domain


def test_normalize_domain_removes_url_path_and_rejects_ip() -> None:
    assert normalize_domain("https://Login.Example.in/pay?token=private") == "login.example.in"
    try:
        normalize_domain("https://127.0.0.1/private")
        raise AssertionError("IP addresses must not enter the RDAP domain path")
    except RdapLookupError as exc:
        assert exc.code == "domain_ip_not_supported"


def test_recent_domain_is_supporting_evidence_not_a_verdict() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == "https://data.iana.org/rdap/dns.json":
            return httpx.Response(200, json={"services": [[["in"], ["https://rdap.test"]]]})
        return httpx.Response(
            200,
            json={
                "events": [{"eventAction": "registration", "eventDate": "2026-07-01T00:00:00Z"}],
                "status": ["active"],
                "nameservers": [{"ldhName": "ns1.example"}],
                "entities": [
                    {
                        "roles": ["registrar"],
                        "vcardArray": ["vcard", [["fn", {}, "text", "Test Registrar"]]],
                    }
                ],
            },
        )

    client = RdapClient(transport=httpx.MockTransport(handler))
    result = asyncio.run(client.lookup("example.in"))

    assert result["status"] == "found"
    assert result["risk_hint"] == "recent_registration"
    assert result["registrar"] == "Test Registrar"
    assert result["no_match_is_safe"] is False


def test_rdap_no_match_never_means_safe() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == "https://data.iana.org/rdap/dns.json":
            return httpx.Response(200, json={"services": [[["com"], ["https://rdap.test"]]]})
        return httpx.Response(404)

    client = RdapClient(transport=httpx.MockTransport(handler))
    result = asyncio.run(client.lookup("missing.example.com"))

    assert result["status"] == "not_found"
    assert result["risk_hint"] == "unknown"
    assert result["no_match_is_safe"] is False


def test_domain_intelligence_endpoint_requires_explicit_consent() -> None:
    response = TestClient(app).post(
        "/api/v0/intelligence/domain",
        json={"domain": "example.com", "consent_token": "nope"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "domain_intelligence_consent_required"


def test_domain_intelligence_endpoint_returns_supporting_evidence() -> None:
    expected = {
        "domain": "example.com",
        "status": "found",
        "risk_hint": "supporting_evidence_only",
        "no_match_is_safe": False,
    }
    with patch("app.main.lookup_domain_with_rdap", new=AsyncMock(return_value=expected)):
        response = TestClient(app).post(
            "/api/v0/intelligence/domain",
            json={
                "domain": "https://example.com/private?token=secret",
                "consent_token": "domain-intelligence-consent",
            },
        )

    assert response.status_code == 200
    assert response.json() == expected
