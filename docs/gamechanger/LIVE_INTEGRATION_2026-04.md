# Chetana Gamechanger Live Integration

This repo now carries the backend-first Chetana gamechanger contract in the
managed live backend.

## Canonical routes

```text
GET  /api/v1/rails
POST /api/v1/analyze
POST /api/v1/emergency
```

These routes are additive. They do not replace the existing `v0` trust-runtime
surface or the partner `v1/scan` contract.

## Mobile surfaces

- `apps/mobile-expo`: runnable Expo app pointed at `http://127.0.0.1:8093/api`
- `apps/mobile-android-native`: backend-first Android integration pack with
  APK metadata extraction and notification-listener onboarding

## Verified rails

The official recovery rails are stored in
`backend/app/gamechanger/data/official_rails.json` and were re-verified on
April 28, 2026.
