import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle,
  Copy,
  Download,
  PhoneCall,
  Search,
  Shield,
  ShieldCheck,
  Users,
} from "lucide-react";

interface VigilanceBlock {
  id: string;
  type: "scan" | "learn" | "weather" | "visit" | "terms" | "share";
  label: string;
  timestamp: string;
  hash: string;
  prevHash: string;
}

interface VigilanceChain {
  blocks: VigilanceBlock[];
  score: number;
  level: string;
  started: string;
}

const STORAGE_KEY = "chetana_vigilance";

function getChain(): VigilanceChain {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { blocks: [], score: 0, level: "New", started: new Date().toISOString() };
}

function calcLevel(score: number): string {
  if (score >= 80) return "Guardian";
  if (score >= 60) return "Family helper";
  if (score >= 40) return "Careful";
  if (score >= 20) return "Getting sharper";
  return "New";
}

function calcScore(blocks: VigilanceBlock[]): number {
  const weights: Record<string, number> = { scan: 10, learn: 6, weather: 4, visit: 2, terms: 8, share: 5 };
  return Math.min(100, blocks.reduce((sum, block) => sum + (weights[block.type] || 1), 0));
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function trackVigilance(type: VigilanceBlock["type"], label: string) {
  const chain = getChain();
  const prevHash = chain.blocks.length > 0 ? chain.blocks[chain.blocks.length - 1].hash : "0";
  const timestamp = new Date().toISOString();
  const hash = await sha256(`${prevHash}|${type}|${label}|${timestamp}`);
  const block: VigilanceBlock = { id: `v-${Date.now()}`, type, label, timestamp, hash, prevHash };
  chain.blocks.push(block);
  chain.score = calcScore(chain.blocks);
  chain.level = calcLevel(chain.score);
  if (!chain.started) chain.started = timestamp;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chain));
}

const TYPE_LABELS: Record<VigilanceBlock["type"], string> = {
  scan: "Checked something suspicious",
  learn: "Read a scam pattern",
  weather: "Looked at Scam Weather",
  visit: "Explored Chetana",
  terms: "Accepted setup rules",
  share: "Shared a warning",
};

export default function VigilancePage() {
  const [chain, setChain] = useState<VigilanceChain>(getChain);
  const [receipt, setReceipt] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    trackVigilance("visit", "Opened Build Scam Sense page");
    const intervalId = window.setInterval(() => setChain(getChain()), 2000);
    return () => window.clearInterval(intervalId);
  }, []);

  const saveReceipt = useCallback(async () => {
    const summary = {
      protocol: "chetana-progress-receipt.v1",
      created_at: new Date().toISOString(),
      level: chain.level,
      score: chain.score,
      total_actions: chain.blocks.length,
      recent_actions: chain.blocks.slice(-6).reverse().map((block) => ({
        type: block.type,
        label: block.label,
        timestamp: block.timestamp,
      })),
      reminder: "Chetana helps you pause and verify. Official recovery rails still matter.",
    };
    setReceipt(summary);
    localStorage.setItem("chetana_vigilance_proof", JSON.stringify(summary));
  }, [chain]);

  const copyReceipt = () => {
    if (!receipt) return;
    navigator.clipboard.writeText(JSON.stringify(receipt, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const downloadReceipt = () => {
    if (!receipt) return;
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chetana-progress-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const progressColor = chain.score >= 60 ? "#22c55e" : chain.score >= 30 ? "#f59e0b" : "#60a5fa";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ maxWidth: 860, margin: "0 auto" }}>
      <section className="page-intro" style={{ textAlign: "center", paddingBottom: 20 }}>
        <div className="kicker" style={{ justifyContent: "center" }}>
          <Shield size={14} />
          Practice
        </div>
        <h1 style={{ fontSize: "clamp(30px, 4vw, 44px)" }}>Build scam sense, one habit at a time.</h1>
        <p style={{ maxWidth: "58ch", margin: "0 auto" }}>
          This page tracks simple safety habits: checking suspicious messages, reading scam patterns, watching live fraud pressure,
          and sharing warnings before someone acts under panic.
        </p>
      </section>

      <div className="panel" style={{ overflow: "hidden", position: "relative", marginBottom: 18 }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at top, ${progressColor}18, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ position: "relative", display: "grid", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>
                Your progress
              </div>
              <div style={{ fontSize: 56, fontWeight: 900, color: progressColor, lineHeight: 1 }}>{chain.score}</div>
              <div style={{ fontSize: 16, color: "rgba(255,255,255,0.86)", fontWeight: 700 }}>{chain.level}</div>
            </div>
            <div style={{ minWidth: 260, display: "grid", gap: 8 }}>
              <strong style={{ color: "var(--heading)" }}>What this means</strong>
              <span style={{ color: "var(--muted)", lineHeight: 1.6 }}>
                The more you check before you click, the sharper your judgment gets. This is not a score for vanity. It is a reminder to build better habits.
              </span>
              <span style={{ color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
                Hindi quick line: <strong>जल्दी मत करो. पहले जांच करो.</strong>
              </span>
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ width: "100%", height: 12, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
              <div style={{ width: `${chain.score}%`, height: "100%", background: progressColor, transition: "width 0.4s ease" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              <span>New</span>
              <span>Getting sharper</span>
              <span>Careful</span>
              <span>Family helper</span>
              <span>Guardian</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        {[
          { icon: <Search size={18} />, title: "Check first", copy: "Paste a suspicious message before you click, pay, or reply." },
          { icon: <BookOpen size={18} />, title: "Learn the pattern", copy: "Bank/KYC, digital arrest, parcel refund, task scam, fake payment proof." },
          { icon: <BarChart3 size={18} />, title: "Watch the pressure", copy: "Scam Weather shows what is rising before it reaches your family or your shop." },
          { icon: <Users size={18} />, title: "Pull in family", copy: "When you are unsure, ask one trusted person before sending money." },
        ].map((item) => (
          <div key={item.title} className="panel" style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--primary-bright)", fontWeight: 700 }}>
              {item.icon}
              {item.title}
            </div>
            <p style={{ margin: 0, lineHeight: 1.65, color: "var(--muted)" }}>{item.copy}</p>
          </div>
        ))}
      </div>

      <div className="panel" style={{ marginTop: 18, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <strong style={{ display: "block", color: "var(--heading)" }}>Recent habit history</strong>
            <span style={{ color: "var(--muted)", fontSize: 14 }}>The last few things you did on Chetana.</span>
          </div>
          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{chain.blocks.length} total actions</span>
        </div>

        {chain.blocks.length === 0 ? (
          <div style={{ display: "grid", gap: 8, placeItems: "center", padding: "30px 20px", color: "var(--muted)", textAlign: "center" }}>
            <ShieldCheck size={28} style={{ opacity: 0.45 }} />
            <strong style={{ color: "var(--heading)" }}>Nothing yet</strong>
            <span>Start with a suspicious message, Scam Weather, or the common scams page.</span>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {chain.blocks.slice(-8).reverse().map((block) => (
              <div
                key={block.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.03)",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "grid", gap: 2 }}>
                  <strong style={{ color: "rgba(255,255,255,0.9)" }}>{TYPE_LABELS[block.type]}</strong>
                  <span style={{ color: "var(--muted)", lineHeight: 1.5 }}>{block.label}</span>
                </div>
                <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>
                  {new Date(block.timestamp).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        className="panel"
        style={{
          marginTop: 18,
          background: "rgba(239,68,68,0.08)",
          borderColor: "rgba(239,68,68,0.18)",
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700, color: "#fecaca" }}>
          <AlertTriangle size={18} />
          Recovery script
        </div>
        <div style={{ display: "grid", gap: 8, color: "rgba(255,255,255,0.85)", lineHeight: 1.6 }}>
          <span>1. "I think I have been targeted by fraud. Please help me stop further loss."</span>
          <span>2. Call <strong>1930</strong> and then call your bank using a number you already trust.</span>
          <span>3. Keep the proof: screenshots, UTR, chat, phone number, link, voice note.</span>
          <span style={{ color: "#fecaca" }}>Hindi quick line: <strong>पैसे गए हैं? अभी 1930 पर कॉल करो.</strong></span>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18, display: "grid", gap: 14 }}>
        <div>
          <strong style={{ display: "block", color: "var(--heading)", marginBottom: 4 }}>Save your progress receipt</strong>
          <span style={{ color: "var(--muted)", lineHeight: 1.6 }}>
            If you want, you can save a simple JSON receipt of your Chetana activity. This is optional and just for your own records.
          </span>
        </div>

        {!receipt ? (
          <button
            className="primary"
            onClick={saveReceipt}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 20px", fontSize: 15 }}
          >
            <CheckCircle size={18} />
            Save progress receipt
          </button>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--safe)", fontWeight: 700 }}>
              <ShieldCheck size={18} />
              Progress receipt saved
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="ghost" onClick={copyReceipt} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Copy size={14} />
                {copied ? "Copied" : "Copy"}
              </button>
              <button className="ghost" onClick={downloadReceipt} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Download size={14} />
                Download
              </button>
              <button className="ghost" onClick={() => window.open("tel:1930")} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <PhoneCall size={14} />
                Call 1930
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ height: 40 }} />
    </motion.div>
  );
}
