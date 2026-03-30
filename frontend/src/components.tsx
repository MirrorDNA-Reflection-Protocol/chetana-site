import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import cytoscape from "cytoscape";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import {
  Shield, ShieldCheck, ShieldAlert, Search, Send, MessageCircle, X,
  Link2, Phone, CreditCard, AlertTriangle, CheckCircle, ChevronRight,
  Globe, Users, Building2, Zap, Eye, BookOpen, BarChart3, Lock, Smartphone,
  TrendingUp, FileWarning, UserCheck, Layers, Mic, QrCode, ImageIcon,
  Upload, FileText, Bot, Paperclip, ChevronDown, Volume2, Flag, Info, Share2
} from "lucide-react";
import { PageId, ThreatEntry, WeatherSignal, GraphNode, GraphEdge, ScanResult } from "./types";
import { ShieldAnim, FloatingCards, RadarAnim, CountUp, ScanAnim, GlobeAnim } from "./animations";
import { trackVigilance } from "./VigilancePage";
import { AuroraBackground, SpotlightCard, GridPattern, ScrollReveal, Meteors } from "./effects";
import { localScreenshotScan, localPatternScan } from "./localScanner";
// i18n handled by Google Translate widget (index.html)

const API = import.meta.env.DEV ? "http://localhost:8093" : "";
const fadeIn = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5 } };
const fadeInDelay = (d: number) => ({ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: d } });
const PASTE_LANGUAGE_PROMPTS = [
  { language: "English", text: "just paste it" },
  { language: "हिन्दी", text: "बस पेस्ट करो" },
  { language: "বাংলা", text: "শুধু পেস্ট করুন" },
  { language: "தமிழ்", text: "இதை பேஸ்ட் பண்ணுங்க" },
  { language: "తెలుగు", text: "ఇక్కడ పేస్ట్ చేయండి" },
  { language: "मराठी", text: "फक्त पेस्ट करा" },
];

/* ── Background Mesh (Aurora + Grid + Meteors) ───────────────── */
export function BackgroundMesh() {
  return (
    <>
      <AuroraBackground />
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
        <GridPattern size={40} color="rgba(59, 130, 246, 0.06)" />
        <Meteors count={8} />
      </div>
    </>
  );
}

/* ── Nav ─────────────────────────────────────────────────────── */
export function Nav({ page, setPage }: { page: PageId; setPage: (p: PageId) => void }) {
  const [open, setOpen] = useState(false);
  const items: { id: PageId; label: string; restricted?: boolean; urgent?: boolean }[] = [
    { id: "home", label: "Home" },
    { id: "scan", label: "Check" },
    { id: "panic", label: "Money Gone?", urgent: true },
    { id: "merchant", label: "For Shops" },
    { id: "trust", label: "Trust" },
  ];
  const navigate = (id: PageId) => { setPage(id); setOpen(false); };
  return (
    <nav className="nav">
      <div className="brand" onClick={() => navigate("home")}>
        <div className="brand-glyph"><img src="/logo.png" alt="Chetana" style={{ width: 28, height: 28, borderRadius: 6 }} /></div>
        <div>
          <div className="brand-title">Chetana</div>
          <div className="brand-sub">check karo, safe raho</div>
        </div>
      </div>
      <div className={`nav-links${open ? " open" : ""}`}>
        {items.map((item) => (
          <button
            key={item.id}
            className={`nav-btn${page === item.id ? " active" : ""}${item.urgent ? " nav-urgent" : ""}`}
            onClick={() => navigate(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="nav-right">
        <div className="not-govt-badge" title="Chetana is a private AI tool. Not affiliated with Government of India, RBI, UIDAI, or any law enforcement.">Not a govt service</div>
        <button className="nav-hamburger" onClick={() => setOpen(o => !o)} aria-label="Menu">
          <span /><span /><span />
        </button>
      </div>
    </nav>
  );
}

/* ── Onboarding Flow ─────────────────────────────────────────── */
export function OnboardingFlow({ onComplete }: { onComplete: (target: PageId) => void }) {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const steps = [
    { title: "Welcome to Chetana", subtitle: "India's trust layer against scams and fraud", options: null },
    {
      title: "What brought you here?",
      subtitle: "We'll personalize your experience",
      options: [
        { id: "suspicious", icon: <AlertTriangle size={18} />, label: "I received something suspicious", color: "var(--danger-light)" },
        { id: "verify", icon: <Search size={18} />, label: "I want to verify something", color: "var(--amber-light)" },
        { id: "learn", icon: <BookOpen size={18} />, label: "I want to learn to stay safe", color: "var(--primary-light)" },
        { id: "business", icon: <Building2 size={18} />, label: "I'm protecting my business", color: "var(--saffron-glow)" },
      ],
    },
  ];

  const handleNext = () => {
    if (step === 0) { setStep(1); return; }
    if (step === 1 && selected) {
      const map: Record<string, PageId> = { suspicious: "consumer", verify: "consumer", learn: "atlas", business: "merchant" };
      onComplete(map[selected] || "home");
    }
  };

  return (
    <AnimatePresence>
      <motion.div className="onboarding-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.div className="onboarding-card" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 25 }}>
          <div className="onboarding-steps">
            {[0, 1].map(i => <div key={i} className={`onboarding-dot ${step === i ? "active" : ""}`} />)}
          </div>
          <div className="onboarding-icon-big" style={{ background: "transparent", width: "auto", height: "auto" }}><ShieldAnim size={80} /></div>
          <h2>{steps[step].title}</h2>
          <p>{steps[step].subtitle}</p>
          {steps[step].options && (
            <div className="onboarding-options">
              {steps[step].options!.map(opt => (
                <button key={opt.id} className={`onboarding-option ${selected === opt.id ? "selected" : ""}`} onClick={() => setSelected(opt.id)}>
                  <div className="onboarding-option-icon" style={{ background: opt.color }}>{opt.icon}</div>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          )}
          <button className="primary" onClick={handleNext} disabled={step === 1 && !selected} style={{ width: "100%" }}>
            {step === 0 ? "Get Started" : "Continue"} <ChevronRight size={16} />
          </button>
          <button className="onboarding-skip" onClick={() => onComplete("home")}>Skip for now</button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ── Ticker Banner (Live from MirrorRadar) ───────────────────── */
const FALLBACK_TICKER = [
  { icon: "🔴", text: "Rs 22,495 crore lost to cyber fraud in India (2025) — I4C/NCRP data" },
  { icon: "⚡", text: "24 lakh+ fraud complaints filed in 2025 — I4C/NCRP data" },
  { icon: "🟠", text: "1 in 5 UPI users affected by fraud in last 3 years — LocalCircles/NPCI survey" },
  { icon: "🔴", text: "51% of scam victims never report — I4C survey. Screenshot suspicious messages before they disappear" },
  { icon: "⚡", text: "Got a suspicious message? Screenshot it and check on Chetana — free, instant, 12+ languages" },
];

export function AlertBanner({ onNavigate }: { onNavigate: (target: PageId) => void }) {
  const [items, setItems] = useState(FALLBACK_TICKER);
  useEffect(() => {
    let cancelled = false;

    fetch(`${API}/api/radar/live`)
      .then(r => r.json())
      .then(data => {
        const live = (data.items || [])
          .slice(0, 12)
          .map((item: any) => ({
            icon: item.icon || "🔴",
            text: (item.title || item.text || "").replace(/<[^>]+>/g, "").trim().slice(0, 140),
          }))
          .filter((item: any) => item.text.length > 18);

        if (!cancelled && live.length >= 3) {
          setItems(live);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div className="ticker-banner">
      <div className="ticker-label">
        <span className="ticker-dot" />
        LIVE
      </div>
      <div className="ticker-track-wrap">
        <div className="ticker-track">
          {[...items, ...items].map((item, i) => (
            <span key={i} className="ticker-item" onClick={() => onNavigate("weather")}>
              <span className="ticker-icon">{item.icon}</span>
              {item.text}
              <span className="ticker-sep">·</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Hero ────────────────────────────────────────────────────── */
function PastePromptMorph() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setIndex((current) => (current + 1) % PASTE_LANGUAGE_PROMPTS.length);
    }, 2200);

    return () => window.clearInterval(intervalId);
  }, []);

  const phrase = PASTE_LANGUAGE_PROMPTS[index];

  return (
    <div className="hero-language-morph" aria-label="Paste in any language">
      <div className="hero-language-hint">
        <Globe size={14} />
        <span>Paste in any language</span>
      </div>
      <div className="hero-language-stage">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={`${phrase.language}-${phrase.text}`}
            className="hero-language-card"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <span className="hero-language-name">{phrase.language}</span>
            <strong className="hero-language-text">{phrase.text}</strong>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export function Hero({ onNavigate }: { onNavigate: (target: PageId) => void }) {
  const jumpToScanner = () => {
    const node = document.getElementById("front-door-scanner");
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    onNavigate("scan");
  };

  return (
    <section className="hero hero-compressed">
      <div className="hero-watermark">CHETANA</div>
      <div className="hero-copy-shell">
        <motion.div className="kicker kicker-glow" {...fadeInDelay(0.05)}>
          <ShieldCheck size={14} />
          Built for India
        </motion.div>
        <motion.h1 {...fadeInDelay(0.12)}>
          Got a suspicious message?
          <br />
          Check before you click or pay.
        </motion.h1>
        <motion.p className="hero-lede" {...fadeInDelay(0.18)}>
          WhatsApp, SMS, UPI, QR, parcel message, KYC alert, police threat, job offer, or payment screenshot.
          Chetana helps you understand what to do next.
        </motion.p>
        <motion.div {...fadeInDelay(0.22)}>
          <PastePromptMorph />
        </motion.div>
        <motion.div className="hero-actions" {...fadeInDelay(0.24)}>
          <button className="hero-primary-btn" onClick={jumpToScanner}>
            <Upload size={17} />
            Paste or upload
          </button>
          <button className="hero-secondary-btn" onClick={() => onNavigate("panic")}>
            <AlertTriangle size={17} />
            Money gone?
          </button>
        </motion.div>
        <motion.div className="hero-meta" {...fadeInDelay(0.3)}>
          <span className="hero-trust-pill">Free to use</span>
          <span className="hero-trust-pill">WhatsApp, SMS, UPI, QR</span>
          <span className="hero-trust-pill">Local checks first</span>
          <span className="hero-trust-pill">12 Indian languages</span>
        </motion.div>
        <motion.p className="hero-note" {...fadeInDelay(0.34)}>
          Want to share straight from WhatsApp? Install Chetana on your Android phone first.
        </motion.p>
      </div>
    </section>
  );
}

export function FrontDoorSection({
  onNavigate,
  onRequireProof,
  onCouncilUpdate,
  initialInput,
  initialFile,
}: {
  onNavigate: (target: PageId) => void;
  onRequireProof?: () => void;
  onCouncilUpdate?: (data: any) => void;
  initialInput?: string | null;
  initialFile?: File | null;
}) {
  const routes = [
    {
      icon: <Search size={18} />,
      title: "Someone sent a suspicious message",
      copy: "Paste the text or upload the screenshot, voice note, or PDF.",
      action: "scan" as PageId,
    },
    {
      icon: <AlertTriangle size={18} />,
      title: "I already paid or shared OTP/details",
      copy: "Go straight to the help flow. If money moved, call 1930 first.",
      action: "panic" as PageId,
    },
    {
      icon: <Building2 size={18} />,
      title: "I got a payment screenshot",
      copy: "For shopkeepers, sellers, and delivery staff checking fake payment proof before handing over goods.",
      action: "merchant" as PageId,
    },
  ];

  const facts = [
    {
      title: "Local-first where possible",
      copy: "Text and screenshot reading start on your device when Chetana can make a strong local call.",
    },
    {
      title: "Server help only when needed",
      copy: "Links, reputation checks, and some deeper media checks may use secure server analysis.",
    },
    {
      title: "1930 stays visible",
      copy: "For money fraud in India, call 1930 fast and then finish the complaint on cybercrime.gov.in.",
    },
  ];

  return (
    <section className="front-door-shell">
      <div className="front-door-story">
        <div className="front-door-label">Start here</div>
        <h2>Three clear starts. No cyber jargon.</h2>
        <p>
          Chetana should feel like a calm, street-smart guide for India: check suspicious content,
          help people who already acted, and help shops verify payment proof before goods change hands.
        </p>
        <div className="front-door-route-list">
          {routes.map((route) => (
            <button key={route.title} className="front-door-route" onClick={() => onNavigate(route.action)}>
              <span className="front-door-route-icon">{route.icon}</span>
              <span>
                <strong>{route.title}</strong>
                <small>{route.copy}</small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
        <div className="front-door-facts">
          {facts.map((fact) => (
            <div key={fact.title} className="front-door-fact">
              <strong>{fact.title}</strong>
              <p>{fact.copy}</p>
            </div>
          ))}
        </div>
        <div className="front-door-help">
          <div>
            <span className="front-door-help-label">Need help right now?</span>
            <strong>Call 1930 if money already moved.</strong>
            <small>After that, finish the complaint on cybercrime.gov.in so the case is properly logged.</small>
          </div>
          <div className="front-door-help-actions">
            <a href="tel:1930" className="front-door-help-btn">Call 1930</a>
            <button className="front-door-help-btn front-door-help-btn-secondary" onClick={() => onNavigate("panic")}>
              Open help steps
            </button>
          </div>
        </div>
      </div>
      <div className="front-door-scanner" id="front-door-scanner">
        <ScanWidget
          onRequireProof={onRequireProof}
          inline
          onCouncilUpdate={onCouncilUpdate}
          initialInput={initialInput}
          initialFile={initialFile}
        />
      </div>
    </section>
  );
}

export function ShareInstallSection({ onNavigate }: { onNavigate: (target: PageId) => void }) {
  const steps = [
    "Install Chetana on your Android home screen.",
    "From WhatsApp, Messages, Gallery, or Files, tap Share and pick Chetana.",
    "Chetana opens with your screenshot, voice note, or text ready to check. If share is not available, upload or paste manually.",
  ];

  return (
    <ScrollReveal>
      <section className="front-door-install">
        <div className="front-door-install-copy">
          <div className="front-door-label">PWA route</div>
          <h2>Install once. Share from WhatsApp.</h2>
          <p>
            The fastest mobile flow is simple: install Chetana on your Android phone once, then share screenshots,
            audio, video, or PDFs straight from WhatsApp or your gallery into the checker.
          </p>
          <ol className="front-door-install-steps">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
        <div className="front-door-install-notes">
          <div className="front-door-note-card">
            <Smartphone size={18} />
            <div>
              <strong>Best mobile flow</strong>
              <p>Android install plus share sheet into Chetana.</p>
            </div>
          </div>
          <div className="front-door-note-card">
            <Lock size={18} />
            <div>
              <strong>Truthful privacy copy</strong>
              <p>Text checks start locally. Some deeper checks may go to the server to help with nuance.</p>
            </div>
          </div>
          <div className="front-door-install-actions">
            <button className="front-door-help-btn" onClick={() => onNavigate("trust")}>See data handling</button>
            <button className="front-door-help-btn front-door-help-btn-secondary" onClick={() => onNavigate("merchant")}>Shop payment checks</button>
          </div>
        </div>
      </section>
    </ScrollReveal>
  );
}

/* ── Stats Strip ─────────────────────────────────────────────── */
export function StatsStrip() {
  const [stats, setStats] = useState({ total_scans: 0, scams_caught: 0, languages: 12 });
  const personalScans = parseInt(localStorage.getItem("chetana_scan_count") || "0");
  const trustLevel = personalScans >= 50 ? "Sentinel" : personalScans >= 20 ? "Guardian" : personalScans >= 5 ? "Vigilant" : personalScans >= 1 ? "Aware" : "New";
  const trustColor = personalScans >= 50 ? "#a78bfa" : personalScans >= 20 ? "#3b82f6" : personalScans >= 5 ? "#22c55e" : personalScans >= 1 ? "#f59e0b" : "rgba(255,255,255,0.3)";

  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      try {
        const [radarResp, statsResp, languagesResp] = await Promise.all([
          fetch(`${API}/api/radar/public`),
          fetch(`${API}/api/stats/live`),
          fetch(`${API}/api/languages`),
        ]);

        const radar = radarResp.ok ? await radarResp.json() : {};
        const liveStats = statsResp.ok ? await statsResp.json() : {};
        const languages = languagesResp.ok ? await languagesResp.json() : {};

        const totalScans = Math.max(
          Number(radar.total ?? 0),
          Number(radar.scans_today ?? 0),
          Number(liveStats.total_scans ?? 0),
        );
        const scamsCaught = Math.max(
          Number(radar.scams_week ?? 0),
          Number(radar.scams_today ?? 0),
          Number(liveStats.scams_caught ?? 0),
        );
        const liveCount = Math.max(Number(languages.live_count ?? 0), Number(liveStats.languages ?? 0), 12);

        if (!cancelled) {
          setStats({
            total_scans: totalScans,
            scams_caught: scamsCaught,
            languages: liveCount,
          });
        }
      } catch {
        if (!cancelled) {
          setStats(prev => ({ ...prev, languages: prev.languages || 12 }));
        }
      }
    };

    loadStats();
    const iv = setInterval(loadStats, 30000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);
  return (
    <ScrollReveal>
    <motion.div className="stats-strip" {...fadeInDelay(0.3)}>
      <div className="stat-item" translate="no">
        <div className="stat-value stat-value-glow">{stats.total_scans.toLocaleString()}</div>
        <div className="stat-label">Scans run</div>
      </div>
      <div className="stat-item" translate="no">
        <div className="stat-value stat-value-glow">{stats.scams_caught.toLocaleString()}</div>
        <div className="stat-label">Threats caught</div>
      </div>
      <div className="stat-item" translate="no">
        <div className="stat-value stat-value-glow">{stats.languages.toLocaleString()}</div>
        <div className="stat-label">Languages</div>
      </div>
      {personalScans > 0 && (
        <div className="stat-item" translate="no" style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: 24 }}>
          <div className="stat-value" style={{ color: trustColor, fontSize: 18 }}>{trustLevel}</div>
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Shield size={10} style={{ color: trustColor }} />
            {personalScans} scans — you helped protect others
          </div>
        </div>
      )}
    </motion.div>
    </ScrollReveal>
  );
}

/* ── ScanBox / ScanChat — AI-powered chat scanner ─────────────── */
type ScanMode = "message" | "link" | "upi" | "phone" | "media" | "voice" | "qr";

interface CouncilVote {
  model: string;
  region: string;
  score: number;
  verdict: string;
  reason: string;
}

interface ChatMsg {
  id: number;
  role: "user" | "bot";
  text: string;
  scanResult?: { verdict: string; score: number; signals: string[]; action: string; trust_state?: string; reason_codes?: string[]; kavach_score?: number; council_score?: number; council_agreement?: number; council_votes?: CouncilVote[] };
  file?: string;
  suggestions?: string[];
}

/* Auto-detect what the user pasted */
function detectInputType(text: string): ScanMode {
  const t = text.trim();
  // URL
  if (/^https?:\/\//i.test(t) || /^www\./i.test(t) || /\.[a-z]{2,}\//i.test(t)) return "link";
  // UPI ID
  if (/^[a-zA-Z0-9._-]+@[a-zA-Z]{2,}$/i.test(t)) return "upi";
  // Phone number (Indian)
  if (/^(\+91|91|0)?[6-9]\d{9}$/.test(t.replace(/[\s-]/g, ""))) return "phone";
  // Default: message scan
  return "message";
}

function detectFileType(file: File): ScanMode {
  if (file.type.startsWith("audio/")) return "voice";
  if (file.type.startsWith("image/") || file.type.startsWith("video/") || file.type === "application/pdf") return "media";
  return "media";
}

function verdictClass(v: string, trustState?: string) {
  if (trustState === "blocked" || v === "SUSPICIOUS" || v === "HIGH") return "verdict-suspicious";
  if (trustState === "inspect" || v === "UNCLEAR" || v === "MEDIUM") return "verdict-unclear";
  return "verdict-low-risk";
}

function trustLabel(trustState?: string): string {
  if (trustState === "blocked") return "Blocked";
  if (trustState === "inspect") return "Inspect";
  if (trustState === "unverified") return "Unverified";
  if (trustState === "trusted") return "Trusted";
  return "";
}

function buildBotReply(mode: ScanMode, data: any, fileName?: string): { text: string; scanResult: ChatMsg["scanResult"]; suggestions: string[] } {
  const score = data.risk_score ?? data.score ?? data.threat_score ?? 0;
  const verdict = data.verdict ?? data.risk_level?.toUpperCase() ?? (score >= 70 ? "SUSPICIOUS" : score >= 40 ? "UNCLEAR" : "LOW_RISK");
  const signals: string[] = data.why_flagged || data.signals || data.red_flags || [];
  const action = data.action_eligibility || data.recommended_action || "";
  const explanation = data.explanation || data.analysis || "";

  let text = "";

  if (verdict === "SUSPICIOUS" || verdict === "HIGH") {
    text = `**High scam risk** (${score}/100)\n\n`;
    if (explanation) text += explanation + "\n\n";
    text += "**Red flags:**\n";
    if (signals.length) text += signals.slice(0, 5).map(s => `• ${s}`).join("\n");
    else text += "• Matches known scam patterns\n• Urgency or pressure tactics detected";
    text += "\n\n**What to do now:**\n• Do not click, pay, or share OTPs\n• Block the sender\n• Report to cybercrime.gov.in or call 1930";
    text += "\n\n**How to avoid this in the future:**\n• Never share OTPs, PINs, or passwords with anyone\n• Verify unknown contacts by calling back on an official number\n• If it feels urgent, it's probably a scam — real banks don't rush you";
  } else if (verdict === "UNCLEAR" || verdict === "MEDIUM") {
    text = `**Needs caution** (${score}/100)\n\n`;
    if (explanation) text += explanation + "\n\n";
    text += "**What looks off:**\n";
    if (signals.length) text += signals.slice(0, 4).map(s => `• ${s}`).join("\n");
    else text += "• Some suspicious patterns detected — not certain";
    text += "\n\n**What to do now:**\n• Don't act immediately — pause and verify\n• Call the sender on a known number to confirm\n• Forward to a trusted person for a second opinion";
    text += "\n\n**How to stay safe:**\n• Always verify payment requests through a separate channel\n• Check URLs carefully — one wrong letter = fake site\n• When in doubt, don't click";
  } else {
    text = `**Looks safe** (${score}/100)\n\n`;
    if (explanation) text += explanation + "\n\n";
    else text += "No obvious scam signals found.\n\n";
    text += "**Stay safe anyway:**\n• Never share OTPs or passwords, even if asked by \"your bank\"\n• Bookmark your bank's real website — don't click links in messages\n• Check back here anytime something feels off";
  }

  // Context-aware follow-ups based on scan type + verdict
  let suggestions: string[];
  if (verdict === "SUSPICIOUS" || verdict === "HIGH") {
    const typeQ = mode === "link" ? "Is this a phishing site?" : mode === "upi" ? "Should I block this UPI ID?" : mode === "phone" ? "Should I block this number?" : mode === "media" || mode === "voice" ? "Could this be a deepfake?" : "How do I report this?";
    suggestions = [typeQ, "What if I already paid?", "Share this result", "Check something else"];
  } else if (verdict === "UNCLEAR" || verdict === "MEDIUM") {
    const typeQ = mode === "link" ? "How to spot a fake website?" : mode === "upi" ? "How to verify a UPI ID?" : mode === "phone" ? "How to check a phone number?" : "What are common scam signs?";
    suggestions = ["How do I verify this?", typeQ, "Share this result", "Check something else"];
  } else {
    suggestions = ["What scams are trending?", "My scan history", "Share this result", "Check something else"];
  }

  const trust_state = data.trust_state || (verdict === "SUSPICIOUS" ? "blocked" : verdict === "UNCLEAR" ? "inspect" : "trusted");
  const reason_codes: string[] = data.reason_codes || [];
  const kavach_score = data.kavach_score;
  const council_score = data.council_score;
  const council_agreement = data.council_agreement;
  const council_votes: CouncilVote[] = data.council_votes || [];
  return { text, scanResult: { verdict, score, signals, action, trust_state, reason_codes, kavach_score, council_score, council_agreement, council_votes }, suggestions };
}

const LANGUAGES = [
  { code: "en", label: "EN", name: "English" },
  { code: "hi", label: "हि", name: "Hindi" },
  { code: "ta", label: "த", name: "Tamil" },
  { code: "te", label: "తె", name: "Telugu" },
  { code: "bn", label: "বা", name: "Bengali" },
  { code: "mr", label: "म", name: "Marathi" },
  { code: "gu", label: "ગુ", name: "Gujarati" },
  { code: "kn", label: "ಕ", name: "Kannada" },
  { code: "ml", label: "മ", name: "Malayalam" },
  { code: "pa", label: "ਪੰ", name: "Punjabi" },
  { code: "or", label: "ଓ", name: "Odia" },
  { code: "ur", label: "اردو", name: "Urdu" },
];

const LANG_TO_BCP47: Record<string, string> = {
  en: "en-IN", hi: "hi-IN", ta: "ta-IN", te: "te-IN", bn: "bn-IN",
  mr: "mr-IN", gu: "gu-IN", kn: "kn-IN", ml: "ml-IN", pa: "pa-IN",
  or: "or-IN", ur: "ur-IN",
};

function getSpeechRecognition(): (new () => any) | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// Auto-detect browser language, map to supported Chetana language
function detectBrowserLang(): string {
  const supported = LANGUAGES.map(l => l.code);
  const browserLangs = navigator.languages || [navigator.language || "en"];
  for (const bl of browserLangs) {
    const code = bl.split("-")[0].toLowerCase();
    if (supported.includes(code)) return code;
  }
  return "en";
}

export function ScanBox({ onRequireProof, onNavigate }: { onRequireProof?: () => void; onNavigate?: (p: PageId) => void } = {}) {
  const [lang, setLang] = useState(() => localStorage.getItem("chetana_lang") || detectBrowserLang());
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const scanCount = parseInt(localStorage.getItem("chetana_scan_count") || "0");
  const isReturning = scanCount > 0;
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [listening, setListening] = useState(false);
  const canSend = (input.trim().length > 0 || !!file) && !loading;
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const msgId = useRef(1);
  const [incidentMode, setIncidentMode] = useState<{ verdict: string; score?: number; signals?: string[]; trust_state?: string } | null>(null);

  const SpeechRecClass = useMemo(() => getSpeechRecognition(), []);

  const toggleMic = () => {
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    if (!SpeechRecClass) return;
    const recognition = new SpeechRecClass();
    recognition.lang = LANG_TO_BCP47[lang] || "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev ? prev + " " + transcript : transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const speakText = (text: string) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.replace(/\*\*/g, ""));
      utterance.lang = LANG_TO_BCP47[lang] || "en-IN";
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const addMsg = (msg: Omit<ChatMsg, "id">) => {
    setMessages(prev => [...prev, { ...msg, id: msgId.current++ }]);
  };

  const handleSuggestion = (s: string) => {
    const lower = s.toLowerCase();
    if (lower === "call 1930") { window.open("tel:1930"); return; }
    if (lower === "open cybercrime.gov.in") { window.open("https://cybercrime.gov.in", "_blank"); return; }
    if (lower === "alert family") {
      if (navigator.share) {
        navigator.share({ title: "Chetana Alert", text: "I may have encountered a scam. Check this with me: https://chetana.activemirror.ai" }).catch(() => {});
      } else {
        const t = encodeURIComponent("I may have encountered a scam. Check this with me: https://chetana.activemirror.ai");
        window.open(`https://wa.me/?text=${t}`, "_blank");
      }
      addMsg({ role: "bot", text: "Family alert shared. Stay calm — you're doing the right thing." });
      return;
    }
    if (lower === "re-check with more context") {
      addMsg({ role: "bot", text: "Paste the full conversation, including any earlier messages. More context helps Chetana make a better call." });
      return;
    }
    if (lower === "help me verify safely") {
      addMsg({ role: "bot", text: "**Safe verification steps:**\n• Contact the sender through a known, official channel (not the number/link they gave you)\n• Search the phone number or UPI ID on Google — scam reports often surface\n• Ask a family member or friend for a second opinion\n• Check cybercrime.gov.in for similar reported patterns\n\nNever click links or call numbers provided in the suspicious message itself." });
      return;
    }
    if (lower.includes("history") || lower.includes("scan history")) {
      const history = JSON.parse(localStorage.getItem("chetana_history") || "[]");
      if (history.length === 0) {
        addMsg({ role: "bot", text: "No scans yet. Paste something suspicious above to get started." });
      } else {
        const summary = history.slice(0, 10).map((h: any) => {
          const d = new Date(h.ts);
          return `${h.verdict} (${h.score}/100) — ${h.type} — ${d.toLocaleDateString()}`;
        }).join("\n");
        addMsg({ role: "bot", text: `**Your last ${Math.min(history.length, 10)} scans:**\n${summary}\n\nTotal: ${history.length} scans. _check karo, safe raho._` });
      }
      return;
    }
    sendChat(s);
  };

  const handleSaveEvidence = async (msg: ChatMsg) => {
    if (!msg.scanResult) return;
    try {
      const resp = await fetch(`${API}/api/evidence/bundle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scan_result: msg.scanResult,
          original_text: msg.text,
          notes: ""
        })
      });
      const data = await resp.json();
      const blob = new Blob([JSON.stringify(data.evidence_pack || data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `evidence-pack-${data.incident_id || 'scan'}.json`;
      a.click();
      addMsg({ role: "bot", text: "Evidence pack saved. You can use this file when reporting to cybercrime authorities." });
    } catch (e) {
      addMsg({ role: "bot", text: "Failed to generate evidence pack. Please try again." });
    }
  };

  const handleReportNow = (msg: ChatMsg) => {
    const isFinancial = msg.text.toLowerCase().includes("bank") || msg.text.toLowerCase().includes("upi") || msg.text.toLowerCase().includes("payment") || msg.text.toLowerCase().includes("money");
    if (isFinancial) {
      window.open("tel:1930");
      addMsg({ role: "bot", text: "Dialing 1930 (National Cybercrime Helpline). Stay on the line to report financial fraud." });
    } else {
      window.open("https://sancharsaathi.gov.in/sancharsaathi/chakshu", "_blank");
      addMsg({ role: "bot", text: "Opening Chakshu portal. Report this communication fraud to the Department of Telecommunications." });
    }
  };

  const sendChat = async (text: string) => {
    addMsg({ role: "user", text });
    setLoading(true);
    try {
      const resp = await fetch(`${API}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, lang }) });
      const data = resp.ok ? await resp.json() : null;
      addMsg({ role: "bot", text: data?.reply || "Ask me about any scam or suspicious activity — I'm here to help.", suggestions: data?.suggestions });
    } catch {
      addMsg({ role: "bot", text: "I couldn't reach the server right now. Try again in a moment." });
    } finally { setLoading(false); }
  };

  const handleSend = async () => {
    if (!localStorage.getItem("chetana_terms_accepted")) { if (onRequireProof) onRequireProof(); return; }

    // File upload path
    if (file) {
      const fileMode = detectFileType(file);
      const isImage = file.type.startsWith("image/");
      addMsg({ role: "user", text: `Check this file: ${file.name}`, file: file.name });
      const currentFile = file;
      setFile(null); setLoading(true);
      try {
        const fd = new FormData(); fd.append("file", currentFile); fd.append("lang", lang);
        const endpoint = fileMode === "voice" ? "/api/voice/analyze" : isImage ? "/api/media/ocr" : "/api/media/analyze";
        const resp = await fetch(`${API}${endpoint}`, { method: "POST", body: fd });
        if (!resp.ok) throw new Error(`Server error (${resp.status})`);
        const data = await resp.json();
        const ocrNote = data.ocr_text ? `\n\n**Text found in image:**\n_"${data.ocr_text.slice(0, 200)}${data.ocr_text.length > 200 ? "..." : ""}"_` : "";
        const mode = data.ocr_text ? detectInputType(data.ocr_text) as ScanMode : fileMode;
        const { text, scanResult, suggestions } = buildBotReply(mode, data, currentFile.name);
        addMsg({ role: "bot", text: text + ocrNote, scanResult, suggestions });
        if (scanResult) recordScan(mode, scanResult);
      } catch (e: any) {
        addMsg({ role: "bot", text: `I couldn't complete that check right now. ${e.message || "Please try again."}`, suggestions: ["Try again"] });
      } finally { setLoading(false); }
      return;
    }

    if (!input.trim()) return;

    const userText = input.trim();
    addMsg({ role: "user", text: userText });
    setInput(""); setLoading(true);

    // Detect if it's a question rather than a scan
    const isQuestion = /^(what|how|why|who|is |does|can|tell|explain|help|when|where|i already|what should)/i.test(userText) && userText.length < 120;
    if (isQuestion) { await sendChat(userText); setLoading(false); return; }

    // Auto-detect input type
    const mode = detectInputType(userText);

    try {
      let resp: Response;
      if (mode === "upi") {
        resp = await fetch(`${API}/api/upi/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upi_id: userText, lang }) });
      } else if (mode === "phone") {
        resp = await fetch(`${API}/api/phone/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: userText, lang }) });
      } else if (mode === "link") {
        resp = await fetch(`${API}/api/link/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: userText, lang }) });
      } else {
        resp = await fetch(`${API}/api/scan/full`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: userText, lang }) });
      }

      if (!resp.ok) throw new Error(`Server error (${resp.status})`);
      const data = await resp.json();
      const { text, scanResult, suggestions } = buildBotReply(mode, data);
      addMsg({ role: "bot", text, scanResult, suggestions });
      if (scanResult) recordScan(mode, scanResult);
    } catch (e: any) {
      addMsg({ role: "bot", text: `I couldn't complete that check right now. ${e.message || "Please try again."}`, suggestions: ["Try again"] });
    } finally { setLoading(false); }
  };

  const recordScan = (mode: ScanMode, scanResult: NonNullable<ChatMsg["scanResult"]>) => {
    trackVigilance("scan", `${mode}: ${scanResult.verdict} (${scanResult.score}/100)`);
    try { new Audio("/ting.wav").play(); } catch {}
    try {
      const v = scanResult.verdict;
      if (v === "SUSPICIOUS" || v === "HIGH") navigator.vibrate([100, 50, 100, 50, 100]);
      else if (v === "UNCLEAR" || v === "MEDIUM") navigator.vibrate([80, 60, 80]);
      else navigator.vibrate(50);
    } catch {}
    fetch("/api/analytics/event", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ event: "scan", scan_type: mode, verdict: scanResult.verdict, score: scanResult.score }) }).catch(() => {});
    try {
      const history = JSON.parse(localStorage.getItem("chetana_history") || "[]");
      history.unshift({ verdict: scanResult.verdict, score: scanResult.score, type: mode, ts: Date.now() });
      if (history.length > 100) history.length = 100;
      localStorage.setItem("chetana_history", JSON.stringify(history));
      localStorage.setItem("chetana_scan_count", String((parseInt(localStorage.getItem("chetana_scan_count") || "0")) + 1));
    } catch {}
  };

  // Detected type indicator
  const detectedType = input.trim() ? detectInputType(input.trim()) : null;
  const typeLabels: Partial<Record<ScanMode, string>> = { message: "Message scan", link: "Link check", upi: "UPI check", phone: "Phone lookup", media: "Image/video", voice: "Voice check", qr: "QR scan" };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  };

  const hasResults = messages.length > 0;
  const lastResult = [...messages].reverse().find(m => m.role === "bot" && m.scanResult);

  return (
    <div
      className="tool"
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {/* Header */}
      <header className="tool-header">
        <div className="tool-brand">
          <img src="/logo.png" alt="Chetana" style={{ width: 28, height: 28, borderRadius: 8 }} />
          <div>
            <div className="tool-brand-name">Chetana</div>
            <div className="tool-brand-tag">check karo, safe raho</div>
          </div>
        </div>
        <div className="tool-header-right">
          <select className="tool-lang" value={lang} onChange={e => { setLang(e.target.value); localStorage.setItem("chetana_lang", e.target.value); }}>
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label} {l.name}</option>)}
          </select>
          {onNavigate && <button className="tool-link" onClick={() => onNavigate("atlas")}>Learn</button>}
          {onNavigate && <button className="tool-link" onClick={() => onNavigate("trust")}>About</button>}
        </div>
      </header>

      <div className="tool-main">
        {/* Left panel — identity + input */}
        <div className={`tool-input-panel${dragging ? " tool-dragging" : ""}`}>
          <div className="tool-hero">
            <h1 className="tool-tagline">check karo,<br />safe raho</h1>
            <p className="tool-desc">
              Screenshot it, upload it, or just paste it.
              Text, link, UPI ID, or phone number all work.
            </p>
            <p className="tool-desc-hi">
              बस पेस्ट करो, या screenshot upload करो.
            </p>
          </div>

          {file && (
            <div className="tool-file"><Paperclip size={13} /><span className="tool-file-name">{file.name}</span><span className="tool-file-size">{(file.size / 1024).toFixed(0)} KB</span><button onClick={() => setFile(null)}><X size={13} /></button></div>
          )}
          <textarea
            className="tool-textarea"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={file ? "Add a note (optional) or just hit Check..." : "Paste a suspicious message or link here, or upload a screenshot..."}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          />
          <div className="tool-input-bottom">
            <div className="tool-input-actions">
              <input ref={fileRef} type="file" accept="image/*,video/*,audio/*,application/pdf" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0] || null; setFile(f); e.target.value = ""; }} />
              <button className="tool-action" onClick={() => fileRef.current?.click()} title="Upload screenshot, photo, PDF, or audio"><Upload size={16} /></button>
              {SpeechRecClass && <button className={`tool-action${listening ? " tool-listening" : ""}`} onClick={toggleMic} title="Voice input"><Mic size={16} /></button>}
              {detectedType && detectedType !== "message" && (
                <span className="tool-detect">{typeLabels[detectedType]}</span>
              )}
              {file && !input.trim() && <span className="tool-detect" style={{ background: 'var(--safe-light, rgba(34,197,94,0.1))', color: 'var(--safe, #22c55e)' }}>File ready to check</span>}
            </div>
            <button className={`tool-check${canSend ? " tool-check-ready" : ""}`} onClick={handleSend} disabled={!canSend}>
              {loading ? "Checking..." : "Check →"}
            </button>
          </div>
          <div className="tool-trust-line">
            <ShieldCheck size={13} />
            <span>Free. No login. Local checks first. Server help when needed.</span>
          </div>
        </div>

        {/* Result panel */}
        <div className="tool-result-panel" ref={scrollRef}>
          {!hasResults && !loading && (
            <div className="tool-empty">
              <ShieldCheck size={36} style={{ opacity: 0.2, marginBottom: 8 }} />
              <p className="tool-empty-title">Your result will appear here</p>
              <div className="tool-catches">
                <p className="tool-catches-label">Chetana catches:</p>
                <div className="tool-catches-list">
                  <span>Fake KYC messages</span>
                  <span>UPI payment fraud</span>
                  <span>Phishing links</span>
                  <span>Digital arrest scams</span>
                  <span>Voice deepfakes</span>
                  <span>QR code traps</span>
                  <span>Job & lottery scams</span>
                  <span>Bank impersonation</span>
                </div>
              </div>
              <p className="tool-stat">Rs 22,495 crore lost to scams in India last year. Don't be next.</p>
            </div>
          )}
          {loading && (
            <div className="tool-checking">
              <div className="tool-dots"><span /><span /><span /></div>
              <span>Checking...</span>
            </div>
          )}
          {hasResults && [...messages].reverse().filter(m => m.role === "bot").map(msg => (
            <motion.div
              key={msg.id}
              className={`tool-card ${msg.scanResult ? verdictClass(msg.scanResult.verdict, msg.scanResult.trust_state) : ""}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              {msg.scanResult && (<>
                <div className="tool-verdict-bar">
                  <div className={`tool-verdict ${verdictClass(msg.scanResult.verdict, msg.scanResult.trust_state)}`}>
                    {msg.scanResult.trust_state === "blocked" || msg.scanResult.verdict === "SUSPICIOUS" || msg.scanResult.verdict === "HIGH"
                      ? <ShieldAlert size={20} /> : msg.scanResult.trust_state === "inspect" || msg.scanResult.verdict === "UNCLEAR" || msg.scanResult.verdict === "MEDIUM"
                      ? <AlertTriangle size={20} /> : <ShieldCheck size={20} />}
                    <span>{
                      msg.scanResult.trust_state === "blocked" || msg.scanResult.verdict === "SUSPICIOUS" || msg.scanResult.verdict === "HIGH" ? "High Risk"
                      : msg.scanResult.trust_state === "inspect" || msg.scanResult.verdict === "UNCLEAR" || msg.scanResult.verdict === "MEDIUM" ? "Needs Caution"
                      : "Looks Safe"
                    }</span>
                    <span className="tool-score">{msg.scanResult.score}/100</span>
                    {msg.scanResult.trust_state && <span className={`tool-trust-badge trust-${msg.scanResult.trust_state}`}>{trustLabel(msg.scanResult.trust_state)}</span>}
                  </div>
                  <div className="tool-card-share">
                    <button onClick={() => speakText(msg.text)} title="Read aloud"><Volume2 size={14} /></button>
                    <button onClick={() => {
                      const t = encodeURIComponent(`Chetana: ${msg.scanResult!.verdict} (${msg.scanResult!.score}/100)\nhttps://chetana.activemirror.ai`);
                      window.open(`https://wa.me/?text=${t}`, '_blank');
                    }} title="Share on WhatsApp"><Smartphone size={14} /></button>
                    <button onClick={() => {
                      const text = `Chetana: ${msg.scanResult!.verdict} (${msg.scanResult!.score}/100)\nhttps://chetana.activemirror.ai`;
                      if (navigator.share) navigator.share({ title: "Chetana", text }).catch(() => {});
                      else { navigator.clipboard.writeText(text); }
                    }} title="Share"><Share2 size={14} /></button>
                  </div>
                </div>
                {/* Incident mode CTA for high-risk results */}
                {(msg.scanResult.verdict === "SUSPICIOUS" || msg.scanResult.verdict === "HIGH" || msg.scanResult.trust_state === "blocked") && (
                  <div className="tool-incident-cta">
                    <button className="tool-protect-btn" onClick={() => {
                      setIncidentMode({
                        verdict: msg.scanResult!.verdict,
                        score: msg.scanResult!.score,
                        signals: msg.scanResult!.signals,
                        trust_state: msg.scanResult!.trust_state,
                      });
                    }}>
                      <ShieldAlert size={14} /> Protect me now
                    </button>
                    <button className="tool-evidence-btn" onClick={() => handleSaveEvidence(msg)} title="Download evidence for reporting">
                      <FileText size={14} /> Save Evidence
                    </button>
                    <button className="tool-report-btn" onClick={() => handleReportNow(msg)} title="Report to authorities">
                      <Flag size={14} /> Report Now
                    </button>
                  </div>
                )}
                {/* Social proof warning for high-risk results */}
                {msg.scanResult.score >= 70 && (
                  <div className="tool-social-proof" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", marginTop: 6, fontSize: 13, color: "rgba(255,200,200,0.85)", lineHeight: 1.4 }}>
                    <Shield size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
                    <span>This matches high-risk scam patterns. Pause and verify through an official channel before you act.</span>
                  </div>
                )}
                {msg.scanResult.score >= 50 && msg.scanResult.score < 70 && (
                  <div className="tool-social-proof" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", marginTop: 6, fontSize: 13, color: "rgba(255,220,170,0.85)", lineHeight: 1.4 }}>
                    <Shield size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
                    <span>There are warning signs here. Verify independently before you click, pay, reply, or install anything.</span>
                  </div>
                )}
                {/* Wait before acting countdown — DANGER only */}
                {msg.scanResult.score >= 70 && (
                  <div className="tool-wait-prompt" style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: "rgba(239,68,68,0.06)", marginTop: 4, fontSize: 12, color: "rgba(255,180,180,0.7)", fontStyle: "italic" }}>
                    <span>Take 5 minutes to think before responding to this message</span>
                  </div>
                )}
                {/* False positive challenge */}
                {(msg.scanResult.score > 40) && (
                  <div className="tool-challenge">
                    <button className="tool-challenge-btn" onClick={() => {
                      const signals = msg.scanResult!.signals?.slice(0, 5).map((s: string) => `• ${s}`).join("\n") || "• High overall risk score";
                      addMsg({ role: "bot", text: `**Why this was flagged:**\n${signals}\n\nThese are the signals Chetana detected. If this seems wrong, you can re-check with more context or verify the source independently.\n\nChetana is a tool, not a judge. Your judgment matters.`, suggestions: ["Re-check with more context", "Help me verify safely"] });
                    }}>
                      This seems wrong?
                    </button>
                  </div>
                )}
              </>)}
              <div className="tool-card-body">{msg.text.split("\n").map((line, i) => {
                if (!line.trim()) return null;
                // Sanitize: strip all HTML tags first, then apply safe bold markdown
                const sanitized = line.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const bold = sanitized.replace(/\*\*(.*?)\*\*/g, (_m, p) => `<strong>${p}</strong>`);
                const isBullet = line.trim().startsWith("•");
                return <p key={i} className={isBullet ? "tool-bullet" : ""} dangerouslySetInnerHTML={{ __html: isBullet ? bold.replace("•", "") : bold }} />;
              })}</div>
              {msg.suggestions && (
                <div className="tool-suggestions">
                  {msg.suggestions.map((s, i) => (
                    <button key={i} onClick={() => handleSuggestion(s)}>{s}</button>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Footer — one line */}
      <footer className="tool-footer">
        Advisory only — not a government service · Emergency: 1930 · <a href="https://activemirror.ai" target="_blank" rel="noopener">activemirror.ai</a>
      </footer>

      {/* Incident Mode overlay */}
      <AnimatePresence>
        {incidentMode && (
          <IncidentMode
            scanResult={incidentMode}
            onClose={() => setIncidentMode(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Incident Mode — 5-screen guided flow ──────────────────── */
type IncidentScreen = {
  step: string;
  headline?: string;
  do_nots?: string[];
  ctas?: string[];
  processing_disclosure?: string;
  category_label?: string;
  explanation?: string;
  known_signals?: string[];
  suspected_signals?: string[];
  trust_note?: string;
  actions?: string[];
  helpline?: string;
  portal_url?: string;
  prompt?: string;
  options?: string[];
  consent_note?: string;
  question?: string;
  callback_guidance_available?: boolean;
};

function IncidentMode({ scanResult, onClose }: { scanResult?: { verdict: string; score?: number; signals?: string[]; trust_state?: string }; onClose: () => void }) {
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [screen, setScreen] = useState<IncidentScreen | null>(null);
  const [step, setStep] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);

  // Start incident session
  useEffect(() => {
    const start = async () => {
      try {
        const resp = await fetch(`${API}/api/incident/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            risk_level: "red",
            category: null,
            score: scanResult?.score ?? 80,
            processing_path: "local",
            raw_signals: scanResult?.signals?.slice(0, 5) || [],
          }),
        });
        if (!resp.ok) throw new Error(`Server error (${resp.status})`);
        const data = await resp.json();
        setIncidentId(data.incident_id);
        setStep(data.step);
        setScreen(data.screen);
      } catch (e: any) {
        setError(e.message || "Could not start incident mode");
      } finally {
        setLoading(false);
      }
    };
    start();
  }, []);

  const doAction = async (action: string, payload?: Record<string, string>) => {
    if (!incidentId) return;
    setLoading(true);
    try {
      const resp = await fetch(`${API}/api/incident/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incident_id: incidentId, action, payload }),
      });
      if (!resp.ok) throw new Error(`Server error (${resp.status})`);
      const data = await resp.json();
      setStep(data.step);
      setScreen(data.screen);
      if (action === "follow_up_outcome") setCompleted(true);
    } catch (e: any) {
      setError(e.message || "Action failed");
    } finally {
      setLoading(false);
    }
  };

  const stepLabels: Record<string, string> = {
    stabilize: "1", what_this_is: "2", next_actions: "3", family: "4", follow_up: "5",
  };
  const stepNames = ["stabilize", "what_this_is", "next_actions", "family", "follow_up"];

  return (
    <motion.div
      className="incident-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="incident-modal">
        {/* Progress bar */}
        <div className="incident-progress">
          {stepNames.map((s) => (
            <div key={s} className={`incident-step-dot ${s === step ? "active" : stepNames.indexOf(s) < stepNames.indexOf(step) ? "done" : ""}`}>
              {stepLabels[s]}
            </div>
          ))}
          <button className="incident-close" onClick={onClose}><X size={18} /></button>
        </div>

        {loading && !screen && (
          <div className="incident-loading"><ShieldAlert size={32} className="incident-pulse" /><p>Activating protection...</p></div>
        )}

        {error && <div className="incident-error"><p>{error}</p><button onClick={onClose}>Close</button></div>}

        {completed && (
          <div className="incident-done">
            <ShieldCheck size={40} />
            <h3>Incident recorded</h3>
            <p>Stay vigilant. You did the right thing.</p>
            <button className="incident-btn-primary" onClick={onClose}>Close</button>
          </div>
        )}

        {screen && !completed && !error && (
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              className="incident-screen"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.25 }}
            >
              {/* Screen 1: Stabilize */}
              {step === "stabilize" && (<>
                <div className="incident-icon-row"><ShieldAlert size={28} className="incident-red" /></div>
                <h3>{screen.headline}</h3>
                <ul className="incident-donts">
                  {screen.do_nots?.map((d, i) => <li key={i}><X size={14} className="incident-red" /> {d}</li>)}
                </ul>
                <p className="incident-disclosure">{screen.processing_disclosure}</p>
                <div className="incident-actions">
                  <button className="incident-btn-primary" onClick={() => doAction("next")} disabled={loading}>Next <ChevronRight size={14} /></button>
                  <button className="incident-btn-secondary" onClick={() => doAction("alert_family")} disabled={loading}><Users size={14} /> Alert family</button>
                  <a href="tel:1930" className="incident-btn-urgent" onClick={() => doAction("call_1930")}><Phone size={14} /> Call 1930</a>
                </div>
              </>)}

              {/* Screen 2: What This Is */}
              {step === "what_this_is" && (<>
                <div className="incident-category-badge">{screen.category_label}</div>
                <p className="incident-explanation">{screen.explanation}</p>
                {(screen.known_signals?.length ?? 0) > 0 && (
                  <div className="incident-signals">
                    <h4>Confirmed signals</h4>
                    <ul>{screen.known_signals?.map((s, i) => <li key={i}><AlertTriangle size={12} className="incident-red" /> {s}</li>)}</ul>
                  </div>
                )}
                {(screen.suspected_signals?.length ?? 0) > 0 && (
                  <div className="incident-signals suspected">
                    <h4>Suspected</h4>
                    <ul>{screen.suspected_signals?.map((s, i) => <li key={i}><Eye size={12} className="incident-amber" /> {s}</li>)}</ul>
                  </div>
                )}
                <p className="incident-trust-note">{screen.trust_note}</p>
                <div className="incident-actions">
                  <button className="incident-btn-primary" onClick={() => doAction("next")} disabled={loading}>Next <ChevronRight size={14} /></button>
                </div>
              </>)}

              {/* Screen 3: Next Actions */}
              {step === "next_actions" && (<>
                <h3>What to do now</h3>
                <ol className="incident-steps-list">
                  {screen.actions?.map((a, i) => <li key={i}><span className="incident-step-num">{i + 1}</span> {a}</li>)}
                </ol>
                <div className="incident-actions">
                  <a href="tel:1930" className="incident-btn-urgent" onClick={() => doAction("call_1930")}><Phone size={14} /> Call 1930</a>
                  <a href="https://cybercrime.gov.in" target="_blank" rel="noopener" className="incident-btn-secondary" onClick={() => doAction("cybercrime_portal")}><Globe size={14} /> cybercrime.gov.in</a>
                  <button className="incident-btn-secondary" onClick={() => doAction("save_evidence")} disabled={loading}><FileText size={14} /> Save evidence</button>
                </div>
                <div className="incident-actions" style={{ marginTop: 8 }}>
                  <button className="incident-btn-primary" onClick={() => doAction("next")} disabled={loading}>Next <ChevronRight size={14} /></button>
                </div>
              </>)}

              {/* Screen 4: Family */}
              {step === "family" && (<>
                <h3><Users size={20} /> {screen.prompt}</h3>
                <div className="incident-family-options">
                  <button className="incident-btn-secondary" onClick={() => {
                    doAction("alert_family");
                    if (navigator.share) {
                      navigator.share({ title: "Chetana Alert", text: "I may have encountered a scam. Please check with me: https://chetana.activemirror.ai" }).catch(() => {});
                    } else {
                      window.open(`https://wa.me/?text=${encodeURIComponent("I may have encountered a scam. Please check: https://chetana.activemirror.ai")}`, "_blank");
                    }
                  }}><Share2 size={14} /> Share alert with family</button>
                  <button className="incident-btn-secondary" onClick={() => doAction("next")}>Guardian already knows</button>
                  <button className="incident-btn-secondary" onClick={() => doAction("next")}>I'm checking for my parent</button>
                </div>
                <p className="incident-consent">{screen.consent_note}</p>
                <div className="incident-actions">
                  <button className="incident-btn-primary" onClick={() => doAction("next")} disabled={loading}>Next <ChevronRight size={14} /></button>
                </div>
              </>)}

              {/* Screen 5: Follow Up */}
              {step === "follow_up" && (<>
                <h3>{screen.question}</h3>
                <div className="incident-outcome-options">
                  {[
                    { val: "money_sent", label: "I sent money", icon: <CreditCard size={14} /> },
                    { val: "account_linked", label: "They got access to my account", icon: <Lock size={14} /> },
                    { val: "reported", label: "I reported it", icon: <Flag size={14} /> },
                    { val: "no_action", label: "I stopped — no action taken", icon: <ShieldCheck size={14} /> },
                    { val: "need_callback", label: "I need more help", icon: <Phone size={14} /> },
                  ].map(opt => (
                    <button key={opt.val} className="incident-btn-outcome" onClick={() => doAction("follow_up_outcome", { outcome: opt.val })} disabled={loading}>
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
              </>)}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}

/* ── Stories — Cinematic Visual Section ─────────────────────── */
const STORIES = [
  { img: "/01-hero-grandmother.png", alt: "Illustration: elderly Indian woman checking phone", caption: "A grandmother receives a suspicious KYC message. Chetana flags it as a scam — before she shares her OTP." },
  { img: "/02-student-train.png", alt: "Illustration: student on Mumbai train checking phone", caption: "A student checks a WhatsApp forward on his commute. Chetana flags it as a known phishing link — instantly." },
  { img: "/03-family-kitchen.png", alt: "Illustration: Indian family gathered around kitchen table", caption: "Families check every suspicious message together. Screenshot, upload, know in seconds." },
  { img: "/04-safe-hands.png", alt: "Illustration: elderly hands holding phone with safety shield", caption: "When something looks suspicious, check it before you act. That's the Chetana habit." },
  { img: "/05-street-scene.png", alt: "Illustration: Indian marketplace with people on phones", caption: "From Mumbai to Madurai — a free scam checker that works in 12 Indian languages." },
];

export function StoriesSection() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setActive(a => (a + 1) % STORIES.length), 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <ScrollReveal>
    <motion.section className="stories-section" {...fadeIn}>
      <div className="stories-header">
        <h2>How Chetana works</h2>
        <p>Screenshot it. Upload it. Know in seconds.</p>
        <p style={{ fontSize: '0.75rem', opacity: 0.4, marginTop: 4 }}>Illustrations — not real users</p>
      </div>
      <div className="stories-carousel">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            className="story-card"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.4 }}
          >
            <img src={STORIES[active].img} alt={STORIES[active].alt} className="story-img" loading="lazy" />
            <div className="story-caption">{STORIES[active].caption}</div>
          </motion.div>
        </AnimatePresence>
        <div className="stories-dots">
          {STORIES.map((_, i) => (
            <button key={i} className={`story-dot${i === active ? " active" : ""}`} onClick={() => setActive(i)} aria-label={`Story ${i + 1}`} />
          ))}
        </div>
      </div>
    </motion.section>
    </ScrollReveal>
  );
}

/* ── Consumer Section ────────────────────────────────────────── */
export function ConsumerSection({ onNavigate }: { onNavigate: (p: PageId) => void }) {
  const features = [
    { icon: <MessageCircle size={22} />, color: "blue", title: "Screenshot & Upload", desc: "Got a suspicious WhatsApp or SMS? Screenshot it. Upload it here. We scan it instantly.", click: "scan" as PageId },
    { icon: <Link2 size={22} />, color: "teal", title: "Paste Any Message", desc: "Copy the suspicious text. Paste it in the scanner. Chetana cross-checks common India scam patterns before you act.", click: "scan" as PageId },
    { icon: <CreditCard size={22} />, color: "saffron", title: "Check UPI & Links", desc: "Someone sent a payment link or UPI ID? Check it before you click. Don't lose money.", click: "scan" as PageId },
    { icon: <Users size={22} />, color: "violet", title: "Teach Your Family", desc: "Show your parents and elders how to screenshot and check. Works in 12 Indian languages.", click: "scan" as PageId },
  ];
  return (
    <>
      <div className="section-header">
        <motion.div className="kicker" {...fadeIn}><Shield size={14} /> For you & your family</motion.div>
        <motion.h2 {...fadeInDelay(0.05)}>Screenshot It. Check It.</motion.h2>
        <motion.p {...fadeInDelay(0.1)}>Got a suspicious WhatsApp, SMS, UPI request, QR, parcel alert, or fake customer-care message? Screenshot it and check first.</motion.p>
      </div>
      <div className="feature-grid">
        {features.map((f, i) => (
          <ScrollReveal key={f.title} delay={i * 0.08}>
            <SpotlightCard className="feature-card spotlight-card" spotlightColor={f.color === "blue" ? "rgba(59,130,246,0.12)" : f.color === "teal" ? "rgba(20,184,166,0.12)" : f.color === "saffron" ? "rgba(245,158,11,0.12)" : "rgba(139,92,246,0.12)"}>
              <div style={{ padding: 28, position: "relative", zIndex: 1 }} onClick={() => onNavigate(f.click)}>
                <div className={`feature-icon ${f.color}`}>{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            </SpotlightCard>
          </ScrollReveal>
        ))}
      </div>
    </>
  );
}

/* ── Enterprise Section ──────────────────────────────────────── */
export function EnterpriseSection({ onNavigate }: { onNavigate: (p: PageId) => void }) {
  const features = [
    { icon: <Building2 size={22} />, color: "saffron", title: "Merchant Protection", desc: "Stop losing money to fake payment screenshots and impersonation attacks. Verify every transaction before you ship.", click: "merchant" as PageId },
    { icon: <Layers size={22} />, color: "violet", title: "Fraud Detection API", desc: "Add Chetana's scam detection to your app, website, or payment flow. One API call — instant fraud verdict for your users.", click: "nexus" as PageId, highlight: true },
    { icon: <TrendingUp size={22} />, color: "blue", title: "Scam Trend Monitoring", desc: "See which scams are rising right now. Track fraud campaigns targeting your industry and get alerted before they hit.", click: "weather" as PageId },
    { icon: <UserCheck size={22} />, color: "safe", title: "Train Your Team", desc: "Help your employees spot scams before they fall for them. Real examples, real patterns, real protection.", click: "atlas" as PageId },
  ];
  return (
    <>
      <div className="section-header">
        <motion.div className="kicker" {...fadeIn}><Building2 size={14} /> "For businesses & enterprises"</motion.div>
        <motion.h2 {...fadeInDelay(0.05)}>Protect Your Business</motion.h2>
        <motion.p {...fadeInDelay(0.1)}>Fraud costs Indian businesses crores every year. Stop it before it starts.</motion.p>
      </div>
      <div className="feature-grid">
        {features.map((f, i) => (
          <ScrollReveal key={f.title} delay={i * 0.08}>
            <SpotlightCard className={`feature-card spotlight-card${f.highlight ? " enterprise-highlight" : ""}`} spotlightColor={f.color === "blue" ? "rgba(59,130,246,0.12)" : f.color === "safe" ? "rgba(16,185,129,0.12)" : f.color === "saffron" ? "rgba(245,158,11,0.12)" : "rgba(139,92,246,0.12)"}>
              <div style={{ padding: 28, position: "relative", zIndex: 1 }} onClick={() => onNavigate(f.click)}>
                <div className={`feature-icon ${f.color}`}>{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            </SpotlightCard>
          </ScrollReveal>
        ))}
      </div>
    </>
  );
}

/* ── Onboarding cards ────────────────────────────────────────── */
export function Onboarding({ onNavigate }: { onNavigate: (target: "consumer" | "merchant" | "nexus") => void }) {
  return (
    <motion.section className="panel" {...fadeIn}>
      <div className="panel-header"><h2>Who are you protecting?</h2><p>Chetana works for individuals, businesses, and enterprises.</p></div>
      <div className="card-grid">
        <button className="onboard-card" onClick={() => onNavigate("consumer")}>
          <div className="onboard-icon consumer"><Shield size={22} /></div>
          <h3>Protect me</h3><p>Check messages, links, and payment proofs instantly.</p>
        </button>
        <button className="onboard-card" onClick={() => onNavigate("merchant")}>
          <div className="onboard-icon merchant"><Building2 size={22} /></div>
          <h3>Protect my business</h3><p>Defend against fake payments and impersonation.</p>
        </button>
        <button className="onboard-card" onClick={() => onNavigate("nexus")}>
          <div className="onboard-icon enterprise"><BarChart3 size={22} /></div>
          <h3>Protect my institution</h3><p>Campaign graphs, analyst replay, enterprise trust.</p>
        </button>
      </div>
    </motion.section>
  );
}

/* ── Weather Board ───────────────────────────────────────────── */
export function WeatherBoard({ signals }: { signals: WeatherSignal[] }) {
  return (
    <motion.section className="panel" {...fadeIn}>
      <div className="panel-header">
        <h2><BarChart3 size={20} style={{ verticalAlign: "middle", marginRight: 8 }} />Scam Trends Right Now</h2>
        <p>Which scams are rising in India today? See what's happening live.</p>
      </div>
      <div className="weather-grid">
        {signals.map((s, i) => (
          <motion.div key={s.id} className={`weather-card ${s.tone}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <div className="weather-top"><span>{s.label}</span><strong>{s.delta}</strong></div>
            <div className="meter"><div className="meter-fill" style={{ width: `${s.pressure}%` }} /></div>
            <div className="weather-bottom"><span>pressure</span><strong>{s.pressure}</strong></div>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}

/* ── Atlas ────────────────────────────────────────────────────── */
export function Atlas({ threats }: { threats: ThreatEntry[] }) {
  const [query, setQuery] = useState("");
  const [surface, setSurface] = useState("all");
  const filtered = useMemo(() => threats.filter(t => {
    const q = query.toLowerCase();
    const matchQ = !q || t.title.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q) || t.redFlags.join(" ").toLowerCase().includes(q);
    const matchS = surface === "all" || t.surface === surface;
    return matchQ && matchS;
  }), [query, surface, threats]);
  return (
    <motion.section className="panel" {...fadeIn}>
      <div className="panel-header split">
        <div><h2><BookOpen size={20} style={{ verticalAlign: "middle", marginRight: 8 }} />Scam Encyclopedia</h2><p>Learn to spot every type of scam. Red flags, what to do, and how to stay safe.</p></div>
        <div className="filters">
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search scams..." />
          <select value={surface} onChange={e => setSurface(e.target.value)}>
            <option value="all">All types</option>
            <option value="payment trust">Payment</option>
            <option value="link trust">Links</option>
            <option value="identity trust">Identity</option>
          </select>
        </div>
      </div>
      <div className="atlas-list">
        {filtered.map((t, i) => (
          <motion.article key={t.id} className="atlas-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <div className="atlas-head">
              <div><div className={`pill ${t.status}`}>{t.status}</div><h3>{t.title}</h3></div>
              <div className="smallmeta">{t.surface}</div>
            </div>
            <p>{t.summary}</p>
            <div className="tag-row">{t.languages.map(l => <span key={l} className="tag">{l}</span>)}</div>
            <div className="two-col">
              <div><strong style={{ color: "var(--heading)" }}>Red flags</strong><ul>{t.redFlags.map(r => <li key={r}>{r}</li>)}</ul></div>
              <div><strong style={{ color: "var(--heading)" }}>What to do</strong><ul>{t.actions.map(a => <li key={a}>{a}</li>)}</ul></div>
            </div>
          </motion.article>
        ))}
      </div>
    </motion.section>
  );
}

/* ── Graph ────────────────────────────────────────────────────── */
export function MirrorGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const cy = cytoscape({
      container: ref.current,
      elements: [...nodes, ...edges],
      layout: { name: "cose", animate: true, padding: 24 },
      style: [
        { selector: "node", style: {
          "background-color": (ele: any) => {
            const k = ele.data("kind");
            if (k === "core") return "#3b82f6";
            if (k === "campaign") return "#ef4444";
            if (k === "enterprise") return "#8b5cf6";
            if (k === "surface") return "#f59e0b";
            return "#6B7280";
          },
          label: "data(label)", color: "#94a3b8", "font-size": 11 as any, "text-wrap": "wrap", "text-max-width": 90 as any, width: 34, height: 34,
          "border-width": 1, "border-color": "#0a0a1a"
        }},
        { selector: "edge", style: { width: 2, "line-color": "#1e293b", "target-arrow-color": "#1e293b", "target-arrow-shape": "triangle", "curve-style": "bezier", label: "data(label)", color: "#475569", "font-size": 9 }},
        { selector: ".faded", style: { opacity: 0.15 } }
      ]
    });
    cy.on("tap", "node", evt => {
      const n = evt.target;
      cy.elements().removeClass("faded");
      cy.elements().difference(n.closedNeighborhood()).addClass("faded");
    });
    return () => cy.destroy();
  }, [nodes, edges]);
  return <div className="mirrorgraph" ref={ref} />;
}

/* ── TUI ─────────────────────────────────────────────────────── */
export function TuiPanel({ lines }: { lines: string[] }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!mountRef.current) return;
    const term = new Terminal({ theme: { background: "#060610", foreground: "#94a3b8", cursor: "#14b8a6" }, fontSize: 12, rows: 18 });
    const fit = new FitAddon();
    term.loadAddon(fit); term.open(mountRef.current); fit.fit();
    term.writeln("chetana-control-shell v1");
    term.writeln("\x1b[38;5;240m" + "─".repeat(40) + "\x1b[0m");
    let i = 0;
    const iv = setInterval(() => {
      if (i >= lines.length) { term.writeln("\x1b[32m> system stable.\x1b[0m"); clearInterval(iv); return; }
      term.writeln(`\x1b[36m>\x1b[0m ${lines[i]}`); i++;
    }, 550);
    const onR = () => fit.fit();
    window.addEventListener("resize", onR);
    return () => { clearInterval(iv); window.removeEventListener("resize", onR); term.dispose(); };
  }, [lines]);
  return <section className="panel tui-panel"><div className="panel-header"><h2>Control Shell</h2><p>Command-center layer.</p></div><div className="terminal-wrap" ref={mountRef} /></section>;
}

/* ── Dashboard ───────────────────────────────────────────────── */
export function DashboardGallery() {
  const cards = [
    { title: "Risk Distribution", copy: "Live verdict mix across trust surfaces.", stat: "87 suspicious / 13 hold" },
    { title: "Action Eligibility", copy: "Advisory vs step-up vs hold decisions.", stat: "Warn 61% · Verify 23% · Hold 16%" },
    { title: "Merchant Pressure", copy: "Fake payment screenshot heat.", stat: "Peak at 2-6 PM local" },
    { title: "Family Shield", copy: "Elder-protection flows and share-safe cards.", stat: "3 fastest save paths" }
  ];
  return (
    <motion.section className="panel" {...fadeIn}>
      <div className="panel-header"><h2><BarChart3 size={20} style={{ verticalAlign: "middle", marginRight: 8 }} />Dashboard Gallery</h2><p>System surfaces showcased as product proof.</p></div>
      <div className="card-grid">{cards.map(c => <div className="dash-card" key={c.title}><div className="mini-chart"><div className="bar h1" /><div className="bar h2" /><div className="bar h3" /><div className="bar h4" /></div><h3>{c.title}</h3><p>{c.copy}</p><strong>{c.stat}</strong></div>)}</div>
    </motion.section>
  );
}

/* ── Trust ────────────────────────────────────────────────────── */
export function TrustPage() {
  const items: [string, string, React.ReactNode][] = [
    ["We show our work", "Every result tells you exactly WHY something looks suspicious — not just a score. You see the evidence.", <Eye size={20} />],
    ["We tell you what to do", "Not just \"this is dangerous.\" We give you clear next steps: block, report, call 1930, or relax.", <CheckCircle size={20} />],
    ["Local first, server only when needed", "Text checks can start in your browser. Links, reputation checks, and deeper media analysis may use secure server-side processing when needed.", <Lock size={20} />],
    ["You decide what happens next", "The web app advises; it does not automatically block, report, or act for you. The final call stays with you.", <Users size={20} />]
  ];
  return (
    <motion.section className="panel" {...fadeIn}>
      <div className="panel-header"><h2><ShieldCheck size={20} style={{ verticalAlign: "middle", marginRight: 8 }} />Why Trust Chetana?</h2><p>We built this to protect people, not to collect data or sell fear.</p></div>
      <div className="trust-grid">{items.map(([title, copy, icon]) => <div className="trust-card" key={title}><div style={{ color: "var(--primary-bright)", marginBottom: 8 }}>{icon}</div><h3>{title}</h3><p>{copy}</p></div>)}</div>
      <a href="https://activemirror.ai/proof/" target="_blank" rel="noopener" className="proof-banner">
        <div className="proof-banner-icon"><ShieldCheck size={20} /></div>
        <div className="proof-banner-text">
          <strong>Proof-of-Memory Protocol</strong>
          <span>Cryptographic attestation that users read and understood — not just clicked through.</span>
        </div>
        <ChevronRight size={18} className="proof-banner-arrow" />
      </a>

      {/* Local vs Cloud — Trust by Design */}
      <div style={{ marginTop: 32 }}>
        <h3 style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><Lock size={18} /> Where your data is processed</h3>
        <div style={{ overflowX: "auto" }}>
          <table className="trust-matrix">
            <thead><tr><th>What you check</th><th>On your device</th><th>Remote possible</th><th>Stored</th></tr></thead>
            <tbody>
              <tr><td>Message text</td><td style={{ color: "var(--safe)" }}>Yes</td><td>Optional</td><td>No</td></tr>
              <tr><td>Link / URL</td><td>Partial</td><td>Yes (reputation check)</td><td>No</td></tr>
              <tr><td>UPI ID</td><td style={{ color: "var(--safe)" }}>Yes</td><td>Optional</td><td>No</td></tr>
              <tr><td>QR code</td><td style={{ color: "var(--safe)" }}>Yes</td><td>Optional</td><td>No</td></tr>
              <tr><td>Voice clip</td><td style={{ color: "var(--safe)" }}>Yes</td><td>Optional</td><td>No</td></tr>
              <tr><td>Image / screenshot</td><td style={{ color: "var(--safe)" }}>Yes</td><td>Optional</td><td>No</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Guardian / Parivar Consent Rules */}
      <div style={{ marginTop: 32 }}>
        <h3 style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><Users size={18} /> Family protection rules</h3>
        <div className="trust-grid" style={{ gridTemplateColumns: "1fr" }}>
          <div className="trust-card"><p>Family alerts are <strong>opt-in</strong>. Nobody is notified unless you choose to send an alert.</p></div>
          <div className="trust-card"><p>Chetana should show you <strong>what will be shared before you send it</strong>. There is no default family broadcasting.</p></div>
          <div className="trust-card"><p>Checking a suspicious message does <strong>not automatically notify family members</strong>. Sharing is a separate user action.</p></div>
          <div className="trust-card"><p>Emergency escalation keeps <strong>1930 and cybercrime.gov.in</strong> visible so you can move from advice to official reporting quickly.</p></div>
        </div>
      </div>

      {/* False Positive — Your Judgment Matters */}
      <div style={{ marginTop: 32 }}>
        <h3 style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><AlertTriangle size={18} /> When Chetana gets it wrong</h3>
        <div className="trust-card" style={{ borderLeft: "3px solid var(--amber)" }}>
          <p>Every scan result includes a <strong>"This seems wrong?"</strong> button. Tap it to see exactly which signals were flagged and why.</p>
          <p style={{ marginTop: 8 }}>Chetana preserves the original verdict but gives you tools to <strong>safely re-verify</strong>. We never shame you for questioning the system.</p>
          <p style={{ marginTop: 8, color: "var(--muted)" }}>Chetana is a tool, not a judge. Your judgment always comes first.</p>
        </div>
      </div>

      {/* Builder */}
      <div className="builder-section">
        <h3>Built by Paul Desai</h3>
        <p>Chetana is built and maintained by <a href="https://activemirror.ai" target="_blank" rel="noopener">Active Mirror</a> — an AI research lab focused on trust, safety, and sovereign intelligence for India.</p>
        <div className="builder-socials">
          <a href="https://youtube.com/@ActiveMirror-1" target="_blank" rel="noopener">YouTube</a>
          <a href="https://github.com/MirrorDNA-Reflection-Protocol" target="_blank" rel="noopener">GitHub</a>
          <a href="https://t.me/chetnaShieldBot" target="_blank" rel="noopener">Telegram</a>
          <a href="https://x.com/ActiveMirror_" target="_blank" rel="noopener">X</a>
          <a href="https://linkedin.com/company/activemirror" target="_blank" rel="noopener">LinkedIn</a>
          <a href="https://activemirror.ai" target="_blank" rel="noopener">activemirror.ai</a>
        </div>
      </div>
    </motion.section>
  );
}

/* ── Telegram CTA ────────────────────────────────────────────── */
export function TelegramCTA() {
  return (
    <motion.div className="proof-banner" {...fadeIn} style={{ cursor: "pointer", maxWidth: 720, margin: "0 auto 32px" }} onClick={() => window.open("https://t.me/chetnaShieldBot", "_blank")}>
      <div className="proof-banner-icon" style={{ background: "linear-gradient(135deg, #0088cc, #229ED9)" }}>
        <Smartphone size={20} />
      </div>
      <div className="proof-banner-text">
        <strong>Use Chetana on Telegram</strong>
        <span>Forward any suspicious message to @chetnaShieldBot on Telegram. Instant reply. No app needed.</span>
      </div>
      <ChevronRight size={18} className="proof-banner-arrow" />
    </motion.div>
  );
}

/* ── Share Chetana ──────────────────────────────────────────── */
export function ShareCTA() {
  const url = "https://chetana.activemirror.ai";
  const msg = "check karo, safe raho — Free scam check for India. Paste suspicious messages, links, UPI IDs, and phone numbers for a calm next step.";
  const [copied, setCopied] = useState(false);
  const share = (platform: string) => {
    const links: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(msg + "\n" + url)}`,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(msg)}`,
      x: `https://x.com/intent/tweet?text=${encodeURIComponent(msg)}&url=${encodeURIComponent(url)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    };
    if (platform === "copy") { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); return; }
    if (platform === "native" && navigator.share) { navigator.share({ title: "Chetana", text: msg, url }).catch(() => {}); return; }
    window.open(links[platform], "_blank", "noopener,width=600,height=400");
  };
  return (
    <ScrollReveal>
    <motion.div className="share-strip" {...fadeIn}>
      <div className="share-strip-inner">
        <div className="share-strip-left">
          <Shield size={18} style={{ color: "var(--primary-bright)", flexShrink: 0 }} />
          <span>Share with your family — scams hit elders hardest</span>
        </div>
        <div className="share-strip-buttons">
          <button onClick={() => share("whatsapp")} className="share-pill share-wa">WhatsApp</button>
          <button onClick={() => share("telegram")} className="share-pill share-tg">Telegram</button>
          <button onClick={() => share("x")} className="share-pill share-x">X</button>
          <button onClick={() => share("facebook")} className="share-pill share-fb">Facebook</button>
          <button onClick={() => share("linkedin")} className="share-pill share-li">LinkedIn</button>
          <button onClick={() => share("copy")} className="share-pill share-cp">{copied ? "Copied!" : "Copy link"}</button>
          {typeof navigator !== "undefined" && "share" in navigator && (
            <button onClick={() => share("native")} className="share-pill share-native"><Share2 size={13} /></button>
          )}
        </div>
      </div>
    </motion.div>
    </ScrollReveal>
  );
}

/* ── Floating Scan Widget (WhatsApp-style) ───────────────────── */
export function ScanWidget({ onRequireProof, inline, onCouncilUpdate, initialInput, initialFile }: { onRequireProof?: () => void; inline?: boolean; onCouncilUpdate?: (data: any) => void; initialInput?: string | null; initialFile?: File | null }) {
  const [open, setOpen] = useState(!!inline);
  const [agreed, setAgreed] = useState(() => !!localStorage.getItem("chetana_terms_accepted"));
  const [lang, setLang] = useState(() => localStorage.getItem("chetana_lang") || detectBrowserLang());
  const [activeTab, setActiveTab] = useState<"chat" | "apk">("chat");
  const [input, setInput] = useState(initialInput || "");
  const [apkUrl, setApkUrl] = useState("");
  const [apkBrand, setApkBrand] = useState("");
  const [apkResult, setApkResult] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingForOther, setCheckingForOther] = useState(false);
  const [sessionScans, setSessionScans] = useState(0);
  const EXAMPLE_PROMPTS = [
    "Hey! OMG is this you in this video?? 😂😂 https://insta-reelz.cc/video/8832k",
    "Hi, I'm from HR at Flipkart. We found your resume on Naukri. Work from home, earn ₹10,000/day. Join our Telegram group to start.",
    "URGENT: This is CBI Cyber Division. A case has been registered against your Aadhaar. To avoid arrest, pay ₹15,000 fine immediately via UPI.",
  ];
  const EXAMPLE_LABELS = [
    "📸 'Is this you?' DM",
    "💼 Too-good job offer",
    "👮 Fake digital arrest",
  ];
  const [messages, setMessages] = useState<ChatMsg[]>([{
    id: 0, role: "bot",
    text: "**Screenshot or paste** any suspicious message.\n\nWhatsApp, SMS, UPI request, QR, parcel message, KYC alert, or payment screenshot — just drop it here.\nChetana checks on-device first when possible, then asks the server for help if needed.\n\n_check karo, safe raho._",
    suggestions: EXAMPLE_LABELS,
  }]);
  const [listening, setListening] = useState(false);
  const [dragging, setDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const msgId = useRef(1);
  const canSend = (input.trim().length > 0 || !!file) && !loading;
  const SpeechRecClass = useMemo(() => getSpeechRecognition(), []);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  };

  const toggleMic = () => {
    if (listening && recognitionRef.current) { recognitionRef.current.stop(); setListening(false); return; }
    if (!SpeechRecClass) return;
    const recognition = new SpeechRecClass();
    recognition.lang = LANG_TO_BCP47[lang] || "en-IN";
    recognition.interimResults = false;
    recognition.onresult = (event: any) => { setInput(prev => prev ? prev + " " + event.results[0][0].transcript : event.results[0][0].transcript); };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (initialInput) {
      setInput((prev) => prev || initialInput);
    }
  }, [initialInput]);

  useEffect(() => {
    if (initialFile) {
      setFile((prev) => prev ?? initialFile);
      setActiveTab("chat");
    }
  }, [initialFile]);

  // Auto-submit shared content from PWA share target
  const sharedHandled = useRef(false);
  useEffect(() => {
    if ((initialInput || initialFile) && !sharedHandled.current && agreed) {
      sharedHandled.current = true;
      const timer = setTimeout(() => {
        const btn = document.querySelector(".tool-check-ready") as HTMLButtonElement;
        if (btn) btn.click();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialInput, initialFile, agreed]);

  const addMsg = (msg: Omit<ChatMsg, "id">) => {
    setMessages(prev => [...prev, { ...msg, id: msgId.current++ }]);
  };

  const speakText = (text: string) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/\*\*/g, ""));
      u.lang = LANG_TO_BCP47[lang] || "en-IN"; u.rate = 0.9;
      window.speechSynthesis.speak(u);
    }
  };

  const shareResult = (sr: ChatMsg["scanResult"]) => {
    const text = `Chetana scam check: ${sr!.verdict} (${sr!.score}/100)\n${sr!.signals.slice(0, 2).join(", ")}\n\nCheck yours free: https://chetana.activemirror.ai`;
    if (navigator.share) navigator.share({ title: "Chetana Scam Check", text }).catch(() => {});
    else { navigator.clipboard.writeText(text); addMsg({ role: "bot", text: "Result copied to clipboard. Share it with your family!" }); }
  };

  const shareWhatsApp = (sr: ChatMsg["scanResult"]) => {
    const t = encodeURIComponent(`Chetana: ${sr!.verdict} (${sr!.score}/100)\nCheck yours free: https://chetana.activemirror.ai`);
    window.open(`https://wa.me/?text=${t}`, '_blank');
  };

  const checkApkRisk = async () => {
    if (!apkUrl) return;
    setLoading(true);
    try {
      const resp = await fetch(`${API}/api/apk/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: apkUrl, text: input, claimed_brand: apkBrand }),
      });
      const data = await resp.json();
      setApkResult(data);
    } catch (e) {
      console.error("APK Check failed", e);
    } finally {
      setLoading(false);
    }
  };

  const runSampleScan = (sampleText: string) => {
    addMsg({ role: "user", text: sampleText });
    setInput(""); setLoading(true);
    (async () => {
      try {
        const mode = detectInputType(sampleText);
        let resp: Response;
        if (mode === "link") resp = await fetch(`${API}/api/link/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: sampleText, lang }) });
        else resp = await fetch(`${API}/api/scan/full`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: sampleText, lang }) });
        if (!resp.ok) throw new Error("Server error");
        const data = await resp.json();
        const { text, scanResult, suggestions } = buildBotReply(mode, data);
        addMsg({ role: "bot", text, scanResult, suggestions });
        if (scanResult) recordScan(mode, scanResult);
      } catch { addMsg({ role: "bot", text: "Couldn't complete the check. Try again." }); }
      finally { setLoading(false); }
    })();
  };

  const handleSuggestion = (s: string) => {
    // Example prompt chips — run sample scan
    const exIdx = EXAMPLE_LABELS.indexOf(s);
    if (exIdx !== -1) { runSampleScan(EXAMPLE_PROMPTS[exIdx]); return; }
    const lower = s.toLowerCase();
    if (lower === "call 1930") { window.open("tel:1930"); return; }
    if (lower === "open cybercrime.gov.in") { window.open("https://cybercrime.gov.in", "_blank"); return; }
    if (lower === "alert family") {
      if (navigator.share) {
        navigator.share({ title: "Chetana Alert", text: "I may have encountered a scam. Check this with me: https://chetana.activemirror.ai" }).catch(() => {});
      } else {
        const t = encodeURIComponent("I may have encountered a scam. Check this with me: https://chetana.activemirror.ai");
        window.open(`https://wa.me/?text=${t}`, "_blank");
      }
      addMsg({ role: "bot", text: "Family alert shared. Stay calm — you're doing the right thing." });
      return;
    }
    if (lower === "re-check with more context") {
      addMsg({ role: "bot", text: "Paste the full conversation, including any earlier messages. More context helps Chetana make a better call." });
      return;
    }
    if (lower === "help me verify safely") {
      addMsg({ role: "bot", text: "**Safe verification steps:**\n• Contact the bank, courier, company, or police helpline through the official app, website, or number you already trust\n• Search the mobile number, UPI ID, or business name on Google — scam reports often show up\n• Ask a family member, neighbour, or colleague for a second opinion\n• Check cybercrime.gov.in for similar fraud patterns\n\nNever click links or call numbers written inside the suspicious message itself." });
      return;
    }
    if (lower === "share this result") {
      const last = [...messages].reverse().find(m => m.scanResult);
      if (last?.scanResult) shareResult(last.scanResult);
      return;
    }
    if (lower.includes("history") || lower === "my scan history") {
      const history = JSON.parse(localStorage.getItem("chetana_history") || "[]");
      if (history.length === 0) {
        addMsg({ role: "bot", text: "No scans yet. Paste something suspicious to get started." });
      } else {
        const safe = history.filter((h: any) => h.verdict === "LOW_RISK" || h.verdict === "LOW").length;
        const risky = history.filter((h: any) => h.verdict === "SUSPICIOUS" || h.verdict === "HIGH").length;
        const caution = history.length - safe - risky;
        const recent = history.slice(0, 5).map((h: any) => {
          const d = new Date(h.ts);
          const icon = h.verdict === "SUSPICIOUS" || h.verdict === "HIGH" ? "🔴" : h.verdict === "UNCLEAR" || h.verdict === "MEDIUM" ? "🟡" : "🟢";
          return `${icon} ${h.verdict} (${h.score}/100) — ${h.type} — ${d.toLocaleDateString()}`;
        }).join("\n");
        addMsg({ role: "bot", text: `**Your Safety Dashboard**\n\n**${history.length}** total scans · **${safe}** safe · **${caution}** caution · **${risky}** high risk\n\n**Recent:**\n${recent}\n\n_Keep checking. Stay safe._`, suggestions: ["What scams are trending?", "Check something else"] });
      }
      return;
    }
    sendChat(s);
  };

  const sendChat = async (text: string) => {
    addMsg({ role: "user", text });
    setLoading(true);
    try {
      const resp = await fetch(`${API}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, lang }) });
      const data = resp.ok ? await resp.json() : null;
      addMsg({ role: "bot", text: data?.reply || "Ask me anything about scams.", suggestions: data?.suggestions });
    } catch {
      addMsg({ role: "bot", text: "Couldn't reach the server. Try again." });
    } finally { setLoading(false); }
  };

  const acceptTerms = () => {
    localStorage.setItem("chetana_terms_accepted", new Date().toISOString());
    setAgreed(true);
  };

  const handleSaveEvidence = async (msg: ChatMsg) => {
    if (!msg.scanResult) return;
    try {
      const resp = await fetch(`${API}/api/evidence/bundle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scan_result: msg.scanResult,
          original_text: msg.text,
          notes: ""
        })
      });
      const data = await resp.json();
      const blob = new Blob([JSON.stringify(data.evidence_pack || data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `evidence-pack-${data.incident_id || 'scan'}.json`;
      a.click();
      addMsg({ role: "bot", text: "Evidence pack saved. You can use this file when reporting to cybercrime authorities." });
    } catch (e) {
      addMsg({ role: "bot", text: "Failed to generate evidence pack. Please try again." });
    }
  };

  const handleReportNow = (msg: ChatMsg) => {
    const isFinancial = msg.text.toLowerCase().includes("bank") || msg.text.toLowerCase().includes("upi") || msg.text.toLowerCase().includes("payment") || msg.text.toLowerCase().includes("money");
    if (isFinancial) {
      window.open("tel:1930");
      addMsg({ role: "bot", text: "Dialing 1930 (National Cybercrime Helpline). Stay on the line to report financial fraud." });
    } else {
      window.open("https://sancharsaathi.gov.in/sancharsaathi/chakshu", "_blank");
      addMsg({ role: "bot", text: "Opening Chakshu portal. Report this communication fraud to the Department of Telecommunications." });
    }
  };

  const handleSend = async () => {
    if (!agreed) return;

    if (file) {
      const fileMode = detectFileType(file);
      const isImage = file.type.startsWith("image/");
      addMsg({ role: "user", text: `Check: ${file.name}`, file: file.name });
      const f = file; setFile(null); setLoading(true);
      try {
        // LOCAL-FIRST: For images, try browser-side OCR + pattern matching first
        if (isImage) {
          addMsg({ role: "bot", text: "_Scanning screenshot on your device..._" });
          const localResult = await localScreenshotScan(f);
          const ocrNote = localResult.extractedText
            ? `\n\n**Text found in image:**\n_"${localResult.extractedText.slice(0, 200)}${(localResult.extractedText.length > 200 ? "..." : "")}"_`
            : "";

          if (localResult.score >= 70 && localResult.signals.length >= 2) {
            // High confidence locally — show instant result, still verify with server in background
            const { text, scanResult, suggestions } = buildBotReply("message", {
              risk_score: localResult.score,
              verdict: localResult.verdict,
              why_flagged: localResult.signals,
              explanation: "Scanned locally first. Chetana only reaches for server help when deeper review is needed.",
            }, f.name);
            addMsg({ role: "bot", text: text + ocrNote, scanResult, suggestions });
            if (scanResult) recordScan("media", scanResult);
            // Background server verification (non-blocking)
            if (localResult.extractedText) {
              fetch(`${API}/api/scan/full`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: localResult.extractedText, lang }) }).catch(() => {});
            }
          } else if (localResult.extractedText && localResult.extractedText.length > 10) {
            // Got text but not confident — send to server for deep scan
            addMsg({ role: "bot", text: `_Text extracted locally. Running deep scan..._${ocrNote}` });
            const mode = detectInputType(localResult.extractedText) as ScanMode;
            let resp: Response;
            if (mode === "upi") resp = await fetch(`${API}/api/upi/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upi_id: localResult.extractedText, lang }) });
            else if (mode === "phone") resp = await fetch(`${API}/api/phone/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: localResult.extractedText, lang }) });
            else if (mode === "link") resp = await fetch(`${API}/api/link/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: localResult.extractedText, lang }) });
            else resp = await fetch(`${API}/api/scan/full`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: localResult.extractedText, lang }) });
            if (!resp.ok) throw new Error("Server error");
            const data = await resp.json();
            const { text, scanResult, suggestions } = buildBotReply(mode, data, f.name);
            addMsg({ role: "bot", text, scanResult, suggestions });
            if (scanResult) recordScan(mode, scanResult);
          } else {
            // No text found — send image to server for visual analysis (deepfake etc.)
            const fd = new FormData(); fd.append("file", f); fd.append("lang", lang);
            const resp = await fetch(`${API}/api/media/analyze`, { method: "POST", body: fd });
            if (!resp.ok) throw new Error("Server error");
            const data = await resp.json();
            const { text, scanResult, suggestions } = buildBotReply("media", data, f.name);
            addMsg({ role: "bot", text: text + "\n\n_No text found — analyzed image for manipulation._", scanResult, suggestions });
            if (scanResult) recordScan("media", scanResult);
          }
        } else {
          // Non-image files: send to server directly
          const fd = new FormData(); fd.append("file", f); fd.append("lang", lang);
          const endpoint = fileMode === "voice" ? "/api/voice/analyze" : "/api/media/analyze";
          const resp = await fetch(`${API}${endpoint}`, { method: "POST", body: fd });
          if (!resp.ok) throw new Error("Server error");
          const data = await resp.json();
          const { text, scanResult, suggestions } = buildBotReply(fileMode, data, f.name);
          addMsg({ role: "bot", text, scanResult, suggestions });
          if (scanResult) recordScan(fileMode, scanResult);
        }
      } catch { addMsg({ role: "bot", text: "Couldn't check that file. Try again." }); }
      finally { setLoading(false); }
      return;
    }

    if (!input.trim()) return;
    const userText = input.trim();
    addMsg({ role: "user", text: userText });
    setInput(""); setLoading(true);

    const isQuestion = /^(what|how|why|who|is |does|can|tell|explain|help)/i.test(userText) && userText.length < 120;
    if (isQuestion) { await sendChat(userText); setLoading(false); return; }

    // LOCAL-FIRST: instant pattern match for obvious scams
    const localCheck = localPatternScan(userText);
    if (localCheck.score >= 70 && localCheck.signals.length >= 2) {
      const { text, scanResult, suggestions } = buildBotReply("message", {
        risk_score: localCheck.score,
        verdict: localCheck.verdict,
        why_flagged: localCheck.signals,
        explanation: "Instant local scan — your message never left your device.",
      });
      addMsg({ role: "bot", text, scanResult, suggestions });
      if (scanResult) recordScan("message", scanResult);
      // Still send to server for full analysis in background
      fetch(`${API}/api/scan/full`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: userText, lang }) }).catch(() => {});
      setLoading(false);
      return;
    }

    const mode = detectInputType(userText);
    try {
      let resp: Response;
      if (mode === "upi") resp = await fetch(`${API}/api/upi/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upi_id: userText, lang }) });
      else if (mode === "phone") resp = await fetch(`${API}/api/phone/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: userText, lang }) });
      else if (mode === "link") resp = await fetch(`${API}/api/link/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: userText, lang }) });
      else resp = await fetch(`${API}/api/scan/full`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: userText, lang }) });
      if (!resp.ok) throw new Error("Server error");
      const data = await resp.json();
      const { text, scanResult, suggestions } = buildBotReply(mode, data);
      addMsg({ role: "bot", text, scanResult, suggestions });
      if (scanResult) recordScan(mode, scanResult);
    } catch { addMsg({ role: "bot", text: "Couldn't complete the check. Try again." }); }
    finally { setLoading(false); }
  };

  const recordScan = (mode: ScanMode, sr: NonNullable<ChatMsg["scanResult"]>) => {
    if (onCouncilUpdate && sr.council_votes && sr.council_votes.length > 0) {
      onCouncilUpdate({ votes: sr.council_votes, kavachScore: sr.kavach_score, councilScore: sr.council_score, agreement: sr.council_agreement, score: sr.score, verdict: sr.verdict });
    }
    trackVigilance("scan", `${mode}: ${sr.verdict} (${sr.score}/100)`);
    try { new Audio("/ting.wav").play(); } catch {}
    try { const v = sr.verdict; if (v === "SUSPICIOUS" || v === "HIGH") navigator.vibrate([100,50,100,50,100]); else if (v === "UNCLEAR" || v === "MEDIUM") navigator.vibrate([80,60,80]); else navigator.vibrate(50); } catch {}
    fetch("/api/analytics/event", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ event: "scan", scan_type: mode, verdict: sr.verdict, score: sr.score }) }).catch(() => {});
    try {
      const h = JSON.parse(localStorage.getItem("chetana_history") || "[]");
      h.unshift({ verdict: sr.verdict, score: sr.score, type: mode, ts: Date.now() });
      if (h.length > 100) h.length = 100;
      localStorage.setItem("chetana_history", JSON.stringify(h));
      localStorage.setItem("chetana_scan_count", String((parseInt(localStorage.getItem("chetana_scan_count") || "0")) + 1));
    } catch {}
  };

  return (
    <>
      {/* Chat window */}
      <AnimatePresence>
        {open && (
          <>
          {!inline && <div className="sw-backdrop" onClick={() => setOpen(false)} />}
          <motion.div
            className={`sw-window${dragging ? " sw-dragging" : ""}${inline ? " sw-inline" : ""}`}
            initial={inline ? { opacity: 1 } : { opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={inline ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleFileDrop}
          >
            {/* Header */}
            <div className="sw-header">
              <div className="sw-header-left">
                <div className="sw-avatar"><Shield size={16} /></div>
                <div>
                  <div className="sw-title">Chetana</div>
                  <div className="sw-subtitle">check karo, safe raho</div>
                </div>
              </div>
              <div className="sw-header-right">
                <select className="sw-lang" value={lang} onChange={e => { setLang(e.target.value); localStorage.setItem("chetana_lang", e.target.value); }}>
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
                <button className="sw-close" onClick={() => setOpen(false)}><X size={18} /></button>
              </div>
            </div>

            {/* Inline consent — shown once before first scan */}
            {!agreed && (
              <div className="sw-consent">
                <ShieldCheck size={20} style={{ color: 'var(--safe)', marginBottom: 8 }} />
                <p className="sw-consent-text">
                  Text checks can start locally. Links, media, and deeper reviews may use server help when needed.
                  Results are advisory, not legal determinations.
                </p>
                <button className="sw-consent-btn" onClick={acceptTerms}>
                  I understand — let me scan
                </button>
                <p className="sw-consent-fine">
                  By continuing you agree to our <a href="#" onClick={e => { e.preventDefault(); if (onRequireProof) onRequireProof(); }}>terms</a>. Emergency: call 1930.
                </p>
              </div>
            )}

            {/* Tab Switcher */}
            <div className="sw-tabs">
              <button className={`sw-tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>
                <Bot size={14} /> <span>Chat Scanner</span>
              </button>
              <button className={`sw-tab ${activeTab === 'apk' ? 'active' : ''}`} onClick={() => setActiveTab('apk')}>
                <ShieldAlert size={14} /> <span>APK Danger Lane</span>
              </button>
            </div>

            {/* Messages */}
            <div className="sw-messages" ref={scrollRef} style={{ display: agreed ? undefined : 'none' }}>
              {activeTab === "chat" ? (
                <>
                  {messages.map((msg) => (
                <div key={msg.id} className={`sw-msg ${msg.role}`}>
                  <div className={`sw-bubble ${msg.role}`}>
                    {msg.scanResult && (
                      <>
                        <div className={`sw-verdict ${verdictClass(msg.scanResult.verdict, msg.scanResult.trust_state)}`}>
                          {msg.scanResult.trust_state === "blocked" || msg.scanResult.verdict === "SUSPICIOUS" || msg.scanResult.verdict === "HIGH"
                            ? <ShieldAlert size={14} /> : msg.scanResult.trust_state === "inspect" || msg.scanResult.verdict === "UNCLEAR" || msg.scanResult.verdict === "MEDIUM"
                            ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
                          <span>{msg.scanResult.trust_state === "blocked" || msg.scanResult.verdict === "SUSPICIOUS" || msg.scanResult.verdict === "HIGH" ? "High Risk" : msg.scanResult.trust_state === "inspect" || msg.scanResult.verdict === "UNCLEAR" || msg.scanResult.verdict === "MEDIUM" ? "Caution" : "Safe"}</span>
                          <span className="sw-score">{msg.scanResult.score}/100</span>
                          {msg.scanResult.trust_state && <span className={`sw-trust-badge trust-${msg.scanResult.trust_state}`}>{trustLabel(msg.scanResult.trust_state)}</span>}
                        </div>
                        <div className="sw-result-actions">
                          <button onClick={() => speakText(msg.text)} title="Read aloud"><Volume2 size={13} /></button>
                          <button onClick={() => shareWhatsApp(msg.scanResult)} title="Share on WhatsApp"><Smartphone size={13} /></button>
                          <button onClick={() => shareResult(msg.scanResult)} title="Share"><Share2 size={13} /></button>
                        </div>
                        {/* Risk framing */}
                        {msg.scanResult.score >= 70 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 7, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", marginTop: 4, fontSize: 11.5, color: "rgba(255,200,200,0.85)", lineHeight: 1.4 }}>
                            <Shield size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
                            <span>This looks risky. Stop for a moment and verify through the bank app, official website, or known helpline before you act.</span>
                          </div>
                        )}
                        {msg.scanResult.score >= 50 && msg.scanResult.score < 70 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 7, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", marginTop: 4, fontSize: 11.5, color: "rgba(255,220,170,0.85)", lineHeight: 1.4 }}>
                            <Shield size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
                            <span>There are warning signs here. Verify first before you click, pay, reply, install an app, or share OTP details.</span>
                          </div>
                        )}
                        {msg.scanResult.score >= 70 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 7, background: "rgba(239,68,68,0.06)", marginTop: 3, fontSize: 11, color: "rgba(255,180,180,0.7)", fontStyle: "italic" }}>
                            <span>Take 5 minutes to think before responding to this message</span>
                          </div>
                        )}
                        {/* Evidence & Report actions for high-risk results */}
                        {msg.scanResult.score >= 50 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                            <button
                              onClick={() => handleSaveEvidence(msg)}
                              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)", fontSize: 11, cursor: "pointer" }}
                              title="Download evidence pack"
                            >
                              <FileText size={12} /> Save Evidence
                            </button>
                            <button
                              onClick={() => handleReportNow(msg)}
                              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.15)", color: "#ff8a8a", fontSize: 11, cursor: "pointer", fontWeight: 600 }}
                              title="Report to authorities"
                            >
                              <Flag size={12} /> Report Now
                            </button>
                            <button
                              onClick={() => {
                                const text = "I checked this with Chetana and it looks suspicious. Be careful. chetana.activemirror.ai";
                                if (navigator.share) {
                                  navigator.share({ text }).catch(() => {});
                                } else {
                                  navigator.clipboard?.writeText(text);
                                }
                              }}
                              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)", fontSize: 11, cursor: "pointer" }}
                              title="Share warning"
                            >
                              <Share2 size={12} /> Share Warning
                            </button>
                          </div>
                        )}
                      </>
                    )}
                    {msg.file && <div className="sw-file-badge"><Paperclip size={11} /> {msg.file}</div>}
                    <div className="sw-text">{msg.text.split("\n").map((line, i) => {
                      if (!line.trim()) return null;
                      const sanitized = line.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                      const bold = sanitized.replace(/\*\*(.*?)\*\*/g, (_m, p) => `<strong>${p}</strong>`);
                      return <p key={i} dangerouslySetInnerHTML={{ __html: bold }} />;
                    })}</div>
                    {msg.suggestions && (
                      <div className="sw-chips">
                        {msg.suggestions.map((s, i) => (
                          <button key={i} onClick={() => handleSuggestion(s)}>{s}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                  ))}
                </>
              ) : (
                <div className="sw-apk-lane">
                  <div className="apk-intro">
                    <ShieldAlert size={28} style={{ color: "var(--danger)" }} />
                    <h4>APK Danger Lane</h4>
                    <p>Verify app install links, SMS warnings, or suspicious URLs.</p>
                  </div>
                  
                  <div className="apk-fields">
                    <label>Install URL / Link</label>
                    <input type="text" value={apkUrl} onChange={e => setApkUrl(e.target.value)} placeholder="https://example.com/app.apk" />
                    
                    <label>Claimed Brand (e.g. SBI, Police, DHL)</label>
                    <input type="text" value={apkBrand} onChange={e => setApkBrand(e.target.value)} placeholder="Who does it say they are?" />
                    
                    <label>Warning / Message Text</label>
                    <textarea value={input} onChange={e => setInput(e.target.value)} placeholder="Paste any text from the SMS or install prompt..." rows={3} />
                    
                    <button className="apk-check-btn" onClick={checkApkRisk} disabled={loading || !apkUrl}>
                      {loading ? "Analyzing..." : "Confirm Security"}
                    </button>
                  </div>

                  {apkResult && (
                    <div className={`apk-result-card risk-${apkResult.risk_level}`}>
                      <div className="apk-result-header">
                        {apkResult.risk_level === "critical" || apkResult.risk_level === "high" ? <ShieldAlert size={18} /> : <ShieldCheck size={18} />}
                        <span>{apkResult.risk_level.toUpperCase()} RISK</span>
                      </div>
                      
                      {apkResult.reason_tags.length > 0 && (
                        <div className="apk-signals">
                          {apkResult.reason_tags.map((t: string) => <span key={t} className="apk-tag">{t.replace(/_/g, ' ')}</span>)}
                        </div>
                      )}

                      <div className="apk-actions-list">
                        <h5>Recommended Actions:</h5>
                        <ul>
                          {apkResult.recommended_actions.map((a: string) => <li key={a}>{a}</li>)}
                        </ul>
                      </div>
                      
                      <div className="apk-result-footer">
                        <button className="apk-save-btn" onClick={() => handleSaveEvidence({ 
                          role: "bot", 
                          text: `APK Risk Check: ${apkResult.risk_level}\nURL: ${apkUrl}`, 
                          scanResult: { 
                            verdict: apkResult.risk_level.toUpperCase(), 
                            score: apkResult.risk_level === "critical" ? 95 : 75, 
                            signals: apkResult.reason_tags 
                          } 
                        } as any)}>
                          <FileText size={14} /> Save Report
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {activeTab === "chat" && loading && (
                <div className="sw-msg bot">
                  <div className="sw-bubble bot sw-typing"><span /><span /><span /></div>
                </div>
              )}
            </div>

            {/* Drag overlay */}
            {dragging && (
              <div className="sw-drop-overlay">
                <Upload size={32} />
                <span>Drop file to check</span>
              </div>
            )}

            {/* File attachment bar */}
            {file && (
              <div className="sw-file-bar">
                <Paperclip size={13} />
                <span className="sw-file-name">{file.name}</span>
                <span className="sw-file-size">{(file.size / 1024).toFixed(0)} KB</span>
                <button className="sw-file-remove" onClick={() => setFile(null)}><X size={13} /></button>
              </div>
            )}

            {/* Input */}
            <div className="sw-input-bar">
              <input ref={fileRef} type="file" accept="image/*,video/*,audio/*,application/pdf" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0] || null; setFile(f); if (f) setTimeout(() => inputRef.current?.focus(), 0); e.target.value = ""; }} />
              <button className="sw-action sw-upload-btn" onClick={() => fileRef.current?.click()} title="Upload screenshot, photo, PDF, or audio"><Upload size={16} /></button>
              {SpeechRecClass && <button className={`sw-action${listening ? " sw-listening" : ""}`} onClick={toggleMic}><Mic size={16} /></button>}
              <textarea
                ref={inputRef}
                className="sw-text-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={file ? "Add a note (optional) or just hit send..." : "Paste suspicious message or screenshot..."}
                rows={1}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 100) + 'px'; }}
                onPaste={e => {
                  const items = e.clipboardData?.items;
                  if (!items) return;
                  for (let i = 0; i < items.length; i++) {
                    if (items[i].type.startsWith("image/")) {
                      const blob = items[i].getAsFile();
                      if (blob) { setFile(new File([blob], `screenshot-${Date.now()}.png`, { type: blob.type })); e.preventDefault(); }
                      break;
                    }
                  }
                }}
              />
              <button className={`sw-send${canSend ? " sw-send-ready tool-check-ready" : ""}`} onClick={handleSend} disabled={!canSend}>
                <Send size={16} />
              </button>
            </div>
          </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/* ── Panic Mode — "I Already Paid" — Emergency Action Flow ──── */
export function PanicPage() {
  const [shareCopied, setShareCopied] = useState(false);

  const shareMessage = "I may have been targeted by a scam. Here's what happened and what I'm doing about it. Chetana (chetana.activemirror.ai) helped me take these steps.";

  const handleShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ text: shareMessage }); } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(shareMessage);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 3000);
    }
  };

  const stepConnector = (
    <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
      <div style={{ width: 2, height: 20, background: "rgba(255,255,255,0.08)", borderRadius: 1 }} />
    </div>
  );

  return (
    <motion.section className="panel" {...fadeIn} style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* Header */}
      <div className="panel-header" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}><AlertTriangle size={48} style={{ color: "var(--danger)" }} /></div>
        <h2 style={{ color: "var(--danger)", marginBottom: 8 }}>Already paid or shared information?</h2>
        <p style={{ fontSize: "1rem", lineHeight: 1.6, maxWidth: 540, margin: "0 auto", color: "var(--muted)" }}>
          This is a sophisticated scam that has affected thousands of people. You are not to blame. Follow these steps right now — speed matters.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 0, padding: "0 8px" }}>

        {/* ── Step 1: Immediate ── */}
        <motion.div {...fadeInDelay(0.1)}>
          <div className="trust-card" style={{
            borderLeft: "4px solid var(--danger)",
            background: "rgba(239,68,68,0.06)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "var(--danger)", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 15, flexShrink: 0,
              }}>1</div>
              <div>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--danger)", fontWeight: 700 }}>Immediate</div>
                <h3 style={{ margin: 0 }}>Call 1930 NOW</h3>
              </div>
            </div>
            <p>This is India's national cybercrime helpline. They can <strong>freeze the transaction</strong> if you call within the golden hour (first 1-2 hours). Every minute counts.</p>
            <a href="tel:1930" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              marginTop: 10, padding: "12px 28px",
              background: "var(--danger)", color: "#fff",
              borderRadius: 10, fontWeight: 700, fontSize: "1rem",
              textDecoration: "none", boxShadow: "0 4px 20px rgba(239,68,68,0.35)",
            }}>
              <Phone size={18} /> Call 1930 Now
            </a>
            <p style={{ marginTop: 12, fontSize: "0.88rem" }}>
              Then <strong>contact your bank immediately</strong> to freeze the transaction. Use the number on the back of your card — not any number the scammer gave you.
            </p>
          </div>
        </motion.div>

        {stepConnector}

        {/* ── Step 2: Preserve Evidence ── */}
        <motion.div {...fadeInDelay(0.2)}>
          <div className="trust-card" style={{ borderLeft: "4px solid var(--amber)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "var(--amber)", color: "#000",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 15, flexShrink: 0,
              }}>2</div>
              <div>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--amber)", fontWeight: 700 }}>Preserve Evidence</div>
                <h3 style={{ margin: 0 }}>Save everything. Delete nothing.</h3>
              </div>
            </div>
            <p>Screenshot all messages, calls, and transactions — <strong>before the scammer deletes them</strong>. Save WhatsApp chats, SMS, call logs, UPI transaction IDs, and bank statements.</p>
            <p>Chetana can help you package this evidence for your complaint.</p>
            <div style={{
              marginTop: 12, padding: "10px 14px",
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.2)",
              borderRadius: 8, fontSize: "0.85rem", lineHeight: 1.5,
            }}>
              <strong style={{ color: "var(--amber)" }}>Why now?</strong> Evidence preserved immediately is <strong>3x more useful to police</strong> than evidence gathered later. Scammers delete trails fast.
            </div>
          </div>
        </motion.div>

        {stepConnector}

        {/* ── Step 3: Report ── */}
        <motion.div {...fadeInDelay(0.3)}>
          <div className="trust-card" style={{ borderLeft: "4px solid var(--primary-bright)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "var(--primary-bright)", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 15, flexShrink: 0,
              }}>3</div>
              <div>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--primary-bright)", fontWeight: 700 }}>Report</div>
                <h3 style={{ margin: 0 }}>File a complaint — protect others too</h3>
              </div>
            </div>
            <p>Your report helps law enforcement track and shut down these networks. Every complaint makes it harder for scammers to target the next person.</p>
            <a href="https://cybercrime.gov.in" target="_blank" rel="noopener" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              marginTop: 8, padding: "10px 22px",
              background: "var(--primary-bright)", color: "#fff",
              borderRadius: 10, fontWeight: 600, fontSize: "0.9rem",
              textDecoration: "none",
            }}>
              <Flag size={16} /> File at cybercrime.gov.in
            </a>
            <p style={{ marginTop: 10, fontSize: "0.85rem", color: "var(--muted)" }}>
              Your 1930 call reference number will speed this up. Attach the screenshots you saved in Step 2.
            </p>
          </div>
        </motion.div>

        {stepConnector}

        {/* ── Step 4: Alert Family ── */}
        <motion.div {...fadeInDelay(0.4)}>
          <div className="trust-card" style={{ borderLeft: "4px solid var(--safe, #22c55e)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "var(--safe, #22c55e)", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 15, flexShrink: 0,
              }}>4</div>
              <div>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--safe, #22c55e)", fontWeight: 700 }}>Alert Family</div>
                <h3 style={{ margin: 0 }}>You are not alone. This is not your fault.</h3>
              </div>
            </div>
            <p>Share what happened with someone you trust. They can help you stay calm, follow up with the bank, and watch for follow-up scams (scammers often try again pretending to "help recover" your money).</p>
            <button onClick={handleShare} style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              marginTop: 10, padding: "10px 22px",
              background: shareCopied ? "var(--safe, #22c55e)" : "rgba(34,197,94,0.12)",
              color: shareCopied ? "#fff" : "var(--safe, #22c55e)",
              border: shareCopied ? "none" : "1px solid rgba(34,197,94,0.3)",
              borderRadius: 10, fontWeight: 600, fontSize: "0.9rem",
              cursor: "pointer", transition: "all 0.2s ease",
            }}>
              <Share2 size={16} />
              {shareCopied ? "Message copied!" : "Share with someone you trust"}
            </button>
            <p style={{ marginTop: 8, fontSize: "0.8rem", color: "var(--muted)" }}>
              Sends: "I may have been targeted by a scam. Here's what happened and what I'm doing about it."
            </p>
          </div>
        </motion.div>

        {stepConnector}

        {/* ── Step 5: Protect ── */}
        <motion.div {...fadeInDelay(0.5)}>
          <div className="trust-card" style={{ borderLeft: "4px solid var(--primary-bright)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "var(--primary-bright)", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 15, flexShrink: 0,
              }}>5</div>
              <div>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--primary-bright)", fontWeight: 700 }}>Protect</div>
                <h3 style={{ margin: 0 }}>Lock down your accounts</h3>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <Lock size={16} style={{ color: "var(--primary-bright)", marginTop: 3, flexShrink: 0 }} />
                <p style={{ margin: 0 }}><strong>Change passwords</strong> for any accounts you shared information with — banking apps, email, UPI apps, and social media.</p>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <Smartphone size={16} style={{ color: "var(--primary-bright)", marginTop: 3, flexShrink: 0 }} />
                <p style={{ margin: 0 }}><strong>Enable 2FA</strong> (two-factor authentication) on all banking and payment apps. This adds a second lock even if your password is compromised.</p>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <Eye size={16} style={{ color: "var(--primary-bright)", marginTop: 3, flexShrink: 0 }} />
                <p style={{ margin: 0 }}><strong>Monitor your accounts</strong> for the next 30 days. Report any unauthorized transactions immediately.</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", marginTop: 32, padding: 20, background: "rgba(255,255,255,0.03)", borderRadius: 12 }}>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: 8 }}>
          Chetana is not a government service. For emergencies, contact local police or call 112.
        </p>
        <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: 0 }}>
          Women helpline: 181 · Senior citizens: 14567 · Child helpline: 1098
        </p>
      </div>
    </motion.section>
  );
}

/* ── Incident Mode Stepper — 5-screen guided flow ────────────── */
export function IncidentStepper({ onNavigate }: { onNavigate: (p: PageId) => void }) {
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [screen, setScreen] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API = window.location.hostname === "localhost" ? "" : "";

  // Start incident on mount
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`${API}/api/incident/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ risk_level: "red", category: null, score: 85 }),
        });
        if (!resp.ok) throw new Error("Failed to start incident");
        const data = await resp.json();
        setIncidentId(data.incident_id);
        setScreen(data.screen);
        setStep(0);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const doAction = async (action: string, payload?: any) => {
    if (!incidentId) return;
    setLoading(true);
    try {
      const resp = await fetch(`${API}/api/incident/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incident_id: incidentId, action, payload }),
      });
      if (!resp.ok) throw new Error("Action failed");
      const data = await resp.json();
      setScreen(data.screen);
      setStep(s => s + (action === "next" ? 1 : 0));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const stepNames = ["Stabilize", "What this is", "Next actions", "Family", "Follow-up"];

  if (error) return (
    <motion.section className="panel" {...fadeIn} style={{ maxWidth: 680, margin: "0 auto", textAlign: "center" }}>
      <p style={{ color: "var(--danger)" }}>Could not start incident mode: {error}</p>
      <button className="tool-protect-btn" style={{ marginTop: 16, width: "auto" }} onClick={() => onNavigate("scan")}>Back to scanner</button>
    </motion.section>
  );

  if (loading && !screen) return (
    <motion.section className="panel" {...fadeIn} style={{ maxWidth: 680, margin: "0 auto", textAlign: "center", padding: 40 }}>
      <ShieldAlert size={32} style={{ color: "var(--danger)", marginBottom: 12 }} />
      <p>Starting incident mode...</p>
    </motion.section>
  );

  return (
    <motion.section className="panel" {...fadeIn} style={{ maxWidth: 680, margin: "0 auto" }}>
      {/* Progress bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
        {stepNames.map((name, i) => (
          <div key={name} style={{ flex: 1, textAlign: "center" }}>
            <div style={{ height: 4, borderRadius: 2, background: i <= step ? "var(--danger)" : "var(--line)", transition: "background 0.3s" }} />
            <div style={{ fontSize: 10, color: i <= step ? "var(--text-bright)" : "var(--muted)", marginTop: 4 }}>{name}</div>
          </div>
        ))}
      </div>

      {/* Screen content */}
      {screen && (<>
        {screen.headline && (
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ color: "var(--danger)", fontSize: 22, marginBottom: 8 }}>
              <ShieldAlert size={22} style={{ verticalAlign: "middle", marginRight: 8 }} />
              {screen.headline}
            </h2>
          </div>
        )}

        {/* Do-nots (Screen 1) */}
        {screen.do_nots && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {screen.do_nots.map((d: string, i: number) => (
              <div key={i} className="trust-card" style={{ borderLeft: "3px solid var(--danger)", padding: "12px 16px" }}>
                <strong>{d}</strong>
              </div>
            ))}
          </div>
        )}

        {/* Processing disclosure */}
        {screen.processing_disclosure && (
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>{screen.processing_disclosure}</p>
        )}

        {/* Category diagnosis (Screen 2) */}
        {screen.category_label && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "inline-block", padding: "4px 12px", borderRadius: 20, background: "rgba(239,68,68,0.15)", color: "var(--danger)", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              {screen.category_label}
            </div>
            <p style={{ marginBottom: 12 }}>{screen.explanation}</p>
            {screen.known_signals?.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>Confirmed signals</div>
                {screen.known_signals.map((s: string, i: number) => (
                  <div key={i} style={{ fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--line)" }}>{s}</div>
                ))}
              </div>
            )}
            {screen.suspected_signals?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: "var(--amber)", textTransform: "uppercase", marginBottom: 4 }}>Suspected</div>
                {screen.suspected_signals.map((s: string, i: number) => (
                  <div key={i} style={{ fontSize: 13, padding: "4px 0", color: "var(--muted)" }}>{s}</div>
                ))}
              </div>
            )}
            {screen.trust_note && <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 12, fontStyle: "italic" }}>{screen.trust_note}</p>}
          </div>
        )}

        {/* Actions (Screen 3) */}
        {screen.actions && !screen.do_nots && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {screen.actions.map((a: string, i: number) => (
              <div key={i} className="trust-card" style={{ borderLeft: "3px solid var(--primary-bright)", padding: "12px 16px" }}>
                <strong>{i + 1}.</strong> {a}
              </div>
            ))}
          </div>
        )}

        {/* Family (Screen 4) */}
        {screen.prompt && screen.options && !screen.question && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ marginBottom: 12 }}>{screen.prompt}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {screen.options.map((o: string) => (
                <button key={o} className="trust-card" style={{ borderLeft: "3px solid var(--safe)", padding: "12px 16px", cursor: "pointer", textAlign: "left", background: "rgba(34,197,94,0.05)" }}
                  onClick={() => doAction(o === "share_alert" ? "alert_family" : "next")}>
                  {o === "share_alert" ? "Share alert with family" : o === "guardian_notified" ? "Guardian already knows" : "I am checking this for my parent"}
                </button>
              ))}
            </div>
            {screen.consent_note && <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>{screen.consent_note}</p>}
          </div>
        )}

        {/* Follow-up (Screen 5) */}
        {screen.question && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ marginBottom: 12 }}>{screen.question}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {screen.options?.map((o: string) => (
                <button key={o} className="trust-card" style={{ padding: "12px 16px", cursor: "pointer", textAlign: "left" }}
                  onClick={() => doAction("follow_up_outcome", { outcome: o })}>
                  {o === "money_sent" ? "I sent money" : o === "account_linked" ? "Account was linked" : o === "reported" ? "I reported it" : o === "no_action" ? "No action taken" : "I need callback guidance"}
                </button>
              ))}
            </div>
          </div>
        )}
      </>)}

      {/* CTAs */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        {screen?.ctas?.includes("call_1930") && (
          <a href="tel:1930" className="tool-protect-btn" style={{ flex: 1, textDecoration: "none", textAlign: "center", minWidth: 140 }}>
            Call 1930
          </a>
        )}
        {screen?.ctas?.includes("cybercrime_portal") && (
          <a href="https://cybercrime.gov.in" target="_blank" rel="noopener" style={{ flex: 1, padding: "10px 16px", borderRadius: 10, border: "1px solid var(--line)", color: "var(--text-bright)", textAlign: "center", textDecoration: "none", fontWeight: 600 }}>
            Cybercrime Portal
          </a>
        )}
        {screen?.ctas?.includes("next") && (
          <button onClick={() => doAction("next")} disabled={loading} style={{ flex: 1, padding: "10px 16px", borderRadius: 10, background: "var(--primary-bright)", color: "#fff", border: "none", fontWeight: 700, cursor: "pointer", minWidth: 100 }}>
            {loading ? "..." : "Next"}
          </button>
        )}
        {screen?.ctas?.includes("alert_family") && (
          <button onClick={() => doAction("alert_family")} style={{ flex: 1, padding: "10px 16px", borderRadius: 10, border: "1px solid var(--line)", color: "var(--text-bright)", background: "none", fontWeight: 600, cursor: "pointer", minWidth: 100 }}>
            Alert Family
          </button>
        )}
        {!screen?.ctas && step < 4 && (
          <button onClick={() => doAction("next")} disabled={loading} style={{ flex: 1, padding: "10px 16px", borderRadius: 10, background: "var(--primary-bright)", color: "#fff", border: "none", fontWeight: 700, cursor: "pointer" }}>
            {loading ? "..." : "Next"}
          </button>
        )}
      </div>

      {/* Back to scanner */}
      <div style={{ textAlign: "center", marginTop: 20 }}>
        <button onClick={() => onNavigate("scan")} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 13, textDecoration: "underline" }}>
          Back to scanner
        </button>
      </div>
    </motion.section>
  );
}

/* ── Family Page (Parivar) ───────────────────────────────────── */
interface FamilyContact { name: string; phone: string; }
const FAMILY_KEY = "chetana_family_contacts";
const SENIOR_KEY = "chetana_senior_mode";

export function FamilyPage() {
  const [contacts, setContacts] = useState<FamilyContact[]>(() => {
    try { return JSON.parse(localStorage.getItem(FAMILY_KEY) || "[]"); } catch { return []; }
  });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [seniorMode, setSeniorMode] = useState(() => localStorage.getItem(SENIOR_KEY) === "true");
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  const saveContacts = (c: FamilyContact[]) => { setContacts(c); localStorage.setItem(FAMILY_KEY, JSON.stringify(c)); };

  const addContact = () => {
    const trimName = name.trim();
    const trimPhone = phone.trim();
    if (!trimName || !trimPhone) return;
    if (contacts.length >= 5) return;
    saveContacts([...contacts, { name: trimName, phone: trimPhone }]);
    setName(""); setPhone("");
  };

  const removeContact = (idx: number) => { saveContacts(contacts.filter((_, i) => i !== idx)); };

  const toggleSenior = () => {
    const next = !seniorMode;
    setSeniorMode(next);
    localStorage.setItem(SENIOR_KEY, String(next));
  };

  const sendAlert = async () => {
    const msg = "I received a suspicious message. Can you help me verify? Check it at chetana.activemirror.ai";
    if (navigator.share) {
      try { await navigator.share({ title: "Chetana Family Alert", text: msg }); setShareStatus("Shared!"); }
      catch { setShareStatus(null); }
    } else {
      try { await navigator.clipboard.writeText(msg); setShareStatus("Copied to clipboard!"); }
      catch { setShareStatus("Could not share"); }
    }
    if (shareStatus) setTimeout(() => setShareStatus(null), 3000);
  };

  const cardStyle: React.CSSProperties = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "20px 24px" };
  const inputStyle: React.CSSProperties = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#f8fafc", fontSize: 14, width: "100%", outline: "none" };

  return (
    <motion.section className="panel" {...fadeIn}>
      <div className="panel-header">
        <h2><Users size={20} style={{ verticalAlign: "middle", marginRight: 8 }} />Parivar — Family Trust Circle</h2>
        <p>Protect your family from scams. Add trusted contacts, send alerts instantly, and keep elders safe.</p>
      </div>

      {/* Senior-Safe Banner */}
      {seniorMode && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 12, padding: "12px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <ShieldCheck size={18} style={{ color: "#22c55e", flexShrink: 0 }} />
          <span style={{ color: "#22c55e", fontWeight: 600, fontSize: 14 }}>Senior-safe mode active</span>
        </motion.div>
      )}

      {/* Family Protection Score */}
      <motion.div {...fadeInDelay(0.1)} style={{ ...cardStyle, marginBottom: 20, textAlign: "center" }}>
        <Shield size={32} style={{ color: "var(--primary-bright)", marginBottom: 8 }} />
        {contacts.length > 0 ? (
          <div style={{ fontSize: 18, fontWeight: 700, color: "#f8fafc" }}>Your family circle: {contacts.length} member{contacts.length !== 1 ? "s" : ""} protected</div>
        ) : (
          <div style={{ fontSize: 15, color: "rgba(255,255,255,0.5)" }}>Add your first trusted contact to start protecting your family.</div>
        )}
      </motion.div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>

        {/* Add Trusted Contacts */}
        <motion.div {...fadeInDelay(0.2)} style={cardStyle}>
          <h3 style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><UserCheck size={18} style={{ color: "var(--primary-bright)" }} /> Trusted Contacts</h3>
          {contacts.length < 5 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              <input style={inputStyle} placeholder="Name" value={name} onChange={e => setName(e.target.value)} maxLength={40} />
              <input style={inputStyle} placeholder="Phone number" value={phone} onChange={e => setPhone(e.target.value)} maxLength={15} type="tel" />
              <button onClick={addContact} disabled={!name.trim() || !phone.trim()} style={{ background: "var(--primary-bright)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 600, cursor: "pointer", opacity: (!name.trim() || !phone.trim()) ? 0.4 : 1, transition: "opacity 0.2s" }}>
                Add Contact ({contacts.length}/5)
              </button>
            </div>
          )}
          {contacts.length >= 5 && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>Maximum 5 contacts reached.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {contacts.map((c, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Phone size={14} style={{ color: "var(--primary-bright)" }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#f8fafc" }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{c.phone}</div>
                  </div>
                </div>
                <button onClick={() => removeContact(i)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", padding: 4 }} title="Remove">
                  <X size={14} />
                </button>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* One-Tap Family Alert + Senior Toggle */}
        <motion.div {...fadeInDelay(0.3)} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Alert Button */}
          <div style={cardStyle}>
            <h3 style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><Share2 size={18} style={{ color: "#f59e0b" }} /> One-Tap Family Alert</h3>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 16, lineHeight: 1.5 }}>Send a pre-written alert to your family asking them to help verify a suspicious message.</p>
            <button onClick={sendAlert} style={{ width: "100%", padding: "16px 20px", background: "linear-gradient(135deg, #f59e0b, #ef4444)", border: "none", borderRadius: 14, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transition: "transform 0.15s", boxShadow: "0 4px 24px rgba(245,158,11,0.25)" }}>
              <AlertTriangle size={20} />
              Alert My Family
            </button>
            {shareStatus && (
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 10, fontSize: 13, color: "#22c55e", textAlign: "center" }}>
                {shareStatus}
              </motion.div>
            )}
          </div>

          {/* Senior-Safe Toggle */}
          <div style={cardStyle}>
            <h3 style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><Eye size={18} style={{ color: "#a78bfa" }} /> Senior-Safe Mode</h3>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 16, lineHeight: 1.5 }}>Enable simplified interface signals for elderly family members.</p>
            <button onClick={toggleSenior} style={{ width: "100%", padding: "14px 20px", background: seniorMode ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)", border: seniorMode ? "2px solid rgba(34,197,94,0.4)" : "1px solid rgba(255,255,255,0.1)", borderRadius: 14, color: seniorMode ? "#22c55e" : "rgba(255,255,255,0.5)", fontSize: 15, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transition: "all 0.2s" }}>
              <ShieldCheck size={18} />
              {seniorMode ? "Senior-Safe Mode: ON" : "Senior-Safe Mode: OFF"}
            </button>
          </div>
        </motion.div>
      </div>
    </motion.section>
  );
}

/* ── Footer ──────────────────────────────────────────────────── */
export function Footer({ onNavigate }: { onNavigate: (p: PageId) => void }) {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <div className="footer-logo">
            <div className="brand-glyph" style={{ width: 36, height: 36 }}><Shield size={16} /></div>
            <div>
              <div className="brand-title" style={{ fontSize: 17 }}>Chetana</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>India's free scam checker</div>
            </div>
          </div>
          <p className="footer-desc">AI-powered scam detection and trust verification. Check messages, links, UPI IDs, and phone numbers against live threat intelligence.</p>
        </div>
        <div className="footer-links">
          <div className="footer-col">
            <h4>Product</h4>
            <button onClick={() => onNavigate("consumer")}>Consumer</button>
            <button onClick={() => onNavigate("merchant")}>Merchant</button>
            <button onClick={() => onNavigate("nexus")}>Nexus</button>
            <button onClick={() => { window.open("https://t.me/chetnaShieldBot", "_blank"); }}>Telegram Bot</button>
          </div>
          <div className="footer-col">
            <h4>Intelligence</h4>
            <button onClick={() => onNavigate("weather")}>Scam Weather</button>
            <button onClick={() => onNavigate("atlas")}>Scam Atlas</button>
            <button onClick={() => onNavigate("trust")}>Trust by Design&#8482;</button>
            <button onClick={() => onNavigate("vigilance")}>Vigilance</button>
          </div>
          <div className="footer-col">
            <h4>Emergency</h4>
            <span className="footer-static">Cybercrime: 1930</span>
            <span className="footer-static">Women helpline: 181</span>
            <span className="footer-static">cybercrime.gov.in</span>
            <button onClick={() => onNavigate("proof")}>Terms & Disclaimer</button>
          </div>
          <div className="footer-col">
            <h4>Stay Updated</h4>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Get weekly scam alerts</p>
            <form onSubmit={e => {
              e.preventDefault();
              const email = (e.currentTarget.elements.namedItem("email") as HTMLInputElement)?.value;
              if (email) {
                fetch("/api/analytics/event", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ event: "subscribe", email }) }).catch(() => {});
                (e.currentTarget.elements.namedItem("email") as HTMLInputElement).value = "";
                alert("Subscribed! You'll get weekly scam alerts.");
              }
            }} style={{ display: 'flex', gap: 4 }}>
              <input name="email" type="email" placeholder="your@email.com" required style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 12 }} />
              <button type="submit" style={{ padding: '6px 12px', borderRadius: 8, background: '#3b82f6', color: '#fff', border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Subscribe</button>
            </form>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="footer-powered">
            <span>Powered by</span>
            <a href="https://activemirror.ai" target="_blank" rel="noopener" className="powered-brand">ActiveMirror</a>
            <span className="powered-sep">|</span>
            <span className="powered-brand">MirrorDNA</span>
            <span className="powered-sep">|</span>
            <a href="https://activemirror.ai/proof/" target="_blank" rel="noopener" className="powered-link">Proof-of-Memory</a>
          </div>
          <div className="footer-copy">&copy; {new Date().getFullYear()} ActiveMirror (N1 Intelligence). All rights reserved.</div>
        </div>
        <div className="footer-disclaimer">
          <Info size={11} /> Advisory tool only. Not affiliated with Government of India, RBI, UIDAI, CERT-IN, or any law enforcement agency. Automated verdicts are not legal determinations. Jurisdiction: Bengaluru, Karnataka, India.
        </div>
      </div>
    </footer>
  );
}


export function ChatAssistant() { return null; }
