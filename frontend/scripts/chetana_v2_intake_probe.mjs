const baseUrl = (process.env.CHETANA_BASE_URL || "http://127.0.0.1:8096").replace(/\/$/, "");

const lazyIntakeCases = [
  {
    id: "otp",
    text: "Quick context from user taps:\n- Urgent bank, KYC, SIM, Aadhaar, or wallet warning: they are asking for OTP, PIN, CVV, password, or verification code now, and say the account may be blocked.",
  },
  {
    id: "upi",
    text: "Quick context from user taps:\n- Urgent payment or refund request: they asked me to approve a UPI collect request, scan a QR code, transfer money, or send payment now.",
  },
  {
    id: "screen",
    text: "Quick context from user taps:\n- Caller or message asked me to install an app or APK, use AnyDesk, TeamViewer, QuickSupport, share screen, enable accessibility permission, or give remote access.",
  },
  {
    id: "money_sent",
    text: "Quick context from user taps:\n- Money may already have been sent by UPI, bank, wallet, card, or netbanking, or OTP, password, account access, or remote access may already have been shared.",
  },
];

async function postJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const page = await fetch(`${baseUrl}/`);
  if (!page.ok) {
    throw new Error(`/ returned ${page.status}`);
  }

  const results = [];
  for (const sample of lazyIntakeCases) {
    const verdict = await postJson("/api/v0/scan", {
      input_type: "text",
      text: sample.text,
      language_hint: "en",
      source_name: null,
      session_id: `v2-intake-probe-${sample.id}`,
    });

    if (verdict.verdict === "low_signal") {
      throw new Error(`${sample.id} lazy-intake case regressed to low_signal`);
    }
    if (!verdict.safe_next_step && !verdict.guidance?.do_now?.length) {
      throw new Error(`${sample.id} lazy-intake case did not return a safe next step`);
    }

    results.push({
      id: sample.id,
      verdict: verdict.verdict,
      scam_type: verdict.scam_type,
      incident_state: verdict.incident_state,
      confidence_band: verdict.confidence_band,
      reason_codes: verdict.reasons.map((reason) => reason.code),
    });
  }

  console.log(JSON.stringify({
    status: "pass",
    base_url: baseUrl,
    checked_cases: results,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: "fail",
    base_url: baseUrl,
    error: error.message,
  }, null, 2));
  process.exit(1);
});
