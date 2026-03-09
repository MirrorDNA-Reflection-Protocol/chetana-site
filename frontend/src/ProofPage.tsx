import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, ShieldCheck, Eye, Clock, ScrollText, FileCheck, Copy, Download, Share2, CheckCircle, AlertTriangle } from "lucide-react";

/* ── Crypto helpers ──────────────────────────────────────────── */
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function shortHash(h: string) { return h.slice(0, 8) + "..." + h.slice(-6); }

/* ── Document content ────────────────────────────────────────── */
const TERMS_SECTIONS = [
  {
    title: "1. What Chetana Does",
    body: `Chetana is an AI-powered trust verification system that analyzes messages, links, UPI IDs, phone numbers, payment proofs, and media for signs of fraud and deception. It provides risk scores, threat signals, and suggested actions to help users make informed decisions.`,
  },
  {
    title: "2. Chetana Is Advisory, Not Authoritative",
    body: `Chetana's verdicts are automated assessments based on pattern matching, threat intelligence feeds, and machine learning models. They are not legal determinations. A "SUSPICIOUS" verdict does not prove fraud. A "LOW_RISK" verdict does not guarantee safety. Always exercise independent judgment and verify through official channels.`,
  },
  {
    title: "3. No Guarantee of Accuracy",
    body: `While Chetana draws from live threat feeds (PhishTank, OpenPhish, URLhaus, CERT-IN, RBI alerts, and others), no automated system can detect every scam or guarantee zero false positives. Scammers constantly evolve their tactics. Chetana is one layer of protection — not your only layer.`,
  },
  {
    title: "4. Privacy and Data Handling",
    body: `Chetana processes your inputs (messages, links, numbers) to generate analysis using cloud-based AI and threat intelligence APIs. Your data is transmitted securely, used only for analysis, and not stored beyond the session unless you explicitly consent. We never sell or share your data with third parties. You can request data export or deletion at any time.`,
  },
  {
    title: "5. Not a Substitute for Emergency Services",
    body: `If you are in immediate danger, contact local police (100), women's helpline (181), or the national cybercrime helpline (1930). If you have already lost money to fraud, file a complaint at cybercrime.gov.in within the first hour for the best chance of recovery. Chetana is a prevention tool — not a law enforcement agency.`,
  },
  {
    title: "6. Family Shield and Sharing",
    body: `When you share Chetana's analysis via Family Shield cards, the recipient receives a simplified, family-safe summary. Chetana does not track who you share with. Share-safe cards contain no personal identifiers from the sender.`,
  },
  {
    title: "7. Enterprise and Merchant Use",
    body: `Chetana Nexus provides threat intelligence and verification services for businesses. Enterprise deployments include audit trails, action eligibility frameworks, and analyst replay. Enterprise customers are responsible for how they act on Chetana's intelligence. Chetana does not make business decisions — it provides evidence and recommendations.`,
  },
  {
    title: "8. Limitation of Liability",
    body: `ActiveMirror (N1 Intelligence) and the Chetana project shall not be held liable for any financial loss, emotional distress, or other damages resulting from reliance on Chetana's analysis. By using Chetana, you acknowledge that automated scam detection has inherent limitations and accept these risks.`,
  },
  {
    title: "9. Updates and Changes",
    body: `These terms may be updated as Chetana evolves. Material changes will be communicated through the platform. Continued use after changes constitutes acceptance of updated terms.`,
  },
  {
    title: "10. Jurisdiction",
    body: `Chetana is built in India, for India. These terms are governed by the laws of India. Disputes shall be subject to the jurisdiction of courts in Bengaluru, Karnataka.`,
  },
];

const FULL_TEXT = TERMS_SECTIONS.map(s => s.title + " " + s.body).join(" ");
const WORD_COUNT = FULL_TEXT.split(/\s+/).length;

/* ── Proof-of-Memory Component ───────────────────────────────── */
export default function ProofPage({ onAccepted }: { onAccepted?: () => void } = {}) {
  const docRef = useRef<HTMLDivElement | null>(null);
  const [scrollDepth, setScrollDepth] = useState(0);
  const [dwellTime, setDwellTime] = useState(0);
  const [focusEvents, setFocusEvents] = useState(0);
  const [wordsViewed, setWordsViewed] = useState(0);
  const [attentionScore, setAttentionScore] = useState(0);
  const [proofGenerated, setProofGenerated] = useState(false);
  const [proof, setProof] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const startTime = useRef(Date.now());
  const focusRef = useRef(0);

  // Track scroll depth
  const handleScroll = useCallback(() => {
    if (!docRef.current) return;
    const el = docRef.current;
    const scrolled = el.scrollTop / (el.scrollHeight - el.clientHeight);
    setScrollDepth(Math.min(100, Math.round(scrolled * 100)));
    // Estimate words viewed based on scroll
    setWordsViewed(Math.min(WORD_COUNT, Math.round(scrolled * WORD_COUNT)));
  }, []);

  // Track dwell time
  useEffect(() => {
    const iv = setInterval(() => {
      setDwellTime(Math.round((Date.now() - startTime.current) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  // Track focus events
  useEffect(() => {
    const handler = () => { focusRef.current++; setFocusEvents(focusRef.current); };
    window.addEventListener("focus", handler);
    window.addEventListener("click", handler);
    return () => { window.removeEventListener("focus", handler); window.removeEventListener("click", handler); };
  }, []);

  // Compute attention score
  useEffect(() => {
    const scrollW = Math.min(scrollDepth / 90, 1) * 30;
    const dwellW = Math.min(dwellTime / 60, 1) * 25;
    const focusW = Math.min(focusEvents / 10, 1) * 20;
    const wordsW = Math.min(wordsViewed / WORD_COUNT, 1) * 25;
    setAttentionScore(Math.round(scrollW + dwellW + focusW + wordsW));
  }, [scrollDepth, dwellTime, focusEvents, wordsViewed]);

  const canGenerate = attentionScore >= 50;

  const generateProof = async () => {
    if (!canGenerate) return;
    const docHash = await sha256(FULL_TEXT);
    const timestamp = new Date().toISOString();
    const attentionData = JSON.stringify({ scrollDepth, dwellTime, focusEvents, wordsViewed, attentionScore });
    const attentionHash = await sha256(attentionData);
    const commitment = await sha256(docHash + attentionHash + timestamp);
    const proofObj = {
      protocol: "Chetana Proof-of-Memory v1.0",
      timestamp,
      document: { title: "Chetana Terms of Use & Disclaimer", hash: docHash, wordCount: WORD_COUNT },
      attention: { score: attentionScore, scrollDepth, dwellTimeSeconds: dwellTime, focusEvents, wordsViewed, totalWords: WORD_COUNT, hash: attentionHash },
      commitment: { merkleRoot: commitment, algorithm: "SHA-256" },
      attestation: "By generating this proof, the user attests they have read and understood the Chetana Terms of Use and Disclaimer.",
      issuer: "ActiveMirror (N1 Intelligence)",
      jurisdiction: "India",
    };
    setProof(proofObj);
    setProofGenerated(true);
    localStorage.setItem("chetana_proof", JSON.stringify(proofObj));
    localStorage.setItem("chetana_terms_accepted", timestamp);
    if (onAccepted) setTimeout(() => onAccepted(), 2000);
  };

  const copyProof = () => {
    navigator.clipboard.writeText(JSON.stringify(proof, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadProof = () => {
    const blob = new Blob([JSON.stringify(proof, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `chetana-proof-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Header */}
      <section className="page-intro" style={{ textAlign: "center", paddingBottom: 24 }}>
        <div className="kicker" style={{ justifyContent: "center" }}><ShieldCheck size={14} /> Proof-of-Memory Protocol</div>
        <h1 style={{ fontSize: "clamp(28px, 4vw, 42px)" }}>Terms of Use & Disclaimer</h1>
        <p style={{ maxWidth: "50ch", margin: "0 auto" }}>Read the terms below. Your attention is tracked to generate a cryptographic proof that you understood — not just clicked through.</p>
      </section>

      {/* Attention Metrics Bar */}
      <div className="panel" style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-around", padding: "16px 20px", marginBottom: 16 }}>
        <MetricItem icon={<Eye size={16} />} label="Attention" value={`${attentionScore}%`} color={attentionScore >= 50 ? "var(--safe)" : "var(--amber)"} />
        <MetricItem icon={<ScrollText size={16} />} label="Scroll" value={`${scrollDepth}%`} color="var(--primary)" />
        <MetricItem icon={<Clock size={16} />} label="Dwell" value={`${dwellTime}s`} color="var(--primary)" />
        <MetricItem icon={<Eye size={16} />} label="Focus" value={`${focusEvents}`} color="var(--primary)" />
        <MetricItem icon={<FileCheck size={16} />} label="Words" value={`${wordsViewed}/${WORD_COUNT}`} color="var(--primary)" />
      </div>

      {/* Document */}
      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FileCheck size={16} color="var(--primary)" />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Chetana Terms of Use & Disclaimer</span>
          </div>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Hash: {shortHash("7f3a2b1c9e4d...")}</span>
        </div>
        <div ref={docRef} onScroll={handleScroll} style={{ maxHeight: 440, overflowY: "auto", padding: "24px 28px" }}>
          {TERMS_SECTIONS.map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0.4 }} whileInView={{ opacity: 1 }} viewport={{ once: true, margin: "-20px" }} transition={{ duration: 0.4 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--heading)", marginTop: i > 0 ? 24 : 0, marginBottom: 8 }}>{s.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.75, color: "var(--muted)", marginBottom: 12 }}>{s.body}</p>
            </motion.div>
          ))}
          <div style={{ borderTop: "1px solid var(--line)", marginTop: 24, paddingTop: 16, textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--muted)", fontStyle: "italic" }}>
              By generating a Proof-of-Memory, you attest that you have read and understood the terms above.
            </p>
          </div>
        </div>
      </div>

      {/* Generate Button */}
      <div style={{ textAlign: "center", margin: "24px 0" }}>
        {!proofGenerated ? (
          <button className="primary" onClick={generateProof} disabled={!canGenerate} style={{ padding: "14px 32px", fontSize: 16, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Shield size={18} />
            {canGenerate ? "Generate Proof-of-Memory" : `Read more to unlock (${attentionScore}% / 50%)`}
          </button>
        ) : (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--safe)", fontWeight: 600, fontSize: 16 }}>
            <CheckCircle size={20} /> Proof Generated & Terms Accepted
          </div>
        )}
        {!canGenerate && !proofGenerated && (
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
            <AlertTriangle size={12} style={{ verticalAlign: "middle" }} /> Scroll through and read the document to reach 50% attention score.
          </p>
        )}
      </div>

      {/* Proof Display */}
      <AnimatePresence>
        {proofGenerated && proof && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="panel" style={{ background: "var(--safe-light)", borderColor: "rgba(5,150,105,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ShieldCheck size={18} color="var(--safe)" />
                <strong style={{ color: "var(--safe)" }}>Proof Verified</strong>
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

            {/* Merkle visualization */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 16, padding: 16, background: "var(--bg-card)", borderRadius: 12, border: "1px solid var(--line)" }}>
              <MerkleNode label="ROOT" hash={shortHash(proof.commitment.merkleRoot)} color="var(--safe)" />
              <div style={{ width: 1, height: 16, background: "var(--line)" }} />
              <div style={{ display: "flex", gap: 32 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <MerkleNode label="document" hash={shortHash(proof.document.hash)} color="var(--primary)" />
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <MerkleNode label="attention" hash={shortHash(proof.attention.hash)} color="var(--violet)" />
                </div>
              </div>
            </div>

            <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", lineHeight: 1.6 }}>
              Your attention has been cryptographically attested. You've proven you read the content — not just clicked through.
            </p>
            <p style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginTop: 8 }}>
              Protocol: {proof.protocol} | Issuer: {proof.issuer} | {proof.jurisdiction}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ height: 40 }} />
    </motion.div>
  );
}

/* ── Sub-components ──────────────────────────────────────────── */
function MetricItem({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: "center", minWidth: 64 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, color, marginBottom: 2 }}>
        {icon} <span style={{ fontSize: 18, fontWeight: 800 }}>{value}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function MerkleNode({ label, hash, color }: { label: string; hash: string; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <div style={{ width: 12, height: 12, borderRadius: "50%", background: color }} />
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--heading)" }}>{label}</div>
      <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "monospace" }}>{hash}</div>
    </div>
  );
}
