# Backend

Firebase backend configuration lives here.

## Current contents
- `firebase/firestore.rules`
- `firebase/database.rules.json`

## Deploy rules
Run from project root:

```bash
npx firebase-tools deploy --only firestore:rules,database --project YOUR_FIREBASE_PROJECT_ID
```
