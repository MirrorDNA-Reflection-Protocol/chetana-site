import { useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, Clock3, Radio, ShieldAlert, Siren, TrendingUp } from "lucide-react";

import { PageId } from "./types";

const API = import.meta.env.DEV ? "http://localhost:8093" : "";
const DAY_OPTIONS = [7, 14, 30] as const;

type CountMap = Record<string, number>;

type AnalyticsSummary = {
  generated_at_utc: string;
  trailing_days: number;
  invalid_rows: number;
  totals: {
    unique_sessions: number;
    scan_completes: number;
    risky_verdicts: number;
    evidence_saves: number;
    report_taps: number;
    share_completes: number;
  };
  funnel: {
    app_open_sessions: number;
    scan_started_sessions: number;
    scan_completed_sessions: number;
    started_then_completed_sessions: number;
    orphan_completed_sessions: number;
    report_tapped_sessions: number;
    evidence_saved_sessions: number;
    recovery_support_sessions: number;
    share_completed_sessions: number;
    start_rate_from_open_pct: number;
    completion_rate_from_start_pct: number;
    report_rate_from_complete_pct: number;
    evidence_rate_from_complete_pct: number;
    recovery_support_rate_from_complete_pct: number;
    share_rate_from_complete_pct: number;
  };
  breakdowns: {
    verdicts: CountMap;
    scam_types: CountMap;
    input_types: CountMap;
    languages: CountMap;
    device_classes: CountMap;
    share_channels: CountMap;
    report_targets: CountMap;
    report_surfaces: CountMap;
    recovery_steps: CountMap;
    recovery_channels: CountMap;
    official_rails: CountMap;
    entry_sources: CountMap;
    entry_paths: CountMap;
    utm_sources: CountMap;
    event_versions: CountMap;
  };
  daily: Array<{
    date: string;
    unique_sessions: number;
    scan_completes: number;
    risky_verdicts: number;
    report_taps: number;
  }>;
};

type MetaSignal = {
  tone: "healthy" | "warn" | "quiet";
  title: string;
  body: string;
};

function readDaysFromLocation(): number {
  const params = new URLSearchParams(window.location.search);
  const value = Number(params.get("days") || "14");
  if (DAY_OPTIONS.includes(value as (typeof DAY_OPTIONS)[number])) {
    return value;
  }
  return 14;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-IN");
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatTimestamp(value: string): string {
  if (!value) {
    return "Unknown";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function ratio(part: number, whole: number): number {
  if (whole <= 0) {
    return 0;
  }
  return (part / whole) * 100;
}

function topEntries(entries: CountMap, limit = 5): Array<[string, number]> {
  return Object.entries(entries)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit);
}

function buildMetaSignals(summary: AnalyticsSummary): MetaSignal[] {
  const signals: MetaSignal[] = [];
  const riskyShare = ratio(summary.totals.risky_verdicts, summary.totals.scan_completes);
  const attributedSources = Object.entries(summary.breakdowns.entry_sources).filter(([label]) => label !== "legacy_unattributed");
  const legacyAttribution = summary.breakdowns.entry_sources.legacy_unattributed || 0;
  const reportRate = summary.funnel.recovery_support_rate_from_complete_pct;

  if (summary.funnel.orphan_completed_sessions > 0) {
    signals.push({
      tone: "warn",
      title: "Event drift",
      body: `${summary.funnel.orphan_completed_sessions} completed sessions have no matching start event in the active window.`,
    });
  } else {
    signals.push({
      tone: "healthy",
      title: "Funnel coherent",
      body: "Every completed scan in the active window has a matching start event.",
    });
  }

  if (attributedSources.length === 0 && legacyAttribution > 0) {
    signals.push({
      tone: "quiet",
      title: "Legacy attribution only",
      body: `${legacyAttribution} app-open rows predate the new attribution contract, so source buckets are still mostly historical blank space.`,
    });
  } else if (attributedSources.length === 0) {
    signals.push({
      tone: "quiet",
      title: "Attribution cold",
      body: "New entry-source metadata is live, but the active window still has no tagged traffic.",
    });
  } else {
    signals.push({
      tone: "healthy",
      title: "Attribution live",
      body: `${attributedSources.length} attributed source bucket${attributedSources.length === 1 ? "" : "s"} populated in the active window.`,
    });
  }

  if (summary.totals.scan_completes < 25) {
    signals.push({
      tone: "quiet",
      title: "Traffic thin",
      body: `Only ${summary.totals.scan_completes} completed scans in the last ${summary.trailing_days} days, so directional changes can be noisy.`,
    });
  } else {
    signals.push({
      tone: "healthy",
      title: "Traffic usable",
      body: `${summary.totals.scan_completes} completed scans give enough signal to judge recent funnel movement.`,
    });
  }

  if (reportRate < 10 && summary.totals.scan_completes > 0) {
    signals.push({
      tone: "warn",
      title: "Recovery support thin",
      body: `Only ${formatPercent(reportRate)} of completed-scan sessions saved evidence or touched an official recovery rail.`,
    });
  } else {
    signals.push({
      tone: "healthy",
      title: "Recovery support active",
      body: `${formatPercent(reportRate)} of completed-scan sessions saved evidence or moved into an official recovery rail.`,
    });
  }

  if (riskyShare >= 50) {
    signals.push({
      tone: "warn",
      title: "Risk mix elevated",
      body: `${formatPercent(riskyShare)} of completed scans landed in caution or high-risk territory.`,
    });
  } else {
    signals.push({
      tone: "healthy",
      title: "Risk mix bounded",
      body: `${formatPercent(riskyShare)} of completed scans landed in caution or high-risk territory.`,
    });
  }

  return signals;
}

function BreakdownCard({
  title,
  subtitle,
  counts,
  emptyLabel,
}: {
  title: string;
  subtitle: string;
  counts: CountMap;
  emptyLabel: string;
}) {
  const rows = topEntries(counts);
  const peak = rows.length > 0 ? rows[0][1] : 1;

  return (
    <section className="ops-panel">
      <div className="ops-panel-head">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="ops-empty">{emptyLabel}</div>
      ) : (
        <div className="ops-breakdown-list">
          {rows.map(([label, count]) => (
            <div className="ops-breakdown-row" key={`${title}-${label}`}>
              <div className="ops-breakdown-meta">
                <span>{label}</span>
                <strong>{formatNumber(count)}</strong>
              </div>
              <div className="ops-breakdown-bar-shell">
                <div
                  className="ops-breakdown-bar"
                  style={{ width: `${Math.max((count / peak) * 100, 8)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function OpsAnalyticsPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const [days, setDays] = useState<number>(() => readDaysFromLocation());
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextPath = window.location.pathname === "/ops" ? "/" : window.location.pathname;
    params.set("page", "ops");
    if (days !== 14) {
      params.set("days", String(days));
    } else {
      params.delete("days");
    }
    window.history.replaceState({}, "", `${nextPath}?${params.toString()}`);
  }, [days]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const loadSummary = async () => {
      try {
        const response = await fetch(`${API}/api/v1/analytics/summary?days=${days}`);
        if (!response.ok) {
          throw new Error(`Analytics request failed with ${response.status}`);
        }
        const nextSummary = (await response.json()) as AnalyticsSummary;
        if (!cancelled) {
          setSummary(nextSummary);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : "Failed to load analytics summary";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadSummary();
    const intervalId = window.setInterval(() => {
      void loadSummary();
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [days]);

  const metaSignals = summary ? buildMetaSignals(summary) : [];
  const dailyPeak = summary ? Math.max(...summary.daily.map((bucket) => bucket.scan_completes), 1) : 1;

  return (
    <section className="ops-shell">
      <div className="ops-hero">
        <div className="ops-hero-copy">
          <div className="ops-kicker">Operator view</div>
          <h1>Chetana usage pulse</h1>
          <p>
            Canonical v0 ledger only. Auto-refresh every minute. This view is built on
            <code>/api/v1/analytics/summary</code>, not fallback counters.
          </p>
        </div>
        <div className="ops-hero-actions">
          <div className="ops-range-group">
            {DAY_OPTIONS.map((option) => (
              <button
                key={option}
                className={`ops-range-button${days === option ? " active" : ""}`}
                onClick={() => setDays(option)}
              >
                {option}d
              </button>
            ))}
          </div>
          <a className="ops-link-button" href={`${API}/api/v1/analytics/summary?days=${days}`} target="_blank" rel="noreferrer">
            JSON
            <ArrowUpRight size={16} />
          </a>
          <button className="ops-link-button" onClick={() => onNavigate("scan")}>
            Open app
          </button>
        </div>
      </div>

      {error && (
        <div className="ops-error-banner">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {summary && (
        <>
          <div className="ops-meta-row">
            <span>
              <Clock3 size={14} />
              Generated {formatTimestamp(summary.generated_at_utc)}
            </span>
            <span>
              <Radio size={14} />
              {summary.trailing_days}-day window
            </span>
            <span>
              <ShieldAlert size={14} />
              Invalid rows skipped: {formatNumber(summary.invalid_rows)}
            </span>
          </div>

          <div className="ops-signal-grid">
            {metaSignals.map((signal) => (
              <article className={`ops-signal-card ${signal.tone}`} key={signal.title}>
                <div className="ops-signal-top">
                  <strong>{signal.title}</strong>
                  {signal.tone === "warn" ? <Siren size={16} /> : <TrendingUp size={16} />}
                </div>
                <p>{signal.body}</p>
              </article>
            ))}
          </div>

          <div className="ops-stat-grid">
            <article className="ops-stat-card">
              <span>Unique sessions</span>
              <strong>{formatNumber(summary.totals.unique_sessions)}</strong>
              <p>Real sessions in the active window after synthetic filtering.</p>
            </article>
            <article className="ops-stat-card">
              <span>Completed scans</span>
              <strong>{formatNumber(summary.totals.scan_completes)}</strong>
              <p>{formatPercent(summary.funnel.completion_rate_from_start_pct)} completion from scan start.</p>
            </article>
            <article className="ops-stat-card">
              <span>Risky verdicts</span>
              <strong>{formatNumber(summary.totals.risky_verdicts)}</strong>
              <p>{formatPercent(ratio(summary.totals.risky_verdicts, summary.totals.scan_completes))} of completed scans.</p>
            </article>
            <article className="ops-stat-card">
              <span>Recovery support</span>
              <strong>{formatNumber(summary.funnel.recovery_support_sessions)}</strong>
              <p>{formatPercent(summary.funnel.recovery_support_rate_from_complete_pct)} of complete sessions saved evidence or opened official help.</p>
            </article>
          </div>

          <div className="ops-grid">
            <section className="ops-panel">
              <div className="ops-panel-head">
                <div>
                  <h3>Daily completion curve</h3>
                  <p>Completed scans, risky verdicts, and report taps by day.</p>
                </div>
              </div>
              <div className="ops-daily-chart">
                {summary.daily.map((bucket) => (
                  <div className="ops-daily-bar-shell" key={bucket.date}>
                    <div className="ops-daily-values">
                      <span>{bucket.scan_completes}</span>
                      {bucket.report_taps > 0 && <small>{bucket.report_taps} report</small>}
                    </div>
                    <div className="ops-daily-bar-track">
                      <div
                        className="ops-daily-bar"
                        style={{ height: `${Math.max((bucket.scan_completes / dailyPeak) * 100, bucket.scan_completes > 0 ? 8 : 0)}%` }}
                      />
                      {bucket.risky_verdicts > 0 && (
                        <div
                          className="ops-daily-risk-cap"
                          style={{ height: `${Math.max((bucket.risky_verdicts / dailyPeak) * 100, 4)}%` }}
                        />
                      )}
                    </div>
                    <div className="ops-daily-label">{bucket.date.slice(5)}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="ops-panel">
              <div className="ops-panel-head">
                <div>
                  <h3>Funnel health</h3>
                  <p>Session-level funnel so duplicate event rows do not inflate the picture.</p>
                </div>
              </div>
              <div className="ops-funnel-list">
                {[
                  ["App open sessions", summary.funnel.app_open_sessions, 100],
                  ["Scan started sessions", summary.funnel.scan_started_sessions, summary.funnel.start_rate_from_open_pct],
                  ["Completed after start", summary.funnel.started_then_completed_sessions, summary.funnel.completion_rate_from_start_pct],
                  ["Evidence saved sessions", summary.funnel.evidence_saved_sessions, summary.funnel.evidence_rate_from_complete_pct],
                  ["Report tapped sessions", summary.funnel.report_tapped_sessions, summary.funnel.report_rate_from_complete_pct],
                  ["Recovery support sessions", summary.funnel.recovery_support_sessions, summary.funnel.recovery_support_rate_from_complete_pct],
                ].map(([label, count, percent]) => (
                  <div className="ops-funnel-row" key={String(label)}>
                    <div className="ops-funnel-meta">
                      <span>{label}</span>
                      <strong>{formatNumber(Number(count))}</strong>
                    </div>
                    <div className="ops-funnel-meter">
                      <div className="ops-funnel-fill" style={{ width: `${Math.max(Number(percent), Number(count) > 0 ? 6 : 0)}%` }} />
                    </div>
                    <small>{formatPercent(Number(percent))}</small>
                  </div>
                ))}
              </div>
              <div className="ops-funnel-foot">
                <span>Completed sessions in window: {formatNumber(summary.funnel.scan_completed_sessions)}</span>
                <span>Orphans: {formatNumber(summary.funnel.orphan_completed_sessions)}</span>
              </div>
            </section>
          </div>

          <div className="ops-grid ops-grid-compact">
            <BreakdownCard
              title="Verdicts"
              subtitle="Where completed scans are landing."
              counts={summary.breakdowns.verdicts}
              emptyLabel="No verdict data in the current window."
            />
            <BreakdownCard
              title="Input lanes"
              subtitle="What users are scanning."
              counts={summary.breakdowns.input_types}
              emptyLabel="No input-type data in the current window."
            />
            <BreakdownCard
              title="Scam patterns"
              subtitle="Most common tagged scam types."
              counts={summary.breakdowns.scam_types}
              emptyLabel="No scam types were tagged in the current window."
            />
            <BreakdownCard
              title="Entry sources"
              subtitle="How users arrived in Chetana."
              counts={summary.breakdowns.entry_sources}
              emptyLabel="No entry-source metadata captured yet."
            />
            <BreakdownCard
              title="Recovery steps"
              subtitle="Which concrete safety moves people are taking."
              counts={summary.breakdowns.recovery_steps}
              emptyLabel="No recovery-step metadata in the current window."
            />
            <BreakdownCard
              title="Official rails"
              subtitle="Which official rails are being touched."
              counts={summary.breakdowns.official_rails}
              emptyLabel="No official-rail touches in the current window."
            />
            <BreakdownCard
              title="Event versions"
              subtitle="Analytics contract adoption in the window."
              counts={summary.breakdowns.event_versions}
              emptyLabel="No event-version metadata captured yet."
            />
          </div>
        </>
      )}

      {loading && !summary && <div className="ops-empty">Loading operator analytics…</div>}
    </section>
  );
}
