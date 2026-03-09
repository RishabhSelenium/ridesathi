const ALLOWED_KEY_PREFIXES = ['profiles/', 'squads/', 'bikes/', 'rides/'];
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_TOKEN_REGEX = /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type'
};

const jsonResponse = (status, payload) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });

const sanitizeObjectKey = (value) => {
  const normalized = value.replace(/^\/+/, '').replace(/\/+/g, '/').trim();
  if (!normalized) return '';
  if (normalized.includes('..')) return '';
  return normalized;
};

const isAllowedObjectKey = (value) => ALLOWED_KEY_PREFIXES.some((prefix) => value.startsWith(prefix));
const buildPublicFileUrl = (origin, objectKey) => `${origin}/public/${encodeURIComponent(objectKey).replace(/%2F/g, '/')}`;
const chunk = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const sendExpoBatch = async (messages) => {
  const response = await fetch(EXPO_PUSH_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(messages)
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    throw new Error(`Expo push request failed (${response.status}): ${responseText}`);
  }
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname.startsWith('/public/')) {
      const objectKey = sanitizeObjectKey(decodeURIComponent(url.pathname.replace('/public/', '')));
      if (!objectKey || !isAllowedObjectKey(objectKey)) {
        return jsonResponse(400, { error: 'Invalid object key.' });
      }

      const file = await env.IMAGE_BUCKET.get(objectKey);
      if (!file) {
        return jsonResponse(404, { error: 'Not found.' });
      }

      return new Response(file.body, {
        status: 200,
        headers: {
          'Content-Type': file.httpMetadata?.contentType || 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    if (url.pathname === '/notify/ride-request') {
      if (request.method !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed.' });
      }

      const authHeader = request.headers.get('Authorization') ?? '';
      const expectedAuthHeader = env.PUSH_FANOUT_TOKEN ? `Bearer ${env.PUSH_FANOUT_TOKEN}` : '';
      if (!env.PUSH_FANOUT_TOKEN || authHeader !== expectedAuthHeader) {
        return jsonResponse(401, { error: 'Unauthorized push fanout token.' });
      }

      let payload;
      try {
        payload = await request.json();
      } catch {
        return jsonResponse(400, { error: 'Invalid JSON payload.' });
      }

      const rideId = typeof payload?.rideId === 'string' ? payload.rideId.trim() : '';
      const rideTitle = typeof payload?.rideTitle === 'string' ? payload.rideTitle.trim() : '';
      const requesterId = typeof payload?.requesterId === 'string' ? payload.requesterId.trim() : '';
      const requesterName = typeof payload?.requesterName === 'string' ? payload.requesterName.trim() : 'A rider';
      const ownerPushTokens = Array.isArray(payload?.ownerPushTokens)
        ? payload.ownerPushTokens.filter((token) => typeof token === 'string').map((token) => token.trim())
        : [];
      const validOwnerPushTokens = Array.from(new Set(ownerPushTokens)).filter((token) => EXPO_PUSH_TOKEN_REGEX.test(token));

      if (!rideId || !rideTitle || !requesterId) {
        return jsonResponse(400, { error: 'Missing ride request payload fields.' });
      }

      if (validOwnerPushTokens.length === 0) {
        return jsonResponse(200, { sent: 0, skipped: true });
      }

      const messages = validOwnerPushTokens.map((token) => ({
        to: token,
        sound: 'Ride_notification.mp3',
        title: 'Request received',
        body: `${requesterName} requested to join "${rideTitle}".`,
        data: {
          type: 'ride_request',
          rideId,
          requesterId
        }
      }));

      try {
        const batches = chunk(messages, 100);
        for (const batch of batches) {
          await sendExpoBatch(batch);
        }
      } catch (error) {
        return jsonResponse(502, {
          error: 'Push delivery failed.',
          details: error instanceof Error ? error.message : String(error)
        });
      }

      return jsonResponse(200, { sent: messages.length });
    }

    if (url.pathname !== '/upload') {
      return jsonResponse(404, { error: 'Not found.' });
    }

    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed.' });
    }

    const authHeader = request.headers.get('Authorization') ?? '';
    const expectedAuthHeader = env.UPLOAD_TOKEN ? `Bearer ${env.UPLOAD_TOKEN}` : '';
    if (env.UPLOAD_TOKEN && authHeader !== expectedAuthHeader) {
      return jsonResponse(401, { error: 'Unauthorized upload token.' });
    }

    const rawKey = url.searchParams.get('key') ?? '';
    const objectKey = sanitizeObjectKey(rawKey);
    if (!objectKey || !isAllowedObjectKey(objectKey)) {
      return jsonResponse(400, { error: 'Invalid object key.' });
    }

    const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
    const body = await request.arrayBuffer();
    if (body.byteLength === 0) {
      return jsonResponse(400, { error: 'Upload body is empty.' });
    }

    await env.IMAGE_BUCKET.put(objectKey, body, {
      httpMetadata: {
        contentType
      }
    });

    return jsonResponse(200, {
      key: objectKey,
      url: buildPublicFileUrl(url.origin, objectKey)
    });
  }
};
