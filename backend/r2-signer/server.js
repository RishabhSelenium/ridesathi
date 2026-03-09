const express = require('express');
const os = require('os');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const PORT = Number.parseInt(process.env.PORT ?? '8788', 10);
const HOST = (process.env.HOST ?? '0.0.0.0').trim();
const R2_ACCOUNT_ID = (process.env.R2_ACCOUNT_ID ?? '').trim();
const R2_ACCESS_KEY_ID = (process.env.R2_ACCESS_KEY_ID ?? '').trim();
const R2_SECRET_ACCESS_KEY = (process.env.R2_SECRET_ACCESS_KEY ?? '').trim();
const R2_BUCKET_NAME = (process.env.R2_BUCKET_NAME ?? '').trim();
const R2_API_TOKEN = (process.env.R2_API_TOKEN ?? '').trim();
const SIGNED_URL_TTL_SECONDS = Math.max(60, Number.parseInt(process.env.R2_SIGNED_URL_TTL_SECONDS ?? '3600', 10));
const ALLOWED_KEY_PREFIXES = ['profiles/', 'squads/', 'bikes/', 'rides/'];

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  throw new Error('Missing R2 signer env. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME.');
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY
  }
});

const app = express();

app.use('/api/images/upload', express.raw({ type: '*/*', limit: '25mb' }));
app.use('/api/images/sign', express.json({ limit: '1mb' }));

const sanitizeObjectKey = (value) => {
  const normalized = String(value ?? '')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .trim();

  if (!normalized || normalized.includes('..')) return '';
  return normalized;
};

const isAllowedObjectKey = (objectKey) => ALLOWED_KEY_PREFIXES.some((prefix) => objectKey.startsWith(prefix));

const ensureAuthorized = (req, res, next) => {
  if (!R2_API_TOKEN) {
    next();
    return;
  }

  const authHeader = req.get('authorization') ?? '';
  if (authHeader !== `Bearer ${R2_API_TOKEN}`) {
    res.status(401).json({ error: 'Unauthorized request.' });
    return;
  }

  next();
};

const buildSignedAsset = async (objectKey) => {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: objectKey
  });
  const signedUrl = await getSignedUrl(s3, command, { expiresIn: SIGNED_URL_TTL_SECONDS });
  const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();

  return {
    objectKey,
    signedUrl,
    expiresAt
  };
};

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/images/upload', ensureAuthorized, async (req, res) => {
  try {
    const objectKey = sanitizeObjectKey(req.query.key);
    if (!objectKey || !isAllowedObjectKey(objectKey)) {
      res.status(400).json({ error: 'Invalid object key.' });
      return;
    }

    if (!req.body || req.body.length === 0) {
      res.status(400).json({ error: 'Upload body is empty.' });
      return;
    }

    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: objectKey,
        Body: req.body,
        ContentType: req.get('content-type') || 'application/octet-stream'
      })
    );

    res.json(await buildSignedAsset(objectKey));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Upload failed.' });
  }
});

app.post('/api/images/sign', ensureAuthorized, async (req, res) => {
  try {
    const objectKey = sanitizeObjectKey(req.body?.objectKey);
    if (!objectKey || !isAllowedObjectKey(objectKey)) {
      res.status(400).json({ error: 'Invalid object key.' });
      return;
    }

    res.json(await buildSignedAsset(objectKey));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Signing failed.' });
  }
});

const resolveLanIpv4 = () => {
  const interfaces = os.networkInterfaces();
  for (const values of Object.values(interfaces)) {
    if (!values) continue;
    for (const details of values) {
      if (details.family === 'IPv4' && !details.internal) {
        return details.address;
      }
    }
  }
  return null;
};

app.listen(PORT, HOST, () => {
  const lanIp = resolveLanIpv4();
  console.log(`R2 signer listening on http://localhost:${PORT}`);
  if (lanIp) {
    console.log(`R2 signer LAN URL: http://${lanIp}:${PORT}`);
  }
});
