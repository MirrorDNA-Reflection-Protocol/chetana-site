from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_gamechanger_fake_kyc_apk_is_critical() -> None:
    response = client.post(
        "/api/v1/analyze",
        json={
            "mode": "message",
            "text": "Tata Power KYC pending. Download this APK now or your electricity will be disconnected today.",
            "sourceChannel": "whatsapp",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["riskLevel"] == "critical"
    assert "fake_ekyc_apk" in body["threatTypes"]
    assert any(rail["railId"] == "CYBER_HELPLINE_1930" for rail in body["officialRails"])


def test_gamechanger_receive_money_qr_is_not_cleared() -> None:
    response = client.post(
        "/api/v1/analyze",
        json={
            "mode": "qr",
            "qrPayload": "upi://pay?pa=scammer@upi&pn=Refund Office&am=4500&cu=INR",
            "userSaysReceivingMoney": True,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["riskLevel"] in {"dangerous", "critical"}
    assert "qr_receive_money_scam" in body["threatTypes"]


def test_gamechanger_thin_input_becomes_caution_not_safe() -> None:
    response = client.post(
        "/api/v1/analyze",
        json={
            "mode": "message",
            "text": "ok",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["riskLevel"] == "caution"
    assert body["insufficientEvidence"] is True


def test_gamechanger_benign_long_input_is_not_cleared_as_safe() -> None:
    response = client.post(
        "/api/v1/analyze",
        json={
            "mode": "message",
            "text": "This is an ordinary note about meeting for tea next week with no payment or account request.",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["riskLevel"] == "caution"
    assert body["riskLevel"] != "safe"


def test_gamechanger_emergency_packet_for_remote_access() -> None:
    response = client.post(
        "/api/v1/emergency",
        json={
            "trigger": "gave_remote_access",
            "threatTypes": ["remote_access_takeover"],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["severity"] == "critical"
    assert any("clean device" in step.lower() or "another clean device" in step.lower() for step in body["immediateSteps"])
    assert any(rail["railId"] == "CYBER_HELPLINE_1930" for rail in body["officialRails"])


def test_gamechanger_rails_endpoint_returns_verified_rails() -> None:
    response = client.get("/api/v1/rails")
    assert response.status_code == 200
    body = response.json()
    assert any(rail["railId"] == "CYBER_HELPLINE_1930" for rail in body)
    assert any(rail["railId"] == "MEA_EMIGRATE" for rail in body)
    assert any(rail["railId"] == "SEBI_CHECK" for rail in body)
    assert any(rail["railId"] == "PARIVAHAN_ECHALLAN" for rail in body)
    assert any(rail["railId"] == "NCH_1915" for rail in body)


def test_gamechanger_intelligence_sources_exposes_source_ladder() -> None:
    response = client.get("/api/v1/intelligence-sources")
    assert response.status_code == 200
    body = response.json()
    by_id = {source["sourceId"]: source for source in body}
    assert by_id["chetana_local_rules"]["integrationStatus"] == "live_internal"
    assert by_id["google_web_risk"]["integrationStatus"] == "candidate_keyed"
    assert by_id["google_safe_browsing_noncommercial"]["integrationStatus"] == "not_eligible_for_commercial_product"
    assert by_id["urlhaus"]["authModel"] == "free_auth_key_required"
    assert by_id["openphish"]["integrationStatus"] == "license_blocked_without_written_consent"
    assert by_id["virustotal"]["integrationStatus"] == "public_api_blocked_for_commercial_use"
    assert by_id["cloudflare_url_scanner"]["integrationStatus"] == "analyst_only_with_explicit_consent"
    assert by_id["ncrp_suspect_repository"]["integrationStatus"] == "manual_official"
    assert by_id["the420_in"]["integrationStatus"] == "research_only"
    assert "Editorial reports must not be used as automated verdict ground truth." in by_id["the420_in"]["limitations"]


def test_gamechanger_specialist_rails_are_selected_by_scam_type() -> None:
    echallan = client.post(
        "/api/v1/analyze",
        json={
            "mode": "message",
            "text": "Urgent traffic challan. Pay this vehicle penalty link today or your license will be suspended.",
        },
    )
    assert echallan.status_code == 200
    assert any(rail["railId"] == "PARIVAHAN_ECHALLAN" for rail in echallan.json()["officialRails"])

    investment = client.post(
        "/api/v1/analyze",
        json={
            "mode": "message",
            "text": "Guaranteed investment return. Transfer money to join our Telegram trading group today.",
        },
    )
    assert investment.status_code == 200
    assert any(rail["railId"] == "SEBI_CHECK" for rail in investment.json()["officialRails"])
