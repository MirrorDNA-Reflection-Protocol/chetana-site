import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, X } from "lucide-react";
import { PageId } from "./types";
import {
  BackgroundMesh, Nav, SafetyRadar, Atlas, TrustPage, PanicPage,
  IncidentStepper, FamilyPage, PartnerPage, Footer
} from "./components";
import ProofPage from "./ProofPage";
import VigilancePage from "./VigilancePage";
import StoryPage from "./StoryPage";
import { threats, weather } from "./data";
import ChetanaV0Experience from "./ChetanaV0Experience";
import OpsAnalyticsPage from "./OpsAnalyticsPage";
import { I18nProvider } from "./i18n";

type DirectScanIntent = "share" | "shortcut";
type BeforeInstallPromptEvent = Event & {
  platforms?: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const INSTALL_DISMISSED_KEY = "chetana_install_prompt_dismissed_at";
const INSTALL_DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const pageAnim = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -12 }, transition: { duration: 0.25 } };

function isInstallSurfacePage(page: PageId): boolean {
  return page === "home" || page === "scan" || page === "consumer";
}

function isInstalledDisplayMode(): boolean {
  const navWithStandalone = navigator as Navigator & { standalone?: boolean };
  return Boolean(
    navWithStandalone.standalone ||
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.matchMedia?.("(display-mode: fullscreen)").matches ||
      window.matchMedia?.("(display-mode: minimal-ui)").matches,
  );
}

function isLikelyMobileBrowser(): boolean {
  return window.innerWidth <= 820 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function installPromptDismissedRecently(): boolean {
  const dismissedAt = Number(localStorage.getItem(INSTALL_DISMISSED_KEY) || 0);
  return dismissedAt > 0 && Date.now() - dismissedAt < INSTALL_DISMISS_TTL_MS;
}

function hasCompletedScamCheck(): boolean {
  return Number(localStorage.getItem("chetana_v0_scan_count") || 0) > 0;
}

function initialPageFromLocation(): PageId {
  const params = new URLSearchParams(window.location.search);
  const requestedPage = params.get("page");
  if (requestedPage === "ops" || params.get("ops") === "1" || window.location.pathname === "/ops") {
    return "ops";
  }
  if (requestedPage === "partners" || window.location.pathname === "/partners") {
    return "partners";
  }
  return "home";
}

function isScamCheckAction(action: string | null): boolean {
  return action === "scan" || action === "scam_check";
}

export default function App() {
  const [page, _setPage] = useState<PageId>(() => initialPageFromLocation());
  const [termsAccepted, setTermsAccepted] = useState(() => !!localStorage.getItem("chetana_terms_accepted"));
  const [pendingPage, setPendingPage] = useState<PageId>("scan");
  const [sharedContent, setSharedContent] = useState<string | null>(null);
  const [sharedAttachment, setSharedAttachment] = useState<File | null>(null);
  const [directScanIntent, setDirectScanIntent] = useState<DirectScanIntent | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installBannerVisible, setInstallBannerVisible] = useState(false);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [appInstalled, setAppInstalled] = useState(() => isInstalledDisplayMode());

  const syncPageUrl = (nextPage: PageId, replace = false) => {
    const params = new URLSearchParams(window.location.search);
    const nextPath = window.location.pathname === "/ops" || window.location.pathname === "/partners"
      ? "/"
      : window.location.pathname;
    if (nextPage === "ops" || nextPage === "partners") {
      params.set("page", nextPage);
    } else {
      params.delete("page");
      params.delete("ops");
      params.delete("days");
    }
    const query = params.toString();
    const nextUrl = `${nextPath}${query ? `?${query}` : ""}`;
    if (replace) {
      window.history.replaceState({ page: nextPage }, "", nextUrl);
    } else {
      window.history.pushState({ page: nextPage }, "", nextUrl);
    }
  };

  const setPage = (p: PageId) => {
    setDirectScanIntent(null);
    if (!termsAccepted && p !== "proof" && p !== "home" && p !== "panic" && p !== "ops" && p !== "partners") {
      setPendingPage(p);
      _setPage("proof");
      syncPageUrl("proof", true); // replace: back should skip the gate
    } else {
      _setPage(p);
      syncPageUrl(p);
    }
  };

  // Handle share target intake + PWA shortcuts on load
  useEffect(() => {
    let cancelled = false;

    const bootFromIntent = async () => {
      const params = new URLSearchParams(window.location.search);
      const isShare = params.has("share");
      const isAction = isScamCheckAction(params.get("action"));
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
              for (let i = 0; i < fileCount; i += 1) {
                const fileResp = await cache.match(`/shared-file-${i}`);
                if (!fileResp) continue;
                const blob = await fileResp.blob();
                const contentType = fileResp.headers.get("Content-Type") || blob.type || "";
                if (contentType.startsWith("image/") || blob.type.startsWith("image/")) {
                  const filename = fileResp.headers.get("X-Filename") || `shared-screenshot-${Date.now()}`;
                  sharedFile = new File([blob], filename, {
                    type: contentType || blob.type || "image/png",
                  });
                  break;
                }
              }

              for (let i = 0; i < fileCount; i += 1) {
                await cache.delete(`/shared-file-${i}`);
              }
            }

            const unsupportedFileTypes = Array.isArray(payload.unsupportedFileTypes)
              ? payload.unsupportedFileTypes.filter((item: unknown) => typeof item === "string")
              : [];
            if (!sharedText && !sharedFile && unsupportedFileTypes.length > 0) {
              sharedText = "Shared file received, but Chetana's quick scanner currently works best with screenshot images. Take a screenshot of it or paste the message text here.";
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
        setDirectScanIntent(isShare ? "share" : "shortcut");
        _setPage("scan");
        window.history.replaceState({ page: "scan" }, "", "/");
      }
    };

    void bootFromIntent();

    return () => {
      cancelled = true;
    };
  }, []);

  // Browser back/forward support
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const target: PageId = event.state?.page || initialPageFromLocation();
      _setPage(target);
    };
    window.addEventListener("popstate", onPopState);
    // Seed initial state so the first back works
    window.history.replaceState({ page }, "", window.location.href);
    return () => window.removeEventListener("popstate", onPopState);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [page]);

  useEffect(() => {
    if (
      appInstalled ||
      directScanIntent ||
      !isInstallSurfacePage(page) ||
      installPromptDismissedRecently() ||
      !hasCompletedScamCheck()
    ) return;
    if (installPrompt || isLikelyMobileBrowser()) {
      setInstallBannerVisible(true);
    }
  }, [appInstalled, directScanIntent, installPrompt, page]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      if (!installPromptDismissedRecently() && hasCompletedScamCheck()) {
        setInstallBannerVisible(true);
      }
    };

    const onAppInstalled = () => {
      setAppInstalled(true);
      setInstallPrompt(null);
      setInstallBannerVisible(false);
      setInstallHelpOpen(false);
      localStorage.setItem("chetana_installed_at", String(Date.now()));
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

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

  const dismissInstallBanner = () => {
    localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()));
    setInstallBannerVisible(false);
    setInstallHelpOpen(false);
  };

  const installChetana = async () => {
    if (!installPrompt) {
      setInstallHelpOpen(true);
      return;
    }

    setInstalling(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice.catch(() => null);
      if (choice?.outcome === "accepted") {
        setInstallBannerVisible(false);
      } else {
        dismissInstallBanner();
      }
      setInstallPrompt(null);
    } finally {
      setInstalling(false);
    }
  };

  const showInstallBanner = (
    installBannerVisible &&
    isInstallSurfacePage(page) &&
    !directScanIntent &&
    !appInstalled &&
    hasCompletedScamCheck()
  );

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
      {showInstallBanner && (
        <div className={installHelpOpen ? "app-install-banner expanded" : "app-install-banner"}>
          <div className="app-install-copy">
            <strong>Install once. Share screenshots straight to Chetana.</strong>
            <span>
              {installPrompt
                ? "Tap Install now. After that, use Share from WhatsApp, Messages, or Gallery and choose Chetana."
                : "On Android Chrome: open the browser menu, choose Add to Home screen, then Share screenshots to Chetana."}
            </span>
            {installHelpOpen && (
              <span className="app-install-steps">
                After install: take a screenshot, tap Share, choose Chetana, and the scanner opens with evidence attached.
              </span>
            )}
          </div>
          <div className="app-install-actions">
            <button className="app-install-primary" onClick={installChetana} disabled={installing}>
              <Download size={16} />
              {installPrompt ? (installing ? "Opening..." : "Install") : "Show steps"}
            </button>
            <button className="app-install-dismiss" onClick={dismissInstallBanner}>
              <X size={16} />
              Later
            </button>
          </div>
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

            {page === "partners" && <PartnerPage onNavigate={setPage} />}

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
                directScanIntent={directScanIntent}
              />
            </>}

            {page === "ops" && <OpsAnalyticsPage onNavigate={setPage} />}
            {page === "weather" && <SafetyRadar signals={weather} />}
            {page === "trust" && <TrustPage />}
            {page === "proof" && (
              <ProofPage
                onAccepted={() => {
                  setTermsAccepted(true);
                  _setPage(pendingPage);
                  syncPageUrl(pendingPage, true); // replace: proof page exits history
                }}
              />
            )}
            {page === "panic" && <PanicPage />}
            {page === "incident" && <IncidentStepper onNavigate={setPage} />}
            {page === "vigilance" && <VigilancePage />}
            {page === "story" && <StoryPage />}
            {page === "family" && <FamilyPage />}

          </motion.div>
        </AnimatePresence>
      </main>
      {page !== "ops" && <Footer onNavigate={setPage} />}

      {/* FAB — goes to scan page (with proof gate) */}
      {page !== "home" && page !== "scan" && page !== "proof" && page !== "ops" && page !== "partners" && (
        <button className="sw-fab" onClick={() => setPage("scan")}>
          <span style={{ fontSize: 20 }}>🛡️</span>
          <span className="sw-fab-label">Scan now</span>
        </button>
      )}
    </div>
    </I18nProvider>
  );
}
