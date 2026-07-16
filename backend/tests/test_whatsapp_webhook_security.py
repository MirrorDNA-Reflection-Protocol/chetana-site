from __future__ import annotations

import hashlib
import hmac
import json

from fastapi.testclient import TestClient

from app.main import app
from app import whatsapp_webhook


def test_whatsapp_webhook_fails_closed_without_app_secret(monkeypatch) -> None:
    monkeypatch.setattr(whatsapp_webhook, "APP_SECRET", "")
    response = TestClient(app).post("/api/webhook/whatsapp", json={"entry": []})
    assert response.status_code == 503


def test_whatsapp_webhook_rejects_invalid_signature(monkeypatch) -> None:
    monkeypatch.setattr(whatsapp_webhook, "APP_SECRET", "test-secret")
    response = TestClient(app).post(
        "/api/webhook/whatsapp",
        content=b'{"entry":[]}',
        headers={"content-type": "application/json", "x-hub-signature-256": "sha256=bad"},
    )
    assert response.status_code == 401


def test_whatsapp_webhook_accepts_valid_meta_signature(monkeypatch) -> None:
    secret = "test-secret"
    monkeypatch.setattr(whatsapp_webhook, "APP_SECRET", secret)
    raw = json.dumps({"entry": []}, separators=(",", ":")).encode("utf-8")
    signature = "sha256=" + hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()
    response = TestClient(app).post(
        "/api/webhook/whatsapp",
        content=raw,
        headers={"content-type": "application/json", "x-hub-signature-256": signature},
    )
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
