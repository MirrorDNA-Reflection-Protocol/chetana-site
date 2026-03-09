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
  Upload, FileText, Bot, Paperclip, ChevronDown, Volume2, Flag, Info
} from "lucide-react";
import { PageId, ThreatEntry, WeatherSignal, GraphNode, GraphEdge, ScanResult } from "./types";
import { ShieldAnim, FloatingCards, RadarAnim, CountUp, ScanAnim, GlobeAnim } from "./animations";
import { trackVigilance } from "./VigilancePage";

const API = import.meta.env.DEV ? "http://localhost:8093" : "";
const fadeIn = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5 } };
const fadeInDelay = (d: number) => ({ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: d } });

/* ── Background Mesh ─────────────────────────────────────────── */
export function BackgroundMesh() {
  return (
    <div className="bg-mesh">
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />
      <div className="bg-orb bg-orb-3" />
    </div>
  );
}

/* ── Nav ─────────────────────────────────────────────────────── */
export function Nav({ page, setPage }: { page: PageId; setPage: (p: PageId) => void }) {
  const [open, setOpen] = useState(false);
  const items: { id: PageId; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "consumer", label: "Consumer" },
    { id: "merchant", label: "Business" },
    { id: "nexus", label: "Enterprise" },
    { id: "weather", label: "Scam Trends" },
    { id: "atlas", label: "Scam Atlas" },
    { id: "trust", label: "Trust" },
    { id: "proof", label: "Terms" },
  ];
  const navigate = (id: PageId) => { setPage(id); setOpen(false); };
  return (
    <nav className="nav">
      <div className="brand" onClick={() => navigate("home")}>
        <div className="brand-glyph"><Shield size={18} /></div>
        <div>
          <div className="brand-title">Chetana</div>
          <div className="brand-sub">India's free scam checker</div>
        </div>
      </div>
      <div className={`nav-links${open ? " open" : ""}`}>
        {items.map((item) => (
          <button key={item.id} className={page === item.id ? "nav-btn active" : "nav-btn"} onClick={() => navigate(item.id)}>{item.label}</button>
        ))}
      </div>
      <div className="nav-right">
        <div className="india-badge">🇮🇳 India</div>
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

/* ── Ticker Banner ────────────────────────────────────────────── */
const TICKER_ITEMS = [
  { icon: "🔴", text: "Voice deepfake scams up 22% this week" },
  { icon: "⚡", text: "1 Indian gets scammed every 3 seconds" },
  { icon: "🟠", text: "Digital arrest calls up 18% — CBI never calls like this" },
  { icon: "🔴", text: "UPI payment fraud pressure: 86/100" },
  { icon: "⚡", text: "Rs 1.2 lakh crore lost to scams in India annually" },
  { icon: "🟡", text: "Task & investment scams up 15% — fake jobs are rising" },
  { icon: "🟠", text: "KYC update fraud pressure: 68/100 — don't share OTPs" },
  { icon: "🔴", text: "Bank impersonation up 8% — verify before you share anything" },
  { icon: "⚡", text: "Courier phishing up 4% — fake delivery alerts are a trap" },
  { icon: "🟡", text: "QR traps rising — never scan a QR from an unknown sender" },
];

export function AlertBanner({ onNavigate }: { onNavigate: (target: PageId) => void }) {
  return (
    <div className="ticker-banner">
      <div className="ticker-label">
        <span className="ticker-dot" />
        LIVE
      </div>
      <div className="ticker-track-wrap">
        <div className="ticker-track">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
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

/* ── Hero (Scan-centered) ────────────────────────────────────── */
export function Hero({ onNavigate }: { onNavigate: (target: PageId) => void }) {
  return (
    <motion.section className="hero" {...fadeIn}>
      <div className="hero-watermark">चेतना</div>
      <motion.div className="kicker" {...fadeInDelay(0.1)}>
        <Shield size={14} /> Free scam checker for India
      </motion.div>
      <motion.h1 {...fadeInDelay(0.15)}>
        Got a suspicious message? Check it here.
      </motion.h1>
      <motion.p {...fadeInDelay(0.2)}>
        Paste any SMS, WhatsApp forward, link, UPI ID, or phone number below. We'll tell you if it's safe or a scam — in seconds, for free, in 12 Indian languages.
      </motion.p>
    </motion.section>
  );
}

/* ── Stats Strip ─────────────────────────────────────────────── */
export function StatsStrip() {
  return (
    <motion.div className="stats-strip" {...fadeInDelay(0.3)}>
      <div className="stat-item">
        <div className="stat-value"><CountUp end={50} suffix="+" /></div>
        <div className="stat-label">Messages checked today</div>
      </div>
      <div className="stat-item">
        <div className="stat-value"><CountUp end={136} suffix="" /></div>
        <div className="stat-label">Scams caught</div>
      </div>
      <div className="stat-item">
        <div className="stat-value"><CountUp end={25} suffix="+" /></div>
        <div className="stat-label">Types of scams detected</div>
      </div>
      <div className="stat-item">
        <div className="stat-value"><CountUp end={12} suffix="" /></div>
        <div className="stat-label">Indian languages</div>
      </div>
    </motion.div>
  );
}

/* ── ScanBox / ScanChat — AI-powered chat scanner ─────────────── */
type ScanMode = "message" | "link" | "upi" | "phone" | "media" | "voice" | "qr" | "aadhaar";

interface ChatMsg {
  id: number;
  role: "user" | "bot";
  text: string;
  scanResult?: { verdict: string; score: number; signals: string[]; action: string };
  file?: string;
  suggestions?: string[];
}

const SCAN_MODES: { id: ScanMode; label: string; icon: React.ReactNode; placeholder: string; isFile?: boolean; accept?: string; desc: string }[] = [
  { id: "message", label: "Message", icon: <MessageCircle size={14} />, placeholder: "Paste a suspicious SMS, WhatsApp, or any message...", desc: "SMS, WhatsApp, email" },
  { id: "link",    label: "Link",    icon: <Link2 size={14} />,          placeholder: "Paste any suspicious URL or link...", desc: "URLs, websites" },
  { id: "upi",     label: "UPI",     icon: <CreditCard size={14} />,     placeholder: "e.g. name@ybl or name@paytm", desc: "UPI IDs, payment" },
  { id: "phone",   label: "Phone",   icon: <Phone size={14} />,          placeholder: "10-digit mobile number", desc: "Numbers, callers" },
  { id: "media",   label: "Image/Video", icon: <ImageIcon size={14} />, placeholder: "", isFile: true, accept: "image/*,video/*", desc: "Deepfake, screenshots" },
  { id: "voice",   label: "Voice",   icon: <Mic size={14} />,            placeholder: "", isFile: true, accept: "audio/*", desc: "AI voice clone detection" },
  { id: "qr",      label: "QR Code", icon: <QrCode size={14} />,        placeholder: "", isFile: true, accept: "image/*", desc: "QR code safety check" },
  { id: "aadhaar", label: "Aadhaar", icon: <FileText size={14} />,      placeholder: "Enter 12-digit Aadhaar number to validate format", desc: "Aadhaar validation" },
];

function verdictClass(v: string) {
  if (v === "SUSPICIOUS" || v === "HIGH") return "verdict-suspicious";
  if (v === "UNCLEAR" || v === "MEDIUM") return "verdict-unclear";
  return "verdict-low-risk";
}

function buildBotReply(mode: ScanMode, data: any, fileName?: string): { text: string; scanResult: ChatMsg["scanResult"]; suggestions: string[] } {
  const score = data.risk_score ?? data.score ?? data.threat_score ?? 0;
  const verdict = data.verdict ?? data.risk_level?.toUpperCase() ?? (score >= 70 ? "SUSPICIOUS" : score >= 40 ? "UNCLEAR" : "LOW_RISK");
  const signals: string[] = data.why_flagged || data.signals || data.red_flags || [];
  const action = data.action_eligibility || data.recommended_action || "";
  const explanation = data.explanation || data.analysis || "";

  const label = fileName ? `"${fileName}"` : "that";
  let text = "";

  if (verdict === "SUSPICIOUS" || verdict === "HIGH") {
    text = `⚠️ **This is HIGH RISK** (${score}/100 threat score).\n\n`;
    if (explanation) text += explanation + "\n\n";
    else if (signals.length) text += `Here's what raised the alarm:\n• ${signals.slice(0, 4).join("\n• ")}\n\n`;
    text += action ? `**What to do:** ${action.replace(/_/g, " ")}` : "**What to do:** Do not respond or share any personal details. Delete this immediately. If money is involved, call your bank now on their official helpline.";
  } else if (verdict === "UNCLEAR" || verdict === "MEDIUM") {
    text = `🔶 **Proceed with caution** (${score}/100 threat score).\n\n`;
    if (explanation) text += explanation + "\n\n";
    else text += "I found some suspicious patterns but can't be certain. ";
    text += "Verify through official channels before taking any action.";
  } else {
    text = `✅ **Looks safe** (${score}/100 threat score).\n\n`;
    if (explanation) text += explanation + "\n\n";
    else text += `I didn't find any known scam patterns in ${label}. `;
    text += "Still — stay alert. Scammers constantly change tactics.";
  }

  const suggestions =
    verdict === "SUSPICIOUS" || verdict === "HIGH"
      ? ["What should I do now?", "How do I report this?", "How do I get my money back?"]
      : verdict === "UNCLEAR" || verdict === "MEDIUM"
      ? ["How do I verify this is real?", "What are the red flags?", "Is this a known scam?"]
      : ["What scams should I watch for?", "Check another message", "How does Chetana work?"];

  return { text, scanResult: { verdict, score, signals, action }, suggestions };
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

export function ScanBox({ onRequireProof }: { onRequireProof?: () => void } = {}) {
  const [mode, setMode] = useState<ScanMode>("message");
  const [lang, setLang] = useState("en");
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([{
    id: 0, role: "bot",
    text: "Hi! I'm Chetana — India's AI scam checker. Paste any suspicious message, link, UPI ID, phone number, or upload a photo/voice clip. I'll check it and explain what I find.\n\nBuilt on ActiveMirror's MirrorDNA intelligence platform.",
    suggestions: ["Got a suspicious message", "Check a link", "Check a UPI ID", "Detect a deepfake"],
  }]);
  const [showModes, setShowModes] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const msgId = useRef(1);

  const activeMode = SCAN_MODES.find(m => m.id === mode)!;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const addMsg = (msg: Omit<ChatMsg, "id">) => {
    setMessages(prev => [...prev, { ...msg, id: msgId.current++ }]);
  };

  const handleSuggestion = (s: string) => {
    const lower = s.toLowerCase();
    if (lower.includes("message")) { setMode("message"); setInput(""); }
    else if (lower.includes("link")) { setMode("link"); setInput(""); }
    else if (lower.includes("upi")) { setMode("upi"); setInput(""); }
    else if (lower.includes("deepfake") || lower.includes("photo") || lower.includes("image")) { setMode("media"); }
    else if (lower.includes("voice")) { setMode("voice"); }
    else { sendChat(s); return; }
  };

  const sendChat = async (text: string) => {
    addMsg({ role: "user", text });
    setLoading(true);
    try {
      const resp = await fetch(`${API}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text }) });
      const data = resp.ok ? await resp.json() : null;
      addMsg({ role: "bot", text: data?.reply || "Ask me about any scam or suspicious activity — I'm here to help.", suggestions: data?.suggestions });
    } catch {
      addMsg({ role: "bot", text: "I couldn't reach the server right now. Try again in a moment." });
    } finally { setLoading(false); }
  };

  const handleSend = async () => {
    if (!localStorage.getItem("chetana_terms_accepted")) { if (onRequireProof) onRequireProof(); return; }

    const currentMode = activeMode;
    if (currentMode.isFile && !file) return;
    if (!currentMode.isFile && !input.trim()) return;

    const userText = currentMode.isFile ? `Check this ${currentMode.label.toLowerCase()}: ${file!.name}` : input.trim();
    addMsg({ role: "user", text: userText, file: file?.name });
    setInput(""); setFile(null); setLoading(true);

    // Detect if it's a question rather than a scan
    const isQuestion = !currentMode.isFile && /^(what|how|why|who|is |does|can|tell|explain|help|when|where|i already|what should)/i.test(input.trim()) && input.length < 120;
    if (isQuestion) { await sendChat(userText); setLoading(false); return; }

    try {
      let resp: Response;
      if (currentMode.id === "upi") {
        resp = await fetch(`${API}/api/upi/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upi_id: input.trim() }) });
      } else if (currentMode.id === "phone") {
        resp = await fetch(`${API}/api/phone/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: input.trim() }) });
      } else if (currentMode.id === "aadhaar") {
        resp = await fetch(`${API}/api/aadhaar/validate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aadhaar: input.trim() }) });
      } else if (currentMode.isFile && file) {
        const fd = new FormData(); fd.append("file", file);
        const endpoint = currentMode.id === "voice" ? "/api/voice/analyze" : currentMode.id === "qr" ? "/api/extract-text" : "/api/media/analyze";
        resp = await fetch(`${API}${endpoint}`, { method: "POST", body: fd });
      } else if (currentMode.id === "link") {
        resp = await fetch(`${API}/api/link/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: input.trim(), lang: "en" }) });
      } else {
        resp = await fetch(`${API}/api/scan/full`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: input.trim(), lang }) });
      }

      if (!resp.ok) throw new Error(`Server error (${resp.status})`);
      const data = await resp.json();
      const { text, scanResult, suggestions } = buildBotReply(currentMode.id, data, file?.name);
      addMsg({ role: "bot", text, scanResult, suggestions });
      if (scanResult) trackVigilance("scan", `${currentMode.id}: ${scanResult.verdict} (${scanResult.score}/100)`);
    } catch (e: any) {
      addMsg({ role: "bot", text: `I couldn't complete that check right now. ${e.message || "Please try again."}`, suggestions: ["Try again", "Check a different message"] });
    } finally { setLoading(false); }
  };

  return (
    <motion.section className="scan-panel scan-chat" {...fadeInDelay(0.25)}>
      {/* Mode selector + language picker */}
      <div className="scan-mode-bar">
        <div className="scan-modes">
          {SCAN_MODES.map(m => (
            <button key={m.id} className={`scan-mode-btn ${mode === m.id ? "active" : ""}`} onClick={() => { setMode(m.id); setFile(null); }} title={m.desc}>
              {m.icon} <span>{m.label}</span>
              {(m.id === "media" || m.id === "voice") && <span className="mode-badge">AI</span>}
            </button>
          ))}
        </div>
        <select className="lang-picker" value={lang} onChange={e => setLang(e.target.value)} title="Response language">
          {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label} {l.name}</option>)}
        </select>
      </div>
      {mode === "aadhaar" && (
        <div className="scan-mode-notice">
          <Lock size={11} /> Format validation only — Aadhaar numbers are never stored or transmitted beyond analysis.
        </div>
      )}

      {/* Chat messages */}
      <div className="scan-chat-messages" ref={scrollRef}>
        {messages.map(msg => (
          <div key={msg.id} className={`chat-bubble-row ${msg.role}`}>
            {msg.role === "bot" && (
              <div className="chat-avatar"><Shield size={14} /></div>
            )}
            <div className={`chat-bubble ${msg.role}`}>
              {msg.scanResult && (
                <div className="scan-verdict-row">
                  <div className={`scan-verdict-chip ${verdictClass(msg.scanResult.verdict)}`}>
                    {msg.scanResult.verdict === "SUSPICIOUS" || msg.scanResult.verdict === "HIGH"
                      ? <ShieldAlert size={14} /> : msg.scanResult.verdict === "UNCLEAR" || msg.scanResult.verdict === "MEDIUM"
                      ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
                    <span>{msg.scanResult.verdict.replace(/_/g, " ")}</span>
                    <span className="verdict-chip-score">{msg.scanResult.score}/100</span>
                  </div>
                  <button className="report-verdict-btn" title="Report an incorrect result" onClick={() => handleSuggestion("This result seems wrong — help me understand")}>
                    <Flag size={10} /> Wrong?
                  </button>
                </div>
              )}
              {msg.file && <div className="chat-file-badge"><Paperclip size={12} /> {msg.file}</div>}
              <div className="chat-bubble-text">{msg.text.split("\n").map((line, i) => {
                const bold = line.replace(/\*\*(.*?)\*\*/g, (_m, p) => `<strong>${p}</strong>`);
                return <p key={i} dangerouslySetInnerHTML={{ __html: bold }} />;
              })}</div>
              {msg.suggestions && (
                <div className="chat-suggestions">
                  {msg.suggestions.map((s, i) => (
                    <button key={i} className="chat-suggestion-btn" onClick={() => handleSuggestion(s)}>{s}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-bubble-row bot">
            <div className="chat-avatar"><Shield size={14} /></div>
            <div className="chat-bubble bot chat-thinking">
              <span /><span /><span />
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="scan-chat-input">
        {activeMode.isFile ? (
          <div className="scan-file-area" onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept={activeMode.accept} style={{ display: "none" }} onChange={e => setFile(e.target.files?.[0] || null)} />
            {file ? (
              <div className="scan-file-selected">
                <Paperclip size={16} />
                <span>{file.name}</span>
                <button onClick={e => { e.stopPropagation(); setFile(null); }}><X size={14} /></button>
              </div>
            ) : (
              <div className="scan-file-prompt">
                <Upload size={18} />
                <span>Tap to upload {activeMode.label.toLowerCase()}</span>
                <small>{activeMode.desc}</small>
              </div>
            )}
          </div>
        ) : (
          <textarea
            className="scan-chat-textarea"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={activeMode.placeholder}
            rows={2}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          />
        )}
        <button
          className="primary scan-send-btn"
          onClick={handleSend}
          disabled={loading || (activeMode.isFile ? !file : !input.trim())}
        >
          {loading ? <Zap size={18} /> : <Send size={18} />}
        </button>
      </div>

      <div className="scan-chat-footer">
        <Bot size={12} /> Powered by ActiveMirror · MirrorDNA Intelligence · Advisory only — not a government service · Verdicts are automated, not legal determinations
      </div>
    </motion.section>
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
        <motion.div className="kicker" {...fadeIn}><Shield size={14} /> For you & your family</motion.div>
        <motion.h2 {...fadeInDelay(0.05)}>Protect Yourself From Scams</motion.h2>
        <motion.p {...fadeInDelay(0.1)}>Check any suspicious message, link, or payment before you act. Free and instant.</motion.p>
      </div>
      <div className="feature-grid">
        {features.map((f, i) => (
          <motion.div key={f.title} className="feature-card" onClick={() => onNavigate(f.click)} {...fadeInDelay(i * 0.08)}>
            <div className={`feature-icon ${f.color}`}>{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </motion.div>
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
        <motion.div className="kicker" {...fadeIn}><Building2 size={14} /> For businesses & enterprises</motion.div>
        <motion.h2 {...fadeInDelay(0.05)}>Protect Your Business</motion.h2>
        <motion.p {...fadeInDelay(0.1)}>Fraud costs Indian businesses crores every year. Stop it before it starts.</motion.p>
      </div>
      <div className="feature-grid">
        {features.map((f, i) => (
          <motion.div key={f.title} className={`feature-card${f.highlight ? " enterprise-highlight" : ""}`} onClick={() => onNavigate(f.click)} {...fadeInDelay(i * 0.08)}>
            <div className={`feature-icon ${f.color}`}>{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </motion.div>
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
