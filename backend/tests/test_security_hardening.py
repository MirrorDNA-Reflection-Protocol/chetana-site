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
    UPLOAD_MAX_BYTES,
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
