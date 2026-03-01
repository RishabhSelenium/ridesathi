# RideSathi React Native

React Native (Expo) migration of the original RideSathi web prototype.

## Included in this migration

- Splash + login flow
- OTP prototype rule: OTP = phone number last 4 digits
- Feed (rides/help), My Rides, Chats, Profile tabs
- Ride details, help details, chat room overlays
- Create ride/help flows
- Friend requests + notifications flows
- Profile edit flow
- Local persistence via AsyncStorage

## Run locally

```bash
cd /Users/rishabh/Projects/RideSathiReact
npm install
npm run start
```

Then:

- Press `a` for Android emulator
- Or scan QR in Expo Go on Android phone (same Wi-Fi)

## Build/install on Android device

```bash
cd /Users/rishabh/Projects/RideSathiReact
npm install
npx expo run:android
```

For direct APK builds (without local Gradle/SDK setup), use EAS:

```bash
npx expo install eas-cli
npx eas build -p android --profile preview
```

## Firebase integration

The app now includes Firebase service modules:

- Auth wrappers (`src/firebase/auth.ts`) for phone OTP flow
- Cloud Firestore sync for users/rides/help posts (`src/firebase/firestore.ts`)
- Realtime Database chat sync (`src/firebase/chat.ts`)
- Cloud Storage upload helpers (`src/firebase/storage.ts`)
- Cloud Functions call helpers (`src/firebase/functions.ts`)

### 1. Add environment variables

Copy `.env.example` to `.env` and fill your Firebase project values.

```bash
cp .env.example .env
```

### 2. Enable products in Firebase Console

- Authentication: Phone
- Cloud Firestore
- Realtime Database
- Cloud Storage
- Cloud Functions

### 3. Phone OTP note

Firebase phone auth in Expo requires an app verifier (reCAPTCHA/SafetyNet).  
This repo includes service wrappers, while the current login screen still supports the prototype OTP path.

## Notes

- This is still mock-first for data/API calls.
- No backend API wiring in this app yet.
- Existing server in your web project can be integrated next.
