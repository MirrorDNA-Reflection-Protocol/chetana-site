# Chetana Runtime Ladder Design

Date: 2026-06-26
Status: Approved design direction, pending implementation plan
Owner: Active Mirror / Chetana

## Objective

Chetana should feel simple to a normal user: screenshot anything suspicious, upload or paste it, and ask Chetana whether it is safe.

The runtime ladder gives that simple surface a clear execution path. It keeps the first result fast and private, adds OCR only when it materially improves a weak scan, and keeps Chetana's deterministic scam-check runtime in charge of the final verdict.

## Current Context

- The public product remains Chetana at `chetana.activemirror.ai`.
- The current frontend already accepts user input and calls `/api/v0/scan`.
- The current backend scan path is wired to a deterministic analyzer, with optional local/model refinement behind runtime policy.
- The current user-facing positioning should not expose "MirrorGuard" as the primary product. MirrorGuard can remain an internal trust/runtime label if needed, but the page should read as Chetana, a simple scam checker.

## Goals

- Preserve the one-action promise: upload, paste, or screenshot a suspicious message and get a clear next step.
- Return the first result from local/browser extraction plus deterministic scan before any cloud OCR escalation.
- Add a manual `Improve scan` path for low-quality screenshots, dense documents, blurred text, or mixed image/text layouts.
- Use Mistral OCR only as an extraction fallback. It should not decide whether something is a scam.
- Expose the runtime source quietly: `local`, `local + OCR fallback`, or `needs clearer screenshot`.
- Keep raw screenshots and extracted scam content out of persistent analytics by default.

## Non-Goals

- No autonomous training loop in this version.
- No silent cloud upload.
- No WebLLM reasoning path in the first version of the ladder.
- No GPU-hosted custom OCR service in the first version.
- No user-facing product rename from Chetana to MirrorGuard.

## Runtime Ladder

```text
User screenshot, paste, or text
  -> browser extraction
  -> scan quality check
  -> deterministic Chetana scan
  -> clear result and safe next step

If extraction quality is weak
  -> show result with Improve scan
  -> user grants cloud OCR consent
  -> Mistral OCR extracts text and structure
  -> deterministic Chetana rescan
  -> clearer result with source: local + OCR fallback
```

The ladder is intentionally conservative. The app should produce a useful first answer even when OCR is unavailable, slow, rate-limited, or rejected by the user.

## Scam Checker Loop Receipt

Each completed first-pass or improved scan records a compact loop receipt:

```text
observe -> decide -> act -> verify -> record -> ratchet
```

The public UI only shows a small "Safety loop recorded" line with a short receipt hash. The backend stores the full loop phases in `~/.mirrordna/chetana/v0/loop_receipts.jsonl`.

Receipt rules:

- Chetana owns the verdict; OCR and model helpers can only improve extraction.
- Validators check schema acceptance, visible reasons, a safe next step, official-help guidance for high-risk scans, and no raw screenshot bytes in the receipt.
- Failed validators still produce a receipt and a next guard.
- Receipts are suitable input for future eval/training proposals, but they are not a training loop by themselves.

## Runtime Units

### BrowserExtractionProvider

Runs in the browser before the backend scan. It normalizes pasted text, uploaded images, and screenshots into a scan payload. It can use the current browser-side OCR stack, but it must return both text and quality metadata.

Output fields:

- `extracted_text`
- `source_type`
- `character_count`
- `confidence`
- `quality_flags`
- `image_metadata`

### ScanQualityClassifier

Classifies whether the local extraction is strong enough for the first scan. This is a lightweight deterministic check, not a model requirement.

Quality flags:

- `empty_text`
- `very_short_text`
- `low_ocr_confidence`
- `dense_document`
- `image_only_payment_request`
- `mixed_language_or_script`
- `possible_crop`

### ChetanaRuntime

Owns the verdict. It accepts extracted text plus metadata and returns the existing `V0Verdict` shape with added runtime provenance.

Responsibilities:

- Normalize scam indicators.
- Apply deterministic risk rules.
- Produce clear reasons.
- Produce a safe next step.
- Preserve the existing scan contract wherever possible.

### MistralOcrProvider

Runs only after explicit user action. It extracts better text and document structure from screenshots or documents. It does not produce the risk verdict.

Responsibilities:

- Accept image or document upload from the backend.
- Return extracted text and layout hints.
- Return OCR confidence and provider timing.
- Fail closed into the existing local result if the OCR provider times out or rejects the input.

### ConsentGate

Prevents accidental cloud upload. The user must trigger `Improve scan` before cloud OCR receives the file.

Required copy:

```text
Improve scan
Chetana can send this screenshot for stronger text extraction. Do not use this for private IDs, passwords, or bank statements.
```

### ScanVerdict Metadata

The frontend should show a compact source line without adding technical burden:

- `Checked locally`
- `Checked with OCR fallback`
- `Need a clearer screenshot`

Internal metadata:

- `runtime_source`
- `ocr_provider`
- `ocr_attempted`
- `ocr_latency_ms`
- `extraction_quality`
- `fallback_reason`

## API Design

Keep `/api/v0/scan` as the first-pass endpoint.

Request:

```json
{
  "text": "UPI payment request...",
  "input_type": "screenshot",
  "source_name": "uploaded screenshot",
  "extraction": {
    "source": "browser",
    "confidence": 0.72,
    "quality_flags": ["very_short_text"]
  }
}
```

Response:

```json
{
  "verdict": "high_risk",
  "risk_level": "high",
  "guidance_source": "deterministic",
  "safe_next_step": "Do not pay, approve, or release anything yet.",
  "reasons": ["urgency_pressure", "asks_for_money"],
  "runtime_source": "local",
  "extraction_quality": "weak",
  "can_improve_scan": true
}
```

Add `/api/v0/scan/improve` for cloud OCR escalation.

Request:

```json
{
  "scan_id": "optional-client-scan-id",
  "input_type": "screenshot",
  "source_name": "uploaded screenshot",
  "consent_token": "cloud-ocr-consent",
  "local_extracted_text": "partial local OCR text",
  "quality_snapshot": {
    "confidence": 0.41,
    "quality_flags": ["low_ocr_confidence", "possible_crop"]
  }
}
```

The request also carries the uploaded file as multipart form data or a short-lived backend file reference.

Response:

```json
{
  "verdict": "medium_risk",
  "risk_level": "medium",
  "guidance_source": "deterministic",
  "safe_next_step": "Verify the sender through an official number before replying.",
  "reasons": ["unverifiable_contact", "asks_for_otp"],
  "runtime_source": "local + OCR fallback",
  "ocr_provider": "mistral",
  "ocr_attempted": true,
  "ocr_latency_ms": 6400,
  "extraction_quality": "strong"
}
```

## User Experience

The page should be minimal and visual:

- Primary surface: upload or paste a screenshot.
- Primary action: `Check this`.
- Result: risk level, plain-English reason, and one safe next step.
- Secondary action when needed: `Improve scan`.
- Runtime source: small, quiet copy below the result.

Do not explain the runtime ladder on the homepage. The user only needs to know what to do next.

## Speed And Hosting

Speed risk is real, but the first version should avoid expensive infrastructure.

The fast path should be browser extraction plus deterministic backend scan. That path should not wait for Mistral OCR or any cloud model.

Targets:

- First local result: under 3 seconds for normal text or readable screenshots.
- Improve scan result: hard timeout at 20 seconds.
- Upload limit: 8 MB for the first version.
- Client preprocessing: downscale and compress large screenshots before upload where quality allows.
- Concurrency: one improve scan per browser session at a time.

Hosting recommendation:

- Do not buy a GPU droplet for version one.
- A small CPU VPS is enough for the Chetana orchestrator if the current backend needs a stable production home.
- DigitalOcean is reasonable for a simple FastAPI service because it gives direct control over file upload limits, retries, logs, and background cleanup.
- Cloudflare should remain the static/front-door edge and light proxy layer. It is less attractive as the only OCR orchestrator when multipart upload handling, provider timeouts, temp file cleanup, and retry control are required.
- Keep Mistral OCR as an external provider rather than self-hosting OCR.

The practical answer: start with the current backend if it is stable enough, otherwise use one small CPU VPS. Upgrade only after measuring p95 local scan latency, p95 improve-scan latency, timeout rate, and OCR provider cost.

## Privacy And Retention

- Cloud OCR requires explicit user action.
- The app should warn users not to upload private IDs, passwords, or full bank statements.
- Raw screenshots should be deleted after processing.
- Persistent logs should store metadata only: scan timing, quality flags, verdict class, provider status, and error class.
- Persistent logs should not store raw extracted text unless a separate evidence-retention mode is explicitly designed.

## Failure Handling

- If browser extraction fails, let the user paste text manually or use `Improve scan`.
- If cloud OCR times out, keep the local result and show `Need a clearer screenshot`.
- If OCR succeeds but the deterministic scan has low evidence, show a cautious medium or unclear result instead of overclaiming.
- If provider credentials are missing, hide `Improve scan` and keep the simple local checker.

## Testing And Acceptance

Acceptance checks:

- Text-only scam message returns a local deterministic verdict.
- Readable screenshot returns a local deterministic verdict.
- Blurry screenshot returns a local result plus `Improve scan`.
- `Improve scan` cannot run without explicit consent.
- Mistral OCR output is rescanned by Chetana, not returned as the verdict.
- OCR timeout preserves the original local result.
- Runtime source displays correctly for local, OCR fallback, and unclear cases.
- Logs exclude raw screenshots and raw extracted text.

Manual UX check:

- A first-time user can understand the page in under five seconds.
- The first visible action is upload, paste, or screenshot scan.
- The page does not lead with architecture, loops, model names, or MirrorGuard language.

## Rollout Plan

1. Add runtime metadata to the existing scan contract without changing the main result layout.
2. Add scan quality detection to the browser and backend boundary.
3. Add the `Improve scan` consent state in the frontend.
4. Add `/api/v0/scan/improve` behind an environment flag.
5. Wire Mistral OCR as an extraction provider.
6. Add timeout, upload-size, and cleanup controls.
7. Ship with local scan enabled and OCR fallback disabled by default in production.
8. Enable OCR fallback after a live privacy and latency pass.

## Open Decisions

- Provider credentials and the exact Mistral OCR model identifier will be selected through runtime configuration during implementation.
- The production host can remain the current backend if it meets the latency and uptime targets. If it does not, move the orchestrator to a small CPU VPS.
- WebLLM can be reconsidered later as an offline helper for explanation rewriting or lightweight local classification, but it is outside the first implementation plan.

## Approved Direction

Build the runtime ladder, not a new autonomous brain loop. Chetana stays simple on the surface and conservative under the hood: local first, manual OCR fallback, deterministic verdict ownership, explicit privacy boundaries, and measured hosting upgrades.
