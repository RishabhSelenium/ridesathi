# ThrottleUp React Native

React Native (Expo) migration of the original ThrottleUp web prototype.

## Included in this migration

- Splash + login flow
- Firebase phone OTP login (native Android build)
- Live bike news feed (Google News RSS aggregation with local cache fallback)
- Feed (rides/help), My Rides, Chats, Profile tabs
- Ride details, help details, chat room overlays
- Create ride/help flows
- Friend requests + notifications flows
- Profile edit flow
- Local persistence via AsyncStorage + cloud sync via Firebase

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
- Device push-token registration to Firestore (`users/{uid}.expoPushTokens` and `users/{uid}.firebasePushTokens`)

### 1. Add environment variables

Copy `.env.example` to `.env` and fill your Firebase project values.

```bash
cp .env.example .env
```

Optional: use Cloudflare R2 for image uploads (instead of Firebase Storage):

- `EXPO_PUBLIC_IMAGE_STORAGE_PROVIDER=r2`
- `EXPO_PUBLIC_R2_BACKEND_BASE_URL=http://<your-backend-host>:8788`
- `EXPO_PUBLIC_R2_BACKEND_TOKEN=<backend-token>`

R2 signer backend: `backend/r2-signer/`
R2 upload worker: `backend/cloudflare/`

The app stores signed image URLs plus expiry in Firestore and refreshes them automatically when fetched after expiry.

For map-style location suggestions in Create Ride, also set one of:

- `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` (preferred)
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (used as fallback)

For Android in-app maps (Add Route on Map / ride route preview), the native build also needs a Maps SDK key.
This project now reads it from, in order:

- `GOOGLE_MAPS_API_KEY`
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`
- `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY`

After setting the key, rebuild the Android app (`npx expo run:android`) so the manifest metadata is updated.
Also make sure **Maps SDK for Android** is enabled for that key in Google Cloud Console.

### 2. Enable products in Firebase Console

- Authentication: Email/Password
- Authentication: Phone
- Cloud Firestore
- Realtime Database
- Cloud Storage
- Cloud Functions

### 3. Phone OTP note

Phone auth is native-only via `@react-native-firebase/auth` (Android dev build/APK).

- reCAPTCHA fallback has been removed.
- Expo Go does not support this OTP flow; use `npx expo run:android` and open the installed dev build.
- If Firebase is not configured correctly, OTP will fail instead of switching to prototype mode.
- User phone number is stored in Firestore `users/{uid}` as `phoneNumber`.

### 4. Beta default OTP mode (for closed testing)

This build supports beta login with a shared OTP and stable identity per phone number.

- `EXPO_PUBLIC_BETA_MODE=true`
- `EXPO_PUBLIC_BETA_DEFAULT_OTP=1234`
- `EXPO_PUBLIC_BETA_ALLOWED_PHONES=` (comma-separated E.164 values, optional)
- `EXPO_PUBLIC_BETA_AUTH_PASSWORD=ridesathi-beta` (must be at least 6 chars)

When beta mode is enabled, login uses Firebase Email/Password under the hood with a deterministic account per phone number.

### 5. News feed note

- News tab fetches latest articles from external RSS feeds (motorcycle/bike + MotoGP topics).
- Feed auto-refreshes on app launch, whenever News tab opens, and every 15 minutes while app is running.
- If network fails, the app keeps showing cached news from AsyncStorage (or mock fallback on first run).

### 6. Security rules (versioned)

This repo now versions Firebase security rules:

- Firestore: `backend/firebase/firestore.rules`
- Realtime Database: `backend/firebase/database.rules.json`
- Cloud Storage: `backend/firebase/storage.rules`
- Firebase config mapping: `firebase.json`

Deploy only security rules:

```bash
firebase deploy --only firestore:rules,database,storage
```

If you use a specific Firebase project id:

```bash
firebase deploy --project <your-project-id> --only firestore:rules,database,storage
```

Deploy Cloud Functions (FCM notification backend):

```bash
firebase deploy --only functions
```

Deploy Cloudflare worker updates (R2 image uploads):

```bash
cd backend/cloudflare
wrangler deploy
```

## Notes

- Data is still partially mock-seeded on first run, then synced with Firebase when enabled.
- This app has no separate custom backend server in this repo; Firebase is the backend.
