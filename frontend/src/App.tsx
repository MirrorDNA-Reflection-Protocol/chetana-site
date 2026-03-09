import { useMemo, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PageId } from "./types";
import {
  BackgroundMesh, Nav, Hero, StatsStrip, AlertBanner, ScanBox,
  ConsumerSection, EnterpriseSection, TelegramCTA,
  WeatherBoard, Atlas, MirrorGraph, TuiPanel, DashboardGallery,
  TrustPage, Onboarding, OnboardingFlow, Footer
} from "./components";
import ProofPage from "./ProofPage";
import VigilancePage from "./VigilancePage";
import { threats, weather, graphNodes, graphEdges, tuiLines } from "./data";
import { RadarAnim, ScanAnim, GlobeAnim } from "./animations";

const pageAnim = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -12 }, transition: { duration: 0.25 } };

export default function App() {
  const [page, setPage] = useState<PageId>("home");
  const [termsAccepted, setTermsAccepted] = useState(() => !!localStorage.getItem("chetana_terms_accepted"));

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [page]);

  const handleQuickAccept = () => {
    localStorage.setItem("chetana_terms_accepted", new Date().toISOString());
    setTermsAccepted(true);
  };

  return (
    <div className="app-shell">
      <BackgroundMesh />
      <AlertBanner onNavigate={setPage as any} />
      <Nav page={page} setPage={setPage} />
      <main>
        <AnimatePresence mode="wait">
          <motion.div key={page} {...pageAnim}>

            {/* ── HOME — Scan-centered hero ────────────────────── */}
            {page === "home" && <>
              <Hero onNavigate={setPage as any} />
              <ScanBox onRequireProof={() => setPage("proof")} />
              <StatsStrip />
              <TelegramCTA />
              <ConsumerSection onNavigate={setPage} />
              <EnterpriseSection onNavigate={setPage} />
              <WeatherBoard signals={weather.slice(0, 6)} />
              <TrustPage />
            </>}

            {/* ── CONSUMER ────────────────────────────────────── */}
            {page === "consumer" && <>
              <section className="page-intro" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24 }}>
                <div>
                  <div className="kicker">Consumer</div>
                  <h1>Check & Protect</h1>
                  <p>Paste any suspicious SMS, WhatsApp message, link, UPI ID, or phone number. We'll check it for you.</p>
                </div>
                <ScanAnim size={140} />
              </section>
              <ScanBox onRequireProof={() => setPage("proof")} />
              <WeatherBoard signals={weather.slice(0, 5)} />
              <Atlas threats={threats} />
            </>}

            {/* ── MERCHANT ────────────────────────────────────── */}
            {page === "merchant" && <>
              <section className="page-intro">
                <div className="kicker">Business</div>
                <h1>Merchant Protection</h1>
                <p>Check payment proofs, buyer identities, and transaction claims before you hand over goods.</p>
              </section>
              <ScanBox onRequireProof={() => setPage("proof")} />
              <DashboardGallery />
              <Atlas threats={threats.filter(t => t.surface === "payment trust")} />
            </>}

            {/* ── NEXUS (Enterprise) ──────────────────────────── */}
            {page === "nexus" && <>
              <section className="page-intro">
                <div className="kicker">Enterprise</div>
                <h1>Chetana Nexus</h1>
                <p>Scam detection API and threat intelligence for banks, fintechs, and fraud teams.</p>
              </section>
              <div className="two-up">
                <div className="panel">
                  <div className="panel-header">
                    <h2>Action Eligibility</h2>
                    <p>Inform, warn, verify, escalate, hold.</p>
                  </div>
                  <ul className="feature-list">
                    <li>Evidence ladder per decision</li>
                    <li>Analyst replay and provenance</li>
                    <li>Scam campaign clustering</li>
                    <li>Merchant and payments risk</li>
                  </ul>
                </div>
                <div className="panel">
                  <div className="panel-header">
                    <h2>Analyst Replay</h2>
                    <p>What fired, why, and what action became eligible.</p>
                  </div>
                  <ol className="replay-list">
                    <li>Input normalized</li>
                    <li>Surface classified</li>
                    <li>Proof anomalies detected</li>
                    <li>Campaign graph match</li>
                    <li>Warn + verify suggested</li>
                  </ol>
                </div>
              </div>
              <div className="panel">
                <div className="panel-header">
                  <h2>MirrorGraph</h2>
                  <p>Living campaign and trust graph. Click nodes to explore connections.</p>
                </div>
                <MirrorGraph nodes={graphNodes} edges={graphEdges} />
              </div>
            </>}

            {/* ── WEATHER ─────────────────────────────────────── */}
            {page === "weather" && <>
              <section className="page-intro" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24 }}>
                <div>
                  <div className="kicker">Public Intelligence</div>
                  <h1>Live Scam Weather</h1>
                  <p>See which scams are rising and falling across India right now.</p>
                </div>
                <RadarAnim size={160} />
              </section>
              <WeatherBoard signals={weather} />
            </>}

            {/* ── ATLAS ───────────────────────────────────────── */}
            {page === "atlas" && <>
              <section className="page-intro">
                <div className="kicker">Threat Wiki</div>
                <h1>Scam Atlas</h1>
                <p>Every scam type explained simply. Red flags, what to do, and how to protect yourself.</p>
              </section>
              <Atlas threats={threats} />
            </>}

            {/* ── TRUST ───────────────────────────────────────── */}
            {page === "trust" && <>
              <section className="page-intro" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24 }}>
                <div>
                  <div className="kicker">Governance</div>
                  <h1>Trust by Design&#8482;</h1>
                  <p>Trust is architected, not promised.</p>
                </div>
                <GlobeAnim size={140} />
              </section>
              <TrustPage />
            </>}

            {/* ── PROOF / TERMS ────────────────────────────────── */}
            {page === "proof" && <ProofPage onAccepted={() => { setTermsAccepted(true); setPage("home"); }} />}

            {/* ── VIGILANCE ────────────────────────────────────── */}
            {page === "vigilance" && <VigilancePage />}

            {/* ── CONTROL CENTER ───────────────────────────────── */}
            {page === "control" && <>
              <section className="page-intro">
                <div className="kicker">Command Center</div>
                <h1>Control Center</h1>
                <p>TUI, graph, and dashboards together.</p>
              </section>
              <div className="two-up">
                <TuiPanel lines={tuiLines} />
                <div className="panel">
                  <div className="panel-header"><h2>MirrorGraph</h2><p>Interactive campaign graph.</p></div>
                  <MirrorGraph nodes={graphNodes} edges={graphEdges} />
                </div>
              </div>
              <DashboardGallery />
            </>}

          </motion.div>
        </AnimatePresence>
      </main>
      <Footer onNavigate={setPage} />
      {!termsAccepted && (
        <div className="consent-bar">
          <span>Before your first scan, please review our <a onClick={() => setPage("proof")}>Terms & Disclaimer</a>.</span>
          <button onClick={() => setPage("proof")}>Review Terms</button>
        </div>
      )}
    </div>
  );
}
