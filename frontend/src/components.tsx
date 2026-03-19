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
import { AuroraBackground, SpotlightCard, AnimatedGradientText, GridPattern, ScrollReveal, Meteors } from "./effects";
// i18n handled by Google Translate widget (index.html)

const API = import.meta.env.DEV ? "http://localhost:8093" : "";
const fadeIn = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5 } };
const fadeInDelay = (d: number) => ({ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: d } });

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
  const termsAccepted = !!localStorage.getItem("chetana_terms_accepted");
  const items: { id: PageId; label: string; restricted?: boolean }[] = [
    { id: "home", label: "Home" },
    { id: "consumer", label: "Consumer", restricted: true },
    { id: "weather", label: "Scam Trends", restricted: true },
    { id: "atlas", label: "Scam Atlas", restricted: true },
    { id: "trust", label: "Trust" },
    { id: "story", label: "Story" },
  ];
  const navigate = (id: PageId) => { setPage(id); setOpen(false); };
  return (
    <nav className="nav">
      <div className="brand" onClick={() => navigate("home")}>
        <div className="brand-glyph"><img src="/logo.png" alt="Chetana" style={{ width: 28, height: 28, borderRadius: 6 }} /></div>
        <div>
          <div className="brand-title">Chetana</div>
          <div className="brand-sub">India's free scam checker</div>
        </div>
      </div>
      <div className={`nav-links${open ? " open" : ""}`}>
        {items.map((item) => (
          <button 
            key={item.id} 
            className={page === item.id ? "nav-btn active" : "nav-btn"} 
            onClick={() => navigate(item.id)}
          >
            {item.label}
            {!termsAccepted && item.restricted && <Lock size={10} style={{ marginLeft: 4, opacity: 0.5 }} />}
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
  { icon: "🔴", text: "Rs 22,495 crore lost to cyber fraud in India (2025) — I4C data" },
  { icon: "⚡", text: "24 lakh+ fraud complaints filed in 2025 — NCRP" },
  { icon: "🟠", text: "1 in 5 UPI users affected by fraud in last 3 years — NPCI survey" },
  { icon: "🔴", text: "51% of scam victims never report — you can help change that" },
  { icon: "⚡", text: "Cyber incidents grew 120% in 2 years — CERT-IN" },
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
export function Hero({ onNavigate }: { onNavigate: (target: PageId) => void }) {
  const openScanner = () => {
    // Trigger the scan widget to open
    document.querySelector<HTMLButtonElement>('.sw-fab')?.click();
  };
  return (
    <section style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '120px 0 40px' }}>
      <video autoPlay muted loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }} src="/chetana_clip2.mp4" />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(6,6,16,0.4) 0%, rgba(6,6,16,0.75) 50%, rgba(6,6,16,1) 100%)', zIndex: 1 }} />
      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', padding: '0 20px', maxWidth: 640 }}>
        <motion.h1 {...fadeInDelay(0.15)} style={{ fontSize: 'clamp(2.25rem, 8vw, 4.5rem)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05, marginBottom: 24 }}>
          <AnimatedGradientText>Check karo.</AnimatedGradientText><br /><AnimatedGradientText>Safe raho.</AnimatedGradientText>
        </motion.h1>
        <motion.p {...fadeInDelay(0.25)} style={{ fontSize: 'clamp(1rem, 3vw, 1.25rem)', lineHeight: 1.7, color: 'rgba(255,255,255,0.7)', maxWidth: 480, margin: '0 auto 28px', fontWeight: 500 }}>
          Got a suspicious message? Paste it here.<br />We'll tell you if it's a scam. In seconds. For free.
        </motion.p>

        {/* Main CTA — opens the scanner */}
        <motion.div {...fadeInDelay(0.35)} className="hero-cta-wrap" onClick={openScanner}>
          <span className="hero-cta-glow-border" />
          <button className="hero-scan-cta">
            <Shield size={18} />
            <span>Check a message</span>
            <span style={{ opacity: 0.45, fontWeight: 400, fontSize: '0.85em' }}>— it's free</span>
          </button>
        </motion.div>

        <motion.div {...fadeInDelay(0.45)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
          <span className="hero-trust-pill">No login</span>
          <span className="hero-trust-pill">12 languages</span>
          <span className="hero-trust-pill">SMS · Links · UPI · Voice</span>
        </motion.div>
      </div>
    </section>
  );
}

/* ── Stats Strip ─────────────────────────────────────────────── */
export function StatsStrip() {
  const [stats, setStats] = useState({ total_scans: 0, scams_caught: 0, languages: 12 });

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
    </motion.div>
    </ScrollReveal>
  );
}

/* ── ScanBox / ScanChat — AI-powered chat scanner ─────────────── */
type ScanMode = "message" | "link" | "upi" | "phone" | "media" | "voice" | "qr";

interface ChatMsg {
  id: number;
  role: "user" | "bot";
  text: string;
  scanResult?: { verdict: string; score: number; signals: string[]; action: string; trust_state?: string; reason_codes?: string[] };
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
  return { text, scanResult: { verdict, score, signals, action, trust_state, reason_codes }, suggestions };
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
    if (lower.includes("history") || lower.includes("scan history")) {
      const history = JSON.parse(localStorage.getItem("chetana_history") || "[]");
      if (history.length === 0) {
        addMsg({ role: "bot", text: "No scans yet. Paste something suspicious above to get started." });
      } else {
        const summary = history.slice(0, 10).map((h: any) => {
          const d = new Date(h.ts);
          return `${h.verdict} (${h.score}/100) — ${h.type} — ${d.toLocaleDateString()}`;
        }).join("\n");
        addMsg({ role: "bot", text: `**Your last ${Math.min(history.length, 10)} scans:**\n${summary}\n\nTotal: ${history.length} scans. _Check karo. Safe raho._` });
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
            <div className="tool-brand-tag">India's free scam checker</div>
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
            <h1 className="tool-tagline">Check karo.<br />Safe raho.</h1>
            <p className="tool-desc">
              Got a suspicious SMS, WhatsApp message, link, or payment request?
              Paste it below — Chetana will tell you if it's a scam.
            </p>
            <p className="tool-desc-hi">
              Koi bhi suspicious message ya link paste karo — hum check karenge.
            </p>
          </div>

          {file && (
            <div className="tool-file"><Paperclip size={13} /><span className="tool-file-name">{file.name}</span><span className="tool-file-size">{(file.size / 1024).toFixed(0)} KB</span><button onClick={() => setFile(null)}><X size={13} /></button></div>
          )}
          <textarea
            className="tool-textarea"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={file ? "Add a note (optional) or just hit Check..." : "Paste the suspicious message or link here..."}
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
            <span>Free. No login. No data stored. Works in 12 Indian languages.</span>
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
              {msg.scanResult && (
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
              )}
              <div className="tool-card-body">{msg.text.split("\n").map((line, i) => {
                if (!line.trim()) return null;
                const bold = line.replace(/\*\*(.*?)\*\*/g, (_m, p) => `<strong>${p}</strong>`);
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
    </div>
  );
}

/* ── Stories — Cinematic Visual Section ─────────────────────── */
const STORIES = [
  { img: "/01-hero-grandmother.png", alt: "Elderly Indian woman checking phone", caption: "Amma got a suspicious KYC message. Chetana told her it was a scam — before she shared her OTP." },
  { img: "/02-student-train.png", alt: "Student on Mumbai train checking phone", caption: "Raj checked a WhatsApp forward on his commute. Chetana flagged it as a known phishing link — instantly." },
  { img: "/03-family-kitchen.png", alt: "Indian family gathered around kitchen table", caption: "The Sharma family now checks every suspicious message together. Zero scams in 6 months." },
  { img: "/04-safe-hands.png", alt: "Elderly hands holding phone with safety shield", caption: "When you see the green shield, you know you're safe. That's the Chetana promise." },
  { img: "/05-street-scene.png", alt: "Indian marketplace with people on phones", caption: "From Mumbai to Madurai — 1.4 billion Indians deserve a free scam checker that speaks their language." },
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
        <h2>Real people. Real protection.</h2>
        <p>Chetana guards India — one message at a time</p>
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
    { icon: <MessageCircle size={22} />, color: "blue", title: "Check Messages", desc: "Got a weird SMS or WhatsApp forward? Paste it here. We'll tell you if it's a known scam in seconds.", click: "consumer" as PageId },
    { icon: <Link2 size={22} />, color: "teal", title: "Check Links", desc: "Not sure if a link is safe? Paste it before you click. We check for fake bank sites, phishing, and traps.", click: "consumer" as PageId },
    { icon: <CreditCard size={22} />, color: "saffron", title: "Check UPI & Payments", desc: "Someone asking you to scan a QR or accept a collect request? Check the UPI ID first. Don't lose money.", click: "consumer" as PageId },
    { icon: <Users size={22} />, color: "violet", title: "Protect Your Family", desc: "Share simple safety tips with parents and elders. Works in Hindi, Tamil, Telugu, Bengali, and 8 more languages.", click: "atlas" as PageId },
  ];
  return (
    <>
      <div className="section-header">
        <motion.div className="kicker" {...fadeIn}><Shield size={14} /> "For you & your family"</motion.div>
        <motion.h2 {...fadeInDelay(0.05)}>Protect Yourself From Scams</motion.h2>
        <motion.p {...fadeInDelay(0.1)}>Check any suspicious message, link, or payment before you act. Free and instant.</motion.p>
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
    ["Your data stays private", "We check your message and forget it. Nothing is stored, sold, or shared. Ever.", <Lock size={20} />],
    ["You decide, not us", "We give you the facts. The final call is always yours. We never block or act without your say.", <Users size={20} />]
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
  const msg = "Check karo. Safe raho. — Free AI scam checker for India. Check suspicious messages, links, UPI IDs, and phone numbers instantly.";
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
export function ScanWidget({ onRequireProof }: { onRequireProof?: () => void }) {
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(() => !!localStorage.getItem("chetana_terms_accepted"));
  const [lang, setLang] = useState(() => localStorage.getItem("chetana_lang") || detectBrowserLang());
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([{
    id: 0, role: "bot",
    text: "Paste any suspicious message, link, UPI ID, or phone number. I'll check it for you.\n\n_Check karo. Safe raho._",
    suggestions: ["Check a message", "Check a link", "Check a UPI ID"],
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

  const handleSuggestion = (s: string) => {
    const lower = s.toLowerCase();
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

  const handleSend = async () => {
    if (!agreed) return;

    if (file) {
      const fileMode = detectFileType(file);
      const isImage = file.type.startsWith("image/");
      addMsg({ role: "user", text: `Check: ${file.name}`, file: file.name });
      const f = file; setFile(null); setLoading(true);
      try {
        const fd = new FormData(); fd.append("file", f); fd.append("lang", lang);
        // Images: try OCR first (screenshots of scam messages), fall back to deepfake analysis
        const endpoint = fileMode === "voice" ? "/api/voice/analyze" : isImage ? "/api/media/ocr" : "/api/media/analyze";
        const resp = await fetch(`${API}${endpoint}`, { method: "POST", body: fd });
        if (!resp.ok) throw new Error("Server error");
        const data = await resp.json();
        // If OCR extracted text, show it
        const ocrNote = data.ocr_text ? `\n\n**Text found in image:**\n_"${data.ocr_text.slice(0, 200)}${data.ocr_text.length > 200 ? "..." : ""}"_` : "";
        const mode = data.ocr_text ? detectInputType(data.ocr_text) as ScanMode : fileMode;
        const { text, scanResult, suggestions } = buildBotReply(mode, data, f.name);
        addMsg({ role: "bot", text: text + ocrNote, scanResult, suggestions });
        if (scanResult) recordScan(mode, scanResult);
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
      {/* FAB button */}
      {!open && (
        <button className="sw-fab" onClick={() => setOpen(true)}>
          <Shield size={24} />
          <span className="sw-fab-label">Scan</span>
        </button>
      )}

      {/* Chat window */}
      <AnimatePresence>
        {open && (
          <motion.div
            className={`sw-window${dragging ? " sw-dragging" : ""}`}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
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
                  <div className="sw-subtitle">Scam checker · Always online</div>
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
                  Chetana checks your message and forgets it. Nothing is stored, sold, or shared.
                  Results are advisory — not legal determinations.
                </p>
                <button className="sw-consent-btn" onClick={acceptTerms}>
                  I understand — let me scan
                </button>
                <p className="sw-consent-fine">
                  By continuing you agree to our <a href="#" onClick={e => { e.preventDefault(); if (onRequireProof) onRequireProof(); }}>terms</a>. Emergency: call 1930.
                </p>
              </div>
            )}

            {/* Messages */}
            <div className="sw-messages" ref={scrollRef} style={{ display: agreed ? undefined : 'none' }}>
              {messages.map(msg => (
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
                      </>
                    )}
                    {msg.file && <div className="sw-file-badge"><Paperclip size={11} /> {msg.file}</div>}
                    <div className="sw-text">{msg.text.split("\n").map((line, i) => {
                      if (!line.trim()) return null;
                      const bold = line.replace(/\*\*(.*?)\*\*/g, (_m, p) => `<strong>${p}</strong>`);
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
              {loading && (
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
              <button className={`sw-send${canSend ? " sw-send-ready" : ""}`} onClick={handleSend} disabled={!canSend}>
                <Send size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
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
