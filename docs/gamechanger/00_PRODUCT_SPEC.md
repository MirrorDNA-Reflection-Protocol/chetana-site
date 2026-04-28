# Product Spec

## One-line definition

Chetana is a pre-action fraud interception and recovery system that warns the user
before they install, scan, pay, travel, share a secret, or obey a coercive instruction.

## Product thesis

Detection alone is not enough. Chetana must:
- classify the threat fast
- explain the threat plainly
- make the next action obvious
- hand the user to verified official rails when stakes are high

## Primary users

- Elderly users and families exposed to WhatsApp, SMS, browser, and call scams.
- Android users vulnerable to APK sideload traps and remote-access fraud.
- Small merchants exposed to QR tampering and fake payment proof.
- Job seekers vulnerable to overseas cyber-slavery recruitment and passport coercion.
- Users already compromised who need a fast recovery path.

## Canonical input surfaces

1. Paste suspicious text or a suspicious link.
2. Share from WhatsApp, SMS, email, or browser into Chetana.
3. Decode or paste a QR payload before opening or paying.
4. Upload APK metadata or a suspicious install pitch.
5. Summarize a suspicious call or voice request.
6. Paste overseas job or recruiter details.
7. Trigger emergency mode for already-installed, already-paid, OTP-shared, or remote-access cases.

## Canonical output contracts

Analysis response:
- see `contracts/analysis-response.schema.json`

Emergency response:
- see `contracts/emergency-response.schema.json`

Non-negotiable fields:
- verdict
- reason evidence
- do-not-do list
- recommended actions
- official rails
- no false-safe clearance on thin evidence

## Non-negotiable UX

- The app must not behave like a generic chatbot.
- Paste and QR checks should return a clear verdict in under 5 seconds.
- Emergency mode must always expose official rails, escalation order, and a ready-to-speak handoff script.
- “Safe” is allowed only when the material is sufficiently rich and the rule engine sees no strong red flags.

## Core lanes

1. Authority scams
2. APK / device takeover
3. QR / UPI traps
4. Voice / deepfake / vishing
5. Overseas job / cyber-slavery recruitment
6. Mule-account / SIM rental
7. Digital arrest / fear scams
8. Financial flow anomalies

## MVP build order

1. Canonical FastAPI analyze + emergency + rails API.
2. Backend-first Expo app for message / QR / emergency.
3. Screenshot OCR and QR decode.
4. Android share-to-Chetana and APK metadata extraction.
5. Merchant QR shield and family shield.
6. Multilingual copy and attribution-aware distribution loop.
