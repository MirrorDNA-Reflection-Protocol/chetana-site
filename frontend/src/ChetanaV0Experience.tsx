import { useEffect, useMemo, useRef, useState } from "react";
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
  V0Mode,
  V0EvidencePack,
  V0EventName,
  V0TrustBundle,
  V0Verdict,
  actionCopy,
  confidenceLabel,
  downloadJson,
  entitySections,
  extractTextForMode,
  getOrCreateV0SessionId,
  incidentTypeLabel,
  merchantDecisionLabel,
  reportScript,
  scamTypeLabel,
  sendGuardDecisionLabel,
  shareShieldText,
  trackV0Event,
  verdictLabel,
  verdictSummary,
  V0_MODE_CARDS,
} from "./chetanaV0";
import ChetanaResultScreen, { riskFromVerdict } from "./ChetanaResultScreen";

const DEFAULT_PROMPTS: Record<V0Mode, string> = {
  text: "Paste the suspicious message, link, or UPI request here.",
  screenshot: "Upload the screenshot. Add a note only if it helps.",
  qr_image: "Upload the QR screenshot or paste the payment payload you can read.",
  payment_screenshot: "Upload the payment screenshot. Add any note that explains the context.",
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

const RESULT_PREVIEW_REASONS = [
  "Suspicious payment request",
  "Urgency language",
  "Unknown sender",
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
  const composerRef = useRef<HTMLDivElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const [sessionId] = useState(() => getOrCreateV0SessionId());
  const [mode, setMode] = useState<V0Mode>(presetMode || (initialFile ? "screenshot" : "text"));
  const [text, setText] = useState(initialInput || "");
  const [file, setFile] = useState<File | null>(initialFile || null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready when you are.");
  const [result, setResult] = useState<V0Verdict | null>(null);
  const [evidence, setEvidence] = useState<V0EvidencePack | null>(null);
  const [trustBundle, setTrustBundle] = useState<V0TrustBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    }).catch(() => {});
  }, [sessionId]);

  const hero = useMemo(() => HERO_COPY[mode], [mode]);
  const shareText = result ? shareShieldText(result) : "";
  const evidenceName = result ? `chetana-evidence-${result.scan_id}.json` : "chetana-evidence.json";
  const resultEntitySections = useMemo(() => entitySections(result?.entities), [result?.entities]);

  const resetScanState = (nextStatus = "Ready when you are.") => {
    setResult(null);
    setEvidence(null);
    setTrustBundle(null);
    setError(null);
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
      const extracted = await extractTextForMode(mode, file, text);
      if (!extracted) {
        throw new Error("Please paste the message or upload an image first.");
      }

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
        }).catch(() => {});
      }
      localStorage.setItem("chetana_v0_scan_count", String(previousCount + 1));
      localStorage.setItem("chetana_v0_last_scan_at", String(Date.now()));

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
          setEvidence(evidenceData.evidence_pack);
        }
      }

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
          setTrustBundle(trustData.trust_bundle);
        }
      } catch {
        // The scan result is still useful even if the trust bundle request fails.
      }

      setStatus("Done. Read this before you reply or pay.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Chetana could not complete the check right now.";
      setError(message);
      setStatus("Could not finish the check.");
    } finally {
      setLoading(false);
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
    } else {
      window.open("https://cybercrime.gov.in", "_blank", "noopener");
    }
    void trackV0Event({
      event_name: "report_tapped",
      session_id: sessionId,
      scan_id: result.scan_id,
      input_type: result.input_type,
      verdict: result.verdict,
      report_target: "manual_report",
      device_class: deviceClass(),
      language_hint: result.language_hint || navigator.language.slice(0, 2),
    }).catch(() => {});
  };

  const clearResult = () => {
    setText("");
    setFile(null);
    resetScanState();
    window.requestAnimationFrame(scrollToComposer);
  };

  return (
    <section className="v0-shell">
      {showHero && (
        <div className="v0-hero-shell">
          <div className="v0-hero-panel">
            <div className="v0-hero">
              <div className="v0-kicker">{hero.kicker}</div>
              <h1>
                <span className="v0-hero-line">{hero.title}</span>
              </h1>
              <p>{hero.body}</p>
              <div className="v0-hero-actions">
                <button className="v0-submit" onClick={scrollToComposer}>
                  Check a message
                  <ArrowRight size={16} />
                </button>
                <button className="v0-ghost-button" onClick={loadSample}>
                  Try an example
                </button>
              </div>
              <div className="v0-trust-strip">
                {FRONT_DOOR_TRUST.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>

            <div className="v0-metric-grid">
              {FRONT_DOOR_METRICS.map((item) => (
                <div key={item.label} className="v0-metric-card">
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="v0-hero-visual-stack">
            <div className="v0-hero-photo-card">
              <img
                src="/01-hero-grandmother.png"
                alt="Woman checking a suspicious message on her phone"
                className="v0-hero-photo"
              />
              <div className="v0-hero-photo-copy">
                <div className="v0-section-label">Built for real panic, not ideal users</div>
                <strong>Messages, QR requests, screenshots, and fake payment proof.</strong>
                <p>Start with the smallest safe move. Escalate fast if money already moved.</p>
              </div>
            </div>

            <div className="v0-hero-proof-grid">
              {HERO_CASES.map((item) => (
                <article key={item.title} className="v0-hero-proof-card">
                  <img src={item.image} alt={item.title} />
                  <div className="v0-hero-proof-copy">
                    <strong>{item.title}</strong>
                    <p>{item.body}</p>
                    {item.mode ? (
                      <button onClick={() => openModeLane(item.mode!)}>
                        {item.actionLabel}
                        <ArrowRight size={14} />
                      </button>
                    ) : (
                      <a href={item.href} target="_blank" rel="noreferrer">
                        {item.actionLabel}
                        <ArrowRight size={14} />
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className={`v0-grid${result ? " v0-grid-result" : ""}`}>
        <div className="v0-main">
          <div className="v0-mode-grid">
            {V0_MODE_CARDS.map((card) => {
              const active = card.mode === mode;
              const icon =
                card.mode === "text"
                  ? <Type size={18} />
                  : card.mode === "screenshot"
                  ? <ImageIcon size={18} />
                  : card.mode === "qr_image"
                  ? <QrCode size={18} />
                  : <CreditCard size={18} />;
              return (
                <button
                  key={card.mode}
                  className={`v0-mode-card${active ? " active" : ""}`}
                  onClick={() => selectMode(card.mode)}
                >
                  <div className="v0-mode-top">
                    <span className="v0-mode-icon">{icon}</span>
                    <span className="v0-mode-label">{card.label}</span>
                  </div>
                  <strong>{card.title}</strong>
                  <p>{card.description}</p>
                </button>
              );
            })}
          </div>

          <div className="v0-composer" id="chetana-scan-box" ref={composerRef}>
            <div className="v0-composer-head">
              <div>
                <div className="v0-section-label">Scan box</div>
                <h2>{hero.title}</h2>
                <p className="v0-composer-copy">{hero.body}</p>
              </div>
              <div className="v0-status">{status}</div>
            </div>

            <div className="v0-quick-row">
              <button className="v0-quick-chip" onClick={loadSample}>
                Try an example
              </button>
              {mode === "text" && (
                <span className="v0-quick-note">You can paste a link, UPI ID, or payment request here too.</span>
              )}
            </div>

            <label className="v0-input-label">
              {mode === "text" ? "Paste the message" : "Add any visible text or context"}
            </label>
            <textarea
              className="v0-textarea"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={DEFAULT_PROMPTS[mode]}
              rows={mode === "text" ? 7 : 4}
            />

            {mode !== "text" && (
              <>
                <label className="v0-input-label">Upload an image</label>
                <label className="v0-upload">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                  />
                  <span className="v0-upload-inner">
                    <Upload size={18} />
                    {file ? file.name : "Choose an image"}
                  </span>
                </label>
              </>
            )}

            <div className="v0-composer-foot">
              <div className="v0-limit-note">
                Private advisory tool. Not a government service. If money moved already, call 1930 first and contact your bank right away.
              </div>
              <button className="v0-submit" onClick={runScan} disabled={loading}>
                {loading ? "Checking..." : "Check now"}
                <ArrowRight size={16} />
              </button>
            </div>
            {error && <div className="v0-error">{error}</div>}
          </div>

          {showHero && !result && (
            <div className="v0-founder-card">
              <div className="v0-section-label">Proof and demos</div>
              <div className="v0-founder-media">
                <video
                  className="v0-founder-video"
                  src="/founder-intro.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="metadata"
                />
                <div className="v0-founder-copy">
                  <strong>Don&apos;t guess. Don&apos;t click. Don&apos;t pay.</strong>
                  <p>Just scan it with Chetana. Check karo, pause karo.</p>
                  <span>Built for families, workers, and shopkeepers who need a fast second opinion.</span>
                  <div className="v0-inline-actions">
                    <a href="/founder-intro.mp4" target="_blank" rel="noreferrer">
                      <ExternalLink size={14} /> Watch founder intro
                    </a>
                    <a href="/chetana_short_final.mp4" target="_blank" rel="noreferrer">
                      <ExternalLink size={14} /> Watch demo short
                    </a>
                    <button onClick={() => openModeLane("payment_screenshot")}>
                      <CreditCard size={14} /> Check payment proof
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {result && (
            <div ref={resultRef} className={`v0-result-card ${result.verdict}`}>
              <ChetanaResultScreen
                risk={riskFromVerdict(result.verdict)}
                summary={verdictSummary(result)}
                reasons={result.reasons.map((r) => r.label)}
                onEmergencyHelp={openReportRail}
                onCheckAnother={clearResult}
                onToggleBreakdown={() => setShowFullBreakdown((current) => !current)}
                showFullBreakdown={showFullBreakdown}
              />

              {result.verdict !== "low_signal" && (
                <div className="v0-report-card v0-primary-support-card">
                  <div className="v0-section-label">Official help</div>
                  <strong>If money moved already, call 1930 first.</strong>
                  <p>Then contact your bank and finish the report on cybercrime.gov.in. Do not keep arguing with the scammer.</p>
                  <p className="v0-report-script">{reportScript(result)}</p>
                  <div className="v0-inline-actions">
                    <a href="tel:1930">
                      <Phone size={14} /> Call 1930
                    </a>
                    <a href="https://cybercrime.gov.in" target="_blank" rel="noreferrer">
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
                                  <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
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
                  {result.notes && <p className="v0-note">{result.notes}</p>}

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
                </div>
              )}
            </div>
          )}
        </div>

        {!result && (
          <aside className="v0-side">
            <div className="v0-side-card v0-preview-card">
              <div className="v0-section-label">Result preview</div>
              <strong>What a high-risk result looks like</strong>
              <div className="v0-badge high_risk">
                <ShieldAlert size={14} />
                High risk
              </div>
              <div className="v0-preview-chips">
                {RESULT_PREVIEW_REASONS.map((reason) => (
                  <span key={reason} className="v0-preview-chip">{reason}</span>
                ))}
              </div>
              <p>Next step: warn family before anyone clicks or pays.</p>
            </div>

          <div className="v0-side-card danger">
            <div className="v0-section-label">If money already went</div>
            <strong>Do not waste time proving the scammer wrong.</strong>
            <ul>
              <li>Call 1930 immediately.</li>
              <li>Call your bank and ask for a freeze or block if needed.</li>
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

          <div className="v0-side-card">
            <div className="v0-section-label">What Chetana checks</div>
            <strong>Messages, links, QR requests, UPI payment requests, screenshots, and payment proof.</strong>
            <ul>
              <li>WhatsApp, SMS, Telegram, email, and suspicious links.</li>
              <li>QR screenshots and payment requests before you scan.</li>
              <li>Payment screenshots before you hand over goods.</li>
              <li>Common India-facing scam patterns that pressure people to act fast.</li>
            </ul>
            <div className="v0-inline-actions">
              <button onClick={() => openModeLane("payment_screenshot")}>
                <CreditCard size={14} /> Payment proof lane
              </button>
              <button onClick={() => openModeLane("qr_image")}>
                <QrCode size={14} /> QR request check
              </button>
            </div>
          </div>

          <div className="v0-side-card">
            <div className="v0-section-label">How it works</div>
            <strong>Rules first. Model help only when the input is messy or visual.</strong>
            <ul>
              <li>Chetana returns four evidence states: high risk, caution, needs review, or low signal.</li>
              <li>Low signal does not mean safe. It means the current material was too thin for a stronger call.</li>
              <li>The result explains why and gives the next safest action.</li>
              <li>You can share a warning or save the evidence while details are fresh.</li>
            </ul>
            {onNavigate && (
              <div className="v0-inline-actions">
                <button onClick={() => onNavigate("trust")}>
                  <FileText size={14} /> How it works
                </button>
                <a href="/chetana_short_final.mp4" target="_blank" rel="noreferrer">
                  <ExternalLink size={14} /> Watch demo
                </a>
              </div>
            )}
          </div>
          </aside>
        )}
      </div>

      {showHero && !result && (
        <button className="v0-mobile-cta" onClick={scrollToComposer}>
          Check a message
          <ArrowRight size={16} />
        </button>
      )}

      {/* Redesign 2026-04: Feature strip */}
      {showHero && !result && (
        <div className="feature-strip">
          {[
            { icon: "🆓", label: "Always free" },
            { icon: "🔒", label: "Private" },
            { icon: "🇮🇳", label: "12 Languages" },
            { icon: "⚡", label: "Instant" },
            { icon: "🤖", label: "AI-powered" },
          ].map((f) => (
            <div className="feature-strip-item" key={f.label}>
              <div className="feature-strip-icon">{f.icon}</div>
              <div className="feature-strip-text">{f.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Redesign 2026-04: Emergency helpline bar */}
      <div className="emergency-bar">
        Need help now?{" "}
        <a href="tel:1930">Cybercrime Helpline 1930</a> ·{" "}
        <a href="https://cybercrime.gov.in" target="_blank" rel="noopener noreferrer">cybercrime.gov.in</a> ·{" "}
        <a href="tel:181">Women Helpline 181</a>
      </div>

      {!result && (
        <a
          href="https://wa.me/?text=Check%20suspicious%20messages%20free%20at%20chetana.activemirror.ai%20%F0%9F%9B%A1%EF%B8%8F%20Works%20in%2012%20Indian%20languages."
          target="_blank"
          rel="noopener noreferrer"
          className="wa-float"
          aria-label="Share on WhatsApp"
        >
          <svg viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.75.75 0 00.917.918l4.462-1.496A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.24 0-4.326-.735-6.012-1.978l-.42-.312-2.647.888.886-2.644-.343-.433A9.961 9.961 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z" />
          </svg>
        </a>
      )}

      {/* Redesign 2026-04: Ambient glow */}
      <div className="glow-overlay" />
    </section>
  );
}
