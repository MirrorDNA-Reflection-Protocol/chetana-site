#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.eval_harness import EvalCaseError, load_eval_cases, run_eval_suite
from app.mirrorproof import sign_benchmark_statement

DEFAULT_SUITE = BACKEND_ROOT / "evals" / "chetana_regression.jsonl"


def main() -> int:
    parser = argparse.ArgumentParser(description="Run privacy-safe deterministic Chetana regression cases.")
    parser.add_argument("--suite", type=Path, default=DEFAULT_SUITE)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--signed-output", type=Path)
    args = parser.parse_args()
    try:
        report = run_eval_suite(load_eval_cases(args.suite))
    except (OSError, EvalCaseError) as exc:
        print(json.dumps({"status": "invalid_suite", "error": str(exc)}, indent=2))
        return 2
    rendered = json.dumps(report, indent=2, ensure_ascii=True)
    print(rendered)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    if args.signed_output:
        statement = sign_benchmark_statement(report=report, suite_bytes=args.suite.read_bytes())
        args.signed_output.parent.mkdir(parents=True, exist_ok=True)
        args.signed_output.write_text(
            json.dumps(statement.model_dump(), indent=2, ensure_ascii=True) + "\n",
            encoding="utf-8",
        )
    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
