from __future__ import annotations

import html
import json
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
CONTRACT_PATH = REPO_ROOT / "docs" / "institutional" / "chetana_institutional_v1.json"


def load_institutional_contract() -> dict[str, Any]:
    return json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))


def build_observatory_payload(contract: dict[str, Any], pilottrace: dict[str, Any]) -> dict[str, Any]:
    totals = pilottrace["totals"]
    observed = [
        {"id": "scans_completed", "label": "Qualifying scans", "value": totals["scans_completed"]},
        {"id": "high_risk_pauses", "label": "High-risk pauses", "value": totals["high_risk_pauses"]},
        {"id": "follow_through_sessions", "label": "Follow-through sessions", "value": totals["follow_through_sessions"]},
        {"id": "official_rail_taps", "label": "Official-rail taps", "value": totals["official_rail_taps"]},
        {"id": "feedback_submissions", "label": "Feedback submissions", "value": totals["feedback_submissions"]},
    ]
    payload = {
        "schema_version": "chetana.observatory.v1",
        "published_at": contract["published_at"],
        "evidence_classes": contract["evidence_classes"],
        **contract["observatory"],
        "chetana_observed": {
            "evidence_class": "observed",
            "status": pilottrace["status"],
            "trailing_days": pilottrace["trailing_days"],
            "generated_at_utc": pilottrace["generated_at_utc"],
            "metrics": observed,
            "quality": pilottrace["quality"],
            "caveat": (
                "No qualifying Chetana observations exist in this window. This is not evidence of zero fraud."
                if pilottrace["status"] == "empty"
                else "These are Chetana event-ledger aggregates, not official crime statistics or causal efficacy results."
            ),
        },
        "pilot_derived": {
            "evidence_class": "pilot_derived",
            "status": "pending",
            "metrics": [],
            "caveat": "No named institutional pilot result has been published.",
        },
    }
    return payload


def _base_head(title: str, description: str, canonical: str) -> str:
    return f"""<meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="{html.escape(description, quote=True)}">
  <link rel="canonical" href="https://chetana.activemirror.ai{canonical}">
  <title>{html.escape(title)}</title>
  <style>
    :root {{ color-scheme:light; --ink:#151918; --muted:#58635f; --line:#ccd4d0; --soft:#f3f6f4; --green:#126847; --green-soft:#e3f2e9; --amber:#8a580e; --amber-soft:#fff1d5; --red:#943737; }}
    * {{ box-sizing:border-box; }} body {{ margin:0; color:var(--ink); background:#fff; font:16px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }}
    a {{ color:var(--green); font-weight:750; }} header {{ border-bottom:1px solid var(--line); }} header div,main {{ width:min(100% - 32px,1120px); margin:auto; }} header div {{ min-height:64px; display:flex; align-items:center; justify-content:space-between; gap:18px; }} header a {{ color:var(--ink); text-decoration:none; }}
    main {{ padding:42px 0 72px; }} h1 {{ max-width:920px; margin:8px 0 14px; font-size:clamp(2.5rem,7vw,5.4rem); line-height:.98; letter-spacing:0; }} h2 {{ margin:0 0 12px; font-size:1.45rem; }} h3 {{ margin:0 0 8px; font-size:1rem; }} p {{ color:var(--muted); }} .lead {{ max-width:820px; font-size:1.08rem; }} .eyebrow {{ color:var(--green); font-size:.76rem; font-weight:850; text-transform:uppercase; }}
    .notice {{ margin:26px 0; padding:16px 18px; border-left:4px solid var(--amber); background:var(--amber-soft); }} .notice p {{ margin:0; color:var(--ink); }} .band {{ padding:34px 0; border-top:1px solid var(--line); }}
    .grid {{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }} .grid.two {{ grid-template-columns:repeat(2,minmax(0,1fr)); }} .card {{ min-width:0; padding:18px; border:1px solid var(--line); border-radius:6px; }} .card.soft {{ background:var(--soft); }} .metric {{ display:block; margin:4px 0 7px; font-size:1.6rem; line-height:1.1; overflow-wrap:anywhere; }} .meta {{ color:var(--muted); font-size:.82rem; }}
    .tag {{ display:inline-flex; padding:4px 7px; border-radius:3px; background:var(--green-soft); color:var(--green); font-size:.7rem; font-weight:850; text-transform:uppercase; }} .tag.pending {{ color:var(--amber); background:var(--amber-soft); }} ul {{ padding-left:20px; color:var(--muted); }} .actions {{ display:flex; flex-wrap:wrap; gap:10px; margin:22px 0; }} .actions a {{ min-height:44px; display:inline-flex; align-items:center; padding:0 14px; border:1px solid var(--line); border-radius:6px; text-decoration:none; }} .actions .primary {{ color:#fff; background:var(--ink); border-color:var(--ink); }}
    .status {{ display:inline-flex; padding:7px 10px; border-radius:4px; color:var(--amber); background:var(--amber-soft); font-weight:800; }} .foot {{ color:var(--muted); font-size:.86rem; }}
    @media(max-width:780px) {{ header div {{ align-items:flex-start; flex-direction:column; gap:2px; padding:12px 0; }} header span {{ color:var(--muted); font-size:.88rem; }} .grid,.grid.two {{ grid-template-columns:1fr; }} h1 {{ font-size:2.65rem; }} }}
    @media print {{ .actions {{ display:none; }} main {{ padding:20px 0; }} }}
  </style>"""


def render_observatory_html(payload: dict[str, Any]) -> str:
    metric_cards = "".join(
        f"""<article class="card soft"><span class="tag">Official</span><strong class="metric">{html.escape(item['display'])}</strong><h3>{html.escape(item['label'])}</h3><p class="meta">{html.escape(item['geography'])} &middot; {html.escape(item['period'])}</p><p>{html.escape(item['caveat'])}</p><a href="{html.escape(item['source_url'], quote=True)}">Open primary source</a></article>"""
        for item in payload["official_metrics"]
    )
    observed = payload["chetana_observed"]
    observed_cards = "".join(
        f"""<article class="card"><strong class="metric">{item['value']:,}</strong><h3>{html.escape(item['label'])}</h3><span class="tag">Observed</span></article>"""
        for item in observed["metrics"]
    )
    pending = "".join(f"<li>{html.escape(item)}</li>" for item in payload["pending_claims"])
    return f"""<!doctype html><html lang="en"><head>{_base_head(payload['title'], payload['description'], '/observatory')}</head><body>
<header><div><a href="/">Chetana</a><span>India Scam Readiness Observatory</span></div></header><main>
  <div class="eyebrow">Source-labelled public evidence</div><h1>See the pressure. Keep the proof boundaries.</h1><p class="lead">{html.escape(payload['description'])}</p>
  <div class="notice"><p><strong>Method:</strong> {html.escape(payload['method'])}</p></div>
  <div class="actions"><a class="primary" href="/partners/30-day-pilot">Run a 30-day pilot</a><a href="/partners/trust-room">Open Trust Room</a><a href="/api/v1/observatory">Open JSON</a></div>
  <section class="band"><div class="eyebrow">Official context</div><h2>Pressure and response, as reported by source</h2><div class="grid">{metric_cards}</div></section>
  <section class="band"><div class="eyebrow">Chetana observed &middot; trailing {observed['trailing_days']} days</div><h2>{'No qualifying observations yet' if observed['status'] == 'empty' else 'What the Chetana ledger observed'}</h2><p>{html.escape(observed['caveat'])}</p><div class="grid">{observed_cards}</div><p class="meta">Generated {html.escape(observed['generated_at_utc'])}. Invalid event rows: {observed['quality']['invalid_event_rows']}; synthetic rows excluded: {observed['quality']['synthetic_event_rows_excluded']}; duplicate rows excluded: {observed['quality']['duplicate_event_rows_excluded']}.</p></section>
  <section class="band grid two"><div><span class="tag pending">Pilot-derived &middot; pending</span><h2>No institutional result is being implied</h2><p>{html.escape(payload['pilot_derived']['caveat'])}</p></div><div><span class="tag pending">Pending evidence</span><h2>Claims Chetana does not make</h2><ul>{pending}</ul></div></section>
  <p class="foot">Chetana is independent. Official figures remain owned and defined by their cited publishers; they are not Chetana performance evidence.</p>
</main></body></html>"""


def render_pilot_html(contract: dict[str, Any]) -> str:
    pilot = contract["pilot"]
    scope = "".join(f"<li>{html.escape(item)}</li>" for item in pilot["fixed_scope"])
    measures = "".join(f"<li>{html.escape(item)}</li>" for item in pilot["measures"])
    excluded = "".join(f"<li>{html.escape(item)}</li>" for item in pilot["not_included"])
    stops = "".join(f"<li>{html.escape(item)}</li>" for item in pilot["stop_conditions"])
    timeline = "".join(
        f"""<article class="card"><span class="tag">Days {html.escape(item['days'])}</span><h2>{html.escape(item['name'])}</h2><p>{html.escape(item['detail'])}</p></article>"""
        for item in pilot["timeline"]
    )
    return f"""<!doctype html><html lang="en"><head>{_base_head('Chetana 30-day Digital Kavach Pilot', pilot['promise'], '/partners/30-day-pilot')}</head><body>
<header><div><a href="/">Chetana</a><span>Chetana 30-Day Fraud Pause Pilot</span></div></header><main>
  <div class="eyebrow">30-day Digital Kavach Pilot &middot; fixed institutional evaluation</div><h1>One audience. Thirty days. A written decision.</h1><p class="lead">{html.escape(pilot['promise'])}</p><div class="status">Ready to scope &middot; commercial and legal approval still required</div>
  <div class="actions"><a class="primary" href="/partners#pilot-inquiry">Start the written intake</a><a href="/observatory">See India evidence</a><a href="/partners/trust-room">Review Trust Room</a><a href="/partners/field-harness">Open field harness</a><a href="/api/v1/partners/30-day-pilot">Open JSON contract</a></div>
  <section class="band"><div class="eyebrow">Harness loop</div><h2>Source-tagged link brings a user to the scam checker.</h2><p>The user gets a bounded risk read and official next step. PilotTrace then reports aggregate use and data-quality rows without exposing the user's raw scam content to the sponsor.</p></section>
  <section class="band grid two"><div><div class="eyebrow">Fixed scope</div><h2>What the pilot includes</h2><ul>{scope}</ul></div><div><div class="eyebrow">Measured, not promised</div><h2>Decision measures</h2><ul>{measures}</ul></div></section>
  <section class="band"><div class="eyebrow">Thirty-day sequence</div><div class="grid two">{timeline}</div></section>
  <section class="band grid two"><div><div class="eyebrow">Outside the offer</div><h2>What this does not include</h2><ul>{excluded}</ul></div><div><div class="eyebrow">Fail closed</div><h2>Stop conditions</h2><ul>{stops}</ul></div></section>
  <div class="notice"><p><strong>No efficacy promise:</strong> the pilot measures whether people use Chetana, pause, act, report errors, and reach official rails. It does not guarantee avoided loss or recovery.</p></div>
  <p class="foot">Chetana is independent and is not a government, RBI, NPCI, I4C, CERT-In, police, telecom, or bank service.</p>
</main></body></html>"""


def render_trust_room_html(contract: dict[str, Any], assurance: dict[str, Any]) -> str:
    trust = contract["trust_room"]
    implemented = "".join(f"<li>{html.escape(item)}</li>" for item in trust["implemented"])
    blocks = "".join(f"<li>{html.escape(item)}</li>" for item in trust["open_blocks"])
    artifacts = "".join(
        f"""<article class="card"><h3>{html.escape(item['label'])}</h3><p>{html.escape(item['purpose'])}</p><a href="{html.escape(item['url'], quote=True)}">Open artifact</a></article>"""
        for item in trust["artifacts"]
    )
    verification = assurance["verification"]
    verification_label = "valid" if verification["valid"] else "failed"
    return f"""<!doctype html><html lang="en"><head>{_base_head('Chetana Institutional Trust Room', trust['plain_position'], '/partners/trust-room')}</head><body>
<header><div><a href="/">Chetana</a><span>Institutional Trust Room</span></div></header><main>
  <div class="eyebrow">Vendor review without the capability theatre</div><h1>Inspect what is implemented. See what is still open.</h1><p class="lead">{html.escape(trust['plain_position'])}</p>
  <div class="notice"><p><strong>Current posture:</strong> implemented baseline with open blocks. Signed regression receipt verification is <strong>{verification_label}</strong>; that verifies integrity, not accuracy or field efficacy.</p></div>
  <div class="actions"><a class="primary" href="/partners#pilot-inquiry">Submit written diligence</a><a href="/assurance">Open Safety Lab</a><a href="/observatory">Open Observatory</a><a href="/api/v1/institutional/trust-room">Open JSON</a></div>
  <section class="band grid two"><div><span class="tag">Implemented</span><h2>Current controls and evidence</h2><ul>{implemented}</ul></div><div><span class="tag pending">Open blocks</span><h2>Not certified or established</h2><ul>{blocks}</ul></div></section>
  <section class="band"><div class="eyebrow">Review artifacts</div><h2>Open the underlying evidence</h2><div class="grid">{artifacts}</div></section>
  <section class="band grid two"><div><h2>Data boundary</h2><p>Sponsor reporting is aggregate by default. Research examples require a separate consent, retention, deletion, and adjudication contract. A pilot does not grant access to consumer content or create a sponsor-visible identity graph.</p></div><div><h2>Authority boundary</h2><p>The Partner Desk can qualify an inquiry in writing. Pricing, contracts, procurement, security exceptions, data processing, production integration, claims, and endorsements require authorised human approval.</p><p>Contact: <a href="mailto:{html.escape(trust['contact'], quote=True)}">{html.escape(trust['contact'])}</a></p></div></section>
  <p class="foot">This Trust Room is an engineering disclosure, not a certification, legal opinion, regulatory approval, or institutional endorsement.</p>
</main></body></html>"""
