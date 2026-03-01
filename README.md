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

## Notes

- This is still mock-first for data/API calls.
- No backend API wiring in this app yet.
- Existing server in your web project can be integrated next.
