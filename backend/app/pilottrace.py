from __future__ import annotations

from collections import Counter
from datetime import UTC, date, datetime, timedelta
import html
import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from app.analytics import V0AnalyticsSummary
from app.v0_runtime import now_utc


class PilotTraceTotals(BaseModel):
    scans_completed: int = 0
    high_risk_pauses: int = 0
    follow_through_actions: int = 0
    follow_through_sessions: int = 0
    false_safe_complaints: int = 0
    false_alarm_reports: int = 0
    scam_confirmations: int = 0
    feedback_submissions: int = 0
    official_rail_taps: int = 0
    evidence_or_case_packets_saved: int = 0
    case_packets_copied: int = 0
    share_completes: int = 0
    privacy_controls_used: int = 0
    partner_inquiries: int = 0
    unique_sessions: int = 0


class PilotTraceQuality(BaseModel):
    invalid_event_rows: int = 0
    invalid_inquiry_rows: int = 0
    synthetic_event_rows_excluded: int = 0
    duplicate_event_rows_excluded: int = 0
    out_of_window_event_rows: int = 0
    out_of_window_inquiry_rows: int = 0


class PilotTraceRates(BaseModel):
    follow_through_rate_from_high_risk_pct: float = 0.0
    follow_through_rate_from_scans_pct: float = 0.0


class PilotTraceReport(BaseModel):
    schema_version: str = "chetana.pilottrace.v0.4"
    generated_at_utc: str
    trailing_days: int
    source: str = "v0_event_ledger_and_partner_inquiry_log"
    sponsor_safe: bool = True
    status: str
    totals: PilotTraceTotals
    rates: PilotTraceRates = Field(default_factory=PilotTraceRates)
    breakdowns: dict[str, dict[str, int]] = Field(default_factory=dict)
    daily: list[dict[str, Any]] = Field(default_factory=list)
    quality: PilotTraceQuality
    privacy_boundary: list[str] = Field(default_factory=list)
    excluded_fields: list[str] = Field(default_factory=list)
    missing_metrics: list[str] = Field(default_factory=list)
    proof_notes: list[str] = Field(default_factory=list)


def _parse_date(timestamp_utc: Any) -> date | None:
    if not isinstance(timestamp_utc, str) or not timestamp_utc.strip():
        return None
    try:
        return datetime.fromisoformat(timestamp_utc.replace("Z", "+00:00")).astimezone(UTC).date()
    except ValueError:
        return None


def _sorted_counts(counter: Counter[str]) -> dict[str, int]:
    return {key: count for key, count in counter.most_common() if key}


def _pct(part: int, whole: int) -> float:
    if whole <= 0:
        return 0.0
    return round((part / whole) * 100.0, 1)


def _read_partner_inquiries(path: Path, start_date: date, end_date: date) -> tuple[Counter[str], int, int]:
    if not path.exists():
        return Counter(), 0, 0

    pilot_types: Counter[str] = Counter()
    invalid_rows = 0
    out_of_window_rows = 0
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            text = line.strip()
            if not text:
                continue
            try:
                item = json.loads(text)
            except json.JSONDecodeError:
                invalid_rows += 1
                continue
            if not isinstance(item, dict):
                invalid_rows += 1
                continue
            received_date = _parse_date(item.get("received_at_utc"))
            if received_date is None:
                invalid_rows += 1
                continue
            if received_date < start_date or received_date > end_date:
                out_of_window_rows += 1
                continue
            pilot_type = str(item.get("pilot_type") or "unknown").strip() or "unknown"
            pilot_types[pilot_type] += 1
    return pilot_types, invalid_rows, out_of_window_rows


def build_pilottrace_report(
    summary: V0AnalyticsSummary,
    partner_inquiries_path: Path,
) -> PilotTraceReport:
    today = datetime.now(UTC).date()
    start_date = today - timedelta(days=summary.trailing_days - 1)
    inquiry_types, invalid_inquiry_rows, out_of_window_inquiry_rows = _read_partner_inquiries(
        partner_inquiries_path,
        start_date=start_date,
        end_date=today,
    )
    recovery_steps = summary.breakdowns.recovery_steps
    case_packets_copied = (
        recovery_steps.get("case_packet_copy", 0)
        + recovery_steps.get("linked_thread_case_packet_copy", 0)
    )
    official_rail_taps = sum(summary.breakdowns.official_rails.values())
    follow_through_actions = official_rail_taps + case_packets_copied + summary.totals.share_completes
    totals = PilotTraceTotals(
        scans_completed=summary.totals.scan_completes,
        high_risk_pauses=summary.totals.risky_verdicts,
        follow_through_actions=follow_through_actions,
        follow_through_sessions=summary.funnel.follow_through_sessions,
        false_safe_complaints=summary.totals.false_safe_complaints,
        false_alarm_reports=summary.totals.false_alarm_reports,
        scam_confirmations=summary.totals.scam_confirmations,
        feedback_submissions=summary.totals.feedback_submissions,
        official_rail_taps=official_rail_taps,
        evidence_or_case_packets_saved=summary.totals.evidence_saves,
        case_packets_copied=case_packets_copied,
        share_completes=summary.totals.share_completes,
        privacy_controls_used=summary.totals.local_scan_memory_clears,
        partner_inquiries=sum(inquiry_types.values()),
        unique_sessions=summary.totals.unique_sessions,
    )
    status = "active" if summary.totals.scan_completes or sum(inquiry_types.values()) else "empty"
    daily = [
        {
            "date": item.date,
            "scans_completed": item.scan_completes,
            "high_risk_pauses": item.risky_verdicts,
            "official_or_recovery_taps": item.report_taps,
            "case_or_evidence_saves": item.evidence_saves,
            "privacy_controls_used": item.local_scan_memory_clears,
            "feedback_submissions": item.feedback_submissions,
            "false_safe_complaints": item.false_safe_complaints,
        }
        for item in summary.daily
    ]
    return PilotTraceReport(
        generated_at_utc=now_utc(),
        trailing_days=summary.trailing_days,
        status=status,
        totals=totals,
        rates=PilotTraceRates(
            follow_through_rate_from_high_risk_pct=_pct(summary.funnel.follow_through_sessions, summary.totals.risky_verdicts),
            follow_through_rate_from_scans_pct=_pct(summary.funnel.follow_through_sessions, summary.totals.scan_completes),
        ),
        breakdowns={
            "verdicts": summary.breakdowns.verdicts,
            "scam_types": summary.breakdowns.scam_types,
            "input_types": summary.breakdowns.input_types,
            "languages": summary.breakdowns.languages,
            "official_rails": summary.breakdowns.official_rails,
            "recovery_steps": summary.breakdowns.recovery_steps,
            "share_channels": summary.breakdowns.share_channels,
            "privacy_actions": summary.breakdowns.local_privacy_actions,
            "feedback_types": summary.breakdowns.feedback_types,
            "feedback_surfaces": summary.breakdowns.feedback_surfaces,
            "entry_sources": summary.breakdowns.entry_sources,
            "source_params": summary.breakdowns.source_params,
            "action_params": summary.breakdowns.action_params,
            "utm_sources": summary.breakdowns.utm_sources,
            "partner_inquiry_types": _sorted_counts(inquiry_types),
        },
        daily=daily,
        quality=PilotTraceQuality(
            invalid_event_rows=summary.invalid_rows + summary.quality.invalid_timestamp_rows,
            invalid_inquiry_rows=invalid_inquiry_rows,
            synthetic_event_rows_excluded=summary.quality.synthetic_rows,
            duplicate_event_rows_excluded=summary.quality.duplicate_rows,
            out_of_window_event_rows=summary.quality.out_of_window_rows,
            out_of_window_inquiry_rows=out_of_window_inquiry_rows,
        ),
        privacy_boundary=[
            "No raw scan text is included.",
            "No screenshots or uploaded media are included.",
            "No raw UPI IDs, phone numbers, URLs, emails, or message bodies are included.",
            "No user profiles, account records, or sponsor-visible identity graph is created.",
            "Partner inquiries are counted by pilot lane only; names, emails, roles, and messages are excluded.",
            "Feedback is counted by reason bucket only; no free-text complaint body is collected for PilotTrace.",
            "Synthetic, QA, test, and duplicate event rows are excluded from the sponsor report.",
            "Source tags such as bank_qr, gov_qr, branch_poster, csr_qr, and whatsapp_forward are counted as campaign labels only.",
        ],
        excluded_fields=[
            "raw_scan_text",
            "screenshot_bytes",
            "upi_id",
            "phone_number",
            "url",
            "partner_name",
            "partner_email",
            "partner_message",
            "feedback_text",
            "ip_address",
            "device_identifier",
            "raw_referrer_url",
        ],
        missing_metrics=[],
        proof_notes=[
            "PilotTrace is derived from the Chetana v0 event ledger and the local partner inquiry log.",
            "This is an aggregate sponsor-safe report, not a fraud determination database.",
            "Follow-through sessions count at least one share, official rail tap, evidence save, or case-packet copy after a scan.",
            "False-safe complaints are user-submitted correction signals and require review before being treated as confirmed misses.",
            "Chetana routes users to official rails; it does not auto-file complaints.",
        ],
    )


def _metric_tile(label: str, value: int) -> str:
    return f"<div class=\"tile\"><span>{html.escape(label)}</span><strong>{value:,}</strong></div>"


def _value_tile(label: str, value: str) -> str:
    return f"<div class=\"tile\"><span>{html.escape(label)}</span><strong>{html.escape(value)}</strong></div>"


def _count_rows(title: str, counts: dict[str, int], empty_label: str = "No rows yet.") -> str:
    if not counts:
        return f"<section class=\"box\"><h2>{html.escape(title)}</h2><p>{html.escape(empty_label)}</p></section>"
    rows = "\n".join(
        f"<div class=\"row\"><span>{html.escape(key.replace('_', ' '))}</span><strong>{value:,}</strong></div>"
        for key, value in counts.items()
    )
    return f"<section class=\"box\"><h2>{html.escape(title)}</h2><div class=\"rows\">{rows}</div></section>"


def render_pilottrace_html(report: PilotTraceReport) -> str:
    totals = report.totals
    privacy_items = "\n".join(f"<li>{html.escape(item)}</li>" for item in report.privacy_boundary)
    missing_items = "\n".join(f"<li>{html.escape(item)}</li>" for item in report.missing_metrics)
    quality = report.quality
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chetana PilotTrace v0.4 Sponsor Proof Report</title>
  <meta name="description" content="Sponsor-safe Chetana PilotTrace aggregate proof report for scam-check pilots.">
  <style>
    :root {{ color-scheme: light; --ink:#111827; --muted:#4b5563; --line:#d1d5db; --soft:#f8fafc; --accent:#047857; --gold:#a16207; }}
    * {{ box-sizing:border-box; }}
    html, body {{ overflow-x:hidden; }}
    body {{ margin:0; background:#fff; color:var(--ink); font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height:1.55; }}
    main {{ width:100%; max-width:1040px; margin:0 auto; padding:34px 22px 44px; }}
    a {{ color:var(--accent); font-weight:800; }}
    h1 {{ max-width:820px; margin:10px 0 12px; font-size:clamp(2rem, 5vw, 4rem); line-height:1; letter-spacing:0; }}
    h2 {{ margin:0 0 10px; font-size:1.15rem; }}
    p, a, span, strong, li {{ overflow-wrap:anywhere; }}
    p {{ margin:0; color:var(--muted); }}
    .top {{ display:flex; justify-content:space-between; gap:16px; align-items:flex-start; padding-bottom:18px; border-bottom:2px solid var(--ink); }}
    .top > * {{ min-width:0; }}
    .label {{ color:var(--gold); font-size:.74rem; font-weight:900; letter-spacing:.1em; text-transform:uppercase; }}
    .cta {{ display:flex; flex-wrap:wrap; gap:10px; margin:18px 0 24px; }}
    .cta a {{ display:inline-flex; align-items:center; justify-content:center; max-width:100%; min-height:42px; padding:0 14px; border-radius:8px; text-decoration:none; }}
    .primary {{ background:var(--accent); color:#fff; }}
    .secondary {{ border:1px solid var(--line); color:var(--ink); }}
    .grid {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin:20px 0; }}
    .tile, .box {{ border:1px solid var(--line); border-radius:8px; background:#fff; padding:16px; }}
    .tile {{ min-height:112px; background:var(--soft); }}
    .tile span {{ color:var(--gold); font-size:.72rem; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }}
    .tile strong {{ display:block; margin-top:8px; font-size:2rem; line-height:1; }}
    .split {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:14px; }}
    .rows {{ display:grid; gap:6px; }}
    .row {{ display:flex; justify-content:space-between; gap:12px; padding:8px 0; border-bottom:1px solid var(--line); }}
    .row:last-child {{ border-bottom:0; }}
    .row span {{ color:var(--muted); overflow-wrap:anywhere; }}
    ul {{ margin:.25rem 0 0; padding-left:1.1rem; color:var(--muted); }}
    .foot {{ margin-top:22px; padding-top:14px; border-top:1px solid var(--line); color:var(--muted); font-size:.86rem; }}
    @media (max-width:760px) {{ .top, .split {{ display:grid; grid-template-columns:1fr; }} .grid {{ grid-template-columns:1fr 1fr; }} }}
    @media (max-width:460px) {{ .grid {{ grid-template-columns:1fr; }} }}
    @media print {{ .cta {{ display:none; }} main {{ padding:18px; }} }}
  </style>
</head>
<body>
  <main>
    <div class="top">
      <div>
        <div class="label">Chetana by Active Mirror</div>
        <strong>PilotTrace v0.4</strong>
      </div>
      <p>Generated {html.escape(report.generated_at_utc)} | Last {report.trailing_days} days | Status: <strong>{html.escape(report.status)}</strong></p>
    </div>
    <h1>Sponsor-safe proof report.</h1>
    <p>PilotTrace converts Chetana usage into aggregate proof a bank, public program, CSR team, or merchant network can review without seeing raw user scan content.</p>
    <div class="cta">
      <a class="primary" href="https://chetana.activemirror.ai/api/v1/partners/pilottrace">Open JSON report</a>
      <a class="primary" href="https://chetana.activemirror.ai/partners#pilot-inquiry">Request 30-day pilot</a>
      <a class="secondary" href="https://chetana.activemirror.ai/partners">Back to partner page</a>
      <a class="secondary" href="https://chetana.activemirror.ai/partners/field-harness">Open field harness</a>
      <a class="secondary" href="https://chetana.activemirror.ai/partners/packet">Open pilot packet</a>
    </div>
    <section class="grid">
      {_metric_tile("Scans completed", totals.scans_completed)}
      {_metric_tile("High-risk pauses", totals.high_risk_pauses)}
      {_value_tile("Follow-through rate", f"{report.rates.follow_through_rate_from_high_risk_pct:.1f}%")}
      {_metric_tile("Follow-through actions", totals.follow_through_actions)}
      {_metric_tile("False-safe complaints", totals.false_safe_complaints)}
      {_metric_tile("Feedback reports", totals.feedback_submissions)}
      {_metric_tile("Official rail taps", totals.official_rail_taps)}
      {_metric_tile("Case packets copied", totals.case_packets_copied)}
      {_metric_tile("Evidence saves", totals.evidence_or_case_packets_saved)}
      {_metric_tile("Shares completed", totals.share_completes)}
      {_metric_tile("Privacy controls used", totals.privacy_controls_used)}
      {_metric_tile("Partner inquiries", totals.partner_inquiries)}
    </section>
    <div class="split">
      {_count_rows("Top scam types", report.breakdowns.get("scam_types", {}))}
      {_count_rows("Official rails", report.breakdowns.get("official_rails", {}))}
      {_count_rows("Input types", report.breakdowns.get("input_types", {}))}
      {_count_rows("Feedback types", report.breakdowns.get("feedback_types", {}))}
      {_count_rows("Partner inquiry lanes", report.breakdowns.get("partner_inquiry_types", {}))}
      {_count_rows("Source tags", report.breakdowns.get("source_params", {}))}
      {_count_rows("Entry sources", report.breakdowns.get("entry_sources", {}))}
    </div>
    <div class="split">
      <section class="box"><h2>Privacy boundary</h2><ul>{privacy_items}</ul></section>
      <section class="box"><h2>Quality and gaps</h2><p>Invalid event rows: {quality.invalid_event_rows:,}. Invalid inquiry rows: {quality.invalid_inquiry_rows:,}. Synthetic rows excluded: {quality.synthetic_event_rows_excluded:,}. Duplicate rows excluded: {quality.duplicate_event_rows_excluded:,}.</p><ul>{missing_items}</ul></section>
    </div>
    <div class="foot">Chetana is independent and is not a government, RBI, NPCI, I4C, CERT-In, police, or bank service. PilotTrace is aggregate operational proof, not a database of fraud determinations.</div>
  </main>
</body>
</html>"""
