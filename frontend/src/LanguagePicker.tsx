import { useState, useRef, useEffect } from "react";
import { useI18n, LANG_OPTIONS } from "./i18n";

export default function LanguagePicker() {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = LANG_OPTIONS.find((o) => o.code === lang);

  return (
    <div className="lang-picker" ref={ref}>
      <button
        className="lang-picker-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("choose_language")}
      >
        {current?.native || "English"}
        <span className="lang-picker-caret">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="lang-picker-dropdown">
          {LANG_OPTIONS.map((opt) => (
            <button
              key={opt.code}
              className={`lang-picker-option${opt.code === lang ? " active" : ""}`}
              onClick={() => { setLang(opt.code); setOpen(false); }}
            >
              <span className="lang-picker-native">{opt.native}</span>
              <span className="lang-picker-label">{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
