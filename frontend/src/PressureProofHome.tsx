import { useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Camera,
  Phone,
  ShieldCheck,
  Users,
} from "lucide-react";
import { PageId } from "./types";

type PressureProofHomeProps = {
  onNavigate: (target: PageId) => void;
  onStartScan: (input: string) => void;
  onStartScanImage: (file: File) => void;
};

const DEMO_MESSAGE =
  "Urgent: your bank KYC will expire today. Update now to avoid account block and pay Rs 499 immediately. https://secure-kyc-update.top/verify";

const DEMO_REASONS = [
  "Creates panic with a 'today' deadline.",
  "Asks for a payment and a link before you can verify anything.",
];

const ROUTE_CARDS: Array<{
  title: string;
  body: string;
  actionLabel: string;
  action: PageId;
  icon: JSX.Element;
}> = [
  {
    title: "For parents and family",
    body: "Show common scams in plain language when someone at home asks, “Is this real?”",
    actionLabel: "Open family view",
    action: "family",
    icon: <Users size={18} />,
  },
  {
    title: "Money already lost",
    body: "Do not wait. Start with 1930, your bank, and the official complaint steps.",
    actionLabel: "Open help now",
    action: "panic",
    icon: <Phone size={18} />,
  },
  {
    title: "For shops and delivery",
    body: "Check payment screenshots before handing over goods, stock, or service.",
    actionLabel: "Open merchant lane",
    action: "merchant",
    icon: <Building2 size={18} />,
  },
];

export default function PressureProofHome({
  onNavigate,
  onStartScan,
  onStartScanImage,
}: PressureProofHomeProps) {
  const [showPaste, setShowPaste] = useState(false);
  const [draft, setDraft] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const pickImage = (file: File | null) => {
    if (file) onStartScanImage(file);
  };

  return (
    <div className="pp-home">
      <section className="pp-hero-shell">
        <div className="pp-hero-copy">
          <div className="pp-kicker">
            <ShieldCheck size={14} />
            Free scam check
          </div>
          <h1>
            Is this a scam?
            <span>Screenshot it. We'll check.</span>
          </h1>
          <p className="pp-lede">
            See something off — a message, link, QR, or call? Take a screenshot and drop it in. Chetana reads it and
            tells you what to do, in seconds.
          </p>

          <label
            className="pp-shot-zone"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              textAlign: "center",
              padding: "32px 20px",
              border: "2px dashed var(--pp-line, rgba(148,163,184,0.45))",
              borderRadius: 18,
              background: "var(--pp-surface, rgba(255,255,255,0.04))",
              cursor: "pointer",
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pickImage(e.dataTransfer.files?.[0] || null);
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                pickImage(e.target.files?.[0] || null);
                e.target.value = "";
              }}
            />
            <Camera size={30} />
            <strong style={{ fontSize: "1.05rem" }}>Add a screenshot</strong>
            <span style={{ opacity: 0.7 }}>Tap to choose, or drag an image here</span>
          </label>

          {!showPaste ? (
            <button className="pp-text-link" onClick={() => setShowPaste(true)}>
              or paste the text instead
            </button>
          ) : (
            <div className="pp-draft-shell">
              <textarea
                className="pp-draft-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Paste the message, link, or payment request here."
              />
              <div className="pp-draft-actions">
                <button
                  className="pp-primary-btn"
                  onClick={() => onStartScan(draft.trim() || DEMO_MESSAGE)}
                >
                  Check this text
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          <div className="pp-trust-row">
            <span>Free</span>
            <span>No login</span>
            <span>12 Indian languages</span>
            <span>Shows 1930 help</span>
          </div>
        </div>

        <div className="pp-chamber">
          <div className="pp-chamber-header">
            <div>
              <div className="pp-chamber-label">Example</div>
              <strong>This is what you get back</strong>
            </div>
          </div>

          <div
            className="pp-example-msg"
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background: "var(--pp-surface, rgba(255,255,255,0.04))",
              opacity: 0.85,
              fontSize: "0.9rem",
            }}
          >
            “{DEMO_MESSAGE}”
          </div>

          <div className="pp-signal-card pp-signal-card-pressure">
            <div className="pp-signal-label">
              <AlertTriangle size={14} /> Likely scam
            </div>
            <ul>
              {DEMO_REASONS.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>

          <div
            className="pp-example-do"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginTop: 12,
            }}
          >
            <strong style={{ fontSize: "0.92rem" }}>
              Don't pay. Open your real bank app yourself.
            </strong>
            <a className="pp-secondary-btn" href="tel:1930">
              Call 1930
            </a>
          </div>
        </div>
      </section>

      <section className="pp-route-grid">
        {ROUTE_CARDS.map((route) => (
          <button
            key={route.title}
            className="pp-route-card"
            onClick={() => onNavigate(route.action)}
          >
            <div className="pp-route-icon">{route.icon}</div>
            <div className="pp-route-copy">
              <strong>{route.title}</strong>
              <p>{route.body}</p>
            </div>
            <span className="pp-route-action">
              {route.actionLabel}
              <ArrowRight size={16} />
            </span>
          </button>
        ))}
      </section>

      <section className="pp-manifesto">
        <div className="pp-manifesto-copy">
          <div className="pp-kicker">
            <Phone size={14} />
            Official help
          </div>
          <h2>If money is gone, do not wait.</h2>
          <p>
            Call 1930 immediately. Then report on cybercrime.gov.in and call your bank using the official number in
            the app, on your card, or on your statement.
          </p>
          <div className="pp-action-row">
            <a className="pp-primary-btn" href="tel:1930">Call 1930</a>
            <a
              className="pp-secondary-btn"
              href="https://cybercrime.gov.in/"
              target="_blank"
              rel="noreferrer"
            >
              Open cybercrime.gov.in
            </a>
          </div>
        </div>
        <div className="pp-manifesto-quote">
          <span>Hindi quick line</span>
          <strong>अगर पैसे जा चुके हैं, पहले 1930 पर कॉल करें।</strong>
        </div>
      </section>
    </div>
  );
}
