from __future__ import annotations

import base64
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from pydantic import BaseModel, ConfigDict, Field


MIRRORPROOF_SCHEMA = "mirrorproof.chetana.assessment.v0.1"
BENCHMARK_SCHEMA = "mirrorproof.chetana.benchmark.v0.1"
ISSUER_ID = os.getenv(
    "CHETANA_MIRRORPROOF_ISSUER_ID",
    "https://id.activemirror.ai/issuers/chetana/v1.json",
)
KEY_ID = os.getenv(
    "CHETANA_MIRRORPROOF_KEY_ID",
    "did:web:id.activemirror.ai#chetana-2026-01",
)
MIRRORPROOF_ROOT = Path(
    os.getenv(
        "CHETANA_MIRRORPROOF_ROOT",
        str(Path.home() / ".mirrordna" / "chetana" / "mirrorproof"),
    )
)
PRIVATE_KEY_PATH = Path(
    os.getenv(
        "CHETANA_MIRRORPROOF_KEY_PATH",
        str(MIRRORPROOF_ROOT / "issuer_ed25519.pem"),
    )
)
ASSESSMENT_LEDGER = Path(
    os.getenv(
        "CHETANA_MIRRORPROOF_LEDGER",
        str(MIRRORPROOF_ROOT / "assessment_receipts.jsonl"),
    )
)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MirrorProofIssuer(StrictModel):
    id: str
    key_id: str
    algorithm: Literal["Ed25519"] = "Ed25519"
    public_key_base64url: str
    registry_url: str = ISSUER_ID


class MirrorProofEvidence(StrictModel):
    sha256: str
    input_type: str
    character_count: int = Field(ge=0)
    raw_evidence_stored: Literal[False] = False


class MirrorProofAssessment(StrictModel):
    scan_id: str
    verdict: str
    risk_level: str
    confidence_band: str
    evidence_state: str
    scam_type: str
    reason_codes: list[str] = Field(default_factory=list, max_length=8)


class MirrorProofProvenance(StrictModel):
    runtime_source: str
    extraction_quality: str
    extraction_provider: str | None = None
    ruleset: str
    content_credentials_status: Literal["not_checked", "no_manifest", "valid", "invalid", "untrusted"]
    threat_intelligence: list[dict[str, Any]] = Field(default_factory=list, max_length=8)


class MirrorProofScope(StrictModel):
    checked: list[str] = Field(min_length=1, max_length=12)
    unchecked: list[str] = Field(min_length=1, max_length=12)
    limitations: list[str] = Field(min_length=1, max_length=8)


class MirrorProofLineage(StrictModel):
    loop_event_hash: str
    action_route_hash: str | None = None
    previous_proof_hash: str | None = None


class MirrorProofReceipt(StrictModel):
    schema_version: Literal["mirrorproof.chetana.assessment.v0.1"] = MIRRORPROOF_SCHEMA
    receipt_id: str
    issued_at_utc: str
    issuer: MirrorProofIssuer
    evidence: MirrorProofEvidence
    assessment: MirrorProofAssessment
    provenance: MirrorProofProvenance
    scope: MirrorProofScope
    lineage: MirrorProofLineage
    receipt_hash: str
    signature_base64url: str


class MirrorProofVerifyRequest(StrictModel):
    receipt: MirrorProofReceipt


class MirrorProofVerification(StrictModel):
    valid: bool
    integrity_valid: bool
    signature_valid: bool
    issuer_trusted: bool
    key_id: str
    receipt_hash: str
    reason: str
    proof_limits: list[str]


class SignedBenchmarkStatement(StrictModel):
    schema_version: Literal["mirrorproof.chetana.benchmark.v0.1"] = BENCHMARK_SCHEMA
    statement_id: str
    issued_at_utc: str
    issuer: MirrorProofIssuer
    suite_sha256: str
    report_sha256: str
    summary: dict[str, Any]
    metrics: dict[str, Any]
    checked_scope: list[str]
    unchecked_scope: list[str]
    statement_hash: str
    signature_base64url: str


class BenchmarkVerification(StrictModel):
    valid: bool
    integrity_valid: bool
    signature_valid: bool
    issuer_trusted: bool
    suite_digest_valid: bool
    report_digest_valid: bool
    statement_hash: str
    reason: str


def _now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _canonical_bytes(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def _sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _write_private_key(path: Path, key: Ed25519PrivateKey) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path.parent, 0o700)
    material = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    descriptor = os.open(path, flags, 0o600)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(material)


def _load_private_key(path: Path = PRIVATE_KEY_PATH) -> Ed25519PrivateKey:
    inline_pem = os.getenv("CHETANA_MIRRORPROOF_PRIVATE_KEY_PEM")
    if inline_pem:
        loaded = serialization.load_pem_private_key(inline_pem.encode("utf-8"), password=None)
    else:
        if not path.exists():
            _write_private_key(path, Ed25519PrivateKey.generate())
        os.chmod(path.parent, 0o700)
        os.chmod(path, 0o600)
        loaded = serialization.load_pem_private_key(path.read_bytes(), password=None)
    if not isinstance(loaded, Ed25519PrivateKey):
        raise ValueError("mirrorproof_key_must_be_ed25519")
    return loaded


def _public_key_bytes(key: Ed25519PrivateKey) -> bytes:
    return key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )


def issuer_document(key_path: Path | None = None) -> dict[str, Any]:
    key = _load_private_key(key_path or PRIVATE_KEY_PATH)
    return {
        "schema_version": "mirrorproof.issuer.v0.1",
        "id": ISSUER_ID,
        "name": "Chetana Scam Safety Runtime",
        "operator": "N1 Intelligence (OPC) Private Limited",
        "jurisdiction": "India",
        "key_id": KEY_ID,
        "algorithm": "Ed25519",
        "public_key_base64url": _b64url(_public_key_bytes(key)),
        "status_url": "https://id.activemirror.ai/status/chetana-v1.json",
        "verification_url": "https://id.activemirror.ai/trust/",
        "assurance_boundary": (
            "A valid signature proves receipt integrity and issuer-key possession. "
            "It does not prove that submitted content or the assessment is factually true."
        ),
    }


def _issuer(key: Ed25519PrivateKey) -> MirrorProofIssuer:
    return MirrorProofIssuer(
        id=ISSUER_ID,
        key_id=KEY_ID,
        public_key_base64url=_b64url(_public_key_bytes(key)),
    )


def _latest_hash(path: Path) -> str | None:
    if not path.exists():
        return None
    for line in reversed(path.read_text(encoding="utf-8").splitlines()):
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        value = payload.get("receipt_hash") or payload.get("statement_hash")
        if isinstance(value, str) and value:
            return value
    return None


def _append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path.parent, 0o700)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, sort_keys=True, ensure_ascii=True) + "\n")
    os.chmod(path, 0o600)


def issue_assessment_receipt(
    *,
    verdict: Any,
    input_text: str,
    loop_event_hash: str,
    contract_hash: str,
    action_route_hash: str | None,
    ledger_path: Path | None = None,
    key_path: Path | None = None,
) -> MirrorProofReceipt:
    resolved_ledger_path = ledger_path or ASSESSMENT_LEDGER
    key = _load_private_key(key_path or PRIVATE_KEY_PATH)
    normalized_text = input_text.strip()
    threat_intelligence: list[dict[str, Any]] = []
    enrichment = getattr(verdict, "kavach_enrichment", None)
    if enrichment:
        threat_intelligence.append(
            {
                "source": enrichment.source,
                "checked_at_utc": enrichment.checked_at_utc,
                "indicator_count": len(enrichment.indicators),
                "no_match_is_safe": enrichment.no_match_is_safe,
            }
        )
    checked = [
        "submitted text or locally extracted text digest",
        "deterministic scam-pattern rules",
        "visible reason and action-route contract",
    ]
    if threat_intelligence:
        checked.append("local Chetana Kavach indicator seed")
    unsigned = {
        "schema_version": MIRRORPROOF_SCHEMA,
        "receipt_id": f"mpr_{uuid4().hex}",
        "issued_at_utc": _now_utc(),
        "issuer": _issuer(key).model_dump(),
        "evidence": {
            "sha256": _sha256(normalized_text.encode("utf-8")),
            "input_type": verdict.input_type,
            "character_count": len(normalized_text),
            "raw_evidence_stored": False,
        },
        "assessment": {
            "scan_id": verdict.scan_id,
            "verdict": verdict.verdict,
            "risk_level": verdict.risk_level,
            "confidence_band": verdict.confidence_band,
            "evidence_state": verdict.evidence_state,
            "scam_type": verdict.scam_type,
            "reason_codes": [reason.code for reason in verdict.reasons],
        },
        "provenance": {
            "runtime_source": verdict.runtime_source,
            "extraction_quality": verdict.extraction_quality,
            "extraction_provider": verdict.ocr_provider,
            "ruleset": f"chetana-v0:{contract_hash}",
            "content_credentials_status": "not_checked",
            "threat_intelligence": threat_intelligence,
        },
        "scope": {
            "checked": checked,
            "unchecked": [
                "sender identity and authority",
                "truth of claims made in the submitted content",
                "ownership of phone, UPI, bank, email, or social accounts",
                "media origin and C2PA Content Credentials",
                "whether a financial loss occurred after this assessment",
            ],
            "limitations": [
                "This is a bounded scam-risk assessment, not a factual authenticity certificate.",
                "A valid signature proves receipt integrity and issuer-key possession only.",
                "No indicator match must not be interpreted as safe.",
            ],
        },
        "lineage": {
            "loop_event_hash": loop_event_hash,
            "action_route_hash": action_route_hash,
            "previous_proof_hash": _latest_hash(resolved_ledger_path),
        },
    }
    canonical = _canonical_bytes(unsigned)
    receipt_hash = _sha256(canonical)
    payload = {
        **unsigned,
        "receipt_hash": receipt_hash,
        "signature_base64url": _b64url(key.sign(canonical)),
    }
    receipt = MirrorProofReceipt.model_validate(payload)
    _append_jsonl(resolved_ledger_path, receipt.model_dump())
    return receipt


def verify_assessment_receipt(
    receipt: MirrorProofReceipt,
    *,
    trusted_public_key_base64url: str | None = None,
) -> MirrorProofVerification:
    payload = receipt.model_dump(exclude={"receipt_hash", "signature_base64url"})
    canonical = _canonical_bytes(payload)
    recomputed_hash = _sha256(canonical)
    integrity_valid = recomputed_hash == receipt.receipt_hash
    expected_public_key = trusted_public_key_base64url or issuer_document()["public_key_base64url"]
    issuer_trusted = (
        receipt.issuer.id == ISSUER_ID
        and receipt.issuer.key_id == KEY_ID
        and receipt.issuer.public_key_base64url == expected_public_key
    )
    signature_valid = False
    try:
        public_key = Ed25519PublicKey.from_public_bytes(_b64url_decode(expected_public_key))
        public_key.verify(_b64url_decode(receipt.signature_base64url), canonical)
        signature_valid = True
    except (InvalidSignature, ValueError, TypeError):
        signature_valid = False
    valid = integrity_valid and signature_valid and issuer_trusted
    if valid:
        reason = "signature_and_integrity_valid"
    elif not integrity_valid:
        reason = "receipt_hash_mismatch"
    elif not issuer_trusted:
        reason = "issuer_or_key_not_trusted"
    else:
        reason = "signature_invalid"
    return MirrorProofVerification(
        valid=valid,
        integrity_valid=integrity_valid,
        signature_valid=signature_valid,
        issuer_trusted=issuer_trusted,
        key_id=receipt.issuer.key_id,
        receipt_hash=receipt.receipt_hash,
        reason=reason,
        proof_limits=list(receipt.scope.limitations),
    )


def sign_benchmark_statement(
    *,
    report: dict[str, Any],
    suite_bytes: bytes,
    key_path: Path | None = None,
) -> SignedBenchmarkStatement:
    key = _load_private_key(key_path or PRIVATE_KEY_PATH)
    report_bytes = _canonical_bytes(report)
    unsigned = {
        "schema_version": BENCHMARK_SCHEMA,
        "statement_id": f"mpb_{uuid4().hex}",
        "issued_at_utc": _now_utc(),
        "issuer": _issuer(key).model_dump(),
        "suite_sha256": _sha256(suite_bytes),
        "report_sha256": _sha256(report_bytes),
        "summary": report.get("summary", {}),
        "metrics": report.get("metrics", {}),
        "checked_scope": [
            "suite file digest",
            "deterministic evaluation output digest",
            "reported case counts and metrics",
        ],
        "unchecked_scope": [
            "representativeness beyond the named suite",
            "independent adjudication unless named in case provenance",
            "field efficacy or prevented financial loss",
        ],
    }
    canonical = _canonical_bytes(unsigned)
    payload = {
        **unsigned,
        "statement_hash": _sha256(canonical),
        "signature_base64url": _b64url(key.sign(canonical)),
    }
    return SignedBenchmarkStatement.model_validate(payload)


def verify_benchmark_statement(
    statement: SignedBenchmarkStatement,
    *,
    suite_bytes: bytes,
    report: dict[str, Any],
    trusted_public_key_base64url: str | None = None,
) -> BenchmarkVerification:
    payload = statement.model_dump(exclude={"statement_hash", "signature_base64url"})
    canonical = _canonical_bytes(payload)
    integrity_valid = _sha256(canonical) == statement.statement_hash
    expected_public_key = trusted_public_key_base64url or issuer_document()["public_key_base64url"]
    issuer_trusted = (
        statement.issuer.id == ISSUER_ID
        and statement.issuer.key_id == KEY_ID
        and statement.issuer.public_key_base64url == expected_public_key
    )
    suite_digest_valid = _sha256(suite_bytes) == statement.suite_sha256
    report_digest_valid = _sha256(_canonical_bytes(report)) == statement.report_sha256
    try:
        public_key = Ed25519PublicKey.from_public_bytes(_b64url_decode(expected_public_key))
        public_key.verify(_b64url_decode(statement.signature_base64url), canonical)
        signature_valid = True
    except (InvalidSignature, ValueError, TypeError):
        signature_valid = False
    valid = all(
        (
            integrity_valid,
            signature_valid,
            issuer_trusted,
            suite_digest_valid,
            report_digest_valid,
        )
    )
    if valid:
        reason = "signature_integrity_and_artifact_digests_valid"
    elif not integrity_valid:
        reason = "statement_hash_mismatch"
    elif not signature_valid:
        reason = "signature_invalid"
    elif not issuer_trusted:
        reason = "issuer_or_key_not_trusted"
    elif not suite_digest_valid:
        reason = "suite_digest_mismatch"
    else:
        reason = "report_digest_mismatch"
    return BenchmarkVerification(
        valid=valid,
        integrity_valid=integrity_valid,
        signature_valid=signature_valid,
        issuer_trusted=issuer_trusted,
        suite_digest_valid=suite_digest_valid,
        report_digest_valid=report_digest_valid,
        statement_hash=statement.statement_hash,
        reason=reason,
    )
