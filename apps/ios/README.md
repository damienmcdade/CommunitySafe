# CommunitySafe for iOS

A native SwiftUI application. **This is not a web view.**

## Why native

Apple rejected the previous iOS build (1.1, build 7) on 2026-08-24 under
**Guideline 4.2 — Minimum Functionality**: it was a Capacitor shell whose
`server.url` pointed at `https://communitysafe.app`, so the app was a browser
window. The reviewer's note explicitly pre-empted the usual patch — *"features
such as push notifications, Core Location, or sharing do not provide a robust
enough experience"* — so the remedy is a real native client, not a wrapper with
extra plugins.

The binary links **zero** WebKit, Capacitor or Cordova code. Verify with:

```sh
otool -L build/CS.xcarchive/Products/Applications/CommunitySafe.app/CommunitySafe \
  | grep -iE 'webkit|capacitor|cordova'   # expect no output
```

## What it does natively

| Surface | Framework |
| --- | --- |
| All screens, navigation, lists | SwiftUI |
| Neighborhood map with per-area grades | MapKit |
| Rate comparison, time-of-day, volume, category charts | Swift Charts |
| Safety check-in countdown on Lock Screen + Dynamic Island | ActivityKit |
| Home Screen, Lock Screen and Control Center widgets | WidgetKit |
| Siri, Shortcuts, Spotlight, Control Center actions | App Intents |
| "Where am I?" resolution and Saved Place geofences | Core Location |
| Neighborhood search results in system Spotlight | Core Spotlight |
| Subscription and restore | StoreKit 2 |
| Offline cache in the shared App Group | Foundation + App Group container |

The app works with no network: every API response is cached to the App Group
container and served back, labelled with its age, so a grade is always available.

## Layout

```
project.yml              XcodeGen spec (source of truth for the project)
Sources/Shared/          Models, API client, offline store, theme — app + widget
Sources/Core/            App state, location, places, check-in, session
Sources/Intents/         App Intents (Siri / Shortcuts / Spotlight / Control Center)
Sources/App/             Entry point, notifications, deep links, Spotlight indexing
Sources/Features/        One folder per tab, plus paywall and settings
Widget/                  Widget extension, Live Activity, Control Center control
Resources/               Info.plists, entitlements, assets, privacy manifests
tools/gen-cities.mjs     Regenerates Sources/Core/Cities.generated.swift
```

## Working on it

```sh
# Regenerate the Xcode project after adding or removing files
xcodegen generate

# Keep the offline city registry in sync with the API's own list
node tools/gen-cities.mjs

# Build for the simulator
xcodebuild -project CommunitySafe.xcodeproj -scheme CommunitySafe \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build

# Archive for the App Store (manual signing, profiles named in project.yml)
xcodebuild -project CommunitySafe.xcodeproj -scheme CommunitySafe \
  -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' \
  -archivePath build/CS.xcarchive archive
```

## Backends

Two, deliberately:

- **Crime data and scoring** — the Express service on Railway
  (`communitysafe-api-production.up.railway.app`).
- **Device session, trusted contacts, safety check-ins** — the Next.js API at
  `communitysafe.app/api`. The Express service's parallel auth stack is retired
  and answers `410`, so these must not be pointed at the Railway host.

There is no sign-up. The app mints an anonymous per-device session
(`POST /api/auth/anonymous`), which is what lets trusted contacts and check-ins
exist server-side without an account.

## Android

Android is still a Capacitor WebView (`apps/web/android`) and is unaffected by
this rewrite. Do not reintroduce an iOS Capacitor target.
