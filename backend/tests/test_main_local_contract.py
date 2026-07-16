import json
import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.analytics import build_v0_analytics_summary
from app.api_keys import require_api_key
import app.main as main_module
import app.partner_desk as partner_desk_module
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

    def test_health_reports_embedded_kavach_seed_without_legacy_service(self) -> None:
        with patch("httpx.get", side_effect=Exception("legacy Kavach parked")):
            resp = self.client.get("/health")

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["backend"], "showcase")
        self.assertEqual(data["kavach"], "local_seed")
        self.assertEqual(data["kavach_mode"], "embedded_local_seed")
        self.assertEqual(data["legacy_kavach"], "down")

    @patch("app.main.ollama_model_available", return_value=True)
    def test_language_contract_separates_live_beta_and_experimental(self, _model_available) -> None:
        resp = self.client.get("/api/languages")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        by_code = {item["code"]: item for item in data["languages"]}
        self.assertEqual(data["live_count"], 1)
        self.assertEqual(data["beta_count"], 1)
        self.assertEqual(by_code["en"]["status"], "live")
        self.assertEqual(by_code["hi"]["status"], "beta")
        self.assertEqual(by_code["ta"]["status"], "experimental")

        budget = self.client.get("/api/translate/budget").json()
        self.assertTrue(budget["sarvam_available"])
        self.assertEqual(budget["verified_languages"], ["en", "hi"])

        language_faq = next(item for item in main_module.FAQ_ENTRIES if item["topic"] == "languages")
        self.assertNotIn("works in all 22", language_faq["reply"])
        self.assertIn("Hindi", language_faq["reply"])

    def test_privacy_route_exposes_local_scan_memory_clear_control(self) -> None:
        resp = self.client.get("/privacy")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("no-transform", resp.headers["cache-control"])
        html = resp.text
        self.assertIn("Clear local scan memory", html)
        self.assertIn("Local scan memory cleared from this browser.", html)
        self.assertIn("local_scan_memory_cleared", html)
        self.assertIn("privacy_surface", html)
        self.assertIn("chetana_threat_threads_v1", html)
        self.assertIn("chetana_v0_event_queue", html)
        self.assertIn("It keeps language, install, consent, senior mode, and family settings.", html)
        self.assertIn("Mistral OCR", html)
        self.assertIn("IANA-designated RDAP registry", html)
        self.assertIn("normalized hostname", html)
        self.assertIn("never means safe", html)

    def test_partner_packet_route_and_sitemap_are_public(self) -> None:
        partners_resp = self.client.get("/partners")
        self.assertEqual(partners_resp.status_code, 200)
        partners_html = partners_resp.text
        self.assertIn("Chetana Partner Pilots for Banks, Government, and CSR", partners_html)
        self.assertIn('<meta property="og:title" content="Chetana Partner Pilots for Banks, Government, and CSR" />', partners_html)
        self.assertIn('<link rel="canonical" href="https://chetana.activemirror.ai/partners" />', partners_html)

        packet_resp = self.client.get("/partners/packet")
        self.assertEqual(packet_resp.status_code, 200)
        packet_html = packet_resp.text
        self.assertIn("Scam-check pilot packet", packet_html)
        self.assertIn("Fund a fraud pause before money moves.", packet_html)
        self.assertIn("No account. No profile database.", packet_html)
        self.assertIn("Open outreach kit", packet_html)
        self.assertIn("Open India kit", packet_html)
        self.assertIn("Open 30-day pilot", packet_html)

        outreach_resp = self.client.get("/partners/outreach-kit")
        self.assertEqual(outreach_resp.status_code, 200)
        outreach_html = outreach_resp.text
        self.assertIn("Chetana Outreach Kit for Sponsor Pilots", outreach_html)
        self.assertIn("Bank / PSP email", outreach_html)
        self.assertIn("Weekly pilot proof report", outreach_html)
        self.assertIn("Open India kit", outreach_html)
        self.assertIn("Open 30-day pilot", outreach_html)

        india_kit_resp = self.client.get("/partners/india-kit")
        self.assertEqual(india_kit_resp.status_code, 200)
        india_kit_html = india_kit_resp.text
        self.assertIn("Chetana India QR and WhatsApp Kit", india_kit_html)
        self.assertIn("Fake hai kya?", india_kit_html)
        self.assertIn("Screenshot bhejo. Chetana bata degi.", india_kit_html)
        self.assertIn("source=bank_qr&amp;action=scam_check", india_kit_html)
        self.assertIn("source=gov_qr&amp;action=scam_check", india_kit_html)
        self.assertIn("source=whatsapp_forward&amp;action=scam_check", india_kit_html)
        self.assertIn("No login. No complaint filed. Official next steps only.", india_kit_html)

        pilot_resp = self.client.get("/partners/30-day-pilot")
        self.assertEqual(pilot_resp.status_code, 200)
        pilot_html = pilot_resp.text
        self.assertIn("Chetana 30-Day Fraud Pause Pilot", pilot_html)
        self.assertIn("Harness loop", pilot_html)
        self.assertIn("Source-tagged link brings a user to the scam checker.", pilot_html)
        self.assertIn("Open field harness", pilot_html)

        harness_resp = self.client.get("/partners/field-harness")
        self.assertEqual(harness_resp.status_code, 200)
        harness_html = harness_resp.text
        self.assertIn("Chetana 30-Day Field Harness", harness_html)
        self.assertIn("chetana.field_harness.v0.1", harness_html)
        self.assertIn("source=bank_qr&amp;action=scam_check", harness_html)
        self.assertIn("source=merchant_counter&amp;action=scam_check", harness_html)
        self.assertIn("Aggregate by default", harness_html)
        self.assertIn("Open QR SVG", harness_html)
        self.assertIn("Open printable poster", harness_html)
        self.assertIn("Open launch receipt", harness_html)

        sitemap_resp = self.client.get("/sitemap.xml")
        self.assertEqual(sitemap_resp.status_code, 200)
        self.assertIn("https://chetana.activemirror.ai/partners", sitemap_resp.text)
        self.assertIn("https://chetana.activemirror.ai/partners/india-kit", sitemap_resp.text)
        self.assertIn("https://chetana.activemirror.ai/partners/30-day-pilot", sitemap_resp.text)
        self.assertIn("https://chetana.activemirror.ai/partners/goa", sitemap_resp.text)
        self.assertIn("https://chetana.activemirror.ai/partners/field-harness", sitemap_resp.text)
        self.assertIn("https://chetana.activemirror.ai/partners/packet", sitemap_resp.text)
        self.assertIn("https://chetana.activemirror.ai/partners/outreach-kit", sitemap_resp.text)
        self.assertIn("https://chetana.activemirror.ai/partners/pilottrace", sitemap_resp.text)

    def test_partner_inquiry_endpoint_records_local_lead(self) -> None:
        original_log = main_module.PARTNER_INQUIRIES_LOG
        original_desk_root = partner_desk_module.PARTNER_DESK_ROOT
        with tempfile.TemporaryDirectory() as tmpdir:
            main_module.PARTNER_INQUIRIES_LOG = Path(tmpdir) / "partners" / "inquiries.jsonl"
            partner_desk_module.PARTNER_DESK_ROOT = Path(tmpdir) / "partners" / "desk"
            main_module._PARTNER_REQUEST_LOG.clear()
            try:
                resp = self.client.post(
                    "/api/v1/partners/inquiries",
                    json={
                        "name": "Pilot Owner",
                        "organization": "Example Bank",
                        "role": "Fraud Risk",
                        "email": "pilot.owner@example.com",
                        "pilot_type": "bank_psp",
                        "message": "Run a branch-cluster pilot.",
                        "source_path": "/partners",
                        "consent_token": "I_CONSENT_TO_ACTIVE_MIRROR_PARTNER_FOLLOW_UP_V1",
                    },
                )
                self.assertEqual(resp.status_code, 200)
                data = resp.json()
                self.assertTrue(data["ok"])
                self.assertTrue(data["inquiry_id"].startswith("chetana-partner-"))

                lines = main_module.PARTNER_INQUIRIES_LOG.read_text(encoding="utf-8").splitlines()
                self.assertEqual(len(lines), 1)
                payload = json.loads(lines[0])
                self.assertNotIn("organization", payload)
                self.assertNotIn("email", payload)
                self.assertFalse(payload["contains_personal_data"])
                self.assertEqual(payload["conversation_storage"], "encrypted_local")
                self.assertEqual(payload["status"], "new")
                self.assertIn("partner_desk", data)
                self.assertFalse(data["partner_desk"]["desk"]["outbound_email_sent"])
            finally:
                main_module.PARTNER_INQUIRIES_LOG = original_log
                partner_desk_module.PARTNER_DESK_ROOT = original_desk_root

    def test_feedback_event_endpoint_accepts_bucketed_result_feedback(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            events_path = Path(tmpdir) / "events.jsonl"
            with patch("app.v0_runtime.V0_EVENTS_LOG", events_path):
                resp = self.client.post(
                    "/api/v0/events",
                    json={
                        "event_name": "feedback_submitted",
                        "session_id": "session-feedback",
                        "scan_id": "scan-feedback",
                        "input_type": "text",
                        "verdict": "low_signal",
                        "scam_type": "fake_kyc",
                        "confidence_band": "low",
                        "device_class": "web",
                        "payload_class": "cross_surface_signal",
                        "metadata": {
                            "feedback_type": "missed_scam",
                            "feedback_surface": "result_card",
                            "no_free_text_collected": True,
                            "free_text_that_should_not_exist": "",
                        },
                    },
                )
                self.assertTrue(events_path.exists())
                self.assertEqual(len(events_path.read_text(encoding="utf-8").splitlines()), 1)

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["event"]["event_name"], "feedback_submitted")
        self.assertEqual(data["event"]["metadata"]["feedback_type"], "missed_scam")
        self.assertTrue(data["event"]["metadata"]["no_free_text_collected"])

    def test_partner_field_harness_api_is_sponsor_safe(self) -> None:
        resp = self.client.get("/api/v1/partners/field-harness")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["schema_version"], "chetana.field_harness.v0.1")
        self.assertTrue(data["sponsor_safe"])
        self.assertEqual(data["consent_rule"], "Aggregate by default; raw examples only with explicit opt-in.")

        sources = {item["source"]: item for item in data["campaign_links"]}
        self.assertIn("bank_qr", sources)
        self.assertIn("gov_qr", sources)
        self.assertIn("whatsapp_forward", sources)
        self.assertIn("merchant_counter", sources)
        self.assertEqual(sources["bank_qr"]["tracked_params"], {"source": "bank_qr", "action": "scam_check"})
        self.assertEqual(
            sources["bank_qr"]["expected_app_open_metadata"],
            {
                "event_name": "app_open",
                "event_version": "chetana.v0.analytics.v2",
                "entry_source": "scam_check_link",
                "source_param": "bank_qr",
                "action_param": "scam_check",
            },
        )
        self.assertIn("source=bank_qr&action=scam_check", sources["bank_qr"]["url"])
        self.assertIn("/partners/qr/bank_qr.svg", sources["bank_qr"]["qr_svg_url"])
        self.assertIn("/partners/poster/bank_qr", sources["bank_qr"]["poster_url"])

        self.assertIn("No raw scan text is included in sponsor reporting.", data["privacy_boundary"])
        self.assertIn("source_params", data["pilottrace_metrics"])
        self.assertIn("feedback_submitted with feedback_type only", data["event_contract"])
        self.assertEqual(data["pilottrace_join_contract"]["event_name"], "app_open")
        self.assertEqual(data["pilottrace_join_contract"]["join_key"], "source_param")
        self.assertEqual(data["pilottrace_join_contract"]["expected_entry_source"], "scam_check_link")
        self.assertTrue(all(bucket["free_text"] is False for bucket in data["feedback_buckets"]))

        serialized = json.dumps(data)
        self.assertNotIn("raw_scan_text\":", serialized)
        self.assertNotIn("screenshot_bytes", serialized)

    def test_partner_field_launch_receipt_is_explicit_about_proof_limits(self) -> None:
        resp = self.client.get("/api/v1/partners/field-harness/launch-receipt")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["schema_version"], "chetana.field_launch_receipt.v0.1")
        self.assertEqual(data["status"], "ready_for_distribution")
        self.assertTrue(data["sponsor_safe"])
        self.assertEqual(data["asset_count"], 6)
        self.assertEqual(data["phone_camera_scan_proof"]["status"], "unchecked")
        self.assertIn("This receipt does not prove a physical phone camera scanned the QR.", data["proof_limits"])

        assets = {item["source"]: item for item in data["campaign_assets"]}
        self.assertIn("bank_qr", assets)
        bank_asset = assets["bank_qr"]
        self.assertEqual(bank_asset["tracked_params"], {"source": "bank_qr", "action": "scam_check"})
        self.assertEqual(bank_asset["expected_app_open_metadata"]["event_name"], "app_open")
        self.assertEqual(bank_asset["expected_app_open_metadata"]["entry_source"], "scam_check_link")
        self.assertEqual(bank_asset["expected_app_open_metadata"]["source_param"], "bank_qr")
        self.assertEqual(bank_asset["expected_app_open_metadata"]["action_param"], "scam_check")
        self.assertIn("source=bank_qr&action=scam_check", bank_asset["campaign_url"])
        self.assertRegex(bank_asset["qr_payload_sha256"], r"^[a-f0-9]{64}$")
        self.assertRegex(bank_asset["qr_svg_sha256"], r"^[a-f0-9]{64}$")
        self.assertRegex(bank_asset["poster_html_sha256"], r"^[a-f0-9]{64}$")
        self.assertTrue(all(bank_asset["checks"].values()))

    def test_partner_field_harness_qr_and_poster_assets_are_local(self) -> None:
        qr_resp = self.client.get("/partners/qr/bank_qr.svg")
        self.assertEqual(qr_resp.status_code, 200)
        self.assertIn("image/svg+xml", qr_resp.headers["content-type"])
        qr_svg = qr_resp.text
        self.assertIn("<svg", qr_svg)
        self.assertIn("viewBox=\"0 0 45 45\"", qr_svg)
        self.assertIn("Chetana Bank branch QR campaign code", qr_svg)
        self.assertIn("source=bank_qr&amp;action=scam_check", qr_svg)
        self.assertGreater(qr_svg.count("<rect"), 300)

        poster_resp = self.client.get("/partners/poster/bank_qr")
        self.assertEqual(poster_resp.status_code, 200)
        poster_html = poster_resp.text
        self.assertIn("Chetana Printable Poster - Bank branch QR", poster_html)
        self.assertIn("Fake hai kya?", poster_html)
        self.assertIn("Screenshot bhejo. Chetana bata degi.", poster_html)
        self.assertIn("<svg", poster_html)
        self.assertIn("source=bank_qr&amp;action=scam_check", poster_html)

        bad_qr = self.client.get("/partners/qr/not_real.svg")
        self.assertEqual(bad_qr.status_code, 404)
        bad_poster = self.client.get("/partners/poster/not_real")
        self.assertEqual(bad_poster.status_code, 404)

    def test_pilottrace_report_exposes_sponsor_safe_aggregates(self) -> None:
        original_log = main_module.PARTNER_INQUIRIES_LOG
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            events_path = root / "events.jsonl"
            inquiries_path = root / "partners" / "inquiries.jsonl"
            inquiries_path.parent.mkdir(parents=True, exist_ok=True)
            now = datetime.now(UTC)
            old = now - timedelta(days=40)
            with events_path.open("w", encoding="utf-8") as handle:
                for payload in [
                    {
                        "event_name": "app_open",
                        "session_id": "session-a",
                        "timestamp_utc": now.isoformat(),
                        "metadata": {
                            "event_version": "chetana.v0.analytics.v2",
                            "entry_source": "scam_check_link",
                            "source_param": "branch_poster",
                            "action_param": "scam_check",
                        },
                    },
                    {
                        "event_name": "scan_completed",
                        "session_id": "session-a",
                        "timestamp_utc": now.isoformat(),
                        "scan_id": "scan-a",
                        "input_type": "text",
                        "verdict": "high_risk",
                        "scam_type": "fake_kyc",
                        "language_hint": "en",
                        "device_class": "web",
                    },
                    {
                        "event_name": "report_tapped",
                        "session_id": "session-a",
                        "timestamp_utc": now.isoformat(),
                        "scan_id": "scan-a",
                        "input_type": "text",
                        "verdict": "high_risk",
                        "report_target": "manual_report",
                        "metadata": {
                            "report_surface": "call_1930",
                            "official_rail_id": "CYBER_HELPLINE_1930",
                            "recovery_step": "hotline_call",
                        },
                    },
                    {
                        "event_name": "evidence_saved",
                        "session_id": "session-a",
                        "timestamp_utc": now.isoformat(),
                        "scan_id": "scan-a",
                        "input_type": "text",
                        "verdict": "high_risk",
                        "metadata": {
                            "recovery_step": "case_packet_copy",
                            "recovery_channel": "clipboard",
                        },
                    },
                    {
                        "event_name": "share_completed",
                        "session_id": "session-a",
                        "timestamp_utc": now.isoformat(),
                        "scan_id": "scan-a",
                        "input_type": "text",
                        "verdict": "high_risk",
                        "share_channel": "whatsapp",
                    },
                    {
                        "event_name": "local_scan_memory_cleared",
                        "session_id": "session-a",
                        "timestamp_utc": now.isoformat(),
                        "metadata": {"privacy_action": "clear_scan_memory"},
                    },
                    {
                        "event_name": "feedback_submitted",
                        "session_id": "session-a",
                        "timestamp_utc": now.isoformat(),
                        "scan_id": "scan-a",
                        "input_type": "text",
                        "verdict": "low_signal",
                        "scam_type": "fake_kyc",
                        "confidence_band": "low",
                        "metadata": {
                            "feedback_type": "missed_scam",
                            "feedback_surface": "result_card",
                            "no_free_text_collected": True,
                            "private_feedback_note": "Do not expose this correction note.",
                        },
                    },
                    {
                        "event_name": "scan_completed",
                        "session_id": "qa-synthetic",
                        "timestamp_utc": now.isoformat(),
                        "scan_id": "scan-qa",
                        "input_type": "text",
                        "verdict": "high_risk",
                    },
                ]:
                    handle.write(json.dumps(payload) + "\n")

            inquiries_path.write_text(
                "\n".join([
                    json.dumps({
                        "inquiry_id": "chetana-partner-a",
                        "received_at_utc": now.isoformat(),
                        "organization": "Example Bank",
                        "email": "private@example.com",
                        "pilot_type": "bank_psp",
                        "message": "Do not expose this raw message.",
                    }),
                    json.dumps({
                        "inquiry_id": "chetana-partner-old",
                        "received_at_utc": old.isoformat(),
                        "pilot_type": "csr_digital_safety",
                    }),
                    "{not-json",
                ]) + "\n",
                encoding="utf-8",
            )
            main_module.PARTNER_INQUIRIES_LOG = inquiries_path

            try:
                with patch(
                    "app.main.build_v0_analytics_summary",
                    side_effect=lambda trailing_days=14: build_v0_analytics_summary(
                        events_path=events_path,
                        trailing_days=trailing_days,
                    ),
                ):
                    json_resp = self.client.get("/api/v1/partners/pilottrace?days=7")
                    html_resp = self.client.get("/partners/pilottrace?days=7")
            finally:
                main_module.PARTNER_INQUIRIES_LOG = original_log

        self.assertEqual(json_resp.status_code, 200)
        data = json_resp.json()
        self.assertEqual(data["schema_version"], "chetana.pilottrace.v0.4")
        self.assertTrue(data["sponsor_safe"])
        self.assertEqual(data["totals"]["scans_completed"], 1)
        self.assertEqual(data["totals"]["high_risk_pauses"], 1)
        self.assertEqual(data["totals"]["follow_through_actions"], 3)
        self.assertEqual(data["totals"]["follow_through_sessions"], 1)
        self.assertEqual(data["rates"]["follow_through_rate_from_high_risk_pct"], 100.0)
        self.assertEqual(data["totals"]["false_safe_complaints"], 1)
        self.assertEqual(data["totals"]["feedback_submissions"], 1)
        self.assertEqual(data["totals"]["official_rail_taps"], 1)
        self.assertEqual(data["totals"]["case_packets_copied"], 1)
        self.assertEqual(data["totals"]["share_completes"], 1)
        self.assertEqual(data["totals"]["privacy_controls_used"], 1)
        self.assertEqual(data["totals"]["partner_inquiries"], 1)
        self.assertEqual(data["breakdowns"]["feedback_types"], {"missed_scam": 1})
        self.assertEqual(data["breakdowns"]["partner_inquiry_types"], {"bank_psp": 1})
        self.assertEqual(data["breakdowns"]["source_params"], {"branch_poster": 1})
        self.assertEqual(data["breakdowns"]["action_params"], {"scam_check": 1})
        self.assertEqual(data["quality"]["invalid_inquiry_rows"], 1)
        self.assertEqual(data["quality"]["out_of_window_inquiry_rows"], 1)
        serialized = json.dumps(data)
        self.assertNotIn("private@example.com", serialized)
        self.assertNotIn("Do not expose this raw message.", serialized)
        self.assertNotIn("Do not expose this correction note.", serialized)

        self.assertEqual(html_resp.status_code, 200)
        self.assertIn("Chetana PilotTrace v0.4 Sponsor Proof Report", html_resp.text)
        self.assertIn("Follow-through rate", html_resp.text)
        self.assertIn("No raw scan text is included.", html_resp.text)
        self.assertIn("False-safe complaints", html_resp.text)
        self.assertIn("Request 30-day pilot", html_resp.text)

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
        self.assertIn("kavach_enrichment", data)
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
                    "metadata": {
                        "event_version": "chetana.v0.analytics.v2",
                        "entry_source": "scam_check_link",
                        "source_param": "bank_qr",
                        "action_param": "scam_check",
                        "utm_source": "the420",
                    },
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
        self.assertEqual(data["breakdowns"]["entry_sources"], {"scam_check_link": 1})
        self.assertEqual(data["breakdowns"]["source_params"], {"bank_qr": 1})
        self.assertEqual(data["breakdowns"]["action_params"], {"scam_check": 1})
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
