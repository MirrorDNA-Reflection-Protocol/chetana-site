import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from app import main as main_module
from app import research_intake
from app.main import app
from app.research_intake import (
    RESEARCH_CONSENT_TOKEN,
    ResearchCandidateRequest,
    ResearchDeletionRequest,
    accept_research_candidate,
    delete_research_candidate,
    purge_expired_candidates,
    redact_research_text,
)


def _request() -> ResearchCandidateRequest:
    return ResearchCandidateRequest(
        scan_id="scan_research_123456",
        feedback_type="missed_scam",
        input_type="text",
        language_hint="hi-Latn",
        text=(
            "Call +91 9876543210 and pay test.user@okaxis. "
            "Open https://fake.example/pay/9876543210?account=123456789012. "
            "Email victim@example.com with account 123456789012."
        ),
        consent_token=RESEARCH_CONSENT_TOKEN,
    )


def test_research_candidate_stores_sanitized_text_not_raw(tmp_path: Path) -> None:
    log = tmp_path / "candidates.jsonl"
    request = _request()

    receipt = accept_research_candidate(request, candidate_log=log)
    stored = json.loads(log.read_text(encoding="utf-8").strip())

    assert receipt.status == "quarantined_pending_review"
    assert receipt.storage_boundary == "sanitized_text_only_sanitized_digest_90_day_retention"
    assert receipt.redaction_count >= 4
    assert stored["raw_text_stored"] is False
    assert "raw_text_sha256" not in stored
    assert "sanitized_text_sha256" in stored
    assert request.text not in log.read_text(encoding="utf-8")
    assert "9876543210" not in stored["sanitized_text"]
    assert "victim@example.com" not in stored["sanitized_text"]
    assert stored["promotion_state"] == "blocked_pending_two_person_adjudication"


def test_research_candidate_can_be_deleted_with_secret(tmp_path: Path) -> None:
    candidate_log = tmp_path / "candidates.jsonl"
    deletion_log = tmp_path / "deletions.jsonl"
    receipt = accept_research_candidate(_request(), candidate_log=candidate_log)

    result = delete_research_candidate(
        ResearchDeletionRequest(candidate_id=receipt.candidate_id, deletion_token=receipt.deletion_token),
        candidate_log=candidate_log,
        deletion_log=deletion_log,
    )

    assert result.deleted is True
    assert receipt.candidate_id not in candidate_log.read_text(encoding="utf-8")
    assert "candidate_id_hash" in deletion_log.read_text(encoding="utf-8")


def test_research_candidate_rejects_wrong_deletion_secret(tmp_path: Path) -> None:
    candidate_log = tmp_path / "candidates.jsonl"
    receipt = accept_research_candidate(_request(), candidate_log=candidate_log)

    result = delete_research_candidate(
        ResearchDeletionRequest(candidate_id=receipt.candidate_id, deletion_token="x" * 32),
        candidate_log=candidate_log,
        deletion_log=tmp_path / "deletions.jsonl",
    )

    assert result.deleted is False
    assert result.reason == "deletion_token_invalid"
    assert receipt.candidate_id in candidate_log.read_text(encoding="utf-8")


def test_redaction_preserves_url_domain_as_research_signal() -> None:
    sanitized, count = redact_research_text("Visit https://secure-bank-alert.example/otp?phone=9876543210 now")

    assert sanitized == "Visit [URL:secure-bank-alert.example] now"
    assert count == 1


def test_expired_research_candidates_are_purged(tmp_path: Path) -> None:
    candidate_log = tmp_path / "candidates.jsonl"
    expired_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    candidate_log.write_text(
        json.dumps(
            {
                "candidate_id": "crc_expired_candidate",
                "retention_expires_at_utc": expired_at.isoformat(),
                "sanitized_text": "expired research text",
            }
        )
        + "\n",
        encoding="utf-8",
    )

    purged = purge_expired_candidates(candidate_log=candidate_log)

    assert purged == 1
    assert candidate_log.read_text(encoding="utf-8") == ""


def test_research_api_accepts_and_deletes_consented_candidate(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(research_intake, "CANDIDATE_LOG", tmp_path / "candidates.jsonl")
    monkeypatch.setattr(research_intake, "DELETION_LOG", tmp_path / "deletions.jsonl")
    main_module._RESEARCH_REQUEST_LOG.clear()
    client = TestClient(app)

    accepted = client.post("/api/v1/research/candidates", json=_request().model_dump())

    assert accepted.status_code == 200
    receipt = accepted.json()
    assert receipt["status"] == "quarantined_pending_review"
    assert "deletion_token" in receipt

    deleted = client.post(
        "/api/v1/research/candidates/delete",
        json={"candidate_id": receipt["candidate_id"], "deletion_token": receipt["deletion_token"]},
    )

    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True


def test_app_lifespan_starts_retention_purge(monkeypatch) -> None:
    calls: list[bool] = []
    monkeypatch.setattr(main_module, "purge_expired_candidates", lambda: calls.append(True) or 0)

    with TestClient(app) as client:
        assert client.get("/api/v1/assurance/research-contract").status_code == 200

    assert calls
