import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  ExternalLink,
  Link2,
  MessageCircle,
  Phone,
  QrCode,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import { PageId } from "./types";

type PressureProofHomeProps = {
  onNavigate: (target: PageId) => void;
  onStartScan: (input: string) => void;
};

type ActionPrompt = {
  id: string;
  label: string;
  askLine: string;
  sample: string;
  trapLine: string;
  redFlags: string[];
  actions: string[];
  quickRule: string;
  recoveryLine: string;
  trustRoute: string;
};

const ACTION_PROMPTS: ActionPrompt[] = [
  {
    id: "pay_now",
    label: "Pay now",
    askLine: "They are asking you to send money right now.",
    sample:
      "Urgent: your bank KYC will expire today. Update now to avoid account block and pay Rs 499 immediately. https://secure-kyc-update.top/verify",
    trapLine: "Urgency plus a small payment is a very common scam move.",
    redFlags: [
      "They say something bad will happen today if you do not pay now.",
      "They ask for a fee, deposit, or transfer before proper verification.",
      "They want payment before you can calmly check in the real app or with a trusted person.",
    ],
    actions: [
      "Stop. Do not pay until you verify in the official app or number you already trust.",
      "Check the name, account, or UPI ID inside your own bank or UPI app.",
      "If the money is already sent, call 1930 and your bank immediately.",
    ],
    quickRule: "Do not pay first. Verify first.",
    recoveryLine: "If you already paid or shared bank details, call 1930 and your bank now.",
    trustRoute: "Use only the official bank app or the number already saved on your card or statement.",
  },
  {
    id: "click_link",
    label: "Click this link",
    askLine: "They are asking you to open a link.",
    sample:
      "Your courier could not be delivered. Please update address now to avoid return. Click https://india-post-track-fast.help immediately.",
    trapLine: "Scam links try to pull you out of the real app and into a fake page.",
    redFlags: [
      "The link comes with urgency: parcel issue, KYC problem, refund, prize, or account block.",
      "The page usually asks for bank details, OTP, UPI PIN, or card details.",
      "The safest path is almost never the link inside the suspicious message.",
    ],
    actions: [
      "Do not open the link again.",
      "Open the real app or website yourself and check there.",
      "If you already entered details, call your bank and 1930 right away.",
    ],
    quickRule: "Open the real app yourself, not the link.",
    recoveryLine: "If you already entered bank details, card details, OTP, or PIN, move fast.",
    trustRoute: "Use only official apps, official websites, and official support numbers.",
  },
  {
    id: "scan_qr",
    label: "Scan this QR",
    askLine: "They are asking you to scan a QR or approve a collect request.",
    sample:
      "Seller says scan this QR to receive your refund. The app shows a collect request and asks for UPI PIN to complete it.",
    trapLine: "A refund or prize should not need your UPI PIN.",
    redFlags: [
      "They say money is coming to you, but the app is asking you to approve something.",
      "They use refund, prize, or payment-received language to confuse you.",
      "You may actually be sending money instead of receiving it.",
    ],
    actions: [
      "Read the screen carefully inside your own UPI app.",
      "Remember: you do not enter UPI PIN to receive money.",
      "If you are unsure, stop and ask someone you trust before approving.",
    ],
    quickRule: "No UPI PIN to receive money.",
    recoveryLine: "If you approved the request by mistake, call 1930 and your bank immediately.",
    trustRoute: "Check the payee and request type inside your own UPI app before you approve.",
  },
  {
    id: "share_otp",
    label: "Share OTP / PIN",
    askLine: "They are asking you for OTP, UPI PIN, card details, or bank login.",
    sample:
      "Sir, I am calling from bank support. Please tell me the OTP and UPI PIN so I can unblock your account right now.",
    trapLine: "Real support never needs your OTP or UPI PIN.",
    redFlags: [
      "They say they are from the bank, app, customer care, or police and need secret details.",
      "They act helpful but ask for exactly the details that let them take money.",
      "The pressure is designed to make you speak before you think.",
    ],
    actions: [
      "Do not share OTP, UPI PIN, CVV, password, or Aadhaar details.",
      "Cut the call or stop replying.",
      "If you already shared details, change passwords and call your bank and 1930 immediately.",
    ],
    quickRule: "Never share OTP or UPI PIN.",
    recoveryLine: "If details were shared, act immediately before more money moves.",
    trustRoute: "Use only the official support route inside the app or on the official website.",
  },
  {
    id: "install_app",
    label: "Install this app",
    askLine: "They are asking you to install an app or APK.",
    sample:
      "Install this support app so we can help you complete KYC and process your refund. Please install QuickSupport now and keep the call open.",
    trapLine: "Unknown apps are often the real attack, not the message itself.",
    redFlags: [
      "They ask for a remote app, APK file, screen sharing, or accessibility permission.",
      "They say the app is needed for refund, KYC, support, or bank verification.",
      "Once installed, the app can expose messages, OTPs, and your screen.",
    ],
    actions: [
      "Do not install the app or APK.",
      "Do not allow screen sharing, accessibility, or unknown device control.",
      "If you already installed it, disconnect, uninstall, and call your bank if payments are involved.",
    ],
    quickRule: "Do not install apps because an unknown caller asked you to.",
    recoveryLine: "If the app is already installed and money is involved, move fast.",
    trustRoute: "Use Play Store or App Store only, and only when you already trust the company.",
  },
  {
    id: "trust_screenshot",
    label: "Trust this screenshot",
    askLine: "They are asking you to trust a screenshot as proof of payment.",
    sample:
      "Customer says payment is done and shows a screenshot with SUCCESSFUL written on it, but your UPI app does not show the money yet. They want to leave with the goods now.",
    trapLine: "Screenshots are easy to fake. Your own app is the source of truth.",
    redFlags: [
      "The payment is only visible on their phone, not in your app or bank account.",
      "They want goods, delivery, or service before the credit appears for you.",
      "The scam depends on hurry and social pressure at the counter or doorstep.",
    ],
    actions: [
      "Check your own bank or UPI app before handing over goods.",
      "Wait for real credit, not just a screenshot, sound, or SMS.",
      "Use the merchant lane if you want a fast second opinion on payment proof.",
    ],
    quickRule: "Trust your app, not their screenshot.",
    recoveryLine: "Do not hand over goods until you see the money in your own app.",
    trustRoute: "Your own bank or UPI app is the authority, not the customer's screen.",
  },
  {
    id: "keep_secret",
    label: "Keep this secret",
    askLine: "They are telling you not to tell family or not to cut the call.",
    sample:
      "Caller says they are from police and your Aadhaar is linked to a criminal case. They tell you not to disconnect, not to tell family, and to transfer money for verification.",
    trapLine: "Secrecy is a scam tactic. It isolates you before you can verify.",
    redFlags: [
      "They tell you not to disconnect and not to tell family.",
      "They use fear, legal threats, and secrecy instead of clear proof.",
      "They ask for money, account access, or personal details to 'solve' the problem.",
    ],
    actions: [
      "Cut the call. Then call a family member or official number you already trust.",
      "Do not transfer money to 'clear' your name or avoid arrest.",
      "If money or account access was shared, call 1930 and your bank immediately.",
    ],
    quickRule: "Cut the call and verify from a trusted number.",
    recoveryLine: "If money or access was shared, move to recovery now. Do not argue with the scammer.",
    trustRoute: "Use only official numbers you already know, never the number given in the threatening call.",
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
    title: "For parents and family",
    body: "Good when someone at home asks, “Is this real?” Show common scams in plain language first.",
    actionLabel: "Open family view",
    action: "family",
    icon: <Users size={18} />,
  },
  {
    title: "Money already lost",
    body: "Do not waste time. Start with 1930, your bank, and the official complaint steps.",
    actionLabel: "Open help now",
    action: "panic",
    icon: <Phone size={18} />,
  },
  {
    title: "For shops and delivery",
    body: "Check payment screenshots before handing over goods, stock, delivery, or service.",
    actionLabel: "Open merchant lane",
    action: "merchant",
    icon: <Building2 size={18} />,
  },
];

const OFFICIAL_RULES = [
  {
    title: "Never share OTP or UPI PIN",
    body: "No real bank, app, customer care, or police officer will ask for it.",
  },
  {
    title: "You do not enter UPI PIN to receive money",
    body: "If a refund, prize, or collect request asks for PIN, stop and check.",
  },
  {
    title: "Use official support only",
    body: "Do not trust helpline numbers, links, or APKs sent inside a suspicious message.",
  },
  {
    title: "If money is gone, call 1930 first",
    body: "Then report on cybercrime.gov.in and call your bank using the official number.",
  },
];

const EVERYDAY_CASES = [
  { icon: <MessageCircle size={14} />, label: "WhatsApp forward" },
  { icon: <Link2 size={14} />, label: "Bank SMS or link" },
  { icon: <QrCode size={14} />, label: "QR request" },
  { icon: <Phone size={14} />, label: "Courier or police call" },
  { icon: <ShieldCheck size={14} />, label: "Job or loan offer" },
  { icon: <Upload size={14} />, label: "Payment screenshot" },
];

export default function PressureProofHome({ onNavigate, onStartScan }: PressureProofHomeProps) {
  const [activeId, setActiveId] = useState(ACTION_PROMPTS[0].id);
  const [draft, setDraft] = useState(ACTION_PROMPTS[0].sample);

  const activePrompt = ACTION_PROMPTS.find((entry) => entry.id === activeId) || ACTION_PROMPTS[0];

  const selectPrompt = (entry: ActionPrompt) => {
    setActiveId(entry.id);
    setDraft(entry.sample);
  };

  const runLiveCheck = () => {
    const nextInput = draft.trim() || activePrompt.sample;
    onStartScan(nextInput);
  };

  return (
    <div className="pp-home">
      <section className="pp-hero-shell">
        <div className="pp-hero-copy">
          <div className="pp-kicker">
            <ShieldCheck size={14} />
            Thoda dhyan se
          </div>
          <h1>
            Before you pay, click, scan, or share,
            <span>check it here first.</span>
          </h1>
          <p className="pp-lede">
            Paste a WhatsApp message, bank SMS, QR request, suspicious link, payment screenshot note, or fake call
            summary. Chetana tells you what looks wrong and what to do next in simple language.
          </p>
          <p className="pp-helper-line">Useful for you, your parents, your family group, and your shop.</p>
          <div className="pp-action-row">
            <button className="pp-primary-btn" onClick={runLiveCheck}>
              Check this message
              <ArrowRight size={16} />
            </button>
            <button className="pp-secondary-btn" onClick={() => onNavigate("panic")}>
              Money already gone?
            </button>
          </div>
          <div className="pp-trust-row">
            <span>Free</span>
            <span>No login</span>
            <span>12 Indian languages</span>
            <span>Shows 1930 help</span>
          </div>
          <div className="pp-chip-cloud">
            {EVERYDAY_CASES.map((entry) => (
              <span key={entry.label} className="pp-evidence-chip">
                {entry.icon}
                {entry.label}
              </span>
            ))}
          </div>
        </div>

        <div className="pp-chamber">
          <div className="pp-chamber-header">
            <div>
              <div className="pp-chamber-label">What are they asking you to do?</div>
              <strong>{activePrompt.label}</strong>
            </div>
            <span>{activePrompt.askLine}</span>
          </div>

          <div className="pp-scenario-row">
            {ACTION_PROMPTS.map((entry) => (
              <button
                key={entry.id}
                className={`pp-scenario-chip${entry.id === activePrompt.id ? " active" : ""}`}
                onClick={() => selectPrompt(entry)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="pp-draft-shell">
            <div className="pp-draft-head">
              <div>
                <div className="pp-signal-label">Paste your own message</div>
                <strong>Edit this example or replace it with your own text.</strong>
              </div>
              <button className="pp-text-link" onClick={() => setDraft(activePrompt.sample)}>
                Use example
              </button>
            </div>
            <textarea
              className="pp-draft-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Paste the suspicious message, QR request, payment note, link, or call summary here."
            />
            <div className="pp-draft-actions">
              <button className="pp-primary-btn" onClick={runLiveCheck}>
                Check this message
                <ArrowRight size={16} />
              </button>
              <button className="pp-secondary-btn" onClick={() => onNavigate("merchant")}>
                Check payment screenshot
              </button>
            </div>
          </div>

          <div className="pp-check-grid">
            <div className="pp-check-pill">
              <span>They want you to</span>
              <strong>{activePrompt.label}</strong>
            </div>
            <div className="pp-check-pill">
              <span>Common trap</span>
              <strong>{activePrompt.trapLine}</strong>
            </div>
            <div className="pp-check-pill">
              <span>Best first step</span>
              <strong>{activePrompt.quickRule}</strong>
            </div>
          </div>

          <div className="pp-signal-grid">
            <div className="pp-signal-card pp-signal-card-pressure">
              <div className="pp-signal-label">Why this looks risky</div>
              <h2>{activePrompt.trapLine}</h2>
              <ul>
                {activePrompt.redFlags.map((signal) => (
                  <li key={signal}>{signal}</li>
                ))}
              </ul>
            </div>

            <div className="pp-signal-card pp-signal-card-proof">
              <div className="pp-signal-label">What you should do now</div>
              <h2>{activePrompt.quickRule}</h2>
              <ul>
                {activePrompt.actions.map((signal) => (
                  <li key={signal}>{signal}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="pp-recovery-rail">
            <AlertTriangle size={16} />
            <div>
              <strong>{activePrompt.recoveryLine}</strong>
              <span>{activePrompt.trustRoute}</span>
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
        {OFFICIAL_RULES.map((rule) => (
          <article key={rule.title} className="pp-meta-card">
            <div className="pp-meta-icon">
              <ShieldCheck size={18} />
            </div>
            <strong>{rule.title}</strong>
            <p>{rule.body}</p>
          </article>
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
