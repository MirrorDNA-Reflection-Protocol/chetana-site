from app.kavach_enrichment import build_kavach_enrichment


def test_known_upi_seed_returns_high_risk() -> None:
    enrichment = build_kavach_enrichment(
        text="Pay kyc.update.sbi@oksbi now to unblock your account.",
        upi_ids=[],
        phone_numbers=[],
        input_type="text",
    )

    assert enrichment is not None
    assert enrichment.risk_level == "high"
    assert enrichment.max_score >= 70
    assert enrichment.no_match_is_safe is False
    assert enrichment.indicators[0].kind == "upi"
    assert enrichment.indicators[0].matched is True
    assert any("reported" in signal.lower() for signal in enrichment.indicators[0].signals)


def test_clean_upi_no_match_is_not_safe() -> None:
    enrichment = build_kavach_enrichment(
        text="The shop UPI ID is shop.local@ybl.",
        upi_ids=[],
        phone_numbers=[],
        input_type="text",
    )

    assert enrichment is not None
    assert enrichment.risk_level == "low"
    assert enrichment.no_match_is_safe is False
    assert enrichment.indicators[0].matched is False
    assert "does not prove" in enrichment.indicators[0].advice[0]


def test_payment_proof_text_gets_merchant_indicator() -> None:
    enrichment = build_kavach_enrichment(
        text="Payment screenshot processing. Driver waiting, dispatch now. Amount Rs 4500.",
        upi_ids=[],
        phone_numbers=[],
        input_type="payment_screenshot",
    )

    assert enrichment is not None
    merchant = [indicator for indicator in enrichment.indicators if indicator.kind == "merchant_payment_proof"]
    assert merchant
    assert merchant[0].score >= 35
    assert any("screenshot" in signal.lower() for signal in merchant[0].signals)
