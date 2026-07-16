# Chetana Hardening Audit - 2026-07-16

## Status

Parent-agent security audit and repair. This is not a completed Codex Security Deep Scan: the desktop scan launcher failed before issuing a scan ID.

## Checked scope

- FastAPI routes, public proxies, uploads, webhooks, incident persistence, API-key storage, anonymous event storage, and SPA file serving
- Vite production build and frontend dependency audit
- Python dependency consistency, compilation, full backend tests, Git secret history, current-source secret patterns, and live public-edge probes
- Cloudflare tunnel origin and launchd bind topology

## Validated findings and repairs

### Public Decode Firewall administration

The public edge allowed unauthenticated inspection, object lookup, event lookup, and release requests. Inspection also created persistent quarantine artifacts.

Repair: all administration routes are loopback-only and return `404` to forwarded or remote requests. Public scan gates now use non-persistent in-memory firewall analysis; only the loopback operator instance may retain forensic artifacts.

### Unbounded upload reads

OCR escalation and legacy media routes buffered uploads without an application ceiling.

Repair: these routes now use a shared 8 MiB bounded reader and reject empty or oversized uploads before downstream parsing or proxying.

### Incident session path and storage handling

Incident identifiers were used as filenames without UUID validation. Session files were non-atomic and readable under default filesystem permissions.

Repair: UUID-only identifiers, root containment by construction, private `0700` directory permissions, `0600` files, atomic replace, flush/fsync, a process lock, and bounded request fields.

### Static file root containment

The SPA fallback joined a route path to the frontend directory without resolving and proving containment.

Repair: resolved candidates must remain below the resolved frontend root before `FileResponse` can serve them.

### Unsigned WhatsApp webhook

The receiver accepted unsigned bodies and used a committed default verification token.

Repair: no default token, HMAC-SHA256 verification of `X-Hub-Signature-256`, a 1 MiB body ceiling, strict JSON object checks, and fail-closed `503` behavior until `WHATSAPP_APP_SECRET` is configured.

### Local data permissions

API-key data, incident sessions, and anonymous event logs used default filesystem permissions.

Repair: Chetana private roots are `0700`; databases, SQLite sidecars, session records, analytics, partner inquiry logs, and v0 ledgers are `0600`.

### Historical TriMind API key

Git history and the current helper contained a live-looking API key as a default fallback.

Repair: the fallback is removed, remote authentication fails closed when no key is configured, and comparisons are constant-time. The old value remains compromised historical material and must never be reused.

### Network exposure

The backend listened on `0.0.0.0` although the Cloudflare tunnel already targets `127.0.0.1:8093`.

Repair: the canonical Active Mirror body manifest now binds Chetana to `127.0.0.1` only.

## Verification

- Backend: 129 tests passed, 2 subtests passed
- Frontend: 3 tests passed; production build passed
- Dependencies: `npm audit --omit=dev` reported 0 vulnerabilities; `pip check` reported no broken requirements
- Static checks: changed Python compiled; `git diff --check` passed
- Secret scan: Git history retains 15 findings, including the removed historical TriMind default and generated bundle false positives. Current source has no validated credential; one ignored built xterm bundle produces a generic-key false positive.

## Remaining risk

- This was not the unavailable six-worker Codex Security Deep Scan and does not claim exhaustive vulnerability discovery.
- Anonymous client telemetry can be rate-limited and schema-bounded, but it is not identity-attested. Institutional reports must continue to label it observed telemetry, not independently verified fraud outcomes.
- API and ReDoc/OpenAPI documentation remain public. This increases route discoverability but does not bypass route authorization.
- The CSP still permits inline script/style execution and WebAssembly evaluation for the current frontend runtime. Removing those allowances requires nonce/hash plumbing and frontend compatibility work.
- In-memory rate limits reset on process restart and are not a substitute for Cloudflare edge rate limiting.
- WhatsApp remains intentionally unavailable until all Meta credentials, especially `WHATSAPP_APP_SECRET`, are configured and verified.
