import { useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, DragEvent } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  ImageIcon,
  Mic,
  Phone,
  Shield,
  Square,
  Type,
  Upload,
  X,
} from "lucide-react";
import { PageId } from "./types";
import {
  V0ActionRoute,
  V0ActionStep,
  V0CasePacket,
  V0Mode,
  V0EvidencePack,
  V0EventName,
  V0LoopReceipt,
  V0MirrorProofReceipt,
  V0TrustBundle,
  V0Verdict,
  actionCopy,
  confidenceLabel,
  downloadJson,
  entitySections,
  evidenceStateLabel,
  extractScanInputForMode,
  getOrCreateV0SessionId,
  incidentStateLabel,
  incidentTypeLabel,
  merchantDecisionLabel,
  reportScript,
  runtimeSourceLabel,
  scamTypeLabel,
  sendGuardDecisionLabel,
  shareShieldText,
  trackV0Event,
  verdictLabel,
  verdictSummary,
  V0ExtractedInput,
  V0VoiceRuntimeStatus,
  V0VoiceTranscription,
} from "./chetanaV0";
import {
  clearLocalChetanaScanMemory,
  recordLocalThreatThread,
  type V0ThreatThreadSignal,
} from "./chetanaThreatThreading";
import ChetanaResultScreen, { riskFromVerdict } from "./ChetanaResultScreen";

const DEFAULT_PROMPTS: Record<V0Mode, string> = {
  text: "Paste the suspicious message, link, or UPI request here.",
  screenshot: "Upload the screenshot. Add a note only if it helps.",
  qr_image: "Upload the QR screenshot or paste the payment payload you can read.",
  payment_screenshot: "Upload the payment screenshot. Add any note that explains the context.",
};

const SAMPLE_SCAM_TEXT =
  "Urgent: your bank KYC will expire today. Update now to avoid account block and pay Rs 499 immediately. https://secure-kyc-update.top/verify";
const VOICE_MAX_DURATION_MS = 30_000;

const QUICK_CONTEXT_OPTIONS = [
  { id: "otp", label: "OTP or code", text: "Urgent bank, KYC, SIM, Aadhaar, or wallet warning: they are asking for OTP, PIN, CVV, password, or verification code now, and say the account may be blocked." },
  { id: "upi", label: "UPI request", text: "Urgent payment or refund request: they asked me to approve a UPI collect request, scan a QR code, transfer money, or send payment now." },
  { id: "kyc", label: "KYC block", text: "Urgent bank KYC, Aadhaar, PAN, SIM, or wallet update: they say service will be blocked, suspended, frozen, or penalized today." },
  { id: "parcel", label: "Parcel fee", text: "Parcel, courier, customs, or delivery message asks for urgent payment, fee, reschedule charge, or link action today." },
  { id: "job_loan", label: "Job or loan", text: "Job, loan, refund, investment, or easy-money offer asks for processing fee, security deposit, advance fee, guaranteed return, or payment before approval." },
  { id: "screen", label: "App install", text: "Caller or message asked me to install an app or APK, use AnyDesk, TeamViewer, QuickSupport, share screen, enable accessibility permission, or give remote access." },
  { id: "money_sent", label: "Money sent", text: "Money may already have been sent by UPI, bank, wallet, card, or netbanking, or OTP, password, account access, or remote access may already have been shared." },
  { id: "pressure", label: "Rushing me", text: "Caller or message is rushing or threatening me now with police, RBI, bank, legal action, arrest, jail, penalty, account freeze, or account blocking." },
] as const;

const NCRP_SUSPECT_REPOSITORY_URL = "https://www.cybercrime.gov.in/Webform/suspect_search_repository.aspx";
const NCRP_SUSPECT_WEBSITES_URL = "https://www.cybercrime.gov.in/Webform/suspect_search_websites.aspx";
const NCRP_REPORT_SUSPECT_URL = "https://www.cybercrime.gov.in/Webform/cyber_suspect.aspx";
const CHAKSHU_URL = "https://sancharsaathi.gov.in/sfc/";
const OFFICIAL_RAIL_EVENT_SURFACES: Record<string, string> = {
  BANK_APP_SUPPORT: "bank_app_support",
  CYBER_HELPLINE_1930: "call_1930",
  NCRP_PORTAL: "cybercrime_portal",
  RBI_CMS: "rbi_cms",
  SANCHAR_SAATHI_CHAKSHU: "chakshu",
};
const RECOVERY_SURFACE_DEFAULTS: Record<string, {
  recoveryStep: string;
  recoveryChannel: string;
  officialRailId?: string;
  reportTarget?: "manual_report" | "other";
}> = {
  call_1930: {
    recoveryStep: "hotline_call",
    recoveryChannel: "phone",
    officialRailId: "CYBER_HELPLINE_1930",
    reportTarget: "manual_report",
  },
  cybercrime_portal: {
    recoveryStep: "complaint_portal_open",
    recoveryChannel: "web",
    officialRailId: "NCRP_PORTAL",
    reportTarget: "manual_report",
  },
  bank_app_support: {
    recoveryStep: "bank_support_open",
    recoveryChannel: "app_or_phone",
    officialRailId: "BANK_APP_SUPPORT",
    reportTarget: "manual_report",
  },
  rbi_cms: {
    recoveryStep: "complaint_portal_open",
    recoveryChannel: "web",
    officialRailId: "RBI_CMS",
    reportTarget: "manual_report",
  },
  chakshu: {
    recoveryStep: "suspected_fraud_communication_report",
    recoveryChannel: "web",
    officialRailId: "SANCHAR_SAATHI_CHAKSHU",
    reportTarget: "manual_report",
  },
  ncrp_suspect_repository: {
    recoveryStep: "suspect_lookup",
    recoveryChannel: "web",
    officialRailId: "NCRP_SUSPECT_REPOSITORY",
    reportTarget: "other",
  },
  ncrp_suspect_websites: {
    recoveryStep: "suspect_lookup",
    recoveryChannel: "web",
    officialRailId: "NCRP_SUSPECT_WEBSITES",
    reportTarget: "other",
  },
  ncrp_report_suspect: {
    recoveryStep: "complaint_portal_open",
    recoveryChannel: "web",
    officialRailId: "NCRP_REPORT_SUSPECT",
    reportTarget: "manual_report",
  },
};

function kavachSignalForResult(result: V0Verdict | null): { tone: "high" | "medium" | "low"; text: string } | null {
  const enrichment = result?.kavach_enrichment;
  if (!enrichment || enrichment.indicators.length === 0) return null;

  const flagged = enrichment.indicators.find((indicator) => indicator.risk_level === "high" || indicator.risk_level === "medium");
  if (flagged) {
    const label =
      flagged.kind === "upi"
        ? "UPI ID"
        : flagged.kind === "phone"
          ? "phone number"
          : "payment proof";
    return {
      tone: flagged.risk_level === "high" ? "high" : "medium",
      text: `Extra check found risk in this ${label}. Do not pay or reply yet.`,
    };
  }

  return {
    tone: "low",
    text: "No known match found. Still verify before paying.",
  };
}

type RecoveryActionOptions = {
  reportTarget?: "manual_report" | "other";
  recoveryStep?: string;
  recoveryChannel?: string;
  officialRailId?: string;
  href?: string;
};
type MoneyMovedAnswer = "yes" | "no" | null;
type ResultFeedbackType = "missed_scam" | "too_cautious" | "scammed_after_scan" | "useful";
type ResearchCandidateReceipt = {
  candidate_id: string;
  deletion_token: string;
  redaction_count: number;
  retention_expires_at_utc: string;
};
type CasePacketRow = {
  label: string;
  value: string;
  hint: string;
};
type VoiceCaptureState = "idle" | "recording" | "recorded";
type InputSurface = "screenshot" | "voice" | "text";
type IntakeSource = "chooser" | "clipboard" | "drop";
type ComposerSafetyNudge = {
  tone: "danger" | "warning";
  title: string;
  body: string;
  primaryLabel: string;
  primaryHref: string;
  eventSurface: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  secondarySurface?: string;
};

const APP_OPEN_TTL_MS = 30 * 60 * 1000;
const TAP_EVENT_TTL_MS = 4_000;
const EXPORT_EVENT_TTL_MS = 10_000;
const RESULT_FEEDBACK_OPTIONS: Array<{
  id: ResultFeedbackType;
  label: string;
  helper: string;
  tone: "danger" | "warning" | "neutral" | "safe";
}> = [
  {
    id: "missed_scam",
    label: "Missed a scam",
    helper: "Chetana looked too safe.",
    tone: "danger",
  },
  {
    id: "too_cautious",
    label: "Too cautious",
    helper: "This was probably okay.",
    tone: "warning",
  },
  {
    id: "scammed_after_scan",
    label: "I was scammed",
    helper: "Switch me to recovery.",
    tone: "danger",
  },
  {
    id: "useful",
    label: "Useful",
    helper: "This helped me pause.",
    tone: "safe",
  },
];

function eventNameForVerdict(verdict: V0Verdict["verdict"]): V0EventName {
  if (verdict === "high_risk") return "verdict_high_risk";
  if (verdict === "caution") return "verdict_caution";
  if (verdict === "needs_review") return "verdict_needs_review";
  return "verdict_low_signal";
}

function deviceClass(): "web" | "desktop" {
  return window.innerWidth <= 960 ? "web" : "desktop";
}

function actionStepIcon(step: V0ActionStep, size = 14) {
  if (step.kind === "call") return <Phone size={size} />;
  if (step.kind === "save") return <Download size={size} />;
  if (step.kind === "share") return <Copy size={size} />;
  if (step.kind === "scan_again") return <ArrowRight size={size} />;
  if (step.kind === "open_url") return <ExternalLink size={size} />;
  return <Check size={size} />;
}

function voiceCaptureSupported(): boolean {
  return Boolean(
    typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
      typeof MediaRecorder !== "undefined",
  );
}

function clipboardImageSupported(): boolean {
  return Boolean(
    typeof navigator !== "undefined" &&
      typeof navigator.clipboard?.read === "function",
  );
}

function imageExtensionForType(type: string): string {
  if (type.includes("png")) return "png";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  if (type.includes("webp")) return "webp";
  return "png";
}

function imageFileFromBlob(blob: Blob, source: IntakeSource): File {
  const type = blob.type || "image/png";
  return new File(
    [blob],
    `${source}-screenshot-${Date.now()}.${imageExtensionForType(type)}`,
    { type },
  );
}

function formatVoiceDuration(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return `${seconds}s`;
}

export default function ChetanaV0Experience({
  onNavigate,
  initialInput,
  initialFile,
  directScanIntent,
  presetMode,
  showHero = true,
}: {
  onNavigate?: (target: PageId) => void;
  initialInput?: string | null;
  initialFile?: File | null;
  directScanIntent?: "share" | "shortcut" | null;
  presetMode?: V0Mode;
  showHero?: boolean;
}) {
  const composerRef = useRef<HTMLDivElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceBlobRef = useRef<Blob | null>(null);
  const voiceStartedAtRef = useRef<number | null>(null);
  const [sessionId] = useState(() => getOrCreateV0SessionId());
  const defaultMode: V0Mode = presetMode || (initialFile ? "screenshot" : initialInput ? "text" : "screenshot");
  const [mode, setMode] = useState<V0Mode>(defaultMode);
  const [inputSurface, setInputSurface] = useState<InputSurface>(defaultMode === "text" ? "text" : "screenshot");
  const [text, setText] = useState(initialInput || "");
  const [file, setFile] = useState<File | null>(initialFile || null);
  const [quickContextIds, setQuickContextIds] = useState<string[]>([]);
  const [voiceState, setVoiceState] = useState<VoiceCaptureState>("idle");
  const [voiceBlobUrl, setVoiceBlobUrl] = useState<string | null>(null);
  const [voiceDurationMs, setVoiceDurationMs] = useState(0);
  const [voiceElapsedMs, setVoiceElapsedMs] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceRuntimeAvailable, setVoiceRuntimeAvailable] = useState<boolean | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready when you are.");
  const [result, setResult] = useState<V0Verdict | null>(null);
  const [evidence, setEvidence] = useState<V0EvidencePack | null>(null);
  const [trustBundle, setTrustBundle] = useState<V0TrustBundle | null>(null);
  const [actionRoute, setActionRoute] = useState<V0ActionRoute | null>(null);
  const [loopReceipt, setLoopReceipt] = useState<V0LoopReceipt | null>(null);
  const [mirrorProofReceipt, setMirrorProofReceipt] = useState<V0MirrorProofReceipt | null>(null);
  const [mirrorProofCopied, setMirrorProofCopied] = useState(false);
  const [threadSignal, setThreadSignal] = useState<V0ThreatThreadSignal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [improveError, setImproveError] = useState<string | null>(null);
  const [improving, setImproving] = useState(false);
  const [lastExtractedInput, setLastExtractedInput] = useState<V0ExtractedInput | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showFullBreakdown, setShowFullBreakdown] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [casePacketCopied, setCasePacketCopied] = useState(false);
  const [linkedPacketCopied, setLinkedPacketCopied] = useState(false);
  const [localMemoryClearStatus, setLocalMemoryClearStatus] = useState<string | null>(null);
  const [moneyMovedAnswer, setMoneyMovedAnswer] = useState<MoneyMovedAnswer>(null);
  const [resultFeedback, setResultFeedback] = useState<ResultFeedbackType | null>(null);
  const [resultFeedbackStatus, setResultFeedbackStatus] = useState<string | null>(null);
  const [researchConsent, setResearchConsent] = useState(false);
  const [researchSubmitting, setResearchSubmitting] = useState(false);
  const [researchReceipt, setResearchReceipt] = useState<ResearchCandidateReceipt | null>(null);
  const [researchStatus, setResearchStatus] = useState<string | null>(null);

  useEffect(() => {
    if (initialInput) {
      setText(initialInput);
      setInputSurface("text");
    }
  }, [initialInput]);

  useEffect(() => {
    if (initialFile) {
      setFile(initialFile);
      setInputSurface("screenshot");
      if (!presetMode) {
        setMode("screenshot");
      }
    }
  }, [initialFile, presetMode]);

  useEffect(() => {
    if (presetMode) {
      setMode(presetMode);
      setInputSurface(presetMode === "text" ? "text" : "screenshot");
    }
  }, [presetMode]);

  useEffect(() => {
    if (voiceState !== "recording") return undefined;
    const interval = window.setInterval(() => {
      const startedAt = voiceStartedAtRef.current;
      if (startedAt) {
        const elapsed = Date.now() - startedAt;
        setVoiceElapsedMs(elapsed);
        if (elapsed >= VOICE_MAX_DURATION_MS && mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [voiceState]);

  useEffect(() => {
    let active = true;
    void fetch("/api/v0/voice/status")
      .then(async (response) => {
        if (!response.ok) return false;
        const data = (await response.json()) as V0VoiceRuntimeStatus;
        return data.available;
      })
      .then((available) => {
        if (active) setVoiceRuntimeAvailable(available);
      })
      .catch(() => {
        if (active) setVoiceRuntimeAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    return () => {
      if (voiceBlobUrl) URL.revokeObjectURL(voiceBlobUrl);
    };
  }, [voiceBlobUrl]);

  useEffect(() => {
    void trackV0Event({
      event_name: "app_open",
      session_id: sessionId,
      device_class: deviceClass(),
      language_hint: navigator.language.slice(0, 2),
    }, {
      dedupeKey: `app_open:${sessionId}`,
      dedupeTtlMs: APP_OPEN_TTL_MS,
      keepalive: true,
    }).catch(() => {});
  }, [sessionId]);

  const shareText = result ? shareShieldText(result) : "";
  const evidenceName = result ? `chetana-evidence-${result.scan_id}.json` : "chetana-evidence.json";
  const selectedQuickContext = useMemo(
    () => QUICK_CONTEXT_OPTIONS.filter((option) => quickContextIds.includes(option.id)),
    [quickContextIds],
  );
  const quickContextText = selectedQuickContext.length
    ? `Quick context from user taps:\n${selectedQuickContext.map((option) => `- ${option.text}`).join("\n")}`
    : "";
  const actionableScanText = [text.trim(), quickContextText].filter(Boolean).join("\n\n");
  const hasInput = Boolean(actionableScanText.trim() || file || (voiceState === "recorded" && voiceBlobRef.current));
  const composerSafetyNudge = useMemo<ComposerSafetyNudge | null>(() => {
    const selected = new Set(quickContextIds);
    if (selected.has("money_sent")) {
      return {
        tone: "danger",
        title: "Money, OTP, or screen access may already be exposed.",
        body: "Do not keep chatting with the caller. Call 1930 now, then contact your bank or wallet support from the official app.",
        primaryLabel: "Call 1930 now",
        primaryHref: "tel:1930",
        eventSurface: "call_1930",
        secondaryLabel: "Open cybercrime.gov.in",
        secondaryHref: "https://cybercrime.gov.in",
        secondarySurface: "cybercrime_portal",
      };
    }
    if (selected.has("screen")) {
      return {
        tone: "danger",
        title: "Stop screen sharing before you scan.",
        body: "End the call, stop remote access, and do not install an APK or approve accessibility permissions. If money or codes were shared, use 1930.",
        primaryLabel: "Call 1930",
        primaryHref: "tel:1930",
        eventSurface: "call_1930",
      };
    }
    if (selected.has("otp")) {
      return {
        tone: "warning",
        title: "Never read out or type an OTP for them.",
        body: "Banks, RBI, police, courier staff, and wallet support should not ask for OTP, PIN, CVV, password, or screen sharing.",
        primaryLabel: "Call 1930 if shared",
        primaryHref: "tel:1930",
        eventSurface: "call_1930",
      };
    }
    if (selected.has("upi")) {
      return {
        tone: "warning",
        title: "Do not approve a collect request to receive money.",
        body: "QR codes and UPI PIN are for sending money, not receiving refunds or prizes. Ask Chetana before approving anything.",
        primaryLabel: "Report on Chakshu",
        primaryHref: CHAKSHU_URL,
        eventSurface: "chakshu",
      };
    }
    return null;
  }, [quickContextIds]);
  const intakeEvidence = [
    file ? { label: "Screenshot", value: file.name } : null,
    selectedQuickContext.length ? { label: "Context", value: `${selectedQuickContext.length} tap${selectedQuickContext.length === 1 ? "" : "s"}` } : null,
    text.trim() ? { label: "Note", value: `${Math.min(text.trim().length, 999)} chars` } : null,
    voiceState === "recorded"
      ? {
          label: "Voice",
          value: voiceTranscript
            ? `${formatVoiceDuration(voiceDurationMs)} transcribed locally`
            : `${formatVoiceDuration(voiceDurationMs)} ready to check`,
        }
      : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));
  const resultEntitySections = useMemo(() => entitySections(result?.entities), [result?.entities]);
  const suspectLookupState = useMemo(() => {
    const entities = result?.entities;
    return {
      hasDirectoryTargets: Boolean((entities?.phone_numbers.length || 0) > 0 || (entities?.upi_ids.length || 0) > 0),
      hasWebsiteTargets: Boolean((entities?.urls.length || 0) > 0),
      identifierCounts: {
        phone_numbers: entities?.phone_numbers.length || 0,
        upi_ids: entities?.upi_ids.length || 0,
        urls: entities?.urls.length || 0,
      },
    };
  }, [result?.entities]);
  const casePacketRows = useMemo<CasePacketRow[]>(() => {
    if (!result) return [];
    const packet: V0CasePacket | undefined = actionRoute?.case_packet;
    const entities = result.entities;
    const identifiers = [
      ...(packet?.phone_numbers || entities?.phone_numbers || []),
      ...(packet?.upi_ids || entities?.upi_ids || []),
      ...(packet?.urls || entities?.urls || []),
    ];
    const merchants = packet?.merchant_names?.length
      ? packet.merchant_names
      : entities?.merchant_names || [];

    return [
      {
        label: "Amount",
        value: packet?.amount_inr ? `Rs ${packet.amount_inr}` : entities?.amounts?.[0] || "Amount paid",
        hint: "Use the exact value from the bank or payment app.",
      },
      {
        label: "UTR / transaction ID",
        value: packet?.transaction_reference || "UTR, transaction ID, or reference number",
        hint: "Copy it from the bank, wallet, or UPI app.",
      },
      {
        label: "Bank / app / merchant",
        value: merchants.length ? merchants.join(", ") : "Bank, wallet, UPI app, or merchant",
        hint: "Use the official app or statement, not the suspicious message.",
      },
      {
        label: "Time",
        value: "Date and time of transfer or contact",
        hint: "Include the first message and the payment time if they differ.",
      },
      {
        label: "Sender details",
        value: identifiers.length ? identifiers.slice(0, 3).join(", ") : "Phone number, UPI ID, link, handle, or account number",
        hint: "Preserve screenshots before blocking.",
      },
      {
        label: "Evidence",
        value: "Message screenshots, payment screen, profile/contact page",
        hint: "Keep originals on your phone while reporting.",
      },
    ];
  }, [actionRoute?.case_packet, result]);
  const casePacketText = useMemo(() => {
    if (!result || casePacketRows.length === 0) return "";
    return [
      "Chetana recovery summary",
      `Scan: ${result.scan_id}`,
      `Verdict: ${verdictLabel(result.verdict)} - ${scamTypeLabel(result.scam_type)}`,
      `Summary: ${result.guidance?.lead || verdictSummary(result)}`,
      "",
      "What happened: money, OTP, account access, or screen access may have been exposed.",
      "",
      "Details for 1930, bank/payment app, or cybercrime.gov.in:",
      ...casePacketRows.map((row) => `- ${row.label}: ${row.value}`),
      "",
      "Immediate steps:",
      "- Call 1930 now.",
      "- Contact your bank or payment app through the official app or a known number.",
      "- File or continue the report on cybercrime.gov.in.",
      "- Preserve screenshots, UTR/transaction ID, phone numbers, UPI IDs, links, and chat history.",
    ].join("\n");
  }, [casePacketRows, result]);
  const linkedThreadPacketText = useMemo(() => {
    if (!result || !threadSignal) return "";
    const entities = result.entities;
    const upiIds = entities?.upi_ids || [];
    const phoneNumbers = entities?.phone_numbers || [];
    const urls = entities?.urls || [];
    const identifierLines = [
      upiIds.length > 0 ? `- UPI IDs in current scan: ${upiIds.join(", ")}` : null,
      phoneNumbers.length > 0 ? `- Phone numbers in current scan: ${phoneNumbers.join(", ")}` : null,
      urls.length > 0 ? `- Links in current scan: ${urls.join(", ")}` : null,
    ].filter((line): line is string => Boolean(line));

    return [
      "Chetana linked scam summary",
      `Scan: ${result.scan_id}`,
      `Verdict: ${verdictLabel(result.verdict)} - ${scamTypeLabel(result.scam_type)}`,
      `Safe next step: ${result.safe_next_step || result.guidance?.do_now?.[0] || "Verify before you act."}`,
      `Repeated signal: ${threadSignal.label}`,
      `Linked scans on this device: ${threadSignal.event_count}`,
      "",
      "Current scan identifiers:",
      ...(identifierLines.length ? identifierLines : ["- No visible phone, UPI, or link in the current scan."]),
      "",
      "Local thread note:",
      "- Chetana matched private hashes saved in this browser.",
      "- This thread history was not sent to Chetana's server.",
      "- This is a warning signal, not an official fraud determination.",
      "",
      "What to preserve:",
      "- Screenshots of the message, sender profile, payment request, and payment app screen.",
      "- UTR / transaction ID, amount, date, and time if any money moved.",
      "- Phone numbers, UPI IDs, links, caller name, and app names involved.",
      "",
      "Use this with:",
      "- Your bank or payment app support.",
      "- 1930 if money, OTP, account access, or screen access was exposed.",
      "- cybercrime.gov.in if you need to file or continue a report.",
      "- A trusted family member before paying or replying.",
    ].join("\n");
  }, [result, threadSignal]);

  const resetScanState = (nextStatus = "Ready when you are.") => {
    setResult(null);
    setEvidence(null);
    setTrustBundle(null);
    setActionRoute(null);
    setLoopReceipt(null);
    setMirrorProofReceipt(null);
    setMirrorProofCopied(false);
    setThreadSignal(null);
    setError(null);
    setImproveError(null);
    setVoiceError(null);
    setImproving(false);
    setLastExtractedInput(null);
    setDetailsOpen(false);
    setShowFullBreakdown(false);
    setShareCopied(false);
    setCasePacketCopied(false);
    setLinkedPacketCopied(false);
    setLocalMemoryClearStatus(null);
    setMoneyMovedAnswer(null);
    setResultFeedback(null);
    setResultFeedbackStatus(null);
    setResearchConsent(false);
    setResearchSubmitting(false);
    setResearchReceipt(null);
    setResearchStatus(null);
    setStatus(nextStatus);
  };

  const selectInputSurface = (nextSurface: InputSurface) => {
    if (nextSurface !== "voice" && voiceState !== "idle") {
      clearVoiceCapture();
    }
    setInputSurface(nextSurface);
    if (nextSurface === "screenshot") {
      setMode("screenshot");
    } else {
      setMode("text");
      setFile(null);
    }
    resetScanState();
  };

  const scrollToComposer = () => {
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (!result) return;
    window.requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [result]);

  const loadSample = () => {
    setMode("text");
    setInputSurface("text");
    setText(SAMPLE_SCAM_TEXT);
    setFile(null);
    setQuickContextIds([]);
    resetScanState("Sample loaded. Edit it if you want, then scan.");
    window.requestAnimationFrame(scrollToComposer);
  };

  const toggleQuickContext = (contextId: string) => {
    setQuickContextIds((current) => (
      current.includes(contextId)
        ? current.filter((id) => id !== contextId)
        : [...current, contextId]
    ));
    if (result) resetScanState("Context changed. Ask Chetana again when ready.");
  };

  const acceptScreenshotFile = (nextFile: File, source: IntakeSource) => {
    if (!nextFile.type.startsWith("image/")) {
      setVoiceError("That file is not an image. Use a screenshot image.");
      return;
    }
    setMode("screenshot");
    setInputSurface("screenshot");
    setFile(nextFile);
    setDragActive(false);
    const label = source === "clipboard" ? "pasted" : source === "drop" ? "dropped" : "selected";
    resetScanState(`Screenshot ${label}. Tap what happened or ask Chetana.`);
  };

  const stopVoiceTracks = () => {
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
  };

  const clearVoiceCapture = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    stopVoiceTracks();
    voiceChunksRef.current = [];
    voiceBlobRef.current = null;
    voiceStartedAtRef.current = null;
    setVoiceState("idle");
    setVoiceDurationMs(0);
    setVoiceElapsedMs(0);
    setVoiceError(null);
    setVoiceTranscript("");
    setVoiceBlobUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  };

  const startVoiceCapture = async () => {
    setVoiceError(null);
    setInputSurface("voice");
    setMode("text");
    setFile(null);
    if (voiceRuntimeAvailable === false) {
      setVoiceError("Local voice checking is temporarily unavailable. Paste the message or use a screenshot.");
      return;
    }
    if (!voiceCaptureSupported()) {
      setVoiceError("Voice recording is not available in this browser. Tap what happened or paste the message.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stopVoiceTracks();
      voiceStreamRef.current = stream;
      voiceChunksRef.current = [];
      voiceBlobRef.current = null;
      setVoiceTranscript("");
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      voiceStartedAtRef.current = Date.now();
      setVoiceBlobUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      setVoiceDurationMs(0);
      setVoiceElapsedMs(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          voiceChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const startedAt = voiceStartedAtRef.current;
        const durationMs = startedAt ? Date.now() - startedAt : voiceElapsedMs;
        const blob = new Blob(voiceChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 0) {
          voiceBlobRef.current = blob;
          setVoiceBlobUrl((current) => {
            if (current) URL.revokeObjectURL(current);
            return URL.createObjectURL(blob);
          });
          setVoiceDurationMs(durationMs);
          setVoiceState("recorded");
          setStatus("Voice captured. Tap Ask Chetana to transcribe and check it locally.");
        } else {
          voiceBlobRef.current = null;
          setVoiceState("idle");
          setVoiceError("No voice was captured. Try again or tap what happened.");
        }
        voiceStartedAtRef.current = null;
        stopVoiceTracks();
      };

      recorder.start(250);
      setVoiceState("recording");
      setStatus("Listening. Stop when you are done.");
    } catch {
      setVoiceError("Could not use the microphone. Tap what happened or paste the message.");
      stopVoiceTracks();
      setVoiceState("idle");
    }
  };

  const stopVoiceCapture = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const pasteScreenshotFromClipboard = async () => {
    setVoiceError(null);
    if (!clipboardImageSupported()) {
      setVoiceError("Clipboard screenshot paste is not available in this browser. Choose screenshot instead.");
      return;
    }

    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        acceptScreenshotFile(imageFileFromBlob(blob, "clipboard"), "clipboard");
        return;
      }
      setVoiceError("No screenshot image was found on the clipboard. Choose screenshot instead.");
    } catch {
      setVoiceError("Could not read the clipboard. Choose screenshot instead.");
    }
  };

  const handleComposerPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.clipboardData.items || []);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    const blob = imageItem.getAsFile();
    if (!blob) return;
    event.preventDefault();
    acceptScreenshotFile(imageFileFromBlob(blob, "clipboard"), "clipboard");
  };

  const handleComposerDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const droppedFile = Array.from(event.dataTransfer.files || []).find((item) => item.type.startsWith("image/"));
    if (!droppedFile) {
      setDragActive(false);
      setVoiceError("Drop a screenshot image, not a document or folder.");
      return;
    }
    acceptScreenshotFile(droppedFile, "drop");
  };

  const recordLoopReceipt = async (
    verdict: V0Verdict,
    extracted: string,
    evidencePack: V0EvidencePack | null,
    bundle: V0TrustBundle | null,
    route: V0ActionRoute | null,
  ) => {
    try {
      const receiptResp = await fetch("/api/v0/loop/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verdict,
          input_text: extracted,
          evidence_pack: evidencePack,
          trust_bundle: bundle,
          action_route: route,
          session_id: sessionId,
        }),
      });
      if (receiptResp.ok) {
        const receiptData = (await receiptResp.json()) as {
          loop_receipt: V0LoopReceipt;
          mirrorproof_receipt?: V0MirrorProofReceipt | null;
        };
        setLoopReceipt(receiptData.loop_receipt);
        setMirrorProofReceipt(receiptData.mirrorproof_receipt || null);
      }
    } catch {
      // The scam-check result stays useful if local receipt recording fails.
    }
  };

  const runScan = async () => {
    setLoading(true);
    resetScanState();
    const started = performance.now();
    const effectiveMode: V0Mode = file ? mode : "text";

    try {
      void trackV0Event({
        event_name: "scan_started",
        session_id: sessionId,
        input_type: effectiveMode,
        device_class: deviceClass(),
        language_hint: navigator.language.slice(0, 2),
        metadata: {
          quick_context_ids: quickContextIds,
          voice_context: voiceTranscript
            ? "local_audio_transcribed"
            : voiceState === "recorded"
              ? "local_audio_transcription_requested"
              : "none",
        },
      }).catch(() => {});

      let localVoiceTranscript = voiceTranscript;
      if (!localVoiceTranscript && voiceState === "recorded") {
        const voiceBlob = voiceBlobRef.current;
        if (!voiceBlob) {
          throw new Error("Record the voice note again, then tap Ask Chetana.");
        }
        setStatus("Transcribing on Chetana's local speech runtime...");
        const voiceForm = new FormData();
        const voiceType = voiceBlob.type || "audio/webm";
        const voiceExtension = voiceType.includes("mp4") ? "m4a" : voiceType.includes("ogg") ? "ogg" : "webm";
        voiceForm.append(
          "file",
          new File([voiceBlob], `chetana-voice.${voiceExtension}`, { type: voiceType }),
        );
        voiceForm.append("consent_token", "local-voice-consent");
        const voiceResp = await fetch("/api/v0/voice/transcribe", {
          method: "POST",
          body: voiceForm,
        });
        if (!voiceResp.ok) {
          let voiceMessage = "Chetana could not transcribe that voice note. Try again closer to the microphone.";
          try {
            const failure = (await voiceResp.json()) as {
              detail?: string | { code?: string; message?: string };
            };
            if (typeof failure.detail === "object" && failure.detail?.message) {
              voiceMessage = failure.detail.message;
            }
          } catch {
            // Use the bounded fallback message above.
          }
          throw new Error(voiceMessage);
        }
        const voiceData = (await voiceResp.json()) as V0VoiceTranscription;
        localVoiceTranscript = voiceData.transcript.trim();
        if (!localVoiceTranscript) {
          throw new Error("No clear speech was found. Try again closer to the microphone.");
        }
        setVoiceTranscript(localVoiceTranscript);
      }

      const currentVoiceText = localVoiceTranscript
        ? `Voice transcript from Chetana's local speech runtime:\n${localVoiceTranscript}`
        : "";
      const currentScanText = [actionableScanText, currentVoiceText].filter(Boolean).join("\n\n");
      setStatus(effectiveMode === "text" ? "Reading what you shared..." : "Extracting what is visible...");
      let extractedInput = await extractScanInputForMode(effectiveMode, file, currentScanText);
      if (localVoiceTranscript) {
        extractedInput = {
          ...extractedInput,
          extraction: {
            ...extractedInput.extraction,
            quality_flags: Array.from(
              new Set([...extractedInput.extraction.quality_flags, "local_voice_transcript"]),
            ),
          },
        };
      }
      const extracted = extractedInput.text;
      if (!extracted) {
        throw new Error("Paste the message, upload a screenshot, or record a voice note first.");
      }
      setLastExtractedInput(extractedInput);

      setStatus("Explaining the risk in plain language...");
      const scanResp = await fetch("/api/v0/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input_type: effectiveMode,
          text: extracted,
          language_hint: navigator.language.slice(0, 2),
          source_name: file?.name || null,
          session_id: sessionId,
          extraction: extractedInput.extraction,
        }),
      });

      if (!scanResp.ok) {
        throw new Error("Chetana could not complete the check right now.");
      }

      const scanData = (await scanResp.json()) as V0Verdict;
      setResult(scanData);
      setThreadSignal(await recordLocalThreatThread(scanData, extracted));

      const elapsed = Math.round(performance.now() - started);
      void trackV0Event({
        event_name: "scan_completed",
        session_id: sessionId,
        scan_id: scanData.scan_id,
        input_type: scanData.input_type,
        verdict: scanData.verdict,
        scam_type: scanData.scam_type,
        confidence_band: scanData.confidence_band,
        latency_ms: elapsed,
        device_class: deviceClass(),
        language_hint: scanData.language_hint || navigator.language.slice(0, 2),
      }).catch(() => {});
      void trackV0Event({
        event_name: eventNameForVerdict(scanData.verdict),
        session_id: sessionId,
        scan_id: scanData.scan_id,
        input_type: scanData.input_type,
        verdict: scanData.verdict,
        scam_type: scanData.scam_type,
        confidence_band: scanData.confidence_band,
        device_class: deviceClass(),
        language_hint: scanData.language_hint || navigator.language.slice(0, 2),
      }).catch(() => {});

      const previousCount = Number(localStorage.getItem("chetana_v0_scan_count") || "0");
      const previousTs = Number(localStorage.getItem("chetana_v0_last_scan_at") || "0");
      if (previousCount === 0) {
        void trackV0Event({
          event_name: "first_scan",
          session_id: sessionId,
          scan_id: scanData.scan_id,
          input_type: scanData.input_type,
          verdict: scanData.verdict,
          device_class: deviceClass(),
          language_hint: scanData.language_hint || navigator.language.slice(0, 2),
        }, {
          dedupeTtlMs: EXPORT_EVENT_TTL_MS,
        }).catch(() => {});
      } else if (Date.now() - previousTs <= 7 * 24 * 60 * 60 * 1000) {
        void trackV0Event({
          event_name: "repeat_scan_7d",
          session_id: sessionId,
          scan_id: scanData.scan_id,
          input_type: scanData.input_type,
          verdict: scanData.verdict,
          device_class: deviceClass(),
          language_hint: scanData.language_hint || navigator.language.slice(0, 2),
        }, {
          dedupeTtlMs: EXPORT_EVENT_TTL_MS,
        }).catch(() => {});
      }
      localStorage.setItem("chetana_v0_scan_count", String(previousCount + 1));
      localStorage.setItem("chetana_v0_last_scan_at", String(Date.now()));

      let evidencePackForLoop: V0EvidencePack | null = null;
      if (scanData.evidence_pack_eligible) {
        const evidenceResp = await fetch("/api/v0/evidence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            verdict: scanData,
            input_text: extracted,
          }),
        });
        if (evidenceResp.ok) {
          const evidenceData = (await evidenceResp.json()) as { evidence_pack: V0EvidencePack };
          evidencePackForLoop = evidenceData.evidence_pack;
          setEvidence(evidenceData.evidence_pack);
        }
      }

      let trustBundleForLoop: V0TrustBundle | null = null;
      try {
        const trustResp = await fetch("/api/v0/trust/bundle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            verdict: scanData,
            input_text: extracted,
            source_name: file?.name || null,
          }),
        });
        if (trustResp.ok) {
          const trustData = (await trustResp.json()) as { trust_bundle: V0TrustBundle };
          trustBundleForLoop = trustData.trust_bundle;
          setTrustBundle(trustData.trust_bundle);
        }
      } catch {
        // The scan result is still useful even if the trust bundle request fails.
      }

      let actionRouteForLoop: V0ActionRoute | null = null;
      try {
        const actionResp = await fetch("/api/v0/action-route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            verdict: scanData,
            input_text: extracted,
            trust_bundle: trustBundleForLoop,
            evidence_pack: evidencePackForLoop,
            session_id: sessionId,
          }),
        });
        if (actionResp.ok) {
          const actionData = (await actionResp.json()) as { action_route: V0ActionRoute };
          actionRouteForLoop = actionData.action_route;
          setActionRoute(actionData.action_route);
        }
      } catch {
        // The scan result stays usable even if action routing fails.
      }

      await recordLoopReceipt(scanData, extracted, evidencePackForLoop, trustBundleForLoop, actionRouteForLoop);
      setStatus("Done. Read this before you reply or pay.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Chetana could not complete the check right now.";
      setError(message);
      setStatus("Could not finish the check.");
    } finally {
      setLoading(false);
    }
  };

  const runImproveScan = async () => {
    if (!file || !result) return;
    setImproving(true);
    setImproveError(null);
    setLoopReceipt(null);
    setStatus("Improving the text extraction...");

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("input_type", mode);
      form.append("source_name", file.name);
      form.append("consent_token", "cloud-ocr-consent");
      form.append("local_extracted_text", lastExtractedInput?.text || "");
      form.append("quality_snapshot", JSON.stringify(lastExtractedInput?.extraction || {
        source: "browser",
        confidence: null,
        quality_flags: result.fallback_reason ? [result.fallback_reason] : [],
        character_count: lastExtractedInput?.text?.length || 0,
      }));
      form.append("session_id", sessionId);
      form.append("language_hint", navigator.language.slice(0, 2));

      const improveResp = await fetch("/api/v0/scan/improve", {
        method: "POST",
        body: form,
      });

      if (!improveResp.ok) {
        const detail = await improveResp.json().catch(() => null);
        throw new Error(detail?.detail || "Chetana could not improve this scan right now.");
      }

      const improved = (await improveResp.json()) as V0Verdict;
      setResult(improved);
      setThreadSignal(await recordLocalThreatThread(improved, lastExtractedInput?.text || ""));
      setEvidence(null);
      setActionRoute(null);
      let improvedTrustBundle: V0TrustBundle | null = null;
      try {
        const trustResp = await fetch("/api/v0/trust/bundle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            verdict: improved,
            input_text: lastExtractedInput?.text || "",
            source_name: file?.name || null,
          }),
        });
        if (trustResp.ok) {
          const trustData = (await trustResp.json()) as { trust_bundle: V0TrustBundle };
          improvedTrustBundle = trustData.trust_bundle;
          setTrustBundle(trustData.trust_bundle);
        } else {
          setTrustBundle(null);
        }
      } catch {
        setTrustBundle(null);
      }
      let improvedActionRoute: V0ActionRoute | null = null;
      try {
        const actionResp = await fetch("/api/v0/action-route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            verdict: improved,
            input_text: lastExtractedInput?.text || "",
            trust_bundle: improvedTrustBundle,
            evidence_pack: null,
            session_id: sessionId,
          }),
        });
        if (actionResp.ok) {
          const actionData = (await actionResp.json()) as { action_route: V0ActionRoute };
          improvedActionRoute = actionData.action_route;
          setActionRoute(actionData.action_route);
        }
      } catch {
        // Improved scan remains usable without the route card.
      }
      await recordLoopReceipt(improved, lastExtractedInput?.text || "", null, improvedTrustBundle, improvedActionRoute);
      setDetailsOpen(false);
      setShowFullBreakdown(false);
      setStatus(
        improved.runtime_source === "local + OCR fallback"
          ? "Improved scan finished."
          : "Use a clearer screenshot or paste the visible text.",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Chetana could not improve this scan right now.";
      setImproveError(message);
      setStatus("Could not improve this scan.");
    } finally {
      setImproving(false);
    }
  };

  const copyShareShield = async () => {
    if (!result) return;
    void trackV0Event({
      event_name: "share_tapped",
      session_id: sessionId,
      scan_id: result.scan_id,
      input_type: result.input_type,
      verdict: result.verdict,
      share_channel: "copy_link",
      device_class: deviceClass(),
      language_hint: result.language_hint || navigator.language.slice(0, 2),
    }, {
      dedupeTtlMs: TAP_EVENT_TTL_MS,
      keepalive: true,
    }).catch(() => {});
    await navigator.clipboard.writeText(shareText);
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 1600);
    void trackV0Event({
      event_name: "share_completed",
      session_id: sessionId,
      scan_id: result.scan_id,
      input_type: result.input_type,
      verdict: result.verdict,
      share_channel: "copy_link",
      device_class: deviceClass(),
      language_hint: result.language_hint || navigator.language.slice(0, 2),
    }, {
      dedupeTtlMs: TAP_EVENT_TTL_MS,
      keepalive: true,
    }).catch(() => {});
  };

  const copyMirrorProof = async () => {
    if (!mirrorProofReceipt) return;
    await navigator.clipboard.writeText(JSON.stringify(mirrorProofReceipt, null, 2));
    setMirrorProofCopied(true);
    window.setTimeout(() => setMirrorProofCopied(false), 1800);
  };

  const shareOnWhatsApp = () => {
    if (!result) return;
    void trackV0Event({
      event_name: "share_tapped",
      session_id: sessionId,
      scan_id: result.scan_id,
      input_type: result.input_type,
      verdict: result.verdict,
      share_channel: "whatsapp",
      device_class: deviceClass(),
      language_hint: result.language_hint || navigator.language.slice(0, 2),
    }, {
      dedupeTtlMs: TAP_EVENT_TTL_MS,
      keepalive: true,
    }).catch(() => {});
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener");
    void trackV0Event({
      event_name: "share_completed",
      session_id: sessionId,
      scan_id: result.scan_id,
      input_type: result.input_type,
      verdict: result.verdict,
      share_channel: "whatsapp",
      device_class: deviceClass(),
      language_hint: result.language_hint || navigator.language.slice(0, 2),
    }, {
      dedupeTtlMs: TAP_EVENT_TTL_MS,
      keepalive: true,
    }).catch(() => {});
  };

  const saveEvidence = () => {
    if (!result || !evidence) return;
    downloadJson(evidenceName, evidence);
    void trackV0Event({
      event_name: "evidence_saved",
      session_id: sessionId,
      scan_id: result.scan_id,
      input_type: result.input_type,
      verdict: result.verdict,
      device_class: deviceClass(),
      language_hint: result.language_hint || navigator.language.slice(0, 2),
      metadata: {
        recovery_step: "evidence_download",
        recovery_channel: "device_export",
        artifact_kind: "json_report",
      },
    }, {
      dedupeTtlMs: EXPORT_EVENT_TTL_MS,
      keepalive: true,
    }).catch(() => {});
  };

  const copyCasePacket = async () => {
    if (!result || !casePacketText) return;
    try {
      await navigator.clipboard.writeText(casePacketText);
      setCasePacketCopied(true);
      window.setTimeout(() => setCasePacketCopied(false), 1800);
      void trackV0Event({
        event_name: "evidence_saved",
        session_id: sessionId,
        scan_id: result.scan_id,
        input_type: result.input_type,
        verdict: result.verdict,
        device_class: deviceClass(),
        language_hint: result.language_hint || navigator.language.slice(0, 2),
        metadata: {
          recovery_step: "case_packet_copy",
          recovery_channel: "clipboard",
          artifact_kind: "text_case_packet",
        },
      }, {
        dedupeTtlMs: EXPORT_EVENT_TTL_MS,
        keepalive: true,
      }).catch(() => {});
    } catch {
      setStatus("Could not copy. Select the checklist text manually.");
    }
  };

  const startRecoveryNow = async () => {
    if (!result) return;
    setMoneyMovedAnswer("yes");
    setCasePacketCopied(false);
    setDetailsOpen(true);
    setStatus("Recovery checklist ready. Call 1930 first.");
    if (casePacketText) {
      await copyCasePacket();
    }
  };

  const copyLinkedThreadPacket = async () => {
    if (!result || !threadSignal || !linkedThreadPacketText) return;
    try {
      await navigator.clipboard.writeText(linkedThreadPacketText);
      setLinkedPacketCopied(true);
      window.setTimeout(() => setLinkedPacketCopied(false), 1800);
      void trackV0Event({
        event_name: "evidence_saved",
        session_id: sessionId,
        scan_id: result.scan_id,
        input_type: result.input_type,
        verdict: result.verdict,
        device_class: deviceClass(),
        language_hint: result.language_hint || navigator.language.slice(0, 2),
        metadata: {
          recovery_step: "linked_thread_case_packet_copy",
          recovery_channel: "clipboard",
          artifact_kind: "linked_text_case_packet",
          local_thread_event_count: threadSignal.event_count,
          local_thread_matched_kinds: threadSignal.matched_kinds,
        },
      }, {
        dedupeTtlMs: EXPORT_EVENT_TTL_MS,
        keepalive: true,
      }).catch(() => {});
    } catch {
      setStatus("Could not copy. Select the linked case text manually.");
    }
  };

  const clearLocalScanMemory = () => {
    void trackV0Event({
      event_name: "local_scan_memory_cleared",
      session_id: sessionId,
      device_class: deviceClass(),
      language_hint: navigator.language.slice(0, 2),
      metadata: {
        privacy_action: "clear_scan_memory",
        privacy_surface: "result_card",
        cleared_key_classes: [
          "thread_hints",
          "scan_counters",
          "event_queue",
          "legacy_history",
          "vigilance_receipts",
        ],
        preserved_setup: true,
      },
    }, {
      keepalive: true,
      queueOnFailure: false,
    }).catch(() => {});
    clearLocalChetanaScanMemory();
    const message = "Local scan memory cleared from this browser.";
    setThreadSignal(null);
    setLocalMemoryClearStatus(message);
    setStatus(message);
    window.setTimeout(() => setLocalMemoryClearStatus(null), 2800);
  };

  const submitResultFeedback = async (feedbackType: ResultFeedbackType) => {
    if (!result || resultFeedback) return;
    const option = RESULT_FEEDBACK_OPTIONS.find((item) => item.id === feedbackType);
    setResultFeedback(feedbackType);
    setResultFeedbackStatus("Feedback saved without message text.");
    if (feedbackType === "scammed_after_scan") {
      setMoneyMovedAnswer("yes");
      setDetailsOpen(true);
    }

    try {
      await trackV0Event({
        event_name: "feedback_submitted",
        session_id: sessionId,
        scan_id: result.scan_id,
        input_type: result.input_type,
        verdict: result.verdict,
        scam_type: result.scam_type,
        confidence_band: result.confidence_band,
        device_class: deviceClass(),
        language_hint: result.language_hint || navigator.language.slice(0, 2),
        payload_class: "cross_surface_signal",
        persistence_class: "P1",
        metadata: {
          feedback_type: feedbackType,
          feedback_label: option?.label || feedbackType,
          feedback_surface: "result_card",
          no_free_text_collected: true,
          action_route_hash: actionRoute?.route_hash || null,
          route_id: actionRoute?.route_id || null,
        },
      }, {
        dedupeKey: `feedback:${result.scan_id}:${feedbackType}`,
        dedupeTtlMs: 24 * 60 * 60 * 1000,
        keepalive: true,
      });
    } catch {
      setResultFeedbackStatus("Feedback saved locally and will retry when possible.");
    }
  };

  const donateResearchCandidate = async () => {
    if (
      !result ||
      !lastExtractedInput?.text ||
      !resultFeedback ||
      resultFeedback === "useful" ||
      !researchConsent ||
      researchSubmitting
    ) return;
    setResearchSubmitting(true);
    setResearchStatus("Removing common identifiers before quarantine...");
    try {
      const response = await fetch("/api/v1/research/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scan_id: result.scan_id,
          feedback_type: resultFeedback,
          input_type: result.input_type,
          language_hint: result.language_hint || navigator.language.slice(0, 2),
          text: lastExtractedInput.text,
          consent_token: "I_CONSENT_TO_CHETANA_RESEARCH_DATA_DONATION_V1",
        }),
      });
      if (!response.ok) throw new Error("donation_failed");
      const receipt = (await response.json()) as ResearchCandidateReceipt;
      setResearchReceipt(receipt);
      setResearchStatus(
        `Donated after ${receipt.redaction_count} automatic redaction${receipt.redaction_count === 1 ? "" : "s"}. Quarantined until two reviewers agree.`,
      );
    } catch {
      setResearchStatus("Chetana could not save this research example. Nothing was donated.");
    } finally {
      setResearchSubmitting(false);
    }
  };

  const deleteResearchCandidate = async () => {
    if (!researchReceipt || researchSubmitting) return;
    setResearchSubmitting(true);
    try {
      const response = await fetch("/api/v1/research/candidates/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_id: researchReceipt.candidate_id,
          deletion_token: researchReceipt.deletion_token,
        }),
      });
      if (!response.ok) throw new Error("deletion_failed");
      setResearchReceipt(null);
      setResearchConsent(false);
      setResearchStatus("Research example deleted.");
    } catch {
      setResearchStatus("Chetana could not delete the example right now. Try again before leaving this page.");
    } finally {
      setResearchSubmitting(false);
    }
  };

  const trackReportAction = (surface: string, options: RecoveryActionOptions = {}) => {
    if (!result) return;
    const defaults = RECOVERY_SURFACE_DEFAULTS[surface] || {};
    void trackV0Event({
      event_name: "report_tapped",
      session_id: sessionId,
      scan_id: result.scan_id,
      input_type: result.input_type,
      verdict: result.verdict,
      report_target: options.reportTarget || defaults.reportTarget || "manual_report",
      device_class: deviceClass(),
      language_hint: result.language_hint || navigator.language.slice(0, 2),
      metadata: {
        report_surface: surface,
        recovery_step: options.recoveryStep || defaults.recoveryStep,
        recovery_channel: options.recoveryChannel || defaults.recoveryChannel,
        official_rail_id: options.officialRailId || defaults.officialRailId,
        href: options.href || null,
        identifier_counts: suspectLookupState.identifierCounts,
      },
    }, {
      dedupeTtlMs: TAP_EVENT_TTL_MS,
      keepalive: true,
    }).catch(() => {});
  };

  const openReportRail = () => {
    if (!result) return;
    const riskyMoneyCase =
      result.recommended_actions.includes("report_and_block") ||
      result.scam_type === "fake_payment_proof" ||
      result.scam_type === "upi_qr_scam" ||
      result.scam_type === "fake_kyc";
    if (riskyMoneyCase) {
      window.open("tel:1930");
      trackReportAction("call_1930", { href: "tel:1930" });
    } else {
      window.open("https://cybercrime.gov.in", "_blank", "noopener");
      trackReportAction("cybercrime_portal", { href: "https://cybercrime.gov.in" });
    }
  };

  const openOfficialExternal = (href: string, surface: string, options: RecoveryActionOptions = {}) => {
    window.open(href, href.startsWith("http") ? "_blank" : undefined, "noopener");
    trackReportAction(surface, { ...options, href });
  };

  const trackActionRouteStep = (step: V0ActionStep) => {
    if (!result || !actionRoute) return;
    void trackV0Event({
      event_name: "report_tapped",
      session_id: sessionId,
      scan_id: result.scan_id,
      input_type: result.input_type,
      verdict: result.verdict,
      report_target: step.href ? "manual_report" : "other",
      device_class: deviceClass(),
      language_hint: result.language_hint || navigator.language.slice(0, 2),
      metadata: {
        report_surface: "action_router",
        recovery_step: step.route_id,
        recovery_channel: step.kind,
        official_rail_id: step.official_rail_id,
        href: step.href || null,
        route_hash: actionRoute.route_hash,
        route_id: actionRoute.route_id,
      },
    }, {
      dedupeTtlMs: TAP_EVENT_TTL_MS,
      keepalive: true,
    }).catch(() => {});
  };

  const runActionRouteStep = async (step: V0ActionStep) => {
    trackActionRouteStep(step);
    if (step.kind === "save") {
      if (evidence) {
        saveEvidence();
      } else {
        setDetailsOpen(true);
      }
      return;
    }
    if (step.kind === "share") {
      await copyShareShield();
      setDetailsOpen(true);
      return;
    }
    if (step.kind === "scan_again") {
      clearResult();
      return;
    }
    if (step.href) {
      window.open(step.href, step.href.startsWith("http") ? "_blank" : undefined, "noopener");
      return;
    }
    setStatus(step.title);
  };

  const clearResult = () => {
    setText("");
    setFile(null);
    setQuickContextIds([]);
    clearVoiceCapture();
    resetScanState();
    window.requestAnimationFrame(scrollToComposer);
  };

  const kavachSignal = kavachSignalForResult(result);

  return (
    <section className="v0-shell v0-shell-simple">
      {showHero && (
        <div className="v0-simple-hero">
          <div className="v0-simple-copy">
            <div className="v0-app-mark" aria-label="Chetana scam checker">
              <span className="v0-app-glyph">
                <Shield size={22} />
              </span>
              <strong>Chetana</strong>
            </div>
            <h1 lang="hi-Latn">Fake hai kya?</h1>
            <p lang="hi-Latn">Screenshot bhejo. Chetana bata degi.</p>
            <div className="v0-app-privacy">
              No login. No complaint filed. Official next steps only.
            </div>
          </div>
          <div className="v0-hero-proof-list" aria-label="Chetana trust points">
            <span><Check size={14} /> Screenshot, paste, or tap what happened</span>
            <span><Mic size={14} /> Voice checked on Chetana's own host</span>
            <span><Phone size={14} /> 1930 and cybercrime.gov.in when money moved</span>
            <span><Shield size={14} /> Advisory only, not a government service</span>
          </div>
        </div>
      )}

      <div className={`v0-grid${result ? " v0-grid-result" : ""}`}>
        <div className="v0-main">
          <div
            className={dragActive ? "v0-composer v0-composer-drop-active" : "v0-composer"}
            id="chetana-scan-box"
            ref={composerRef}
            onPaste={handleComposerPaste}
            onDragEnter={() => setDragActive(true)}
            onDragOver={(event) => {
              event.preventDefault();
              if (!dragActive) setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleComposerDrop}
          >
            <div className="v0-composer-head">
              <div>
                <div className="v0-section-label">Ask Chetana</div>
                <h2>
                  {inputSurface === "text"
                    ? "Paste or tap"
                    : inputSurface === "voice"
                      ? "Record or tap"
                      : "Screenshot or tap"}
                </h2>
                <p className="v0-composer-copy">
                  {inputSurface === "text"
                    ? "Paste the suspicious message or tap what happened."
                    : inputSurface === "voice"
                      ? "Record up to 30 seconds from a suspicious call or voice note. Chetana checks the transcript, then deletes the raw audio."
                      : "Use a screenshot from WhatsApp, SMS, email, QR, or payment proof. Tap context if you are in a hurry."}
                </p>
              </div>
              <div className="v0-status">{status}</div>
            </div>

            {directScanIntent && (
              <div className="v0-direct-intent-note" role="note">
                <Shield size={18} />
                <div>
                  <strong>{directScanIntent === "share" ? "Shared screenshot is ready." : "Quick check mode."}</strong>
                  <p>Chetana gives guidance, not final authority. If money already moved, call 1930 first and verify through your bank or official channel.</p>
                </div>
                {onNavigate && (
                  <button type="button" onClick={() => onNavigate("proof")}>
                    Full limits
                  </button>
                )}
              </div>
            )}

            <div className="v0-quick-row">
              <button className="v0-quick-chip" onClick={loadSample}>Try a sample message</button>
            </div>

            <div className="v0-simple-tabs" role="tablist" aria-label="Choose input type">
              <button role="tab" aria-selected={inputSurface === "screenshot"} className={inputSurface === "screenshot" ? "active" : ""} onClick={() => selectInputSurface("screenshot")}>
                <ImageIcon size={16} />
                Screenshot
              </button>
              <button role="tab" aria-selected={inputSurface === "voice"} className={inputSurface === "voice" ? "active" : ""} onClick={() => selectInputSurface("voice")}>
                <Mic size={16} />
                Voice
              </button>
              <button role="tab" aria-selected={inputSurface === "text"} className={inputSurface === "text" ? "active" : ""} onClick={() => selectInputSurface("text")}>
                <Type size={16} />
                Text
              </button>
            </div>

            {inputSurface === "screenshot" && (
              <label className="v0-upload v0-upload-large">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => {
                    const selected = event.target.files?.[0];
                    if (selected) acceptScreenshotFile(selected, "chooser");
                  }}
                />
                <span className="v0-upload-inner">
                  <Upload size={20} />
                  {file ? file.name : "Choose screenshot"}
                </span>
              </label>
            )}

            {inputSurface === "voice" && (
              <div className="v0-voice-intake">
                <button
                  className={voiceState === "recording" ? "v0-voice-button recording" : "v0-voice-button"}
                  onClick={() => {
                    if (voiceState === "recording") {
                      stopVoiceCapture();
                    } else {
                      if (voiceState === "recorded") clearVoiceCapture();
                      void startVoiceCapture();
                    }
                  }}
                  disabled={loading || voiceRuntimeAvailable === false}
                >
                  {voiceState === "recording" ? <Square size={16} /> : <Mic size={16} />}
                  {voiceRuntimeAvailable === false
                    ? "Voice unavailable"
                    : voiceState === "recording"
                      ? `Stop ${formatVoiceDuration(voiceElapsedMs)}`
                      : voiceState === "recorded"
                        ? "Record again"
                        : "Record voice"}
                </button>
                {voiceBlobUrl && (
                  <div className="v0-voice-preview">
                    <audio controls src={voiceBlobUrl} />
                    <span>
                      {formatVoiceDuration(voiceDurationMs)} {voiceTranscript ? "checked locally" : "ready to check"}
                    </span>
                    <button onClick={clearVoiceCapture} aria-label="Remove voice note">
                      <X size={14} />
                    </button>
                  </div>
                )}
                <div className="v0-voice-privacy">
                  <Shield size={14} />
                  <span>No external AI provider receives the audio. Chetana keeps no raw voice recording.</span>
                </div>
                {voiceTranscript && (
                  <div className="v0-voice-transcript" role="status">
                    <strong>Chetana heard</strong>
                    <p>{voiceTranscript}</p>
                  </div>
                )}
                {voiceError && <div className="v0-voice-error">{voiceError}</div>}
              </div>
            )}

            <div className="v0-lazy-panel">
              <div className="v0-lazy-copy">
                <div className="v0-section-label">Fast path</div>
                <strong>No perfect prompt needed.</strong>
                <p>
                  Tap what happened or paste a screenshot. Chetana combines that context with your
                  selected input before giving a verdict and safest next action.
                </p>
              </div>

              <div className="v0-voice-row">
                <button
                  className="v0-voice-button"
                  onClick={() => {
                    void pasteScreenshotFromClipboard();
                  }}
                  disabled={loading}
                >
                  <Copy size={16} />
                  Paste screenshot
                </button>
              </div>

              <div className="v0-context-grid" aria-label="Tap what happened">
                {QUICK_CONTEXT_OPTIONS.map((option) => {
                  const active = quickContextIds.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      className={active ? "v0-context-chip active" : "v0-context-chip"}
                      onClick={() => toggleQuickContext(option.id)}
                      aria-pressed={active}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {composerSafetyNudge && (
                <div className={`v0-safety-nudge ${composerSafetyNudge.tone}`}>
                  <div>
                    <div className="v0-section-label">Do not wait</div>
                    <strong>{composerSafetyNudge.title}</strong>
                    <p>{composerSafetyNudge.body}</p>
                  </div>
                  <div className="v0-safety-actions">
                    <a
                      href={composerSafetyNudge.primaryHref}
                      target={composerSafetyNudge.primaryHref.startsWith("http") ? "_blank" : undefined}
                      rel="noreferrer"
                      onClick={() => trackReportAction(composerSafetyNudge.eventSurface, { href: composerSafetyNudge.primaryHref })}
                    >
                      {composerSafetyNudge.primaryHref.startsWith("tel:") ? <Phone size={14} /> : <ExternalLink size={14} />}
                      {composerSafetyNudge.primaryLabel}
                    </a>
                    {composerSafetyNudge.secondaryHref && composerSafetyNudge.secondaryLabel && (
                      <a
                        href={composerSafetyNudge.secondaryHref}
                        target={composerSafetyNudge.secondaryHref.startsWith("http") ? "_blank" : undefined}
                        rel="noreferrer"
                        onClick={() => trackReportAction(
                          composerSafetyNudge.secondarySurface || composerSafetyNudge.eventSurface,
                          { href: composerSafetyNudge.secondaryHref },
                        )}
                      >
                        <ExternalLink size={14} />
                        {composerSafetyNudge.secondaryLabel}
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {dragActive && (
              <div className="v0-drop-hint">
                <Upload size={16} />
                Drop the screenshot here
              </div>
            )}

            {intakeEvidence.length > 0 && (
              <div className="v0-intake-evidence" aria-label="Evidence ready for Chetana">
                {intakeEvidence.map((item) => (
                  <span key={item.label}>
                    <strong>{item.label}</strong>
                    {item.value}
                  </span>
                ))}
              </div>
            )}

            <label className="v0-input-label">
              {inputSurface === "text" ? "Paste the message if you have it" : "Optional note"}
            </label>
            <textarea
              className="v0-textarea"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={inputSurface === "voice" ? "Add anything the caller said that was unclear." : DEFAULT_PROMPTS[mode]}
              rows={inputSurface === "text" ? 6 : 3}
            />

            <div className="v0-composer-foot">
              <div className="v0-limit-note">
                Private advisory tool. If money moved already, call 1930 first and contact your bank.
              </div>
              <button className="v0-submit" onClick={runScan} disabled={loading || !hasInput}>
                {loading ? "Checking..." : "Ask Chetana"}
                <ArrowRight size={16} />
              </button>
            </div>
            {error && <div className="v0-error">{error}</div>}
          </div>

          {result && (
            <div ref={resultRef} className={`v0-result-card ${result.verdict}`}>
              <ChetanaResultScreen
                risk={riskFromVerdict(result.verdict)}
                summary={result.guidance?.lead || verdictSummary(result)}
                nextStep={result.safe_next_step || result.guidance?.do_now?.[0]}
                reasons={
                  result.guidance?.why_it_was_flagged?.length
                    ? result.guidance.why_it_was_flagged
                    : result.reasons.map((r) => r.label)
                }
                doNotDo={result.guidance?.do_not_do || []}
                verificationRoute={result.guidance?.verification_route}
                contextChips={[
                  incidentStateLabel(result.incident_state),
                  evidenceStateLabel(result.evidence_state),
                  confidenceLabel(result.confidence_band),
                ]}
                onEmergencyHelp={openReportRail}
                onCheckAnother={clearResult}
                onToggleBreakdown={() => setShowFullBreakdown((current) => !current)}
                showFullBreakdown={showFullBreakdown}
              />

              <div className="v0-runtime-source">
                <Check size={14} />
                <span>{runtimeSourceLabel(result)}</span>
              </div>

              {kavachSignal && (
                <div className={`v0-kavach-strip ${kavachSignal.tone}`}>
                  <AlertTriangle size={15} />
                  <span>{kavachSignal.text}</span>
                </div>
              )}

              {threadSignal && (
                <div className="v0-thread-strip">
                  <Shield size={15} />
                  <div className="v0-thread-copy">
                    <span>{threadSignal.message}</span>
                    <small>{threadSignal.privacy_note}</small>
                  </div>
                  <button className="v0-thread-copy-button" onClick={copyLinkedThreadPacket}>
                    <Copy size={13} />
                    {linkedPacketCopied ? "Copied case packet" : "Copy case packet"}
                  </button>
                </div>
              )}

              <div className="v0-local-memory-strip">
                <div>
                  <div className="v0-section-label">Local privacy</div>
                  <strong>Scan memory stays on this browser.</strong>
                  <p>Clear repeated-scan hints, local counters, queued scan events, and old scan history without changing language, install, consent, senior mode, or family settings.</p>
                  {localMemoryClearStatus && <small aria-live="polite">{localMemoryClearStatus}</small>}
                </div>
                <button type="button" onClick={clearLocalScanMemory}>
                  <X size={14} />
                  Clear local scan memory
                </button>
              </div>

              {loopReceipt && (
                <div className={`v0-loop-receipt ${loopReceipt.status}`}>
                  <Shield size={14} />
                  <span>{mirrorProofReceipt ? "Assessment receipt signed" : "Safety loop recorded"}</span>
                  <small>{(mirrorProofReceipt?.receipt_hash || loopReceipt.chain_head || loopReceipt.iteration_hash).slice(0, 10)}</small>
                </div>
              )}

              {result.verdict !== "low_signal" && (
                <div className="v0-followthrough-card">
                  <div className="v0-followthrough-copy">
                    <div className="v0-section-label">Follow through</div>
                    <strong>Send it, report it, or start recovery.</strong>
                    <p>Most people need one clear next step. Share the warning with someone trusted, use an official rail, or copy a recovery packet if money or access already moved.</p>
                  </div>
                  <div className="v0-followthrough-grid">
                    <button type="button" className="v0-followthrough-main" onClick={shareOnWhatsApp}>
                      <Phone size={16} />
                      Send to someone I trust
                    </button>
                    <button type="button" onClick={copyShareShield}>
                      <Copy size={14} />
                      {shareCopied ? "Copied warning" : "Copy warning"}
                    </button>
                    <a
                      href="tel:1930"
                      onClick={() => trackReportAction("call_1930", { href: "tel:1930" })}
                    >
                      <Phone size={14} />
                      Call 1930
                    </a>
                    <a
                      href="https://cybercrime.gov.in"
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => trackReportAction("cybercrime_portal", { href: "https://cybercrime.gov.in" })}
                    >
                      <ExternalLink size={14} />
                      cybercrime.gov.in
                    </a>
                    <a
                      href={CHAKSHU_URL}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => trackReportAction("chakshu", { href: CHAKSHU_URL })}
                    >
                      <ExternalLink size={14} />
                      Open Chakshu
                    </a>
                    <button type="button" className="v0-followthrough-danger" onClick={() => { void startRecoveryNow(); }}>
                      <AlertTriangle size={14} />
                      I already lost money
                    </button>
                  </div>
                </div>
              )}

              <div className="v0-feedback-card">
                <div className="v0-feedback-copy">
                  <div className="v0-section-label">Feedback loop</div>
                  <strong>Was Chetana right?</strong>
                  <p>No message text is sent. These taps only help count misses, false alarms, recovery cases, and useful pauses.</p>
                  {resultFeedbackStatus && <small aria-live="polite">{resultFeedbackStatus}</small>}
                </div>
                <div className="v0-feedback-options" role="group" aria-label="Chetana result feedback">
                  {RESULT_FEEDBACK_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`v0-feedback-option ${option.tone} ${resultFeedback === option.id ? "active" : ""}`}
                      onClick={() => {
                        void submitResultFeedback(option.id);
                      }}
                      disabled={Boolean(resultFeedback)}
                    >
                      {option.tone === "safe" ? <Check size={14} /> : <AlertTriangle size={14} />}
                      <span>{option.label}</span>
                      <small>{option.helper}</small>
                    </button>
                  ))}
                </div>
              </div>

              {resultFeedback && resultFeedback !== "useful" && lastExtractedInput?.text && (
                <div className="v0-research-donation">
                  <div>
                    <div className="v0-section-label">Optional research donation</div>
                    <strong>Help improve the cases Chetana gets wrong</strong>
                    <p>
                      Ordinary feedback sent no message text. This separate opt-in sends extracted text for automatic identifier redaction, then holds it in quarantine for at most 90 days. It cannot enter the benchmark until two reviewers agree.
                    </p>
                    <p className="v0-research-warning">Automatic redaction may miss names. Do not donate examples containing names, passwords, full IDs, card details, or private account information.</p>
                    {researchStatus && <small aria-live="polite">{researchStatus}</small>}
                  </div>
                  {!researchReceipt ? (
                    <div className="v0-research-controls">
                      <label>
                        <input
                          type="checkbox"
                          checked={researchConsent}
                          onChange={(event) => setResearchConsent(event.target.checked)}
                        />
                        I understand and consent to donating this redacted example for Chetana research.
                      </label>
                      <button
                        type="button"
                        onClick={() => { void donateResearchCandidate(); }}
                        disabled={!researchConsent || researchSubmitting}
                      >
                        <Shield size={15} />
                        {researchSubmitting ? "Preparing..." : "Donate redacted example"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="v0-research-delete"
                      onClick={() => { void deleteResearchCandidate(); }}
                      disabled={researchSubmitting}
                    >
                      <X size={15} />
                      {researchSubmitting ? "Deleting..." : "Delete my donation"}
                    </button>
                  )}
                </div>
              )}

              {actionRoute && (
                <div className={`v0-action-route ${actionRoute.primary_action.urgency}`}>
                  <div className="v0-action-route-copy">
                    <div className="v0-section-label">Do this now</div>
                    <strong>{actionRoute.headline}</strong>
                    <p>{actionRoute.reason}</p>
                  </div>
                  <div className="v0-action-route-controls">
                    <button
                      className="v0-action-primary"
                      onClick={() => {
                        void runActionRouteStep(actionRoute.primary_action);
                      }}
                    >
                      {actionStepIcon(actionRoute.primary_action, 16)}
                      {actionRoute.primary_action.action_label}
                    </button>
                    {actionRoute.secondary_actions.length > 0 && (
                      <div className="v0-action-secondary">
                        {actionRoute.secondary_actions.map((step) => (
                          <button
                            key={step.route_id}
                            onClick={() => {
                              void runActionRouteStep(step);
                            }}
                          >
                            {actionStepIcon(step, 14)}
                            {step.action_label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="v0-action-note">{actionRoute.official_note}</p>
                </div>
              )}

              {result.verdict === "high_risk" && (
                <div className="v0-money-flow">
                  <div className="v0-money-flow-copy">
                    <div className="v0-section-label">One question</div>
                    <strong>Did you send money, share an OTP, or give screen access?</strong>
                    <p>This decides whether Chetana should stay in prevention mode or switch you into recovery steps.</p>
                  </div>
                  <div className="v0-choice-row" role="group" aria-label="Choose incident state">
                    <button
                      className={moneyMovedAnswer === "yes" ? "v0-choice-button active" : "v0-choice-button"}
                      onClick={() => {
                        setMoneyMovedAnswer("yes");
                        setCasePacketCopied(false);
                      }}
                    >
                      Yes, show recovery checklist
                    </button>
                    <button
                      className={moneyMovedAnswer === "no" ? "v0-choice-button active" : "v0-choice-button"}
                      onClick={() => {
                        setMoneyMovedAnswer("no");
                        setCasePacketCopied(false);
                      }}
                    >
                      No, report the message
                    </button>
                  </div>

                  {moneyMovedAnswer === "yes" && (
                    <div className="v0-case-checklist">
                      <strong>Have this ready before you call or file.</strong>
                      <div className="v0-case-grid">
                        {casePacketRows.map((row) => (
                          <div className="v0-case-row" key={row.label}>
                            <span>{row.label}</span>
                            <strong>{row.value}</strong>
                            <small>{row.hint}</small>
                          </div>
                        ))}
                      </div>
                      <div className="v0-inline-actions">
                        <button onClick={copyCasePacket}>
                          <Copy size={14} /> {casePacketCopied ? "Copied report summary" : "Copy report summary"}
                        </button>
                        <a
                          href="tel:1930"
                          onClick={() => trackReportAction("call_1930", { href: "tel:1930" })}
                        >
                          <Phone size={14} /> Call 1930
                        </a>
                        <a
                          href="https://cybercrime.gov.in"
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => trackReportAction("cybercrime_portal", { href: "https://cybercrime.gov.in" })}
                        >
                          <ExternalLink size={14} /> Open cybercrime.gov.in
                        </a>
                      </div>
                    </div>
                  )}

                  {moneyMovedAnswer === "no" && (
                    <div className="v0-case-checklist v0-prevention-checklist">
                      <strong>No money moved yet.</strong>
                      <p>Do not reply, click, pay, scan, install, approve a collect request, or share codes. If it arrived by call, SMS, or WhatsApp, report the communication on Chakshu, then block the sender.</p>
                      <div className="v0-inline-actions">
                        <a
                          href={CHAKSHU_URL}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => trackReportAction("chakshu", { href: CHAKSHU_URL })}
                        >
                          <ExternalLink size={14} /> Open Chakshu
                        </a>
                        <button onClick={clearResult}>
                          <ArrowRight size={14} /> Check another message
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {result.can_improve_scan && file && mode !== "text" && (
                <div className="v0-improve-panel">
                  <div>
                    <div className="v0-section-label">Improve scan</div>
                    <strong>Try stronger text extraction</strong>
                    <p>
                      Chetana can send this screenshot for stronger text extraction. Do not use this for private IDs, passwords, or bank statements.
                    </p>
                    {improveError && <p className="v0-improve-error">{improveError}</p>}
                  </div>
                  <button className="v0-submit" onClick={runImproveScan} disabled={improving}>
                    {improving ? "Improving..." : "Improve scan"}
                    <Shield size={16} />
                  </button>
                </div>
              )}

              <div className="v0-report-card">
                <div className="v0-section-label">Guided response</div>
                <strong>{result.guidance.calm_script}</strong>
                <div className="v0-secondary-grid">
                  <div className="v0-evidence-card">
                    <div className="v0-section-label">Do now</div>
                    <ul className="v0-mini-list">
                      {result.guidance.do_now.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="v0-evidence-card">
                    <div className="v0-section-label">If you already acted</div>
                    <ul className="v0-mini-list">
                      {result.guidance.if_already_acted.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <p className="v0-note">{result.guidance.false_positive_recovery}</p>
              </div>

              {result.verdict !== "low_signal" && (
                <div className="v0-report-card v0-primary-support-card">
                  <div className="v0-section-label">Official help</div>
                  <strong>If money moved already, call 1930 first.</strong>
                  <p>
                    If this is only a suspicious call, SMS, or WhatsApp message and no money moved, report the communication on Chakshu.
                    If money, codes, or account access were exposed, use 1930 and cybercrime.gov.in first.
                  </p>
                  <p className="v0-report-script">{reportScript(result)}</p>
                  <div className="v0-inline-actions">
                    <a
                      href="tel:1930"
                      onClick={() => trackReportAction("call_1930", { href: "tel:1930" })}
                    >
                      <Phone size={14} /> Call 1930
                    </a>
                    <a
                      href="https://cybercrime.gov.in"
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => trackReportAction("cybercrime_portal", { href: "https://cybercrime.gov.in" })}
                    >
                      <ExternalLink size={14} /> Open cybercrime.gov.in
                    </a>
                    <a
                      href={CHAKSHU_URL}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => trackReportAction("chakshu", { href: CHAKSHU_URL })}
                    >
                      <ExternalLink size={14} /> Open Chakshu
                    </a>
                  </div>
                </div>
              )}

              <button className="v0-details-toggle" onClick={() => setDetailsOpen((current) => !current)}>
                <FileText size={14} />
                {detailsOpen ? "Hide share, save, and proof details" : "Show share, save, and proof details"}
              </button>
              {detailsOpen && (
                <div className="v0-details">
                  {(result.share_shield_eligible || evidence) && (
                    <div className="v0-secondary-grid">
                      {result.share_shield_eligible && (
                        <div className="v0-share-card">
                          <div className="v0-section-label">Share this warning</div>
                          <strong>
                            {result.verdict === "high_risk"
                              ? "High-risk warning ready"
                              : result.verdict === "caution"
                                ? "Caution note ready"
                                : "Needs review note ready"}
                          </strong>
                          <p className="v0-share-preview">{shareText}</p>
                          <div className="v0-inline-actions">
                            <button onClick={copyShareShield}>
                              <Copy size={14} /> {shareCopied ? "Copied" : "Copy warning"}
                            </button>
                            <button onClick={shareOnWhatsApp}>
                              <Phone size={14} /> WhatsApp
                            </button>
                          </div>
                        </div>
                      )}
                      {evidence && (
                        <div className="v0-evidence-card">
                          <div className="v0-section-label">Save details</div>
                          <strong>Download the basic report while the trail is still fresh.</strong>
                          <p>{evidence.scan_summary}</p>
                          <div className="v0-inline-actions">
                            <button onClick={saveEvidence}>
                              <Download size={14} /> Download report
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {trustBundle && (
                    <div className="v0-trust-grid">
                      <div className="v0-trust-card">
                        <div className="v0-section-label">Send Guard</div>
                        <div className={`v0-decision-chip ${trustBundle.send_guard.decision.toLowerCase()}`}>
                          {sendGuardDecisionLabel(trustBundle.send_guard.decision)}
                        </div>
                        <p>
                          Risk score: <strong>{trustBundle.send_guard.risk_score}</strong>
                        </p>
                        <ul className="v0-mini-list">
                          {trustBundle.send_guard.decision_reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                        {trustBundle.send_guard.manipulation_signals.length > 0 && (
                          <>
                            <strong>Manipulation signals</strong>
                            <div className="v0-preview-chips">
                              {trustBundle.send_guard.manipulation_signals.map((signal) => (
                                <span key={signal} className="v0-preview-chip">{signal}</span>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      {trustBundle.merchant_release && (
                        <div className="v0-trust-card">
                          <div className="v0-section-label">Merchant Guard</div>
                          <div className={`v0-decision-chip ${trustBundle.merchant_release.decision.toLowerCase()}`}>
                            {merchantDecisionLabel(trustBundle.merchant_release.decision)}
                          </div>
                          <p>
                            Proof score: <strong>{trustBundle.merchant_release.proof_score}</strong> · Risk score:{" "}
                            <strong>{trustBundle.merchant_release.risk_score}</strong>
                          </p>
                          {trustBundle.merchant_release.hold_until_utc && (
                            <p>Hold until: {new Date(trustBundle.merchant_release.hold_until_utc).toLocaleString()}</p>
                          )}
                          <ul className="v0-mini-list">
                            {trustBundle.merchant_release.decision_reasons.map((reason) => (
                              <li key={reason}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {trustBundle.recovery_packet && (
                        <div className="v0-trust-card">
                          <div className="v0-section-label">Recovery Contract</div>
                          <strong>{incidentTypeLabel(trustBundle.recovery_packet.incident_type)}</strong>
                          <p>
                            Urgency: <strong>{trustBundle.recovery_packet.urgency}</strong> · {incidentStateLabel(trustBundle.recovery_packet.incident_state)} · {evidenceStateLabel(trustBundle.recovery_packet.evidence_state)}
                          </p>
                          <p>{trustBundle.recovery_packet.summary}</p>
                          <ul className="v0-mini-list">
                            {trustBundle.recovery_packet.immediate_actions.map((action) => (
                              <li key={action}>{action}</li>
                            ))}
                          </ul>
                          <div className="v0-rail-list">
                            {trustBundle.recovery_packet.official_rails.map((rail) => {
                              const href = rail.contact?.startsWith("http")
                                ? rail.contact
                                : rail.contact
                                  ? `tel:${rail.contact}`
                                  : rail.official_url;
                              return (
                                <div className="v0-rail-item" key={rail.rail_id}>
                                  <strong>{rail.name}</strong>
                                  <span>{rail.channel.replace(/_/g, " ")}</span>
                                  <a
                                    href={href}
                                    target={href.startsWith("http") ? "_blank" : undefined}
                                    rel="noreferrer"
                                    onClick={() => trackReportAction(
                                      OFFICIAL_RAIL_EVENT_SURFACES[rail.rail_id] || `official_${rail.rail_id.toLowerCase()}`,
                                      {
                                        href,
                                        officialRailId: rail.rail_id,
                                      },
                                    )}
                                  >
                                    {rail.contact || rail.official_url}
                                  </a>
                                </div>
                              );
                            })}
                          </div>
                          <p className="v0-report-script">{trustBundle.recovery_packet.handoff_script}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {mirrorProofReceipt && (
                    <div className="v0-proof-details">
                      <div>
                        <div className="v0-section-label">MirrorProof</div>
                        <strong>Signed assessment receipt</strong>
                        <p>
                          Proves receipt integrity and the Chetana issuer key. It does not prove the sender,
                          message, or assessment is factually true.
                        </p>
                      </div>
                      <div className="v0-proof-scope">
                        <div>
                          <strong>Checked</strong>
                          <ul className="v0-mini-list">
                            {mirrorProofReceipt.scope.checked.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
                          </ul>
                        </div>
                        <div>
                          <strong>Not checked</strong>
                          <ul className="v0-mini-list">
                            {mirrorProofReceipt.scope.unchecked.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
                          </ul>
                        </div>
                      </div>
                      <div className="v0-inline-actions">
                        <button type="button" onClick={copyMirrorProof}>
                          <Copy size={14} /> {mirrorProofCopied ? "Receipt copied" : "Copy receipt"}
                        </button>
                        <a href="https://id.activemirror.ai/trust/" target="_blank" rel="noreferrer">
                          <ExternalLink size={14} /> Open verifier
                        </a>
                      </div>
                    </div>
                  )}

                  {resultEntitySections.length > 0 && (
                    <div className="v0-entity-grid">
                      {resultEntitySections.map((section) => (
                        <div key={section.label} className="v0-entity-card">
                          <strong>{section.label}</strong>
                          <ul>
                            {section.values.map((value) => (
                              <li key={value}>{value}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

                  {result.verdict !== "low_signal" && (suspectLookupState.hasDirectoryTargets || suspectLookupState.hasWebsiteTargets) && (
                    <div className="v0-evidence-card v0-context-card">
                      <div className="v0-section-label">Official suspect lookup</div>
                      <strong>Cross-check the identifier in NCRP before you trust it or forward it.</strong>
                      <p>
                        The NCRP suspect repository is complaint-based, not definitive truth, but it is an official second check for phone numbers, UPI IDs, and suspicious websites.
                      </p>
                      <div className="v0-inline-actions">
                        {suspectLookupState.hasDirectoryTargets && (
                          <button
                            onClick={() => openOfficialExternal(
                              NCRP_SUSPECT_REPOSITORY_URL,
                              "ncrp_suspect_repository",
                              { reportTarget: "other" },
                            )}
                          >
                            <ExternalLink size={14} /> Check mobile / UPI
                          </button>
                        )}
                        {suspectLookupState.hasWebsiteTargets && (
                          <button
                            onClick={() => openOfficialExternal(
                              NCRP_SUSPECT_WEBSITES_URL,
                              "ncrp_suspect_websites",
                              { reportTarget: "other" },
                            )}
                          >
                            <ExternalLink size={14} /> Check website / app
                          </button>
                        )}
                        <button onClick={() => openOfficialExternal(NCRP_REPORT_SUSPECT_URL, "ncrp_report_suspect")}>
                          <ExternalLink size={14} /> Report suspect to I4C
                        </button>
                      </div>
                    </div>
                  )}
                  {result.notes && <p className="v0-note">{result.notes}</p>}

                  {result.verdict === "low_signal" && (
                    <div className="v0-evidence-card v0-context-card">
                      <div className="v0-section-label">After the urgent part</div>
                      <strong>Want stronger protection across tools?</strong>
                      <p>Create a Mirror Seed after you have handled the immediate risk. It carries trusted context and safer defaults across future checks.</p>
                      <div className="v0-inline-actions">
                        <a href="https://id.activemirror.ai/" target="_blank" rel="noreferrer">
                          <ExternalLink size={14} /> Create Mirror Seed
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {showHero && (
          <div className="v0-proof-strip" aria-label="Chetana proof points">
            <span>
              <strong>No external voice API</strong>
              Raw voice is deleted after transcription on Chetana's own host.
            </span>
            <span>
              <strong>Official rails visible</strong>
              1930, cybercrime.gov.in, and Chakshu stay one tap away.
            </span>
            <span>
              <strong>Partner-ready</strong>
              Pilots can measure pauses, handoffs, languages, and recovery packets.
            </span>
          </div>
        )}

        <div className="v0-recovery-strip">
          <span>If money already moved, stop chatting and use official help.</span>
          <a href="tel:1930"><Phone size={14} /> Call 1930</a>
          {onNavigate && (
            <button onClick={() => onNavigate("panic")}>
              <Shield size={14} /> Help steps
            </button>
          )}
        </div>
      </div>

      {/* glow-overlay removed — clean background */}
    </section>
  );
}
