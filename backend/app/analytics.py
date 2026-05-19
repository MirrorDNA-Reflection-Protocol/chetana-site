from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from app.v0_runtime import V0_EVENTS_LOG, now_utc

RISKY_VERDICTS = {"high_risk", "caution"}
SUMMARY_CACHE: dict[tuple[str, int, int, int], "V0AnalyticsSummary"] = {}
SYNTHETIC_SESSION_PREFIXES = ("qa-", "test-", "synthetic-", "dev-")
SYNTHETIC_SURFACE_TOKENS = ("qa", "test", "synthetic", "dev")


class V0AnalyticsTotals(BaseModel):
    events: int = 0
    unique_sessions: int = 0
    app_opens: int = 0
    scan_starts: int = 0
    scan_completes: int = 0
    evidence_saves: int = 0
    first_scans: int = 0
    repeat_scans_7d: int = 0
    risky_verdicts: int = 0
    report_taps: int = 0
    share_taps: int = 0
    share_completes: int = 0


class V0AnalyticsFunnel(BaseModel):
    app_open_sessions: int = 0
    scan_started_sessions: int = 0
    scan_completed_sessions: int = 0
    started_then_completed_sessions: int = 0
    orphan_completed_sessions: int = 0
    report_tapped_sessions: int = 0
    evidence_saved_sessions: int = 0
    recovery_support_sessions: int = 0
    share_completed_sessions: int = 0
    start_rate_from_open_pct: float = 0.0
    completion_rate_from_start_pct: float = 0.0
    report_rate_from_complete_pct: float = 0.0
    evidence_rate_from_complete_pct: float = 0.0
    recovery_support_rate_from_complete_pct: float = 0.0
    share_rate_from_complete_pct: float = 0.0


class V0AnalyticsBreakdowns(BaseModel):
    verdicts: dict[str, int] = Field(default_factory=dict)
    scam_types: dict[str, int] = Field(default_factory=dict)
    input_types: dict[str, int] = Field(default_factory=dict)
    languages: dict[str, int] = Field(default_factory=dict)
    device_classes: dict[str, int] = Field(default_factory=dict)
    share_channels: dict[str, int] = Field(default_factory=dict)
    report_targets: dict[str, int] = Field(default_factory=dict)
    report_surfaces: dict[str, int] = Field(default_factory=dict)
    recovery_steps: dict[str, int] = Field(default_factory=dict)
    recovery_channels: dict[str, int] = Field(default_factory=dict)
    official_rails: dict[str, int] = Field(default_factory=dict)
    entry_sources: dict[str, int] = Field(default_factory=dict)
    entry_paths: dict[str, int] = Field(default_factory=dict)
    utm_sources: dict[str, int] = Field(default_factory=dict)
    event_versions: dict[str, int] = Field(default_factory=dict)


class V0AnalyticsDailyBucket(BaseModel):
    date: str
    events: int = 0
    unique_sessions: int = 0
    app_opens: int = 0
    scan_starts: int = 0
    scan_completes: int = 0
    evidence_saves: int = 0
    risky_verdicts: int = 0
    report_taps: int = 0
    share_completes: int = 0


class V0AnalyticsQuality(BaseModel):
    invalid_timestamp_rows: int = 0
    out_of_window_rows: int = 0
    synthetic_rows: int = 0
    duplicate_rows: int = 0


class V0AnalyticsSummary(BaseModel):
    source: str = "chetana_v0_events"
    generated_at_utc: str
    trailing_days: int
    invalid_rows: int = 0
    quality: V0AnalyticsQuality = Field(default_factory=V0AnalyticsQuality)
    totals: V0AnalyticsTotals
    funnel: V0AnalyticsFunnel
    breakdowns: V0AnalyticsBreakdowns
    daily: list[V0AnalyticsDailyBucket]


def _stat_key(path: Path) -> tuple[int, int]:
    if not path.exists():
        return (0, 0)
    stat = path.stat()
    return (stat.st_mtime_ns, stat.st_size)


def _read_events(path: Path) -> tuple[list[dict[str, Any]], int]:
    if not path.exists():
        return [], 0
    events: list[dict[str, Any]] = []
    invalid_rows = 0
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            payload = line.strip()
            if not payload:
                continue
            try:
                item = json.loads(payload)
            except json.JSONDecodeError:
                invalid_rows += 1
                continue
            if isinstance(item, dict):
                events.append(item)
            else:
                invalid_rows += 1
    return events, invalid_rows


def _as_date(timestamp_utc: Any) -> date | None:
    if not isinstance(timestamp_utc, str) or not timestamp_utc.strip():
        return None
    try:
        return datetime.fromisoformat(timestamp_utc.replace("Z", "+00:00")).astimezone(UTC).date()
    except ValueError:
        return None


def _surface_tokens(event: dict[str, Any]) -> str:
    metadata = event.get("metadata")
    if not isinstance(metadata, dict):
        return ""
    return str(metadata.get("surface") or metadata.get("analytics_source") or "").strip().lower()


def _metadata(event: dict[str, Any]) -> dict[str, Any]:
    metadata = event.get("metadata")
    return metadata if isinstance(metadata, dict) else {}


def _metadata_value(event: dict[str, Any], key: str) -> str:
    value = _metadata(event).get(key)
    return str(value or "").strip()


def _metadata_bool(event: dict[str, Any], key: str) -> bool:
    value = _metadata(event).get(key)
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "on"}
    if isinstance(value, (int, float)):
        return value != 0
    return False


def _infer_recovery_fields(event: dict[str, Any]) -> tuple[str, str, str]:
    metadata = _metadata(event)
    surface = str(metadata.get("report_surface") or "").strip()
    step = str(metadata.get("recovery_step") or "").strip()
    channel = str(metadata.get("recovery_channel") or "").strip()
    official_rail = str(metadata.get("official_rail_id") or "").strip()

    if surface == "call_1930":
        return (
            step or "hotline_call",
            channel or "phone",
            official_rail or "CYBER_HELPLINE_1930",
        )
    if surface in {"cybercrime_portal", "ncrp_report_suspect"}:
        return (
            step or "complaint_portal_open",
            channel or "web",
            official_rail or "NCRP_PORTAL",
        )
    if surface in {"ncrp_suspect_repository", "ncrp_suspect_websites"}:
        return (
            step or "suspect_lookup",
            channel or "web",
            official_rail or "NCRP_SUSPECT_LOOKUP",
        )
    if surface == "bank_app_support":
        return (
            step or "bank_support_open",
            channel or "app_or_phone",
            official_rail or "BANK_APP_SUPPORT",
        )
    if surface == "rbi_cms":
        return (
            step or "complaint_portal_open",
            channel or "web",
            official_rail or "RBI_CMS",
        )
    return step, channel, official_rail


def _is_synthetic_event(event: dict[str, Any]) -> bool:
    session_id = str(event.get("session_id") or "").strip().lower()
    if session_id.startswith(SYNTHETIC_SESSION_PREFIXES):
        return True
    if _metadata_bool(event, "is_test") or _metadata_bool(event, "is_synthetic"):
        return True
    environment = _metadata_value(event, "environment").lower()
    if environment in {"qa", "test", "testing", "synthetic", "dev", "development", "staging"}:
        return True
    surface = _surface_tokens(event)
    return any(token in surface for token in SYNTHETIC_SURFACE_TOKENS)


def _delivery_dedupe_key(event: dict[str, Any]) -> str:
    client_event_id = _metadata_value(event, "client_event_id").lower()
    if client_event_id:
        return f"client:{client_event_id}"
    event_id = str(event.get("event_id") or "").strip().lower()
    if event_id:
        return f"event:{event_id}"
    return ""


def _sorted_counts(counter: Counter[str]) -> dict[str, int]:
    return {
        key: count
        for key, count in counter.most_common()
        if key
    }


def _pct(part: int, whole: int) -> float:
    if whole <= 0:
        return 0.0
    return round((part / whole) * 100.0, 1)


def _normalize_verdict(verdict: Any) -> str:
    normalized = str(verdict or "").strip().lower()
    if normalized in {"suspicious", "high", "risky"}:
        return "high_risk"
    if normalized in {"unclear", "medium"}:
        return "caution"
    if normalized in {"safe", "low", "low_risk"}:
        return "low_signal"
    return normalized


def build_v0_analytics_summary(
    events_path: Path | None = None,
    trailing_days: int = 14,
) -> V0AnalyticsSummary:
    path = events_path or V0_EVENTS_LOG
    days = max(1, min(trailing_days, 90))
    stat_key = _stat_key(path)
    cache_key = (str(path), days, stat_key[0], stat_key[1])
    cached = SUMMARY_CACHE.get(cache_key)
    if cached is not None:
        return cached.model_copy(deep=True)

    events, invalid_rows = _read_events(path)
    today = datetime.now(UTC).date()
    start_date = today - timedelta(days=days - 1)
    filtered_events: list[dict[str, Any]] = []
    invalid_timestamp_rows = 0
    out_of_window_rows = 0
    synthetic_rows = 0
    duplicate_rows = 0
    seen_delivery_keys: set[str] = set()
    for event in events:
        event_date = _as_date(event.get("timestamp_utc"))
        if event_date is None:
            invalid_timestamp_rows += 1
            continue
        if event_date < start_date or event_date > today:
            out_of_window_rows += 1
            continue
        if _is_synthetic_event(event):
            synthetic_rows += 1
            continue
        delivery_key = _delivery_dedupe_key(event)
        if delivery_key and delivery_key in seen_delivery_keys:
            duplicate_rows += 1
            continue
        if delivery_key:
            seen_delivery_keys.add(delivery_key)
        filtered_events.append(event)

    totals = V0AnalyticsTotals(events=len(filtered_events))
    unique_sessions: set[str] = set()
    funnel_sessions: dict[str, set[str]] = defaultdict(set)
    daily_counts: dict[str, Counter[str]] = defaultdict(Counter)
    daily_sessions: dict[str, set[str]] = defaultdict(set)
    verdicts: Counter[str] = Counter()
    scam_types: Counter[str] = Counter()
    input_types: Counter[str] = Counter()
    languages: Counter[str] = Counter()
    device_classes: Counter[str] = Counter()
    share_channels: Counter[str] = Counter()
    report_targets: Counter[str] = Counter()
    report_surfaces: Counter[str] = Counter()
    recovery_steps: Counter[str] = Counter()
    recovery_channels: Counter[str] = Counter()
    official_rails: Counter[str] = Counter()
    entry_sources: Counter[str] = Counter()
    entry_paths: Counter[str] = Counter()
    utm_sources: Counter[str] = Counter()
    event_versions: Counter[str] = Counter()

    for event in filtered_events:
        event_name = str(event.get("event_name") or "").strip()
        session_id = str(event.get("session_id") or "").strip()
        event_date = _as_date(event.get("timestamp_utc"))
        day_key = event_date.isoformat() if event_date else ""
        metadata = _metadata(event)
        event_version = _metadata_value(event, "event_version")
        if event_version:
            event_versions[event_version] += 1
        else:
            event_versions["legacy_unversioned"] += 1

        if session_id:
            unique_sessions.add(session_id)
            if day_key:
                daily_sessions[day_key].add(session_id)

        if day_key:
            daily_counts[day_key]["events"] += 1

        if event_name == "app_open":
            totals.app_opens += 1
            if session_id:
                funnel_sessions["app_open"].add(session_id)
            if day_key:
                daily_counts[day_key]["app_opens"] += 1
            entry_source = _metadata_value(event, "entry_source")
            entry_sources[entry_source or "legacy_unattributed"] += 1
            page_path = _metadata_value(event, "page_variant") or _metadata_value(event, "page_path")
            if page_path:
                entry_paths[page_path] += 1
            utm_source = _metadata_value(event, "utm_source")
            if utm_source:
                utm_sources[utm_source] += 1
            continue

        if event_name == "scan_started":
            totals.scan_starts += 1
            if session_id:
                funnel_sessions["scan_started"].add(session_id)
            if day_key:
                daily_counts[day_key]["scan_starts"] += 1
            continue

        if event_name == "scan_completed":
            totals.scan_completes += 1
            if session_id:
                funnel_sessions["scan_completed"].add(session_id)
            if day_key:
                daily_counts[day_key]["scan_completes"] += 1

            verdict = _normalize_verdict(event.get("verdict"))
            if verdict:
                verdicts[verdict] += 1
                if verdict in RISKY_VERDICTS:
                    totals.risky_verdicts += 1
                    if day_key:
                        daily_counts[day_key]["risky_verdicts"] += 1

            scam_type = str(event.get("scam_type") or "").strip()
            if scam_type:
                scam_types[scam_type] += 1

            input_type = str(event.get("input_type") or "").strip()
            if input_type:
                input_types[input_type] += 1

            language = str(event.get("language_hint") or "").strip().lower()
            if language:
                languages[language] += 1

            device_class = str(event.get("device_class") or "").strip()
            if device_class:
                device_classes[device_class] += 1
            continue

        if event_name == "evidence_saved":
            totals.evidence_saves += 1
            if session_id:
                funnel_sessions["evidence_saved"].add(session_id)
            if day_key:
                daily_counts[day_key]["evidence_saves"] += 1
            step = _metadata_value(event, "recovery_step") or "evidence_download"
            channel = _metadata_value(event, "recovery_channel") or "device_export"
            recovery_steps[step] += 1
            recovery_channels[channel] += 1
            continue

        if event_name == "first_scan":
            totals.first_scans += 1
            continue

        if event_name == "repeat_scan_7d":
            totals.repeat_scans_7d += 1
            continue

        if event_name == "report_tapped":
            totals.report_taps += 1
            if session_id:
                funnel_sessions["report_tapped"].add(session_id)
            if day_key:
                daily_counts[day_key]["report_taps"] += 1
            report_target = str(event.get("report_target") or "").strip()
            if report_target:
                report_targets[report_target] += 1
            report_surface = str(metadata.get("report_surface") or "").strip()
            if report_surface:
                report_surfaces[report_surface] += 1
            recovery_step, recovery_channel, official_rail = _infer_recovery_fields(event)
            if recovery_step:
                recovery_steps[recovery_step] += 1
            if recovery_channel:
                recovery_channels[recovery_channel] += 1
            if official_rail:
                official_rails[official_rail] += 1
            continue

        if event_name == "share_tapped":
            totals.share_taps += 1
            continue

        if event_name == "share_completed":
            totals.share_completes += 1
            if session_id:
                funnel_sessions["share_completed"].add(session_id)
            if day_key:
                daily_counts[day_key]["share_completes"] += 1
            share_channel = str(event.get("share_channel") or "").strip()
            if share_channel:
                share_channels[share_channel] += 1

    totals.unique_sessions = len(unique_sessions)
    completed_after_start = funnel_sessions["scan_started"] & funnel_sessions["scan_completed"]
    orphan_completed = funnel_sessions["scan_completed"] - funnel_sessions["scan_started"]
    recovery_support_sessions = funnel_sessions["report_tapped"] | funnel_sessions["evidence_saved"]

    funnel = V0AnalyticsFunnel(
        app_open_sessions=len(funnel_sessions["app_open"]),
        scan_started_sessions=len(funnel_sessions["scan_started"]),
        scan_completed_sessions=len(funnel_sessions["scan_completed"]),
        started_then_completed_sessions=len(completed_after_start),
        orphan_completed_sessions=len(orphan_completed),
        report_tapped_sessions=len(funnel_sessions["report_tapped"]),
        evidence_saved_sessions=len(funnel_sessions["evidence_saved"]),
        recovery_support_sessions=len(recovery_support_sessions),
        share_completed_sessions=len(funnel_sessions["share_completed"]),
        start_rate_from_open_pct=_pct(len(funnel_sessions["scan_started"]), len(funnel_sessions["app_open"])),
        completion_rate_from_start_pct=_pct(len(completed_after_start), len(funnel_sessions["scan_started"])),
        report_rate_from_complete_pct=_pct(len(funnel_sessions["report_tapped"]), len(funnel_sessions["scan_completed"])),
        evidence_rate_from_complete_pct=_pct(len(funnel_sessions["evidence_saved"]), len(funnel_sessions["scan_completed"])),
        recovery_support_rate_from_complete_pct=_pct(len(recovery_support_sessions), len(funnel_sessions["scan_completed"])),
        share_rate_from_complete_pct=_pct(len(funnel_sessions["share_completed"]), len(funnel_sessions["scan_completed"])),
    )

    breakdowns = V0AnalyticsBreakdowns(
        verdicts=_sorted_counts(verdicts),
        scam_types=_sorted_counts(scam_types),
        input_types=_sorted_counts(input_types),
        languages=_sorted_counts(languages),
        device_classes=_sorted_counts(device_classes),
        share_channels=_sorted_counts(share_channels),
        report_targets=_sorted_counts(report_targets),
        report_surfaces=_sorted_counts(report_surfaces),
        recovery_steps=_sorted_counts(recovery_steps),
        recovery_channels=_sorted_counts(recovery_channels),
        official_rails=_sorted_counts(official_rails),
        entry_sources=_sorted_counts(entry_sources),
        entry_paths=_sorted_counts(entry_paths),
        utm_sources=_sorted_counts(utm_sources),
        event_versions=_sorted_counts(event_versions),
    )

    daily: list[V0AnalyticsDailyBucket] = []
    for offset in range(days):
        current = start_date + timedelta(days=offset)
        day_key = current.isoformat()
        counts = daily_counts.get(day_key, Counter())
        daily.append(
            V0AnalyticsDailyBucket(
                date=day_key,
                events=counts.get("events", 0),
                unique_sessions=len(daily_sessions.get(day_key, set())),
                app_opens=counts.get("app_opens", 0),
                scan_starts=counts.get("scan_starts", 0),
                scan_completes=counts.get("scan_completes", 0),
                evidence_saves=counts.get("evidence_saves", 0),
                risky_verdicts=counts.get("risky_verdicts", 0),
                report_taps=counts.get("report_taps", 0),
                share_completes=counts.get("share_completes", 0),
            )
        )

    summary = V0AnalyticsSummary(
        generated_at_utc=now_utc(),
        trailing_days=days,
        invalid_rows=invalid_rows,
        quality=V0AnalyticsQuality(
            invalid_timestamp_rows=invalid_timestamp_rows,
            out_of_window_rows=out_of_window_rows,
            synthetic_rows=synthetic_rows,
            duplicate_rows=duplicate_rows,
        ),
        totals=totals,
        funnel=funnel,
        breakdowns=breakdowns,
        daily=daily,
    )
    SUMMARY_CACHE.clear()
    SUMMARY_CACHE[cache_key] = summary
    return summary.model_copy(deep=True)


def build_live_stats_snapshot(events_path: Path | None = None) -> dict[str, int]:
    summary = build_v0_analytics_summary(events_path=events_path, trailing_days=14)
    return {
        "total_scans": summary.totals.scan_completes,
        "scams_caught": summary.totals.risky_verdicts,
        "scan_types_used": len(summary.breakdowns.scam_types),
        "languages": len(summary.breakdowns.languages),
    }
