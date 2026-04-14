import unittest

from app.v0_runtime import (
    V0Entities,
    V0Reason,
    V0ScanInput,
    V0TrustRuntimeRequest,
    V0Verdict,
    analyze_scan,
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

    def test_verified_payment_proof_can_clear_merchant_release(self) -> None:
        verdict = V0Verdict(
            scan_id="chetana-scan-test",
            timestamp_utc=now_utc(),
            input_type="payment_screenshot",
            language_hint="en",
            verdict="low_signal",
            scam_type="fake_payment_proof",
            confidence_band="low",
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


if __name__ == "__main__":
    unittest.main()
