# Chetana Rare Site Ultimate v1

A buildable full redesign + showcase system for Chetana:
- total website redesign
- consumer / merchant / enterprise split
- living Scam Weather
- Threat Wiki / Scam Atlas
- MirrorGraph living visual
- TUI / command-center panel
- dashboard gallery
- Trust by Design surfaces
- onboarding flows
- frontend + backend scaffold

## Stack
- Frontend: Vite + React + TypeScript
- Graph: Cytoscape.js
- Terminal UI: xterm.js
- Backend: FastAPI + uvicorn

## Start
### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8093
```
