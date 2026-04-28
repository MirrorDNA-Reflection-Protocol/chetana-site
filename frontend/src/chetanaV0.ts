import { browserOCR } from "./localScanner";

export type V0Mode = "text" | "screenshot" | "qr_image" | "payment_screenshot";
export type V0InputType = "text" | "screenshot" | "qr_image" | "payment_screenshot" | "mixed";
export type V0VerdictValue = "high_risk" | "caution" | "needs_review" | "low_signal";
export type V0RiskLevel = "high" | "medium" | "low";
export type V0ScamType =
  | "investment_scam"
  | "fake_kyc"
  | "upi_qr_scam"
  | "fake_payment_proof"
  | "parcel_customs_scam"
  | "job_scam"
  | "remote_support_scam"
  | "impersonation_pressure_scam"
  | "unknown_suspicious_pattern";
export type V0ConfidenceBand = "low" | "medium" | "high";
export type V0EvidenceState = "complete" | "partial" | "weak" | "conflicting";
export type V0IncidentState =
  | "suspected"
  | "active_coercion"
  | "payment_requested"
  | "payment_attempted"
  | "device_access_requested";
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
  | "verdict_high_risk"
  | "verdict_caution"
  | "verdict_needs_review"
  | "verdict_low_signal"
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

export interface V0Guidance {
  lead: string;
  why_it_was_flagged: string[];
  do_now: string[];
  do_not_do: string[];
  if_already_acted: string[];
  verification_route: string;
  false_positive_recovery: string;
  calm_script: string;
  source: "deterministic" | "ollama";
}

export interface V0Verdict {
  scan_id: string;
  timestamp_utc: string;
  input_type: V0InputType;
  language_hint?: string | null;
  verdict: V0VerdictValue;
  risk_level: V0RiskLevel;
  scam_type: V0ScamType;
  confidence_band: V0ConfidenceBand;
  evidence_state: V0EvidenceState;
  incident_state: V0IncidentState;
  reasons: V0Reason[];
  entities?: V0Entities | null;
  summary_plain_language?: string | null;
  safe_next_step?: string | null;
  guidance: V0Guidance;
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

export interface V0OfficialRail {
  rail_id: "BANK_APP_SUPPORT" | "CYBER_HELPLINE_1930" | "NCRP_PORTAL" | "RBI_CMS";
  name: string;
  channel: string;
  contact?: string | null;
  official_url: string;
  verified_on: string;
  use_when: string[];
}

export interface V0CasePacket {
  amount_inr?: number | null;
  transaction_reference?: string | null;
  phone_numbers: string[];
  urls: string[];
  upi_ids: string[];
  merchant_names: string[];
  summary: string;
}

export interface V0RecoveryPacket {
  packet_id: string;
  generated_at_utc: string;
  incident_type:
    | "AUTHORIZED_PUSH_PAYMENT_FRAUD"
    | "WRONG_RECIPIENT_TRANSFER"
    | "MERCHANT_PAYMENT_DISPUTE"
    | "IMPERSONATION_ATTEMPT_BLOCKED"
    | "PAYMENT_DISPUTE"
    | "REMOTE_ACCESS_OR_DEVICE_COMPROMISE"
    | "CREDENTIAL_THEFT_EXPOSURE";
  urgency: "immediate" | "priority" | "monitor";
  incident_state: V0IncidentState;
  evidence_state: V0EvidenceState;
  summary: string;
  immediate_actions: string[];
  official_rails: V0OfficialRail[];
  escalation_order: string[];
  handoff_script: string;
  case_packet: V0CasePacket;
}

export interface V0SendGuardAssessment {
  assessment_id: string;
  assessed_at_utc: string;
  decision: "ALLOW" | "CONFIRM" | "COOLDOWN" | "HARD_STOP";
  risk_score: number;
  manipulation_signals: string[];
  decision_reasons: string[];
  interventions: string[];
  recommended_actions: string[];
  recovery_packet?: V0RecoveryPacket | null;
}

export interface V0MerchantReleaseAssessment {
  session_id: string;
  assessed_at_utc: string;
  merchant_label?: string | null;
  amount_inr?: number | null;
  decision: "VERIFIED" | "PENDING" | "DO_NOT_RELEASE" | "EXPIRED";
  proof_score: number;
  risk_score: number;
  hold_until_utc?: string | null;
  decision_reasons: string[];
  recommended_actions: string[];
  recovery_packet?: V0RecoveryPacket | null;
}

export interface V0TrustBundle {
  send_guard: V0SendGuardAssessment;
  merchant_release?: V0MerchantReleaseAssessment | null;
  recovery_packet?: V0RecoveryPacket | null;
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
  consent_class?: "C0" | "C1" | "C2" | "C3" | "C4";
  payload_class?: "derived_state" | "cross_surface_signal" | "save_intent" | "export_artifact";
  persistence_class?: "P0" | "P1" | "P2" | "P3";
  metadata?: Record<string, unknown>;
}

const EVENT_SCHEMA_VERSION = "chetana.v0.analytics.v2";
const LAUNCH_CONTEXT_KEY = "chetana_v0_launch_context";
const EVENT_DEDUPE_CACHE_KEY = "chetana_v0_event_dedupe";
const EVENT_QUEUE_KEY = "chetana_v0_event_queue";
const MAX_EVENT_QUEUE_SIZE = 64;

type LaunchContext = {
  path: string;
  search: string;
  captured_at: string;
};

type TrackEventOptions = {
  dedupeKey?: string;
  dedupeTtlMs?: number;
  keepalive?: boolean;
};

type TrackedEventPayload = Omit<V0EventPayload, "metadata"> & {
  metadata: Record<string, unknown>;
};

let queueFlushPromise: Promise<void> | null = null;

function snapshotLaunchContext(): void {
  if (typeof window === "undefined") return;
  try {
    const payload: LaunchContext = {
      path: window.location.pathname,
      search: window.location.search,
      captured_at: new Date().toISOString(),
    };
    window.sessionStorage?.setItem(LAUNCH_CONTEXT_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures. Events can still fall back to live location data.
  }
}

function readLaunchContext(): LaunchContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage?.getItem(LAUNCH_CONTEXT_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as Partial<LaunchContext>;
    if (typeof payload.path !== "string" || typeof payload.search !== "string") return null;
    return {
      path: payload.path,
      search: payload.search,
      captured_at: typeof payload.captured_at === "string" ? payload.captured_at : "",
    };
  } catch {
    return null;
  }
}

function hasAttributionTokens(params: URLSearchParams): boolean {
  if (params.has("share")) return true;
  if (params.get("action") === "scan") return true;
  if (params.get("source")) return true;
  return ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].some((key) => params.has(key));
}

function attributionParams(): URLSearchParams {
  const currentParams = new URLSearchParams(window.location.search);
  if (hasAttributionTokens(currentParams)) return currentParams;
  const launch = readLaunchContext();
  if (!launch) return currentParams;
  const launchParams = new URLSearchParams(launch.search);
  return hasAttributionTokens(launchParams) ? launchParams : currentParams;
}

function pageVariant(params: URLSearchParams): string {
  const queryPage = params.get("page");
  if (queryPage) return queryPage;
  if (params.has("share") || params.get("action") === "scan" || params.get("source") === "pwa") {
    return "scan";
  }
  const path = window.location.pathname.replace(/^\/+/, "");
  return path || "home";
}

snapshotLaunchContext();

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
    title: "Treat it as not cleared",
    body: "If you are not sure, do not act like it is cleared. Slow down and verify first.",
  },
};

const SCAM_TYPE_COPY: Record<V0ScamType, string> = {
  investment_scam: "Investment scam",
  fake_kyc: "Fake KYC or account update",
  upi_qr_scam: "UPI or QR payment scam",
  fake_payment_proof: "Fake payment proof",
  parcel_customs_scam: "Parcel or customs fee scam",
  job_scam: "Job or recruitment scam",
  remote_support_scam: "Remote support or app-install scam",
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
  if (verdict === "high_risk") return "High risk";
  if (verdict === "caution") return "Caution";
  if (verdict === "needs_review") return "Needs review";
  return "Low signal";
}

export function verdictSummary(verdict: V0Verdict): string {
  return verdict.guidance?.lead || verdict.summary_plain_language || verdictLabel(verdict.verdict);
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
    verdict.verdict === "high_risk"
      ? "High-risk warning. Pause before you pay or reply."
      : verdict.verdict === "caution"
        ? "Caution. Multiple warning signs are present."
        : verdict.verdict === "needs_review"
          ? "Needs review. Pause and verify before you act."
          : "Low signal. Get more proof before you trust it.",
    `${scamTypeLabel(verdict.scam_type)}.`,
    topReason,
    safestAction,
    "Check it here with Chetana.",
    "https://chetana.activemirror.ai",
  ]
    .filter(Boolean)
    .join("\n");
}

function eventContract(eventName: V0EventName): Pick<V0EventPayload, "consent_class" | "payload_class" | "persistence_class"> {
  if (eventName === "evidence_saved") {
    return {
      consent_class: "C3",
      payload_class: "export_artifact",
      persistence_class: "P3",
    };
  }
  if (eventName === "share_completed" || eventName === "share_tapped" || eventName === "report_tapped") {
    return {
      consent_class: "C1",
      payload_class: "cross_surface_signal",
      persistence_class: eventName === "share_completed" ? "P3" : "P1",
    };
  }
  return {
    consent_class: "C0",
    payload_class: "derived_state",
    persistence_class: "P1",
  };
}

function currentDisplayMode(): string {
  if (window.matchMedia?.("(display-mode: standalone)").matches) return "standalone";
  if (window.matchMedia?.("(display-mode: minimal-ui)").matches) return "minimal-ui";
  if (window.matchMedia?.("(display-mode: fullscreen)").matches) return "fullscreen";
  return "browser";
}

function referrerHost(): string | null {
  if (!document.referrer) return null;
  try {
    return new URL(document.referrer).hostname || null;
  } catch {
    return null;
  }
}

function entrySource(params: URLSearchParams): string {
  if (params.has("share")) return "share_intent";
  if (params.get("action") === "scan") return "pwa_scan_shortcut";
  if (params.get("source") === "pwa") return "pwa_launch";
  if (params.get("utm_source")) return "campaign";
  if (document.referrer) return "referral";
  if (currentDisplayMode() !== "browser") return "installed_app";
  return "direct";
}

function buildEventContext(): Record<string, unknown> {
  const params = attributionParams();
  const launch = readLaunchContext();
  const refHost = referrerHost();
  return {
    event_version: EVENT_SCHEMA_VERSION,
    entry_source: entrySource(params),
    page_path: window.location.pathname,
    page_variant: pageVariant(params),
    launch_path: launch?.path || window.location.pathname,
    referrer_host: refHost,
    utm_source: params.get("utm_source"),
    utm_medium: params.get("utm_medium"),
    utm_campaign: params.get("utm_campaign"),
    utm_content: params.get("utm_content"),
    utm_term: params.get("utm_term"),
    source_param: params.get("source"),
    action_param: params.get("action"),
    display_mode: currentDisplayMode(),
  };
}

function buildEventDedupeKey(payload: V0EventPayload): string {
  const surface = typeof payload.metadata?.report_surface === "string" ? payload.metadata.report_surface : "";
  const recoveryStep = typeof payload.metadata?.recovery_step === "string" ? payload.metadata.recovery_step : "";
  return [
    payload.event_name,
    payload.session_id,
    payload.scan_id || "",
    payload.input_type || "",
    payload.share_channel || "",
    payload.report_target || "",
    payload.verdict || "",
    surface,
    recoveryStep,
  ].join(":");
}

function shouldTrackEventOnce(dedupeKey: string, dedupeTtlMs: number): boolean {
  if (dedupeTtlMs <= 0) return true;
  try {
    const raw = window.sessionStorage?.getItem(EVENT_DEDUPE_CACHE_KEY);
    const cache = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const now = Date.now();
    for (const [key, seenAt] of Object.entries(cache)) {
      if (typeof seenAt !== "number" || now - seenAt > Math.max(dedupeTtlMs, 30 * 60 * 1000)) {
        delete cache[key];
      }
    }
    const previous = cache[dedupeKey];
    if (typeof previous === "number" && now - previous < dedupeTtlMs) {
      return false;
    }
    cache[dedupeKey] = now;
    window.sessionStorage?.setItem(EVENT_DEDUPE_CACHE_KEY, JSON.stringify(cache));
    return true;
  } catch {
    return true;
  }
}

function buildTrackedEventPayload(payload: V0EventPayload): TrackedEventPayload {
  const contract = eventContract(payload.event_name);
  const context = buildEventContext();
  const metadata: Record<string, unknown> = {
    ...context,
    ...(payload.metadata || {}),
  };
  if (typeof metadata.client_event_id !== "string" || !metadata.client_event_id.trim()) {
    metadata.client_event_id = `chetana-client-event-${crypto.randomUUID()}`;
  }
  if (typeof metadata.client_generated_at_utc !== "string" || !metadata.client_generated_at_utc.trim()) {
    metadata.client_generated_at_utc = new Date().toISOString();
  }
  return {
    ...contract,
    ...payload,
    metadata,
  };
}

function readQueuedEvents(): TrackedEventPayload[] {
  try {
    const raw = window.localStorage?.getItem(EVENT_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TrackedEventPayload[]) : [];
  } catch {
    return [];
  }
}

function writeQueuedEvents(queue: TrackedEventPayload[]): void {
  try {
    if (!queue.length) {
      window.localStorage?.removeItem(EVENT_QUEUE_KEY);
      return;
    }
    window.localStorage?.setItem(EVENT_QUEUE_KEY, JSON.stringify(queue.slice(-MAX_EVENT_QUEUE_SIZE)));
  } catch {
    // Ignore storage failures. A best-effort event path is still better than dropping the UI flow.
  }
}

function enqueueTrackedEvent(payload: TrackedEventPayload): void {
  const clientEventId = typeof payload.metadata.client_event_id === "string" ? payload.metadata.client_event_id : "";
  const queue = readQueuedEvents().filter((queued) => {
    if (!clientEventId) return true;
    return queued.metadata?.client_event_id !== clientEventId;
  });
  const metadata = {
    ...payload.metadata,
    queued_at_utc:
      typeof payload.metadata.queued_at_utc === "string" ? payload.metadata.queued_at_utc : new Date().toISOString(),
    delivery_status: "queued",
  };
  queue.push({ ...payload, metadata });
  writeQueuedEvents(queue);
}

async function postTrackedEvent(payload: TrackedEventPayload, keepalive = true): Promise<boolean> {
  if (typeof navigator !== "undefined" && "onLine" in navigator && navigator.onLine === false) {
    return false;
  }
  try {
    const response = await fetch("/api/v0/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive,
      cache: "no-store",
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function flushQueuedEvents(): Promise<void> {
  if (queueFlushPromise) {
    await queueFlushPromise;
    return;
  }
  queueFlushPromise = (async () => {
    const queue = readQueuedEvents();
    if (!queue.length) return;

    const remaining: TrackedEventPayload[] = [];
    for (let index = 0; index < queue.length; index += 1) {
      const payload = queue[index];
      const ok = await postTrackedEvent(
        {
          ...payload,
          metadata: {
            ...payload.metadata,
            delivery_status: "replayed",
            replayed_at_utc: new Date().toISOString(),
          },
        },
        true,
      );
      if (!ok) {
        remaining.push(...queue.slice(index));
        break;
      }
    }
    writeQueuedEvents(remaining);
  })();

  try {
    await queueFlushPromise;
  } finally {
    queueFlushPromise = null;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void flushQueuedEvents();
  });
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

export function sendGuardDecisionLabel(decision: V0SendGuardAssessment["decision"]): string {
  if (decision === "HARD_STOP") return "Hard stop";
  if (decision === "COOLDOWN") return "Cooldown";
  if (decision === "CONFIRM") return "Confirm first";
  return "Allow with verification";
}

export function merchantDecisionLabel(decision: V0MerchantReleaseAssessment["decision"]): string {
  if (decision === "DO_NOT_RELEASE") return "Do not release";
  if (decision === "PENDING") return "Pending";
  if (decision === "VERIFIED") return "Verified";
  return "Expired";
}

export function incidentTypeLabel(type: V0RecoveryPacket["incident_type"]): string {
  return type
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function incidentStateLabel(state: V0IncidentState): string {
  if (state === "active_coercion") return "Active coercion";
  if (state === "payment_requested") return "Payment requested";
  if (state === "payment_attempted") return "Payment attempted";
  if (state === "device_access_requested") return "Device access requested";
  return "Suspicious contact";
}

export function evidenceStateLabel(state: V0EvidenceState): string {
  if (state === "complete") return "Evidence: complete";
  if (state === "partial") return "Evidence: partial";
  if (state === "conflicting") return "Evidence: conflicting";
  return "Evidence: weak";
}

export async function trackV0Event(payload: V0EventPayload, options: TrackEventOptions = {}): Promise<void> {
  const dedupeTtlMs = options.dedupeTtlMs || 0;
  const dedupeKey = options.dedupeKey || (dedupeTtlMs > 0 ? buildEventDedupeKey(payload) : "");
  if (dedupeKey && !shouldTrackEventOnce(dedupeKey, dedupeTtlMs)) {
    return;
  }
  const trackedPayload = buildTrackedEventPayload(payload);
  await flushQueuedEvents();
  const delivered = await postTrackedEvent(trackedPayload, options.keepalive ?? true);
  if (!delivered) {
    enqueueTrackedEvent(trackedPayload);
  }
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
