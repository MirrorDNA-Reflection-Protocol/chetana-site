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
  ShieldCheck,
  Type,
  Upload,
} from "lucide-react";
import { PageId } from "./types";
import {
  V0Mode,
  V0EvidencePack,
  V0EventName,
  V0Verdict,
  actionCopy,
  confidenceLabel,
  downloadJson,
  entitySections,
  extractTextForMode,
  getOrCreateV0SessionId,
  reportScript,
  scamTypeLabel,
  shareShieldText,
  trackV0Event,
  verdictLabel,
  verdictSummary,
  V0_MODE_CARDS,
} from "./chetanaV0";

const DEFAULT_PROMPTS: Record<V0Mode, string> = {
  text: "Paste the suspicious message, link, or UPI request here.",
  screenshot: "Upload the screenshot. Add a note only if it helps.",
  qr_image: "Upload the QR screenshot or paste the payment payload you can read.",
  payment_screenshot: "Upload the payment screenshot. Add any note that explains the context.",
};

const HERO_COPY: Record<V0Mode, { kicker: string; title: string; body: string }> = {
  text: {
    kicker: "Paste message or link",
    title: "Paste the suspicious message, link, or UPI request.",
    body: "Links, UPI IDs, and payment requests can all go in the same box.",
  },
  screenshot: {
    kicker: "Upload screenshot",
    title: "Upload the screenshot and add context only if it helps.",
    body: "Useful when the message is already on your phone screen or came through WhatsApp, SMS, or email.",
  },
  qr_image: {
    kicker: "Check QR request",
    title: "Check the QR or payment payload before you scan and pay.",
    body: "Upload the QR image or paste the payment payload you can read.",
  },
  payment_screenshot: {
    kicker: "Check payment proof",
    title: "Check payment proof before you hand over goods.",
    body: "Built for shopkeepers, delivery staff, and sellers who need a fast second opinion.",
  },
};

const FRONT_DOOR_TRUST = [
  "Free",
  "Privacy-first",
  "Built for India",
  "No signup to start",
];

const SAMPLE_SCAM_TEXT =
  "Urgent: your bank KYC will expire today. Update now to avoid account block and pay Rs 499 immediately. https://secure-kyc-update.top/verify";

const RESULT_PREVIEW_REASONS = [
  "Suspicious payment request",
  "Urgency language",
  "Unknown sender",
];

function eventNameForVerdict(verdict: V0Verdict["verdict"]): V0EventName {
  if (verdict === "risky") return "verdict_risky";
  if (verdict === "unclear") return "verdict_unclear";
  return "verdict_safe";
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
  const [sessionId] = useState(() => getOrCreateV0SessionId());
  const [mode, setMode] = useState<V0Mode>(presetMode || (initialFile ? "screenshot" : "text"));
  const [text, setText] = useState(initialInput || "");
  const [file, setFile] = useState<File | null>(initialFile || null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready when you are.");
  const [result, setResult] = useState<V0Verdict | null>(null);
  const [evidence, setEvidence] = useState<V0EvidencePack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
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

  const resetScanState = (nextStatus = "Ready when you are.") => {
    setResult(null);
    setEvidence(null);
    setError(null);
    setDetailsOpen(false);
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

  const scrollToComposer = () => {
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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

  return (
    <section className="v0-shell">
      {showHero && (
        <div className="v0-hero">
          <div className="v0-kicker">India-first scam check</div>
          <h1>
            <span className="v0-hero-line">Got something suspicious?</span>
            <span className="v0-hero-line v0-hero-accent">Just scan it.</span>
          </h1>
          <p>Check suspicious messages, links, QR codes, UPI/payment requests, and screenshots in seconds.</p>
          <div className="v0-hero-actions">
            <button className="v0-submit" onClick={scrollToComposer}>
              Scan now
              <ArrowRight size={16} />
            </button>
            <button className="v0-ghost-button" onClick={loadSample}>
              Try a sample scam
            </button>
          </div>
          <div className="v0-trust-strip">
            {FRONT_DOOR_TRUST.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
      )}

      <div className="v0-grid">
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
                Try a sample scam
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
                {loading ? "Scanning..." : "Scan now"}
                <ArrowRight size={16} />
              </button>
            </div>
            {error && <div className="v0-error">{error}</div>}
          </div>

          {showHero && !result && (
            <div className="v0-founder-card">
              <div className="v0-section-label">Founder quick intro</div>
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
                  <p>Just scan it with Chetana. Check karo, safe raho.</p>
                  <span>Built for families, workers, and shopkeepers who need a fast second opinion.</span>
                </div>
              </div>
            </div>
          )}

          {result && (
            <div className={`v0-result-card ${result.verdict}`}>
              <div className="v0-result-top">
                <div>
                  <div className={`v0-badge ${result.verdict}`}>
                    {result.verdict === "risky" ? <ShieldAlert size={14} /> : result.verdict === "unclear" ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
                    {verdictLabel(result.verdict)}
                  </div>
                  <h3>{verdictSummary(result)}</h3>
                </div>
                <div className="v0-result-meta">
                  <span>{scamTypeLabel(result.scam_type)}</span>
                  <span>{confidenceLabel(result.confidence_band)}</span>
                </div>
              </div>

              <div className="v0-reason-list">
                {result.reasons.slice(0, 3).map((reason) => (
                  <div key={reason.code} className="v0-reason-card">
                    <strong>{reason.label}</strong>
                    <p>{reason.explanation}</p>
                  </div>
                ))}
              </div>

              <div className="v0-actions-panel">
                <div className="v0-section-label">Safest next steps</div>
                <div className="v0-step-list">
                  {result.recommended_actions.map((action) => {
                    const copy = actionCopy(action);
                    return (
                      <div key={action} className="v0-step-card">
                        <div className="v0-step-icon"><Check size={14} /></div>
                        <div>
                          <strong>{copy.title}</strong>
                          <p>{copy.body}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {(result.share_shield_eligible || evidence) && (
                <div className="v0-secondary-grid">
                  {result.share_shield_eligible && (
                    <div className="v0-share-card">
                      <div className="v0-section-label">Warn someone else</div>
                      <strong>{result.verdict === "risky" ? "Potential scam blocked" : "Pause and verify first"}</strong>
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
                        <button onClick={openReportRail}>
                          <ExternalLink size={14} /> Report or block
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="v0-report-card">
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

              <button className="v0-details-toggle" onClick={() => setDetailsOpen((current) => !current)}>
                <FileText size={14} />
                {detailsOpen ? "Hide details" : "Why did Chetana say this?"}
              </button>
              {detailsOpen && (
                <div className="v0-details">
                  {entitySections(result.entities).length > 0 && (
                    <div className="v0-entity-grid">
                      {entitySections(result.entities).map((section) => (
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
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="v0-side">
          {!result && (
            <div className="v0-side-card v0-preview-card">
              <div className="v0-section-label">Result preview</div>
              <strong>What a risky result looks like</strong>
              <div className="v0-badge risky">
                <ShieldAlert size={14} />
                Risky
              </div>
              <div className="v0-preview-chips">
                {RESULT_PREVIEW_REASONS.map((reason) => (
                  <span key={reason} className="v0-preview-chip">{reason}</span>
                ))}
              </div>
              <p>Next safe step: share with family before anyone clicks or pays.</p>
            </div>
          )}

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
          </div>

          <div className="v0-side-card">
            <div className="v0-section-label">How it works</div>
            <strong>Rules first. Model help only when the input is messy or visual.</strong>
            <ul>
              <li>Chetana returns only three answers: safe, risky, or unclear.</li>
              <li>If the signal is weak, it stays unclear instead of pretending certainty.</li>
              <li>The result explains why and gives the next safest action.</li>
              <li>You can share a warning or save the evidence while details are fresh.</li>
            </ul>
            {onNavigate && (
              <div className="v0-inline-actions">
                <button onClick={() => onNavigate("trust")}>
                  <FileText size={14} /> How it works
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {showHero && !result && (
        <button className="v0-mobile-cta" onClick={scrollToComposer}>
          Scan now
          <ArrowRight size={16} />
        </button>
      )}
    </section>
  );
}
