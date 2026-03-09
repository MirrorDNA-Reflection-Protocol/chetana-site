# Chetana Site — Handoff for Backup AI

## What This Is
Consumer-facing scam detection site for India. React + TypeScript + Vite frontend, FastAPI backend.
Live at `chetana.activemirror.ai` via Cloudflare tunnel on port 8093.

## Architecture
```
frontend/src/
├── App.tsx          — Router, page state
├── components.tsx   — All UI components (Nav, Hero, ScanBox, Chat, Footer, etc.)
├── styles.css       — All styles
├── VigilancePage.tsx — Proof-of-Vigilance (new, chain tracker)
├── ProofPage.tsx    — Proof-of-Memory (terms acceptance)
├── animations/      — SVG/canvas animations
├── data.ts          — Static threat/weather data
└── types.ts         — TypeScript types

backend/app/
├── main.py          — FastAPI: scan proxy, chat LLM cascade, SPA serving
├── gates.py         — Symlink → ~/.mirrordna/chetana/gates.py (DO NOT MODIFY)
└── soul.md          — Symlink → ~/.mirrordna/chetana/soul.md (DO NOT MODIFY)
```

## DO NOT TOUCH
- `backend/app/gates.py` — symlinked, shared across services
- `backend/app/soul.md` — symlinked, shared across services
- `backend/app/main.py` — only modify if you understand the LLM cascade and gate wiring
- The Cloudflare tunnel config at `~/.cloudflared/config.yml`

## What Needs Doing

### 1. Visual Overhaul (PRIMARY TASK)
The site looks generic. Needs to look stunning. DO NOT hand-write vanilla CSS.

**Use a UI component library:**
- Aceternity UI (https://ui.aceternity.com) — React components with stunning animations
- Magic UI (https://magicui.design) — animated components for landing pages
- shadcn/ui (https://ui.shadcn.com) — with their landing page blocks

**Install one of these and replace the current generic components with visually striking ones:**
- Hero section with animated gradients, text reveals, or particle effects
- Cards with 3D tilt, spotlight effects, or animated borders
- Scroll-triggered animations on each section
- Dark mode hero section transitioning to light content

### 2. Chat Pill Fix
The chat FAB (bottom-right blue circle) is hidden behind the consent bar.
- FAB is at `bottom: 80px` now but might still be obscured
- Chat panel needs `z-index: 56` (above consent bar at 55)
- Test: click the blue circle, chat should open

### 3. Onboarding Popup — REMOVED
Was blocking crawlers/SEO. Already removed in latest commit. Don't re-add it.

## Build & Deploy
```bash
cd ~/repos/chetana-site/frontend && npm run build
# Kill ALL processes on 8093 first:
lsof -ti :8093 | xargs kill 2>/dev/null
# Wait, then start from backend dir:
cd ~/repos/chetana-site/backend
nohup python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8093 > /tmp/chetana-8093.log 2>&1 &
# Verify:
sleep 2 && curl -s -o /dev/null -w "%{http_code}" http://localhost:8093/
# The frontend serves from frontend/dist/ directly (not backend/frontend_dist/)
```

## Verify Changes Actually Show
1. Check `ps aux | grep 8093` — no zombie Python 3.9 processes
2. `curl -s http://localhost:8093/ | grep -o 'index-[^"]*\.js'` — note the hash
3. Open incognito browser to `chetana.activemirror.ai`
4. The HTML has `Cache-Control: no-cache` headers now

## Git
```bash
cd ~/repos/chetana-site
git add -A && git commit -m "message" && git push
```
Remote: `https://github.com/MirrorDNA-Reflection-Protocol/chetana-site.git`
