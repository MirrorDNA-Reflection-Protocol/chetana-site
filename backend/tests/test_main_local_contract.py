import json
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.analytics import build_v0_analytics_summary
from app.api_keys import require_api_key
from app.main import app


class MainLocalContractTests(unittest.TestCase):
    def setUp(self) -> None:
        app.dependency_overrides[require_api_key] = lambda: {
            "name": "Test Partner",
            "tier": "enterprise",
            "daily_limit": 999999,
            "rpm": 1000,
        }
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    @patch("app.main._notify_telegram", new_callable=AsyncMock, return_value=False)
    @patch(
        "app.main.build_live_scan_guidance",
        new_callable=AsyncMock,
        return_value={
            "scenario_label": "Remote access or fake support request",
            "hindi_quick_line": "रुकिए. पहले आधिकारिक स्रोत से जाँच कीजिए.",
            "needs_more_evidence": False,
        },
    )
    @patch("app.main.enrich_v0_verdict", new_callable=AsyncMock, side_effect=lambda verdict: verdict)
    def test_scan_full_uses_local_contract(self, _enrich, _guidance, _notify) -> None:
        resp = self.client.post(
            "/api/scan/full",
            json={
                "text": "Bank support here. Install AnyDesk now and share your screen to verify KYC.",
                "lang": "en",
            },
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["engine"], "chetana_v0_local")
        self.assertEqual(data["incident_state"], "device_access_requested")
        self.assertEqual(data["trust_state"], "blocked")
        self.assertTrue(data["scan_id"].startswith("chetana-scan-"))
        self.assertIn("guidance", data)
        self.assertIn("do_not_do", data["guidance"])

    @patch("app.main._notify_telegram", new_callable=AsyncMock, return_value=False)
    @patch(
        "app.main.build_live_scan_guidance",
        new_callable=AsyncMock,
        return_value={
            "scenario_label": "Payment or UPI pressure request",
            "hindi_quick_line": "पैसे मत भेजो. पहले जाँच करो.",
            "needs_more_evidence": False,
        },
    )
    @patch("app.main.enrich_v0_verdict", new_callable=AsyncMock, side_effect=lambda verdict: verdict)
    def test_chat_returns_same_scan_contract(self, _enrich, _guidance, _notify) -> None:
        resp = self.client.post(
            "/api/chat",
            json={
                "message": "Urgent KYC update. Pay Rs 500 now or your account will be blocked today.",
                "lang": "en",
            },
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("scan", data)
        self.assertIn("reply", data)
        self.assertIn("Why this was flagged", data["reply"])
        self.assertEqual(data["scan"]["trust_state"], "blocked")
        self.assertTrue(data["scan"]["scan_id"].startswith("chetana-scan-"))

    @patch(
        "app.b2b_router.enrich_v0_verdict",
        new_callable=AsyncMock,
        side_effect=lambda verdict: verdict,
    )
    def test_partner_scan_exposes_canonical_contract(self, _enrich) -> None:
        resp = self.client.post(
            "/api/v1/scan",
            json={
                "text": "Courier customs issue. Pay the fee now or the parcel will be returned.",
                "lang": "en",
                "input_type": "text",
            },
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn(data["verdict"], {"high_risk", "caution", "needs_review", "low_signal"})
        self.assertIn("guidance", data)
        self.assertIn("reason_codes", data)
        self.assertTrue(data["scan_id"].startswith("chetana-scan-"))

    def test_analytics_summary_endpoint_exposes_canonical_totals(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            events_path = Path(tempdir) / "events.jsonl"
            now = datetime.now(UTC).isoformat()
            with events_path.open("w", encoding="utf-8") as handle:
                handle.write(json.dumps({
                    "event_name": "app_open",
                    "session_id": "session-a",
                    "timestamp_utc": now,
                    "metadata": {"event_version": "chetana.v0.analytics.v2", "entry_source": "campaign", "utm_source": "the420"},
                }) + "\n")
                handle.write(json.dumps({
                    "event_name": "scan_started",
                    "session_id": "session-a",
                    "timestamp_utc": now,
                    "input_type": "text",
                }) + "\n")
                handle.write(json.dumps({
                    "event_name": "scan_completed",
                    "session_id": "session-a",
                    "timestamp_utc": now,
                    "scan_id": "scan-a",
                    "input_type": "text",
                    "verdict": "high_risk",
                    "scam_type": "remote_support_scam",
                    "language_hint": "en",
                    "device_class": "web",
                }) + "\n")

            with patch(
                "app.main.build_v0_analytics_summary",
                side_effect=lambda trailing_days=14: build_v0_analytics_summary(
                    events_path=events_path,
                    trailing_days=trailing_days,
                ),
            ):
                resp = self.client.get("/api/v1/analytics/summary?days=3")

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["trailing_days"], 3)
        self.assertEqual(data["totals"]["scan_completes"], 1)
        self.assertEqual(data["totals"]["risky_verdicts"], 1)
        self.assertEqual(data["breakdowns"]["entry_sources"], {"campaign": 1})
        self.assertEqual(data["breakdowns"]["utm_sources"], {"the420": 1})

    def test_legacy_analytics_event_is_mirrored_into_v0_contract(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            analytics_path = Path(tempdir) / "analytics.jsonl"
            with patch("app.main._ANALYTICS_LOG", analytics_path), patch("app.main.log_v0_event") as mirror:
                resp = self.client.post(
                    "/api/analytics/event",
                    json={
                        "event": "scan",
                        "scan_type": "qr",
                        "verdict": "HIGH",
                        "score": 88,
                        "language": "hi",
                    },
                )
                self.assertEqual(resp.status_code, 200)
                self.assertTrue(analytics_path.exists())
                entries = [json.loads(line) for line in analytics_path.read_text(encoding="utf-8").splitlines() if line.strip()]

        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["event"], "scan")
        mirror.assert_called_once()
        payload = mirror.call_args.args[0]
        self.assertEqual(payload.event_name, "scan_completed")
        self.assertEqual(payload.input_type, "qr_image")
        self.assertEqual(payload.verdict, "high_risk")
        self.assertEqual(payload.confidence_band, "high")
        self.assertEqual(payload.language_hint, "hi")
        self.assertEqual(payload.metadata["analytics_source"], "legacy_api")


if __name__ == "__main__":
    unittest.main()
