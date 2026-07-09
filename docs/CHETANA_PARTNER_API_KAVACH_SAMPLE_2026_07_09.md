# Chetana Partner API Kavach Enrichment Sample - 2026-07-09

Purpose: show banks, PSPs, merchant networks, and public-sector pilots how Chetana exposes local identifier enrichment without claiming official suspect-registry access.

## Endpoint

```http
POST /api/v1/scan
Authorization: Bearer <partner_api_key>
Content-Type: application/json
```

## Request

```json
{
  "text": "Pay kyc.update.sbi@oksbi now to unblock your account.",
  "lang": "en",
  "input_type": "text",
  "source_name": "partner_redacted_channel"
}
```

## Redacted Response Shape

```json
{
  "scan_id": "chetana-scan-redacted",
  "verdict": "high_risk",
  "risk_level": "high",
  "confidence_band": "high",
  "evidence_state": "partial",
  "incident_state": "payment_requested",
  "scam_type": "fake_kyc",
  "score": 91,
  "reason_codes": [
    "urgency_pressure",
    "asks_for_money",
    "impersonates_authority",
    "unverifiable_contact"
  ],
  "recommended_actions": [
    "do_not_pay",
    "verify_with_official_source",
    "report_and_block"
  ],
  "safe_next_step": "Do not pay, approve, or release anything yet.",
  "kavach_enrichment": {
    "source": "chetana_local_kavach_seed",
    "risk_level": "high",
    "max_score": 100,
    "summary": "Local Kavach enrichment found high-risk identifier or payment-proof signals.",
    "no_match_is_safe": false,
    "indicators": [
      {
        "kind": "upi",
        "normalized": "kyc.update.sbi@oksbi",
        "risk_level": "high",
        "score": 100,
        "matched": true,
        "match_type": "kyc_fraud",
        "signals": [
          "Known reported UPI pattern: kyc fraud.",
          "Suspicious words in UPI name: kyc, sbi, update.",
          "Possible authority or bank impersonation in UPI name: sbi."
        ],
        "provider": {
          "handle": "oksbi",
          "provider": "SBI / Google Pay",
          "known": true
        },
        "reports": 112
      }
    ]
  },
  "disclaimer": "Automated trust assessment only. Use official institutional review and recovery processes for final action."
}
```

## Partner Interpretation

- Treat `verdict`, `safe_next_step`, and `recommended_actions` as the product-level Chetana decision.
- Treat `kavach_enrichment` as a deterministic local enrichment signal for UPI IDs, phone numbers, and merchant payment-proof text.
- `no_match_is_safe: false` is mandatory. A missing local match must never clear a transaction, account action, or release decision.
- This sample does not imply I4C, FRI, Chakshu, bank, or government suspect-data access.
- For live pilots, partners should log only redacted scan IDs, verdicts, action routing, timing, aggregate outcomes, and consented evidence fields.
