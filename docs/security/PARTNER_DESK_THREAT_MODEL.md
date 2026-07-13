# Chetana Partner Desk Threat Model

Status: implemented baseline, not a claim of complete security
Reviewed: 2026-07-13

## Scope

The Partner Desk accepts institutional enquiries at `/partners`, stores a bounded encrypted conversation, and returns deterministic qualification responses. It does not currently send email, accept attachments, call external tools, use an external CRM, or let a model commit Active Mirror.

## Assets

- Partner names, business email addresses, roles, organisations, and messages.
- Consent, deletion, continuation, and approval state.
- Active Mirror's identity, reputation, pricing authority, legal authority, and procurement integrity.
- Chetana's published assurance evidence and privacy claims.
- Encryption keys and encrypted conversation files on the Chetana host.

## Trust Boundaries

1. Public browser to Cloudflare and the Chetana HTTPS API.
2. Attacker-controlled form or conversation text to the deterministic Partner Desk policy engine.
3. Partner Desk process to local encrypted storage.
4. Browser continuation and deletion capabilities are held in route-scoped `HttpOnly`, `SameSite=Strict` session cookies. They are not returned in JSON or readable by page JavaScript.
5. Partner write routes reject cross-site Fetch Metadata and unrecognised `Origin` values before processing.
6. Non-personal aggregate inquiry events to PilotTrace.
7. Future email or CRM transport, which remains disabled until separately authenticated and reviewed.
8. Commitment-class requests to an authorised human decision; the desk cannot cross this boundary.

## Required Invariants

- The desk always discloses that it is AI-assisted.
- Untrusted text cannot change policy, invoke tools, expose prompts or secrets, or gain ambient authority.
- Credentials, government identifiers, card-like numbers, and prompt/tool injection content are rejected without retaining the message body.
- Conversation continuation and deletion use different high-entropy secrets.
- Plaintext partner content is absent from PilotTrace and conversation files.
- Conversation event integrity fails closed when the hash chain is altered.
- Final pricing, contracts, procurement terms, DPA/SLA terms, production integration, access to partner systems, and outcome promises require authorised approval.
- No cold SMS, voice campaign, bulk message, attachment processing, or outbound email occurs from this component.
- Inactive conversation files expire after 180 days; deletion removes the encrypted conversation immediately.

## Threats And Controls

| Threat | Primary control | Residual risk |
|---|---|---|
| Prompt injection or policy extraction | Finite local classifier; no LLM or tool execution; blocked content stored as digest only | Novel wording may be retained as ordinary encrypted business text, but it still has no execution path |
| Secret or identity-data submission | Pattern block, explicit UI warning, no attachments | Names and unusual identifier formats may evade pattern checks |
| Impersonation or deceptive agency | Persistent AI-assisted identity and authority disclosure | A prospect may still misunderstand the commercial significance of a reply |
| Unauthorized contract or pricing commitment | Commitment classifier and `approval_required` state | Classification is keyword-based; all desk replies also carry a universal non-binding boundary |
| Token guessing or object enumeration | 256-bit URL-safe capabilities, opaque 128-bit conversation IDs, server-side validation, route-scoped HttpOnly cookies | Browser or host compromise can still use an active session; session cookies disappear when the browser session ends |
| Stored-data disclosure | Fernet encryption, `0700` directories, `0600` key/files, no plaintext aggregate PII | Host-user compromise can access both key and ciphertext; application-layer encryption is not host isolation |
| Record tampering | Chained SHA-256 event envelopes, fail-closed verification | An attacker controlling both key and files can rewrite the chain |
| Spam and resource abuse | Honeypot, per-IP request window, message and character caps | In-memory limits reset on process restart and are not a distributed DDoS control |
| Cross-origin abuse | Restricted credentialed CORS, strict same-site cookies, Fetch Metadata and Origin checks | Initial enquiry remains intentionally public to non-browser clients; rate limiting and honeypot remain the abuse controls |
| Data over-retention | Hourly expiry worker, explicit deletion token | A stopped service cannot run the worker; startup runs the same purge before its first hourly sleep |
| Legal/procurement manipulation | No gifts, influence, tender acceptance, signature, or terms authority | Human review and qualified Indian counsel remain necessary for commitments |
| Email spoofing or domain abuse | Outbound email disabled; domain SPF and reject-policy DMARC observed | DKIM and mailbox identity were not verified in this implementation |

## Incident Response

1. Disable the Partner Desk routes or public tunnel if token abuse, data exposure, or policy bypass is suspected.
2. Preserve relevant access and application logs under the applicable incident-response policy; do not copy decrypted conversations into general logs.
3. Rotate the Partner Desk encryption key only through a migration that can decrypt and re-encrypt retained conversations. Deleting the key without migration destroys access.
4. Identify affected contacts from the encrypted store only when necessary and notify under applicable law and policy.
5. Record checked scope, unchecked scope, evidence, remaining risk, and corrective action before restoring service.

## Residual Launch Blocks

- Authenticated `partners@activemirror.ai` mailbox and outbound transport are not configured.
- DKIM alignment and mailbox receive/send behavior are not verified.
- No Indian lawyer has reviewed the public policy, pilot contract, procurement posture, advertising copy, or cross-border engagement terms.
- Host compromise, disaster recovery, key escrow, and multi-node availability have not been independently audited.
