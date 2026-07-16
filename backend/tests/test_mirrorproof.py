import json
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient

from app import mirrorproof, v0_runtime
from app.main import app
from app.mirrorproof import (
    issue_assessment_receipt,
    sign_benchmark_statement,
    verify_assessment_receipt,
    verify_benchmark_statement,
)
from app.v0_runtime import V0ScanInput, analyze_scan


def _test_key(path: Path) -> None:
    key = Ed25519PrivateKey.from_private_bytes(bytes(range(1, 33)))
    path.write_bytes(
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )


def test_assessment_receipt_signs_private_evidence_digest_and_verifies(tmp_path) -> None:
    key_path = tmp_path / "issuer.pem"
    ledger_path = tmp_path / "receipts.jsonl"
    _test_key(key_path)
    text = "Urgent bank KYC. Share OTP and approve UPI collect request now."
    verdict = analyze_scan(V0ScanInput(input_type="text", text=text, language_hint="en"))

    receipt = issue_assessment_receipt(
        verdict=verdict,
        input_text=text,
        loop_event_hash="a" * 64,
        contract_hash="b" * 64,
        action_route_hash=None,
        ledger_path=ledger_path,
        key_path=key_path,
    )
    verification = verify_assessment_receipt(
        receipt,
        trusted_public_key_base64url=receipt.issuer.public_key_base64url,
    )

    assert verification.valid is True
    assert receipt.evidence.raw_evidence_stored is False
    assert text not in json.dumps(receipt.model_dump())
    assert receipt.provenance.content_credentials_status == "not_checked"
    assert "sender identity and authority" in receipt.scope.unchecked
    assert ledger_path.exists()


def test_tampered_receipt_fails_integrity_and_signature(tmp_path) -> None:
    key_path = tmp_path / "issuer.pem"
    _test_key(key_path)
    verdict = analyze_scan(V0ScanInput(input_type="text", text="Pay Rs 500 now"))
    receipt = issue_assessment_receipt(
        verdict=verdict,
        input_text="Pay Rs 500 now",
        loop_event_hash="c" * 64,
        contract_hash="d" * 64,
        action_route_hash=None,
        ledger_path=tmp_path / "receipts.jsonl",
        key_path=key_path,
    )
    tampered = receipt.model_copy(
        update={"assessment": receipt.assessment.model_copy(update={"verdict": "low_signal"})}
    )

    result = verify_assessment_receipt(
        tampered,
        trusted_public_key_base64url=receipt.issuer.public_key_base64url,
    )

    assert result.valid is False
    assert result.integrity_valid is False


def test_loop_endpoint_returns_signed_mirrorproof(monkeypatch, tmp_path) -> None:
    key_path = tmp_path / "issuer.pem"
    _test_key(key_path)
    monkeypatch.setattr(v0_runtime, "V0_LOOP_RECEIPTS_LOG", tmp_path / "loops.jsonl")
    monkeypatch.setattr(mirrorproof, "PRIVATE_KEY_PATH", key_path)
    monkeypatch.setattr(mirrorproof, "ASSESSMENT_LEDGER", tmp_path / "proofs.jsonl")
    client = TestClient(app)
    text = "Police says pay Rs 999 now or you will be arrested."
    verdict = analyze_scan(V0ScanInput(input_type="text", text=text, language_hint="en"))

    response = client.post(
        "/api/v0/loop/receipt",
        json={"verdict": verdict.model_dump(), "input_text": text, "session_id": "proof-test"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["mirrorproof_status"] == "signed"
    assert payload["receipt_basis"] == "server_recomputed"
    assert payload["mirrorproof_receipt"]["lineage"]["loop_event_hash"] == payload["loop_receipt"]["event_hash"]


def test_loop_endpoint_refuses_to_sign_caller_fabricated_verdict() -> None:
    client = TestClient(app)
    text = "Police says pay Rs 999 now or you will be arrested."
    verdict = analyze_scan(V0ScanInput(input_type="text", text=text, language_hint="en"))
    forged = verdict.model_copy(
        update={
            "verdict": "low_signal",
            "risk_level": "low",
            "confidence_band": "low",
        }
    )

    response = client.post(
        "/api/v0/loop/receipt",
        json={"verdict": forged.model_dump(), "input_text": text, "session_id": "forgery-test"},
    )

    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["code"] == "receipt_verdict_mismatch"
    assert "verdict" in detail["mismatched_fields"]
    assert "risk_level" in detail["mismatched_fields"]


def test_benchmark_statement_binds_suite_and_report(tmp_path) -> None:
    key_path = tmp_path / "issuer.pem"
    _test_key(key_path)
    report = {
        "summary": {"total_cases": 300, "gate_failed": 0},
        "metrics": {"critical_scam_recall_pct": 99.0},
    }

    statement = sign_benchmark_statement(report=report, suite_bytes=b"suite-v1", key_path=key_path)

    verification = verify_benchmark_statement(
        statement,
        suite_bytes=b"suite-v1",
        report=report,
        trusted_public_key_base64url=statement.issuer.public_key_base64url,
    )

    assert statement.summary["total_cases"] == 300
    assert len(statement.suite_sha256) == 64
    assert len(statement.statement_hash) == 64
    assert "field efficacy or prevented financial loss" in statement.unchecked_scope
    assert verification.valid is True


def test_benchmark_verification_rejects_changed_report(tmp_path) -> None:
    key_path = tmp_path / "issuer.pem"
    _test_key(key_path)
    report = {"summary": {"total_cases": 7}, "metrics": {"recall_pct": 100.0}}
    statement = sign_benchmark_statement(report=report, suite_bytes=b"suite-v1", key_path=key_path)

    verification = verify_benchmark_statement(
        statement,
        suite_bytes=b"suite-v1",
        report={"summary": {"total_cases": 8}, "metrics": {"recall_pct": 100.0}},
        trusted_public_key_base64url=statement.issuer.public_key_base64url,
    )

    assert verification.valid is False
    assert verification.reason == "report_digest_mismatch"
