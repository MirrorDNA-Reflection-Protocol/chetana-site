from __future__ import annotations

import html
import json
from pathlib import Path
from typing import Any

from app.mirrorproof import SignedBenchmarkStatement, verify_benchmark_statement


REPO_ROOT = Path(__file__).resolve().parents[2]
ASSURANCE_ROOT = REPO_ROOT / "docs" / "assurance"
REPORT_PATH = ASSURANCE_ROOT / "chetana-regression-v0.1.json"
STATEMENT_PATH = ASSURANCE_ROOT / "chetana-regression-v0.1.mirrorproof.json"
SUITE_PATH = REPO_ROOT / "backend" / "evals" / "chetana_regression.jsonl"
RESEARCH_CONTRACT_PATH = ASSURANCE_ROOT / "research_candidate_contract_v0.1.json"


def load_research_contract() -> dict[str, Any]:
    return json.loads(RESEARCH_CONTRACT_PATH.read_text(encoding="utf-8"))


def load_assurance_payload() -> dict[str, Any]:
    report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    statement = SignedBenchmarkStatement.model_validate_json(STATEMENT_PATH.read_text(encoding="utf-8"))
    verification = verify_benchmark_statement(
        statement,
        suite_bytes=SUITE_PATH.read_bytes(),
        report=report,
    )
    return {
        "schema_version": "chetana.assurance_public.v0.1",
        "report": report,
        "signed_statement": statement.model_dump(),
        "verification": verification.model_dump(),
        "proof_boundary": {
            "proves": "The named suite and report are intact and bound to the registered Chetana issuer key.",
            "does_not_prove": [
                "population-level scam detection accuracy",
                "independent observation of the evaluation run",
                "field efficacy or prevented financial loss",
                "sender, account, or media authenticity",
            ],
        },
        "links": {
            "issuer": "https://id.activemirror.ai/issuers/chetana/v1.json",
            "verifier": "https://id.activemirror.ai/trust/",
            "pilot_packet": "https://chetana.activemirror.ai/partners/packet",
            "field_harness": "https://chetana.activemirror.ai/partners/field-harness",
        },
    }


def render_assurance_html(payload: dict[str, Any]) -> str:
    report = payload["report"]
    metrics = report["metrics"]
    summary = report["summary"]
    scam = metrics["scam_detection"]
    false_alarm = metrics["benign_false_alarm"]
    abstention = metrics["unreadable_abstention"]
    verification = payload["verification"]
    language_rows = "".join(
        f"<tr><td>{html.escape(language)}</td><td>{values['cases']}</td><td>{values['pass_rate_pct']:.1f}%</td></tr>"
        for language, values in metrics["languages"].items()
    )
    checked = "".join(f"<li>{html.escape(item)}</li>" for item in payload["signed_statement"]["checked_scope"])
    unchecked = "".join(f"<li>{html.escape(item)}</li>" for item in payload["signed_statement"]["unchecked_scope"])
    status = "Verified" if verification["valid"] else "Verification failed"
    status_class = "pass" if verification["valid"] else "fail"
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Signed, scope-bounded evaluation evidence for the Chetana scam safety runtime.">
  <link rel="canonical" href="https://chetana.activemirror.ai/assurance">
  <title>Chetana Safety Lab | Signed Evaluation Evidence</title>
  <style>
    :root {{ color-scheme:light; --ink:#171a19; --muted:#5c6662; --line:#ccd4d0; --soft:#f4f7f5; --green:#176b4d; --green-soft:#e2f2ea; --amber:#8a580e; --amber-soft:#fff0d2; --red:#9d3030; }}
    * {{ box-sizing:border-box; }} body {{ margin:0; color:var(--ink); background:#fff; font:16px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }}
    header {{ border-bottom:1px solid var(--line); }} header div, main {{ width:min(100% - 32px,1080px); margin:auto; }} header div {{ min-height:64px; display:flex; align-items:center; justify-content:space-between; gap:18px; }}
    a {{ color:var(--green); font-weight:700; }} header a {{ color:var(--ink); text-decoration:none; }} main {{ padding:42px 0 70px; }}
    h1 {{ max-width:760px; margin:8px 0 14px; font-size:clamp(2.35rem,7vw,5.2rem); line-height:.98; letter-spacing:0; }} h2 {{ margin:0 0 14px; font-size:1.35rem; }} p {{ color:var(--muted); }}
    .eyebrow {{ color:var(--green); font-size:.78rem; font-weight:800; text-transform:uppercase; }} .lead {{ max-width:760px; font-size:1.08rem; }}
    .boundary {{ margin:28px 0; padding:16px 18px; border-left:4px solid var(--amber); background:var(--amber-soft); color:var(--ink); }}
    .status {{ display:inline-flex; margin-top:10px; padding:7px 10px; border-radius:4px; font-weight:800; }} .status.pass {{ color:var(--green); background:var(--green-soft); }} .status.fail {{ color:var(--red); background:#fae5e5; }}
    .metrics {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); border:1px solid var(--line); margin:30px 0 46px; }} .metric {{ min-width:0; padding:20px; border-right:1px solid var(--line); }} .metric:last-child {{ border-right:0; }} .metric strong {{ display:block; font-size:1.7rem; }} .metric span {{ color:var(--muted); font-size:.88rem; }}
    .band {{ padding:32px 0; border-top:1px solid var(--line); }} .grid {{ display:grid; grid-template-columns:1fr 1fr; gap:34px; }} ul {{ color:var(--muted); padding-left:20px; }} table {{ width:100%; border-collapse:collapse; }} th,td {{ padding:10px; border-bottom:1px solid var(--line); text-align:left; }} th {{ background:var(--soft); font-size:.78rem; text-transform:uppercase; }}
    .actions {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:22px; }} .actions a {{ padding:11px 14px; border:1px solid var(--line); border-radius:6px; text-decoration:none; }} .actions a.primary {{ color:#fff; background:var(--ink); border-color:var(--ink); }} code {{ overflow-wrap:anywhere; }}
    @media(max-width:760px) {{ .metrics,.grid {{ grid-template-columns:1fr; }} .metric {{ border-right:0; border-bottom:1px solid var(--line); }} .metric:last-child {{ border-bottom:0; }} }}
  </style>
</head>
<body>
  <header><div><a href="/">Chetana</a><span>Safety Lab</span></div></header>
  <main>
    <div class="eyebrow">Public assurance evidence</div>
    <h1>Measure the safety claim.</h1>
    <p class="lead">This page publishes the current regression evidence, confidence intervals, proof limits, and cryptographic verification status for Chetana. It is evidence for a named build, not a universal accuracy claim.</p>
    <div class="status {status_class}">{status}: signed suite and report</div>
    <p class="boundary"><strong>Current limitation:</strong> this is a {summary['total_cases']}-case curated regression smoke suite. It is not an independent holdout and does not prove field efficacy.</p>
    <section class="metrics" aria-label="Current benchmark metrics">
      <div class="metric"><strong>{summary['total_cases']}</strong><span>Total curated cases</span></div>
      <div class="metric"><strong>{scam['recall_pct']:.1f}%</strong><span>Observed scam recall; 95% lower bound {scam['recall_wilson_95']['lower_pct']:.1f}%</span></div>
      <div class="metric"><strong>{false_alarm['rate_pct']:.1f}%</strong><span>Observed high-risk false alarms; 95% upper bound {false_alarm['rate_wilson_95']['upper_pct']:.1f}%</span></div>
      <div class="metric"><strong>{abstention['rate_pct']:.1f}%</strong><span>Unreadable-input abstention in {abstention['cases']} case</span></div>
    </section>
    <section class="band grid">
      <div><h2>Cryptographically checked</h2><ul>{checked}</ul><p>Statement hash: <code>{payload['signed_statement']['statement_hash']}</code></p></div>
      <div><h2>Not established</h2><ul>{unchecked}</ul><p>A valid signature proves integrity and issuer-key possession. It does not make the underlying assessment true.</p></div>
    </section>
    <section class="band grid">
      <div><h2>Language slices</h2><table><thead><tr><th>Language</th><th>Cases</th><th>Observed pass</th></tr></thead><tbody>{language_rows}</tbody></table></div>
      <div><h2>Institutional use</h2><p>Banks, government programs, CSR teams, and researchers can use the fixed pilot and field harness to run a bounded evaluation with aggregate outcomes and no sponsor-visible raw scam content by default.</p><div class="actions"><a class="primary" href="/partners/30-day-pilot">Open 30-day pilot</a><a href="/observatory">India Observatory</a><a href="/partners/trust-room">Trust Room</a><a href="/partners/field-harness">Field harness</a><a href="/api/v1/assurance">Machine-readable evidence</a><a href="/api/v1/assurance/research-contract">Research contract</a><a href="https://id.activemirror.ai/trust/">Receipt verifier</a></div></div>
    </section>
  </main>
</body>
</html>"""
