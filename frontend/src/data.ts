import { ThreatEntry, WeatherSignal, GraphNode, GraphEdge } from "./types";

export const threats: ThreatEntry[] = [
  {
    id: "pay-proof-001",
    title: "Fake UPI payment proof",
    surface: "payment trust",
    status: "active",
    summary: "Doctored screenshots claiming successful payment before goods are handed over.",
    firstSeen: "2025-11-03",
    lastSeen: "2026-03-09",
    languages: ["English", "Hindi", "Marathi"],
    redFlags: ["cropped bank UI", "no reference match", "urgency to release goods"],
    actions: ["do not hand over goods", "verify in bank app", "warn staff"]
  },
  {
    id: "qr-002",
    title: "QR pull-payment trap",
    surface: "payment trust",
    status: "rising",
    summary: "Victim is told scanning a QR will receive money, but it actually authorizes payment.",
    firstSeen: "2025-08-10",
    lastSeen: "2026-03-09",
    languages: ["English", "Hindi", "Gujarati", "Tamil"],
    redFlags: ["receive-money claim", "customer support impersonation", "scan pressure"],
    actions: ["never scan to receive", "verify caller", "share family alert"]
  },
  {
    id: "courier-003",
    title: "Courier redelivery scam",
    surface: "link trust",
    status: "active",
    summary: "Delivery-themed phishing with payment/retry links and fake support pages.",
    firstSeen: "2025-06-14",
    lastSeen: "2026-03-09",
    languages: ["English", "Hindi"],
    redFlags: ["tiny fee request", "shortened links", "delivery urgency"],
    actions: ["do not click", "open official app directly", "report message"]
  },
  {
    id: "voice-004",
    title: "Relative-in-distress voice deepfake",
    surface: "identity trust",
    status: "watch",
    summary: "Synthetic or imitated voice calls asking for urgent transfers.",
    firstSeen: "2025-12-01",
    lastSeen: "2026-03-07",
    languages: ["English", "Hindi"],
    redFlags: ["panic tone", "urgent transfer", "new number", "do not tell anyone"],
    actions: ["call known number back", "do not transfer", "verify with family"]
  },
  {
    id: "kyc-005",
    title: "KYC update fraud",
    surface: "identity trust",
    status: "active",
    summary: "SMS/WhatsApp claiming bank KYC is expiring. Links to fake portal that harvests credentials.",
    firstSeen: "2024-09-15",
    lastSeen: "2026-03-09",
    languages: ["Hindi", "English", "Bengali", "Telugu"],
    redFlags: ["urgency ('24 hours')", "link to non-.gov.in domain", "asks for OTP/Aadhaar/PAN"],
    actions: ["banks never ask for KYC via SMS links", "visit bank branch directly", "call 1930 if data shared"]
  },
  {
    id: "arrest-006",
    title: "Digital arrest scam",
    surface: "identity trust",
    status: "rising",
    summary: "Video call from 'CBI/police' claiming warrant exists. Demands money to 'clear charges'.",
    firstSeen: "2025-06-20",
    lastSeen: "2026-03-09",
    languages: ["Hindi", "English"],
    redFlags: ["video call from 'officer'", "demand for immediate payment", "threat of arrest"],
    actions: ["police never call to demand money", "hang up immediately", "report at cybercrime.gov.in"]
  },
  {
    id: "task-007",
    title: "Task-based earning scam",
    surface: "payment trust",
    status: "active",
    summary: "Telegram/WhatsApp group offering money for simple tasks. Initial payouts are real, then large 'investment' is demanded.",
    firstSeen: "2025-03-01",
    lastSeen: "2026-03-09",
    languages: ["Hindi", "English", "Tamil", "Telugu"],
    redFlags: ["too good to be true returns", "'investment' after initial tasks", "crypto/UPI deposits required"],
    actions: ["no legitimate job requires you to invest", "stop immediately", "save screenshots as evidence"]
  },
  {
    id: "job-009",
    title: "Fake job interview fee scam",
    surface: "payment trust",
    status: "rising",
    summary: "Fraudulent recruiter demands payment for 'registration', 'training materials', 'background check', or 'interview slot booking'. Often impersonates TCS, Infosys, Wipro, or government PSUs.",
    firstSeen: "2024-06-01",
    lastSeen: "2026-03-09",
    languages: ["Hindi", "English", "Telugu", "Tamil", "Kannada"],
    redFlags: ["payment demanded before interview", "offer letter before interview", "WhatsApp/Telegram-only communication", "generic company email (gmail/yahoo)", "unrealistic salary for entry-level"],
    actions: ["no legitimate employer charges for interviews", "verify on official company careers page", "check recruiter on LinkedIn", "report at cybercrime.gov.in"]
  },
  {
    id: "lottery-008",
    title: "KBC / lottery scam",
    surface: "payment trust",
    status: "active",
    summary: "WhatsApp message claiming lottery win. Demands 'processing fee' or 'tax' payment.",
    firstSeen: "2023-01-10",
    lastSeen: "2026-03-09",
    languages: ["Hindi", "English", "Bengali"],
    redFlags: ["you didn't enter any lottery", "processing fee demanded", "WhatsApp forward chain"],
    actions: ["KBC never contacts winners via WhatsApp", "never pay to claim a prize", "block and report"]
  }
];

export const weather: WeatherSignal[] = [
  { id: "w1", label: "UPI payment fraud", pressure: 86, delta: "+12%", tone: "red" },
  { id: "w2", label: "Courier phishing", pressure: 62, delta: "+4%", tone: "amber" },
  { id: "w3", label: "Bank impersonation", pressure: 73, delta: "+8%", tone: "red" },
  { id: "w4", label: "QR traps", pressure: 58, delta: "+3%", tone: "amber" },
  { id: "w5", label: "Fake news / media panic", pressure: 41, delta: "-2%", tone: "violet" },
  { id: "w6", label: "Digital arrest", pressure: 54, delta: "+18%", tone: "amber" },
  { id: "w7", label: "KYC update fraud", pressure: 68, delta: "+6%", tone: "red" },
  { id: "w8", label: "Voice deepfake", pressure: 41, delta: "+22%", tone: "amber" },
  { id: "w9", label: "Task / investment scam", pressure: 77, delta: "+15%", tone: "red" },
  { id: "w10", label: "Fake job / interview fee", pressure: 64, delta: "+11%", tone: "amber" }
];

export const graphNodes: GraphNode[] = [
  { data: { id: "chetana", label: "Chetana", kind: "core", score: 1 } },
  { data: { id: "campaign-a", label: "UPI Scam Cluster", kind: "campaign", score: 0.92 } },
  { data: { id: "phone-a", label: "+91 98765 43210", kind: "phone", score: 0.81 } },
  { data: { id: "url-a", label: "pay-verify-now[.]xyz", kind: "url", score: 0.88 } },
  { data: { id: "merchant", label: "Merchant Mode", kind: "surface", score: 0.7 } },
  { data: { id: "family", label: "Family Shield", kind: "surface", score: 0.74 } },
  { data: { id: "nexus", label: "Chetana Nexus", kind: "enterprise", score: 0.9 } },
  { data: { id: "weather", label: "Scam Weather", kind: "intel", score: 0.76 } },
  { data: { id: "campaign-b", label: "KYC Fraud Ring", kind: "campaign", score: 0.85 } },
  { data: { id: "campaign-c", label: "Digital Arrest", kind: "campaign", score: 0.78 } },
  { data: { id: "url-b", label: "sbi-kyc-update[.]top", kind: "url", score: 0.91 } },
  { data: { id: "phone-b", label: "+91 14012 XXXXX", kind: "phone", score: 0.72 } },
  { data: { id: "atlas", label: "Scam Atlas", kind: "surface", score: 0.81 } },
  { data: { id: "campaign-d", label: "Fake Job Ring", kind: "campaign", score: 0.74 } }
];

export const graphEdges: GraphEdge[] = [
  { data: { id: "e1", source: "chetana", target: "campaign-a", label: "tracks", weight: 0.9 } },
  { data: { id: "e2", source: "campaign-a", target: "phone-a", label: "uses", weight: 0.7 } },
  { data: { id: "e3", source: "campaign-a", target: "url-a", label: "hosts", weight: 0.84 } },
  { data: { id: "e4", source: "chetana", target: "merchant", label: "protects", weight: 0.6 } },
  { data: { id: "e5", source: "chetana", target: "family", label: "alerts", weight: 0.75 } },
  { data: { id: "e6", source: "chetana", target: "nexus", label: "powers", weight: 0.87 } },
  { data: { id: "e7", source: "chetana", target: "weather", label: "publishes", weight: 0.69 } },
  { data: { id: "e8", source: "chetana", target: "campaign-b", label: "tracks", weight: 0.85 } },
  { data: { id: "e9", source: "chetana", target: "campaign-c", label: "tracks", weight: 0.78 } },
  { data: { id: "e10", source: "campaign-b", target: "url-b", label: "hosts", weight: 0.91 } },
  { data: { id: "e11", source: "campaign-c", target: "phone-b", label: "uses", weight: 0.72 } },
  { data: { id: "e12", source: "chetana", target: "atlas", label: "curates", weight: 0.81 } },
  { data: { id: "e13", source: "campaign-a", target: "campaign-b", label: "overlaps", weight: 0.45 } },
  { data: { id: "e14", source: "chetana", target: "campaign-d", label: "tracks", weight: 0.74 } }
];

export const tuiLines = [
  "[mirror] booting trust shell...",
  "[weather] UPI scam pressure elevated",
  "[atlas] threat library refreshed: 4 visible campaigns",
  "[witness] payment-proof lane enabled",
  "[nexus] analyst replay preview ready",
  "[family] share-safe warning cards compiled",
  "[merchant] fake payment screenshot advisory updated",
  "[mirrorgraph] living visual synced"
];
