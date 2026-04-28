# Permissions and Privacy Design

## Principle

Ask for permissions only when the feature is used. Default mode must work with no sensitive permissions.

## Permission tiers

### Tier 0: No permission

- paste text
- manually enter phone/link/job details
- decoded QR payload pasted by user
- emergency guide

### Tier 1: Low-risk permission

- camera for QR scanning
- file picker for screenshot/APK
- share-sheet receive intent

### Tier 2: Sensitive opt-in

- notification listener
- package visibility
- installed-app visibility
- accessibility

These require explicit explanation, narrow collection, and local-first processing.

## Strong recommendation

Avoid accessibility in v1. It damages trust and can resemble the same abuse pattern used by malware. Use notification listener and share-sheet first.

## Data handling

- Process text locally when possible.
- Upload APK only with explicit consent.
- Store only hashes and redacted signals by default.
- Never store OTPs, PINs, full bank details, Aadhaar/PAN, or full screenshots unless user explicitly opts into evidence preservation.
- Provide “delete my data” control.
- Keep an append-only local audit log visible to user.

## Policy constraints

Consumer Chetana should not claim it can block every malicious APK install. Android limits package visibility and sensitive permissions. Use pre-action scanning, share-sheet interception, and explicit user consent. Enterprise device-owner mode can enforce stronger controls later.
