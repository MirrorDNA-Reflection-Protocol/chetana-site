import json

from fastapi.testclient import TestClient

from app.main import app


def test_improve_scan_requires_cloud_ocr_consent() -> None:
    client = TestClient(app)

    response = client.post(
        "/api/v0/scan/improve",
        data={
            "input_type": "screenshot",
            "consent_token": "nope",
        },
        files={
            "file": ("screenshot.png", b"not-real-image", "image/png"),
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "cloud_ocr_consent_required"


def test_improve_scan_falls_back_when_mistral_is_not_configured(monkeypatch) -> None:
    monkeypatch.delenv("CHETANA_MISTRAL_OCR_ENABLED", raising=False)
    monkeypatch.delenv("MISTRAL_API_KEY", raising=False)
    client = TestClient(app)

    response = client.post(
        "/api/v0/scan/improve",
        data={
            "input_type": "screenshot",
            "source_name": "screenshot.png",
            "consent_token": "cloud-ocr-consent",
            "local_extracted_text": "ok",
            "quality_snapshot": json.dumps(
                {
                    "source": "browser",
                    "confidence": 0.2,
                    "quality_flags": ["low_ocr_confidence"],
                    "character_count": 2,
                }
            ),
        },
        files={
            "file": ("screenshot.png", b"not-real-image", "image/png"),
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["runtime_source"] == "needs clearer screenshot"
    assert data["extraction_quality"] == "weak"
    assert data["can_improve_scan"] is False
    assert data["ocr_provider"] == "mistral"
    assert data["ocr_attempted"] is False
    assert data["fallback_reason"] == "ocr_unavailable"
