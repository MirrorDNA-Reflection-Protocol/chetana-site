# QR Module

## What it catches

1. Fake merchant QR pasted over a real QR.
2. QR used to trick user into sending money while claiming to receive money.
3. QR that opens a phishing website.
4. QR that downloads an APK.
5. QR that uses a URL shortener or lookalike domain.
6. QR that pre-fills a UPI payment amount unexpectedly.
7. QR in a courier/parcel/brushing scam.

## User flow

1. User opens “Scan QR safely”.
2. Chetana decodes but does not immediately open the URL/payment app.
3. It shows:
   - decoded destination
   - payment recipient or domain
   - amount, if present
   - risk verdict
4. User chooses:
   - open payment app
   - cancel
   - report/share warning

## UPI payload checks

UPI URI format normally resembles:

```text
upi://pay?pa=merchant@upi&pn=Merchant%20Name&am=100&cu=INR
```

Important fields:
- `pa`: payee VPA
- `pn`: payee name
- `am`: amount
- `cu`: currency
- `tn`: transaction note

Risk logic:
- If the social context says “receive/refund/reward” and QR is `upi://pay`, warn: scanning this initiates a payment path, not a receive path.
- If payee name does not match the merchant/person expected, warn.
- If amount is prefilled and user did not expect it, warn.
- If QR contains a URL, inspect domain before opening.
- If URL contains `.apk`, classify critical.

## Physical tamper prompt

Chetana cannot infer sticker tampering from payload alone. Ask:
- “Is this QR printed permanently, or does it look like a sticker?”
- “Does the merchant name shown in your UPI app match the shop?”
- “Did the shopkeeper confirm they received the payment?”

## Merchant mode

For shopkeepers:
- Save official QR fingerprint: expected VPA, merchant name, domain.
- Daily quick scan verifies public QR still resolves to same VPA.
- Alert if changed.
