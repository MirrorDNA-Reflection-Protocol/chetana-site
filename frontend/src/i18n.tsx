import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Lang = "en" | "hi" | "ta" | "te" | "bn" | "mr" | "kn" | "ml" | "gu";

export const LANG_OPTIONS: { code: Lang; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
  { code: "te", label: "Telugu", native: "తెలుగు" },
  { code: "bn", label: "Bengali", native: "বাংলা" },
  { code: "mr", label: "Marathi", native: "मराठी" },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml", label: "Malayalam", native: "മലയാളം" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી" },
];

const STORAGE_KEY = "chetana_lang";

type UIStrings = {
  nav_check: string;
  nav_shops: string;
  nav_help: string;
  brand_sub: string;
  private_tool: string;
  mode_paste: string;
  mode_paste_title: string;
  mode_paste_desc: string;
  mode_screenshot: string;
  mode_screenshot_title: string;
  mode_screenshot_desc: string;
  mode_qr: string;
  mode_qr_title: string;
  mode_qr_desc: string;
  mode_payment: string;
  mode_payment_title: string;
  mode_payment_desc: string;
  hero_title: string;
  hero_sub: string;
  scanning: string;
  result_safe: string;
  result_caution: string;
  result_danger: string;
  do_not_pay: string;
  verify_source: string;
  share_family: string;
  save_evidence: string;
  report_block: string;
  scan_again: string;
  treat_unclear: string;
  choose_language: string;
};

const en: UIStrings = {
  nav_check: "Check now",
  nav_shops: "For shops",
  nav_help: "Help now",
  brand_sub: "check before you act",
  private_tool: "Private tool",
  mode_paste: "Paste message",
  mode_paste_title: "Paste a message, link, or UPI ID",
  mode_paste_desc: "WhatsApp, SMS, Telegram, email, suspicious link, or payment request.",
  mode_screenshot: "Upload screenshot",
  mode_screenshot_title: "Upload a screenshot",
  mode_screenshot_desc: "If the message is already on-screen, upload it instead of retyping it.",
  mode_qr: "Scan QR",
  mode_qr_title: "Check a QR request",
  mode_qr_desc: "Upload a QR screenshot or paste the payment payload you can read.",
  mode_payment: "Check payment proof",
  mode_payment_title: "Check a payment screenshot",
  mode_payment_desc: "For shopkeepers, delivery staff, and sellers before goods or services change hands.",
  hero_title: "Check before you act",
  hero_sub: "Paste a suspicious message, upload a screenshot, or scan a QR code.",
  scanning: "Scanning...",
  result_safe: "Looks safe",
  result_caution: "Be careful",
  result_danger: "Likely a scam",
  do_not_pay: "Do not pay yet",
  verify_source: "Verify through an official source",
  share_family: "Share with family",
  save_evidence: "Save the evidence",
  report_block: "Report and block",
  scan_again: "Scan again with more context",
  treat_unclear: "Treat it as unclear",
  choose_language: "Language",
};

const hi: UIStrings = {
  nav_check: "अभी जांचें",
  nav_shops: "दुकानों के लिए",
  nav_help: "मदद चाहिए",
  brand_sub: "करने से पहले जांचें",
  private_tool: "प्राइवेट टूल",
  mode_paste: "मैसेज पेस्ट करें",
  mode_paste_title: "मैसेज, लिंक, या UPI ID पेस्ट करें",
  mode_paste_desc: "WhatsApp, SMS, Telegram, ईमेल, संदिग्ध लिंक, या भुगतान अनुरोध।",
  mode_screenshot: "स्क्रीनशॉट अपलोड करें",
  mode_screenshot_title: "स्क्रीनशॉट अपलोड करें",
  mode_screenshot_desc: "अगर मैसेज स्क्रीन पर है, तो दोबारा टाइप करने की बजाय अपलोड करें।",
  mode_qr: "QR स्कैन करें",
  mode_qr_title: "QR रिक्वेस्ट जांचें",
  mode_qr_desc: "QR का स्क्रीनशॉट अपलोड करें या पेमेंट पेलोड पेस्ट करें।",
  mode_payment: "भुगतान प्रमाण जांचें",
  mode_payment_title: "भुगतान स्क्रीनशॉट जांचें",
  mode_payment_desc: "दुकानदारों, डिलीवरी स्टाफ, और विक्रेताओं के लिए — सामान देने से पहले।",
  hero_title: "करने से पहले जांचें",
  hero_sub: "संदिग्ध मैसेज पेस्ट करें, स्क्रीनशॉट अपलोड करें, या QR कोड स्कैन करें।",
  scanning: "जांच हो रही है...",
  result_safe: "सुरक्षित लगता है",
  result_caution: "सावधान रहें",
  result_danger: "शायद धोखा है",
  do_not_pay: "अभी भुगतान न करें",
  verify_source: "असली स्रोत से पुष्टि करें",
  share_family: "परिवार को बताएं",
  save_evidence: "सबूत सेव करें",
  report_block: "रिपोर्ट करें और ब्लॉक करें",
  scan_again: "ज़्यादा जानकारी के साथ दोबारा स्कैन करें",
  treat_unclear: "अनिश्चित मानें",
  choose_language: "भाषा",
};

const translations: Record<string, UIStrings> = { en, hi };

// ── Context ──

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: keyof UIStrings) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: "en",
  setLang: () => {},
  t: (key) => en[key],
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LANG_OPTIONS.some((o) => o.code === stored)) return stored as Lang;
    const browser = navigator.language.slice(0, 2);
    if (LANG_OPTIONS.some((o) => o.code === browser)) return browser as Lang;
    return "en";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (l: Lang) => setLangState(l);
  const t = (key: keyof UIStrings): string => {
    const strings = translations[lang];
    if (strings) return strings[key];
    return en[key];
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export type { UIStrings };
