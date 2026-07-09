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

async function fetchText(path) {
  const response = await fetch(`${baseUrl}${path}`);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${text.slice(0, 240)}`);
  }
  return text;
}

async function fetchJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  await fetchText("/");
  const partners = await fetchText("/partners");
  const partnerNeedles = [
    "Chetana Partner Pilots for Banks, Government, and CSR",
    "https://chetana.activemirror.ai/partners",
    "og:title",
  ];
  const missingPartnerNeedles = partnerNeedles.filter((needle) => !partners.includes(needle));
  if (missingPartnerNeedles.length > 0) {
    throw new Error(`Partner page metadata missing strings: ${missingPartnerNeedles.join(", ")}`);
  }

  const packet = await fetchText("/partners/packet");
  const packetNeedles = [
    "Scam-check pilot packet",
    "Fund a fraud pause before money moves.",
    "No account. No profile database.",
    "Sample case packet",
    "Open outreach kit",
    "View PilotTrace report",
  ];
  const missingPacketNeedles = packetNeedles.filter((needle) => !packet.includes(needle));
  if (missingPacketNeedles.length > 0) {
    throw new Error(`Partner packet missing strings: ${missingPacketNeedles.join(", ")}`);
  }

  const outreachKit = await fetchText("/partners/outreach-kit");
  const outreachNeedles = [
    "Chetana Outreach Kit for Sponsor Pilots",
    "Bank / PSP email",
    "Government / public program email",
    "Weekly pilot proof report",
    "View PilotTrace report",
  ];
  const missingOutreachNeedles = outreachNeedles.filter((needle) => !outreachKit.includes(needle));
  if (missingOutreachNeedles.length > 0) {
    throw new Error(`Partner outreach kit missing strings: ${missingOutreachNeedles.join(", ")}`);
  }

  const pilotTrace = await fetchText("/partners/pilottrace");
  const pilotTraceNeedles = [
    "Chetana PilotTrace v0.1 Sponsor Proof Report",
    "Sponsor-safe proof report.",
    "No raw scan text is included.",
    "Open JSON report",
  ];
  const missingPilotTraceNeedles = pilotTraceNeedles.filter((needle) => !pilotTrace.includes(needle));
  if (missingPilotTraceNeedles.length > 0) {
    throw new Error(`PilotTrace report missing strings: ${missingPilotTraceNeedles.join(", ")}`);
  }

  const pilotTraceJson = await fetchJson("/api/v1/partners/pilottrace");
  if (pilotTraceJson.schema_version !== "chetana.pilottrace.v0.1" || pilotTraceJson.sponsor_safe !== true) {
    throw new Error("PilotTrace JSON contract is missing sponsor-safe schema markers.");
  }

  const sitemap = await fetchText("/sitemap.xml");
  if (!sitemap.includes("https://chetana.activemirror.ai/partners/packet")) {
    throw new Error("Sitemap does not include /partners/packet");
  }
  if (!sitemap.includes("https://chetana.activemirror.ai/partners/outreach-kit")) {
    throw new Error("Sitemap does not include /partners/outreach-kit");
  }
  if (!sitemap.includes("https://chetana.activemirror.ai/partners/pilottrace")) {
    throw new Error("Sitemap does not include /partners/pilottrace");
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

  const secondaryActions = route.action_route.secondary_actions || [];
  const hasChakshu = secondaryActions.some((action) => action.route_id === "open_chakshu");
  if (!hasChakshu) {
    throw new Error("Probe did not receive the Chakshu secondary action.");
  }

  console.log(JSON.stringify({
    status: "pass",
    base_url: baseUrl,
    verdict: verdict.verdict,
    scam_type: verdict.scam_type,
    primary_action: route.action_route.primary_action.action_label,
    secondary_actions: secondaryActions.map((action) => action.route_id),
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
