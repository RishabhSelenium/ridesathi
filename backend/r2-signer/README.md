# R2 Signer Backend

This backend uses the AWS S3 SDK against Cloudflare R2. It uploads files, creates signed `GET` URLs, and returns both the signed URL and expiry so the app can store them in Firestore.

## Endpoints

- `POST /api/images/upload?key=<object-key>`
- `POST /api/images/sign`

Both endpoints return:

```json
{
  "objectKey": "profiles/user-123/1710000000000.jpg",
  "signedUrl": "https://...",
  "expiresAt": "2026-03-09T12:00:00.000Z"
}
```

## Environment

```bash
PORT=8788
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=throttleup
R2_SIGNED_URL_TTL_SECONDS=3600
R2_API_TOKEN=
```

`R2_API_TOKEN` is optional but recommended. If set, the client must send `Authorization: Bearer <token>`.

## Run

```bash
cd /Users/rishabh/Projects/ThrottleUp/backend/r2-signer
npm install
npm start
```

## App configuration

In `/Users/rishabh/Projects/ThrottleUp/.env`:

```bash
EXPO_PUBLIC_IMAGE_STORAGE_PROVIDER=r2
EXPO_PUBLIC_R2_BACKEND_BASE_URL=http://<your-backend-host>:8788
EXPO_PUBLIC_R2_BACKEND_TOKEN=<same-R2_API_TOKEN-if-set>
```

The app will:

- upload to `/api/images/upload`
- store signed URL + expiry in Firestore
- refresh expired signed URLs via `/api/images/sign`
