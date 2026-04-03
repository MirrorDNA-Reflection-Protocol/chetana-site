import { browserOCR } from "./localScanner";

export type V0Mode = "text" | "screenshot" | "qr_image" | "payment_screenshot";
export type V0InputType = "text" | "screenshot" | "qr_image" | "payment_screenshot" | "mixed";
export type V0VerdictValue = "safe" | "risky" | "unclear";
export type V0ScamType =
  | "investment_scam"
  | "fake_kyc"
  | "upi_qr_scam"
  | "fake_payment_proof"
  | "parcel_customs_scam"
  | "job_scam"
  | "impersonation_pressure_scam"
  | "unknown_suspicious_pattern";
export type V0ConfidenceBand = "low" | "medium" | "high";
export type V0RecommendedAction =
  | "do_not_pay"
  | "verify_with_official_source"
  | "share_with_family"
  | "save_evidence"
  | "report_and_block"
  | "scan_again_with_more_context"
  | "treat_as_unclear";
export type V0EventName =
  | "app_open"
  | "scan_started"
  | "scan_completed"
  | "verdict_safe"
  | "verdict_risky"
  | "verdict_unclear"
  | "share_tapped"
  | "share_completed"
  | "report_tapped"
  | "evidence_saved"
  | "first_scan"
  | "repeat_scan_7d";

export interface V0Reason {
  code: string;
  label: string;
  explanation: string;
}

export interface V0Entities {
  phone_numbers: string[];
  urls: string[];
  upi_ids: string[];
  amounts: string[];
  merchant_names: string[];
  person_names: string[];
}

export interface V0Verdict {
  scan_id: string;
  timestamp_utc: string;
  input_type: V0InputType;
  language_hint?: string | null;
  verdict: V0VerdictValue;
  scam_type: V0ScamType;
  confidence_band: V0ConfidenceBand;
  reasons: V0Reason[];
  entities?: V0Entities | null;
  summary_plain_language?: string | null;
  recommended_actions: V0RecommendedAction[];
  share_shield_eligible: boolean;
  evidence_pack_eligible: boolean;
  notes?: string | null;
}

export interface V0EvidencePack {
  incident_id: string;
  timestamp_utc: string;
  input_hash: string;
  input_type: V0InputType;
  extracted_entities: V0Entities;
  verdict: V0VerdictValue;
  reasons: V0Reason[];
  confidence_band: V0ConfidenceBand;
  scan_summary: string;
  share_card_id?: string | null;
  exportable_text_summary: string;
  thumbnail_reference?: string | null;
  user_notes?: string | null;
}

export interface V0EventPayload {
  event_name: V0EventName;
  session_id: string;
  user_id_hash?: string;
  scan_id?: string;
  input_type?: V0InputType;
  verdict?: V0VerdictValue;
  scam_type?: string;
  confidence_band?: V0ConfidenceBand;
  share_channel?: "whatsapp" | "sms" | "telegram" | "copy_link" | "other";
  report_target?: "block_only" | "family_only" | "manual_report" | "other";
  latency_ms?: number;
  device_class?: "android_phone" | "ios_phone" | "web" | "desktop" | "unknown";
  language_hint?: string;
  metadata?: Record<string, unknown>;
}

export const V0_MODE_CARDS: Array<{
  mode: V0Mode;
  label: string;
  title: string;
  description: string;
}> = [
  {
    mode: "text",
    label: "Paste message",
    title: "Paste a message, link, or UPI ID",
    description: "WhatsApp, SMS, Telegram, email, suspicious link, or payment request.",
  },
  {
    mode: "screenshot",
    label: "Upload screenshot",
    title: "Upload a screenshot",
    description: "If the message is already on-screen, upload it instead of retyping it.",
  },
  {
    mode: "qr_image",
    label: "Scan QR",
    title: "Check a QR request",
    description: "Upload a QR screenshot or paste the payment payload you can read.",
  },
  {
    mode: "payment_screenshot",
    label: "Check payment proof",
    title: "Check a payment screenshot",
    description: "For shopkeepers, delivery staff, and sellers before goods or services change hands.",
  },
];

const ACTION_COPY: Record<V0RecommendedAction, { title: string; body: string }> = {
  do_not_pay: {
    title: "Do not pay yet",
    body: "Pause before sending money, approving a collect request, or sharing account access.",
  },
  verify_with_official_source: {
    title: "Verify through an official source",
    body: "Use the real app, website, card, or helpline you already trust. Do not use the contact details inside the suspicious message.",
  },
  share_with_family: {
    title: "Share with family",
    body: "If this could spread to others, send the warning to family or colleagues before someone else acts on it.",
  },
  save_evidence: {
    title: "Save the evidence",
    body: "Keep the screenshot, transaction reference, and message details while they are still available.",
  },
  report_and_block: {
    title: "Report and block",
    body: "If money or account access is at risk, use the official reporting rails and block the sender afterward.",
  },
  scan_again_with_more_context: {
    title: "Scan again with more context",
    body: "A fuller screenshot, earlier messages, or the exact payment payload often makes the next call clearer.",
  },
  treat_as_unclear: {
    title: "Treat it as unclear",
    body: "If you are not sure, do not act like it is safe. Slow down and verify first.",
  },
};

const SCAM_TYPE_COPY: Record<V0ScamType, string> = {
  investment_scam: "Investment scam",
  fake_kyc: "Fake KYC or account update",
  upi_qr_scam: "UPI or QR payment scam",
  fake_payment_proof: "Fake payment proof",
  parcel_customs_scam: "Parcel or customs fee scam",
  job_scam: "Job or recruitment scam",
  impersonation_pressure_scam: "Impersonation or authority pressure scam",
  unknown_suspicious_pattern: "Unknown suspicious pattern",
};

export function getOrCreateV0SessionId(): string {
  const key = "chetana_v0_session_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = `chetana-v0-${crypto.randomUUID()}`;
  localStorage.setItem(key, created);
  return created;
}

export function verdictLabel(verdict: V0VerdictValue): string {
  if (verdict === "risky") return "This looks risky";
  if (verdict === "unclear") return "Not enough proof yet";
  return "Looks okay so far";
}

export function verdictSummary(verdict: V0Verdict): string {
  return verdict.summary_plain_language || verdictLabel(verdict.verdict);
}

export function confidenceLabel(confidence: V0ConfidenceBand): string {
  if (confidence === "high") return "High confidence";
  if (confidence === "medium") return "Medium confidence";
  return "Low confidence";
}

export function scamTypeLabel(type: V0ScamType): string {
  return SCAM_TYPE_COPY[type];
}

export function actionCopy(action: V0RecommendedAction): { title: string; body: string } {
  return ACTION_COPY[action];
}

export function inputTypeLabel(mode: V0Mode | V0InputType): string {
  if (mode === "text") return "Text";
  if (mode === "screenshot") return "Screenshot";
  if (mode === "qr_image") return "QR or payment payload";
  if (mode === "payment_screenshot") return "Payment screenshot";
  return "Scan";
}

export function shareShieldText(verdict: V0Verdict): string {
  const topReason = verdict.reasons[0]?.label ? `Why: ${verdict.reasons[0].label}.` : "";
  const safestAction = verdict.recommended_actions[0]
    ? `${actionCopy(verdict.recommended_actions[0]).title}.`
    : "";
  return [
    verdict.verdict === "risky" ? "Possible scam. Pause before you pay or reply." : "Something feels off. Pause and verify.",
    `${scamTypeLabel(verdict.scam_type)}.`,
    topReason,
    safestAction,
    "Check it here with Chetana.",
    "https://chetana.activemirror.ai",
  ]
    .filter(Boolean)
    .join("\n");
}

export function reportScript(verdict: V0Verdict): string {
  return [
    "Use this when you call 1930 or speak to your bank:",
    `I received a suspicious ${scamTypeLabel(verdict.scam_type).toLowerCase()}.`,
    "I have the screenshot or message saved.",
    "Please help me protect the transaction or account before more harm happens.",
  ].join(" ");
}

export function entitySections(entities?: V0Entities | null): Array<{ label: string; values: string[] }> {
  if (!entities) return [];
  const sections: Array<{ label: string; values: string[] }> = [
    { label: "Links", values: entities.urls },
    { label: "UPI IDs", values: entities.upi_ids },
    { label: "Phone numbers", values: entities.phone_numbers },
    { label: "Amounts", values: entities.amounts },
    { label: "Merchant names", values: entities.merchant_names },
    { label: "Names", values: entities.person_names },
  ];
  return sections.filter((section) => section.values.length > 0);
}

export async function trackV0Event(payload: V0EventPayload): Promise<void> {
  await fetch("/api/v0/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function decodeQrImage(file: File): Promise<string> {
  const Detector = (
    window as Window & {
      BarcodeDetector?: new (options?: { formats?: string[] }) => { detect: (source: ImageBitmap) => Promise<Array<{ rawValue?: string }>> };
    }
  ).BarcodeDetector;
  if (!Detector) return "";
  try {
    const detector = new Detector({ formats: ["qr_code"] });
    const bitmap = await createImageBitmap(file);
    const results = await detector.detect(bitmap);
    bitmap.close();
    return results[0]?.rawValue?.trim() || "";
  } catch {
    return "";
  }
}

export async function extractTextForMode(mode: V0Mode, file: File | null, text: string): Promise<string> {
  const pasted = text.trim();
  if (mode === "text" && pasted) return pasted;
  if (!file) return pasted;
  if (mode === "qr_image") {
    const qrPayload = await decodeQrImage(file);
    if (qrPayload) {
      return [pasted, qrPayload].filter(Boolean).join("\n\n").trim();
    }
  }
  const ocrText = await browserOCR(file);
  return [pasted, ocrText].filter(Boolean).join("\n\n").trim();
}
