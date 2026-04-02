import { useEffect, useMemo, useState } from "react";
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
  inputTypeLabel,
  reportScript,
  scamTypeLabel,
  shareShieldText,
  trackV0Event,
  verdictLabel,
  verdictSummary,
  V0_MODE_CARDS,
} from "./chetanaV0";

const DEFAULT_PROMPTS: Record<V0Mode, string> = {
  text: "Paste the full message here.",
  screenshot: "Upload the screenshot. Add a note only if it helps.",
  qr_image: "Upload the QR screenshot or paste the UPI or payment payload you can see.",
  payment_screenshot: "Upload the payment screenshot. Add any note that explains the context.",
};

const HERO_COPY: Record<V0Mode, { kicker: string; title: string; body: string }> = {
  text: {
    kicker: "Private safety check",
    title: "Check the message before you reply, pay, or click.",
    body: "Paste the suspicious message and get a plain-language call: risky, unclear, or looks okay so far.",
  },
  screenshot: {
    kicker: "Private safety check",
    title: "Upload the screenshot. Chetana will read the visible text.",
    body: "Useful when the message is already on your phone screen or came through WhatsApp, SMS, or email.",
  },
  qr_image: {
    kicker: "Private safety check",
    title: "Check the QR or payment payload before you scan and pay.",
    body: "If something feels rushed, confusing, or mismatched, pause here first.",
  },
  payment_screenshot: {
    kicker: "Private safety check",
    title: "Check payment proof before you hand over goods.",
    body: "Built for shopkeepers, delivery staff, and sellers who need a fast second opinion.",
  },
};

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

  const runScan = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setEvidence(null);
    setShareCopied(false);
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
          <div className="v0-kicker">{hero.kicker}</div>
          <h1>{hero.title}</h1>
          <p>{hero.body}</p>
          <div className="v0-trust-strip">
            <span>
              <Shield size={14} /> Only three answers: safe, risky, or unclear.
            </span>
            <span>
              <AlertTriangle size={14} /> If the signal is weak, Chetana stays unclear.
            </span>
            <span>
              <Phone size={14} /> If money already moved, call 1930 first.
            </span>
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
                  onClick={() => {
                    setMode(card.mode);
                    setResult(null);
                    setEvidence(null);
                    setError(null);
                  }}
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

          <div className="v0-composer">
            <div className="v0-composer-head">
              <div>
                <div className="v0-section-label">Check now</div>
                <h2>{HERO_COPY[mode].title}</h2>
              </div>
              <div className="v0-status">{status}</div>
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
                Private advisory tool. Not a government service. If money moved, use the official help steps below.
              </div>
              <button className="v0-submit" onClick={runScan} disabled={loading}>
                {loading ? "Checking..." : "Check this now"}
                <ArrowRight size={16} />
              </button>
            </div>
            {error && <div className="v0-error">{error}</div>}
          </div>

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
            <div className="v0-section-label">What this does</div>
            <strong>One quick check, then a calmer next step.</strong>
            <ul>
              <li>Scan the suspicious thing.</li>
              <li>Explain the result in plain language.</li>
              <li>Show the safest next action.</li>
              <li>Help you share the warning or save the evidence.</li>
            </ul>
          </div>

          <div className="v0-side-card">
            <div className="v0-section-label">What it checks today</div>
            <strong>Common scam patterns that catch people off guard.</strong>
            <ul>
              <li>Fake KYC or bank alerts</li>
              <li>UPI or QR payment tricks</li>
              <li>Fake payment screenshots</li>
              <li>Parcel and customs fee messages</li>
              <li>Job scams and authority pressure</li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
