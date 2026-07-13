# Chetana Partner Desk Compliance Boundary

Status: engineering control document, not legal advice
As-of date: 2026-07-13

## Operating Position

The Partner Desk is an inbound, AI-assisted qualification service. A prospect voluntarily submits business contact information for the narrow purpose of receiving a response about that institutional inquiry. The desk does not form contracts, provide legal advice, represent a government or regulated institution, promise fraud-prevention outcomes, or perform regulated banking activity.

## India Data Protection

The Digital Personal Data Protection Act, 2023 has a phased commencement. India Code currently records the core notice, consent, rights, and fiduciary-obligation sections as commencing eighteen months after 13 November 2025. Chetana implements the relevant controls before that date rather than waiting for the final phase:

- itemised purpose notice beside the form;
- explicit, specific contact consent;
- a separate consumer-scan and partner-conversation boundary;
- withdrawal and deletion;
- data minimisation and non-PII aggregate reporting;
- reasonable security safeguards and encrypted storage;
- a published contact route for questions and grievances;
- purpose-limited retention.

Primary sources:

- DPDP Act commencement: https://www.indiacode.nic.in/show-data?abv=CEN&actid=AC_CEN_45_0_00003_2023-22_1763464807080&orderno=1
- Notice requirements: https://www.indiacode.nic.in/show-data?abv=CEN&actid=AC_CEN_45_0_00003_2023-22_1763464807080&orderno=5
- Security and erasure obligations: https://www.indiacode.nic.in/show-data?abv=CEN&actid=AC_CEN_45_0_00003_2023-22_1763464807080&orderno=8
- DPDP Rules, 2025: https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa

## Commercial Communications

This release does not send cold email, SMS, automated voice calls, bulk messages, or WhatsApp outreach. A reply to an explicitly submitted inquiry is limited to that purpose. Before SMS, voice, or bulk commercial messaging is enabled, Active Mirror must complete the applicable TRAI sender, consent, preference, header, template, and telemarketer controls under TCCCPR.

Internal approval alerts are distinct from prospect communications. They route only a pilot lane and pseudonymous conversation ID to the configured operator channel; they exclude the prospect's name, email, organisation, and message text. Email alerts are addressed to `paul@activemirror.ai` but remain queued until an authenticated Active Mirror sender is configured.

Primary source: https://trai.gov.in/tcccpr

## AI And Representation

- Every reply identifies the desk as AI-assisted.
- The desk does not claim to be Paul, a lawyer, a bank employee, a government official, RBI, RBIH, NPCI, I4C, CERT-In, police, or a procurement officer.
- Published benchmark evidence remains scope-bounded. The desk cannot convert a signed regression receipt into a field-efficacy, accuracy, endorsement, or prevented-loss claim.
- A model or rules engine is not an authorised signatory and cannot waive rights or create apparent authority.

## Contract And Procurement Gate

The following require a separate written approval from an authorised Active Mirror representative and, where appropriate, qualified counsel:

- pricing, discounts, payment terms, purchase orders, tender submissions, or tax treatment;
- NDA, MOU, master services, licensing, DPA, SLA, warranty, indemnity, liability, IP, exclusivity, or governing-law terms;
- government procurement representations, anti-bribery declarations, conflicts, gifts, lobbying, or political engagement;
- access to partner networks, production systems, customer data, bank data, security questionnaires, penetration tests, or incident obligations;
- any claim of regulatory approval, institutional endorsement, independent validation, accuracy, loss prevention, or guaranteed outcome;
- processing outside India or engagement of a new data processor.

## Advertising Gate

Paid advertising may direct prospects to the Partner Desk, but campaign copy must use published, evidenced claims. Ads must not imply endorsement by RBI, RBIH, NPCI, a bank, or government; target vulnerable individuals using sensitive inferences; upload contact lists without a lawful basis; or use lead data for unrelated promotion. Platform pixels and conversion tags require a separate privacy review before installation.

## Security And Incident Handling

CERT-In directions and applicable incident obligations must be evaluated for the operating entity and infrastructure. This engineering release preserves application evidence without claiming that its conversation ledger replaces infrastructure logs, incident reporting, or a formal information-security program.

Primary source: https://cert-in.org.in/Directions70B.jsp

## Counsel Review Still Required

This document is not a legal opinion. Before autonomous outbound communication, a paid institutional pilot, government procurement, regulated-system integration, or execution of any agreement, obtain review from qualified Indian counsel covering DPDP implementation timing, contract formation, advertising, TCCCPR, procurement and anti-corruption, tax, IP, liability, sector-specific RBI/NPCI obligations, and any other target jurisdiction.
