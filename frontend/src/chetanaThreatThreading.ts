import type { V0InputType, V0RiskLevel, V0Verdict, V0VerdictValue } from "./chetanaV0";

export type V0ThreadIdentifierKind = "phone" | "upi" | "link";

export interface V0ThreatThreadSignal {
  thread_id: string;
  event_count: number;
  matched_kinds: V0ThreadIdentifierKind[];
  label: string;
  message: string;
  privacy_note: string;
}

type ThreadIdentifier = {
  kind: V0ThreadIdentifierKind;
  normalized: string;
  hash: string;
};

type StoredThreatEvent = {
  id: string;
  scan_id: string;
  timestamp: string;
  input_type: V0InputType;
  content_hash: string;
  verdict: V0VerdictValue;
  risk_level: V0RiskLevel;
  score: number;
  identifier_hashes: string[];
  identifier_kinds: V0ThreadIdentifierKind[];
};

type StoredThreatThread = {
  id: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  event_count: number;
  max_score: number;
  identifier_hashes: string[];
  identifier_kinds: V0ThreadIdentifierKind[];
  channels: V0InputType[];
  events: StoredThreatEvent[];
};

type StoredThreatThreadState = {
  schema_version: 1;
  threads: Record<string, StoredThreatThread>;
  index: Record<string, string[]>;
};

export const CHETANA_THREAT_THREADS_STORAGE_KEY = "chetana_threat_threads_v1";
export const CLEARABLE_CHETANA_LOCAL_SCAN_KEYS = [
  CHETANA_THREAT_THREADS_STORAGE_KEY,
  "chetana_v0_scan_count",
  "chetana_v0_last_scan_at",
  "chetana_v0_event_queue",
  "chetana_history",
  "chetana_scan_count",
  "chetana_vigilance",
  "chetana_vigilance_proof",
] as const;
export const CLEARABLE_CHETANA_SESSION_SCAN_KEYS = [
  "chetana_v0_event_dedupe",
] as const;

const STORAGE_KEY = CHETANA_THREAT_THREADS_STORAGE_KEY;
const THREAD_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CORRELATION_WINDOW_MS = 72 * 60 * 60 * 1000;
const MAX_THREADS = 25;
const MAX_EVENTS_PER_THREAD = 8;

function emptyState(): StoredThreatThreadState {
  return { schema_version: 1, threads: {}, index: {} };
}

function storageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length >= 8 && digits.length <= 15) return digits;
  return null;
}

function normalizeUpi(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized.includes("@")) return null;
  if (!/^[a-z0-9._-]{2,256}@[a-z][a-z0-9._-]{2,64}$/.test(normalized)) return null;
  return normalized;
}

function normalizeDomain(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function scoreForVerdict(verdict: V0VerdictValue): number {
  if (verdict === "high_risk") return 1;
  if (verdict === "caution") return 0.68;
  if (verdict === "needs_review") return 0.52;
  return 0.2;
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function kindLabel(kind: V0ThreadIdentifierKind): string {
  if (kind === "upi") return "UPI ID";
  if (kind === "phone") return "phone number";
  return "link";
}

function signalLabel(kinds: V0ThreadIdentifierKind[]): string {
  const labels = unique(kinds).map(kindLabel);
  if (labels.length === 0) return "identifier";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return "UPI, phone, or link";
}

async function sha256Hex(value: string): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function collectIdentifiers(verdict: V0Verdict): Promise<ThreadIdentifier[]> {
  const candidates: Array<{ kind: V0ThreadIdentifierKind; normalized: string }> = [];
  for (const value of verdict.entities?.phone_numbers || []) {
    const normalized = normalizePhone(value);
    if (normalized) candidates.push({ kind: "phone", normalized });
  }
  for (const value of verdict.entities?.upi_ids || []) {
    const normalized = normalizeUpi(value);
    if (normalized) candidates.push({ kind: "upi", normalized });
  }
  for (const value of verdict.entities?.urls || []) {
    const normalized = normalizeDomain(value);
    if (normalized) candidates.push({ kind: "link", normalized });
  }

  const seen = new Set<string>();
  const identifiers: ThreadIdentifier[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.normalized}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const hash = await sha256Hex(key);
    if (hash) identifiers.push({ ...candidate, hash });
  }
  return identifiers;
}

function readState(nowMs: number): StoredThreatThreadState {
  if (!storageAvailable()) return emptyState();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed || parsed.schema_version !== 1 || typeof parsed.threads !== "object") {
      return emptyState();
    }
    return compactState(parsed as StoredThreatThreadState, nowMs);
  } catch {
    return emptyState();
  }
}

function compactState(state: StoredThreatThreadState, nowMs: number): StoredThreatThreadState {
  const activeThreads = Object.values(state.threads)
    .filter((thread) => Date.parse(thread.expires_at) > nowMs)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .slice(0, MAX_THREADS);

  const next = emptyState();
  for (const thread of activeThreads) {
    const trimmedEvents = thread.events
      .slice()
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
      .slice(-MAX_EVENTS_PER_THREAD);
    next.threads[thread.id] = {
      ...thread,
      event_count: Math.max(thread.event_count, trimmedEvents.length),
      events: trimmedEvents,
    };
    for (const hash of thread.identifier_hashes) {
      next.index[hash] = unique([...(next.index[hash] || []), thread.id]);
    }
  }
  return next;
}

function writeState(state: StoredThreatThreadState): void {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Local threading is a browser-only helper. The scan result remains valid without it.
  }
}

export function clearLocalChetanaScanMemory(): number {
  if (typeof window === "undefined") return 0;

  let removed = 0;
  try {
    for (const key of CLEARABLE_CHETANA_LOCAL_SCAN_KEYS) {
      if (window.localStorage.getItem(key) !== null) removed += 1;
      window.localStorage.removeItem(key);
    }
  } catch {
    // Browsers can block storage access. The app should keep working even then.
  }

  try {
    for (const key of CLEARABLE_CHETANA_SESSION_SCAN_KEYS) {
      if (window.sessionStorage.getItem(key) !== null) removed += 1;
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Session storage is best-effort privacy hygiene.
  }

  return removed;
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildEvent(verdict: V0Verdict, identifiers: ThreadIdentifier[], contentHash: string, nowIso: string): StoredThreatEvent {
  return {
    id: makeId("event"),
    scan_id: verdict.scan_id,
    timestamp: nowIso,
    input_type: verdict.input_type,
    content_hash: contentHash,
    verdict: verdict.verdict,
    risk_level: verdict.risk_level,
    score: scoreForVerdict(verdict.verdict),
    identifier_hashes: identifiers.map((identifier) => identifier.hash),
    identifier_kinds: unique(identifiers.map((identifier) => identifier.kind)),
  };
}

function buildSignal(thread: StoredThreatThread, matchedKinds: V0ThreadIdentifierKind[]): V0ThreatThreadSignal {
  const label = signalLabel(matchedKinds);
  return {
    thread_id: thread.id,
    event_count: thread.event_count,
    matched_kinds: unique(matchedKinds),
    label,
    message: `This ${label} appeared in another scan on this device. Treat this as connected.`,
    privacy_note: "Threading stays in this browser as private hashes.",
  };
}

export async function recordLocalThreatThread(
  verdict: V0Verdict,
  extractedText: string,
): Promise<V0ThreatThreadSignal | null> {
  if (!storageAvailable()) return null;

  try {
    const identifiers = await collectIdentifiers(verdict);
    if (identifiers.length === 0) return null;

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + THREAD_TTL_MS).toISOString();
    const contentHash = await sha256Hex(`content:${extractedText.trim().slice(0, 12000)}`);
    if (!contentHash) return null;

    const state = readState(nowMs);
    const identifierHashes = identifiers.map((identifier) => identifier.hash);
    const matchedThreadIds = unique(
      identifierHashes.flatMap((hash) => state.index[hash] || []),
    )
      .map((threadId) => state.threads[threadId])
      .filter((thread): thread is StoredThreatThread => Boolean(thread))
      .filter((thread) => nowMs - Date.parse(thread.updated_at) <= CORRELATION_WINDOW_MS)
      .sort((a, b) => {
        const eventDelta = b.event_count - a.event_count;
        if (eventDelta !== 0) return eventDelta;
        return Date.parse(b.updated_at) - Date.parse(a.updated_at);
      });

    const event = buildEvent(verdict, identifiers, contentHash, nowIso);

    if (matchedThreadIds.length > 0) {
      const thread = matchedThreadIds[0];
      const previousHashes = new Set(thread.identifier_hashes);
      const matchedKinds = identifiers
        .filter((identifier) => previousHashes.has(identifier.hash))
        .map((identifier) => identifier.kind);
      const alreadyRecorded = thread.events.some((item) => item.content_hash === contentHash);
      const nextEvents = alreadyRecorded ? thread.events : [...thread.events, event].slice(-MAX_EVENTS_PER_THREAD);
      const nextThread: StoredThreatThread = {
        ...thread,
        updated_at: nowIso,
        expires_at: expiresAt,
        event_count: alreadyRecorded ? thread.event_count : thread.event_count + 1,
        max_score: Math.max(thread.max_score, event.score),
        identifier_hashes: unique([...thread.identifier_hashes, ...event.identifier_hashes]),
        identifier_kinds: unique([...thread.identifier_kinds, ...event.identifier_kinds]),
        channels: unique([...thread.channels, event.input_type]),
        events: nextEvents,
      };
      state.threads[nextThread.id] = nextThread;
      writeState(compactState(state, nowMs));
      return matchedKinds.length > 0 && nextThread.event_count > 1 ? buildSignal(nextThread, matchedKinds) : null;
    }

    const threadId = makeId("thread");
    state.threads[threadId] = {
      id: threadId,
      created_at: nowIso,
      updated_at: nowIso,
      expires_at: expiresAt,
      event_count: 1,
      max_score: event.score,
      identifier_hashes: event.identifier_hashes,
      identifier_kinds: event.identifier_kinds,
      channels: [event.input_type],
      events: [event],
    };
    writeState(compactState(state, nowMs));
  } catch {
    return null;
  }

  return null;
}
