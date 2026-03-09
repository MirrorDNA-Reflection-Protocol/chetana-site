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
  TrendingUp, FileWarning, UserCheck, Layers
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
  return (
    <nav className="nav">
      <div className="brand" onClick={() => setPage("home")}>
        <div className="brand-glyph"><Shield size={18} /></div>
        <div>
          <div className="brand-title">Chetana</div>
          <div className="brand-sub">India's free scam checker</div>
        </div>
      </div>
      <div className="nav-links">
        {items.map((item) => (
          <button key={item.id} className={page === item.id ? "nav-btn active" : "nav-btn"} onClick={() => setPage(item.id)}>{item.label}</button>
        ))}
      </div>
      <div className="india-badge">Made in India</div>
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

/* ── Alert Banner ─────────────────────────────────────────────── */
export function AlertBanner({ onNavigate }: { onNavigate: (target: PageId) => void }) {
  return (
    <motion.div className="alert-banner" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
      <div className="alert-banner-inner">
        <div className="alert-banner-pulse" />
        <div className="alert-banner-content">
          <div className="alert-banner-left">
            <ShieldAlert size={22} />
            <div>
              <strong>Indians lose over Rs 1.2 lakh crore to scams every year.</strong>
              <span>Someone gets scammed every 3 seconds. Don't be next.</span>
            </div>
          </div>
          <button className="alert-banner-cta" onClick={() => onNavigate("consumer")}>
            Check now <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </motion.div>
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

/* ── Scan Box (the star of the show) ─────────────────────────── */
type ScanTab = "text" | "link" | "upi" | "phone";

export function ScanBox({ onRequireProof }: { onRequireProof?: () => void } = {}) {
  const [tab, setTab] = useState<ScanTab>("text");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");

  const tabs: { id: ScanTab; label: string; icon: React.ReactNode; placeholder: string }[] = [
    { id: "text", label: "Message", icon: <MessageCircle size={14} />, placeholder: "Paste a suspicious message, SMS, or WhatsApp forward..." },
    { id: "link", label: "Link", icon: <Link2 size={14} />, placeholder: "Paste any URL to check..." },
    { id: "upi", label: "UPI ID", icon: <CreditCard size={14} />, placeholder: "e.g. name@ybl or name@paytm" },
    { id: "phone", label: "Phone", icon: <Phone size={14} />, placeholder: "10-digit phone number" },
  ];

  const handleScan = async () => {
    if (!content.trim()) return;
    if (!localStorage.getItem("chetana_terms_accepted")) {
      if (onRequireProof) onRequireProof();
      return;
    }
    setLoading(true); setResult(null); setError("");
    try {
      let resp: Response;
      if (tab === "upi") {
        resp = await fetch(`${API}/api/upi/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upi_id: content.trim() }) });
      } else if (tab === "phone") {
        resp = await fetch(`${API}/api/phone/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: content.trim() }) });
      } else {
        resp = await fetch(`${API}/api/scan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input_type: tab, content: content.trim() }) });
      }
      if (!resp.ok) throw new Error(`Server error (${resp.status})`);
      const data = await resp.json();
      const score = data.risk_score ?? data.score ?? data.threat_score ?? 0;
      const verdict = data.verdict ?? (score >= 70 ? "SUSPICIOUS" : score >= 40 ? "UNCLEAR" : "LOW_RISK");
      setResult({ verdict, risk_score: score, surface: data.surface || tab, why_flagged: data.why_flagged || data.signals || [], action_eligibility: data.action_eligibility || "" });
      trackVigilance("scan", `${tab} check: ${verdict} (${score}/100)`);
    } catch (e: any) {
      setError(e.message || "Check failed. Try again.");
    } finally { setLoading(false); }
  };

  const verdictClass = (v: string) => {
    if (v === "SUSPICIOUS") return "verdict-suspicious";
    if (v === "UNCLEAR") return "verdict-unclear";
    if (v === "LOW_RISK") return "verdict-low-risk";
    return "verdict-default";
  };
  const VerdictIcon = ({ v }: { v: string }) => {
    if (v === "SUSPICIOUS") return <ShieldAlert size={20} color="var(--danger)" />;
    if (v === "UNCLEAR") return <AlertTriangle size={20} color="var(--amber)" />;
    if (v === "LOW_RISK") return <ShieldCheck size={20} color="var(--safe)" />;
    return <Shield size={20} />;
  };

  const activeTab = tabs.find(t => t.id === tab)!;

  return (
    <motion.section className="scan-panel" {...fadeInDelay(0.25)}>
      <div className="scan-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`scan-tab ${tab === t.id ? "active" : ""}`} onClick={() => { setTab(t.id); setResult(null); setError(""); }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <div className="scan-input-row">
        <textarea className="scan-textarea" value={content} onChange={e => setContent(e.target.value)} placeholder={activeTab.placeholder} rows={tab === "text" ? 3 : 1} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleScan(); } }} />
        <button className="primary scan-btn" onClick={handleScan} disabled={loading || !content.trim()}>
          {loading ? <><Zap size={16} /> Scanning...</> : <><Search size={16} /> Scan</>}
        </button>
      </div>
      {error && <div className="scan-error"><AlertTriangle size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />{error}</div>}
      <AnimatePresence>
        {result && (
          <motion.div className="scan-result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className={`scan-verdict ${verdictClass(result.verdict)}`}>
              <div className="verdict-header">
                <span className="verdict-label"><VerdictIcon v={result.verdict} /> {result.verdict.replace(/_/g, " ")}</span>
                <span className="verdict-score">Threat score: {result.risk_score}/100</span>
              </div>
              {result.action_eligibility && <div className="verdict-action">Recommended action: {result.action_eligibility.replace(/_/g, " ")}</div>}
            </div>
            {result.why_flagged.length > 0 && (
              <div className="scan-signals">
                <strong>Signals detected</strong>
                <ul>{result.why_flagged.map((s, i) => <li key={i}>{typeof s === "string" ? s : JSON.stringify(s)}</li>)}</ul>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
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
      </div>
    </footer>
  );
}

/* ── Chat Assistant (Draggable Floating) ─────────────────────── */
interface ChatMsg { role: "user" | "bot"; text: string; articles?: { id: string; title: string }[]; suggestions?: string[]; }

export function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "bot", text: "Hi! I'm Chetana. Got a suspicious message or call? Paste it here and I'll check it. You can also ask me anything about scams in India.", suggestions: ["Someone sent me a collect request", "Is this link safe?", "I already sent money to a scammer", "What is Chetana?"] }
  ]);

  useEffect(() => { const t = setTimeout(() => setTeaser(true), 5000); return () => clearTimeout(t); }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, input, .chat-messages")) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setPos({ x: dragStart.current.px + e.clientX - dragStart.current.x, y: dragStart.current.py + e.clientY - dragStart.current.y });
  };
  const onPointerUp = () => setDragging(false);

  const send = async (text: string) => {
    if (!text.trim()) return;
    setTeaser(false); setMinimized(false);
    const userMsg: ChatMsg = { role: "user", text: text.trim() };
    setMessages(m => [...m, userMsg]);
    setInput(""); setLoading(true);
    try {
      const resp = await fetch(`${API}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text.trim() }) });
      if (!resp.ok) throw new Error();
      const data = await resp.json();
      setMessages(m => [...m, { role: "bot", text: data.reply, articles: data.articles, suggestions: data.suggestions }]);
    } catch {
      setMessages(m => [...m, { role: "bot", text: "Sorry, I couldn't reach the server. Please try again." }]);
    } finally { setLoading(false); }
  };

  if (!open) {
    return (
      <>
        <AnimatePresence>
          {teaser && (
            <motion.div className="chat-teaser" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} onClick={() => { setOpen(true); setTeaser(false); }} style={{ cursor: "pointer" }}>
              <p>Need help checking something?</p>
              <small>Ask me about any suspicious message or call</small>
            </motion.div>
          )}
        </AnimatePresence>
        <button className="chat-fab" onClick={() => { setOpen(true); setTeaser(false); }}>
          <div className="chat-fab-pulse" />
          <MessageCircle size={24} />
          <div className="chat-fab-dot" />
        </button>
      </>
    );
  }

  if (minimized) {
    const lastBot = [...messages].reverse().find(m => m.role === "bot");
    return (
      <motion.div className="chat-pill" ref={dragRef} style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, cursor: dragging ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}>
        <div className="chat-pill-glyph"><Shield size={16} /></div>
        <div className="chat-pill-preview" onClick={() => setMinimized(false)}>
          <span className="chat-pill-name">Chetana</span>
          {lastBot && <span className="chat-pill-text">{lastBot.text.slice(0, 50)}{lastBot.text.length > 50 ? "..." : ""}</span>}
        </div>
        <button className="chat-pill-expand" onClick={() => setMinimized(false)}><ChevronRight size={14} /></button>
        <button className="chat-pill-close" onClick={() => { setOpen(false); setMinimized(false); setPos({ x: 0, y: 0 }); }}><X size={14} /></button>
      </motion.div>
    );
  }

  return (
    <motion.div className="chat-panel" ref={dragRef} style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, cursor: dragging ? "grabbing" : "default" }}
      initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 25 }}>
      <div className="chat-header" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} style={{ cursor: dragging ? "grabbing" : "grab" }}>
        <div className="chat-header-left">
          <div className="chat-header-glyph"><Shield size={20} /></div>
          <div><div className="chat-header-title">Chetana</div><div className="chat-header-sub">Drag to move</div></div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="chat-close" onClick={() => setMinimized(true)} title="Minimize"><span style={{ fontSize: 16, lineHeight: 1 }}>&ndash;</span></button>
          <button className="chat-close" onClick={() => { setOpen(false); setPos({ x: 0, y: 0 }); }}><X size={18} /></button>
        </div>
      </div>
      <div className="chat-messages" ref={scrollRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.role}`}>
            <div className="chat-msg-text">{msg.text}</div>
            {msg.articles && msg.articles.length > 0 && (
              <div className="chat-articles">
                {msg.articles.map(a => (
                  <div key={a.id} className="chat-article-card">
                    <div className="chat-article-title"><BookOpen size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />{a.title}</div>
                  </div>
                ))}
              </div>
            )}
            {msg.suggestions && msg.suggestions.length > 0 && (
              <div className="chat-chips">
                {msg.suggestions.map(s => <button key={s} className="chat-chip" onClick={() => send(s)}>{s}</button>)}
              </div>
            )}
          </div>
        ))}
        {loading && <div className="chat-msg bot"><div className="chat-msg-text chat-typing">Thinking...</div></div>}
      </div>
      <div className="chat-input-row">
        <input className="chat-input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send(input)} placeholder="Ask anything or paste suspicious content..." />
        <button className="chat-send" onClick={() => send(input)} disabled={!input.trim() || loading}><Send size={16} /></button>
      </div>
      <div className="chat-footer-brand">Powered by <strong>ActiveMirror</strong></div>
    </motion.div>
  );
}
