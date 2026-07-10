# Chetana Alignment and Leverage Sweep

Date: 2026-07-10

## Decision

Chetana should remain a narrow fraud-pause product:

> Screenshot anything suspicious. Ask Chetana. See the warning signs and the safest next action.

It is not a generic chatbot, fraud database, deepfake detector, government portal, or bank-grade transaction decision engine. The durable wedge is a private, low-friction second opinion before a person pays, shares an OTP, installs an app, approves UPI, or releases goods.

The product contract is:

1. Intake: screenshot, pasted text, QR/payment context, or one-tap incident context.
2. Decide: deterministic scam-pattern and evidence-state analysis.
3. Explain: reasons, missing evidence, uncertainty, and the safest next action.
4. Act: share warning, save a compact case packet, or open an official rail.
5. Learn: aggregate source tags, verdicts, follow-through, and bucketed correction feedback without sponsor-visible raw content.

## Canonical State

- Canonical writer: `/Users/mirror-pro/repos/chetana-site-live`
- Public origin: `https://chetana.activemirror.ai`
- Local production backend: `127.0.0.1:8093`
- Local frontend preview: `127.0.0.1:8096`
- Runtime: FastAPI, React/Vite, Cloudflare Tunnel, local Ollama
- Canonical verdicts: `high_risk`, `caution`, `needs_review`, `low_signal`
- Explicitly absent: a `safe` verdict

The old `/Users/mirror-pro/repos/chetana-site` checkout and `/Users/mirror-pro/repos/kavach` are adjacent, dirty worktrees. They are not writers for this change and must not be merged into the live lane without a scoped reconciliation.

## What Is Real Now

### Shipped

- Screenshot and pasted-text intake.
- Browser-side English and Hindi OCR through Tesseract.
- QR extraction where the browser supports `BarcodeDetector`, with OCR fallback.
- Deterministic four-state verdicts with reasons, evidence state, confidence band, and recovery guidance.
- No-login web/PWA experience and installed-PWA image share target.
- First-visit mobile flow keeps the screenshot action in the initial viewport; install promotion waits until after a completed check.
- Official rails including 1930, cybercrime.gov.in, NCRP suspect search, Chakshu, and RBI CMS.
- Evidence packs, trust bundles, action routing, SendGuard, merchant release checks, recovery packets, and loop receipts.
- Sponsor-safe PilotTrace aggregates and source-tagged field-pilot links.
- Local threat-thread memory and explicit local-memory clearing.

### Partial

- Hindi: screenshot reading and local translation-assisted checks are beta. The full front door and every scam class are not yet language-parity tested.
- Voice: the front door records a clip locally but does not transcribe or analyze it yet. Voice alone cannot complete a check.
- Media evidence: hashes and receipt structure exist, but no validated provenance or manipulation detector is live.
- Threat intelligence: the embedded Kavach seed works, but its last broad feed refresh was 2026-04-14 and cannot be treated as fresh production evidence.
- Mobile: Expo/native tracks are scaffolds. No current Pixel or OnePlus end-to-end receipt proves the installed share flow.
- Browser Guard, WhatsApp, and Telegram paths exist as code or concepts, but are not part of the verified public core loop.

### Proposed

- Local Whisper transcription after real browser and phone performance tests.
- C2PA/content-credential inspection as provenance evidence, never as a truth oracle.
- Duplicate-media indexing, consented evidence preservation, analyst review, and a public receipt verifier.
- A bank/PSP SDK, branch QR pilot, and partner API after the consumer loop produces defensible outcome data.
- MirrorProd integration. The July build pack calls it established, but no live proof was found in the canonical Chetana runtime.

### Rejected Until Validated

- Deepfake detection from metadata, error-level analysis, skin, noise, or other unbenchmarked heuristics.
- Any claim that a UPI ID or phone number was checked against a comprehensive Indian fraud database.
- Automatic complaint filing.
- Raw screenshot, message, phone, UPI, or URL collection for sponsor reporting or model training by default.
- A binary safe/unsafe answer.
- OpenPhish or VirusTotal public data in a commercial/sponsored product without the required license.

## Build-Pack Disposition

The July 2026 build pack has the right doctrine but mixes current and aspirational modules.

| Build-pack item | Current disposition | Chetana decision |
| --- | --- | --- |
| Message and screenshot verification | Shipped | Keep as the front door |
| Threat Thread | Shipped locally | Keep private and user-clearable |
| SendGuard | Shipped backend contract | Expose only when the user is about to act |
| Merchant and recovery flows | Shipped/partial | Keep as contextual next actions |
| Media Evidence Gate | Partial | Add provenance checks only after evals |
| Browser Guard | Proposed/unverified | Separate pilot, not homepage promise |
| Public verifier | Proposed | Build after stable receipt schema and abuse review |
| Human review | Proposed | Add only with consent, access control, and retention rules |
| MirrorProd integration | Unproven | Label proposed until a live receipt exists |
| Safe/unsafe/unsure output | Conflicts with v0 | Use the four-state Chetana contract |
| Original preservation | Conflicts with privacy default | Preserve only through explicit evidence opt-in |

The strongest build-pack additions are the evaluation metrics: false reassurance, severity misses, prevention or pause, analyst overturn, time to action, reason completeness, evidence completeness, and correction handling. These belong in the harness and PilotTrace, not as unsourced marketing numbers.

## Active Mirror Leverage

The best reusable Active Mirror primitive is the unshakeable loop, not the broader operating-system vocabulary.

Adapt the six phases to each Chetana scan:

1. Observe: normalize the user input and extraction quality.
2. Decide: produce the four-state verdict and action eligibility.
3. Act: show the safest next action and official rail.
4. Verify: check that the output includes reasons, uncertainty, and no unsupported clearance.
5. Record: write the privacy-scoped loop receipt and aggregate event.
6. Ratchet: turn correction feedback and failed checks into a bounded rule/eval change.

Every failed scan must still produce a truthful receipt. A model, agent, or operator cannot approve its own high-risk rule promotion. Every promoted rule needs a regression fixture and rollback path.

Do not import AMOS or MirrorBrain terminology into the consumer UI. Users need `Check`, `Why`, and `What to do`, not an operating-system explanation.

## Runtime Ladder

The dependable ladder is:

1. Browser-local extraction and deterministic checks.
2. Chetana server deterministic scan and local seed enrichment.
3. Installed local Ollama explanation/translation models.
4. Explicit, consented specialist service only when it adds evidence that local processing cannot provide.

Cloud chat fallback is disabled by default. The public status route must distinguish models configured in policy from models actually present in Ollama. Missing optional models must not delay or block the deterministic verdict.

Voice should follow a separate ladder:

1. Record and retain only in the browser by default.
2. Decode to 16 kHz PCM locally.
3. Transcribe with browser Whisper/WebGPU only after a visible one-time model download and capability check.
4. Run scam-pressure rules on transcript text.
5. Offer a consented server fallback only when local transcription is unavailable.

Do not call this deepfake detection. It is voice-message transcription plus impersonation-pressure analysis.

## Source and API Ladder

### Practical candidates

- [Google Cloud Web Risk](https://cloud.google.com/web-risk/pricing): commercial URL reputation; Lookup API currently includes 100,000 calls per month at no charge, then usage pricing.
- [PhishTank API](https://phishtank.org/api_info.php): low-volume URL checks or a periodically downloaded local database; use an application key and preserve provider attribution.
- [URLhaus](https://urlhaus-api.abuse.ch/): useful for malware delivery and APK/dropper links; current API requires a free Auth-Key and is not a general phishing or persuasion feed.
- [Phishing.Database](https://github.com/Phishing-Database/Phishing.Database): candidate local feed for offline URL enrichment, subject to freshness and false-positive controls.
- [Cloudflare URL Scanner](https://developers.cloudflare.com/radar/investigate/url-scanner/): analyst-only investigation. Scans are public by default and successful scans are retained for 12 months.

### Blocked or restricted by default

- [Google Safe Browsing](https://developers.google.com/safe-browsing/v4/usage-limits) is non-commercial only; use Web Risk for a sponsored or revenue-generating product.
- [OpenPhish](https://openphish.com/terms.html) prohibits commercial use without prior written consent.
- [VirusTotal Public API](https://docs.virustotal.com/reference/public-vs-premium-api) must not be used in commercial products and is limited to 500 requests/day and 4/minute.
- urlscan and other public sandboxes can expose sensitive submitted URLs. Keep them analyst-only with explicit consent.

### Official manual rails

- [SEBI Check](https://siportal.sebi.gov.in/intermediary/sebi-check) for verified UPI IDs and account details belonging to securities-market intermediaries.
- [Parivahan eChallan](https://echallan.parivahan.gov.in/index/check-challan-status) for independent challan verification.
- [National Consumer Helpline](https://consumerhelpline.gov.in/public/about) at 1915 for consumer grievances; 1930 remains the cyber-financial-fraud emergency rail.
- [UIDAI biometric lock](https://uidai.gov.in/index.php?Itemid=2524&id=925&lang=en&option=com_content&view=category) and 1947 after suspected Aadhaar exposure.

No stable public API was found for I4C suspect data, CFCFRMS, DoT FRI/DIP, arbitrary UPI fraud verification, or a comprehensive Indian phone-number fraud database. Treat those as manual or partnership-only rails.

## Evaluation Data

Public datasets can test generic failure modes but cannot prove Indian production readiness:

- UCI SMS Spam Collection for baseline message classification.
- UCI PhiUSIIL for malicious URL regression.
- CIC-Trap4Phish for QR/document stress tests after confirming the exact license.
- AI4Bharat speech and translation corpora for language robustness, not scam labels.

The useful proprietary dataset is consented, de-identified Chetana corrections. Collect aggregate feedback by default. Raw examples require a separate opt-in research consent, redaction, retention period, access policy, and deletion path.

## Why Banks and Government Would Use It

Chetana should not sell another fraud score. The institutional offer is a measurable pre-transaction pause layer:

- distribution through branch, ATM-lobby, statement, merchant-counter, school, and WhatsApp QR placements;
- a private second opinion before money or credentials move;
- official recovery and verification rails rather than a dead-end warning;
- aggregate proof of scans, high-risk pauses, follow-through actions, false-safe complaints, and campaign source tags;
- no sponsor-visible raw messages, screenshots, UPI IDs, phone numbers, or identity graph.

The most concrete discovery path is the [RBIH Fintech Repository](https://docs.rbihub.in/fintech-repository). A verified organization profile can make Chetana visible to financial institutions and RBIH programs. After repository approval, the separate [DPI application path](https://docs.rbihub.in/fintech-repository/managing/apply-to-a-dpi) can position Chetana as a model provider, data provider, or model consumer where appropriate.

Before outreach, Chetana needs one 30-day field receipt with:

- one named audience;
- frozen source tags;
- at least one real distribution partner;
- measured pause and follow-through outcomes;
- reviewed false-safe and false-alarm feedback;
- a privacy statement and deletion process;
- no claim that local development events are real-user impact.

## Current Evidence and Gaps

The local PilotTrace ledger currently contains 68 completed scans, 61 high-risk pauses, 6 follow-through actions, 5 copied case packets, and 1 completed share across 429 unique sessions in the selected 90-day window. These are local aggregate events, not verified users, prevented losses, or sponsor outcomes.

Material gaps:

- no partner inquiries in the current ledger;
- no official-rail taps in the current ledger;
- no correction feedback yet;
- no verified mobile share-target receipt;
- stale broad threat-feed refresh;
- dead scheduled feed-refresh command in the machine manifest;
- recent Cloudflare edge/DNS instability despite current recovery;
- voice transcription absent from the main front door;

## Build Sequence

1. Truth lock: keep public claims, language tiers, model status, API licensing, and source freshness machine-readable and tested.
2. Front-door compression: first pass shipped on 2026-07-10; keep measuring screenshot selection and first-check completion before adding more copy.
3. Voice beta: local decode/transcription, pressure analysis, explicit model download state, and Pixel/OnePlus receipts.
4. Harness ratchet: add build-pack metrics, known-good/known-bad fixtures by scam class, and reviewed correction promotion.
5. Feed repair: replace the dead scheduled refresh command, obtain required keys/licenses, timestamp every source, and fail closed when stale.
6. Field pilot: run one source-tagged 30-day cohort and publish sponsor-safe PilotTrace proof.
7. Institutional discovery: register in RBIH Fintech Repository and approach bank/PSP/CSR partners with the field receipt, not a capability deck alone.

This sequence keeps the differentiator simple for a person in India while building the proof surface an institution can actually evaluate.
