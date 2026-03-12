const express = require('express');
const os = require('os');
const admin = require('firebase-admin');

const PORT = Number.parseInt(process.env.PORT ?? '8790', 10);
const HOST = (process.env.HOST ?? '0.0.0.0').trim();
const NOTIFICATIONS_API_TOKEN = (process.env.NOTIFICATIONS_API_TOKEN ?? '').trim();
const USERS_COLLECTION = (process.env.NOTIFICATIONS_USERS_COLLECTION ?? 'users').trim();
const NEARBY_RADIUS_KM = Math.max(1, Number.parseInt(process.env.NOTIFICATIONS_NEARBY_RADIUS_KM ?? '35', 10));

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token'
]);

const sanitizeString = (value) => String(value ?? '').trim();
const asString = (value, fallback = '') => {
  const normalized = sanitizeString(value);
  return normalized || fallback;
};
const asStringArray = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => sanitizeString(item)).filter(Boolean);
};
const asLocation = (value) => {
  if (!value || typeof value !== 'object') return null;
  const raw = value;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
};

const normalizeCity = (value) => sanitizeString(value).toLowerCase();
const uniqueStrings = (items) => Array.from(new Set(items.filter(Boolean)));
const truncate = (value, max = 140) => {
  const text = sanitizeString(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
};

const chunk = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const toNotificationData = (payload) => {
  const entries = Object.entries(payload ?? {});
  const normalized = {};
  entries.forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    normalized[key] = String(value);
  });
  return normalized;
};

const toCandidateRoutePoints = (payload) => {
  const routePoints = Array.isArray(payload.routePoints) ? payload.routePoints : [];
  const normalizedRoutePoints = routePoints.map(asLocation).filter((point) => point !== null);
  if (normalizedRoutePoints.length > 0) return normalizedRoutePoints;
  const fallback = asLocation({ lat: payload.startLat, lng: payload.startLng });
  return fallback ? [fallback] : [];
};

const toUserLocation = (userData) => {
  return (
    asLocation(userData.lastKnownLocation) ||
    asLocation(userData.location) ||
    asLocation(userData.currentLocation) ||
    null
  );
};

const degreesToRadians = (value) => (value * Math.PI) / 180;
const haversineKm = (from, to) => {
  const earthRadiusKm = 6371;
  const dLat = degreesToRadians(to.lat - from.lat);
  const dLng = degreesToRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degreesToRadians(from.lat)) * Math.cos(degreesToRadians(to.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

const isWithinNearbyRadius = (userLocation, routePoints, radiusKm) => {
  if (!userLocation || routePoints.length === 0) return false;
  return routePoints.some((point) => haversineKm(userLocation, point) <= radiusKm);
};

const getServiceAccount = () => {
  const serviceAccountJson = sanitizeString(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (serviceAccountJson) {
    return JSON.parse(serviceAccountJson);
  }
  const serviceAccountBase64 = sanitizeString(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64);
  if (serviceAccountBase64) {
    const decoded = Buffer.from(serviceAccountBase64, 'base64').toString('utf8');
    return JSON.parse(decoded);
  }
  return null;
};

const initializeFirebaseAdmin = () => {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const explicitProjectId = sanitizeString(process.env.FIREBASE_PROJECT_ID);
  const serviceAccount = getServiceAccount();
  const options = {};
  if (serviceAccount) {
    options.credential = admin.credential.cert(serviceAccount);
  } else {
    options.credential = admin.credential.applicationDefault();
  }
  if (explicitProjectId) {
    options.projectId = explicitProjectId;
  }
  return admin.initializeApp(options);
};

initializeFirebaseAdmin();

const db = admin.firestore();
const app = express();
app.use(express.json({ limit: '1mb' }));

const ensureAuthorized = (req, res, next) => {
  if (!NOTIFICATIONS_API_TOKEN) {
    next();
    return;
  }

  const authHeader = req.get('authorization') ?? '';
  if (authHeader !== `Bearer ${NOTIFICATIONS_API_TOKEN}`) {
    res.status(401).json({ ok: false, error: 'Unauthorized request.' });
    return;
  }

  next();
};

const getUserDocById = async (userId) => {
  const normalizedId = sanitizeString(userId);
  if (!normalizedId) return null;
  const snapshot = await db.collection(USERS_COLLECTION).doc(normalizedId).get();
  if (!snapshot.exists) return null;
  return { id: snapshot.id, data: snapshot.data() ?? {} };
};

const getUserDocsByIds = async (userIds) => {
  const normalizedIds = uniqueStrings(userIds.map((id) => sanitizeString(id)));
  if (normalizedIds.length === 0) return [];
  const docRefs = normalizedIds.map((id) => db.collection(USERS_COLLECTION).doc(id));
  const snapshots = await db.getAll(...docRefs);
  return snapshots.filter((snapshot) => snapshot.exists).map((snapshot) => ({ id: snapshot.id, data: snapshot.data() ?? {} }));
};

const getAllUsers = async () => {
  const snapshot = await db.collection(USERS_COLLECTION).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() ?? {} }));
};

const getUserFcmTokens = (userData) => {
  return uniqueStrings(asStringArray(userData.firebasePushTokens));
};

const pruneInvalidTokens = async (invalidTokens, tokenOwners) => {
  if (invalidTokens.length === 0) return 0;

  const tokensByUserId = new Map();
  invalidTokens.forEach((token) => {
    const owners = tokenOwners.get(token);
    if (!owners) return;
    owners.forEach((ownerUserId) => {
      const tokens = tokensByUserId.get(ownerUserId) ?? [];
      tokens.push(token);
      tokensByUserId.set(ownerUserId, tokens);
    });
  });

  const writes = Array.from(tokensByUserId.entries());
  if (writes.length === 0) return 0;

  const batch = db.batch();
  writes.forEach(([userId, tokens]) => {
    const uniqueTokens = uniqueStrings(tokens);
    if (uniqueTokens.length === 0) return;
    const docRef = db.collection(USERS_COLLECTION).doc(userId);
    batch.set(
      docRef,
      {
        firebasePushTokens: admin.firestore.FieldValue.arrayRemove(...uniqueTokens)
      },
      { merge: true }
    );
  });
  await batch.commit();

  return writes.length;
};

const deliverPushToUsers = async ({ userDocs, title, body, data, soundName }) => {
  const tokenOwners = new Map();
  const dedupedTokenEntries = [];
  const dedupeGuard = new Set();

  userDocs.forEach((userDoc) => {
    const tokens = getUserFcmTokens(userDoc.data);
    tokens.forEach((token) => {
      if (!tokenOwners.has(token)) {
        tokenOwners.set(token, new Set());
      }
      tokenOwners.get(token).add(userDoc.id);

      if (dedupeGuard.has(token)) return;
      dedupeGuard.add(token);
      dedupedTokenEntries.push({
        token,
        userId: userDoc.id
      });
    });
  });

  if (dedupedTokenEntries.length === 0) {
    return {
      tokenCount: 0,
      sentCount: 0,
      failedCount: 0,
      removedTokens: 0
    };
  }

  const tokenChunks = chunk(dedupedTokenEntries, 500);
  let sentCount = 0;
  let failedCount = 0;
  const invalidTokens = [];

  for (const entries of tokenChunks) {
    const response = await admin.messaging().sendEachForMulticast({
      tokens: entries.map((entry) => entry.token),
      notification: {
        title,
        body
      },
      data: toNotificationData(data),
      android: {
        priority: 'high',
        notification: soundName ? { sound: soundName, channelId: 'throttleup.notifications' } : { channelId: 'throttleup.notifications' }
      },
      apns: soundName
        ? {
            payload: {
              aps: {
                sound: `${soundName}.mp3`
              }
            }
          }
        : undefined
    });

    sentCount += response.successCount;
    failedCount += response.failureCount;

    response.responses.forEach((entryResponse, index) => {
      if (entryResponse.success) return;
      const code = sanitizeString(entryResponse.error?.code);
      if (!INVALID_TOKEN_CODES.has(code)) return;
      const failedEntry = entries[index];
      if (failedEntry?.token) {
        invalidTokens.push(failedEntry.token);
      }
    });
  }

  const removedUsers = await pruneInvalidTokens(uniqueStrings(invalidTokens), tokenOwners);
  return {
    tokenCount: dedupedTokenEntries.length,
    sentCount,
    failedCount,
    removedTokens: invalidTokens.length,
    removedUsers
  };
};

const filterOutBlockedUsers = async ({ recipients, senderId, senderData }) => {
  if (!senderId) return recipients;
  const normalizedSenderData = senderData ?? (await getUserDocById(senderId))?.data ?? null;
  const senderBlocked = new Set(asStringArray(normalizedSenderData?.blockedUserIds));
  return recipients.filter((recipient) => {
    const recipientBlocked = new Set(asStringArray(recipient.data?.blockedUserIds));
    if (senderBlocked.has(recipient.id)) return false;
    if (recipientBlocked.has(senderId)) return false;
    return true;
  });
};

app.get('/health', (_req, res) => {
  res.json({
    ok: true
  });
});

app.post('/notifications/ride-created', ensureAuthorized, async (req, res) => {
  try {
    const payload = req.body ?? {};
    const rideId = asString(payload.rideId);
    const creatorId = asString(payload.creatorId);
    const creatorName = asString(payload.creatorName, 'A rider');
    const rideTitle = asString(payload.title, 'New ride');
    const city = asString(payload.city);
    const visibility = uniqueStrings(asStringArray(payload.visibility));
    if (!rideId || !creatorId || !city || visibility.length === 0) {
      res.status(400).json({ ok: false, error: 'rideId, creatorId, city, and visibility are required.' });
      return;
    }

    const allUsers = await getAllUsers();
    const creatorDoc = allUsers.find((entry) => entry.id === creatorId) ?? null;
    const creatorFriends = new Set(asStringArray(creatorDoc?.data?.friends));
    const creatorBlocked = new Set(asStringArray(creatorDoc?.data?.blockedUserIds));

    const routePoints = toCandidateRoutePoints(payload);
    const normalizedCity = normalizeCity(city);
    const includesFriends = visibility.includes('Friends');
    const includesCity = visibility.includes('City');
    const includesNearby = visibility.includes('Nearby');

    let recipients = allUsers.filter((entry) => {
      if (entry.id === creatorId) return false;
      if (creatorBlocked.has(entry.id)) return false;

      const recipientBlocked = new Set(asStringArray(entry.data?.blockedUserIds));
      if (recipientBlocked.has(creatorId)) return false;

      let include = false;
      const cityMatches = normalizeCity(entry.data?.city) === normalizedCity;
      if (includesFriends && creatorFriends.has(entry.id)) {
        include = true;
      }
      if (includesCity && cityMatches) {
        include = true;
      }
      if (includesNearby) {
        const recipientLocation = toUserLocation(entry.data);
        if (recipientLocation && routePoints.length > 0) {
          include = include || isWithinNearbyRadius(recipientLocation, routePoints, NEARBY_RADIUS_KM);
        } else if (cityMatches) {
          include = true;
        }
      }

      return include;
    });

    recipients = await filterOutBlockedUsers({
      recipients,
      senderId: creatorId,
      senderData: creatorDoc?.data ?? null
    });

    const delivery = await deliverPushToUsers({
      userDocs: recipients,
      title: 'New ride around you',
      body: `${creatorName} posted "${truncate(rideTitle, 80)}" in ${city}.`,
      data: {
        type: 'ride_created',
        rideId,
        senderId: creatorId
      },
      soundName: 'Ride_notification'
    });

    res.json({
      ok: true,
      recipientCount: recipients.length,
      ...delivery
    });
  } catch (error) {
    console.error('[notify][ride-created] failed:', error);
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Ride notification failed.' });
  }
});

app.post('/notifications/ride-cancelled', ensureAuthorized, async (req, res) => {
  try {
    const payload = req.body ?? {};
    const rideId = asString(payload.rideId);
    const title = asString(payload.title, 'Ride');
    const cancelledBy = asString(payload.cancelledBy);
    const cancelledByName = asString(payload.cancelledByName, 'Ride organizer');
    const participantIds = uniqueStrings(asStringArray(payload.participantIds)).filter((userId) => userId !== cancelledBy);
    if (!rideId || !cancelledBy || participantIds.length === 0) {
      res.json({
        ok: true,
        recipientCount: 0,
        tokenCount: 0,
        sentCount: 0,
        failedCount: 0
      });
      return;
    }

    let recipients = await getUserDocsByIds(participantIds);
    recipients = await filterOutBlockedUsers({
      recipients,
      senderId: cancelledBy
    });

    const delivery = await deliverPushToUsers({
      userDocs: recipients,
      title: 'Ride cancelled',
      body: `${cancelledByName} cancelled "${truncate(title, 80)}".`,
      data: {
        type: 'ride_cancelled',
        rideId,
        senderId: cancelledBy
      },
      soundName: 'Ride_notification'
    });

    res.json({
      ok: true,
      recipientCount: recipients.length,
      ...delivery
    });
  } catch (error) {
    console.error('[notify][ride-cancelled] failed:', error);
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Ride cancellation notification failed.' });
  }
});

app.post('/notifications/ride-request-owner', ensureAuthorized, async (req, res) => {
  try {
    const payload = req.body ?? {};
    const rideId = asString(payload.rideId);
    const rideTitle = asString(payload.rideTitle, 'your ride');
    const requesterId = asString(payload.requesterId);
    const requesterName = asString(payload.requesterName, 'A rider');
    const ownerId = asString(payload.ownerId);

    if (!rideId || !requesterId || !ownerId) {
      res.status(400).json({ ok: false, error: 'rideId, requesterId, requesterName, and ownerId are required.' });
      return;
    }

    let recipients = await getUserDocsByIds([ownerId]);
    recipients = await filterOutBlockedUsers({
      recipients,
      senderId: requesterId
    });

    const delivery = await deliverPushToUsers({
      userDocs: recipients,
      title: 'Join request received',
      body: `${requesterName} requested to join "${truncate(rideTitle, 80)}".`,
      data: {
        type: 'ride_request',
        rideId,
        senderId: requesterId
      },
      soundName: 'Ride_notification'
    });

    res.json({
      ok: true,
      recipientCount: recipients.length,
      ...delivery
    });
  } catch (error) {
    console.error('[notify][ride-request-owner] failed:', error);
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Ride request notification failed.' });
  }
});

app.post('/notifications/chat-message', ensureAuthorized, async (req, res) => {
  try {
    const payload = req.body ?? {};
    const conversationId = asString(payload.conversationId);
    const senderId = asString(payload.senderId);
    const senderName = asString(payload.senderName, 'New message');
    const recipientId = asString(payload.recipientId);
    const text = asString(payload.text);
    if (!conversationId || !senderId || !recipientId || !text) {
      res.status(400).json({ ok: false, error: 'conversationId, senderId, recipientId, and text are required.' });
      return;
    }

    let recipients = await getUserDocsByIds([recipientId]);
    recipients = await filterOutBlockedUsers({
      recipients,
      senderId
    });

    const delivery = await deliverPushToUsers({
      userDocs: recipients,
      title: senderName,
      body: truncate(text, 120),
      data: {
        type: 'chat_message',
        target: 'conversation',
        conversationId,
        senderId,
        userId: senderId
      },
      soundName: 'msg_notification'
    });

    res.json({
      ok: true,
      recipientCount: recipients.length,
      ...delivery
    });
  } catch (error) {
    console.error('[notify][chat-message] failed:', error);
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Chat notification failed.' });
  }
});

app.post('/notifications/group-chat-message', ensureAuthorized, async (req, res) => {
  try {
    const payload = req.body ?? {};
    const groupId = asString(payload.groupId);
    const groupName = asString(payload.groupName, 'Group');
    const senderId = asString(payload.senderId);
    const senderName = asString(payload.senderName, 'New message');
    const text = asString(payload.text);
    const memberIds = uniqueStrings(asStringArray(payload.memberIds)).filter((memberId) => memberId !== senderId);

    if (!groupId || !senderId || !text || memberIds.length === 0) {
      res.status(400).json({ ok: false, error: 'groupId, senderId, text, and memberIds are required.' });
      return;
    }

    let recipients = await getUserDocsByIds(memberIds);
    recipients = await filterOutBlockedUsers({
      recipients,
      senderId
    });

    const delivery = await deliverPushToUsers({
      userDocs: recipients,
      title: `${senderName} in ${truncate(groupName, 40)}`,
      body: truncate(text, 120),
      data: {
        type: 'group_chat_message',
        target: 'group_chat',
        groupId,
        senderId
      },
      soundName: 'msg_notification'
    });

    res.json({
      ok: true,
      recipientCount: recipients.length,
      ...delivery
    });
  } catch (error) {
    console.error('[notify][group-chat-message] failed:', error);
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Group chat notification failed.' });
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
  console.log(`Notifications backend listening on http://localhost:${PORT}`);
  if (lanIp) {
    console.log(`Notifications backend LAN URL: http://${lanIp}:${PORT}`);
  }
});
