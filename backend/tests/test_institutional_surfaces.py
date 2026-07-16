from __future__ import annotations

from fastapi.testclient import TestClient

from app.institutional import build_observatory_payload, load_institutional_contract
from app.main import app


client = TestClient(app)


def test_contract_keeps_evidence_classes_and_claim_limits_separate() -> None:
    contract = load_institutional_contract()
    assert set(contract["evidence_classes"]) == {"official", "observed", "pilot_derived", "pending_evidence"}
    assert contract["pilot"]["status"] == "ready_to_scope"
    assert any("No ISO 27001" in item for item in contract["trust_room"]["open_blocks"])
    assert any("no privileged access" in item.lower() for item in contract["observatory"]["pending_claims"])
    for metric in contract["observatory"]["official_metrics"]:
        assert metric["evidence_class"] == "official"
        assert metric["source_url"].startswith("https://")
        assert metric["period"]
        assert metric["geography"]
        assert metric["caveat"]


def test_empty_observatory_does_not_present_zero_as_zero_fraud() -> None:
    contract = load_institutional_contract()
    payload = build_observatory_payload(
        contract,
        {
            "status": "empty",
            "trailing_days": 30,
            "generated_at_utc": "2026-07-13T00:00:00Z",
            "totals": {
                "scans_completed": 0,
                "high_risk_pauses": 0,
                "follow_through_sessions": 0,
                "official_rail_taps": 0,
                "feedback_submissions": 0,
            },
            "quality": {
                "invalid_event_rows": 0,
                "invalid_inquiry_rows": 0,
                "synthetic_event_rows_excluded": 0,
                "duplicate_event_rows_excluded": 0,
                "out_of_window_event_rows": 0,
                "out_of_window_inquiry_rows": 0,
            },
        },
    )
    assert payload["chetana_observed"]["status"] == "empty"
    assert "not evidence of zero fraud" in payload["chetana_observed"]["caveat"]
    assert payload["pilot_derived"]["status"] == "pending"


def test_institutional_pages_and_json_contracts_are_public() -> None:
    for path, expected in (
        ("/observatory", "India Scam Readiness Observatory"),
        ("/partners/30-day-pilot", "One audience. Thirty days."),
        ("/partners/goa", "Stop the scam before the money moves."),
        ("/partners/trust-room", "Institutional Trust Room"),
    ):
        response = client.get(path)
        assert response.status_code == 200
        assert expected in response.text

    observatory = client.get("/api/v1/observatory?days=30")
    assert observatory.status_code == 200
    assert observatory.json()["schema_version"] == "chetana.observatory.v1"
    assert observatory.json()["pilot_derived"]["status"] == "pending"

    pilot = client.get("/api/v1/partners/30-day-pilot")
    assert pilot.status_code == 200
    assert pilot.json()["pilot"]["name"] == "30-day Digital Kavach Pilot"

    trust = client.get("/api/v1/institutional/trust-room")
    assert trust.status_code == 200
    assert trust.json()["trust_room"]["status"] == "implemented_baseline_with_open_blocks"


def test_sitemap_exposes_institutional_discovery_routes() -> None:
    response = client.get("/sitemap.xml")
    assert response.status_code == 200
    assert "https://chetana.activemirror.ai/observatory" in response.text
    assert "https://chetana.activemirror.ai/partners/goa" in response.text
    assert "https://chetana.activemirror.ai/partners/trust-room" in response.text
