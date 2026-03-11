# Backend

Firebase backend configuration lives here.

## Current contents
- `firebase/firestore.rules`
- `firebase/database.rules.json`
- `firebase/storage.rules`
- `notifications/` (direct FCM push backend, no Cloud Functions)
- `cloudflare/`
- `r2-signer/`
- `cloudflare/` (R2 upload worker)

## Deploy rules
Run from project root:

```bash
npx firebase-tools deploy --only firestore:rules,database,storage --project YOUR_FIREBASE_PROJECT_ID
```

## Deploy Cloudflare worker (R2 uploads)
From project root:

```bash
cd backend/cloudflare
wrangler deploy
```

## Notifications backend (direct FCM)

From project root:

```bash
cd backend/notifications
npm install
npm start
```
