const baseUrl = (process.env.CHETANA_BASE_URL || "http://127.0.0.1:8096").replace(/\/$/, "");
const sampleText =
  "Urgent: your bank KYC will expire today. Update now to avoid account block and pay Rs 499 immediately. https://secure-kyc-update.top/verify";

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

  const verdict = await postJson("/api/v0/scan", {
    input_type: "text",
    text: sampleText,
    language_hint: "en",
    source_name: null,
    session_id: "front-door-probe",
  });

  const route = await postJson("/api/v0/action-route", {
    verdict,
    input_text: sampleText,
    trust_bundle: null,
    evidence_pack: null,
    session_id: "front-door-probe",
  });

  if (!verdict.verdict || !route.action_route?.primary_action?.action_label) {
    throw new Error("Probe did not receive a verdict and primary action.");
  }

  console.log(JSON.stringify({
    status: "pass",
    base_url: baseUrl,
    verdict: verdict.verdict,
    scam_type: verdict.scam_type,
    primary_action: route.action_route.primary_action.action_label,
    headline: route.action_route.headline,
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
