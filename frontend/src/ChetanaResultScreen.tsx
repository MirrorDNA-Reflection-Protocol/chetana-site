export type RiskLevel = "high" | "medium" | "low";

export type ResultReason =
  | "Urgency or pressure language"
  | "Payment or account action request"
  | "Suspicious link or unknown sender pattern"
  | "Request for OTP, PIN, KYC, or personal details"
  | "Emotional manipulation or impersonation cues"
  | string;

export type ChetanaResultProps = {
  risk: RiskLevel;
  summary?: string;
  nextStep?: string;
  reasons: ResultReason[];
  doNotDo?: string[];
  verificationRoute?: string;
  contextChips?: string[];
  onEmergencyHelp?: () => void;
  onCheckAnother?: () => void;
  onToggleBreakdown?: () => void;
  showFullBreakdown?: boolean;
};

const RISK_STYLES: Record<
  RiskLevel,
  {
    title: string;
    intro: string;
    defaultNextStep: string;
    badge: React.CSSProperties;
    panel: React.CSSProperties;
    dot: React.CSSProperties;
  }
> = {
  high: {
    title: "Likely scam",
    intro:
      "This message shows patterns commonly used in fraud. Do not click links, share OTPs, send money, or continue the conversation until verified.",
    defaultNextStep:
      "Do not open the link. Verify through the company's official website or app, not the contact details in the message.",
    badge: { background: "var(--danger-light)", color: "var(--danger)", border: "1px solid rgba(196,122,122,0.25)" },
    panel: { border: "1px solid rgba(196,122,122,0.25)", background: "var(--danger-light)" },
    dot: { background: "var(--danger)" },
  },
  medium: {
    title: "Needs verification",
    intro:
      "This message has unclear or suspicious elements. Pause here and verify the sender through an independent route.",
    defaultNextStep:
      "Do not act from this message alone. Contact the person or company using a trusted number or official app.",
    badge: { background: "var(--amber-g)", color: "var(--amber-l)", border: "1px solid rgba(212,162,78,0.25)" },
    panel: { border: "1px solid rgba(212,162,78,0.25)", background: "var(--amber-g)" },
    dot: { background: "var(--amber)" },
  },
  low: {
    title: "No obvious scam signals found",
    intro:
      "Nothing strongly suspicious was detected, but continue carefully and verify before taking sensitive actions.",
    defaultNextStep:
      "Proceed carefully and avoid sharing sensitive information unless you independently trust the sender.",
    badge: { background: "var(--safe-light)", color: "var(--safe)", border: "1px solid rgba(92,185,122,0.25)" },
    panel: { border: "1px solid rgba(92,185,122,0.25)", background: "var(--safe-light)" },
    dot: { background: "var(--safe)" },
  },
};

const S = {
  shell: { maxWidth: 720, width: "100%", margin: "0 auto", padding: "24px 16px" } as React.CSSProperties,
  panel: { borderRadius: 24, padding: "20px 24px" } as React.CSSProperties,
  topRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 } as React.CSSProperties,
  badge: { display: "inline-flex", borderRadius: 999, padding: "4px 14px", fontSize: 13, fontWeight: 600 } as React.CSSProperties,
  h2: { marginTop: 12, fontSize: "clamp(20px, 3vw, 26px)", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--heading)" } as React.CSSProperties,
  chipRow: { display: "flex", flexWrap: "wrap" as const, gap: 8, marginBottom: 16 },
  chip: { borderRadius: 999, border: "1px solid var(--line-bright)", background: "var(--bg-card)", padding: "4px 12px", fontSize: 12, fontWeight: 500, color: "var(--text)" } as React.CSSProperties,
  card: { borderRadius: 16, border: "1px solid var(--line-bright)", background: "var(--bg-card)", padding: 16, marginTop: 16 } as React.CSSProperties,
  label: { fontSize: 13, fontWeight: 500, color: "var(--muted)", margin: 0 } as React.CSSProperties,
  body: { marginTop: 4, fontSize: 15, color: "var(--text-bright)", lineHeight: 1.6 } as React.CSSProperties,
  ul: { listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexDirection: "column" as const, gap: 8 },
  li: { display: "flex", alignItems: "flex-start", gap: 8, fontSize: 14, color: "var(--text)", lineHeight: 1.55 } as React.CSSProperties,
  dot: { width: 6, height: 6, borderRadius: 999, marginTop: 7, flexShrink: 0 } as React.CSSProperties,
  toggleBtn: { background: "none", border: "none", fontSize: 13, fontWeight: 500, color: "var(--primary-bright)", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 4, padding: 0 } as React.CSSProperties,
  btnRow: { display: "flex", flexDirection: "column" as const, gap: 12, marginTop: 16 },
  btnPrimary: { borderRadius: 16, background: "var(--heading)", padding: "12px 18px", fontSize: 14, fontWeight: 600, color: "var(--bg)", border: "none", cursor: "pointer" } as React.CSSProperties,
  btnSecondary: { borderRadius: 16, border: "1px solid var(--line-bright)", background: "var(--bg-card)", padding: "12px 18px", fontSize: 14, fontWeight: 600, color: "var(--text-bright)", cursor: "pointer" } as React.CSSProperties,
  helpRow: { display: "flex", flexWrap: "wrap" as const, gap: 12, marginTop: 8, fontSize: 14, color: "var(--text-bright)" },
  helpLink: { color: "var(--primary-bright)", textDecoration: "underline", textUnderlineOffset: 4 } as React.CSSProperties,
  hint: { marginTop: 12, fontSize: 13, color: "var(--muted)", lineHeight: 1.6 } as React.CSSProperties,
  footer: { marginTop: 16, fontSize: 12, color: "var(--muted)" } as React.CSSProperties,
};

export default function ChetanaResultScreen({
  risk,
  summary,
  nextStep,
  reasons,
  doNotDo = [],
  verificationRoute,
  contextChips = [],
  onEmergencyHelp,
  onCheckAnother,
  onToggleBreakdown,
  showFullBreakdown = false,
}: ChetanaResultProps) {
  const r = RISK_STYLES[risk];
  const visibleReasons = showFullBreakdown ? reasons : reasons.slice(0, 3);

  return (
    <section style={S.shell}>
      <div style={{ ...S.panel, ...r.panel }}>
        <div style={S.topRow}>
          <div>
            <div style={{ ...S.badge, ...r.badge }}>{r.title}</div>
            <h2 style={S.h2}>{summary || r.intro}</h2>
          </div>
        </div>

        {contextChips.length > 0 && (
          <div style={S.chipRow}>
            {contextChips.map((chip) => (
              <span key={chip} style={S.chip}>{chip}</span>
            ))}
          </div>
        )}

        <div style={S.card}>
          <p style={S.label}>Calm next step</p>
          <p style={S.body}>{nextStep || r.defaultNextStep}</p>
        </div>

        <div style={S.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <p style={S.label}>Why Chetana flagged this</p>
            {reasons.length > 3 && (
              <button type="button" onClick={onToggleBreakdown} style={S.toggleBtn}>
                {showFullBreakdown ? "Hide full breakdown" : "See full breakdown"}
              </button>
            )}
          </div>
          <ul style={S.ul}>
            {visibleReasons.map((reason) => (
              <li key={reason} style={S.li}>
                <span style={{ ...S.dot, ...r.dot }} />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>

        {(doNotDo.length > 0 || verificationRoute) && (
          <div style={S.card}>
            {doNotDo.length > 0 && (
              <>
                <p style={S.label}>Do not do this yet</p>
                <ul style={S.ul}>
                  {doNotDo.map((item) => (
                    <li key={item} style={S.li}>
                      <span style={{ ...S.dot, ...r.dot }} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {verificationRoute && (
              <>
                <p style={{ ...S.label, marginTop: doNotDo.length > 0 ? 16 : 0 }}>Best verification route</p>
                <p style={{ ...S.body, fontSize: 14 }}>{verificationRoute}</p>
              </>
            )}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <p style={{ ...S.label, marginBottom: 12 }}>What to do now</p>
          <div style={S.btnRow}>
            <button type="button" onClick={onEmergencyHelp} style={S.btnPrimary}>
              {risk === "high" ? "Get emergency help" : "Call official source"}
            </button>
            <button type="button" onClick={onCheckAnother} style={S.btnSecondary}>
              Check another message
            </button>
          </div>
          <p style={S.hint}>
            {risk === "high"
              ? "If money already moved or you shared a code, stop here and use official help first."
              : "If you already replied, paid, or shared a code, switch to official help next."}
          </p>
        </div>

        <div style={S.card}>
          <p style={S.label}>Helplines</p>
          <div style={S.helpRow}>
            <a href="tel:1930" style={S.helpLink}>1930</a>
            <a href="https://cybercrime.gov.in" target="_blank" rel="noreferrer" style={S.helpLink}>cybercrime.gov.in</a>
            <a href="tel:181" style={S.helpLink}>Women helpline 181</a>
          </div>
        </div>

        <div style={S.card}>
          <p style={S.label}>Privacy</p>
          <p style={{ ...S.body, fontSize: 14 }}>
            No login required. Paste only what is needed. Avoid sending full IDs,
            card numbers, passwords, or complete bank details.
          </p>
        </div>

        <div style={S.footer}>Built in Goa</div>
      </div>
    </section>
  );
}

// Helper: map Chetana's V0VerdictValue to this component's RiskLevel.
export function riskFromVerdict(
  verdict: "high_risk" | "caution" | "needs_review" | "low_signal"
): RiskLevel {
  if (verdict === "high_risk") return "high";
  if (verdict === "low_signal") return "low";
  return "medium";
}
