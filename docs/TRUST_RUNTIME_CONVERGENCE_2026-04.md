# Chetana Trust Runtime Convergence - 2026-04

This note closes the restored Downloads specs against the live `chetana-site` codebase.

## Source Inputs Closed Here

- `~/Downloads/ActiveMirrorOS_Trust_Runtime_v1.md`
- `~/Downloads/ActiveMirrorOS_Trust_Runtime_v2.md`
- `~/Downloads/chetana_safety_layer_v2.md`
- `~/Downloads/fraud_timeline_engine_v0_1.md`
- `~/Downloads/chetana_kyc_module_spec_v0_1.md`
- `~/Downloads/files/chetana-redesign.html`

## What is already live in the local repo

Local repo code now includes:
- `POST /api/v0/trust/send-guard`
- `POST /api/v0/trust/merchant`
- `POST /api/v0/trust/recovery`
- `POST /api/v0/trust/bundle`

Core local implementation lives in:
- `backend/app/v0_runtime.py`
- `backend/app/main.py`
- `frontend/src/ChetanaV0Experience.tsx`
- `frontend/src/chetanaV0.ts`

## Spec-to-code mapping

### Trust Runtime v1 -> v2

v1 is now historical input only.

v2 is the governing interpretation:
- belief, intent, transaction, release, recovery
- official recovery rails
- recovery packet as a first-class contract

This is now partially realized in the local repo through the trust-bundle flow.

### Safety Layer v2

Desired output shape:
- `risk_level`
- `reason`
- `next_steps`
- `avoid`
- `confidence`

Current repo state:
- scan outputs and guidance exist
- trust-bundle runtime exists
- parts of the exact formal output contract are still spread across multiple paths rather than one clean v2 schema for every surface

### Fraud Timeline Engine

Current state:
- useful concept
- not yet a standalone staged S0-S6 classifier in the runtime

Decision:
- keep it as a Chetana sub-flow, not a separate product lane

### KYC Module

Current state:
- KYC scam patterns exist in the product
- full local PAN/KRA interpretation flow is not yet implemented end to end

Decision:
- keep it as a Chetana sub-flow, not a separate product lane

### Downloads redesign

`files/chetana-redesign.html` is now preserved in this repo as:
- `docs/redesign-from-downloads-2026-04.html`

Reason:
- it does not exactly match the existing `docs/redesign.html`
- it is useful as a design snapshot, but it is not the canonical live app

## Public edge note

`https://chetana.activemirror.ai/` is live publicly, but the promoted local trust-bundle runtime has not been shipped to that public edge yet.

## Practical rule

Future Chetana trust work should land here first:
- trust runtime changes
- recovery contract changes
- KYC and fraud-timeline sub-flows
- redesign snapshots that materially differ from the current docs or app
