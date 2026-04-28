import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  CreditCard,
  ExternalLink,
  Globe,
  Link2,
  MessageCircle,
  Phone,
  QrCode,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { PageId } from "./types";

type PressureProofHomeProps = {
  onNavigate: (target: PageId) => void;
  onStartScan: (input: string) => void;
};

type Scenario = {
  id: string;
  label: string;
  lane: string;
  sample: string;
  pressureScore: number;
  proofScore: number;
  pressureSignals: string[];
  proofSignals: string[];
  recoveryLine: string;
  trustRoute: string;
};

const SCENARIOS: Scenario[] = [
  {
    id: "kyc",
    label: "Bank scare text",
    lane: "SMS / WhatsApp",
    sample:
      "Urgent: your bank KYC will expire today. Update now to avoid account block and pay Rs 499 immediately. https://secure-kyc-update.top/verify",
    pressureScore: 92,
    proofScore: 22,
    pressureSignals: [
      "Claims your account will break today unless you act now.",
      "Pushes you toward a link and a small payment before you can think.",
      "Uses bank language without any verifiable branch, app, or official callback path.",
    ],
    proofSignals: [
      "Open the real bank app yourself instead of touching the message link.",
      "Check whether the sender, domain, and requested fee match any real bank flow.",
      "A real bank will not ask for UPI PIN, screen share, or a rush payment to keep your account alive.",
    ],
    recoveryLine: "If you already entered details or paid, call 1930 and your bank now.",
    trustRoute: "Verify only from the official banking app or card-back helpline.",
  },
  {
    id: "payment",
    label: "Fake payment proof",
    lane: "Shop counter / delivery",
    sample:
      "Customer says payment is done and shows a screenshot with SUCCESSFUL written on it, but your UPI app does not show the money yet. They want to leave with the goods now.",
    pressureScore: 86,
    proofScore: 35,
    pressureSignals: [
      "The entire story depends on a screenshot instead of your own bank confirmation.",
      "The buyer wants goods released before your app settles or confirms the credit.",
      "Speed is the attack surface: handover happens before truth catches up.",
    ],
    proofSignals: [
      "Your own bank or UPI app is the authority, not the customer's screen.",
      "Check for UTR, settlement, and actual credit inside your account history.",
      "Wait for your rail, not their theatre.",
    ],
    recoveryLine: "Do not hand over goods until your app confirms payment.",
    trustRoute: "Use the merchant lane for payment screenshot and QR proof checks.",
  },
  {
    id: "authority",
    label: "Digital arrest call",
    lane: "Phone / voice note",
    sample:
      "Caller says they are from police and your Aadhaar is linked to a criminal case. They tell you not to disconnect, not to tell family, and to transfer money for verification.",
    pressureScore: 96,
    proofScore: 18,
    pressureSignals: [
      "Isolation is part of the script: stay on the line and tell nobody.",
      "Authority theatre replaces evidence with fear, urgency, and secrecy.",
      "Payment is framed as a shortcut to safety.",
    ],
    proofSignals: [
      "Real police do not settle cases over random calls or video chats.",
      "Disconnect and call a known family member or official number you already trust.",
      "Separate fear from evidence before you do anything else.",
    ],
    recoveryLine: "If money or account access was shared, switch from fear mode to recovery mode immediately.",
    trustRoute: "Use official numbers you already know, never the ones given in the threatening call.",
  },
  {
    id: "qr",
    label: "QR collect request",
    lane: "UPI / QR",
    sample:
      "Seller says scan this QR to receive your refund. The app shows a collect request and asks for UPI PIN to complete it.",
    pressureScore: 84,
    proofScore: 28,
    pressureSignals: [
      "The story says receive money, but the rail is actually asking you to approve a debit.",
      "Uses refund language to disguise a collect request.",
      "Relies on UI confusion and speed instead of clear payee proof.",
    ],
    proofSignals: [
      "Read the payee and flow inside the real UPI app before you approve anything.",
      "Receiving money should not require your UPI PIN for a payment request you did not expect.",
      "If the action and the story disagree, trust the rail.",
    ],
    recoveryLine: "If you approved a request by mistake, call 1930 and your bank immediately.",
    trustRoute: "Cross-check payee identity and request type inside your own UPI app.",
  },
];

const META_PRINCIPLES = [
  {
    title: "Scams attack your clock",
    body: "The lie matters, but the demand for speed matters more. Chetana is designed to interrupt the timer.",
    icon: <Clock3 size={18} />,
  },
  {
    title: "Proof beats performance",
    body: "The interface pulls you away from screenshots, threats, and theatre and back toward rails you can independently verify.",
    icon: <ShieldCheck size={18} />,
  },
  {
    title: "Recovery stays visible",
    body: "If money already moved, the product should stop acting clever and show the recovery path immediately.",
    icon: <AlertTriangle size={18} />,
  },
];

const ROUTE_CARDS: Array<{
  title: string;
  body: string;
  actionLabel: string;
  action: PageId;
  icon: JSX.Element;
}> = [
  {
    title: "Check a suspicious message",
    body: "Paste text, upload a screenshot, or bring in a QR, link, or voice note for a live check.",
    actionLabel: "Open live check",
    action: "scan",
    icon: <Upload size={18} />,
  },
  {
    title: "Money already moved",
    body: "Skip diagnosis and open the recovery steps first. Chetana should pivot to action, not explanation.",
    actionLabel: "Open recovery flow",
    action: "panic",
    icon: <Phone size={18} />,
  },
  {
    title: "I run a shop",
    body: "Use the payment screenshot lane before handing over goods, stock, service, or delivery.",
    actionLabel: "Open merchant lane",
    action: "merchant",
    icon: <Building2 size={18} />,
  },
];

const EVIDENCE_CHIPS = [
  { icon: <MessageCircle size={14} />, label: "SMS / chat" },
  { icon: <Link2 size={14} />, label: "Link / domain" },
  { icon: <QrCode size={14} />, label: "QR / collect request" },
  { icon: <CreditCard size={14} />, label: "Payment proof" },
  { icon: <Phone size={14} />, label: "Call / voice note" },
  { icon: <Globe size={14} />, label: "Official rails" },
];

export default function PressureProofHome({ onNavigate, onStartScan }: PressureProofHomeProps) {
  const [activeId, setActiveId] = useState(SCENARIOS[0].id);
  const [draft, setDraft] = useState(SCENARIOS[0].sample);

  const activeScenario = SCENARIOS.find((scenario) => scenario.id === activeId) || SCENARIOS[0];
  const pressureWidth = `${activeScenario.pressureScore}%`;
  const proofWidth = `${activeScenario.proofScore}%`;
  const interceptionGap = Math.max(activeScenario.pressureScore - activeScenario.proofScore, 0);

  const selectScenario = (scenario: Scenario) => {
    setActiveId(scenario.id);
    setDraft(scenario.sample);
  };

  const runLiveCheck = () => {
    const nextInput = draft.trim() || activeScenario.sample;
    onStartScan(nextInput);
  };

  return (
    <div className="pp-home">
      <section className="pp-hero-shell">
        <div className="pp-hero-copy">
          <div className="pp-kicker">
            <Sparkles size={14} />
            A calmer front door for a high-pressure problem
          </div>
          <h1>
            Scams do not just ask for money.
            <span>They ask for speed.</span>
          </h1>
          <p className="pp-lede">
            The current site behaves like a detector. This version behaves like an interception chamber.
            It makes the first question obvious: what is pressuring you, and what can actually be proved?
          </p>
          <div className="pp-action-row">
            <button className="pp-primary-btn" onClick={runLiveCheck}>
              Run a live check
              <ArrowRight size={16} />
            </button>
            <button className="pp-secondary-btn" onClick={() => onNavigate("panic")}>
              Money already moved?
            </button>
          </div>
          <div className="pp-trust-row">
            <span>Free</span>
            <span>No sign-up</span>
            <span>Built for India</span>
            <span>Recovery-first</span>
          </div>
          <div className="pp-chip-cloud">
            {EVIDENCE_CHIPS.map((chip) => (
              <span key={chip.label} className="pp-evidence-chip">
                {chip.icon}
                {chip.label}
              </span>
            ))}
          </div>
        </div>

        <div className="pp-chamber">
          <div className="pp-chamber-header">
            <div>
              <div className="pp-chamber-label">Pressure vs Proof</div>
              <strong>{activeScenario.label}</strong>
            </div>
            <span>{activeScenario.lane}</span>
          </div>

          <div className="pp-scenario-row">
            {SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                className={`pp-scenario-chip${scenario.id === activeScenario.id ? " active" : ""}`}
                onClick={() => selectScenario(scenario)}
              >
                {scenario.label}
              </button>
            ))}
          </div>

          <div className="pp-meter-shell">
            <div className="pp-meter-copy">
              <div>
                <span>Pressure</span>
                <strong>{activeScenario.pressureScore}</strong>
              </div>
              <div>
                <span>Proof</span>
                <strong>{activeScenario.proofScore}</strong>
              </div>
              <div>
                <span>Interception gap</span>
                <strong>{interceptionGap}</strong>
              </div>
            </div>
            <div className="pp-meter-track">
              <div className="pp-meter-bar pp-meter-bar-pressure" style={{ width: pressureWidth }} />
              <div className="pp-meter-bar pp-meter-bar-proof" style={{ width: proofWidth }} />
            </div>
          </div>

          <div className="pp-signal-grid">
            <div className="pp-signal-card pp-signal-card-pressure">
              <div className="pp-signal-label">What the scam wants</div>
              <h2>Move faster than evidence.</h2>
              <ul>
                {activeScenario.pressureSignals.map((signal) => (
                  <li key={signal}>{signal}</li>
                ))}
              </ul>
            </div>

            <div className="pp-signal-card pp-signal-card-proof">
              <div className="pp-signal-label">What reality can prove</div>
              <h2>Verify on your own rails.</h2>
              <ul>
                {activeScenario.proofSignals.map((signal) => (
                  <li key={signal}>{signal}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="pp-draft-shell">
            <div className="pp-draft-head">
              <div>
                <div className="pp-signal-label">Rehearse with a live case</div>
                <strong>Load a scenario or paste your own suspicious text.</strong>
              </div>
              <button className="pp-text-link" onClick={() => setDraft(activeScenario.sample)}>
                Reload sample
              </button>
            </div>
            <textarea
              className="pp-draft-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Paste the suspicious message, refund claim, bank threat, QR context, or payment proof note."
            />
            <div className="pp-draft-actions">
              <button className="pp-primary-btn" onClick={runLiveCheck}>
                Send this to the scanner
                <ArrowRight size={16} />
              </button>
              <button className="pp-secondary-btn" onClick={() => onNavigate("merchant")}>
                Check payment proof instead
              </button>
            </div>
          </div>

          <div className="pp-recovery-rail">
            <AlertTriangle size={16} />
            <div>
              <strong>{activeScenario.recoveryLine}</strong>
              <span>{activeScenario.trustRoute}</span>
            </div>
            <a href="tel:1930">
              Call 1930
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </section>

      <section className="pp-route-grid">
        {ROUTE_CARDS.map((route) => (
          <button key={route.title} className="pp-route-card" onClick={() => onNavigate(route.action)}>
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

      <section className="pp-meta-grid">
        {META_PRINCIPLES.map((principle) => (
          <article key={principle.title} className="pp-meta-card">
            <div className="pp-meta-icon">{principle.icon}</div>
            <strong>{principle.title}</strong>
            <p>{principle.body}</p>
          </article>
        ))}
      </section>

      <section className="pp-manifesto">
        <div className="pp-manifesto-copy">
          <div className="pp-kicker">
            <CheckCircle2 size={14} />
            Meta shift
          </div>
          <h2>Chetana should feel less like a website and more like a civic reflex.</h2>
          <p>
            The novel move is not extra chrome. It is product grammar. Home should compress everything into one
            sentence of behavior: if pressure rises faster than proof, pause and verify. Everything else can live
            below that rule.
          </p>
        </div>
        <div className="pp-manifesto-quote">
          <span>New front-door rule</span>
          <strong>If pressure &gt; proof, do not pay, click, reply, or hand over goods.</strong>
        </div>
      </section>
    </div>
  );
}
