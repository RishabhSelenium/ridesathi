const ALLOWED_KEY_PREFIXES = ['profiles/', 'groups/', 'bikes/', 'rides/'];

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
