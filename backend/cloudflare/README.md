# Cloudflare R2 Upload Worker

This worker receives authenticated image uploads and writes them to an R2 bucket.

## 1) Create worker config

Copy:

```bash
cp /Users/rishabh/Projects/ThrottleUp/backend/cloudflare/wrangler.example.toml /Users/rishabh/Projects/ThrottleUp/backend/cloudflare/wrangler.toml
```

Update in `wrangler.toml`:

- `bucket_name`
- `preview_bucket_name`

## 2) Set worker secret

```bash
cd /Users/rishabh/Projects/ThrottleUp/backend/cloudflare
wrangler secret put UPLOAD_TOKEN
```

Use a strong random value. Do not reuse Cloudflare API tokens or R2 secret keys.

## 3) Deploy worker

```bash
cd /Users/rishabh/Projects/ThrottleUp/backend/cloudflare
wrangler deploy
```

## 4) Configure app env

In `.env`:

```bash
EXPO_PUBLIC_IMAGE_STORAGE_PROVIDER=r2
EXPO_PUBLIC_R2_UPLOAD_BASE_URL=https://<your-worker-subdomain>.workers.dev
EXPO_PUBLIC_R2_UPLOAD_TOKEN=<same-upload-token-you-set-as-UPLOAD_TOKEN-secret>
```

Restart Metro after changing env values.

## Notes

- Keep Cloudflare R2 access key and secret key only in backend infrastructure, never in mobile app code.
- Allowed upload keys are restricted to `profiles/`, `groups/`, `bikes/`, and `rides/`.
- Uploaded files are served via worker URL: `/public/<object-key>`.
