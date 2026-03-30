import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PageId } from "./types";
import {
  BackgroundMesh, Nav, Hero, StatsStrip, AlertBanner, ScanWidget,
  ConsumerSection, WeatherBoard, Atlas, TrustPage, PanicPage,
  IncidentStepper, FamilyPage, Footer, FrontDoorSection, ShareInstallSection
} from "./components";
import ProofPage from "./ProofPage";
import VigilancePage from "./VigilancePage";
import StoryPage from "./StoryPage";
import { threats, weather } from "./data";

const pageAnim = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -12 }, transition: { duration: 0.25 } };
const previewClips = [
  {
    src: "/chetana_clip1.mp4",
    label: "WhatsApp lure",
    title: "See the emotional bait before it lands.",
    note: "Real scam energy, reduced into one clear visual cue.",
  },
  {
    src: "/chetana_clip2.mp4",
    label: "Urgency pressure",
    title: "Spot the panic pattern, not just the words.",
    note: "Chetana reads the pressure tactics underneath the message.",
  },
  {
    src: "/chetana_short_final.mp4",
    label: "Synthetic trust",
    title: "Deepfakes feel polished. The signals still leak.",
    note: "Visual persuasion rotates here the same way scams rotate in the wild.",
  },
];

export default function App() {
  const [page, _setPage] = useState<PageId>("home");
  const [termsAccepted, setTermsAccepted] = useState(() => !!localStorage.getItem("chetana_terms_accepted"));
  const [councilData, setCouncilData] = useState<any>(null);
  const [sharedContent, setSharedContent] = useState<string | null>(null);
  const [sharedAttachment, setSharedAttachment] = useState<File | null>(null);
  const [vidIdx, setVidIdx] = useState(0);
  const activePreview = previewClips[vidIdx];
  useEffect(() => { const t = setInterval(() => setVidIdx(i => (i + 1) % previewClips.length), 6000); return () => clearInterval(t); }, []);

  const setPage = (p: PageId) => {
    if (!termsAccepted && p !== "proof" && p !== "home" && p !== "panic") {
      _setPage("proof");
    } else {
      _setPage(p);
    }
  };

  // Handle share target intake + PWA shortcuts on load
  useEffect(() => {
    let cancelled = false;

    const bootFromIntent = async () => {
      const params = new URLSearchParams(window.location.search);
      const isShare = params.has("share");
      const isAction = params.get("action") === "scan";
      const isPwa = params.get("source") === "pwa";
      let sharedText = params.get("shared_text");
      let sharedFile: File | null = null;

      if (isShare && "caches" in window) {
        try {
          const cache = await caches.open("chetana-share");
          const payloadResp = await cache.match("/shared-payload");

          if (payloadResp) {
            const payload = await payloadResp.json();

            if (!sharedText) {
              const stitched = [payload.title, payload.text, payload.url].filter(Boolean).join(" ").trim();
              sharedText = stitched || null;
            }

            const fileCount = Number(payload.fileCount || 0);
            if (fileCount > 0) {
              const fileResp = await cache.match("/shared-file-0");
              if (fileResp) {
                const blob = await fileResp.blob();
                const filename = fileResp.headers.get("X-Filename") || `shared-${Date.now()}`;
                sharedFile = new File([blob], filename, {
                  type: blob.type || fileResp.headers.get("Content-Type") || "application/octet-stream",
                });
              }

              for (let i = 0; i < fileCount; i += 1) {
                await cache.delete(`/shared-file-${i}`);
              }
            }

            await cache.delete("/shared-payload");
          }
        } catch (error) {
          console.error("Failed to hydrate PWA share payload", error);
        }
      }

      if (cancelled) return;

      setSharedContent(sharedText || null);
      setSharedAttachment(sharedFile);

      if (isShare || isAction || isPwa) {
        setPage("scan");
        window.history.replaceState({}, "", "/");
      }
    };

    void bootFromIntent();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [page]);

  return (
    <div className="app-shell">
      <BackgroundMesh />
      <AlertBanner onNavigate={setPage as any} />
      <Nav page={page} setPage={setPage} />
      <main>
        <AnimatePresence mode="wait">
          <motion.div key={page} {...pageAnim}>

            {page === "home" && <>
              <Hero onNavigate={setPage as any} />
              <FrontDoorSection
                onNavigate={setPage}
                onRequireProof={() => setPage("proof")}
                onCouncilUpdate={setCouncilData}
                initialInput={sharedContent}
                initialFile={sharedAttachment}
              />
              <ShareInstallSection onNavigate={setPage} />
            </>}

            {page === "consumer" && <>
              <section className="page-intro" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24 }}>
                <div>
                  <div className="kicker">Consumer</div>
                  <h1>Check & Protect</h1>
                  <p>Paste any suspicious SMS, WhatsApp message, link, UPI ID, or phone number.</p>
                </div>
              </section>
              <WeatherBoard signals={weather.slice(0, 5)} />
              <Atlas threats={threats} />
            </>}

            {page === "atlas" && <>
              <section className="page-intro">
                <div className="kicker">Threat Wiki</div>
                <h1>Scam Atlas</h1>
                <p>Every scam type explained simply.</p>
              </section>
              <Atlas threats={threats} />
            </>}

            {page === "merchant" && <>
              <section className="page-intro" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24 }}>
                <div>
                  <div className="kicker">Merchant</div>
                  <h1>Protect Your Business</h1>
                  <p>Defend against fake payment screenshots, impersonation attacks, and UPI fraud targeting your business.</p>
                </div>
              </section>
              <WeatherBoard signals={weather.slice(0, 5)} />
              <Atlas threats={threats} />
            </>}

            {page === "nexus" && <>
              <section className="page-intro" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24 }}>
                <div>
                  <div className="kicker">Nexus API</div>
                  <h1>Fraud Detection API</h1>
                  <p>Add Chetana's scam detection to your app, website, or payment flow. One API call — instant fraud verdict.</p>
                </div>
              </section>
              <WeatherBoard signals={weather.slice(0, 5)} />
              <Atlas threats={threats} />
            </>}

            {page === "scan" && <>
              <section className="scan-page-grid">
                {/* LEFT — Council visual + video (hidden on mobile, shown on desktop) */}
                <div className="scan-page-sidebar">
                  <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16 }}>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.4)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>👁️</span> International Scam Council
                    </div>
                    {/* Network graph */}
                    {(() => {
                      const judges = [
                        { flag: '🇨🇳', label: 'DeepSeek', region: 'China', cx: 80, cy: 50 },
                        { flag: '🇪🇺', label: 'Mistral', region: 'EU', cx: 280, cy: 50 },
                        { flag: '🇮🇳', label: 'Vajra', region: 'India', cx: 80, cy: 180 },
                        { flag: '🇺🇸', label: 'Llama', region: 'US', cx: 280, cy: 180 },
                      ];
                      const center = { cx: 180, cy: 110 };
                      const votes = councilData?.votes || [];
                      const getVote = (region: string) => votes.find((v: any) => v.region === region);
                      const scoreColor = (s: number) => s >= 65 ? '#ef4444' : s >= 35 ? '#f59e0b' : '#22c55e';
                      const idleColor = 'rgba(255,255,255,0.08)';
                      return (
                        <div>
                          <svg viewBox="0 0 360 230" style={{ width: '100%', height: 'auto' }}>
                            <defs>
                              {judges.map((j, i) => {
                                const v = getVote(j.region);
                                const color = v ? scoreColor(v.score) : 'rgba(255,255,255,0.15)';
                                return (
                                  <linearGradient key={`g${i}`} id={`edge${i}`} x1={j.cx} y1={j.cy} x2={center.cx} y2={center.cy} gradientUnits="userSpaceOnUse">
                                    <stop offset="0%" stopColor={color} stopOpacity={v ? 0.8 : 0.2} />
                                    <stop offset="100%" stopColor={v ? scoreColor(councilData.score) : 'rgba(255,255,255,0.1)'} stopOpacity={v ? 0.6 : 0.1} />
                                  </linearGradient>
                                );
                              })}
                            </defs>
                            {/* Edges */}
                            {judges.map((j, i) => {
                              const v = getVote(j.region);
                              return (
                                <g key={`e${i}`}>
                                  <motion.line
                                    x1={j.cx} y1={j.cy} x2={center.cx} y2={center.cy}
                                    stroke={`url(#edge${i})`}
                                    strokeWidth={v ? 2.5 : 1}
                                    initial={{ pathLength: 0 }}
                                    animate={{ pathLength: 1 }}
                                    transition={{ duration: 0.8, delay: i * 0.15 }}
                                  />
                                  {!v && (
                                    <motion.circle
                                      r={2}
                                      fill="rgba(255,255,255,0.2)"
                                      animate={{
                                        cx: [j.cx, center.cx],
                                        cy: [j.cy, center.cy],
                                        opacity: [0.4, 0],
                                      }}
                                      transition={{ duration: 2, repeat: Infinity, delay: i * 0.5, ease: "linear" }}
                                    />
                                  )}
                                  {v && (
                                    <motion.circle
                                      r={3}
                                      fill={scoreColor(v.score)}
                                      animate={{
                                        cx: [j.cx, center.cx],
                                        cy: [j.cy, center.cy],
                                        opacity: [1, 0],
                                      }}
                                      transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.4, ease: "linear" }}
                                    />
                                  )}
                                </g>
                              );
                            })}
                            {/* Center verdict node */}
                            <motion.circle
                              cx={center.cx} cy={center.cy} r={councilData ? 32 : 26}
                              fill={councilData ? `${scoreColor(councilData.score)}15` : 'rgba(255,255,255,0.03)'}
                              stroke={councilData ? scoreColor(councilData.score) : 'rgba(255,255,255,0.12)'}
                              strokeWidth={councilData ? 2 : 1}
                              animate={councilData ? {} : { r: [26, 28, 26], opacity: [0.6, 1, 0.6] }}
                              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                            />
                            {councilData ? (
                              <>
                                <text x={center.cx} y={center.cy - 6} textAnchor="middle" fill={scoreColor(councilData.score)} fontSize="18" fontWeight="900" fontFamily="monospace">{councilData.score}</text>
                                <text x={center.cx} y={center.cy + 10} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="8" fontWeight="600">{councilData.verdict === 'SUSPICIOUS' ? 'HIGH RISK' : councilData.verdict === 'UNCLEAR' ? 'CAUTION' : 'SAFE'}</text>
                              </>
                            ) : (
                              <text x={center.cx} y={center.cy + 4} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="9" fontWeight="500">VERDICT</text>
                            )}
                            {/* Judge nodes */}
                            {judges.map((j, i) => {
                              const v = getVote(j.region);
                              const color = v ? scoreColor(v.score) : idleColor;
                              return (
                                <g key={`n${i}`}>
                                  <motion.circle
                                    cx={j.cx} cy={j.cy} r={24}
                                    fill={v ? `${color}18` : 'rgba(255,255,255,0.02)'}
                                    stroke={v ? color : 'rgba(255,255,255,0.1)'}
                                    strokeWidth={v ? 1.5 : 0.5}
                                    initial={{ scale: 0 }}
                                    animate={v ? { scale: 1 } : { scale: [1, 1.06, 1], opacity: [0.5, 0.8, 0.5] }}
                                    transition={v ? { duration: 0.4, delay: i * 0.1 } : { duration: 2.5, repeat: Infinity, delay: i * 0.6 }}
                                  />
                                  <text x={j.cx} y={j.cy - 5} textAnchor="middle" fontSize="16">{j.flag}</text>
                                  {v ? (
                                    <text x={j.cx} y={j.cy + 12} textAnchor="middle" fill={color} fontSize="13" fontWeight="900" fontFamily="monospace">{v.score}</text>
                                  ) : (
                                    <text x={j.cx} y={j.cy + 12} textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="7">{j.label}</text>
                                  )}
                                </g>
                              );
                            })}
                          </svg>
                          {/* Reason cards below graph when data exists */}
                          {councilData && votes.length > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
                              {votes.map((v: any, i: number) => (
                                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.1 }}
                                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '6px 8px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                                    <span style={{ fontSize: 12 }}>{({'China':'🇨🇳','EU':'🇪🇺','US':'🇺🇸','India':'🇮🇳'} as any)[v.region] || '🌐'}</span>
                                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{v.model}</span>
                                  </div>
                                  {v.reason && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', lineHeight: 1.3 }}>{v.reason}</div>}
                                </motion.div>
                              ))}
                            </div>
                          )}
                          {!councilData && (
                            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.4, margin: '4px 0 0', textAlign: 'center' }}>
                              Paste a suspicious message and Chetana will compare local signals with deeper analysis when needed.
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  {/* Rotating story preview */}
                  <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(3,8,18,0.7)', boxShadow: '0 18px 44px rgba(0,0,0,0.22)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444' }} />
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b' }} />
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', marginLeft: 6 }}>chetana.activemirror.ai</span>
                    </div>
                    <div
                      style={{
                        position: 'relative',
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) minmax(116px, 138px)',
                        alignItems: 'center',
                        gap: 16,
                        minHeight: 'clamp(176px, 20vw, 214px)',
                        padding: '16px 16px 14px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        background: 'radial-gradient(circle at top left, rgba(53,93,255,0.2), transparent 40%), linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
                      }}
                      onClick={() => setPage("story")}
                    >
                      <AnimatePresence mode="wait">
                        <motion.video
                          key={`ambient-${activePreview.src}`}
                          autoPlay
                          muted
                          loop
                          playsInline
                          initial={{ opacity: 0, scale: 1.06 }}
                          animate={{ opacity: 0.22, scale: 1.1 }}
                          exit={{ opacity: 0, scale: 1.02 }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 24%', filter: 'blur(28px) saturate(0.9)', pointerEvents: 'none' }}
                          src={activePreview.src}
                        />
                      </AnimatePresence>
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(4,8,18,0.18), rgba(4,8,18,0.72) 60%)', pointerEvents: 'none' }} />

                      <div style={{ position: 'relative', zIndex: 1 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 999, background: 'rgba(9,14,28,0.64)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.74)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 12px rgba(34,197,94,0.75)' }} />
                          Rotating preview
                        </div>
                        <div style={{ marginTop: 12, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'rgba(255,255,255,0.48)' }}>{activePreview.label}</div>
                        <div style={{ marginTop: 7, fontSize: 20, lineHeight: 1.08, fontWeight: 800, color: '#f8fafc', maxWidth: 220 }}>
                          {activePreview.title}
                        </div>
                        <p style={{ margin: '9px 0 0', maxWidth: 228, fontSize: 11, lineHeight: 1.45, color: 'rgba(255,255,255,0.62)' }}>
                          {activePreview.note}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
                          {previewClips.map((clip, index) => (
                            <span
                              key={clip.src}
                              style={{
                                width: index === vidIdx ? 22 : 8,
                                height: 8,
                                borderRadius: 999,
                                background: index === vidIdx ? '#f8fafc' : 'rgba(255,255,255,0.22)',
                                transition: 'all 160ms ease',
                              }}
                            />
                          ))}
                        </div>
                      </div>

                      <div style={{ position: 'relative', zIndex: 1, justifySelf: 'end', width: '100%', maxWidth: 138 }}>
                        <div style={{ position: 'relative', aspectRatio: '9 / 16', borderRadius: 24, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(0,0,0,0.3)', boxShadow: '0 18px 36px rgba(0,0,0,0.32)' }}>
                          <div style={{ position: 'absolute', top: 9, left: '50%', width: 46, height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.2)', transform: 'translateX(-50%)', zIndex: 2 }} />
                          <AnimatePresence mode="wait">
                            <motion.video
                              key={activePreview.src}
                              autoPlay
                              muted
                              loop
                              playsInline
                              initial={{ opacity: 0, scale: 1.04 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.98 }}
                              transition={{ duration: 0.45, ease: 'easeOut' }}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 18%', display: 'block', pointerEvents: 'none' }}
                              src={activePreview.src}
                            />
                          </AnimatePresence>
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(7,11,24,0.18), transparent 30%, transparent 72%, rgba(7,11,24,0.32))', pointerEvents: 'none' }} />
                          <div style={{ position: 'absolute', left: 10, right: 10, bottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 13, background: 'rgba(7,11,24,0.55)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <div>
                              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.48)' }}>Field sample</div>
                              <div style={{ marginTop: 3, fontSize: 11, fontWeight: 700, color: '#f8fafc' }}>Scene {vidIdx + 1} of {previewClips.length}</div>
                            </div>
                            <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 14px rgba(34,197,94,0.85)' }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* RIGHT — Chat box (primary on mobile, shows first via CSS order) */}
                <div className="scan-page-main">
                  <ScanWidget
                    onRequireProof={() => setPage("proof")}
                    inline
                    onCouncilUpdate={setCouncilData}
                    initialInput={sharedContent}
                    initialFile={sharedAttachment}
                  />
                </div>
              </section>
              <StatsStrip />
            </>}

            {page === "weather" && <WeatherBoard signals={weather} />}
            {page === "trust" && <TrustPage />}
            {page === "proof" && <ProofPage onAccepted={() => { setTermsAccepted(true); setPage("scan"); }} />}
            {page === "panic" && <PanicPage />}
            {page === "incident" && <IncidentStepper onNavigate={setPage} />}
            {page === "vigilance" && <VigilancePage />}
            {page === "story" && <StoryPage />}
            {page === "family" && <FamilyPage />}

          </motion.div>
        </AnimatePresence>
      </main>
      <Footer onNavigate={setPage} />

      {/* FAB — goes to scan page (with proof gate) */}
      {page !== "scan" && page !== "proof" && (
        <button className="sw-fab" onClick={() => setPage("scan")}>
          <span style={{ fontSize: 20 }}>🛡️</span>
          <span className="sw-fab-label">Scan</span>
        </button>
      )}
    </div>
  );
}
