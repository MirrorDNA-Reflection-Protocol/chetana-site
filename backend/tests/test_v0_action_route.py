from fastapi.testclient import TestClient

from app import v0_runtime
from app.main import app
from app.v0_runtime import (
    V0ActionRouteRequest,
    V0LoopReceiptRequest,
    V0ScanInput,
    V0TrustRuntimeRequest,
    analyze_scan,
    build_trust_bundle,
    build_v0_action_route,
    build_v0_loop_receipt,
)


def test_action_route_hard_stop_for_high_risk_kyc_payment() -> None:
    text = "Urgent bank KYC update. Pay Rs 499 now or account will be blocked. https://secure-kyc-update.top"
    verdict = analyze_scan(V0ScanInput(input_type="text", text=text, language_hint="en", session_id="test-session"))
    bundle = build_trust_bundle(V0TrustRuntimeRequest(verdict=verdict, input_text=text))

    route = build_v0_action_route(
        V0ActionRouteRequest(
            verdict=verdict,
            input_text=text,
            trust_bundle=bundle,
            session_id="test-session",
        )
    )

    assert route.primary_action.route_id == "stop_do_not_pay"
    assert route.primary_action.kind == "hold"
    assert route.primary_action.urgency == "immediate"
    assert {action.route_id for action in route.secondary_actions} >= {"call_1930", "open_cybercrime_portal"}
    assert route.case_packet.amount_inr == 499
    assert route.route_hash


def test_action_route_merchant_payment_screenshot_holds_release() -> None:
    text = "Payment successful screenshot attached. Pay Rs 5000 now. Merchant: Test Store."
    verdict = analyze_scan(
        V0ScanInput(
            input_type="payment_screenshot",
            text=text,
            language_hint="en",
            session_id="test-session",
        )
    )

    route = build_v0_action_route(V0ActionRouteRequest(verdict=verdict, input_text=text))

    assert route.primary_action.route_id == "hold_release"
    assert route.primary_action.official_rail_id == "MERCHANT_RELEASE_GUARD"
    assert any(action.route_id == "contact_bank_or_upi_app" for action in route.secondary_actions)


def test_action_route_investment_pitch_routes_to_rbi_sachet() -> None:
    text = "Guaranteed return. Invest Rs 10000 today and double your money with risk-free daily profit."
    verdict = analyze_scan(V0ScanInput(input_type="text", text=text, language_hint="en"))

    route = build_v0_action_route(V0ActionRouteRequest(verdict=verdict, input_text=text))

    assert route.primary_action.route_id == "open_rbi_sachet"
    assert route.primary_action.href == "https://sachet.rbi.org.in/"
    assert "investment" in route.reason.lower()


def test_action_route_endpoint_and_loop_receipt_linkage(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(v0_runtime, "V0_LOOP_RECEIPTS_LOG", tmp_path / "loop_receipts.jsonl")
    client = TestClient(app)
    text = "Urgent: scan this QR and pay Rs 1200 now to receive refund. UPI testuser@upi"
    verdict = analyze_scan(V0ScanInput(input_type="qr_image", text=text, language_hint="en", session_id="test-session"))
    bundle = build_trust_bundle(V0TrustRuntimeRequest(verdict=verdict, input_text=text))

    route_response = client.post(
        "/api/v0/action-route",
        json={
            "verdict": verdict.model_dump(),
            "input_text": text,
            "trust_bundle": bundle.model_dump(),
            "session_id": "test-session",
        },
    )
    assert route_response.status_code == 200
    route = route_response.json()["action_route"]
    assert route["scan_id"] == verdict.scan_id
    assert route["primary_action"]["route_id"] in {"stop_do_not_pay", "call_1930"}

    receipt = build_v0_loop_receipt(
        V0LoopReceiptRequest(
            verdict=verdict,
            input_text=text,
            trust_bundle=bundle,
            action_route=route,
            session_id="test-session",
        )
    )
    act_phase = next(phase for phase in receipt.phases if phase["phase"] == "act")
    assert act_phase["evidence"]["action_route_hash"] == route["route_hash"]
