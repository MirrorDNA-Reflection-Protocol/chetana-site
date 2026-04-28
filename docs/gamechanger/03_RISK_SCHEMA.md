# Risk Schema

## Risk levels

`safe`
- No strong scam indicators.
- Only allowed when the input is rich enough to evaluate.

`caution`
- Thin, incomplete, or low-signal material.
- Also used for weak anomalies where independent verification is still required.

`suspicious`
- Multiple weak indicators or one meaningful indicator.
- User should not proceed on message authority alone.

`dangerous`
- Strong scam pattern with likely loss if the user acts.
- Default instruction: stop and verify independently.

`critical`
- High-confidence active scam, device compromise, OTP/PIN capture, remote access, APK in authority context, digital arrest, mule-account flow, or already-compromised state.

## Anti-failure rule

If evidence is thin, Chetana must not produce a comforting `safe` verdict.
It should set:
- `insufficientEvidence: true`
- `riskLevel: caution`
- `missingInfo` with the next best capture step

## Canonical threat types

- `fake_ekyc_apk`
- `fake_echallan`
- `apk_malware`
- `qr_payment_tampering`
- `qr_receive_money_scam`
- `qr_phishing`
- `remote_access_takeover`
- `otp_pin_capture`
- `voice_deepfake_call`
- `cyber_slavery_recruitment`
- `mule_account_recruitment`
- `digital_arrest`
- `financial_flow_anomaly`
- `fake_customer_support`
- `investment_trading_scam`
- `courier_customs_scam`
- `job_scam`
- `unknown`

## Standard user copy

Critical:
- “Stop. This matches a known high-risk fraud pattern.”

Dangerous:
- “Do not proceed until you verify independently.”

APK:
- “No bank, utility, challan, subsidy, or support team should send you an APK over chat.”

QR:
- “QR codes usually start payment or open a link. Do not scan a QR to receive money.”

Personal details:
- “Knowing your details does not prove legitimacy. It may be the trap.”

Recovery:
- “Use another clean device. Do not trust the suspected phone for banking recovery.”
