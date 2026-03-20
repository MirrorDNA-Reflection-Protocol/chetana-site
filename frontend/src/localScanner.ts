/**
 * Local-first scanner: browser-side OCR + pattern matching.
 * No server needed for basic scam detection.
 * Server used only for deep/ambiguous scans.
 *
 * Tesseract.js is lazy-loaded to avoid ~5MB upfront bundle cost.
 * Hindi/Hinglish patterns included for Indian scam coverage.
 */

/* ── Client-side scam pattern matching ─────────────────────── */

interface LocalScanResult {
  score: number;
  verdict: "HIGH" | "MEDIUM" | "LOW_RISK";
  signals: string[];
  needsDeepScan: boolean;
  extractedText?: string;
}

// High-confidence scam patterns — English (score 70+)
const HIGH_PATTERNS: { pattern: RegExp; signal: string; weight: number }[] = [
  { pattern: /your\s+(account|bank|kyc|pan|aadhaar).{0,30}(block|suspend|deactivat|expir|clos)/i, signal: "Account threat / KYC fraud pattern", weight: 25 },
  { pattern: /digital\s+arrest/i, signal: "Digital arrest scam pattern", weight: 30 },
  { pattern: /(cbi|police|customs|narcotics|income\s*tax).{0,30}(warrant|arrest|case|summon)/i, signal: "Government impersonation", weight: 30 },
  { pattern: /won\s+(a\s+)?prize|lottery\s+winner|congratulations.{0,20}(won|winner|selected)/i, signal: "Lottery / prize scam", weight: 25 },
  { pattern: /send\s+(money|payment|transfer).{0,30}(immediately|urgent|now|within\s+\d)/i, signal: "Urgent payment demand", weight: 20 },
  { pattern: /share\s+(your\s+)?(otp|pin|password|cvv|mpin)/i, signal: "OTP / credential harvesting", weight: 30 },
  { pattern: /click\s+(here|this\s+link|below).{0,30}(verify|update|confirm|secure)/i, signal: "Phishing link pattern", weight: 20 },
  { pattern: /task.{0,20}(earn|income|money|payment).{0,30}(daily|weekly|guaranteed)/i, signal: "Task-based earning scam", weight: 25 },
  { pattern: /invest.{0,20}(guaranteed|assured|fixed).{0,20}(return|profit|income)/i, signal: "Investment scam — guaranteed returns", weight: 25 },
  { pattern: /refund.{0,30}(process|initiat|click|link)/i, signal: "Fake refund scam", weight: 20 },
  { pattern: /\bwhatsapp\b.{0,15}(expire|update|verify|migrate)/i, signal: "WhatsApp account hijack attempt", weight: 20 },
];

// High-confidence scam patterns — Hindi / Hinglish
const HIGH_PATTERNS_HI: { pattern: RegExp; signal: string; weight: number }[] = [
  // KYC / account threats (Hinglish)
  { pattern: /aapka\s+(account|khata|bank).{0,30}(band|block|suspend|expire|band ho)/i, signal: "Account threat (Hindi)", weight: 25 },
  { pattern: /kyc\s+(update|verify|karein|karna|karo|kar\s*lo)/i, signal: "KYC update fraud (Hindi)", weight: 25 },
  // Digital arrest (Hindi)
  { pattern: /\b(giraftar|gireftaar|arrest)\b.{0,20}(warrant|hoga|ho\s*jayega|karenge)/i, signal: "Digital arrest threat (Hindi)", weight: 30 },
  { pattern: /\b(polic[ei]|cbi|customs)\b.{0,20}(case|maamla|karvaai)/i, signal: "Government impersonation (Hindi)", weight: 30 },
  // OTP / credential harvesting (Hindi)
  { pattern: /(otp|pin|password|mpin).{0,20}(bhej|batao|bataye|share\s*kar|de\s*do|dijiye|bhejiye)/i, signal: "OTP harvesting (Hindi)", weight: 30 },
  { pattern: /(bhej|batao|share\s*kar|de\s*do).{0,20}(otp|pin|password|mpin)/i, signal: "OTP harvesting (Hindi)", weight: 30 },
  // Lottery / prize (Hindi)
  { pattern: /(jeet|jeeta|jeete|mila).{0,20}(prize|inaam|lottery|lakhon|crore)/i, signal: "Lottery / prize scam (Hindi)", weight: 25 },
  { pattern: /(lakhon|crore|karod).{0,20}(jeet|mila|milega|jeeta)/i, signal: "Lottery / prize scam (Hindi)", weight: 25 },
  // Payment pressure (Hindi)
  { pattern: /(turant|abhi|jaldi|fauran).{0,30}(paisa|payment|bhej|transfer|kar\s*do)/i, signal: "Urgent payment demand (Hindi)", weight: 20 },
  { pattern: /(paisa|payment|amount).{0,30}(turant|abhi|jaldi|fauran)/i, signal: "Urgent payment demand (Hindi)", weight: 20 },
  // Task scam (Hinglish)
  { pattern: /(task|kaam).{0,20}(earn|kamai|paisa|income|roz|daily)/i, signal: "Task-based earning scam (Hindi)", weight: 25 },
  // Investment scam (Hindi)
  { pattern: /(invest|nivesh).{0,20}(guaranteed|pakka|fixed|assured).{0,20}(return|munafa|profit|kamai)/i, signal: "Investment scam (Hindi)", weight: 25 },
  // Secrecy (Hindi)
  { pattern: /(kisi\s*ko|kisi\s*se).{0,20}(mat\s*batao|mat\s*bolo|na\s*bataye|nahi\s*batana)/i, signal: "Secrecy pressure (Hindi)", weight: 15 },
  // Link click pressure (Hinglish)
  { pattern: /(link|yahan|niche).{0,20}(click|tap|daba|karo|karein|kijiye)/i, signal: "Phishing link pattern (Hindi)", weight: 20 },
  // Refund scam (Hinglish)
  { pattern: /refund.{0,20}(milega|hoga|process|kar\s*rahe|aa\s*raha)/i, signal: "Fake refund scam (Hindi)", weight: 20 },
];

// Medium-confidence patterns — English (score 40-69)
const MEDIUM_PATTERNS: { pattern: RegExp; signal: string; weight: number }[] = [
  { pattern: /(urgent|immediately|within\s+\d+\s*(hour|minute|hr|min))/i, signal: "Urgency language detected", weight: 12 },
  { pattern: /do\s+not\s+(tell|inform|share).{0,20}(anyone|family|police)/i, signal: "Secrecy pressure", weight: 15 },
  { pattern: /\b(work\s+from\s+home|part\s*time\s+job|earn\s+from\s+home)\b/i, signal: "Suspicious job offer", weight: 10 },
  { pattern: /\b(processing\s+fee|registration\s+fee|advance\s+payment)\b/i, signal: "Upfront fee demanded", weight: 15 },
  { pattern: /customer\s*(care|support|service).{0,20}\+?91\s*\d/i, signal: "Fake customer care number", weight: 12 },
  { pattern: /scan\s+(this\s+)?(qr|code).{0,20}(receive|get|claim)/i, signal: "QR code payment trap", weight: 15 },
  { pattern: /\b(bit\.ly|tinyurl|short\.link|is\.gd|t\.co)\b/i, signal: "Shortened URL (often used in phishing)", weight: 10 },
];

// Medium-confidence patterns — Hindi / Hinglish
const MEDIUM_PATTERNS_HI: { pattern: RegExp; signal: string; weight: number }[] = [
  { pattern: /\b(ghar\s*baithe|part\s*time|roz\s*kama[oy])\b/i, signal: "Suspicious job offer (Hindi)", weight: 10 },
  { pattern: /\b(registration\s*fee|processing\s*fee|advance\s*fee|pehle\s*paisa)\b/i, signal: "Upfront fee demanded (Hindi)", weight: 15 },
  { pattern: /qr\s*(code)?.{0,20}(scan\s*kar|karo|karein).{0,20}(milega|receive|paisa)/i, signal: "QR code payment trap (Hindi)", weight: 15 },
  { pattern: /customer\s*(care|seva).{0,20}\+?91\s*\d/i, signal: "Fake customer care (Hindi)", weight: 12 },
  { pattern: /\b(jaldi|turant|abhi|fauran|tatkaal)\b/i, signal: "Urgency language (Hindi)", weight: 12 },
];

// Suspicious URL patterns
const URL_PATTERNS: { pattern: RegExp; signal: string; weight: number }[] = [
  { pattern: /https?:\/\/[^\s]*\.(xyz|top|buzz|club|icu|tk|ml|ga|cf|gq)\b/i, signal: "Suspicious domain TLD", weight: 15 },
  { pattern: /https?:\/\/[^\s]*(sbi|hdfc|icici|axis|paytm|phonepe|gpay)[^\s]*\.(com|in|org)\b(?!.*\.(sbi|hdfc|icici|axis)\.)/i, signal: "Possible bank impersonation URL", weight: 20 },
  { pattern: /https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i, signal: "Raw IP address URL (suspicious)", weight: 12 },
];

// WhatsApp forward indicators (OCR from screenshots)
const FORWARD_PATTERNS: { pattern: RegExp; signal: string; weight: number }[] = [
  { pattern: /forwarded many times/i, signal: "WhatsApp: forwarded many times (viral chain)", weight: 15 },
  { pattern: /^forwarded$/im, signal: "WhatsApp: forwarded message", weight: 8 },
];

// Fake government scheme patterns
const GOVT_SCHEME_PATTERNS: { pattern: RegExp; signal: string; weight: number }[] = [
  { pattern: /pm.?kisan.{0,30}(apply|register|click|link|verify|Rs|₹|\d{4,})/i, signal: "Possible fake PM-KISAN scheme message", weight: 20 },
  { pattern: /ayushman\s*bharat.{0,30}(apply|register|click|card|download)/i, signal: "Possible fake Ayushman Bharat message", weight: 20 },
  { pattern: /pm\s*awas.{0,30}(apply|register|click|link|subsidy)/i, signal: "Possible fake PM Awas Yojana message", weight: 20 },
  { pattern: /ration\s*card.{0,30}(update|link|click|download|apply)/i, signal: "Possible fake ration card scheme", weight: 15 },
  { pattern: /free\s*(laptop|mobile|smartphone|tablet).{0,30}(govern|sarkar|yojana|scheme|apply)/i, signal: "Fake free device scheme", weight: 25 },
  { pattern: /sukanya\s*samriddhi.{0,20}(click|apply|register|link)/i, signal: "Possible fake Sukanya Samriddhi message", weight: 20 },
  { pattern: /jan\s*dhan.{0,20}(click|apply|bonus|credit|Rs|₹)/i, signal: "Possible fake Jan Dhan message", weight: 20 },
  { pattern: /(sarkar|government|sarkari).{0,30}(free|muft|scheme|yojana).{0,30}(click|apply|register|link)/i, signal: "Fake government scheme pattern", weight: 20 },
];

// Known safe patterns (reduce score)
const SAFE_PATTERNS: RegExp[] = [
  /^https?:\/\/(www\.)?(google|youtube|facebook|instagram|amazon|flipkart|gov)\.(com|in|co\.in)/i,
  /\b(good morning|happy birthday|happy diwali|happy holi|jai hind)\b/i,
];

/**
 * Time-of-day urgency boost.
 * Real banks/govts don't send urgent messages at night.
 * Scammers often target 10pm-6am when people are tired and panicked.
 */
function getTimeBoost(): number {
  const hour = new Date().getHours();
  if (hour >= 22 || hour < 6) return 10; // late night — higher suspicion
  return 0;
}

export function localPatternScan(text: string): LocalScanResult {
  const signals: string[] = [];
  let score = 0;

  // Check safe patterns first
  const isSafe = SAFE_PATTERNS.some(p => p.test(text));
  if (isSafe && text.length < 100) {
    return { score: 5, verdict: "LOW_RISK", signals: [], needsDeepScan: false };
  }

  // All pattern sets: English + Hindi/Hinglish
  const allHigh = [...HIGH_PATTERNS, ...HIGH_PATTERNS_HI];
  const allMedium = [...MEDIUM_PATTERNS, ...MEDIUM_PATTERNS_HI];

  // High-confidence patterns
  for (const { pattern, signal, weight } of allHigh) {
    if (pattern.test(text)) {
      score += weight;
      signals.push(signal);
    }
  }

  // Medium patterns
  for (const { pattern, signal, weight } of allMedium) {
    if (pattern.test(text)) {
      score += weight;
      signals.push(signal);
    }
  }

  // URL patterns
  for (const { pattern, signal, weight } of URL_PATTERNS) {
    if (pattern.test(text)) {
      score += weight;
      signals.push(signal);
    }
  }

  // WhatsApp forward detection (from OCR'd screenshots)
  for (const { pattern, signal, weight } of FORWARD_PATTERNS) {
    if (pattern.test(text)) {
      score += weight;
      signals.push(signal);
    }
  }

  // Government scheme scam patterns
  for (const { pattern, signal, weight } of GOVT_SCHEME_PATTERNS) {
    if (pattern.test(text)) {
      score += weight;
      signals.push(signal);
    }
  }

  // Time-of-day boost: urgent messages at night are more suspicious
  const timeBoost = getTimeBoost();
  if (timeBoost > 0 && score >= 20) {
    score += timeBoost;
    signals.push("Received at unusual hour — real institutions don't send urgent messages at night");
  }

  // Cap at 100
  score = Math.min(score, 100);

  const verdict = score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW_RISK";

  // Need deep scan if: ambiguous (30-69), or no patterns matched but text is long enough to be suspicious
  const needsDeepScan = (score >= 30 && score < 70) || (score < 30 && text.length > 50);

  return { score, verdict, signals, needsDeepScan };
}

/* ── Browser-side OCR (lazy-loaded) ────────────────────────── */

let worker: any = null;
let tesseractModule: typeof import("tesseract.js") | null = null;

async function getTesseract() {
  if (!tesseractModule) {
    tesseractModule = await import("tesseract.js");
  }
  return tesseractModule;
}

async function getWorker() {
  if (!worker) {
    const Tesseract = await getTesseract();
    worker = await Tesseract.createWorker("eng+hin", undefined, {
      logger: () => {},
    });
  }
  return worker;
}

/**
 * Preprocess image for better OCR on dark-mode screenshots.
 * Detects dark backgrounds (WhatsApp dark mode, etc.) and inverts
 * to white-on-black → black-on-white for higher Tesseract accuracy.
 */
async function preprocessForOCR(imageFile: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(imageFile);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      // Sample corners + center to detect dark background
      const samples = [
        ctx.getImageData(5, 5, 1, 1).data,
        ctx.getImageData(img.width - 5, 5, 1, 1).data,
        ctx.getImageData(5, img.height - 5, 1, 1).data,
        ctx.getImageData(img.width - 5, img.height - 5, 1, 1).data,
        ctx.getImageData(Math.floor(img.width / 2), Math.floor(img.height / 2), 1, 1).data,
      ];
      const avgBrightness = samples.reduce((sum, px) => sum + (px[0] + px[1] + px[2]) / 3, 0) / samples.length;

      // If average brightness < 80, it's likely dark mode — invert
      if (avgBrightness < 80) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imageData.data;
        for (let i = 0; i < d.length; i += 4) {
          d[i] = 255 - d[i];
          d[i + 1] = 255 - d[i + 1];
          d[i + 2] = 255 - d[i + 2];
        }
        ctx.putImageData(imageData, 0, 0);
      }

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        resolve(blob || imageFile);
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(imageFile);
    };
    img.src = url;
  });
}

export async function browserOCR(imageFile: File): Promise<string> {
  const w = await getWorker();
  const preprocessed = await preprocessForOCR(imageFile);
  const { data: { text } } = await w.recognize(preprocessed);
  return text.trim();
}

/* ── Combined local-first scan for screenshots ────────────── */

export async function localScreenshotScan(
  imageFile: File,
  onProgress?: (stage: "ocr" | "pattern" | "done") => void
): Promise<LocalScanResult> {
  onProgress?.("ocr");
  const text = await browserOCR(imageFile);

  if (!text || text.length < 5) {
    return {
      score: 0,
      verdict: "LOW_RISK",
      signals: ["No text found in image — may need visual analysis"],
      needsDeepScan: true,
      extractedText: "",
    };
  }

  onProgress?.("pattern");
  const result = localPatternScan(text);
  onProgress?.("done");

  return { ...result, extractedText: text };
}

/* ── Browser-side audio transcription (Transformers.js Whisper) ── */

let whisperPipeline: any = null;

/**
 * Lazy-load Transformers.js and Whisper tiny model.
 * ~40MB download on first use, cached in browser IndexedDB after that.
 * Works fully offline after first download.
 */
async function getWhisperPipeline() {
  if (!whisperPipeline) {
    const { pipeline } = await import("@huggingface/transformers");
    whisperPipeline = await pipeline(
      "automatic-speech-recognition",
      "onnx-community/whisper-tiny",
      { dtype: "q4" },
    );
  }
  return whisperPipeline;
}

/**
 * Transcribe audio file in browser using Whisper tiny.
 * Returns transcript text. Falls back to empty string on error.
 */
export async function browserTranscribe(audioFile: File): Promise<string> {
  try {
    const pipe = await getWhisperPipeline();
    const arrayBuffer = await audioFile.arrayBuffer();
    const result = await pipe(new Float32Array(arrayBuffer));
    return (result?.text || "").trim();
  } catch {
    return "";
  }
}

/**
 * Local-first audio scan: transcribe + pattern match.
 * Works offline after first Whisper model download.
 */
export async function localAudioScan(
  audioFile: File,
  onProgress?: (stage: "transcribe" | "pattern" | "done") => void
): Promise<LocalScanResult> {
  onProgress?.("transcribe");
  const text = await browserTranscribe(audioFile);

  if (!text || text.length < 10) {
    return {
      score: 0,
      verdict: "LOW_RISK",
      signals: ["Could not transcribe audio — try uploading a clearer recording"],
      needsDeepScan: true,
      extractedText: "",
    };
  }

  onProgress?.("pattern");
  const result = localPatternScan(text);
  onProgress?.("done");

  return { ...result, extractedText: text };
}
