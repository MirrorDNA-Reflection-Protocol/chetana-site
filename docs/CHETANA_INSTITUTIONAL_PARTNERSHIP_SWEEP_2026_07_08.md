# Chetana Institutional Partnership Sweep - 2026-07-08

Purpose: make Chetana discoverable and sponsorable by Indian banks, payment companies, CSR teams, public-sector programs, cyber-safety desks, and merchant networks without implying government affiliation.

## Executive read

Chetana should not pitch itself as a replacement for bank fraud systems, I4C, RBIH, DoT, IDPIC, or law enforcement. The credible wedge is narrower:

- Public-facing pre-action scam checker.
- Regional-language digital safety awareness.
- Merchant fake-payment proof checks.
- Recovery packet and official-rail handoff after money moves.
- Partner API for structured intake, triage, and evidence routing.

The sponsor story is: "help citizens pause before a scam action, and help operators receive cleaner evidence when harm already happened."

## Why this is timely

Official signals show Indian fraud prevention is moving toward coordinated bank, telecom, and public-sector workflows:

- DFS has already pushed banks and financial institutions toward CFCFRMS API integration, NCRP integration, 24x7 complaint resources, regional-language customer awareness, and standardized information sharing with law-enforcement agencies.
  Source: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2004684
- I4C and RBIH signed an MoU to share mule-account intelligence and suspect identifiers from I4C's Suspect Registry for AI-driven bank fraud-risk systems such as MuleHunter.ai.
  Source: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2260277
- DoT's Financial Fraud Risk Indicator (FRI) is already being integrated into banking and payment workflows through API-based data exchange, using signals from NCRP, Chakshu, and bank/FI intelligence.
  Source: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2141616
- IDPIC has been incorporated as a Section 8 company to detect, prevent, and analyse digital payment fraud in real time using AI, ML, and big-data analytics.
  Source: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2244478
- RBI's financial education initiative explicitly targets going digital and consumer protection, and Financial Literacy Week 2026 focuses on KYC, account hygiene, and safe banking.
  Sources: https://www.rbi.org.in/financialeducation/ and https://www.pib.gov.in/PressReleasePage.aspx?PRID=2225439

Chetana should align with these priorities as a consumer-side front door and proof collector, not as a closed intelligence authority.

## Best sponsor routes

### 1. Bank or PSP innovation pilot

Buyer:
- fraud risk team
- digital banking product team
- customer support / disputes
- merchant acquiring team
- financial literacy team

Pitch:
- "Chetana helps users pause before a risky transfer, collect the right evidence, and reach official rails faster."

Pilot:
- 90 days
- one language cluster or one scam lane, such as fake KYC, digital arrest, UPI collect request, fake payment proof, or remote-access scam
- weekly proof packet with aggregate metrics only

Proof metrics:
- scans completed
- high-risk verdict count
- 1930 / cybercrime.gov.in handoff count
- evidence packet copy count
- user language distribution
- false-safe complaint count
- median scan response time

### 2. CSR / public awareness sponsorship

Buyer:
- bank CSR team
- foundation arm
- public-sector awareness program
- state-level digital safety program

Pitch:
- "Sponsor free regional-language scam checks for seniors, small merchants, students, and first-time digital payment users."

Important constraint:
- CSR funding may require an eligible implementation partner, Section 8/non-profit route, or listed public-welfare instrument. MCA's 2026 update expands CSR pathways through Social Stock Exchange instruments for eligible not-for-profit organizations, but Chetana should not claim CSR eligibility until the legal vehicle is confirmed.
  Source: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2266792

### 3. Government procurement / awareness route

Buyer:
- state IT department
- police cyber cell
- public-sector undertaking
- district digital literacy program

Route:
- GeM listing or GeM-ready vendor/implementation partner.
- GeM is the government procurement portal for goods and services by ministries, departments, and PSUs.
  Source: https://gem.gov.in/aboutus

Pitch:
- "A lightweight citizen-facing scam checker and awareness surface that routes users to official help, without replacing official reporting."

### 4. Regulated/sandbox route

Buyer:
- regulated bank/PSP sponsor
- RBI sandbox / inter-operable sandbox path if a regulated pilot requires cross-regulator testing

Source:
- RBI describes regulatory sandboxes as controlled live testing environments and IoRS as a common window for hybrid financial products/services across regulators.
  Source: https://www.rbi.org.in/commonperson/English/scripts/FAQs.aspx?Id=3822

Use only if:
- the pilot touches regulated financial product behavior, payment decisions, or bank-app transaction warnings.

### 5. Startup grant route

Programs to evaluate:
- Startup India Seed Fund through an eligible incubator, if company age and DPIIT status fit.
- MeitY TIDE 2.0 for ICT startups in AI and financial inclusion/digital payments.

Sources:
- SISFS support includes proof of concept, prototype development, product trials, market entry, and commercialization through incubators.
  https://fitt-iitd.in/web/sisfs
- TIDE 2.0 supports ICT startups in emerging technology areas including AI and financial inclusion/digital payments.
  https://itic.iith.ac.in/meity-tide.html

## What Chetana needs before serious sponsorship

1. Public partner page.
   - Status: added locally as `?page=partners`.

2. One-page sponsor PDF.
   - Needs: problem, product, pilot offer, privacy, metrics, contact, no-affiliation disclaimer.

3. Public proof page.
   - Show aggregate metrics only.
   - No user screenshots or personal identifiers.
   - "Pending source" on any live number not backed by a receipt.

4. Compliance packet.
   - Privacy policy.
   - Data retention statement.
   - DPDP posture.
   - Security controls.
   - No auto-filing complaints.
   - No government affiliation.
   - Model/OCR provider boundaries.

5. Procurement readiness.
   - Decide whether ActiveMirror sells directly, through GeM, through a bank innovation pilot, through CSR implementation partner, or through a Section 8/non-profit partner.

6. Partner API demo.
   - Use existing `/api/v1/scan`, `/api/v1/trust/bundle`, `/api/v1/recovery`.
   - Add a redacted sample response and receipt.

## API and dataset reality check

Useful for product credibility:
- Google Web Risk / Safe Browsing, URLhaus, PhishTank, VirusTotal, and OpenPhish can enrich URL/domain risk. They should not issue a final "safe" verdict by themselves.
- Mistral OCR 4 is useful for extraction quality and confidence. It should not decide scam verdicts.
- UCI/Hugging Face SMS/phishing datasets are useful for evals and examples, not production truth.

India-specific official rails:
- Chakshu, NCRP suspect repository, FRI, I4C Suspect Registry, MuleHunter, and IDPIC are strategically important.
- They are not open consumer APIs Chetana can simply call today.
- Treat them as partnership/sandbox targets, not assumed integrations.

## Outreach order

1. One bank with high digital-fraud awareness and active customer education.
2. One payment app or PSP with merchant exposure.
3. One state cyber cell or public-sector awareness program.
4. One CSR/foundation route for seniors and small merchants.
5. RBIH / IDPIC / I4C only after a real pilot proof packet exists.

## Message to send

Subject: Chetana pilot for pre-action scam checks and recovery routing

Body:

> Chetana is an independent India-focused scam checker built by ActiveMirror. It helps users check suspicious messages, links, QR requests, payment screenshots, and recovery situations before they act. We are looking for a bank, PSP, CSR, or public-sector pilot sponsor for a 90-day regional-language scam-safety pilot. Chetana does not claim government affiliation and routes users to official rails such as 1930, cybercrime.gov.in, and Chakshu where appropriate. We can share a short demo, privacy posture, partner API sample, and aggregate proof metrics.

## Bad news / constraints

- A public page alone will not get serious sponsorship.
- Banks and government teams need proof, compliance posture, procurement path, and a narrow pilot offer.
- CSR money may require a different legal vehicle or implementation partner.
- Official suspect-data access is partnership-driven; do not imply we have I4C/FRI/IDPIC data access.
- The current live backend still needs controlled restart/deploy before the latest local Chakshu route proof is live.

## Next build slice

- Build `/partners` or `?page=partners` into the public site.
- Add sponsor PDF or printable page.
- Add redacted partner API sample.
- Add a small "pilot proof" endpoint/page backed by aggregate analytics only.
