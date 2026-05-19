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
