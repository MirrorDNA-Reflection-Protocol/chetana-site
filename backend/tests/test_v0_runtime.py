import unittest

from app.v0_runtime import (
    V0Entities,
    V0EventInput,
    V0Reason,
    V0ScanInput,
    V0TrustRuntimeRequest,
    V0Verdict,
    analyze_scan,
    build_event,
    build_merchant_release_assessment,
    build_trust_bundle,
    now_utc,
)


class V0TrustRuntimeTests(unittest.TestCase):
    def test_high_risk_payment_screenshot_hard_stops(self) -> None:
        scan = analyze_scan(
            V0ScanInput(
                input_type="payment_screenshot",
                text="Urgent. Payment successful screenshot attached. Pay Rs 5000 now for release. Merchant: Test Store.",
                language_hint="en",
                session_id="test-session",
            )
        )

        bundle = build_trust_bundle(
            V0TrustRuntimeRequest(
                verdict=scan,
                input_text="Urgent. Payment successful screenshot attached. Pay Rs 5000 now for release. Merchant: Test Store.",
            )
        )

        self.assertEqual(bundle.send_guard.decision, "HARD_STOP")
        self.assertIsNotNone(bundle.recovery_packet)
        self.assertIsNotNone(bundle.merchant_release)
        assert bundle.recovery_packet is not None
        assert bundle.merchant_release is not None
        self.assertEqual(scan.incident_state, "payment_attempted")
        self.assertTrue(any("Do not pay" in item or "Do not transfer" in item for item in scan.guidance.do_not_do))
        self.assertEqual(bundle.merchant_release.decision, "DO_NOT_RELEASE")
        self.assertIn(
            "CYBER_HELPLINE_1930",
            [rail.rail_id for rail in bundle.recovery_packet.official_rails],
        )

    def test_low_signal_text_allows_without_recovery_packet(self) -> None:
        scan = analyze_scan(
            V0ScanInput(
                input_type="text",
                text="Please call me when free.",
                language_hint="en",
                session_id="test-session",
            )
        )

        bundle = build_trust_bundle(
            V0TrustRuntimeRequest(
                verdict=scan,
                input_text="Please call me when free.",
            )
        )

        self.assertEqual(bundle.send_guard.decision, "ALLOW")
        self.assertIsNone(bundle.recovery_packet)
        self.assertIsNone(bundle.merchant_release)
        self.assertEqual(scan.evidence_state, "weak")
        self.assertEqual(scan.guidance.source, "deterministic")

    def test_verified_payment_proof_can_clear_merchant_release(self) -> None:
        verdict = V0Verdict(
            scan_id="chetana-scan-test",
            timestamp_utc=now_utc(),
            input_type="payment_screenshot",
            language_hint="en",
            verdict="low_signal",
            risk_level="low",
            scam_type="fake_payment_proof",
            confidence_band="low",
            evidence_state="complete",
            incident_state="payment_attempted",
            reasons=[
                V0Reason(
                    code="unverifiable_contact",
                    label="Low signal from the material provided",
                    explanation="The current material does not show a strong scam signal.",
                )
            ],
            entities=V0Entities(
                upi_ids=["testshop@paytm"],
                amounts=["Rs 499"],
                merchant_names=["Test Store"],
            ),
            summary_plain_language="Low signal from the screenshot.",
            safe_next_step="Verify the payment inside the real bank or PSP app before any money, goods, or access changes hands.",
            guidance={
                "lead": "Low signal from the screenshot.",
                "why_it_was_flagged": ["The current material does not show a strong scam signal."],
                "do_now": ["Verify inside the real bank or PSP app before releasing goods."],
                "do_not_do": ["Do not release goods on a screenshot alone."],
                "if_already_acted": ["Preserve the proof chain and use official dispute rails."],
                "verification_route": "Verify inside the official bank / PSP app or merchant ledger.",
                "false_positive_recovery": "Re-check the transaction in the official ledger before overriding the warning.",
                "calm_script": "I will verify this inside the real ledger before I release anything.",
                "source": "deterministic",
            },
            recommended_actions=["verify_with_official_source"],
            share_shield_eligible=False,
            evidence_pack_eligible=False,
            notes=None,
        )

        assessment = build_merchant_release_assessment(
            V0TrustRuntimeRequest(
                verdict=verdict,
                input_text="Payment successful. UTR TXN123ABC9876. Merchant Test Store. Rs 499. UPI ID testshop@paytm.",
                source_name="Test Store",
            )
        )

        self.assertIsNotNone(assessment)
        assert assessment is not None
        self.assertEqual(assessment.decision, "VERIFIED")
        self.assertGreaterEqual(assessment.proof_score, 70)

    def test_remote_access_request_maps_to_device_compromise_recovery(self) -> None:
        scan = analyze_scan(
            V0ScanInput(
                input_type="text",
                text="Bank support here. Install AnyDesk now and share your screen so we can fix the issue and verify your KYC.",
                language_hint="en",
                session_id="test-session",
            )
        )

        bundle = build_trust_bundle(
            V0TrustRuntimeRequest(
                verdict=scan,
                input_text="Bank support here. Install AnyDesk now and share your screen so we can fix the issue and verify your KYC.",
            )
        )

        self.assertEqual(scan.scam_type, "remote_support_scam")
        self.assertEqual(scan.incident_state, "device_access_requested")
        self.assertTrue(any("remote access" in item.lower() or "screen" in item.lower() for item in scan.guidance.do_not_do))
        self.assertIsNotNone(bundle.recovery_packet)
        assert bundle.recovery_packet is not None
        self.assertEqual(bundle.recovery_packet.incident_type, "REMOTE_ACCESS_OR_DEVICE_COMPROMISE")
        self.assertEqual(bundle.recovery_packet.urgency, "immediate")

    def test_event_metadata_is_sanitized_and_bounded(self) -> None:
        event = build_event(
            V0EventInput(
                event_name="report_tapped",
                session_id="test-session",
                metadata={
                    "report_surface": " call_1930 ",
                    "nested": {
                        "allowed": ["  value  ", float("inf"), {"too": {"deep": {"drop": True}}}],
                    },
                    "unsupported": {"object": object()},
                    "long": "x" * 400,
                },
            )
        )

        self.assertEqual(event.metadata["report_surface"], "call_1930")
        self.assertEqual(event.metadata["nested"]["allowed"], ["value"])
        self.assertEqual(len(event.metadata["long"]), 160)
        self.assertNotIn("unsupported", event.metadata)


if __name__ == "__main__":
    unittest.main()
