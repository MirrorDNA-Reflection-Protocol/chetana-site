# Chetana Changelog

All notable changes to Chetana (chetana.activemirror.ai).

## [Unreleased] — 2026-03-22

### Added
- **Dedicated scan page** with two-column layout (council visualization + inline scanner)
- **International Scam Council network graph** — animated SVG showing 4 AI judges (DeepSeek CN, Mistral EU, Llama US, Vajra IN) deliberating in real time
- **Rotating video preview** — 3 scam-pattern clips in phone-frame mockup with auto-rotation
- **Claude execution discipline** in TriMind — surgical precision protocols, self-diagnosis detection, auto-rewrite pipeline
- **Precision response contract** — Checks/Issue/Fix/Confidence format enforced for execution-sensitive tasks
- **Guard failure tracking** — 15-minute sliding window, escalating prompt pressure on repeated drift
- **Execution-sensitive routing** — logo/watermark/video tasks routed to Codex/Gemini instead of Claude

### Changed
- Hero and consumer section CTAs now link to dedicated scan page instead of floating widget
- Council deliberation panels moved from chat bubbles to sidebar network graph
- ScanWidget supports inline mode (no backdrop, no FAB, static positioning)
- Meta tags updated: "How India Fights Back Against Scammers"
- OG/Twitter descriptions updated for India-first SEO
- Consumer section copy rewritten: "Screenshot It. Check It."
- Ollama India seat now uses `keep_alive: "5m"` to avoid cold starts
- Claude gateway sampling set to temperature=1, top_p=0.01
- `build_context_string` now passes `extra_system` and `product_mode` to CLI fallback
- FAB button shown on non-scan pages only

### Fixed
- ProofPage now redirects to scan page after acceptance (was going to home)

## [2.0.0] — 2026-03-20

### Added
- **International Scam Council** — 4 AI models from 4 countries vote on every scan (DeepSeek CN, Mistral EU, Llama US, Vajra IN)
- Screenshot-first UX for mobile users
- 30 scam atlas entries with India-specific patterns
- Hindi pattern recognition
- Dark mode OCR support
- Offline PWA with service worker
- Panic mode (emergency helplines: 1930, cybercrime.gov.in, 181)
- Whisper audio analysis for voice clone detection
- Google Translate API integration (400K char cap)
- Sarvam-first for Indian language translation

### Fixed
- Widget z-index blocking clicks on underlying content
- Council voting: prompt template, India seat model, ScanWidget panel rendering

## [1.5.0] — 2026-03-19

### Added
- `/story` page with founder narrative + deepfake awareness clips
- Decode Firewall wired into all upload and scan endpoints
- Edge receipts generated at build time

### Changed
- Public UI overhaul shipped
- Chetana radar stabilized, legacy dist retired

### Fixed
- Dead routes, backend bugs, hero video swap

## [1.4.0] — 2026-03-16

### Added
- Google Translate i18n integration
- Risk gauge visualization
- User feedback collection

## [1.3.0] — 2026-03-14

### Added
- Aurora background, spotlight cards, border beam effects
- Scroll reveal animations

## [1.2.0] — 2026-03-09

### Added
- Visual overhaul + larger chat panel
- LLM cascade: OpenAI → Gemini → Groq → keyword fallback
- SEO foundation: schema.org, sitemap, robots.txt, AI plugin manifest
- Live RSS scam radar feed
- Proof-of-Vigilance system
- Telegram alerting for high-risk scans (score >= 70)
- `/privacy` policy route
- 12 live languages, 10 coming soon

### Changed
- Dark sovereign redesign: scan-centered hero, plain copy, boosted contrast
- ScanChat with 8 detection modes
- Honest language counts in API responses

## [1.0.0] — 2026-03-09

### Added
- Initial Chetana showcase site
- FastAPI backend proxying to Kavach (localhost:8790)
- Scan modes: text, link, UPI, phone, media, voice
- Cloudflare tunnel to chetana.activemirror.ai
- README with API docs, self-host instructions, emergency helplines
