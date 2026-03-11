# Notifications Backend (Direct FCM)

Express service that sends push notifications with Firebase Admin SDK (FCM), without Firebase Cloud Functions.

## Requirements

- Node 18+
- Firebase project with Cloud Messaging enabled
- Service account auth via one of:
  - `GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/service-account.json`
  - `FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'`
  - `FIREBASE_SERVICE_ACCOUNT_BASE64=<base64-json>`

## Environment variables

- `PORT` (default: `8790`)
- `HOST` (default: `0.0.0.0`)
- `NOTIFICATIONS_API_TOKEN` (optional bearer token expected from app)
- `FIREBASE_PROJECT_ID` (optional override)
- `NOTIFICATIONS_USERS_COLLECTION` (default: `users`)
- `NOTIFICATIONS_NEARBY_RADIUS_KM` (default: `35`)

## Run

```bash
cd backend/notifications
npm install
npm start
```

## Endpoints used by the app

- `POST /notifications/ride-created`
- `POST /notifications/ride-cancelled`
- `POST /notifications/ride-request-owner`
- `POST /notifications/chat-message`
- `POST /notifications/squad-chat-message`

The service reads recipient device tokens from Firestore `users/{uid}.firebasePushTokens`.
