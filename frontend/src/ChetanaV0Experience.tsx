import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  ImageIcon,
  Phone,
  QrCode,
  Shield,
  ShieldAlert,
  Type,
  Upload,
} from "lucide-react";
import { PageId } from "./types";
import {
  V0ActionRoute,
  V0ActionStep,
  V0Mode,
  V0EvidencePack,
  V0EventName,
  V0LoopReceipt,
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
  V0_MODE_CARDS,
} from "./chetanaV0";
import ChetanaResultScreen, { riskFromVerdict } from "./ChetanaResultScreen";

const DEFAULT_PROMPTS: Record<V0Mode, string> = {
  text: "Paste the suspicious message, link, or UPI request here.",
  screenshot: "Upload the screenshot. Add a note only if it helps.",
  qr_image: "Upload the QR screenshot or paste the payment payload you can read.",
  payment_screenshot: "Upload the payment screenshot. Add any note that explains the context.",
};

const COMPOSER_COPY: Record<V0Mode, { title: string; body: string }> = {
  text: {
    title: "Paste the message, link, or payment request",
    body: "Add the exact message if you can. Extra context is optional, not required.",
  },
  screenshot: {
    title: "Upload the screenshot and add any useful context",
    body: "Use this when the suspicious content is already on your screen or mixed into a longer chat.",
  },
  qr_image: {
    title: "Upload the QR image or paste the payment payload",
    body: "Use whatever detail you can read before you scan, pay, or share it forward.",
  },
  payment_screenshot: {
    title: "Upload the payment proof before you trust it",
    body: "This lane is for merchants, delivery staff, sellers, and anyone verifying a transfer screenshot.",
  },
};

const HERO_COPY: Record<V0Mode, { kicker: string; title: string; body: string }> = {
  text: {
    kicker: "FREE SCAM CHECKER FOR INDIA",
    title: "Got a suspicious message? Check it now.",
    body: "Paste any SMS, WhatsApp forward, link, UPI ID, phone number, or upload a screenshot. Chetana explains the risk and the safest next step without pretending certainty.",
  },
  screenshot: {
    kicker: "FREE SCAM CHECKER FOR INDIA",
    title: "Upload the screenshot and see what risk signals show up.",
    body: "Useful when the message is already on your phone screen or came through WhatsApp, SMS, or email.",
  },
  qr_image: {
    kicker: "FREE SCAM CHECKER FOR INDIA",
    title: "Check the QR or payment payload before you scan and pay.",
    body: "Upload the QR image or paste the payment payload you can read.",
  },
  payment_screenshot: {
    kicker: "FREE SCAM CHECKER FOR INDIA",
    title: "Check payment proof before you hand over goods.",
    body: "Built for shopkeepers, delivery staff, and sellers who need a fast second opinion.",
  },
};

const FRONT_DOOR_TRUST = [
  "Free",
  "No login",
  "Built for India",
];

const FRONT_DOOR_METRICS: Array<{ value: string; label: string }> = [
  { value: "12", label: "Indian languages" },
  { value: "4", label: "evidence states" },
  { value: "1930", label: "recovery first step" },
  { value: "0", label: "sign-up required" },
];

const HERO_CASES: Array<{
  title: string;
  body: string;
  image: string;
  actionLabel: string;
  mode?: V0Mode;
  href?: string;
}> = [
  {
    title: "Suspicious message check",
    body: "Paste the message, link, or bank scare text and get the safest next move.",
    image: "/01-hero-grandmother.png",
    actionLabel: "Start text check",
    mode: "text",
  },
  {
    title: "Payment proof lane",
    body: "Use the merchant lane before you hand over goods or trust a screenshot.",
    image: "/04-safe-hands.png",
    actionLabel: "Check payment proof",
    mode: "payment_screenshot",
  },
  {
    title: "Demo short",
    body: "Watch the live product reel instead of guessing from a static page.",
    image: "/03-family-kitchen.png",
    actionLabel: "Watch demo",
    href: "/chetana_short_final.mp4",
  },
];

const SAMPLE_SCAM_TEXT =
  "Urgent: your bank KYC will expire today. Update now to avoid account block and pay Rs 499 immediately. https://secure-kyc-update.top/verify";

const NCRP_SUSPECT_REPOSITORY_URL = "https://www.cybercrime.gov.in/Webform/suspect_search_repository.aspx";
const NCRP_SUSPECT_WEBSITES_URL = "https://www.cybercrime.gov.in/Webform/suspect_search_websites.aspx";
const NCRP_REPORT_SUSPECT_URL = "https://www.cybercrime.gov.in/Webform/cyber_suspect.aspx";
const OFFICIAL_RAIL_EVENT_SURFACES: Record<string, string> = {
  BANK_APP_SUPPORT: "bank_app_support",
  CYBER_HELPLINE_1930: "call_1930",
  NCRP_PORTAL: "cybercrime_portal",
  RBI_CMS: "rbi_cms",
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

type RecoveryActionOptions = {
  reportTarget?: "manual_report" | "other";
  recoveryStep?: string;
  recoveryChannel?: string;
  officialRailId?: string;
  href?: string;
};

const RESULT_PREVIEW_REASONS = [
  "Suspicious payment request",
  "Urgency language",
  "Unknown sender",
];

const SIMPLE_STEPS = [
  { label: "1", title: "Screenshot it", body: "Chat, SMS, email, QR, profile, link, payment proof." },
  { label: "2", title: "Ask Chetana", body: "Upload it here. Paste text only if that is easier." },
  { label: "3", title: "Act safely", body: "See the risk, why it was flagged, and the safest next step." },
];

const DEMO_FLAGS = ["Urgency", "Payment request", "Unknown link"];
const APP_OPEN_TTL_MS = 30 * 60 * 1000;
const TAP_EVENT_TTL_MS = 4_000;
const EXPORT_EVENT_TTL_MS = 10_000;

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

export default function ChetanaV0Experience({
  onNavigate,
  initialInput,
  initialFile,
  presetMode,
  showHero = true,
}: {
  onNavigate?: (target: PageId) => void;
  initialInput?: string | null;
  initialFile?: File | null;
  presetMode?: V0Mode;
  showHero?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const composerRef = useRef<HTMLDivElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const [sessionId] = useState(() => getOrCreateV0SessionId());
  const defaultMode: V0Mode = presetMode || (initialFile ? "screenshot" : initialInput ? "text" : "screenshot");
  const [mode, setMode] = useState<V0Mode>(defaultMode);
  const [text, setText] = useState(initialInput || "");
  const [file, setFile] = useState<File | null>(initialFile || null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready when you are.");
  const [result, setResult] = useState<V0Verdict | null>(null);
  const [evidence, setEvidence] = useState<V0EvidencePack | null>(null);
  const [trustBundle, setTrustBundle] = useState<V0TrustBundle | null>(null);
  const [actionRoute, setActionRoute] = useState<V0ActionRoute | null>(null);
  const [loopReceipt, setLoopReceipt] = useState<V0LoopReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [improveError, setImproveError] = useState<string | null>(null);
  const [improving, setImproving] = useState(false);
  const [lastExtractedInput, setLastExtractedInput] = useState<V0ExtractedInput | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showFullBreakdown, setShowFullBreakdown] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    if (initialInput) setText(initialInput);
  }, [initialInput]);

  useEffect(() => {
    if (initialFile) {
      setFile(initialFile);
      if (!presetMode) {
        setMode("screenshot");
      }
    }
  }, [initialFile, presetMode]);

  useEffect(() => {
    if (presetMode) setMode(presetMode);
  }, [presetMode]);

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

  const hero = useMemo(() => HERO_COPY[mode], [mode]);
  const composerCopy = useMemo(() => COMPOSER_COPY[mode], [mode]);
  const shareText = result ? shareShieldText(result) : "";
  const evidenceName = result ? `chetana-evidence-${result.scan_id}.json` : "chetana-evidence.json";
  const hasInput = Boolean(text.trim() || file);
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

  const resetScanState = (nextStatus = "Ready when you are.") => {
    setResult(null);
    setEvidence(null);
    setTrustBundle(null);
    setActionRoute(null);
    setLoopReceipt(null);
    setError(null);
    setImproveError(null);
    setImproving(false);
    setLastExtractedInput(null);
    setDetailsOpen(false);
    setShowFullBreakdown(false);
    setShareCopied(false);
    setStatus(nextStatus);
  };

  const selectMode = (nextMode: V0Mode) => {
    setMode(nextMode);
    if (nextMode === "text") {
      setFile(null);
    }
    resetScanState();
  };

  const openModeLane = (nextMode: V0Mode) => {
    selectMode(nextMode);
    window.requestAnimationFrame(scrollToComposer);
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
    setText(SAMPLE_SCAM_TEXT);
    setFile(null);
    resetScanState("Sample loaded. Edit it if you want, then scan.");
    window.requestAnimationFrame(scrollToComposer);
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
        const receiptData = (await receiptResp.json()) as { loop_receipt: V0LoopReceipt };
        setLoopReceipt(receiptData.loop_receipt);
      }
    } catch {
      // The scam-check result stays useful if local receipt recording fails.
    }
  };

  const runScan = async () => {
    setLoading(true);
    resetScanState();
    const started = performance.now();

    try {
      void trackV0Event({
        event_name: "scan_started",
        session_id: sessionId,
        input_type: mode,
        device_class: deviceClass(),
        language_hint: navigator.language.slice(0, 2),
      }).catch(() => {});

      setStatus(mode === "text" ? "Reading the message..." : "Extracting what is visible...");
      const extractedInput = await extractScanInputForMode(mode, file, text);
      const extracted = extractedInput.text;
      if (!extracted) {
        throw new Error("Please paste the message or upload an image first.");
      }
      setLastExtractedInput(extractedInput);

      setStatus("Explaining the risk in plain language...");
      const scanResp = await fetch("/api/v0/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input_type: mode,
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
    resetScanState();
    window.requestAnimationFrame(scrollToComposer);
  };

  return (
    <section className="v0-shell v0-shell-simple">
      {showHero && (
        <div className="v0-simple-hero">
          <div className="v0-simple-copy">
            <h1>Screenshot anything. Ask Chetana.</h1>
            <p>Upload a screenshot or paste a message. Chetana checks the visible risk signals and gives one next safest step.</p>
            <div className="v0-simple-actions">
              <button className="v0-submit" onClick={scrollToComposer}>
                Upload screenshot
                <Upload size={16} />
              </button>
              <button className="v0-ghost-button" onClick={() => openModeLane("text")}>
                Paste text instead
              </button>
            </div>
          </div>

          <motion.div
            className="v0-visual-demo"
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.38, ease: "easeOut" }}
            aria-label="Animated example of asking Chetana about a suspicious screenshot"
          >
            <div className="v0-demo-topline">Screenshot check</div>
            <motion.div
              className="v0-demo-shot"
              animate={reduceMotion ? { y: 0 } : { y: [0, -5, 0] }}
              transition={reduceMotion ? { duration: 0 } : { duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="v0-demo-window">
                <span />
                <span />
                <span />
              </div>
              <strong>Bank KYC expires today</strong>
              <p>Pay Rs 499 now or your account will be blocked.</p>
              <small>secure-kyc-update.top</small>
            </motion.div>
            <motion.div
              className="v0-demo-ask"
              animate={reduceMotion ? { opacity: 1 } : { opacity: [0.72, 1, 0.72] }}
              transition={reduceMotion ? { duration: 0 } : { duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            >
              <Upload size={15} />
              Ask Chetana
              <ArrowRight size={15} />
            </motion.div>
            <motion.div
              className="v0-demo-result"
              animate={reduceMotion ? { scale: 1 } : { scale: [1, 1.012, 1] }}
              transition={reduceMotion ? { duration: 0 } : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            >
              <ShieldAlert size={18} />
              <div>
                <strong>Likely scam</strong>
                <p>Do not pay. Verify in the official bank app.</p>
              </div>
            </motion.div>
            <div className="v0-demo-flags">
              {DEMO_FLAGS.map((flag) => (
                <span key={flag}>
                  <Check size={12} />
                  {flag}
                </span>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="v0-simple-steps"
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.12 } } }}
          >
            {SIMPLE_STEPS.map((step) => (
              <motion.div
                className="v0-simple-step"
                key={step.title}
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  show: { opacity: 1, y: 0 },
                }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              >
                <span>{step.label}</span>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}

      <div className={`v0-grid${result ? " v0-grid-result" : ""}`}>
        <div className="v0-main">
          <div className="v0-composer" id="chetana-scan-box" ref={composerRef}>
            <div className="v0-composer-head">
              <div>
                <div className="v0-section-label">Ask Chetana</div>
                <h2>{mode === "text" ? "Paste the message" : "Upload the screenshot"}</h2>
                <p className="v0-composer-copy">
                  {mode === "text"
                    ? "Paste the suspicious message, link, UPI ID, or payment request."
                    : "Use a screenshot from WhatsApp, SMS, email, a QR code, payment proof, or any suspicious screen."}
                </p>
              </div>
              <div className="v0-status">{status}</div>
            </div>

            <div className="v0-simple-tabs" aria-label="Choose input type">
              <button className={mode !== "text" ? "active" : ""} onClick={() => selectMode("screenshot")}>
                <ImageIcon size={16} />
                Screenshot
              </button>
              <button className={mode === "text" ? "active" : ""} onClick={() => selectMode("text")}>
                <Type size={16} />
                Text
              </button>
            </div>

            {mode !== "text" && (
              <label className="v0-upload v0-upload-large">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                />
                <span className="v0-upload-inner">
                  <Upload size={20} />
                  {file ? file.name : "Choose screenshot"}
                </span>
              </label>
            )}

            <label className="v0-input-label">
              {mode === "text" ? "Paste the message" : "Add a note if needed"}
            </label>
            <textarea
              className="v0-textarea"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={DEFAULT_PROMPTS[mode]}
              rows={mode === "text" ? 6 : 3}
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

              {loopReceipt && (
                <div className={`v0-loop-receipt ${loopReceipt.status}`}>
                  <Shield size={14} />
                  <span>Safety loop recorded</span>
                  <small>{(loopReceipt.chain_head || loopReceipt.iteration_hash).slice(0, 10)}</small>
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
                  <p>Then contact your bank and finish the report on cybercrime.gov.in. Do not keep arguing with the scammer.</p>
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

        <aside className="v0-side">
          {!result && (
            <div className="v0-side-card">
              <div className="v0-section-label">Send any screenshot</div>
              <strong>Chetana can check what is visible and explain the risk in plain language.</strong>
              <ul>
                <li>WhatsApp, SMS, email, Telegram, and suspicious links.</li>
                <li>QR codes, UPI requests, and payment screenshots.</li>
                <li>Profiles, fake notices, delivery messages, or bank warnings.</li>
              </ul>
              <p className="v0-side-note">Installed app: share screenshots into Chetana from the Android share sheet.</p>
              <div className="v0-inline-actions">
                <button onClick={loadSample}>Try example</button>
                <button onClick={() => openModeLane("payment_screenshot")}>
                  <CreditCard size={14} /> Payment proof
                </button>
              </div>
            </div>
          )}

          {/* Emergency card always visible — before and after result */}
          <div className="v0-side-card danger">
            <div className="v0-section-label">If money already went</div>
            <strong>Call 1930 now. Then call your bank.</strong>
            <ul>
              <li>Do not keep chatting with the sender.</li>
              <li>Keep screenshots, transaction IDs, UPI IDs, and call logs.</li>
            </ul>
            <div className="v0-inline-actions">
              <a href="tel:1930"><Phone size={14} /> Call 1930</a>
              {onNavigate && (
                <button onClick={() => onNavigate("panic")}>
                  <Shield size={14} /> Help steps
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>

      <div className="emergency-bar">
        Need help now?{" "}
        <a href="tel:1930">Cybercrime Helpline 1930</a> ·{" "}
        <a href="https://cybercrime.gov.in" target="_blank" rel="noopener noreferrer">cybercrime.gov.in</a> ·{" "}
        <a href="tel:181">Women Helpline 181</a>
      </div>

      {/* glow-overlay removed — clean background */}
    </section>
  );
}
