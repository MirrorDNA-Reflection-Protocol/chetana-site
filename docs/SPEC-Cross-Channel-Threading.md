# SPEC: Cross-Channel Threat Threading

**Status:** Design only -- build in Phase 3
**Author:** Mirror Twin / Paul
**Date:** 2026-03-25
**Phase:** Phase 3

---

## 1. Problem

Scams do not stay on one channel. A typical attack follows a multi-channel escalation pattern:

```
WhatsApp message        Phone call           UPI payment request
"Hi, I'm from SBI"  -> "Verify your OTP" -> "Pay Rs 1 to confirm"
   (channel 1)          (channel 2)            (channel 3)
```

Today, Chetana treats each scan as an independent event. A user who scans a suspicious WhatsApp message gets a verdict. If they then receive a call from the same number and scan it separately, Chetana has no memory that these are related. The user has to connect the dots themselves.

This is a design failure. The scam is one operation spread across channels. Chetana should see it as one thread.

---

## 2. Data Model

### ThreatThread

```typescript
interface ThreatThread {
  id: string;                    // UUID, generated client-side
  created_at: string;            // ISO8601, first event timestamp
  updated_at: string;            // ISO8601, last event timestamp
  events: ThreatEvent[];         // ordered by timestamp
  correlation_keys: string[];    // phone numbers, UPI IDs found across events
  composite_score: number;       // 0.0 to 1.0, recalculated on each event
  escalation_pattern: string;    // e.g., "message -> call -> payment"
  status: "active" | "resolved"; // user can mark resolved
}

interface ThreatEvent {
  id: string;                    // UUID
  channel: Channel;
  timestamp: string;             // ISO8601
  content_hash: string;          // SHA-256 of scanned content (never raw content)
  verdict: Verdict;
  score: number;                 // individual event score, 0.0 to 1.0
  identifiers: Identifier[];     // extracted phone numbers, UPI IDs, URLs
}

type Channel = "whatsapp" | "sms" | "call" | "email" | "upi" | "web" | "other";

interface Verdict {
  result: "safe" | "suspicious" | "scam";
  confidence: number;            // 0.0 to 1.0
  signals: string[];             // e.g., ["urgency_language", "known_scam_number"]
}

interface Identifier {
  type: "phone" | "upi_id" | "url" | "email" | "account_number";
  value: string;                 // normalized form
  hash: string;                  // SHA-256 for storage
}
```

### Storage: localStorage Schema

```
chetana_threads: {
  [thread_id]: ThreatThread
}

chetana_identifier_index: {
  [identifier_hash]: thread_id[]   // reverse lookup: identifier -> threads
}

chetana_thread_ttl: {
  [thread_id]: expiry_timestamp    // auto-cleanup after 30 days
}
```

---

## 3. How It Works

### Correlation Engine (Client-Side)

When a user scans a new item, the following sequence runs entirely in the browser:

```
User scans new content
        |
        v
+------------------+
| Extract           |
| identifiers:      |
| phone, UPI, URL   |
+--------+---------+
         |
         v
+------------------+
| Hash identifiers  |
| (SHA-256)         |
+--------+---------+
         |
         v
+------------------+
| Search localStorage    |
| identifier_index for   |
| matching threads       |
+--------+---------+
         |
    +----+----+
    |         |
  Match    No match
    |         |
    v         v
+--------+ +----------+
| Append | | Create   |
| event  | | new      |
| to     | | thread   |
| thread | |          |
+--------+ +----------+
         |
         v
+------------------+
| Recalculate      |
| composite_score  |
| and escalation   |
| pattern          |
+--------+---------+
         |
         v
+------------------+
| Show thread view |
| to user          |
+------------------+
```

### Correlation Rules

A new event is linked to an existing thread if ANY of these match:

| Rule | Example |
|------|---------|
| **Same phone number** | WhatsApp message from +91-98765-XXXXX, then call from same number |
| **Same UPI ID** | Message mentions `fraud@ybl`, payment request from same UPI ID |
| **Same URL domain** | SMS contains `sbi-verify.in`, email also links to `sbi-verify.in` |
| **Time window** | Events within 72 hours of each other (configurable) |

All four conditions are checked. A single identifier match within the time window is sufficient to link events.

### Composite Score Calculation

The composite score is not a simple average. It accounts for escalation:

```
composite_score = max(individual_scores) * escalation_multiplier

escalation_multiplier:
  1 channel:   1.0x  (no escalation)
  2 channels:  1.15x (cross-channel = coordinated)
  3+ channels: 1.3x  (multi-stage attack pattern)

Capped at 1.0.
```

Additional boosters:
- **Urgency acceleration:** If time between events is < 1 hour, add +0.05
- **Payment channel present:** If any event is on `upi` channel, add +0.1
- **Known pattern match:** If the escalation_pattern matches a known scam playbook (e.g., "sms -> call -> upi"), add +0.1

### Escalation Pattern Detection

Known scam playbooks (populated from Chetana's threat intelligence):

| Pattern | Description |
|---------|-------------|
| `message -> call` | Classic vishing setup |
| `message -> call -> upi` | Full financial fraud chain |
| `email -> web -> upi` | Phishing to payment |
| `call -> sms -> upi` | OTP interception flow |
| `whatsapp -> whatsapp -> upi` | Group pressure scam |

When a thread's channel sequence matches a known pattern, the user sees a specific warning:

> "This looks like a coordinated scam. It started with a WhatsApp message, escalated to a phone call, and is now requesting payment. This matches a known fraud pattern."

---

## 4. User Experience

### Thread View

When correlation is detected, the user sees a timeline instead of isolated results:

```
+--------------------------------------------------+
|  THREAT THREAD                     Score: 0.87   |
|  "Coordinated scam - 3 channels"   HIGH RISK     |
|                                                   |
|  Mar 24, 2:15 PM  WhatsApp                       |
|  [!] "SBI account blocked, click link"           |
|      Score: 0.72  |  Signals: urgency, fake_bank |
|                                                   |
|  Mar 24, 3:40 PM  Phone Call                      |
|  [!] Same number: +91-98765-XXXXX                |
|      Score: 0.68  |  Signals: known_scam_number  |
|                                                   |
|  Mar 24, 4:10 PM  UPI Request                     |
|  [!!] Payment request from same entity            |
|      Score: 0.91  |  Signals: payment_channel,   |
|                      urgency_acceleration          |
|                                                   |
|  [Known pattern: message -> call -> payment]      |
|                                                   |
|  [ Report All ]  [ Mark Resolved ]  [ Share ]     |
+--------------------------------------------------+
```

### Notifications

If a user scans something that correlates with a previous scan:

> "This phone number appeared in a WhatsApp message you scanned 2 hours ago. Chetana has linked these into a threat thread."

---

## 5. Privacy Architecture

### Core Principle: All Correlation is Client-Side

```
+---------------------------+       +---------------------------+
|      User's Browser       |       |     Chetana Server        |
|                           |       |                           |
| - localStorage threads    |       | - Receives individual     |
| - identifier index        |       |   scan requests           |
| - correlation engine      |       | - Returns verdicts        |
| - composite scoring       |       | - Has NO knowledge of     |
| - thread UI               |       |   threads or correlation  |
|                           |       |                           |
| THE SERVER NEVER SEES     |       | Each scan is stateless    |
| THREAD DATA               |       | from the server's POV     |
+---------------------------+       +---------------------------+
```

### What the server sees

- Individual scan requests (one at a time, no thread context)
- No session tracking between scans
- No identifier correlation data
- No localStorage contents

### What the server never sees

- Thread IDs
- That two scans are related
- The user's scan history
- Composite scores (computed client-side)

### Data Lifecycle

| Data | Location | Retention |
|------|----------|-----------|
| ThreatThread | localStorage | 30 days, then auto-deleted |
| Identifier index | localStorage | Follows thread TTL |
| Individual verdicts | Server logs | 7 days (anonymized) |
| Content hashes | localStorage only | Follows thread TTL |
| Raw scanned content | Never stored | Processed in memory, discarded |

### User Controls

- **Clear all threads:** One button to wipe all localStorage thread data
- **Delete single thread:** Remove one thread and its identifier index entries
- **Export thread:** Download as JSON for personal records or police report
- **No account required:** Threading works without login, since it is entirely client-side

---

## 6. Technical Considerations

### localStorage Limits

- Most browsers allow 5-10 MB per origin.
- A single ThreatThread with 10 events is approximately 2-4 KB.
- At 30-day TTL, even heavy users (100 threads) use under 500 KB.
- Auto-cleanup runs on app load: expired threads are purged.

### Offline Support

Since correlation is client-side, threading works partially offline:
- New events can be created from cached scan results.
- Correlation against existing threads works fully offline.
- Only the initial verdict fetch requires network.

### Migration Path

If a future phase adds optional accounts with server-side features:
- Threads can be encrypted and synced (E2E, server cannot read).
- Opt-in only. Client-side default remains forever.

---

## 7. Implementation Plan

### Phase 3 Scope

| Task | Priority | Estimate |
|------|----------|----------|
| Identifier extraction (phone, UPI, URL) from scan results | P0 | 2 days |
| localStorage thread store + TTL cleanup | P0 | 1 day |
| Correlation engine (identifier matching + time window) | P0 | 2 days |
| Composite score calculation | P1 | 1 day |
| Thread timeline UI component | P1 | 3 days |
| Escalation pattern matching | P2 | 1 day |
| Thread export (JSON) | P2 | 0.5 day |
| Notification when correlation detected | P2 | 1 day |

**Total estimate:** ~11.5 days

### Not in Phase 3

- Server-side correlation (privacy violation -- will not build)
- Cross-device thread sync (requires accounts, deferred)
- Automated reporting to authorities (requires legal review)
- ML-based pattern detection (requires training data from opted-in users)

---

## 8. Open Questions

1. **Time window tuning.** 72 hours is a guess. Need real-world data on how long multi-channel scams take from first contact to payment.
2. **URL normalization.** Scammers use URL shorteners and redirects. How deep do we resolve? Client-side redirect following has limits.
3. **UPI ID extraction reliability.** UPI IDs in screenshots vs. typed text have different extraction accuracy. Need to define minimum confidence for correlation.
4. **Thread merging.** If two separate threads later share an identifier, do we merge them? Adds complexity but increases accuracy.

---

*This spec will be refined with real usage data once Phase 2 is in production.*
