from __future__ import annotations

import json
import asyncio
import stat
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi import HTTPException, UploadFile
from fastapi.testclient import TestClient

from app.incident.incident_mode import _get_session, _save_session
from app.incident.models import IncidentSession
from app.main import (
    _PUBLIC_API_REQUEST_LOG,
    UPLOAD_MAX_BYTES,
    _consume_public_api_budget,
    _high_risk_alert,
    _read_upload_limited,
    _require_local_security_operator,
    _safe_frontend_file,
    _EphemeralDecodeFirewall,
    app,
)
from starlette.requests import Request


def test_firewall_operator_routes_are_hidden_from_public_requests() -> None:
    client = TestClient(app)

    for method, path, kwargs in (
        ("post", "/api/decode-firewall/inspect", {"data": {"text": "hello"}}),
        ("post", "/api/decode-firewall/release", {"data": {"object_id": "obj_test", "target": "preview"}}),
        ("get", "/api/decode-firewall/object/obj_test", {}),
        ("get", "/api/decode-firewall/events/obj_test", {}),
    ):
        response = getattr(client, method)(path, headers={"cf-connecting-ip": "203.0.113.10"}, **kwargs)
        assert response.status_code == 404


def test_firewall_operator_inspection_remains_available_on_loopback() -> None:
    request = Request({"type": "http", "client": ("127.0.0.1", 50000), "headers": []})
    _require_local_security_operator(request)


def test_operator_and_retired_routes_fail_closed_on_public_edge() -> None:
    client = TestClient(app)

    alert = client.post("/api/alert", json={"message": "should not send"})
    witness = client.get("/api/witness/anything")
    schema = client.get("/api/openapi.json").json()["paths"]

    assert alert.status_code == 404
    assert witness.status_code == 410
    assert witness.json()["replacement"] == "/api/v0/mirrorproof/verify"
    assert "/api/alert" not in schema
    assert "/api/decode-firewall/inspect" not in schema
    assert "/api/witness/{path}" not in schema


def test_unknown_api_get_does_not_fall_through_to_spa() -> None:
    response = TestClient(app).get("/api/security/firewall/inspect")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


def test_public_api_budget_uses_validated_cloudflare_client_ip() -> None:
    _PUBLIC_API_REQUEST_LOG.clear()
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "scheme": "https",
            "path": "/api/v0/events",
            "query_string": b"",
            "server": ("chetana.activemirror.ai", 443),
            "client": ("127.0.0.1", 50000),
            "headers": [(b"cf-connecting-ip", b"203.0.113.7")],
        }
    )

    assert _consume_public_api_budget(request, 60, 2) == (True, 0)
    assert _consume_public_api_budget(request, 60, 2) == (True, 0)
    allowed, retry_after = _consume_public_api_budget(request, 60, 2)
    assert allowed is False
    assert retry_after > 0


def test_telemetry_schemas_reject_unbounded_or_unknown_fields() -> None:
    client = TestClient(app)

    legacy = client.post(
        "/api/analytics/event",
        json={"event": "scan", "score": 101, "unexpected": "pollution"},
    )
    v0 = client.post(
        "/api/v0/events",
        json={"event_name": "scan_completed", "session_id": "x" * 129},
    )

    assert legacy.status_code == 422
    assert v0.status_code == 422


def test_high_risk_notifications_never_include_raw_user_content() -> None:
    secret_message = "OTP 778899 and private victim message"
    alert = _high_risk_alert(
        channel="chat",
        score=95,
        scam_type="fake_kyc",
        surface="identity trust",
        signals=["credential request"],
    )

    assert secret_message not in alert
    assert "Raw user content omitted" in alert


def test_upload_reader_rejects_oversized_payload_before_processing() -> None:
    with tempfile.SpooledTemporaryFile() as handle:
        handle.write(b"x" * (UPLOAD_MAX_BYTES + 1))
        handle.seek(0)
        upload = UploadFile(file=handle, filename="oversized.bin")
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(_read_upload_limited(upload))
    assert exc_info.value.status_code == 413
    assert exc_info.value.detail == "upload_too_large"


def test_static_file_resolver_cannot_escape_frontend_root() -> None:
    assert _safe_frontend_file("../backend/app/main.py") is None
    assert _safe_frontend_file("../../../../etc/passwd") is None


def test_public_firewall_mode_does_not_persist_payload_or_extracted_text() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        firewall = _EphemeralDecodeFirewall(
            quarantine_dir=root / "quarantine",
            event_log_path=root / "events.jsonl",
            object_store_path=root / "objects.jsonl",
        )
        result = firewall.inspect_text("private suspicious message", source_kind="public_check")

        assert result.raw_payload_quarantined is False
        assert result.quarantine_path == ""
        assert [path for path in root.rglob("*") if path.is_file()] == []


def test_incident_ids_are_uuid_only_and_session_files_are_private() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir) / "sessions"
        with patch("app.incident.incident_mode._SESSION_ROOT", root):
            session = IncidentSession(raw_signals=["urgent payment request"])
            _save_session(session)
            path = root / f"{session.incident_id}.json"

            assert path.exists()
            assert stat.S_IMODE(root.stat().st_mode) == 0o700
            assert stat.S_IMODE(path.stat().st_mode) == 0o600
            assert json.loads(path.read_text(encoding="utf-8"))["session"]["incident_id"] == session.incident_id
            assert _get_session(session.incident_id).incident_id == session.incident_id

            with pytest.raises(HTTPException) as exc_info:
                _get_session("../../api_keys")
            assert exc_info.value.status_code == 404
