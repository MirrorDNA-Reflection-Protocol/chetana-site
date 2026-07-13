from fastapi.testclient import TestClient

from app.assurance import load_assurance_payload, load_research_contract
from app.main import app


def test_assurance_payload_verifies_signed_artifacts() -> None:
    payload = load_assurance_payload()

    assert payload["verification"]["valid"] is True
    assert payload["report"]["summary"]["total_cases"] == 7
    assert payload["report"]["assurance"]["field_efficacy_proven"] is False
    assert "population-level scam detection accuracy" in payload["proof_boundary"]["does_not_prove"]


def test_research_contract_blocks_automatic_promotion() -> None:
    contract = load_research_contract()

    assert contract["intake"]["requires_explicit_consent"] is True
    assert contract["intake"]["raw_text_stored"] is False
    assert contract["promotion_gate"]["minimum_independent_reviewers"] == 2
    assert contract["promotion_gate"]["automatic_promotion_allowed"] is False


def test_assurance_page_and_api_are_public() -> None:
    client = TestClient(app)

    page = client.get("/assurance")
    evidence = client.get("/api/v1/assurance")
    contract = client.get("/api/v1/assurance/research-contract")

    assert page.status_code == 200
    assert "Measure the safety claim." in page.text
    assert "not an independent holdout" in page.text
    assert evidence.status_code == 200
    assert evidence.json()["verification"]["signature_valid"] is True
    assert contract.status_code == 200
    assert contract.json()["promotion_gate"]["user_feedback_is_ground_truth"] is False
