import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import cytoscape from "cytoscape";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import {
  Shield, ShieldCheck, ShieldAlert, Search, Send, MessageCircle, X,
  Link2, Phone, CreditCard, AlertTriangle, CheckCircle, ChevronRight,
  Globe, Users, Building2, Zap, Eye, BookOpen, BarChart3
} from "lucide-react";
import { PageId, ThreatEntry, WeatherSignal, GraphNode, GraphEdge, ScanResult } from "./types";
import { ShieldAnim, FloatingCards, RadarAnim, CountUp, ScanAnim, GlobeAnim } from "./animations";
import { trackVigilance } from "./VigilancePage";

const API = import.meta.env.DEV ? "http://localhost:8093" : "";
const fadeIn = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35 } };

/* ── Nav ─────────────────────────────────────────────────────── */
export function Nav({ page, setPage }: { page: PageId; setPage: (p: PageId) => void }) {
  const items: { id: PageId; label: string }[] = [
    { id: "home", label: "Home" }, { id: "consumer", label: "Consumer" },
    { id: "merchant", label: "Merchant" }, { id: "nexus", label: "Nexus" },
    { id: "weather", label: "Scam Weather" }, { id: "atlas", label: "Scam Atlas" },
    { id: "trust", label: "Trust by Design\u2122" }, { id: "vigilance", label: "Vigilance" }, { id: "proof", label: "Terms" }, { id: "control", label: "Control Center" }
  ];
  return (
    <nav className="nav">
      <div className="brand" onClick={() => setPage("home")}>
        <div className="brand-glyph"><Shield size={20} /></div>
        <div><div className="brand-title">Chetana</div><div className="brand-sub">Trust infrastructure for India</div></div>
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
    {
      title: "Welcome to Chetana",
      subtitle: "India's trust layer against scams and fraud",
      options: null,
    },
    {
      title: "What brought you here?",
      subtitle: "We'll personalize your experience",
      options: [
        { id: "suspicious", icon: <AlertTriangle size={18} />, label: "I received something suspicious", color: "var(--danger-light)" },
        { id: "verify", icon: <Search size={18} />, label: "I want to verify something", color: "var(--amber-light)" },
        { id: "learn", icon: <BookOpen size={18} />, label: "I want to learn to stay safe", color: "var(--primary-light)" },
        { id: "business", icon: <Building2 size={18} />, label: "I'm protecting my business", color: "var(--saffron-light)" },
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
            {step === 0 ? "Get Started" : "Continue"} <ChevronRight size={16} style={{ marginLeft: 4 }} />
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
              <strong>₹1.2 lakh crore lost to digital fraud in India last year.</strong>
              <span>Every 3 seconds, someone falls for a scam. Don't be next.</span>
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

/* ── Hero ─────────────────────────────────────────────────────── */
export function Hero({ onNavigate }: { onNavigate: (target: "consumer" | "merchant" | "nexus") => void }) {
  return (
    <motion.section className="hero" {...fadeIn}>
      <div className="hero-copy">
        <div className="kicker"><Shield size={14} /> Before you trust, check</div>
        <h1>Protect yourself from scams in seconds.</h1>
        <p>Check any message, link, UPI ID, or phone number against live threat intelligence. Free. In your language.</p>
        <div className="hero-actions">
          <button className="primary" onClick={() => onNavigate("consumer")}><Search size={16} /> Check now</button>
          <button className="secondary" onClick={() => onNavigate("merchant")}><Building2 size={16} /> For business</button>
          <button className="ghost" onClick={() => onNavigate("nexus")}>Explore Nexus</button>
        </div>
        <div className="trust-strip">
          <span><Globe size={12} /> 12 languages (22 planned)</span>
          <span><Eye size={12} /> Privacy-conscious</span>
          <span><ShieldCheck size={12} /> Trusted by design</span>
        </div>
      </div>
      <div className="hero-visual">
        <div className="glass-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, minHeight: 400 }}>
          <div className="graph-orb" />
          <FloatingCards size={320} />
          <div style={{ width: "100%", borderTop: "1px solid var(--line)", paddingTop: 16 }}>
            <div className="glass-header">Live Stats</div>
            <div style={{ display: "flex", gap: 24, justifyContent: "center" }}>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 28, fontWeight: 800, color: "var(--heading)" }}><CountUp end={50} suffix="+" /></div><div style={{ fontSize: 11, color: "var(--muted)" }}>Scans today</div></div>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 28, fontWeight: 800, color: "var(--safe)" }}><CountUp end={136} suffix="" /></div><div style={{ fontSize: 11, color: "var(--muted)" }}>Threats blocked</div></div>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 28, fontWeight: 800, color: "var(--primary)" }}><CountUp end={12} suffix="" /></div><div style={{ fontSize: 11, color: "var(--muted)" }}>Languages live</div></div>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

/* ── Scan Box ────────────────────────────────────────────────── */
type ScanTab = "text" | "link" | "upi" | "phone";

export function ScanBox({ onRequireProof }: { onRequireProof?: () => void } = {}) {
  const [tab, setTab] = useState<ScanTab>("text");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");

  const tabs: { id: ScanTab; label: string; icon: React.ReactNode; placeholder: string }[] = [
    { id: "text", label: "Message", icon: <MessageCircle size={14} />, placeholder: "Paste suspicious message..." },
    { id: "link", label: "Link", icon: <Link2 size={14} />, placeholder: "Paste URL to check..." },
    { id: "upi", label: "UPI ID", icon: <CreditCard size={14} />, placeholder: "e.g. name@ybl" },
    { id: "phone", label: "Phone", icon: <Phone size={14} />, placeholder: "10-digit number" },
  ];

  const handleScan = async () => {
    if (!content.trim()) return;
    // Gate: require Proof-of-Memory before first scan
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
    <motion.section className="panel scan-panel" {...fadeIn}>
      <div className="panel-header">
        <h2><Search size={20} style={{ verticalAlign: "middle", marginRight: 8 }} />Check something suspicious</h2>
        <p>Paste it below. We'll check it against live threat intelligence.</p>
      </div>
      <div className="scan-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`scan-tab ${tab === t.id ? "active" : ""}`} onClick={() => { setTab(t.id); setResult(null); setError(""); }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <div className="scan-input-row">
        <textarea className="scan-textarea" value={content} onChange={e => setContent(e.target.value)} placeholder={activeTab.placeholder} rows={tab === "text" ? 3 : 1} />
        <button className="primary scan-btn" onClick={handleScan} disabled={loading || !content.trim()}>
          {loading ? <><Zap size={16} /> Checking...</> : <><Search size={16} /> Check</>}
        </button>
      </div>
      {error && <div className="scan-error"><AlertTriangle size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />{error}</div>}
      <AnimatePresence>
        {result && (
          <motion.div className="scan-result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className={`scan-verdict ${verdictClass(result.verdict)}`}>
              <div className="verdict-header">
                <span className="verdict-label"><VerdictIcon v={result.verdict} /> {result.verdict.replace(/_/g, " ")}</span>
                <span className="verdict-score">Score: {result.risk_score}/100</span>
              </div>
              {result.action_eligibility && <div className="verdict-action">Recommended: {result.action_eligibility.replace(/_/g, " ")}</div>}
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

/* ── Weather ──────────────────────────────────────────────────── */
export function WeatherBoard({ signals }: { signals: WeatherSignal[] }) {
  return (
    <motion.section className="panel" {...fadeIn}>
      <div className="panel-header"><h2><BarChart3 size={20} style={{ verticalAlign: "middle", marginRight: 8 }} />Scam Weather</h2><p>Live pressure signals across Indian digital trust.</p></div>
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
        <div><h2><BookOpen size={20} style={{ verticalAlign: "middle", marginRight: 8 }} />Scam Atlas</h2><p>A living threat wiki. Know the red flags. Know what to do.</p></div>
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
              <div><strong>Red flags</strong><ul>{t.redFlags.map(r => <li key={r}>{r}</li>)}</ul></div>
              <div><strong>What to do</strong><ul>{t.actions.map(a => <li key={a}>{a}</li>)}</ul></div>
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
            if (k === "core") return "#2563EB";
            if (k === "campaign") return "#DC2626";
            if (k === "enterprise") return "#7C3AED";
            if (k === "surface") return "#F59E0B";
            return "#6B7280";
          },
          label: "data(label)", color: "#d8e2f0", "font-size": 11 as any, "text-wrap": "wrap", "text-max-width": 90 as any, width: 34, height: 34,
          "border-width": 1, "border-color": "#0b1220"
        }},
        { selector: "edge", style: { width: 2, "line-color": "#3b4d6a", "target-arrow-color": "#3b4d6a", "target-arrow-shape": "triangle", "curve-style": "bezier", label: "data(label)", color: "#91a1b7", "font-size": 9 }},
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
    const term = new Terminal({ theme: { background: "#08111d", foreground: "#cde3ff", cursor: "#7ee7d9" }, fontSize: 12, rows: 18 });
    const fit = new FitAddon();
    term.loadAddon(fit); term.open(mountRef.current); fit.fit();
    term.writeln("chetana-control-shell v1");
    term.writeln("────────────────────────────────");
    let i = 0;
    const iv = setInterval(() => {
      if (i >= lines.length) { term.writeln("> system stable."); clearInterval(iv); return; }
      term.writeln(`> ${lines[i]}`); i++;
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
    ["Evidence Ladder", "Every verdict is backed by layered evidence — not guesswork.", <Eye size={20} />],
    ["Action Eligibility", "We tell you what to do, not just what's wrong.", <CheckCircle size={20} />],
    ["Privacy Conscious", "Your data is transmitted securely and never sold or shared. Used only for analysis.", <Shield size={20} />],
    ["Human Boundary", "Some decisions stay advisory. We don't override your judgment.", <Users size={20} />]
  ];
  return (
    <motion.section className="panel" {...fadeIn}>
      <div className="panel-header"><h2><ShieldCheck size={20} style={{ verticalAlign: "middle", marginRight: 8 }} />Trust by Design&#8482;</h2><p>Nothing changes without evidence, bounds, and trace.</p></div>
      <div className="trust-grid">{items.map(([title, copy, icon]) => <div className="trust-card" key={title}><div style={{ color: "var(--primary)", marginBottom: 8 }}>{icon}</div><h3>{title}</h3><p>{copy}</p></div>)}</div>
      <a href="https://activemirror.ai/proof/" target="_blank" rel="noopener" className="proof-banner">
        <div className="proof-banner-icon"><ShieldCheck size={20} /></div>
        <div className="proof-banner-text">
          <strong>Proof-of-Memory Protocol</strong>
          <span>Cryptographic attestation that users read and understood — not just clicked through. See how we enforce consent.</span>
        </div>
        <ChevronRight size={18} className="proof-banner-arrow" />
      </a>
    </motion.section>
  );
}

/* ── Onboarding cards ────────────────────────────────────────── */
export function Onboarding({ onNavigate }: { onNavigate: (target: "consumer" | "merchant" | "nexus") => void }) {
  return (
    <motion.section className="panel" {...fadeIn}>
      <div className="panel-header"><h2>Who are you protecting?</h2><p>One system, three surfaces.</p></div>
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

/* ── Footer ──────────────────────────────────────────────────── */
export function Footer({ onNavigate }: { onNavigate: (p: PageId) => void }) {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <div className="footer-logo">
            <div className="brand-glyph" style={{ width: 36, height: 36, fontSize: 16 }}><Shield size={16} /></div>
            <div>
              <div className="brand-title" style={{ fontSize: 17 }}>Chetana</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>Trust infrastructure for India</div>
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
            <button onClick={() => onNavigate("control")}>Control Center</button>
          </div>
          <div className="footer-col">
            <h4>Intelligence</h4>
            <button onClick={() => onNavigate("weather")}>Scam Weather</button>
            <button onClick={() => onNavigate("atlas")}>Scam Atlas</button>
            <button onClick={() => onNavigate("trust")}>Trust by Design&#8482;</button>
          </div>
          <div className="footer-col">
            <h4>Legal</h4>
            <button onClick={() => onNavigate("proof")}>Terms & Disclaimer</button>
            <span className="footer-static">Cybercrime: 1930</span>
            <span className="footer-static">Women: 181</span>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="footer-powered">
            <span>Powered by</span>
            <a href="https://activemirror.ai" target="_blank" rel="noopener" className="powered-brand">ActiveMirror</a>
            <span className="powered-sep">|</span>
            <span className="powered-brand">MirrorDNA</span>
            <span className="powered-sep">|</span>
            <a href="https://activemirror.ai/proof/" target="_blank" rel="noopener" className="powered-link">Proof-of-Memory Protocol</a>
          </div>
          <div className="footer-copy">&copy; {new Date().getFullYear()} ActiveMirror (N1 Intelligence). All rights reserved.</div>
        </div>
      </div>
    </footer>
  );
}

/* ── Chat Assistant (Draggable Floating Pill) ────────────────── */
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
    { role: "bot", text: "Hi! I'm Chetana. I can help you check suspicious messages, explain scam types, or guide you to the right tool. What do you need?", suggestions: ["How do I check a message?", "What scams are trending?", "How to report fraud?", "Tell me about Chetana"] }
  ]);

  useEffect(() => { const t = setTimeout(() => setTeaser(true), 4000); return () => clearTimeout(t); }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  // Drag handlers
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, input, .chat-messages")) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPos({ x: dragStart.current.px + dx, y: dragStart.current.py + dy });
  };
  const onPointerUp = () => setDragging(false);

  const send = async (text: string) => {
    if (!text.trim()) return;
    setTeaser(false);
    setMinimized(false);
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

  // Closed state: floating pill
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
          <MessageCircle size={26} />
          <div className="chat-fab-dot" />
        </button>
      </>
    );
  }

  // Minimized state: floating pill with last message preview
  if (minimized) {
    const lastBot = [...messages].reverse().find(m => m.role === "bot");
    return (
      <motion.div
        className="chat-pill"
        ref={dragRef}
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, cursor: dragging ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
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

  // Full panel: draggable
  return (
    <motion.div
      className="chat-panel"
      ref={dragRef}
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, cursor: dragging ? "grabbing" : "default" }}
      initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <div className="chat-header" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} style={{ cursor: dragging ? "grabbing" : "grab" }}>
        <div className="chat-header-left">
          <div className="chat-header-glyph"><Shield size={20} /></div>
          <div><div className="chat-header-title">Chetana Assistant</div><div className="chat-header-sub">Drag to move &middot; Always here</div></div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="chat-close" onClick={() => setMinimized(true)} title="Minimize to pill"><span style={{ fontSize: 16, lineHeight: 1 }}>&ndash;</span></button>
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
        <input className="chat-input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send(input)} placeholder="Ask anything..." />
        <button className="chat-send" onClick={() => send(input)} disabled={!input.trim() || loading}><Send size={16} /></button>
      </div>
      <div className="chat-footer-brand">Powered by <strong>ActiveMirror</strong></div>
    </motion.div>
  );
}
