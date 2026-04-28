# Threat Model

## Core adversary patterns

### Fake e-KYC / utility / telecom / bank

Attack path:
leaked data → authority claim → urgency → link/APK/OTP → device compromise or transaction.

Hard rule:
authority claim + APK = critical.

### APK malware

Risk markers:
- APK sent via WhatsApp/SMS/Telegram/email.
- Permission requests: SMS, notification listener, accessibility, overlay, contacts, call logs.
- Claims to be KYC, RTO challan, bank reward, electricity, subsidy, loan, courier.

Hard rule:
APK + financial/authority context = critical.

### Remote access

Risk markers:
- AnyDesk, TeamViewer, QuickSupport, screen share, remote support.
- Financial context.
- OTP/PIN request.

Hard rule:
remote access + money/bank/payment = critical.

### QR tampering / quishing / fake UPI

Risk markers:
- physical sticker over legitimate QR
- merchant name mismatch
- scan requested to “receive money/refund”
- UPI collect/payment request
- QR URL goes to shortener, lookalike domain, APK, non-HTTPS, IP address, punycode domain
- payment amount prefilled unexpectedly

Hard rule:
“scan QR to receive money/refund” = dangerous/critical depending on PIN/payment context.

### Cyber-slavery recruitment

Risk markers:
- overseas digital job in Cambodia/Laos/Myanmar/Thailand
- tourist visa for work
- agent fee
- passport handover
- unrealistic salary
- crypto/customer support/trading/gaming/typing jobs
- no registered company or agency
- recruiter pushes secrecy/urgency

Hard rule:
SEA destination + digital job + tourist visa/agent fee = dangerous.

### Mule account recruitment

Risk markers:
- “rent your account”
- “receive funds and forward”
- commission for UPI/bank account
- SIM/card/account handover
- Telegram job with daily payout
- “no work, passive income”

Hard rule:
bank account/UPI/SIM access + commission = critical.

### Digital arrest / coercive authority

Risk markers:
- fake police/CBI/ED/customs/court
- “digital arrest”
- video call interrogation
- demand for secrecy
- money transfer to “safe account”
- fake warrant

Hard rule:
law-enforcement authority + money transfer/secrecy/video custody = critical.

## Trust-simulation principle

The fact that the attacker knows the user's details is not proof of legitimacy. It is often the attack vector.

## Detection philosophy

Rules decide. AI explains. Human stays in control.

Do not allow an LLM to downgrade deterministic critical rules.
