import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  type DocumentData
} from 'firebase/firestore';

import {
  HelpPost,
  HelpReply,
  MapPoint,
  ModerationReport,
  RideCostType,
  RideInviteAudience,
  RidePaymentMethod,
  RidePaymentStatus,
  RidePost,
  RideVisibility,
  Squad,
  SquadJoinPermission,
  User
} from '../types';
import { getFirebaseServices } from './client';

const USERS_COLLECTION = 'users';
const RIDES_COLLECTION = 'rides';
const HELP_COLLECTION = 'helpPosts';
const SQUADS_COLLECTION = 'squads';
const MODERATION_REPORTS_COLLECTION = 'moderationReports';
const RIDE_VISIBILITY_OPTIONS: RideVisibility[] = ['Nearby', 'City', 'Friends'];
const SQUAD_JOIN_PERMISSION_OPTIONS: SquadJoinPermission[] = ['anyone', 'request_to_join'];

const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const asBoolean = (value: unknown, fallback = false): boolean => (typeof value === 'boolean' ? value : fallback);
const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const normalizeSosContacts = (value: unknown): string[] =>
  Array.from(new Set(asStringArray(value).map((item) => item.trim()).filter(Boolean)));

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

const normalizePoint = (item: unknown): MapPoint | null => {
  if (!item || typeof item !== 'object') return null;
  const point = item as { lat?: unknown; lng?: unknown; label?: unknown };
  const lat = asNumber(point.lat, NaN);
  const lng = asNumber(point.lng, NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

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
    avatar: asString(raw.avatar),
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
    profileComplete: typeof raw.profileComplete === 'boolean' ? raw.profileComplete : undefined
  };
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
    isPrivate: typeof raw.isPrivate === 'boolean' ? raw.isPrivate : undefined
  };
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

const normalizeSquadRideStyles = (raw: DocumentData): string[] => {
  const fromArray = asStringArray(raw.rideStyles).map((value) => value.trim()).filter(Boolean);
  if (fromArray.length > 0) {
    return Array.from(new Set(fromArray));
  }

  const legacyRideStyle = asString(raw.rideStyle).trim();
  return legacyRideStyle ? [legacyRideStyle] : ['Touring'];
};

const normalizeSquadJoinPermission = (value: unknown): SquadJoinPermission =>
  typeof value === 'string' && SQUAD_JOIN_PERMISSION_OPTIONS.includes(value as SquadJoinPermission)
    ? (value as SquadJoinPermission)
    : 'anyone';

const normalizeSquad = (id: string, raw: DocumentData): Squad => {
  const members = Array.from(new Set(asStringArray(raw.members)));
  const adminIds = Array.from(new Set(asStringArray(raw.adminIds))).filter((memberId) =>
    memberId !== asString(raw.creatorId) && members.includes(memberId)
  );

  return {
    id,
    name: asString(raw.name),
    description: asString(raw.description),
    creatorId: asString(raw.creatorId),
    members,
    adminIds,
    avatar: asString(raw.avatar),
    city: asString(raw.city),
    rideStyles: normalizeSquadRideStyles(raw),
    joinPermission: normalizeSquadJoinPermission(raw.joinPermission),
    joinRequests: Array.from(new Set(asStringArray(raw.joinRequests))).filter((memberId) => !members.includes(memberId)),
    createdAt: asString(raw.createdAt, new Date().toISOString())
  };
};

export const fetchUsersFromFirestore = async (): Promise<User[]> => {
  const services = getFirebaseServices();
  if (!services) return [];

  const snapshot = await getDocs(collection(services.firestore, USERS_COLLECTION));
  return snapshot.docs.map((item) => normalizeUser(item.id, item.data()));
};

export const fetchUserByIdFromFirestore = async (userId: string): Promise<User | null> => {
  const services = getFirebaseServices();
  if (!services) return null;

  const snapshot = await getDoc(doc(services.firestore, USERS_COLLECTION, userId));
  if (!snapshot.exists()) return null;
  return normalizeUser(snapshot.id, snapshot.data());
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

export const fetchSquadsFromFirestore = async (): Promise<Squad[]> => {
  const services = getFirebaseServices();
  if (!services) return [];

  const squadsRef = collection(services.firestore, SQUADS_COLLECTION);
  try {
    const snapshot = await getDocs(query(squadsRef, orderBy('createdAt', 'desc')));
    return snapshot.docs.map((item) => normalizeSquad(item.id, item.data()));
  } catch {
    const snapshot = await getDocs(squadsRef);
    return snapshot.docs.map((item) => normalizeSquad(item.id, item.data()));
  }
};

export const upsertUserInFirestore = async (user: User): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;

  await setDoc(doc(services.firestore, USERS_COLLECTION, user.id), user, { merge: true });
};

export const upsertRideInFirestore = async (ride: RidePost): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;

  await setDoc(doc(services.firestore, RIDES_COLLECTION, ride.id), ride, { merge: true });
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

export const upsertSquadInFirestore = async (squad: Squad): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;

  await setDoc(doc(services.firestore, SQUADS_COLLECTION, squad.id), squad, { merge: true });
};

export const createModerationReportInFirestore = async (report: ModerationReport): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;

  await setDoc(doc(services.firestore, MODERATION_REPORTS_COLLECTION, report.id), report);
};
