import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PageId } from "./types";
import {
  BackgroundMesh, Nav, SafetyRadar, Atlas, TrustPage, PanicPage,
  ShareCTA,
  IncidentStepper, FamilyPage, Footer
} from "./components";
import ProofPage from "./ProofPage";
import VigilancePage from "./VigilancePage";
import StoryPage from "./StoryPage";
import { threats, weather } from "./data";
import ChetanaV0Experience from "./ChetanaV0Experience";
import { I18nProvider } from "./i18n";

const pageAnim = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -12 }, transition: { duration: 0.25 } };
export default function App() {
  const [page, _setPage] = useState<PageId>("home");
  const [termsAccepted, setTermsAccepted] = useState(() => !!localStorage.getItem("chetana_terms_accepted"));
  const [sharedContent, setSharedContent] = useState<string | null>(null);
  const [sharedAttachment, setSharedAttachment] = useState<File | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let disposed = false;
    let registrationCleanup: (() => void) | undefined;
    let intervalId: number | undefined;

    const attachRegistration = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting) {
        setUpdateReady(true);
      }

      const onUpdateFound = () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            setUpdateReady(true);
          }
        });
      };

      registration.addEventListener("updatefound", onUpdateFound);
      intervalId = window.setInterval(() => {
        registration.update().catch(() => {});
      }, 180000);

      return () => {
        registration.removeEventListener("updatefound", onUpdateFound);
      };
    };

    const onControllerChange = () => window.location.reload();
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      navigator.serviceWorker.getRegistration().then((registration) => {
        registration?.update().catch(() => {});
      });
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", onVisibility);

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (disposed || !registration) return;
      registrationCleanup = attachRegistration(registration);
      registration.update().catch(() => {});
    });

    return () => {
      disposed = true;
      if (intervalId) window.clearInterval(intervalId);
      registrationCleanup?.();
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const refreshToLatest = async () => {
    setRefreshing(true);
    try {
      if (!("serviceWorker" in navigator)) {
        window.location.reload();
        return;
      }

      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update().catch(() => {});

      if (registration?.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
        return;
      }

      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  return (
    <I18nProvider>
    <div className="app-shell">
      <BackgroundMesh />
      <Nav page={page} setPage={setPage} />
      {updateReady && (
        <div className="app-update-banner">
          <div className="app-update-copy">
            <strong>New version ready.</strong>
            <span>Refresh Chetana for the latest scam checks and fixes. नई version तैयार है.</span>
          </div>
          <button onClick={refreshToLatest} disabled={refreshing}>
            {refreshing ? "Refreshing..." : "Refresh now"}
          </button>
        </div>
      )}
      <main>
        <AnimatePresence mode="wait">
          <motion.div key={page} {...pageAnim}>

            {page === "home" && <>
              <ChetanaV0Experience
                onNavigate={setPage}
                initialInput={sharedContent}
                initialFile={sharedAttachment}
              />
              <ShareCTA />
            </>}

            {page === "consumer" && <>
              <ChetanaV0Experience
                onNavigate={setPage}
                initialInput={sharedContent}
                initialFile={sharedAttachment}
              />
            </>}

            {page === "atlas" && <>
              <section className="page-intro">
                <div className="kicker">Common scams</div>
                <h1>Common scam patterns</h1>
                <p>Common scam patterns in simple language, with red flags and what to do next.</p>
              </section>
              <Atlas threats={threats} />
            </>}

            {page === "merchant" && <>
              <ChetanaV0Experience
                onNavigate={setPage}
                presetMode="payment_screenshot"
                showHero={false}
              />
            </>}

            {page === "nexus" && <>
              <section className="page-intro" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24 }}>
                <div>
                  <div className="kicker">Merchant API</div>
                  <h1>Safety API for apps and checkout flows</h1>
                  <p>Add Chetana to your app, website, or payment flow so users can pause and verify before they act.</p>
                </div>
              </section>
              <SafetyRadar signals={weather.slice(0, 5)} />
              <Atlas threats={threats} />
            </>}

            {page === "scan" && <>
              <ChetanaV0Experience
                onNavigate={setPage}
                showHero={false}
                initialInput={sharedContent}
                initialFile={sharedAttachment}
              />
            </>}

            {page === "weather" && <SafetyRadar signals={weather} />}
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
      {page !== "home" && page !== "scan" && page !== "proof" && (
        <button className="sw-fab" onClick={() => setPage("scan")}>
          <span style={{ fontSize: 20 }}>🛡️</span>
          <span className="sw-fab-label">Scan now</span>
        </button>
      )}
    </div>
    </I18nProvider>
  );
}
