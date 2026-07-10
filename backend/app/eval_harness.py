from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.v0_runtime import V0ScanInput, analyze_scan

ALLOWED_INPUT_TYPES = {"screenshot", "text", "qr_image", "payment_screenshot", "mixed"}


class EvalCaseError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class EvalCase:
    case_id: str
    language: str
    input_type: str
    text: str
    expected_verdicts: tuple[str, ...]
    expected_reason_codes: tuple[str, ...]
    forbidden_verdicts: tuple[str, ...]
    expected_runtime_source: str | None
    gate: bool
    provenance: dict[str, str]
    extraction: dict[str, Any] | None = None


def _string_tuple(value: Any, field: str, *, required: bool = False) -> tuple[str, ...]:
    if not isinstance(value, list):
        if required:
            raise EvalCaseError(f"{field}_must_be_list")
        return ()
    items = tuple(str(item).strip() for item in value if str(item).strip())
    if required and not items:
        raise EvalCaseError(f"{field}_must_not_be_empty")
    return items


def parse_eval_case(payload: dict[str, Any], *, line_number: int) -> EvalCase:
    case_id = str(payload.get("case_id") or "").strip()
    text = payload.get("text")
    input_type = str(payload.get("input_type") or "text").strip()
    provenance = payload.get("provenance")
    if not case_id:
        raise EvalCaseError(f"line_{line_number}:case_id_required")
    if not isinstance(text, str) or len(text) > 20000:
        raise EvalCaseError(f"line_{line_number}:text_invalid")
    if input_type not in ALLOWED_INPUT_TYPES:
        raise EvalCaseError(f"line_{line_number}:input_type_invalid")
    if not isinstance(provenance, dict) or not provenance.get("source_type"):
        raise EvalCaseError(f"line_{line_number}:provenance_required")
    extraction = payload.get("extraction")
    if extraction is not None and not isinstance(extraction, dict):
        raise EvalCaseError(f"line_{line_number}:extraction_invalid")
    return EvalCase(
        case_id=case_id,
        language=str(payload.get("language") or "und")[:24],
        input_type=input_type,
        text=text,
        expected_verdicts=_string_tuple(payload.get("expected_verdicts"), "expected_verdicts", required=True),
        expected_reason_codes=_string_tuple(payload.get("expected_reason_codes"), "expected_reason_codes"),
        forbidden_verdicts=_string_tuple(payload.get("forbidden_verdicts"), "forbidden_verdicts"),
        expected_runtime_source=(
            str(payload.get("expected_runtime_source")).strip()
            if payload.get("expected_runtime_source")
            else None
        ),
        gate=bool(payload.get("gate", True)),
        provenance={str(key)[:48]: str(value)[:200] for key, value in provenance.items()},
        extraction=extraction,
    )


def load_eval_cases(path: Path) -> list[EvalCase]:
    cases: list[EvalCase] = []
    seen: set[str] = set()
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not raw_line.strip():
            continue
        try:
            payload = json.loads(raw_line)
        except json.JSONDecodeError as exc:
            raise EvalCaseError(f"line_{line_number}:invalid_json") from exc
        if not isinstance(payload, dict):
            raise EvalCaseError(f"line_{line_number}:object_required")
        case = parse_eval_case(payload, line_number=line_number)
        if case.case_id in seen:
            raise EvalCaseError(f"line_{line_number}:duplicate_case_id")
        seen.add(case.case_id)
        cases.append(case)
    if not cases:
        raise EvalCaseError("eval_suite_empty")
    return cases


def _evaluate_case(case: EvalCase) -> dict[str, Any]:
    verdict = analyze_scan(
        V0ScanInput(
            input_type=case.input_type,  # type: ignore[arg-type]
            text=case.text,
            language_hint=case.language,
            extraction=case.extraction,
            session_id=f"eval-{case.case_id}",
        )
    )
    reason_codes = [reason.code for reason in verdict.reasons]
    failures: list[str] = []
    if verdict.verdict not in case.expected_verdicts:
        failures.append(f"verdict:{verdict.verdict} not in {','.join(case.expected_verdicts)}")
    if verdict.verdict in case.forbidden_verdicts:
        failures.append(f"forbidden_verdict:{verdict.verdict}")
    missing_reasons = [reason for reason in case.expected_reason_codes if reason not in reason_codes]
    if missing_reasons:
        failures.append(f"missing_reasons:{','.join(missing_reasons)}")
    if case.expected_runtime_source and verdict.runtime_source != case.expected_runtime_source:
        failures.append(f"runtime_source:{verdict.runtime_source}")
    return {
        "case_id": case.case_id,
        "language": case.language,
        "input_type": case.input_type,
        "input_sha256": hashlib.sha256(case.text.encode("utf-8")).hexdigest(),
        "input_characters": len(case.text),
        "gate": case.gate,
        "provenance": case.provenance,
        "passed": not failures,
        "failures": failures,
        "observed": {
            "verdict": verdict.verdict,
            "risk_level": verdict.risk_level,
            "reason_codes": reason_codes,
            "runtime_source": verdict.runtime_source,
            "extraction_quality": verdict.extraction_quality,
        },
    }


def run_eval_suite(cases: list[EvalCase]) -> dict[str, Any]:
    results = [_evaluate_case(case) for case in cases]
    gate_results = [result for result in results if result["gate"]]
    gate_failures = [result for result in gate_results if not result["passed"]]
    observations = [result for result in results if not result["gate"]]
    observation_gaps = [result for result in observations if not result["passed"]]
    return {
        "schema_version": "chetana.eval.v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "status": "pass" if not gate_failures else "fail",
        "summary": {
            "total_cases": len(results),
            "gate_cases": len(gate_results),
            "gate_passed": len(gate_results) - len(gate_failures),
            "gate_failed": len(gate_failures),
            "observation_cases": len(observations),
            "observation_gaps": len(observation_gaps),
        },
        "privacy": {
            "raw_text_in_receipt": False,
            "input_identifier": "sha256",
        },
        "results": results,
    }
