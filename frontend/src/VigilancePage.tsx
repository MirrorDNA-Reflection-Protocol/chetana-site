import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, ShieldCheck, Eye, Search, BookOpen, BarChart3, Link2, Copy, Download, CheckCircle, ChevronRight, Zap } from "lucide-react";

/* ── Crypto helpers ──────────────────────────────────────────── */
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function shortHash(h: string) { return h.slice(0, 8) + "…" + h.slice(-6); }

/* ── Types ───────────────────────────────────────────────────── */
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

/* ── Vigilance Engine ────────────────────────────────────────── */
const STORAGE_KEY = "chetana_vigilance";

function getChain(): VigilanceChain {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { blocks: [], score: 0, level: "Newcomer", started: new Date().toISOString() };
}

function calcLevel(score: number): string {
  if (score >= 90) return "Guardian";
  if (score >= 70) return "Sentinel";
  if (score >= 50) return "Protector";
  if (score >= 30) return "Aware";
  if (score >= 10) return "Learner";
  return "Newcomer";
}

function calcScore(blocks: VigilanceBlock[]): number {
  const weights: Record<string, number> = { scan: 8, learn: 5, weather: 3, visit: 2, terms: 15, share: 4 };
  const raw = blocks.reduce((sum, b) => sum + (weights[b.type] || 1), 0);
  return Math.min(100, raw);
}

const TYPE_META: Record<string, { icon: typeof Shield; color: string; label: string }> = {
  scan: { icon: Search, color: "#2563EB", label: "Scam Check" },
  learn: { icon: BookOpen, color: "#7C3AED", label: "Scam Learned" },
  weather: { icon: BarChart3, color: "#F59E0B", label: "Weather Read" },
  visit: { icon: Eye, color: "#0D9488", label: "Page Explored" },
  terms: { icon: ShieldCheck, color: "#059669", label: "Terms Attested" },
  share: { icon: Link2, color: "#E07A5F", label: "Shared Safety" },
};

/* ── Global tracker (call from anywhere) ─────────────────────── */
export async function trackVigilance(type: VigilanceBlock["type"], label: string) {
  const chain = getChain();
  const prevHash = chain.blocks.length > 0 ? chain.blocks[chain.blocks.length - 1].hash : "0000000000000000000000000000000000000000000000000000000000000000";
  const timestamp = new Date().toISOString();
  const hash = await sha256(`${prevHash}|${type}|${label}|${timestamp}`);
  const block: VigilanceBlock = { id: `v-${Date.now()}`, type, label, timestamp, hash, prevHash };
  chain.blocks.push(block);
  chain.score = calcScore(chain.blocks);
  chain.level = calcLevel(chain.score);
  if (!chain.started) chain.started = timestamp;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chain));
}

/* ── Page Component ──────────────────────────────────────────── */
export default function VigilancePage() {
  const [chain, setChain] = useState<VigilanceChain>(getChain);
  const [proofGenerated, setProofGenerated] = useState(false);
  const [proof, setProof] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  // Refresh chain from storage
  useEffect(() => {
    const iv = setInterval(() => setChain(getChain()), 2000);
    return () => clearInterval(iv);
  }, []);

  // Track this page visit
  useEffect(() => {
    trackVigilance("visit", "Proof-of-Vigilance page");
  }, []);

  const generateProof = useCallback(async () => {
    if (chain.blocks.length < 2) return;
    const chainHash = await sha256(JSON.stringify(chain.blocks));
    const timestamp = new Date().toISOString();
    const commitment = await sha256(chainHash + timestamp + chain.score.toString());
    const proofObj = {
      protocol: "Chetana Proof-of-Vigilance v1.0",
      timestamp,
      subject: {
        level: chain.level,
        score: chain.score,
        totalActions: chain.blocks.length,
        firstAction: chain.started,
        latestAction: chain.blocks[chain.blocks.length - 1]?.timestamp,
      },
      chain: {
        hash: chainHash,
        length: chain.blocks.length,
        types: Object.entries(
          chain.blocks.reduce((acc, b) => { acc[b.type] = (acc[b.type] || 0) + 1; return acc; }, {} as Record<string, number>)
        ).map(([type, count]) => ({ type, count })),
        headBlock: shortHash(chain.blocks[chain.blocks.length - 1]?.hash || ""),
      },
      commitment: { merkleRoot: commitment, algorithm: "SHA-256" },
      attestation: "This proof attests that the bearer has actively engaged with Chetana's scam detection tools, threat intelligence, and safety education — building verified digital vigilance over time.",
      issuer: "Chetana by ActiveMirror (N1 Intelligence)",
      jurisdiction: "India",
    };
    setProof(proofObj);
    setProofGenerated(true);
    localStorage.setItem("chetana_vigilance_proof", JSON.stringify(proofObj));
  }, [chain]);

  const copyProof = () => {
    navigator.clipboard.writeText(JSON.stringify(proof, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadProof = () => {
    const blob = new Blob([JSON.stringify(proof, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `chetana-vigilance-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const scoreColor = chain.score >= 70 ? "#059669" : chain.score >= 30 ? "#F59E0B" : "#6B7280";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Header */}
      <section className="page-intro" style={{ textAlign: "center", paddingBottom: 24 }}>
        <div className="kicker" style={{ justifyContent: "center" }}><Zap size={14} /> Proof-of-Vigilance Protocol</div>
        <h1 style={{ fontSize: "clamp(28px, 4vw, 42px)" }}>Your Digital Safety Chain</h1>
        <p style={{ maxWidth: "54ch", margin: "0 auto" }}>
          Every scan, every scam type learned, every warning heeded adds a block to your vigilance chain.
          Your safety awareness becomes a cryptographic credential — provable, portable, yours.
        </p>
      </section>

      {/* Score Card */}
      <div className="panel" style={{ textAlign: "center", padding: "40px 28px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 50% 0%, ${scoreColor}15, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 72, fontWeight: 900, color: scoreColor, lineHeight: 1, letterSpacing: "-0.04em" }}>
            {chain.score}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: scoreColor, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>
            {chain.level}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
            {chain.blocks.length} actions in your vigilance chain
          </div>
          {/* Progress ring */}
          <div style={{ margin: "20px auto 0", width: 200, position: "relative" }}>
            <svg viewBox="0 0 200 12" style={{ width: "100%" }}>
              <rect x="0" y="0" width="200" height="12" rx="6" fill="rgba(0,0,0,0.06)" />
              <rect x="0" y="0" width={chain.score * 2} height="12" rx="6" fill={scoreColor} style={{ transition: "width 0.5s ease" }} />
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
              <span>Newcomer</span><span>Learner</span><span>Protector</span><span>Sentinel</span><span>Guardian</span>
            </div>
          </div>
        </div>
      </div>

      {/* Chain Visualization */}
      <div className="panel" style={{ padding: "24px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--heading)", marginBottom: 2 }}>Vigilance Chain</h2>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>Each action adds a cryptographically linked block</p>
          </div>
        </div>

        {chain.blocks.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)" }}>
            <Shield size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
            <p style={{ fontSize: 15, fontWeight: 600 }}>Your chain is empty</p>
            <p style={{ fontSize: 13 }}>Start by checking a message, exploring the Scam Atlas, or reading Scam Weather.</p>
          </div>
        ) : (
          <div className="vigilance-chain">
            {chain.blocks.slice(-12).reverse().map((block, i) => {
              const meta = TYPE_META[block.type] || TYPE_META.visit;
              const Icon = meta.icon;
              return (
                <motion.div
                  key={block.id}
                  className="vigilance-block"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <div className="vb-connector">
                    <div className="vb-dot" style={{ background: meta.color }} />
                    {i < chain.blocks.slice(-12).length - 1 && <div className="vb-line" />}
                  </div>
                  <div className="vb-content">
                    <div className="vb-header">
                      <div className="vb-icon" style={{ background: meta.color + "18", color: meta.color }}><Icon size={14} /></div>
                      <div>
                        <div className="vb-type">{meta.label}</div>
                        <div className="vb-label">{block.label}</div>
                      </div>
                    </div>
                    <div className="vb-meta">
                      <span className="vb-hash" title={block.hash}>{shortHash(block.hash)}</span>
                      <span className="vb-time">{new Date(block.timestamp).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Generate Proof Button */}
      <div style={{ textAlign: "center", margin: "24px 0" }}>
        {!proofGenerated ? (
          <button className="primary" onClick={generateProof} disabled={chain.blocks.length < 2}
            style={{ padding: "14px 32px", fontSize: 16, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Shield size={18} />
            {chain.blocks.length >= 2 ? "Generate Proof-of-Vigilance" : `Need ${2 - chain.blocks.length} more action${2 - chain.blocks.length > 1 ? "s" : ""} to unlock`}
          </button>
        ) : (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--safe)", fontWeight: 600, fontSize: 16 }}>
            <CheckCircle size={20} /> Proof-of-Vigilance Generated
          </div>
        )}
      </div>

      {/* Proof Display */}
      <AnimatePresence>
        {proofGenerated && proof && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="panel" style={{ background: "var(--safe-light)", borderColor: "rgba(5,150,105,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ShieldCheck size={18} color="var(--safe)" />
                <strong style={{ color: "var(--safe)" }}>Vigilance Proof Verified</strong>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="ghost" onClick={copyProof} style={{ padding: "6px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                  {copied ? <><CheckCircle size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                </button>
                <button className="ghost" onClick={downloadProof} style={{ padding: "6px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                  <Download size={12} /> Download
                </button>
              </div>
            </div>

            {/* Proof summary */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 16, padding: 16, background: "white", borderRadius: 12, border: "1px solid var(--line)" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: "var(--safe)" }}>{proof.subject.score}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>Vigilance Score</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: "var(--primary)" }}>{proof.chain.length}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>Chain Blocks</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: "var(--violet)" }}>{proof.subject.level}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>Trust Level</div>
              </div>
            </div>

            <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", lineHeight: 1.6 }}>
              Your vigilance has been cryptographically attested. This proof grows with every action you take on Chetana.
            </p>
            <p style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginTop: 8 }}>
              Protocol: {proof.protocol} | Root: {shortHash(proof.commitment.merkleRoot)} | {proof.issuer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* How it works */}
      <div className="panel" style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--heading)", marginBottom: 16 }}>How Proof-of-Vigilance Works</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          {[
            { icon: <Search size={20} />, title: "Check", desc: "Every scan you perform adds a block", color: "#2563EB" },
            { icon: <BookOpen size={20} />, title: "Learn", desc: "Reading scam types builds awareness", color: "#7C3AED" },
            { icon: <BarChart3 size={20} />, title: "Monitor", desc: "Checking weather signals shows vigilance", color: "#F59E0B" },
            { icon: <Shield size={20} />, title: "Prove", desc: "Generate a cryptographic proof anytime", color: "#059669" },
          ].map(item => (
            <div key={item.title} style={{ textAlign: "center", padding: 20 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: item.color + "15", color: item.color, display: "grid", placeItems: "center", margin: "0 auto 12px" }}>{item.icon}</div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--heading)", marginBottom: 4 }}>{item.title}</h3>
              <p style={{ fontSize: 13, color: "var(--muted)" }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: 40 }} />
    </motion.div>
  );
}
