import json
from pathlib import Path

from app.eval_harness import load_eval_cases, run_eval_suite


SUITE = Path(__file__).parents[1] / "evals" / "chetana_regression.jsonl"


def test_default_eval_suite_passes_gate_cases_and_experimental_language_probes() -> None:
    report = run_eval_suite(load_eval_cases(SUITE))

    assert report["status"] == "pass"
    assert report["summary"]["gate_failed"] == 0
    assert report["summary"]["observation_cases"] == 2
    assert report["summary"]["observation_gaps"] == 0


def test_eval_receipt_hashes_inputs_without_emitting_raw_text() -> None:
    report = run_eval_suite(load_eval_cases(SUITE))
    rendered = json.dumps(report, ensure_ascii=False)

    assert "SBI KYC officer" not in rendered
    assert "input_sha256" in rendered
    assert report["privacy"]["raw_text_in_receipt"] is False
