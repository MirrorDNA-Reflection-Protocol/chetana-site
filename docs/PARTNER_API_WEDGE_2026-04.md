# Chetana Partner API Wedge

## Positioning

Chetana should present two linked wedges:

- consumer: `check before you act`
- institutional: `trust and recovery infrastructure for scam response`

The partner API is not a generic fraud score feed. It is a `verify-before-action` and `recovery-aware` API for:

- banks and PSPs
- merchants and marketplaces
- telecom and platform abuse teams
- public-sector fraud, cybercrime, and citizen-support teams
- NGOs and helplines helping scam victims

## Product Contract

Institutional users should get one canonical contract:

- verdict
- risk level
- evidence state
- incident state
- scam type
- reason codes
- recommended actions
- safe next step
- structured guidance
- official recovery rails

This is why `/api/v1/scan`, `/api/v1/trust/bundle`, and `/api/v1/recovery` now matter more than thin raw score endpoints.

## Good Early Use Cases

- bank app: warn before UPI approval or suspicious beneficiary changes
- merchant dashboard: block fake payment-proof release and generate recovery packet
- telecom or cybercrime desk: normalize citizen complaints into one trust contract
- government helpline: generate operator-safe next steps and escalation order
- platform abuse queue: turn suspicious chat or seller onboarding text into structured case data

## Go-To-Market Shape

Start with operators who already face scam pressure and need actionable outputs:

- payment support teams
- merchant fraud desks
- bank dispute and escalation teams
- public-sector cyber response desks

Sell the API on:

- better intake quality
- faster triage
- clearer handoffs
- better recovery instructions
- less operator variance under pressure

## Non-Negotiables

- local-first scan and chat analysis
- machine-readable reason codes
- recovery rails by incident type
- rate-limited authenticated access
- no “safe” verdict
- auditability on every partner response

## Near-Term Build Gaps

- signed decision receipts for partner responses
- webhook or case-push mode for high-risk incidents
- partner-specific policy packs by sector
- stronger case persistence beyond incident-mode sessions
- partner docs and example integrations
