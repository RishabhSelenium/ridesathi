import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  type DocumentData,
  type Unsubscribe
} from 'firebase/firestore';

import {
  HelpPost,
  HelpReply,
  MapPoint,
  ModerationReport,
  RideCostType,
  RideInviteAudience,
  RideJoinPermission,
  RidePaymentMethod,
  RidePaymentStatus,
  RidePost,
  RideVisibility,
  SignedImageAsset,
  Group,
  GroupJoinPermission,
  GroupRideCreatePermission,
  User
} from '../types';
import { getFirebaseServices } from './client';
import { refreshSignedImageAsset } from './storage';

const USERS_COLLECTION = 'users';
const USER_DIRECTORY_COLLECTION = 'userDirectory';
const RIDES_COLLECTION = 'rides';
const HELP_COLLECTION = 'helpPosts';
const GROUPS_COLLECTION = 'groups';
const MODERATION_REPORTS_COLLECTION = 'moderationReports';
const RIDE_VISIBILITY_OPTIONS: RideVisibility[] = ['Nearby', 'City', 'Friends'];
const GROUP_JOIN_PERMISSION_OPTIONS: GroupJoinPermission[] = ['anyone', 'request_to_join', 'invite_only'];
const GROUP_RIDE_CREATE_PERMISSION_OPTIONS: GroupRideCreatePermission[] = ['anyone', 'admin'];
const RIDE_JOIN_PERMISSION_OPTIONS: RideJoinPermission[] = ['anyone', 'request_to_join'];

const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const asBoolean = (value: unknown, fallback = false): boolean => (typeof value === 'boolean' ? value : fallback);
const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const FIREBASE_PUSH_TOKEN_REGEX = /^[\w\-:.]{20,}$/;
const parseCoordinateNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};
const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const asStringMap = (value: unknown): Record<string, string> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => [key.trim(), typeof item === 'string' ? item.trim() : ''] as const)
    .filter(([key, item]) => key.length > 0 && item.length > 0);

  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
};
const asSignedImageAsset = (value: unknown): SignedImageAsset | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const objectKey = typeof raw.objectKey === 'string' ? raw.objectKey.trim() : '';
  const signedUrl = typeof raw.signedUrl === 'string' ? raw.signedUrl.trim() : '';
  const expiresAt = typeof raw.expiresAt === 'string' ? raw.expiresAt.trim() : '';

  if (!objectKey || !signedUrl || !expiresAt) return undefined;
  return { objectKey, signedUrl, expiresAt };
};
const asSignedImageAssetMap = (value: unknown): Record<string, SignedImageAsset> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => [key.trim(), asSignedImageAsset(item)] as const)
    .filter((entry): entry is readonly [string, SignedImageAsset] => entry[0].length > 0 && entry[1] !== undefined);

  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
};
const normalizeSosContacts = (value: unknown): string[] =>
  Array.from(new Set(asStringArray(value).map((item) => item.trim()).filter(Boolean)));
const normalizeUniqueStringArray = (value: unknown): string[] =>
  Array.from(new Set(asStringArray(value).map((item) => item.trim()).filter(Boolean)));
const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 64) || 'user';
const buildUserDirectoryDocId = (name: string, uid: string): string => `${slugify(name)}-${uid.slice(0, 10).toLowerCase()}`;

const normalizeVisibility = (value: unknown): RideVisibility[] => {
  if (Array.isArray(value)) {
    const normalized = value.filter(
      (item): item is RideVisibility => typeof item === 'string' && RIDE_VISIBILITY_OPTIONS.includes(item as RideVisibility)
    );
    return normalized.length > 0 ? Array.from(new Set<RideVisibility>(normalized)) : ['City'];
  }

  if (typeof value === 'string' && RIDE_VISIBILITY_OPTIONS.includes(value as RideVisibility)) {
    return [value as RideVisibility];
  }

  return ['City'];
};

const normalizeRideJoinPermission = (value: unknown): RideJoinPermission =>
  typeof value === 'string' && RIDE_JOIN_PERMISSION_OPTIONS.includes(value as RideJoinPermission)
    ? (value as RideJoinPermission)
    : 'request_to_join';

const normalizePoint = (item: unknown): MapPoint | null => {
  if (!item || typeof item !== 'object') return null;
  const point = item as {
    lat?: unknown;
    lng?: unknown;
    latitude?: unknown;
    longitude?: unknown;
    _latitude?: unknown;
    _longitude?: unknown;
    _lat?: unknown;
    _long?: unknown;
    label?: unknown;
  };
  const lat =
    parseCoordinateNumber(point.lat) ??
    parseCoordinateNumber(point.latitude) ??
    parseCoordinateNumber(point._latitude) ??
    parseCoordinateNumber(point._lat);
  const lng =
    parseCoordinateNumber(point.lng) ??
    parseCoordinateNumber(point.longitude) ??
    parseCoordinateNumber(point._longitude) ??
    parseCoordinateNumber(point._long);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return {
    lat,
    lng,
    label: typeof point.label === 'string' ? point.label : undefined
  };
};

const normalizeReply = (item: unknown): HelpReply | null => {
  if (!item || typeof item !== 'object') return null;
  const raw = item as Record<string, unknown>;
  const id = asString(raw.id);
  if (!id) return null;

  return {
    id,
    creatorId: asString(raw.creatorId),
    creatorName: asString(raw.creatorName),
    creatorAvatar: typeof raw.creatorAvatar === 'string' ? raw.creatorAvatar : undefined,
    text: asString(raw.text),
    isHelpful: asBoolean(raw.isHelpful, false),
    createdAt: asString(raw.createdAt, new Date().toISOString())
  };
};

const normalizeRidePaymentStatus = (userId: string, value: unknown): RidePaymentStatus | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const amount = asNumber(raw.amount, NaN);
  if (!Number.isFinite(amount) || amount < 0) return null;

  const status = asString(raw.status) === 'paid' ? 'paid' : 'pending';
  const methodRaw = asString(raw.method);
  const method: RidePaymentMethod | undefined = methodRaw === 'UPI_LINK' ? 'UPI_LINK' : undefined;

  return {
    userId,
    amount,
    status,
    updatedAt: asString(raw.updatedAt, new Date().toISOString()),
    paidAt: asString(raw.paidAt) || undefined,
    method,
    transactionRef: asString(raw.transactionRef) || undefined
  };
};

const normalizeRidePaymentStatusByUserId = (value: unknown): Record<string, RidePaymentStatus> | undefined => {
  if (!value || typeof value !== 'object') return undefined;

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([userId, raw]) => normalizeRidePaymentStatus(userId, raw))
    .filter((item): item is RidePaymentStatus => item !== null);

  if (entries.length === 0) return undefined;

  return Object.fromEntries(entries.map((item) => [item.userId, item]));
};

const normalizeUser = (id: string, raw: DocumentData): User => {
  const normalizedSosContacts = normalizeSosContacts(raw.sosContacts);
  const legacySosNumber = typeof raw.sosNumber === 'string' ? raw.sosNumber.trim() : '';
  const primarySosNumber = normalizedSosContacts[0] ?? legacySosNumber;
  const avatarAsset = asSignedImageAsset(raw.avatarAsset);
  const bikePhotoAssetsByName = asSignedImageAssetMap(raw.bikePhotoAssetsByName);
  const bikePhotosByName =
    bikePhotoAssetsByName
      ? Object.fromEntries(Object.entries(bikePhotoAssetsByName).map(([bikeName, asset]) => [bikeName, asset.signedUrl]))
      : asStringMap(raw.bikePhotosByName);

  return {
    id,
    phoneNumber: typeof raw.phoneNumber === 'string' ? raw.phoneNumber : undefined,
    name: asString(raw.name),
    garage: asStringArray(raw.garage),
    bikeType: asString(raw.bikeType),
    city: asString(raw.city),
    style: asString(raw.style),
    experience: (asString(raw.experience, 'Beginner') as User['experience']) ?? 'Beginner',
    distance: asString(raw.distance),
    isPro: asBoolean(raw.isPro, false),
    avatar: avatarAsset?.signedUrl ?? asString(raw.avatar),
    verified: asBoolean(raw.verified, false),
    typicalRideTime: asString(raw.typicalRideTime),
    friends: asStringArray(raw.friends),
    friendRequests: {
      sent: asStringArray(raw.friendRequests?.sent),
      received: asStringArray(raw.friendRequests?.received)
    },
    blockedUserIds: asStringArray(raw.blockedUserIds),
    firstName: typeof raw.firstName === 'string' ? raw.firstName : undefined,
    lastName: typeof raw.lastName === 'string' ? raw.lastName : undefined,
    fullName: typeof raw.fullName === 'string' ? raw.fullName : undefined,
    sosNumber: primarySosNumber || undefined,
    sosContacts: normalizedSosContacts.length > 0 ? normalizedSosContacts : legacySosNumber ? [legacySosNumber] : undefined,
    dob: typeof raw.dob === 'string' ? raw.dob : undefined,
    bloodGroup: typeof raw.bloodGroup === 'string' ? raw.bloodGroup : undefined,
    profileComplete: typeof raw.profileComplete === 'boolean' ? raw.profileComplete : undefined,
    avatarAsset,
    bikePhotosByName,
    bikePhotoAssetsByName,
    expoPushTokens: Array.from(
      new Set(
        asStringArray(raw.expoPushTokens).filter((token) => /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(token))
      )
    ),
    firebasePushTokens: Array.from(
      new Set(asStringArray(raw.firebasePushTokens).filter((token) => FIREBASE_PUSH_TOKEN_REGEX.test(token)))
    )
  };
};

const toFirestoreUserPayload = (user: User): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    id: String(user.id ?? '').trim(),
    name: asString(user.name).trim(),
    garage: normalizeUniqueStringArray(user.garage),
    bikeType: asString(user.bikeType).trim(),
    city: asString(user.city).trim(),
    style: asString(user.style).trim(),
    experience: asString(user.experience, 'Beginner').trim() || 'Beginner',
    distance: asString(user.distance).trim(),
    isPro: Boolean(user.isPro),
    avatar: asString(user.avatar).trim(),
    verified: Boolean(user.verified),
    typicalRideTime: asString(user.typicalRideTime).trim(),
    friends: normalizeUniqueStringArray(user.friends),
    friendRequests: {
      sent: normalizeUniqueStringArray(user.friendRequests?.sent),
      received: normalizeUniqueStringArray(user.friendRequests?.received)
    },
    blockedUserIds: normalizeUniqueStringArray(user.blockedUserIds),
    expoPushTokens: normalizeUniqueStringArray(user.expoPushTokens).filter((token) =>
      /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(token)
    ),
    firebasePushTokens: normalizeUniqueStringArray(user.firebasePushTokens).filter((token) =>
      FIREBASE_PUSH_TOKEN_REGEX.test(token)
    )
  };

  const phoneNumber = asString(user.phoneNumber).trim();
  if (phoneNumber) payload.phoneNumber = phoneNumber;

  const firstName = asString(user.firstName).trim();
  if (firstName) payload.firstName = firstName;

  const lastName = asString(user.lastName).trim();
  if (lastName) payload.lastName = lastName;

  const fullName = asString(user.fullName).trim();
  if (fullName) payload.fullName = fullName;

  const sosNumber = asString(user.sosNumber).trim();
  if (sosNumber) payload.sosNumber = sosNumber;

  const sosContacts = normalizeSosContacts(user.sosContacts);
  if (sosContacts.length > 0) payload.sosContacts = sosContacts;

  const dob = asString(user.dob).trim();
  if (dob) payload.dob = dob;

  const bloodGroup = asString(user.bloodGroup).trim();
  if (bloodGroup) payload.bloodGroup = bloodGroup;

  if (typeof user.profileComplete === 'boolean') {
    payload.profileComplete = user.profileComplete;
  }

  const avatarAsset = asSignedImageAsset(user.avatarAsset);
  if (avatarAsset) {
    payload.avatarAsset = avatarAsset;
  }

  const bikePhotosByName = asStringMap(user.bikePhotosByName);
  if (bikePhotosByName && Object.keys(bikePhotosByName).length > 0) {
    payload.bikePhotosByName = bikePhotosByName;
  }

  const bikePhotoAssetsByName = asSignedImageAssetMap(user.bikePhotoAssetsByName);
  if (bikePhotoAssetsByName && Object.keys(bikePhotoAssetsByName).length > 0) {
    payload.bikePhotoAssetsByName = bikePhotoAssetsByName;
  }

  return payload;
};

const syncUserDirectoryEntry = async (
  user: User,
  payload: Record<string, unknown>
): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;

  const uid = asString(user.id).trim();
  const fullName = asString(payload.fullName).trim();
  const name = fullName || asString(payload.name).trim();
  if (!uid || !name) return;

  const directoryCollectionRef = collection(services.firestore, USER_DIRECTORY_COLLECTION);
  const directoryDocId = buildUserDirectoryDocId(name, uid);
  const directoryDocRef = doc(services.firestore, USER_DIRECTORY_COLLECTION, directoryDocId);

  await setDoc(
    directoryDocRef,
    {
      uid,
      name,
      phoneNumber: asString(payload.phoneNumber).trim() || null,
      profileComplete: typeof payload.profileComplete === 'boolean' ? payload.profileComplete : false,
      sourceUserDocId: uid,
      lastSyncedAt: new Date().toISOString()
    },
    { merge: true }
  );

  const existingDirectoryDocs = await getDocs(query(directoryCollectionRef, where('uid', '==', uid)));
  await Promise.all(
    existingDirectoryDocs.docs
      .filter((item) => item.id !== directoryDocId)
      .map((item) => deleteDoc(item.ref))
  );
};

const normalizeRide = (id: string, raw: DocumentData): RidePost => {
  const costTypeRaw = asString(raw.costType);
  const inviteAudienceRaw = asString(raw.inviteAudience);
  const paymentMethodRaw = asString(raw.paymentMethod);
  const costType: RideCostType | undefined = ['Paid', 'Split', 'Free'].includes(costTypeRaw as RideCostType)
    ? (costTypeRaw as RideCostType)
    : undefined;
  const inviteAudience: RideInviteAudience | undefined = ['groups', 'riders'].includes(inviteAudienceRaw as RideInviteAudience)
    ? (inviteAudienceRaw as RideInviteAudience)
    : undefined;
  const paymentMethod: RidePaymentMethod | undefined = paymentMethodRaw === 'UPI_LINK' ? 'UPI_LINK' : undefined;

  return {
    id,
    creatorId: asString(raw.creatorId),
    creatorName: asString(raw.creatorName),
    creatorAvatar: asString(raw.creatorAvatar),
    type: asString(raw.type, 'Sunday Morning') as RidePost['type'],
    title: asString(raw.title),
    route: asString(raw.route),
    routePoints: Array.isArray(raw.routePoints) ? raw.routePoints.map(normalizePoint).filter((item): item is MapPoint => item !== null) : [],
    date: asString(raw.date),
    startDate: asString(raw.startDate) || undefined,
    returnDate: asString(raw.returnDate) || undefined,
    startTime: asString(raw.startTime),
    maxParticipants: asNumber(raw.maxParticipants, 5),
    currentParticipants: asStringArray(raw.currentParticipants),
    requests: asStringArray(raw.requests),
    city: asString(raw.city),
    visibility: normalizeVisibility(raw.visibility),
    createdAt: asString(raw.createdAt, new Date().toISOString()),
    primaryDestination: asString(raw.primaryDestination) || undefined,
    dayPlan: raw.dayPlan === 'multi' || raw.dayPlan === 'single' ? raw.dayPlan : undefined,
    startLocation: asString(raw.startLocation) || undefined,
    endLocation: asString(raw.endLocation) || undefined,
    assemblyTime: asString(raw.assemblyTime) || undefined,
    flagOffTime: asString(raw.flagOffTime) || undefined,
    rideDuration: asString(raw.rideDuration) || undefined,
    routeDistanceKm: typeof raw.routeDistanceKm === 'number' && Number.isFinite(raw.routeDistanceKm) ? raw.routeDistanceKm : undefined,
    routeEtaMinutes: typeof raw.routeEtaMinutes === 'number' && Number.isFinite(raw.routeEtaMinutes) ? raw.routeEtaMinutes : undefined,
    tollEstimateInr: typeof raw.tollEstimateInr === 'number' && Number.isFinite(raw.tollEstimateInr) ? raw.tollEstimateInr : undefined,
    costType,
    pricePerPerson: typeof raw.pricePerPerson === 'number' && Number.isFinite(raw.pricePerPerson) ? raw.pricePerPerson : undefined,
    splitTotalAmount: typeof raw.splitTotalAmount === 'number' && Number.isFinite(raw.splitTotalAmount) ? raw.splitTotalAmount : undefined,
    paymentMethod,
    upiPaymentLink: asString(raw.upiPaymentLink) || undefined,
    paymentStatusByUserId: normalizeRidePaymentStatusByUserId(raw.paymentStatusByUserId),
    inclusions: asStringArray(raw.inclusions),
    rideNote: asString(raw.rideNote) || undefined,
    inviteAudience,
    isPrivate: typeof raw.isPrivate === 'boolean' ? raw.isPrivate : undefined,
    joinPermission: normalizeRideJoinPermission(raw.joinPermission),
    destinationPhotoRef: asString(raw.destinationPhotoRef) || undefined,
    groupId: asString(raw.groupId) || undefined,
    groupName: asString(raw.groupName) || undefined,
    groupAvatar: asString(raw.groupAvatar) || undefined
  };
};

const toFirestoreRidePayload = (ride: RidePost): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    ...ride,
    createdAt: ride.createdAt || new Date().toISOString()
  };

  // Ensure optional fields are clearly handled
  if (!ride.groupId) {
    delete payload.groupId;
    delete payload.groupName;
    delete payload.groupAvatar;
  }

  return payload;
};

const normalizeHelpPost = (id: string, raw: DocumentData): HelpPost => ({
  id,
  creatorId: asString(raw.creatorId),
  creatorName: asString(raw.creatorName),
  creatorAvatar: asString(raw.creatorAvatar),
  title: asString(raw.title),
  description: asString(raw.description),
  bikeModel: asString(raw.bikeModel),
  category: asString(raw.category, 'Other') as HelpPost['category'],
  resolved: asBoolean(raw.resolved, false),
  upvotes: asNumber(raw.upvotes, 0),
  image: typeof raw.image === 'string' ? raw.image : undefined,
  replies: Array.isArray(raw.replies) ? raw.replies.map(normalizeReply).filter((item): item is HelpReply => item !== null) : [],
  createdAt: asString(raw.createdAt, new Date().toISOString())
});

const normalizeGroupRideStyles = (raw: DocumentData): string[] => {
  const fromArray = asStringArray(raw.rideStyles).map((value) => value.trim()).filter(Boolean);
  if (fromArray.length > 0) {
    return Array.from(new Set(fromArray));
  }

  const legacyRideStyle = asString(raw.rideStyle).trim();
  return legacyRideStyle ? [legacyRideStyle] : ['Touring'];
};

const normalizeGroupJoinPermission = (value: unknown): GroupJoinPermission =>
  typeof value === 'string' && GROUP_JOIN_PERMISSION_OPTIONS.includes(value as GroupJoinPermission)
    ? (value as GroupJoinPermission)
    : 'anyone';

const normalizeGroupRideCreatePermission = (value: unknown): GroupRideCreatePermission =>
  typeof value === 'string' && GROUP_RIDE_CREATE_PERMISSION_OPTIONS.includes(value as GroupRideCreatePermission)
    ? (value as GroupRideCreatePermission)
    : 'anyone';

const normalizeGroup = (id: string, raw: DocumentData): Group => {
  const members = Array.from(new Set(asStringArray(raw.members)));
  const adminIds = Array.from(new Set(asStringArray(raw.adminIds))).filter((memberId) =>
    memberId !== asString(raw.creatorId) && members.includes(memberId)
  );
  const avatarAsset = asSignedImageAsset(raw.avatarAsset);

  return {
    id,
    name: asString(raw.name),
    description: asString(raw.description),
    creatorId: asString(raw.creatorId),
    members,
    adminIds,
    avatar: avatarAsset?.signedUrl ?? asString(raw.avatar),
    avatarAsset,
    city: asString(raw.city),
    rideStyles: normalizeGroupRideStyles(raw),
    joinPermission: normalizeGroupJoinPermission(raw.joinPermission),
    rideCreatePermission: normalizeGroupRideCreatePermission(raw.rideCreatePermission),
    joinRequests: Array.from(new Set(asStringArray(raw.joinRequests))).filter((memberId) => !members.includes(memberId)),
    createdAt: asString(raw.createdAt, new Date().toISOString())
  };
};

const EXPIRY_REFRESH_BUFFER_MS = 60 * 1000;

const shouldRefreshSignedImageAsset = (asset: SignedImageAsset | undefined): asset is SignedImageAsset => {
  if (!asset) return false;
  const expiresAt = Date.parse(asset.expiresAt);
  if (!Number.isFinite(expiresAt)) return true;
  return expiresAt <= Date.now() + EXPIRY_REFRESH_BUFFER_MS;
};

const refreshUserImageAssetsIfNeeded = async (user: User): Promise<User> => {
  let nextUser = user;
  let changed = false;

  if (shouldRefreshSignedImageAsset(user.avatarAsset)) {
    const avatarAsset = await refreshSignedImageAsset(user.avatarAsset.objectKey);
    nextUser = {
      ...nextUser,
      avatar: avatarAsset.signedUrl,
      avatarAsset
    };
    changed = true;
  }

  if (user.bikePhotoAssetsByName) {
    const refreshedEntries = await Promise.all(
      Object.entries(user.bikePhotoAssetsByName).map(async ([bikeName, asset]) => {
        if (!shouldRefreshSignedImageAsset(asset)) {
          return [bikeName, asset] as const;
        }

        const refreshedAsset = await refreshSignedImageAsset(asset.objectKey);
        changed = true;
        return [bikeName, refreshedAsset] as const;
      })
    );

    const bikePhotoAssetsByName = Object.fromEntries(refreshedEntries);
    nextUser = {
      ...nextUser,
      bikePhotoAssetsByName,
      bikePhotosByName: Object.fromEntries(
        Object.entries(bikePhotoAssetsByName).map(([bikeName, asset]) => [bikeName, asset.signedUrl])
      )
    };
  }

  if (changed) {
    await upsertUserInFirestore(nextUser);
  }

  return nextUser;
};

const refreshGroupImageAssetsIfNeeded = async (group: Group): Promise<Group> => {
  if (!shouldRefreshSignedImageAsset(group.avatarAsset)) {
    return group;
  }

  const avatarAsset = await refreshSignedImageAsset(group.avatarAsset.objectKey);
  const nextGroup: Group = {
    ...group,
    avatar: avatarAsset.signedUrl,
    avatarAsset
  };
  await upsertGroupInFirestore(nextGroup);
  return nextGroup;
};

export const fetchUsersFromFirestore = async (): Promise<User[]> => {
  const services = getFirebaseServices();
  if (!services) return [];

  const snapshot = await getDocs(collection(services.firestore, USERS_COLLECTION));
  const users = snapshot.docs.map((item) => normalizeUser(item.id, item.data()));
  return Promise.all(users.map(refreshUserImageAssetsIfNeeded));
};

export const fetchUserByIdFromFirestore = async (userId: string): Promise<User | null> => {
  const services = getFirebaseServices();
  if (!services) return null;

  const snapshot = await getDoc(doc(services.firestore, USERS_COLLECTION, userId));
  if (!snapshot.exists()) return null;
  return refreshUserImageAssetsIfNeeded(normalizeUser(snapshot.id, snapshot.data()));
};

export const fetchRidesFromFirestore = async (): Promise<RidePost[]> => {
  const services = getFirebaseServices();
  if (!services) return [];

  const ridesRef = collection(services.firestore, RIDES_COLLECTION);
  try {
    const snapshot = await getDocs(query(ridesRef, orderBy('createdAt', 'desc')));
    return snapshot.docs.map((item) => normalizeRide(item.id, item.data()));
  } catch {
    const snapshot = await getDocs(ridesRef);
    return snapshot.docs.map((item) => normalizeRide(item.id, item.data()));
  }
};

export const subscribeRidesFromFirestore = ({
  onChange,
  onError
}: {
  onChange: (rides: RidePost[]) => void;
  onError?: (error: unknown) => void;
}): Unsubscribe => {
  const services = getFirebaseServices();
  if (!services) {
    onChange([]);
    return () => undefined;
  }

  const ridesRef = collection(services.firestore, RIDES_COLLECTION);
  let fallbackUnsubscribe: Unsubscribe | null = null;

  const orderedUnsubscribe = onSnapshot(
    query(ridesRef, orderBy('createdAt', 'desc')),
    (snapshot) => {
      onChange(snapshot.docs.map((item) => normalizeRide(item.id, item.data())));
    },
    () => {
      if (fallbackUnsubscribe) return;
      fallbackUnsubscribe = onSnapshot(
        ridesRef,
        (snapshot) => {
          onChange(snapshot.docs.map((item) => normalizeRide(item.id, item.data())));
        },
        (fallbackError) => {
          onError?.(fallbackError);
        }
      );
    }
  );

  return () => {
    orderedUnsubscribe();
    fallbackUnsubscribe?.();
  };
};

export const fetchHelpPostsFromFirestore = async (): Promise<HelpPost[]> => {
  const services = getFirebaseServices();
  if (!services) return [];

  const helpRef = collection(services.firestore, HELP_COLLECTION);
  try {
    const snapshot = await getDocs(query(helpRef, orderBy('createdAt', 'desc')));
    return snapshot.docs.map((item) => normalizeHelpPost(item.id, item.data()));
  } catch {
    const snapshot = await getDocs(helpRef);
    return snapshot.docs.map((item) => normalizeHelpPost(item.id, item.data()));
  }
};

export const subscribeHelpPostsFromFirestore = ({
  onChange,
  onError
}: {
  onChange: (helpPosts: HelpPost[]) => void;
  onError?: (error: unknown) => void;
}): Unsubscribe => {
  const services = getFirebaseServices();
  if (!services) {
    onChange([]);
    return () => undefined;
  }

  const helpRef = collection(services.firestore, HELP_COLLECTION);
  let fallbackUnsubscribe: Unsubscribe | null = null;

  const orderedUnsubscribe = onSnapshot(
    query(helpRef, orderBy('createdAt', 'desc')),
    (snapshot) => {
      onChange(snapshot.docs.map((item) => normalizeHelpPost(item.id, item.data())));
    },
    () => {
      if (fallbackUnsubscribe) return;
      fallbackUnsubscribe = onSnapshot(
        helpRef,
        (snapshot) => {
          onChange(snapshot.docs.map((item) => normalizeHelpPost(item.id, item.data())));
        },
        (fallbackError) => {
          onError?.(fallbackError);
        }
      );
    }
  );

  return () => {
    orderedUnsubscribe();
    fallbackUnsubscribe?.();
  };
};

export const fetchGroupsFromFirestore = async (): Promise<Group[]> => {
  const services = getFirebaseServices();
  if (!services) return [];

  const groupsRef = collection(services.firestore, GROUPS_COLLECTION);
  try {
    const snapshot = await getDocs(query(groupsRef, orderBy('createdAt', 'desc')));
    const groups = snapshot.docs.map((item) => normalizeGroup(item.id, item.data()));
    return Promise.all(groups.map(refreshGroupImageAssetsIfNeeded));
  } catch {
    const snapshot = await getDocs(groupsRef);
    const groups = snapshot.docs.map((item) => normalizeGroup(item.id, item.data()));
    return Promise.all(groups.map(refreshGroupImageAssetsIfNeeded));
  }
};

export const subscribeGroupsFromFirestore = ({
  onChange,
  onError
}: {
  onChange: (groups: Group[]) => void;
  onError?: (error: unknown) => void;
}): Unsubscribe => {
  const services = getFirebaseServices();
  if (!services) {
    onChange([]);
    return () => undefined;
  }

  const groupsRef = collection(services.firestore, GROUPS_COLLECTION);
  let fallbackUnsubscribe: Unsubscribe | null = null;

  const orderedUnsubscribe = onSnapshot(
    query(groupsRef, orderBy('createdAt', 'desc')),
    (snapshot) => {
      onChange(snapshot.docs.map((item) => normalizeGroup(item.id, item.data())));
    },
    () => {
      if (fallbackUnsubscribe) return;
      fallbackUnsubscribe = onSnapshot(
        groupsRef,
        (snapshot) => {
          onChange(snapshot.docs.map((item) => normalizeGroup(item.id, item.data())));
        },
        (fallbackError) => {
          onError?.(fallbackError);
        }
      );
    }
  );

  return () => {
    orderedUnsubscribe();
    fallbackUnsubscribe?.();
  };
};

export const upsertUserInFirestore = async (user: User): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;

  const payload = toFirestoreUserPayload(user);
  await setDoc(doc(services.firestore, USERS_COLLECTION, user.id), payload, { merge: true });

  try {
    await syncUserDirectoryEntry(user, payload);
  } catch (error) {
    console.warn('[user-directory] Failed to sync userDirectory entry:', error);
  }
};

export const addExpoPushTokenToUser = async (userId: string, expoPushToken: string): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;
  if (!expoPushToken || !/^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(expoPushToken)) return;

  await setDoc(
    doc(services.firestore, USERS_COLLECTION, userId),
    {
      expoPushTokens: arrayUnion(expoPushToken)
    },
    { merge: true }
  );
};

export const addFirebasePushTokenToUser = async (userId: string, firebasePushToken: string): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;
  if (!firebasePushToken || !FIREBASE_PUSH_TOKEN_REGEX.test(firebasePushToken)) return;

  await setDoc(
    doc(services.firestore, USERS_COLLECTION, userId),
    {
      firebasePushTokens: arrayUnion(firebasePushToken)
    },
    { merge: true }
  );
};

export const upsertRideInFirestore = async (ride: RidePost): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;

  const payload = toFirestoreRidePayload(ride);
  await setDoc(doc(services.firestore, RIDES_COLLECTION, ride.id), payload, { merge: true });
};

export const updateRideJoinStateInFirestore = async (
  rideId: string,
  updates: Pick<RidePost, 'currentParticipants' | 'requests'> &
    Partial<Pick<RidePost, 'joinPermission' | 'paymentStatusByUserId'>>
): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;

  const payload: Record<string, unknown> = {
    currentParticipants: updates.currentParticipants,
    requests: updates.requests,
    ...(updates.joinPermission ? { joinPermission: updates.joinPermission } : {})
  };
  if (updates.paymentStatusByUserId !== undefined) {
    payload.paymentStatusByUserId = updates.paymentStatusByUserId;
  }

  await setDoc(doc(services.firestore, RIDES_COLLECTION, rideId), payload, { merge: true });
};

export const deleteRideInFirestore = async (rideId: string): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;

  await deleteDoc(doc(services.firestore, RIDES_COLLECTION, rideId));
};

export const upsertHelpPostInFirestore = async (helpPost: HelpPost): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;

  await setDoc(doc(services.firestore, HELP_COLLECTION, helpPost.id), helpPost, { merge: true });
};

export const upsertGroupInFirestore = async (group: Group): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;

  const groupRef = doc(services.firestore, GROUPS_COLLECTION, group.id);
  const getErrorCode = (error: unknown): string =>
    error instanceof Error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
  const isPermissionDenied = (error: unknown): boolean => getErrorCode(error).includes('permission-denied');

  const payloadWithAvatarAsset = {
    ...group,
    // Newer rules require this key to exist even when no uploaded asset is present.
    avatarAsset: group.avatarAsset ?? null
  };

  try {
    await setDoc(groupRef, payloadWithAvatarAsset, { merge: true });
    return;
  } catch (error) {
    if (!isPermissionDenied(error)) {
      throw error;
    }
  }

  // Backward-compat retry for projects still using older group rules without avatarAsset.
  const { avatarAsset: _ignoredAvatarAsset, ...legacyPayload } = payloadWithAvatarAsset;
  try {
    await setDoc(groupRef, legacyPayload, { merge: true });
    return;
  } catch (error) {
    if (!isPermissionDenied(error)) {
      throw error;
    }
  }

  // Legacy schema fallback (older projects may validate a smaller group shape).
  const legacyMinimalPayload = {
    id: group.id,
    name: group.name,
    description: group.description,
    creatorId: group.creatorId,
    members: group.members,
    avatar: group.avatar,
    city: group.city,
    rideStyle: group.rideStyles[0] ?? 'Touring',
    createdAt: group.createdAt
  };
  await setDoc(groupRef, legacyMinimalPayload, { merge: true });
};

export const deleteGroupInFirestore = async (groupId: string): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;

  await deleteDoc(doc(services.firestore, GROUPS_COLLECTION, groupId));
};

export const createModerationReportInFirestore = async (report: ModerationReport): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;

  await setDoc(doc(services.firestore, MODERATION_REPORTS_COLLECTION, report.id), report);
};
