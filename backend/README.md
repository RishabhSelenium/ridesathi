# Backend

Firebase backend configuration lives here.

## Current contents
- `firebase/firestore.rules`
- `firebase/database.rules.json`
- `firebase/storage.rules`
- `cloudflare/` (R2 uploads + push fanout worker)

## Deploy rules
Run from project root:

```bash
npx firebase-tools deploy --only firestore:rules,database,storage --project YOUR_FIREBASE_PROJECT_ID
```

## Deploy Cloudflare worker (Spark-compatible push fanout)
From project root:

```bash
cd backend/cloudflare
wrangler deploy
```
