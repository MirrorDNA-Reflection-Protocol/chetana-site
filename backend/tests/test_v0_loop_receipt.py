import json

from fastapi.testclient import TestClient

from app import v0_runtime
from app.main import app
from app.v0_runtime import V0ScanInput, V0TrustRuntimeRequest, analyze_scan, build_trust_bundle


def test_loop_receipt_endpoint_records_scan_loop(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(v0_runtime, "V0_LOOP_RECEIPTS_LOG", tmp_path / "loop_receipts.jsonl")
    client = TestClient(app)
    text = "Urgent KYC update. Pay Rs 499 now or your account will be blocked today. https://secure-kyc-update.top"
    verdict = analyze_scan(V0ScanInput(input_type="text", text=text, language_hint="en", session_id="test-session"))
    trust_bundle = build_trust_bundle(V0TrustRuntimeRequest(verdict=verdict, input_text=text))

    response = client.post(
        "/api/v0/loop/receipt",
        json={
            "verdict": verdict.model_dump(),
            "input_text": text,
            "trust_bundle": trust_bundle.model_dump(),
            "session_id": "test-session",
        },
    )

    assert response.status_code == 200
    receipt = response.json()["loop_receipt"]
    assert receipt["type"] == "chetana_scam_checker_loop_iteration"
    assert receipt["status"] == "pass"
    assert receipt["scan_id"] == verdict.scan_id
    assert receipt["prev_hash"] is None
    assert receipt["event_hash"] == receipt["chain_head"]
    assert [phase["phase"] for phase in receipt["phases"]] == [
        "observe",
        "decide",
        "act",
        "verify",
        "record",
        "ratchet",
    ]
    assert all(item["status"] == "pass" for item in receipt["validators"])
    assert v0_runtime.V0_LOOP_RECEIPTS_LOG.exists()

    stored = [
        json.loads(line)
        for line in v0_runtime.V0_LOOP_RECEIPTS_LOG.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    assert len(stored) == 1
    assert stored[0]["event_hash"] == receipt["event_hash"]

    second = client.post(
        "/api/v0/loop/receipt",
        json={
            "verdict": verdict.model_dump(),
            "input_text": text,
            "trust_bundle": trust_bundle.model_dump(),
            "session_id": "test-session",
        },
    ).json()["loop_receipt"]
    assert second["prev_hash"] == receipt["event_hash"]
