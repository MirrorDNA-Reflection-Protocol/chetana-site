from __future__ import annotations

import json
import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.analytics import build_live_stats_snapshot, build_v0_analytics_summary


class AnalyticsSummaryTests(unittest.TestCase):
    def test_summary_filters_window_and_synthetic_sessions(self) -> None:
        now = datetime.now(UTC)
        current_ts = now.isoformat()
        older_ts = (now - timedelta(days=30)).isoformat()

        events = [
            {
                "event_name": "app_open",
                "session_id": "prod-one",
                "timestamp_utc": current_ts,
                "device_class": "web",
                "metadata": {
                    "event_version": "chetana.v0.analytics.v2",
                    "entry_source": "direct",
                    "page_path": "/",
                },
            },
            {
                "event_name": "scan_started",
                "session_id": "prod-one",
                "timestamp_utc": current_ts,
                "input_type": "text",
                "device_class": "web",
                "language_hint": "en",
            },
            {
                "event_name": "scan_completed",
                "session_id": "prod-one",
                "timestamp_utc": current_ts,
                "scan_id": "scan-1",
                "input_type": "text",
                "verdict": "high_risk",
                "scam_type": "fake_kyc",
                "confidence_band": "high",
                "device_class": "web",
                "language_hint": "en",
            },
            {
                "event_name": "report_tapped",
                "session_id": "prod-one",
                "timestamp_utc": current_ts,
                "scan_id": "scan-1",
                "device_class": "web",
                "language_hint": "en",
                "report_target": "manual_report",
                "metadata": {
                    "report_surface": "call_1930",
                    "recovery_step": "hotline_call",
                    "recovery_channel": "phone",
                    "official_rail_id": "CYBER_HELPLINE_1930",
                    "event_version": "chetana.v0.analytics.v2",
                },
            },
            {
                "event_name": "app_open",
                "session_id": "prod-two",
                "timestamp_utc": current_ts,
                "device_class": "desktop",
                "metadata": {
                    "event_version": "chetana.v0.analytics.v2",
                    "entry_source": "campaign",
                    "page_path": "/scan",
                    "utm_source": "the420",
                },
            },
            {
                "event_name": "scan_started",
                "session_id": "prod-two",
                "timestamp_utc": current_ts,
                "input_type": "text",
                "device_class": "desktop",
                "language_hint": "hi",
            },
            {
                "event_name": "scan_completed",
                "session_id": "prod-two",
                "timestamp_utc": current_ts,
                "scan_id": "scan-2",
                "input_type": "text",
                "verdict": "needs_review",
                "scam_type": "upi_qr_scam",
                "confidence_band": "low",
                "device_class": "desktop",
                "language_hint": "hi",
            },
            {
                "event_name": "evidence_saved",
                "session_id": "prod-two",
                "timestamp_utc": current_ts,
                "scan_id": "scan-2",
                "input_type": "text",
                "device_class": "desktop",
                "language_hint": "hi",
                "metadata": {
                    "recovery_step": "evidence_download",
                    "recovery_channel": "device_export",
                    "event_version": "chetana.v0.analytics.v2",
                },
            },
            {
                "event_name": "share_completed",
                "session_id": "prod-two",
                "timestamp_utc": current_ts,
                "scan_id": "scan-2",
                "share_channel": "copy_link",
                "device_class": "desktop",
                "language_hint": "hi",
                "metadata": {"event_version": "chetana.v0.analytics.v2"},
            },
            {
                "event_name": "app_open",
                "session_id": "qa-session",
                "timestamp_utc": current_ts,
                "metadata": {"surface": "qa"},
            },
            {
                "event_name": "scan_completed",
                "session_id": "qa-session",
                "timestamp_utc": current_ts,
                "scan_id": "qa-scan",
                "input_type": "text",
                "verdict": "needs_review",
                "metadata": {"surface": "qa"},
            },
            {
                "event_name": "scan_completed",
                "session_id": "test-session",
                "timestamp_utc": current_ts,
                "scan_id": "test-scan",
                "input_type": "text",
                "verdict": "high_risk",
            },
            {
                "event_name": "app_open",
                "session_id": "prod-old",
                "timestamp_utc": older_ts,
                "device_class": "web",
            },
            {
                "event_name": "scan_completed",
                "session_id": "prod-old",
                "timestamp_utc": older_ts,
                "scan_id": "old-scan",
                "input_type": "text",
                "verdict": "high_risk",
                "scam_type": "remote_support_scam",
                "confidence_band": "high",
                "device_class": "web",
                "language_hint": "en",
            },
        ]

        with tempfile.TemporaryDirectory() as temp_dir:
            events_path = Path(temp_dir) / "events.jsonl"
            with events_path.open("w", encoding="utf-8") as handle:
                for event in events:
                    handle.write(json.dumps(event) + "\n")

            summary = build_v0_analytics_summary(events_path=events_path, trailing_days=7)
            live = build_live_stats_snapshot(events_path=events_path)

        self.assertEqual(summary.totals.events, 9)
        self.assertEqual(summary.totals.unique_sessions, 2)
        self.assertEqual(summary.totals.app_opens, 2)
        self.assertEqual(summary.totals.scan_starts, 2)
        self.assertEqual(summary.totals.scan_completes, 2)
        self.assertEqual(summary.totals.evidence_saves, 1)
        self.assertEqual(summary.totals.risky_verdicts, 1)
        self.assertEqual(summary.totals.report_taps, 1)
        self.assertEqual(summary.totals.share_completes, 1)

        self.assertEqual(summary.funnel.app_open_sessions, 2)
        self.assertEqual(summary.funnel.scan_started_sessions, 2)
        self.assertEqual(summary.funnel.scan_completed_sessions, 2)
        self.assertEqual(summary.funnel.started_then_completed_sessions, 2)
        self.assertEqual(summary.funnel.orphan_completed_sessions, 0)
        self.assertEqual(summary.funnel.evidence_saved_sessions, 1)
        self.assertEqual(summary.funnel.recovery_support_sessions, 2)
        self.assertEqual(summary.funnel.start_rate_from_open_pct, 100.0)
        self.assertEqual(summary.funnel.completion_rate_from_start_pct, 100.0)
        self.assertEqual(summary.funnel.report_rate_from_complete_pct, 50.0)
        self.assertEqual(summary.funnel.evidence_rate_from_complete_pct, 50.0)
        self.assertEqual(summary.funnel.recovery_support_rate_from_complete_pct, 100.0)
        self.assertEqual(summary.funnel.share_rate_from_complete_pct, 50.0)

        self.assertEqual(summary.breakdowns.scam_types, {"fake_kyc": 1, "upi_qr_scam": 1})
        self.assertEqual(summary.breakdowns.languages, {"en": 1, "hi": 1})
        self.assertEqual(summary.breakdowns.entry_sources, {"direct": 1, "campaign": 1})
        self.assertEqual(summary.breakdowns.utm_sources, {"the420": 1})
        self.assertEqual(summary.breakdowns.report_surfaces, {"call_1930": 1})
        self.assertEqual(summary.breakdowns.recovery_steps, {"hotline_call": 1, "evidence_download": 1})
        self.assertEqual(summary.breakdowns.recovery_channels, {"phone": 1, "device_export": 1})
        self.assertEqual(summary.breakdowns.official_rails, {"CYBER_HELPLINE_1930": 1})
        self.assertEqual(summary.breakdowns.share_channels, {"copy_link": 1})
        self.assertEqual(summary.breakdowns.event_versions, {"chetana.v0.analytics.v2": 5, "legacy_unversioned": 4})

        self.assertEqual(live["total_scans"], 2)
        self.assertEqual(live["scams_caught"], 1)
        self.assertEqual(live["scan_types_used"], 2)
        self.assertEqual(live["languages"], 2)

    def test_summary_flags_orphan_completions_without_exceeding_hundred_percent(self) -> None:
        now = datetime.now(UTC).isoformat()
        events = [
            {
                "event_name": "app_open",
                "session_id": "session-a",
                "timestamp_utc": now,
                "metadata": {"event_version": "chetana.v0.analytics.v2", "entry_source": "direct"},
            },
            {
                "event_name": "scan_started",
                "session_id": "session-a",
                "timestamp_utc": now,
                "input_type": "text",
            },
            {
                "event_name": "scan_completed",
                "session_id": "session-a",
                "timestamp_utc": now,
                "scan_id": "scan-a",
                "input_type": "text",
                "verdict": "high_risk",
            },
            {
                "event_name": "scan_completed",
                "session_id": "session-b",
                "timestamp_utc": now,
                "scan_id": "scan-b",
                "input_type": "text",
                "verdict": "needs_review",
            },
        ]

        with tempfile.TemporaryDirectory() as temp_dir:
            events_path = Path(temp_dir) / "events.jsonl"
            with events_path.open("w", encoding="utf-8") as handle:
                for event in events:
                    handle.write(json.dumps(event) + "\n")

            summary = build_v0_analytics_summary(events_path=events_path, trailing_days=7)

        self.assertEqual(summary.funnel.scan_started_sessions, 1)
        self.assertEqual(summary.funnel.scan_completed_sessions, 2)
        self.assertEqual(summary.funnel.started_then_completed_sessions, 1)
        self.assertEqual(summary.funnel.orphan_completed_sessions, 1)
        self.assertEqual(summary.funnel.completion_rate_from_start_pct, 100.0)

    def test_summary_labels_legacy_unattributed_app_opens(self) -> None:
        now = datetime.now(UTC).isoformat()
        events = [
            {
                "event_name": "app_open",
                "session_id": "legacy-open",
                "timestamp_utc": now,
            },
        ]

        with tempfile.TemporaryDirectory() as temp_dir:
            events_path = Path(temp_dir) / "events.jsonl"
            with events_path.open("w", encoding="utf-8") as handle:
                for event in events:
                    handle.write(json.dumps(event) + "\n")

            summary = build_v0_analytics_summary(events_path=events_path, trailing_days=7)

        self.assertEqual(summary.breakdowns.entry_sources, {"legacy_unattributed": 1})
        self.assertEqual(summary.breakdowns.event_versions, {"legacy_unversioned": 1})

    def test_summary_dedupes_replayed_client_events_and_tracks_quality(self) -> None:
        now = datetime.now(UTC)
        current_ts = now.isoformat()
        older_ts = (now - timedelta(days=12)).isoformat()
        events = [
            {
                "event_name": "app_open",
                "session_id": "prod-retry",
                "timestamp_utc": current_ts,
                "metadata": {
                    "event_version": "chetana.v0.analytics.v2",
                    "entry_source": "direct",
                    "client_event_id": "client-open-1",
                },
            },
            {
                "event_name": "scan_started",
                "session_id": "prod-retry",
                "timestamp_utc": current_ts,
                "input_type": "text",
                "metadata": {
                    "event_version": "chetana.v0.analytics.v2",
                    "client_event_id": "client-start-1",
                },
            },
            {
                "event_name": "scan_completed",
                "session_id": "prod-retry",
                "timestamp_utc": current_ts,
                "scan_id": "scan-retry",
                "input_type": "text",
                "verdict": "high_risk",
                "scam_type": "fake_kyc",
                "language_hint": "en",
                "device_class": "web",
                "metadata": {
                    "event_version": "chetana.v0.analytics.v2",
                    "client_event_id": "client-complete-1",
                },
            },
            {
                "event_name": "scan_completed",
                "session_id": "prod-retry",
                "timestamp_utc": current_ts,
                "scan_id": "scan-retry",
                "input_type": "text",
                "verdict": "high_risk",
                "scam_type": "fake_kyc",
                "language_hint": "en",
                "device_class": "web",
                "metadata": {
                    "event_version": "chetana.v0.analytics.v2",
                    "client_event_id": "client-complete-1",
                    "delivery_status": "replayed",
                },
            },
            {
                "event_name": "app_open",
                "session_id": "qa-synthetic",
                "timestamp_utc": current_ts,
                "metadata": {
                    "event_version": "chetana.v0.analytics.v2",
                    "is_test": True,
                },
            },
            {
                "event_name": "app_open",
                "session_id": "prod-old",
                "timestamp_utc": older_ts,
                "metadata": {
                    "event_version": "chetana.v0.analytics.v2",
                    "entry_source": "direct",
                },
            },
            {
                "event_name": "app_open",
                "session_id": "prod-bad-time",
                "timestamp_utc": "not-a-date",
                "metadata": {
                    "event_version": "chetana.v0.analytics.v2",
                    "entry_source": "direct",
                },
            },
        ]

        with tempfile.TemporaryDirectory() as temp_dir:
            events_path = Path(temp_dir) / "events.jsonl"
            with events_path.open("w", encoding="utf-8") as handle:
                for event in events:
                    handle.write(json.dumps(event) + "\n")

            summary = build_v0_analytics_summary(events_path=events_path, trailing_days=7)

        self.assertEqual(summary.totals.events, 3)
        self.assertEqual(summary.totals.scan_completes, 1)
        self.assertEqual(summary.totals.risky_verdicts, 1)
        self.assertEqual(summary.totals.unique_sessions, 1)
        self.assertEqual(summary.funnel.started_then_completed_sessions, 1)
        self.assertEqual(summary.funnel.orphan_completed_sessions, 0)
        self.assertEqual(summary.quality.invalid_timestamp_rows, 1)
        self.assertEqual(summary.quality.out_of_window_rows, 1)
        self.assertEqual(summary.quality.synthetic_rows, 1)
        self.assertEqual(summary.quality.duplicate_rows, 1)
        self.assertEqual(summary.breakdowns.event_versions, {"chetana.v0.analytics.v2": 3})


if __name__ == "__main__":
    unittest.main()
