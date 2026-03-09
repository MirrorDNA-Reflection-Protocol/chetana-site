import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PageId } from "./types";
import { Nav, Hero, AlertBanner, ScanBox, WeatherBoard, Atlas, MirrorGraph, TuiPanel, DashboardGallery, TrustPage, Onboarding, OnboardingFlow, ChatAssistant } from "./components";
import ProofPage from "./ProofPage";
import { threats, weather, graphNodes, graphEdges, tuiLines } from "./data";
import { RadarAnim, ScanAnim, GlobeAnim, CountUp } from "./animations";

const pageAnim = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -12 }, transition: { duration: 0.25 } };

export default function App() {
  const [page, setPage] = useState<PageId>("home");
  const [showOnboarding, setShowOnboarding] = useState(() => !sessionStorage.getItem("chetana_onboarded"));

  const pageTitle = useMemo(() => {
    switch (page) {
      case "consumer": return "Check & Protect";
      case "merchant": return "Merchant Protection";
      case "nexus": return "Chetana Nexus";
      case "weather": return "Scam Weather";
      case "atlas": return "Scam Atlas";
      case "trust": return "Trust by Design\u2122";
      case "proof": return "Terms & Disclaimer";
      case "control": return "Control Center";
      default: return "Chetana";
    }
  }, [page]);

  const handleOnboardingComplete = (target: PageId) => {
    sessionStorage.setItem("chetana_onboarded", "1");
    setShowOnboarding(false);
    setPage(target);
  };

  return (
    <div className="app-shell">
      <AnimatePresence>{showOnboarding && <OnboardingFlow onComplete={handleOnboardingComplete} />}</AnimatePresence>
      <Nav page={page} setPage={setPage} />
      <main>
        <AnimatePresence mode="wait">
          <motion.div key={page} {...pageAnim}>
            {page === "home" && <>
              <AlertBanner onNavigate={setPage as any} />
              <Hero onNavigate={setPage as any} />
              <Onboarding onNavigate={setPage as any} />
              <WeatherBoard signals={weather} />
              <DashboardGallery />
            </>}
            {page === "consumer" && <>
              <section className="page-intro" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24 }}>
                <div>
                  <div className="kicker">Consumer</div><h1>{pageTitle}</h1>
                  <p>Check messages, links, UPI IDs, and phone numbers instantly.</p>
                </div>
                <ScanAnim size={160} />
              </section>
              <ScanBox />
              <WeatherBoard signals={weather.slice(0, 5)} />
              <Atlas threats={threats} />
            </>}
            {page === "merchant" && <>
              <section className="page-intro"><div className="kicker">Merchant</div><h1>{pageTitle}</h1><p>Defend against fake payment screenshots and impersonation.</p></section>
              <ScanBox />
              <DashboardGallery />
              <Atlas threats={threats.filter(t => t.surface === "payment trust")} />
            </>}
            {page === "nexus" && <>
              <section className="page-intro"><div className="kicker">Enterprise</div><h1>{pageTitle}</h1><p>Trust infrastructure for banks, fintechs, and fraud teams.</p></section>
              <div className="two-up">
                <div className="panel"><div className="panel-header"><h2>Action Eligibility</h2><p>Inform, warn, verify, escalate, hold.</p></div><ul className="feature-list"><li>Evidence ladder per decision</li><li>Analyst replay and provenance</li><li>Scam campaign clustering</li><li>Merchant and payments risk</li></ul></div>
                <div className="panel"><div className="panel-header"><h2>Analyst Replay</h2><p>What fired, why, and what action became eligible.</p></div><ol className="replay-list"><li>Input normalized</li><li>Surface classified</li><li>Proof anomalies detected</li><li>Campaign graph match</li><li>Warn + verify suggested</li></ol></div>
              </div>
              <div className="panel"><div className="panel-header"><h2>MirrorGraph</h2><p>Living campaign and trust graph.</p></div><MirrorGraph nodes={graphNodes} edges={graphEdges} /></div>
            </>}
            {page === "weather" && <>
              <section className="page-intro" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24 }}>
                <div>
                  <div className="kicker">Public Intelligence</div><h1>{pageTitle}</h1>
                  <p>Live pressure signals across Indian digital trust.</p>
                </div>
                <RadarAnim size={180} />
              </section>
              <WeatherBoard signals={weather} />
            </>}
            {page === "atlas" && <>
              <section className="page-intro"><div className="kicker">Threat Wiki</div><h1>{pageTitle}</h1><p>Know the scams. Know the red flags. Know what to do.</p></section>
              <Atlas threats={threats} />
            </>}
            {page === "trust" && <>
              <section className="page-intro" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24 }}>
                <div>
                  <div className="kicker">Governance</div><h1>{pageTitle}</h1>
                  <p>Trust is architected, not promised.</p>
                </div>
                <GlobeAnim size={160} />
              </section>
              <TrustPage />
            </>}
            {page === "proof" && <ProofPage />}
            {page === "control" && <>
              <section className="page-intro"><div className="kicker">Command Center</div><h1>{pageTitle}</h1><p>TUI, graph, and dashboards together.</p></section>
              <div className="two-up">
                <TuiPanel lines={tuiLines} />
                <div className="panel"><div className="panel-header"><h2>MirrorGraph</h2><p>Interactive campaign graph.</p></div><MirrorGraph nodes={graphNodes} edges={graphEdges} /></div>
              </div>
              <DashboardGallery />
            </>}
          </motion.div>
        </AnimatePresence>
      </main>
      <ChatAssistant />
    </div>
  );
}
