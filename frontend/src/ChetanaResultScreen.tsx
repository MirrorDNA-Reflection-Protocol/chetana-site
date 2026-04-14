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
  onEmergencyHelp?: () => void;
  onCheckAnother?: () => void;
  onShare?: () => void;
  onCreateMirrorSeed?: () => void;
  onToggleBreakdown?: () => void;
  showFullBreakdown?: boolean;
};

const RISK_COPY: Record<
  RiskLevel,
  {
    title: string;
    intro: string;
    defaultNextStep: string;
    badgeClass: string;
    panelClass: string;
  }
> = {
  high: {
    title: "Likely scam",
    intro:
      "This message shows patterns commonly used in fraud. Do not click links, share OTPs, send money, or continue the conversation until verified.",
    defaultNextStep:
      "Do not open the link. Verify through the company’s official website or app, not the contact details in the message.",
    badgeClass:
      "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
    panelClass: "border-red-200 bg-red-50/50",
  },
  medium: {
    title: "Needs verification",
    intro:
      "This message has unclear or suspicious elements. Pause here and verify the sender through an independent route.",
    defaultNextStep:
      "Do not act from this message alone. Contact the person or company using a trusted number or official app.",
    badgeClass:
      "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
    panelClass: "border-amber-200 bg-amber-50/50",
  },
  low: {
    title: "No obvious scam signals found",
    intro:
      "Nothing strongly suspicious was detected, but continue carefully and verify before taking sensitive actions.",
    defaultNextStep:
      "Proceed carefully and avoid sharing sensitive information unless you independently trust the sender.",
    badgeClass:
      "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
    panelClass: "border-emerald-200 bg-emerald-50/50",
  },
};

export default function ChetanaResultScreen({
  risk,
  summary,
  nextStep,
  reasons,
  onEmergencyHelp,
  onCheckAnother,
  onShare,
  onCreateMirrorSeed,
  onToggleBreakdown,
  showFullBreakdown = false,
}: ChetanaResultProps) {
  const copy = RISK_COPY[risk];
  const visibleReasons = showFullBreakdown ? reasons : reasons.slice(0, 3);

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <div className={`rounded-3xl border p-5 sm:p-6 ${copy.panelClass}`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div
              className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${copy.badgeClass}`}
            >
              {copy.title}
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">
              {summary || copy.intro}
            </h2>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Calm next step</p>
          <p className="mt-1 text-base text-zinc-900">
            {nextStep || copy.defaultNextStep}
          </p>
        </div>

        <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-zinc-500">
              Why Chetana flagged this
            </p>
            {reasons.length > 3 && (
              <button
                type="button"
                onClick={onToggleBreakdown}
                className="text-sm font-medium text-zinc-700 underline underline-offset-4"
              >
                {showFullBreakdown ? "Hide full breakdown" : "See full breakdown"}
              </button>
            )}
          </div>

          <ul className="mt-3 space-y-2">
            {visibleReasons.map((reason) => (
              <li key={reason} className="flex items-start gap-2 text-sm text-zinc-800">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-zinc-900" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5">
          <p className="mb-3 text-sm font-medium text-zinc-500">What to do now</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            {risk === "high" ? (
              <button
                type="button"
                onClick={onEmergencyHelp}
                className="rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white"
              >
                Get emergency help
              </button>
            ) : (
              <button
                type="button"
                onClick={onEmergencyHelp}
                className="rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white"
              >
                Call official source
              </button>
            )}

            <button
              type="button"
              onClick={onCheckAnother}
              className="rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-900"
            >
              Check another message
            </button>

            {onShare && (
              <button
                type="button"
                onClick={onShare}
                className="rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-900"
              >
                Share with family
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Helplines</p>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-zinc-900">
            <a href="tel:1930" className="underline underline-offset-4">
              1930
            </a>
            <a
              href="https://cybercrime.gov.in"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              cybercrime.gov.in
            </a>
            <a href="tel:181" className="underline underline-offset-4">
              Women helpline 181
            </a>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">Privacy</p>
          <p className="mt-1 text-sm text-zinc-900">
            No login required. Paste only what is needed. Avoid sending full IDs,
            card numbers, passwords, or complete bank details.
          </p>
        </div>

        <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-500">
            Want stronger protection across tools?
          </p>
          <p className="mt-1 text-sm text-zinc-900">
            Create a Mirror Seed to carry trusted context and safer defaults across
            future checks.
          </p>
          <button
            type="button"
            onClick={onCreateMirrorSeed}
            className="mt-3 rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-900"
          >
            Create Mirror Seed
          </button>
        </div>

        <div className="mt-5 text-xs text-zinc-500">
          Built in Goa · Public proof available
        </div>
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
