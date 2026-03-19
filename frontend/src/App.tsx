import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PageId } from "./types";
import {
  BackgroundMesh, Nav, Hero, StatsStrip, AlertBanner, ScanWidget,
  StoriesSection, ConsumerSection, EnterpriseSection, TelegramCTA, ShareCTA,
  WeatherBoard, Atlas, TrustPage, Footer
} from "./components";
import ProofPage from "./ProofPage";
import VigilancePage from "./VigilancePage";
import StoryPage from "./StoryPage";
import { threats, weather } from "./data";

const pageAnim = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -12 }, transition: { duration: 0.25 } };

export default function App() {
  const [page, _setPage] = useState<PageId>("home");
  const [termsAccepted, setTermsAccepted] = useState(() => !!localStorage.getItem("chetana_terms_accepted"));

  const setPage = (p: PageId) => {
    if (!termsAccepted && p !== "proof" && p !== "home") {
      _setPage("proof");
    } else {
      _setPage(p);
    }
  };

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
              <StatsStrip />
              <StoriesSection />
              <TelegramCTA />
              <ShareCTA />
              <ConsumerSection onNavigate={setPage} />
              <hr className="section-glow-divider" />
              <EnterpriseSection onNavigate={setPage} />
              <hr className="section-glow-divider" />
              <WeatherBoard signals={weather.slice(0, 6)} />
              <TrustPage />
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

            {page === "weather" && <WeatherBoard signals={weather} />}
            {page === "trust" && <TrustPage />}
            {page === "proof" && <ProofPage onAccepted={() => { setTermsAccepted(true); setPage("home"); }} />}
            {page === "vigilance" && <VigilancePage />}
            {page === "story" && <StoryPage />}

          </motion.div>
        </AnimatePresence>
      </main>
      <Footer onNavigate={setPage} />

      {/* Floating scan widget — always visible */}
      <ScanWidget onRequireProof={() => setPage("proof")} />

      {!termsAccepted && (
        <div className="consent-bar">
          <span>Quick step before your first scan — <a onClick={() => setPage("proof")}>read & agree</a></span>
          <button onClick={() => setPage("proof")}>OK</button>
        </div>
      )}
    </div>
  );
}
