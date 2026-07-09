from __future__ import annotations

import html
from urllib.parse import quote
from typing import Any


FIELD_SOURCE_TAGS: tuple[dict[str, str], ...] = (
    {
        "source": "bank_qr",
        "label": "Bank branch QR",
        "placement": "Branch poster, ATM lobby, statement insert, fraud-awareness SMS",
        "use_case": "Customer pauses before OTP, KYC, UPI collect, APK, or fake support action.",
    },
    {
        "source": "gov_qr",
        "label": "Government awareness QR",
        "placement": "Ward office, police awareness drive, cyber cell poster, public counter",
        "use_case": "Citizen gets a first safety read before panic, payment, or complaint confusion.",
    },
    {
        "source": "csr_qr",
        "label": "CSR digital safety QR",
        "placement": "School, college, senior citizen program, NGO field session",
        "use_case": "Families and students learn one action: screenshot anything and ask Chetana.",
    },
    {
        "source": "branch_poster",
        "label": "Branch poster",
        "placement": "Teller counter, relationship manager desk, waiting area",
        "use_case": "Walk-in customers check suspicious pressure while bank staff stay out of private chats.",
    },
    {
        "source": "merchant_counter",
        "label": "Merchant counter QR",
        "placement": "Retail counter, delivery pickup desk, association WhatsApp group",
        "use_case": "Merchant pauses before accepting fake payment proof or releasing goods.",
    },
    {
        "source": "whatsapp_forward",
        "label": "WhatsApp forward",
        "placement": "Family groups, resident groups, college groups, merchant groups",
        "use_case": "A trusted person forwards a simple check link before money moves.",
    },
)


def _scam_check_link(public_origin: str, source: str) -> str:
    origin = public_origin.rstrip("/")
    return f"{origin}/?source={source}&action=scam_check"


def _whatsapp_text(public_origin: str) -> str:
    return (
        "Fake hai kya? Screenshot bhejo. Chetana bata degi.\n\n"
        "Use this before paying, sharing OTP, installing an app, approving UPI, "
        f"or trusting a payment screenshot:\n{_scam_check_link(public_origin, 'whatsapp_forward')}"
    )


def _whatsapp_link(public_origin: str) -> str:
    return f"https://wa.me/?text={quote(_whatsapp_text(public_origin))}"


def build_field_harness(public_origin: str) -> dict[str, Any]:
    campaign_links = [
        {
            "source": item["source"],
            "label": item["label"],
            "placement": item["placement"],
            "use_case": item["use_case"],
            "url": _scam_check_link(public_origin, item["source"]),
            "qr_payload": _scam_check_link(public_origin, item["source"]),
            "tracked_params": {
                "source": item["source"],
                "action": "scam_check",
            },
        }
        for item in FIELD_SOURCE_TAGS
    ]
    return {
        "schema_version": "chetana.field_harness.v0.1",
        "sponsor_safe": True,
        "title": "Chetana 30-Day Field Harness",
        "public_origin": public_origin.rstrip("/"),
        "core_loop": [
            "User sees a QR, poster, WhatsApp forward, branch prompt, or merchant counter link.",
            "User screenshots, pastes, speaks, or taps the suspicious context.",
            "Chetana returns verdict, safest next action, compact proof, and official rails.",
            "User can share, copy a case packet, tap official rails, or submit bucketed feedback.",
            "Sponsor receives aggregate PilotTrace proof only.",
        ],
        "campaign_links": campaign_links,
        "whatsapp": {
            "text": _whatsapp_text(public_origin),
            "url": _whatsapp_link(public_origin),
        },
        "feedback_buckets": [
            {
                "id": "missed_scam",
                "label": "This was a scam but Chetana was too safe",
                "purpose": "False-safe complaint for review.",
                "free_text": False,
            },
            {
                "id": "too_cautious",
                "label": "Chetana warned too strongly",
                "purpose": "False-alarm report for calibration.",
                "free_text": False,
            },
            {
                "id": "scammed_after_scan",
                "label": "I was still scammed after checking",
                "purpose": "Follow-through failure signal.",
                "free_text": False,
            },
            {
                "id": "helped_me_pause",
                "label": "Chetana helped me stop",
                "purpose": "Positive pause signal.",
                "free_text": False,
            },
        ],
        "event_contract": [
            "app_open with source_param and action_param",
            "scan_started",
            "scan_completed with verdict, scam_type, input_type, language_hint, and device_class",
            "report_tapped with official_rail_id and recovery_step",
            "evidence_saved with recovery_step",
            "share_completed with share_channel",
            "feedback_submitted with feedback_type only",
            "local_scan_memory_cleared",
        ],
        "pilottrace_metrics": [
            "scans_completed",
            "high_risk_pauses",
            "follow_through_actions",
            "follow_through_sessions",
            "false_safe_complaints",
            "false_alarm_reports",
            "feedback_submissions",
            "official_rail_taps",
            "case_packets_copied",
            "share_completes",
            "privacy_controls_used",
            "source_params",
            "action_params",
        ],
        "privacy_boundary": [
            "No raw scan text is included in sponsor reporting.",
            "No screenshots, media, UPI IDs, phone numbers, URLs, emails, or message bodies are included.",
            "No user accounts, user profiles, or sponsor-visible identity graph are created.",
            "Partner reporting uses aggregate counters, source tags, and bucketed feedback.",
            "Raw examples require explicit user consent and separate research handling.",
        ],
        "consent_rule": "Aggregate by default; raw examples only with explicit opt-in.",
        "pilot_day_plan": [
            {"day": "0-2", "step": "Choose one audience and freeze source tags."},
            {"day": "3-7", "step": "Publish QR/WhatsApp links and validate event attribution."},
            {"day": "8-21", "step": "Review PilotTrace aggregates and tune copy, not user privacy boundaries."},
            {"day": "22-30", "step": "Deliver sponsor-safe proof and decide sponsorship, CSR, or integration path."},
        ],
    }


def _count_list(items: list[str]) -> str:
    return "\n".join(f"<li>{html.escape(item)}</li>" for item in items)


def render_field_harness_html(harness: dict[str, Any]) -> str:
    campaign_rows = "\n".join(
        f"""<div class="row">
          <span>{html.escape(item["label"])}</span>
          <p>{html.escape(item["placement"])}<br><a href="{html.escape(item["url"], quote=True)}">{html.escape(item["url"])}</a></p>
        </div>"""
        for item in harness["campaign_links"]
    )
    feedback_rows = "\n".join(
        f"""<div class="row">
          <span>{html.escape(item["id"])}</span>
          <p>{html.escape(item["label"])}<br>{html.escape(item["purpose"])} Free text: {str(item["free_text"]).lower()}.</p>
        </div>"""
        for item in harness["feedback_buckets"]
    )
    plan_steps = "\n".join(
        f"""<div class="step"><span>Day {html.escape(item["day"])}</span><strong>{html.escape(item["step"])}</strong></div>"""
        for item in harness["pilot_day_plan"]
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chetana 30-Day Field Harness</title>
  <meta name="description" content="Chetana field harness for source-tagged QR and WhatsApp pilots with sponsor-safe aggregate reporting.">
  <style>
    :root {{ color-scheme: light; --ink:#111827; --muted:#4b5563; --line:#d1d5db; --soft:#f8fafc; --accent:#047857; --gold:#a16207; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; background:#fff; color:var(--ink); font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height:1.55; }}
    main {{ width:100%; max-width:1040px; margin:0 auto; padding:34px 22px 44px; }}
    a {{ color:var(--accent); font-weight:800; overflow-wrap:anywhere; }}
    h1 {{ max-width:860px; margin:10px 0 12px; font-size:clamp(2.2rem, 6vw, 4.8rem); line-height:.96; letter-spacing:0; }}
    h2 {{ margin:0 0 10px; font-size:1.18rem; }}
    p {{ margin:0; color:var(--muted); }}
    .top {{ display:flex; justify-content:space-between; gap:16px; align-items:flex-start; padding-bottom:18px; border-bottom:2px solid var(--ink); }}
    .label {{ color:var(--gold); font-size:.74rem; font-weight:900; letter-spacing:.1em; text-transform:uppercase; }}
    .lead {{ max-width:760px; font-size:1.1rem; }}
    .cta {{ display:flex; flex-wrap:wrap; gap:10px; margin:18px 0 24px; }}
    .cta a {{ display:inline-flex; align-items:center; justify-content:center; min-height:44px; padding:0 14px; border-radius:8px; text-decoration:none; }}
    .primary {{ background:var(--accent); color:#fff; }}
    .secondary {{ border:1px solid var(--line); color:var(--ink); }}
    .grid {{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin:20px 0; }}
    .card, .box, .step {{ border:1px solid var(--line); border-radius:8px; background:#fff; padding:16px; }}
    .card {{ min-height:150px; background:var(--soft); }}
    .card strong, .step strong {{ display:block; margin-bottom:8px; color:var(--ink); }}
    .split {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:16px; }}
    .rows {{ display:grid; overflow:hidden; border:1px solid var(--line); border-radius:8px; }}
    .row {{ display:grid; grid-template-columns:180px minmax(0,1fr); gap:12px; padding:11px 12px; border-bottom:1px solid var(--line); }}
    .row:last-child {{ border-bottom:0; }}
    .row span, .step span {{ color:var(--gold); font-size:.72rem; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }}
    .steps {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-top:12px; }}
    ul {{ margin:.25rem 0 0; padding-left:1.1rem; color:var(--muted); }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; margin:10px 0 0; padding:14px; border-radius:8px; background:#0f172a; color:#e5e7eb; font-size:.94rem; line-height:1.55; }}
    .foot {{ margin-top:22px; padding-top:14px; border-top:1px solid var(--line); color:var(--muted); font-size:.86rem; }}
    @media (max-width:820px) {{ .top, .split {{ display:grid; grid-template-columns:1fr; }} .grid, .steps {{ grid-template-columns:1fr; }} .row {{ grid-template-columns:1fr; }} }}
    @media print {{ .cta {{ display:none; }} main {{ padding:18px; }} a {{ color:var(--ink); }} }}
  </style>
</head>
<body>
  <main>
    <div class="top">
      <div>
        <div class="label">Chetana by Active Mirror</div>
        <strong>Field harness</strong>
      </div>
      <p>Schema: <strong>{html.escape(harness["schema_version"])}</strong> | Sponsor-safe: <strong>{str(harness["sponsor_safe"]).lower()}</strong></p>
    </div>

    <h1>Chetana 30-Day Field Harness</h1>
    <p class="lead">Run source-tagged QR and WhatsApp campaigns that create real users, aggregate learning, and sponsor-safe proof without giving partners raw scam content.</p>
    <div class="cta">
      <a class="primary" href="{html.escape(harness["campaign_links"][0]["url"], quote=True)}">Open bank QR link</a>
      <a class="primary" href="{html.escape(harness["whatsapp"]["url"], quote=True)}">Forward WhatsApp copy</a>
      <a class="secondary" href="{html.escape(harness["public_origin"], quote=True)}/api/v1/partners/field-harness">Open JSON contract</a>
      <a class="secondary" href="{html.escape(harness["public_origin"], quote=True)}/partners/pilottrace">View PilotTrace</a>
      <a class="secondary" href="{html.escape(harness["public_origin"], quote=True)}/partners/30-day-pilot">Open 30-day pilot</a>
    </div>

    <section class="grid">
      <div class="card"><strong>One user action</strong><p>Screenshot anything suspicious and ask Chetana before paying, approving, sharing OTP, installing APK, or trusting payment proof.</p></div>
      <div class="card"><strong>One sponsor proof</strong><p>PilotTrace reports aggregate scans, high-risk pauses, official rail taps, case packet copies, shares, feedback, and privacy controls.</p></div>
      <div class="card"><strong>One research boundary</strong><p>Aggregate by default. Raw examples require explicit user opt-in and separate handling.</p></div>
    </section>

    <section class="split">
      <div class="box">
        <div class="label">Core loop</div>
        <h2>What happens in the field</h2>
        <ul>{_count_list(harness["core_loop"])}</ul>
      </div>
      <div class="box">
        <div class="label">WhatsApp copy</div>
        <h2>Forwardable message</h2>
        <pre>{html.escape(harness["whatsapp"]["text"])}</pre>
      </div>
    </section>

    <section class="box">
      <div class="label">Campaign links</div>
      <h2>Use one source tag per audience</h2>
      <p>Turn each URL into a QR code. Chetana counts the campaign label and action, not private scam text.</p>
      <div class="rows">{campaign_rows}</div>
    </section>

    <section class="split">
      <div class="box">
        <div class="label">Feedback buckets</div>
        <h2>Learn without open text collection</h2>
        <div class="rows">{feedback_rows}</div>
      </div>
      <div class="box">
        <div class="label">Privacy boundary</div>
        <h2>What sponsors do not get</h2>
        <ul>{_count_list(harness["privacy_boundary"])}</ul>
      </div>
    </section>

    <section>
      <div class="label">Pilot rhythm</div>
      <div class="steps">{plan_steps}</div>
    </section>

    <div class="foot">
      Chetana is independent and is not a government, RBI, NPCI, I4C, CERT-In, police, or bank service. The harness is a deployment contract for sponsor-safe pilots, not a fraud database.
    </div>
  </main>
</body>
</html>"""
