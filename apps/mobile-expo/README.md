# Chetana Expo MVP

This demo is now backend-first and uses the same `v1/analyze` and `v1/emergency`
contracts as the FastAPI service.

What it covers:
- message check
- QR check
- suspicious call summary
- overseas job check
- APK / sideload context
- emergency recovery handoff

Run:

```bash
npm install
npm start
```

Set the API base inside the app to the live backend root with `/api`.
- same-device simulator: `http://127.0.0.1:8093/api`
- physical phone: use your Mac's LAN IP, e.g. `http://192.168.x.x:8093/api`

This MVP intentionally does not request sensitive permissions at first launch.
