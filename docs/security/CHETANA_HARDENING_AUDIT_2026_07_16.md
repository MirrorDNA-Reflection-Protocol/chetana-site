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

### Public operator alerting

The legacy `/api/alert` route could send arbitrary Telegram messages when operator credentials were configured.

Repair: the route is loopback-only, hidden from OpenAPI, and returns `404` to public requests.

### Raw scam content in notifications

Legacy high-risk scan and chat paths copied a user-text snippet into Telegram alerts.

Repair: automatic alerts contain derived risk metadata only and state that raw content was omitted. User-submitted scan text is no longer sent through that notification path.

Automatic scan alerts are disabled by default. They require an explicit `CHETANA_SCAN_ALERTS_ENABLED=true` operator decision; Partner Desk alerts remain separately governed and contain no prospect message text.

### MirrorProof caller-controlled assessments

The loop-receipt endpoint accepted and signed a caller-supplied verdict, trust bundle, and action route without recomputing the assessment from the submitted text.

Repair: the server recomputes the deterministic verdict, compares all material assessment fields and reason codes, rejects mismatches with `409`, discards caller-supplied proof components, rebuilds the action route, and signs only the server-recomputed assessment.

### Anonymous write abuse and telemetry bounds

Public event, receipt, OCR, media, voice, translation, incident, and scan routes had inconsistent or missing request budgets. Legacy telemetry accepted weakly bounded JSON.

Repair: per-client route budgets, a 9 MiB API request ceiling, strict telemetry and translation schemas, bounded identifiers and metadata, and fail-closed `429` responses with `Retry-After`.

### Retired witness proxy

The public witness route proxied arbitrary paths to a missing loopback service and returned a misleading success-shaped error.

Repair: the proxy is removed. The compatibility route returns `410` and points to the active MirrorProof verifier.

Unknown `/api/*` GET paths now return JSON `404` instead of falling through to the SPA shell with an HTML `200`.

### Browser-to-localhost permission

The production CSP allowed pages to connect to `http://localhost:8093`.

Repair: production `connect-src` is now same-origin only. Vite development continues to use its own local proxy configuration.

## Verification

- Backend: 143 tests passed, 2 subtests passed
- Frontend: 4 tests passed; production build passed
- Dependencies: `npm audit --omit=dev` reported 0 vulnerabilities; `pip check` reported no broken requirements
- Python advisories: upgraded FastAPI to `0.139.1`, Starlette to `1.3.1`, Pydantic to `2.13.4`, and python-multipart to `0.0.32`; `pip-audit` then reported no known vulnerabilities
- Python static analysis: Bandit reported no medium- or high-severity findings; remaining results were 14 low-severity warnings or consent-token false positives
- Static checks: changed Python compiled; `git diff --check` passed
- Secret scan: Git history retains 15 findings, including the removed historical TriMind default and generated bundle false positives. Current source has no validated credential; one ignored built xterm bundle produces a generic-key false positive.

## Second-pass repairs

- Research donation and deletion logs now use atomic private writes, `0700` parent directories, and `0600` files. Existing runtime research storage was repaired to the same modes.
- Action routing, send guard, recovery, merchant release, trust bundles, and signed loop receipts now recompute the verdict from the submitted evidence and reject material caller/server mismatches with `409`.
- API request size enforcement now counts streamed bytes before routing, so chunked requests cannot bypass the 9 MiB ceiling by omitting `Content-Length`.
- Partner and research rate-limit identities now accept Cloudflare client IPs only from the loopback proxy boundary and ignore untrusted forwarding headers from direct peers.
- Institutional API request models now reject unknown fields and bound language, source, URL, UPI, and phone inputs.
- Local development CORS origins are disabled by default and require `CHETANA_ALLOW_DEVELOPMENT_ORIGINS=true`.

## Public product-flow validation

- A controlled public screenshot scan reproduced a production failure before this repair: Tesseract attempted to load its worker from jsDelivr, and the production same-origin CSP blocked it. The UI recovered instead of hanging, but screenshot OCR could not complete.
- Tesseract's worker, WebAssembly core variants, and English/Hindi language data are now copied from pinned npm packages into versioned same-origin assets during development and production builds. The browser scanner is configured to use only `/ocr/` paths.
- A fresh 390 x 844 browser session scanned a controlled police-impersonation/payment screenshot to `Likely scam`, showed stop/payment guidance plus 1930, cybercrime.gov.in, and Chakshu actions, and received a signed assessment receipt.
- The fresh browser network trace showed the OCR worker, selected core, and both language packs returning `200` from `https://chetana.activemirror.ai/ocr/`; it contained no jsDelivr OCR request.
- A controlled 9.26-second voice fixture transcribed through the public API in 3.17 seconds using local whisper.cpp. The response reported no external provider, no raw-audio retention, and successful temporary-file deletion.
- The automated browser has no microphone device. The public voice UI failed immediately to a clear screenshot/text recovery message rather than entering an indefinite recording state.
- Public negative-path probes returned `400` for missing local voice consent, `413` for an 8.5 MB voice file, and JSON `404` for an unknown API route.
- Tesseract currently emits two non-fatal parameter compatibility notices during successful OCR. They do not interrupt or alter the returned assessment.

## Remaining risk

- This was not the unavailable six-worker Codex Security Deep Scan and does not claim exhaustive vulnerability discovery.
- Anonymous client telemetry can be rate-limited and schema-bounded, but it is not identity-attested. Institutional reports must continue to label it observed telemetry, not independently verified fraud outcomes.
- API and ReDoc/OpenAPI documentation remain public. This increases route discoverability but does not bypass route authorization.
- The CSP still permits inline script/style execution and WebAssembly evaluation for the current frontend runtime. Removing those allowances requires nonce/hash plumbing and frontend compatibility work.
- In-memory rate limits reset on process restart and are not a substitute for Cloudflare edge rate limiting.
- WhatsApp remains intentionally unavailable until all Meta credentials, especially `WHATSAPP_APP_SECRET`, are configured and verified.
