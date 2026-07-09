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

const servedSafetyNudgeChecks = [
  "Money, OTP, or screen access may already be exposed.",
  "Call 1930 now",
  "https://cybercrime.gov.in",
  "Stop screen sharing before you scan.",
  "Do not approve a collect request to receive money.",
  "Report on Chakshu",
  "Install once. Share screenshots straight to Chetana.",
  "Add to Home screen",
  "Extra check found risk in this",
  "Do not pay or reply yet.",
  "No known match found. Still verify before paying.",
  "appeared in another scan on this device",
  "Threading stays in this browser as private hashes.",
  "Copy case packet",
  "Chetana linked scam summary",
  "This is a warning signal, not an official fraud determination.",
  "Clear local scan memory",
  "Local scan memory cleared from this browser.",
  "Clear repeated-scan hints, local counters, queued scan events",
  "local_scan_memory_cleared",
  "Open pilot packet",
  "Privacy controls used",
  "View sponsor packet",
  "Request pilot contact",
  "Outreach kit",
  "No raw scam scan text",
];

async function fetchText(pathOrUrl) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${baseUrl}${pathOrUrl}`;
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${text.slice(0, 240)}`);
  }
  return text;
}

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

async function probeServedSafetyNudge() {
  const pageText = await fetchText("/");
  const scriptMatches = [...pageText.matchAll(/<script[^>]+src="([^"]+)"[^>]*>/g)].map((match) => match[1]);
  const appScript = scriptMatches.find((script) => script.includes("/assets/index-"));
  if (!appScript) {
    throw new Error("Could not find served Vite app bundle in page HTML");
  }
  const bundleText = await fetchText(appScript.startsWith("http") ? appScript : appScript);
  const missing = servedSafetyNudgeChecks.filter((needle) => !bundleText.includes(needle));
  if (missing.length > 0) {
    throw new Error(`Served app bundle is missing pre-scan safety nudge text: ${missing.join(", ")}`);
  }
  return {
    asset: appScript,
    checked_strings: servedSafetyNudgeChecks.length,
  };
}

async function main() {
  const servedSafetyNudge = await probeServedSafetyNudge();
  const kavachProbe = await postJson("/api/v0/scan", {
    input_type: "text",
    text: "Pay kyc.update.sbi@oksbi now to unblock your account.",
    language_hint: "en",
    source_name: null,
    session_id: "v2-intake-probe-kavach",
  });
  if (kavachProbe.verdict !== "high_risk") {
    throw new Error(`Kavach probe did not return high_risk: ${kavachProbe.verdict}`);
  }
  if (kavachProbe.kavach_enrichment?.risk_level !== "high") {
    throw new Error("Kavach probe did not expose high-risk enrichment");
  }
  if (kavachProbe.kavach_enrichment?.no_match_is_safe !== false) {
    throw new Error("Kavach enrichment must preserve no_match_is_safe=false");
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
    served_safety_nudge: servedSafetyNudge,
    kavach_probe: {
      verdict: kavachProbe.verdict,
      risk_level: kavachProbe.kavach_enrichment.risk_level,
      max_score: kavachProbe.kavach_enrichment.max_score,
      no_match_is_safe: kavachProbe.kavach_enrichment.no_match_is_safe,
    },
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
