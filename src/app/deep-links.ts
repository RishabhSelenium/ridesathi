const APP_SCHEME = 'throttleup';
const RIDE_JOIN_PATH = 'ride/join';
const ANDROID_PACKAGE_NAME = 'com.reinagain.throttleup';

export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_NAME}`;

const decodeQueryToken = (value: string): string =>
  decodeURIComponent(value.replace(/\+/g, ' '));

const getQueryParam = (query: string, key: string): string | null => {
  const normalizedQuery = query.startsWith('?') ? query.slice(1) : query;
  if (!normalizedQuery) return null;

  for (const pair of normalizedQuery.split('&')) {
    if (!pair) continue;
    const [rawKey, ...valueParts] = pair.split('=');
    if (!rawKey) continue;
    if (decodeQueryToken(rawKey).toLowerCase() !== key.toLowerCase()) continue;

    const rawValue = valueParts.join('=');
    if (!rawValue) return null;

    const decodedValue = decodeQueryToken(rawValue).trim();
    return decodedValue.length > 0 ? decodedValue : null;
  }

  return null;
};

const parseRideJoinFromPath = (pathWithQuery: string): string | null => {
  const [rawPath, rawQuery = ''] = pathWithQuery.split('?');
  const normalizedPath = rawPath.trim().replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
  if (normalizedPath !== RIDE_JOIN_PATH) return null;

  return getQueryParam(rawQuery, 'rideId') ?? getQueryParam(rawQuery, 'id');
};

export const parseRideJoinIdFromUrl = (url: string): string | null => {
  const normalizedUrl = url.trim();
  if (!normalizedUrl) return null;

  const lowerUrl = normalizedUrl.toLowerCase();
  if (lowerUrl.startsWith('intent://')) {
    const [beforeIntentMetadata] = normalizedUrl.split('#Intent;');
    const pathWithQuery = beforeIntentMetadata.slice('intent://'.length);
    return parseRideJoinFromPath(pathWithQuery);
  }

  const appPrefix = `${APP_SCHEME}://`;
  if (lowerUrl.startsWith(appPrefix)) {
    const pathWithQuery = normalizedUrl.slice(appPrefix.length);
    return parseRideJoinFromPath(pathWithQuery);
  }

  return null;
};

export const buildRideJoinDeepLink = (rideId: string): string =>
  `${APP_SCHEME}://${RIDE_JOIN_PATH}?rideId=${encodeURIComponent(rideId)}`;

export const buildRideJoinAndroidIntentUrl = (rideId: string): string =>
  `intent://${RIDE_JOIN_PATH}?rideId=${encodeURIComponent(rideId)}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE_NAME};S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)};end`;
