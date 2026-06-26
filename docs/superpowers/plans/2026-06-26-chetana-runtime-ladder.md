# Chetana Runtime Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved Chetana runtime ladder: local scan first, manual OCR fallback with consent, and deterministic Chetana verdict ownership.

**Architecture:** The backend owns scan provenance, quality classification, and the `/api/v0/scan/improve` consent-gated endpoint. The frontend extracts browser-side text plus quality metadata, sends that to `/api/v0/scan`, and exposes a small `Improve scan` action only when the backend marks the local scan as weak. Mistral OCR is isolated behind a provider module and environment flag so local scan remains the default.

**Tech Stack:** FastAPI, Pydantic v2, httpx, React 18, TypeScript, Vite, Tesseract.js browser OCR.

---

## File Structure

- Modify `backend/app/v0_runtime.py`: add extraction metadata models and runtime source fields, classify scan quality, and preserve default compatibility for existing callers.
- Create `backend/app/mistral_ocr.py`: encapsulate Mistral OCR configuration, file-size checks, base64 data-url payload creation, response parsing, latency reporting, and fail-closed errors.
- Modify `backend/app/main.py`: import file upload primitives, add `/api/v0/scan/improve`, enforce consent, call Mistral OCR only when configured, and rescan OCR text through `analyze_v0_scan`.
- Modify `backend/tests/test_v0_runtime.py`: cover weak screenshot metadata, text input local behavior, and default compatibility for manual `V0Verdict` construction.
- Modify `frontend/src/localScanner.ts`: expose `browserOCRWithConfidence()` while keeping `browserOCR()` compatible.
- Modify `frontend/src/chetanaV0.ts`: add extraction/runtime types, `extractScanInputForMode()`, quality flags, and a runtime source label helper.
- Modify `frontend/src/ChetanaV0Experience.tsx`: send extraction metadata, store the last file/text, add consent-gated `Improve scan`, clear stale trust artifacts on improved results, and display the runtime source line.
- Modify `frontend/src/styles.css`: add compact source and improve-card styling without changing the main page structure.

## Task 1: Backend Runtime Metadata

**Files:**
- Modify: `backend/app/v0_runtime.py`
- Test: `backend/tests/test_v0_runtime.py`

- [x] **Step 1: Add failing tests for runtime metadata**

Add tests that assert:

```python
scan = analyze_scan(V0ScanInput(input_type="screenshot", text="ok", extraction={"source": "browser", "confidence": 0.2, "quality_flags": ["low_ocr_confidence"]}))
assert scan.runtime_source == "needs clearer screenshot"
assert scan.extraction_quality == "weak"
assert scan.can_improve_scan is True
```

And:

```python
scan = analyze_scan(V0ScanInput(input_type="text", text="Please call me when free."))
assert scan.runtime_source == "local"
assert scan.can_improve_scan is False
```

- [x] **Step 2: Run the focused backend test**

Run:

```bash
PYTHONPATH=backend python3 -m pytest backend/tests/test_v0_runtime.py -q
```

Expected: the new metadata test fails before implementation.

- [x] **Step 3: Implement metadata models and classification**

Add `V0ScanExtraction`, runtime metadata fields on `V0Verdict`, `extraction` on `V0ScanInput`, and a helper that marks weak screenshot/image scans as improvable while keeping text scans local.

- [x] **Step 4: Run the focused backend test**

Run:

```bash
PYTHONPATH=backend python3 -m pytest backend/tests/test_v0_runtime.py -q
```

Expected: all tests pass.

## Task 2: Backend OCR Improve Endpoint

**Files:**
- Create: `backend/app/mistral_ocr.py`
- Modify: `backend/app/main.py`
- Modify: `backend/requirements.txt`

- [x] **Step 1: Add the OCR provider module**

Create a provider that:

- Requires `CHETANA_MISTRAL_OCR_ENABLED=1` and `MISTRAL_API_KEY`.
- Enforces `CHETANA_MISTRAL_OCR_MAX_BYTES`, defaulting to 8 MB.
- Calls `https://api.mistral.ai/v1/ocr` with `mistral-ocr-latest` by default.
- Returns extracted text, provider name, model, confidence, and latency.
- Raises typed unavailable/error exceptions without logging raw content.

- [x] **Step 2: Add `/api/v0/scan/improve`**

The endpoint accepts multipart form data:

```text
file
input_type
source_name
consent_token=cloud-ocr-consent
local_extracted_text
quality_snapshot
session_id
language_hint
```

It rejects missing consent, returns a fail-closed local result when OCR is unavailable, and rescans OCR text through `analyze_v0_scan` when OCR succeeds.

- [x] **Step 3: Run backend import and focused tests**

Run:

```bash
PYTHONPATH=backend python3 -m pytest backend/tests/test_v0_runtime.py -q
PYTHONPATH=backend python3 -c "from app.main import app; print(app.title)"
```

Expected: tests pass and app imports successfully.

## Task 3: Frontend Extraction Metadata And Improve Flow

**Files:**
- Modify: `frontend/src/localScanner.ts`
- Modify: `frontend/src/chetanaV0.ts`
- Modify: `frontend/src/ChetanaV0Experience.tsx`
- Modify: `frontend/src/styles.css`

- [x] **Step 1: Add browser OCR confidence**

Expose:

```ts
export async function browserOCRWithConfidence(imageFile: File): Promise<{ text: string; confidence: number | null }>
```

Keep `browserOCR(file)` returning only text for existing callers.

- [x] **Step 2: Add extraction payload builder**

Expose:

```ts
export async function extractScanInputForMode(mode: V0Mode, file: File | null, text: string): Promise<V0ExtractedInput>
```

It returns extracted text plus `source`, `confidence`, `quality_flags`, `character_count`, and basic `image_metadata`.

- [x] **Step 3: Wire `/api/v0/scan`**

Send the extraction metadata with the existing scan request and store the last extracted text/metadata for the improve path.

- [x] **Step 4: Add `Improve scan`**

Show the improve card only when `result.can_improve_scan` is true and a file exists. The button submits multipart form data with `consent_token=cloud-ocr-consent`, replaces the result with the improved verdict, clears stale evidence/trust artifacts, and shows a compact error if OCR is unavailable.

- [x] **Step 5: Display runtime source**

Show one quiet line under the result:

```text
Checked locally
Checked with OCR fallback
Need a clearer screenshot
```

## Task 4: Verification

**Files:**
- Verify only.

- [x] **Step 1: Backend tests**

Run:

```bash
PYTHONPATH=backend python3 -m pytest backend/tests/test_v0_runtime.py -q
```

Expected: pass.

- [x] **Step 2: Frontend typecheck**

Run:

```bash
npx tsc -b
```

from `frontend/`.

Expected: pass.

- [x] **Step 3: Production build**

Run:

```bash
npm run build
```

from `frontend/`.

Expected: pass. Review any generated receipt files before committing.

- [x] **Step 4: Local smoke**

Start the app if no server is already running, submit a weak screenshot/text simulation through `/api/v0/scan`, and confirm the response includes runtime metadata.

## Task 5: Commit

**Files:**
- Commit only the runtime ladder implementation and plan/spec docs.

- [x] **Step 1: Inspect status**

Run:

```bash
git status --short
```

- [x] **Step 2: Stage scoped files**

Stage only files changed for this implementation.

- [x] **Step 3: Commit**

Run:

```bash
git commit -m "Implement Chetana runtime ladder"
```
