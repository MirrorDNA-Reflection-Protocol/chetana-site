import { useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle,
  FileText,
  Lock,
  PhoneCall,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

const SETUP_CARDS = [
  {
    icon: <ShieldCheck size={18} />,
    title: "What Chetana can help with",
    body: "Chetana can help you pause, spot warning signs, and choose the next safe step for suspicious messages, payment screenshots, links, voice notes, and scam pressure.",
    bullets: [
      "It is good at calm guidance under pressure.",
      "It can point you to 1930, your bank, and official verification rails.",
      "It can help before you click, pay, or hand over goods.",
    ],
  },
  {
    icon: <AlertTriangle size={18} />,
    title: "What Chetana cannot promise",
    body: "No tool can guarantee every answer. Chetana may need more evidence, and it can still be wrong. That is why official verification always matters.",
    bullets: [
      "A safe-looking result is not a guarantee.",
      "A risky result is a warning, not a court judgment.",
      "If money is involved, verify through the official app, website, or number you already trust.",
    ],
  },
  {
    icon: <Lock size={18} />,
    title: "How data is handled",
    body: "Chetana starts locally when it can. Some deeper checks may still use secure server help. It is built to guide you, not to sell your panic.",
    bullets: [
      "Basic text checks can start in your browser.",
      "Links, reputation checks, and some media review may use server help.",
      "Chetana is not a government service.",
    ],
  },
  {
    icon: <PhoneCall size={18} />,
    title: "If money already moved",
    body: "Do not spend time arguing with the scammer. Move to recovery fast.",
    bullets: [
      "Call 1930 immediately.",
      "Call your bank using the number in your bank app, card, or statement.",
      "Save screenshots, UTR, links, numbers, and chat history before they disappear.",
    ],
  },
];

const CHECKLIST = [
  "I understand Chetana is guidance, not final authority.",
  "I will verify money or identity requests through official channels I already trust.",
  "If money is already gone, I will call 1930 first.",
];

export default function ProofPage({ onAccepted }: { onAccepted?: () => void } = {}) {
  const [checks, setChecks] = useState<boolean[]>(CHECKLIST.map(() => false));

  const ready = checks.every(Boolean);

  const toggle = (index: number) => {
    setChecks((current) => current.map((value, i) => (i === index ? !value : value)));
  };

  const accept = () => {
    if (!ready) return;
    const timestamp = new Date().toISOString();
    const receipt = {
      protocol: "chetana-setup-receipt.v2",
      accepted_at: timestamp,
      statements: CHECKLIST,
      jurisdiction: "India",
      note: "User acknowledged advisory limits, official verification, and recovery rails.",
    };
    localStorage.setItem("chetana_terms_accepted", timestamp);
    localStorage.setItem("chetana_proof", JSON.stringify(receipt));
    onAccepted?.();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ maxWidth: 860, margin: "0 auto" }}>
      <section className="page-intro" style={{ textAlign: "center", paddingBottom: 20 }}>
        <div className="kicker" style={{ justifyContent: "center" }}>
          <ShieldCheck size={14} />
          Before first check
        </div>
        <h1 style={{ fontSize: "clamp(30px, 4vw, 44px)" }}>Quick setup. No surprises.</h1>
        <p style={{ maxWidth: "56ch", margin: "0 auto" }}>
          One short read before you use Chetana. Plain language, clear limits, and the real emergency rails.
        </p>
      </section>

      <div
        className="panel"
        style={{
          display: "grid",
          gap: 10,
          marginBottom: 18,
          background: "rgba(239,68,68,0.08)",
          borderColor: "rgba(239,68,68,0.18)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#fecaca", fontWeight: 700 }}>
          <AlertTriangle size={18} />
          If money already moved, call 1930 first.
        </div>
        <p style={{ margin: 0, color: "rgba(255,255,255,0.8)", lineHeight: 1.65 }}>
          Then call your bank and finish the complaint on <strong>cybercrime.gov.in</strong>.
        </p>
        <p style={{ margin: 0, color: "#fecaca", lineHeight: 1.6 }}>
          अगर पैसे जा चुके हैं, अभी <strong>1930</strong> पर कॉल करें।
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {SETUP_CARDS.map((card) => (
          <div key={card.title} className="panel" style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--primary-bright)", fontWeight: 700 }}>
              {card.icon}
              {card.title}
            </div>
            <p style={{ margin: 0, lineHeight: 1.7, color: "var(--muted)" }}>{card.body}</p>
            <div style={{ display: "grid", gap: 8 }}>
              {card.bullets.map((bullet) => (
                <div key={bullet} style={{ display: "flex", gap: 8, alignItems: "flex-start", color: "rgba(255,255,255,0.82)", lineHeight: 1.55 }}>
                  <span style={{ color: "var(--primary-bright)" }}>•</span>
                  <span>{bullet}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="panel" style={{ marginTop: 18, display: "grid", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <FileText size={18} color="var(--primary-bright)" />
          <div>
            <strong style={{ display: "block", color: "var(--heading)" }}>Before you continue</strong>
            <span style={{ color: "var(--muted)", fontSize: 14 }}>Check these three boxes so Chetana and you are operating under the same rules.</span>
          </div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {CHECKLIST.map((item, index) => (
            <button
              key={item}
              onClick={() => toggle(index)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "14px 16px",
                borderRadius: 14,
                border: checks[index] ? "1px solid rgba(34,197,94,0.35)" : "1px solid rgba(255,255,255,0.1)",
                background: checks[index] ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.03)",
                color: "rgba(255,255,255,0.9)",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  display: "grid",
                  placeItems: "center",
                  background: checks[index] ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.08)",
                  color: checks[index] ? "#22c55e" : "rgba(255,255,255,0.45)",
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                <CheckCircle size={14} />
              </div>
              <span style={{ lineHeight: 1.6 }}>{item}</span>
            </button>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr",
            gap: 16,
            alignItems: "center",
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <strong style={{ color: "var(--heading)" }}>What happens next</strong>
            <span style={{ color: "var(--muted)", lineHeight: 1.6 }}>
              Once you continue, Chetana opens the checker. On Android, you can install it once and then share straight from WhatsApp, Messages, or Gallery.
            </span>
            <span style={{ color: "rgba(255,255,255,0.68)", lineHeight: 1.6 }}>
              Hindi quick line: <strong>रुकिए, जांच कीजिए, फिर ही पैसे भेजिए।</strong>
            </span>
          </div>

          <button
            className="primary"
            onClick={accept}
            disabled={!ready}
            style={{
              width: "100%",
              padding: "14px 20px",
              fontSize: 16,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            <Smartphone size={18} />
            I understand. Start checking.
          </button>
        </div>
      </div>

      <div style={{ height: 40 }} />
    </motion.div>
  );
}
