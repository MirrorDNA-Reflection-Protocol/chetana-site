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


def render_goa_pilot_html(contract: dict[str, Any]) -> str:
    pilot = contract["pilot"]
    measures = "".join(f"<li>{html.escape(item)}</li>" for item in pilot["measures"])
    timeline = "".join(
        f"""<article class="card"><span class="tag">Days {html.escape(item['days'])}</span><h3>{html.escape(item['name'])}</h3><p>{html.escape(item['detail'])}</p></article>"""
        for item in pilot["timeline"]
    )
    return f"""<!doctype html><html lang="en"><head>{_base_head('Chetana for Goa Government', 'A 30-day citizen scam-pause pilot built in Goa.', '/partners/goa')}
  <style>
    .goa-hero {{ display:grid; grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr); gap:32px; align-items:end; padding-bottom:34px; }}
    .goa-hero h1 {{ max-width:760px; font-size:clamp(3rem,8vw,6.6rem); }}
    .goa-promise {{ padding:22px; border:2px solid var(--ink); border-radius:6px; }} .goa-promise strong {{ display:block; font-size:1.35rem; line-height:1.15; }}
    .goa-stat {{ display:grid; gap:4px; padding:18px; border-top:4px solid var(--green); background:var(--soft); }} .goa-stat strong {{ font-size:2rem; line-height:1; }}
    .goa-ask {{ padding:26px; color:#fff; background:var(--ink); border-radius:6px; }} .goa-ask p,.goa-ask li {{ color:#eef2f0; }} .goa-ask a {{ color:#fff; }}
    .goa-flow {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }} .goa-flow .card {{ border-top:4px solid var(--green); }}
    .source {{ font-size:.78rem; line-height:1.45; }}
    @media(max-width:780px) {{ .goa-hero,.goa-flow {{ grid-template-columns:1fr; }} }}
  </style></head><body>
<header><div><a href="/">Chetana</a><span>Goa Government Pilot Briefing</span></div></header><main>
  <section class="goa-hero">
    <div><div class="eyebrow">Built in Goa &middot; citizen safety &middot; 30-day pilot</div><h1>Stop the scam before the money moves.</h1><p class="lead">Chetana gives any citizen one simple place to check a suspicious screenshot, message, payment request, or voice note before acting. When harm has already happened, it routes them to 1930 and the correct official recovery rail.</p></div>
    <aside class="goa-promise"><span class="tag">The proposal</span><strong>Make Goa the first proving ground for a public, privacy-preserving scam-pause layer.</strong><p>No bank integration. No police-system access. No citizen account required for the first pilot.</p></aside>
  </section>

  <section class="band"><div class="eyebrow">Why Goa, why now</div><h2>The state is strengthening response. Chetana adds the citizen-side prevention layer.</h2><div class="grid">
    <article class="goa-stat"><strong>6,052</strong><span>cyber-fraud incidents reported in Goa since NCRP inception through 28 February 2025</span><p class="source">Official historical context, not current incidence or Chetana performance. <a href="https://mha.gov.in/MHA1/Par2017/pdfs/par2025-pdfs/RS12032025/1517.pdf">MHA parliamentary answer</a></p></article>
    <article class="goa-stat"><strong>Rs 149.06 crore</strong><span>amount reported in those Goa incidents</span><p class="source">Cumulative official figure through 28 February 2025. <a href="https://mha.gov.in/MHA1/Par2017/pdfs/par2025-pdfs/RS12032025/1517.pdf">Open primary source</a></p></article>
    <article class="goa-stat"><strong>2026</strong><span>Goa Police launched E-Zero FIR for cyber-financial fraud and PRISM</span><p class="source"><a href="https://dip.goa.gov.in/state-level-conference-of-dgps-igps-of-police-held/">Government of Goa release</a></p></article>
  </div></section>

  <section class="band"><div class="eyebrow">The citizen loop</div><h2>Four actions people can understand immediately.</h2><div class="goa-flow">
    <article class="card"><span class="tag">1</span><h3>Send</h3><p>Screenshot, paste, speak, or tap what happened.</p></article>
    <article class="card"><span class="tag">2</span><h3>Pause</h3><p>See a plain-language risk result before paying, sharing an OTP, or installing an app.</p></article>
    <article class="card"><span class="tag">3</span><h3>Act</h3><p>Follow one primary next step: stop, verify, call 1930, report, or begin recovery.</p></article>
    <article class="card"><span class="tag">4</span><h3>Measure</h3><p>PilotTrace records aggregate use and handoffs, never sponsor-visible raw scam content by default.</p></article>
  </div></section>

  <section class="band grid two"><div><div class="eyebrow">30-day Goa pilot</div><h2>Start narrow enough to prove.</h2><p>Choose one audience: senior citizens, women, students, small merchants, or government employees. Distribute one source-tagged link and QR through an existing Goa awareness channel. Chetana supplies the product, field harness, privacy boundary, and final decision packet.</p><div class="actions"><a class="primary" href="/partners#pilot-inquiry">Start written pilot intake</a><a href="/partners/30-day-pilot">Open full pilot contract</a><a href="/partners/trust-room">Review Trust Room</a></div></div><div><div class="eyebrow">Measured, not promised</div><h2>What Goa receives after 30 days</h2><ul>{measures}</ul></div></section>

  <section class="band"><div class="eyebrow">Sequence</div><div class="grid two">{timeline}</div></section>

  <section class="band grid two"><div class="goa-ask"><div class="eyebrow">The decision we need</div><h2>Approve a bounded Goa pilot.</h2><ul><li>Name one department owner.</li><li>Name one audience and distribution channel.</li><li>Approve official escalation wording and the privacy boundary.</li><li>Review the written result after 30 days: scale, revise, or stop.</li></ul><p><a href="mailto:paul@activemirror.ai">paul@activemirror.ai</a></p></div><div><div class="eyebrow">Strategic fit</div><h2>Goa already invites real-world government pilots.</h2><p>The Goa Open Innovation Challenge explicitly offers startups opportunities to pilot mature technology with government and industry. Goa's 2025 Startup Policy explicitly includes cybersecurity and AI ventures.</p><p class="source"><a href="https://www.startup.goa.gov.in/goa-open-innovation-challenge.html">Goa Open Innovation Challenge</a> &middot; <a href="https://www.startup.goa.gov.in/Notification/Goa-Startup-Policy-2025.pdf">Goa Startup Policy 2025</a> &middot; <a href="https://www.goa.gov.in/department/goa-police/">Goa Police 1930 guidance</a></p><div class="notice"><p><strong>Boundary:</strong> Chetana is independent. It does not claim Government of Goa, police, bank, RBI, NPCI, I4C, or CERT-In affiliation. A pilot would be an evaluation, not an endorsement.</p></div></div></section>
  <p class="foot">Chetana is a private advisory scam checker built in Goa. It routes citizens toward official help; it does not replace official reporting, investigation, or emergency response.</p>
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
