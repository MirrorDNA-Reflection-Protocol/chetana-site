# React Native Android Native Track

This track is now backend-first. It uses the managed Chetana service at
`http://127.0.0.1:8093/api` by default and adds Android-only hooks for:

- APK metadata extraction from a shared or pasted URI
- notification-listener onboarding
- package-added and risky-notification watcher stubs
- share-target manifest entries to feed suspicious text or APKs into Chetana

Use this folder after creating a bare React Native app:

```bash
npx @react-native-community/cli init Chetana --template react-native-template-typescript
```

Then copy:
- `src/` into the app root.
- Kotlin files under `android/app/src/main/java/ai/activemirror/chetana/`.
- Manifest entries from `android/app/src/main/AndroidManifest.xml`.
- Register `ChetanaPackage()` in your `MainApplication`.

Native modules included:
- `ChetanaNativeModule.kt`: extracts basic APK metadata from a URI.
- `NotificationWatcherService.kt`: opt-in notification listener skeleton.
- `InstallReceiver.kt`: package-added receiver skeleton.
- `ChetanaPackage.kt`: React Native package registration for the native module.

Important:
A normal consumer app cannot guarantee global install blocking. Use Chetana as pre-action shield, share target, scanner, and warning layer. Device-owner/enterprise mode is required for hard enforcement.
