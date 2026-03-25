# SPEC: CNAP and SIM-Binding Signal Integration

**Status:** SPEC ONLY -- waiting for public API
**Author:** Mirror Twin / Paul
**Date:** 2026-03-25
**Phase:** Future (post-Phase 3)

---

## 1. What is CNAP?

**CNAP (Calling Name Presentation)** is a network-level caller identification system being rolled out by TRAI (Telecom Regulatory Authority of India) starting March 2026.

Unlike app-based caller ID (Truecaller, etc.), CNAP operates at the telecom infrastructure layer:

- The caller's **real name** is fetched from **KYC databases** held by telecom operators.
- The name is delivered as part of the call signaling (SS7/SIP headers), not from a crowdsourced database.
- It cannot be spoofed by the caller -- the network resolves the identity.
- It applies to all calls, not just VoIP or app-to-app calls.

```
Traditional Caller ID:          CNAP:
+91-98765-XXXXX                 +91-98765-XXXXX
(number only, spoofable)        "RAJESH KUMAR" (KYC-verified, network-resolved)
```

### Why this matters for Chetana

Scammers rely on anonymity. CNAP strips that layer away at the network level. If Chetana can access CNAP data, a phone number scan becomes dramatically more useful -- we can tell the user not just "this number is suspicious" but "the KYC name behind this number does not match who they claim to be."

---

## 2. What is SIM-Binding?

SIM-binding is a verification mechanism where messaging platforms (WhatsApp, Telegram, etc.) cryptographically verify that the **SIM card associated with a phone number is physically present** in the device running the app.

Current state (pre-binding):
- Register WhatsApp with any number you can receive an OTP on
- Move the SIM out, keep using WhatsApp on a different device
- Scammers use virtual numbers, OTP services, or stolen SIMs

Post SIM-binding:
- Platform periodically checks SIM presence via device APIs
- If SIM is removed or swapped, account is flagged or suspended
- Makes it harder to operate scam accounts at scale

### Relevance to Chetana

SIM-binding status is a trust signal. A WhatsApp account that has maintained continuous SIM-binding is less likely to be a throwaway scam account. If platforms expose this signal (even as a binary "verified" / "unverified" flag), Chetana can factor it into risk scoring.

---

## 3. How Chetana Consumes These Signals

### Architecture

```
                          +------------------+
                          |   Chetana App    |
                          |   (client-side)  |
                          +--------+---------+
                                   |
                            POST /api/phone/cnap-check
                                   |
                          +--------v---------+
                          |  Chetana Backend |
                          |                  |
                          |  1. Validate     |
                          |  2. Check cache  |
                          |  3. Query CNAP   |
                          |  4. Score        |
                          +---+---------+----+
                              |         |
                   +----------+    +----+----------+
                   |               |               |
           +-------v---+   +------v----+   +------v------+
           | CNAP API  |   | SIM-Bind  |   | Existing    |
           | (Telco/   |   | Signal    |   | Threat DB   |
           | TRAI)     |   | (Platform)|   | (Chetana)   |
           +-----------+   +-----------+   +-------------+
```

### Data Flow

1. User submits a phone number for scanning (or it is extracted from a message/screenshot).
2. Chetana backend calls the CNAP API to resolve the KYC-registered name.
3. If available, the SIM-binding status is queried from the platform's API.
4. These signals are combined with Chetana's existing threat intelligence (reported numbers, pattern matching, UPI linkage).
5. A composite trust score is returned to the user.

### Enrichment Model

```
PhoneEnrichment {
  phone_number:    string       // E.164 format
  cnap_name:       string|null  // KYC name from CNAP, null if unavailable
  cnap_verified:   boolean      // whether CNAP resolution succeeded
  sim_bound:       boolean|null // SIM-binding status from platform, null if unknown
  threat_score:    float        // 0.0 (safe) to 1.0 (confirmed scam)
  threat_signals:  string[]     // e.g., ["reported_spam", "cnap_name_mismatch", "sim_unbound"]
  checked_at:      ISO8601
}
```

---

## 4. API Design Sketch

### `POST /api/phone/cnap-check`

**Request:**

```json
{
  "phone_number": "+919876543210",
  "context": {
    "claimed_name": "Vikram Sharma",
    "channel": "whatsapp",
    "message_snippet_hash": "sha256:abc123..."
  }
}
```

- `phone_number` (required): E.164 format Indian mobile number.
- `context.claimed_name` (optional): The name the caller/sender claims to be. If provided, Chetana compares it against the CNAP-resolved name.
- `context.channel` (optional): Where the interaction happened. Used to check SIM-binding if applicable.
- `context.message_snippet_hash` (optional): Hash of the message content for cross-channel correlation (see SPEC-Cross-Channel-Threading).

**Response:**

```json
{
  "phone_number": "+919876543210",
  "cnap": {
    "registered_name": "Rajesh Kumar",
    "verified": true,
    "name_match": false,
    "name_match_detail": "Claimed 'Vikram Sharma', KYC shows 'Rajesh Kumar'"
  },
  "sim_binding": {
    "status": "unbound",
    "platform": "whatsapp",
    "detail": "SIM not continuously present"
  },
  "threat_assessment": {
    "score": 0.82,
    "signals": [
      "cnap_name_mismatch",
      "sim_unbound",
      "number_reported_3x_past_30d"
    ],
    "recommendation": "HIGH_RISK"
  },
  "checked_at": "2026-03-25T14:30:00Z"
}
```

**Recommendation values:** `SAFE`, `LOW_RISK`, `MEDIUM_RISK`, `HIGH_RISK`, `CONFIRMED_SCAM`

### Rate Limiting

- Free tier: 10 lookups/day per user
- Authenticated users: 50 lookups/day
- Enterprise API: negotiated limits

### Error States

| Code | Meaning |
|------|---------|
| 200  | Successful lookup |
| 202  | CNAP data unavailable (API not yet live), partial result returned |
| 400  | Invalid phone number format |
| 404  | Number not found in any database |
| 429  | Rate limit exceeded |
| 503  | CNAP upstream unavailable |

---

## 5. Privacy Considerations

### Principles

1. **Opt-out support.** Any phone number owner can request their number be excluded from Chetana lookups. Implemented via a blocklist stored server-side.
2. **No bulk enumeration.** Rate limits and authentication prevent using this endpoint to harvest identity data.
3. **Minimal data retention.** CNAP responses are cached for 24 hours maximum. After that, a fresh lookup is required.
4. **No reverse lookups.** Chetana does not support "name to number" queries. Only "number to name" via CNAP, and only in the context of a scam check.
5. **Hash-only content.** Message content is never sent to the server -- only hashes, for cross-channel correlation.
6. **User consent.** The person initiating the scan consents. The scanned number's owner is protected by CNAP's own KYC consent framework.

### Opt-Out Flow

```
POST /api/privacy/opt-out
{
  "phone_number": "+919876543210",
  "verification": "otp"    // OTP sent to the number to prove ownership
}
```

Once verified, the number is added to a permanent blocklist. Future CNAP checks for that number return `{"cnap": null, "opted_out": true}`.

### Regulatory Alignment

- CNAP is a TRAI-mandated system. Chetana consumes it as a downstream service, not as a data collector.
- SIM-binding signals are platform-provided. Chetana does not perform device-level checks.
- All processing complies with India's Digital Personal Data Protection Act (DPDPA) 2023.

---

## 6. Implementation Dependencies

| Dependency | Status | Notes |
|-----------|--------|-------|
| TRAI CNAP public API | Not yet available | Rolling out to telcos March 2026, API access TBD |
| WhatsApp SIM-binding signal | Not exposed | No public API; may come via Business API |
| Telegram SIM-binding signal | Not exposed | Telegram has not announced plans |
| Chetana phone lookup infra | Exists | Current phone scan works on community reports |

---

## 7. What We Build Now vs. Later

**Now (Phase 2):**
- Nothing. This is a spec document.
- Monitor TRAI announcements for CNAP API availability.

**When CNAP API launches:**
- Implement the `/api/phone/cnap-check` endpoint with CNAP integration.
- Add name-match comparison logic.
- Add opt-out infrastructure.

**When SIM-binding signals become available:**
- Add SIM-binding as an additional signal to the composite score.
- No architectural changes needed -- it slots into the existing enrichment model.

---

*This spec will be updated when TRAI publishes CNAP API documentation.*
