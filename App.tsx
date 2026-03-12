import 'react-native-gesture-handler';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Image,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { styles } from './src/app/styles';
import {
  FriendStatus,
  getRideLifecycleStatus,
  LocationMode,
  PermissionStatus,
  Theme,
  TOKENS,
  avatarFallback
} from './src/app/ui';
import { parseRideJoinIdFromUrl } from './src/app/deep-links';
import { canUserViewRideInFeed } from './src/app/feed-visibility';
import {
  buildStoredNotification,
  buildStoredNotificationFromExpo,
  configureForegroundNotificationHandler,
  ensureNotificationPermission as ensureDeviceNotificationPermission,
  getFirebasePushToken,
  getExpoPushToken,
  getNotificationResponseKey,
  mergeNotification,
  NotificationSoundKind,
  scheduleImmediateNotification,
  setupNotificationChannel as registerNotificationChannel,
  subscribeToFirebasePushTokenRefresh,
  subscribeToNotificationEvents
} from './src/app/notifications';
import { TabButton } from './src/components/common';
import {
  ChatRoomScreen,
  CreateHelpModal,
  CreateRideModal,
  CreateGroupModal,
  EditProfileModal,
  HelpDetailScreen,
  LocationSettingsModal,
  NewsArticleModal,
  NotificationsOverlay,
  RideDetailScreen,
  RideCreatedSuccessfullyModal,
  GroupChatRoomScreen,
  GroupDetailModal,
  UserProfileModal
} from './src/components/modals';
import { ChatsTab, CompleteProfileScreen, FeedTab, LoginScreen, MyRidesTab, NewsTab, ProfileTab, SplashScreen, GroupTab } from './src/screens/tabs';
import {
  MOCK_CURRENT_USER,
} from './src/constants';
import {
  ChatMessage,
  Conversation,
  HelpPost,
  HelpReply,
  MapPoint,
  ModerationReport,
  NewsArticle,
  Notification,
  RidePaymentStatus,
  RidePost,
  RideTrackingSession,
  RideVisibility,
  SignedImageAsset,
  Group,
  GroupJoinPermission,
  GroupRideCreatePermission,
  User
} from './src/types';
import { signInWithBetaPhoneIdentity, signOutFirebase, subscribeToAuthState } from './src/firebase/auth';
import {
  sendChatMessageToRealtime,
  sendGroupChatMessageToRealtime,
  subscribeChatMessages,
  subscribeGroupChatMessages
} from './src/firebase/chat';
import {
  sendRideSosSignal,
  startRideTrackingSession,
  stopRideTrackingSession,
  subscribeRideTrackingSession,
  updateRideParticipantCheckIn,
  updateRideParticipantLocation
} from './src/firebase/live-tracking';
import { getFirebaseServices, isFirebaseConfigured } from './src/firebase/client';
import {
  addFirebasePushTokenToUser,
  addExpoPushTokenToUser,
  createModerationReportInFirestore,
  deleteGroupInFirestore,
  deleteRideInFirestore,
  fetchUserByIdFromFirestore,
  fetchHelpPostsFromFirestore,
  fetchRidesFromFirestore,
  fetchGroupsFromFirestore,
  fetchUsersFromFirestore,
  subscribeHelpPostsFromFirestore,
  subscribeRidesFromFirestore,
  subscribeGroupsFromFirestore,
  updateRideJoinStateInFirestore,
  upsertHelpPostInFirestore,
  upsertRideInFirestore,
  upsertGroupInFirestore,
  upsertUserInFirestore
} from './src/firebase/firestore';
import { uploadBikePhoto, uploadProfilePhoto, uploadGroupPhoto } from './src/firebase/storage';
import {
  triggerDirectChatMessageNotification,
  triggerRideCancelledNotification,
  triggerRideCreatedNotification,
  triggerRideRequestOwnerNotification,
  triggerGroupChatMessageNotification
} from './src/backend/notifications';
import { installCrashLogging, logAnalyticsEvent } from './src/firebase/telemetry';
import { fetchLatestNewsArticles } from './src/news/live-news';
import { AppStateProvider, useAppState } from './src/state/app-state-context';

const STORAGE_KEYS = {
  theme: 'throttleup.theme',
  currentUser: 'throttleup.currentUser',
  users: 'throttleup.users',
  notifications: 'throttleup.notifications',
  rides: 'throttleup.rides',
  helpPosts: 'throttleup.helpPosts',
  conversations: 'throttleup.conversations',
  groupChats: 'throttleup.groupChats',
  news: 'throttleup.news',
  groups: 'throttleup.groups',
  locationMode: 'throttleup.locationMode',
  moderationReports: 'throttleup.moderationReports',
  profileCompletionByPhone: 'throttleup.profileCompletionByPhone'
} as const;

const SESSION_STORAGE_KEYS = [
  STORAGE_KEYS.currentUser,
  STORAGE_KEYS.users,
  STORAGE_KEYS.notifications,
  STORAGE_KEYS.rides,
  STORAGE_KEYS.helpPosts,
  STORAGE_KEYS.conversations,
  STORAGE_KEYS.groupChats,
  STORAGE_KEYS.groups,
  STORAGE_KEYS.locationMode,
  STORAGE_KEYS.moderationReports
];

type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  CompleteProfile: undefined;
  Main: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const FIREBASE_ENABLED = isFirebaseConfigured();
const NEWS_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const NEWS_PAGE_SIZE = 5;
const NEWS_LOAD_MORE_DISTANCE_FROM_BOTTOM = 220;
const STORAGE_WRITE_DEBOUNCE_MS = 250;
type SyncChannel = 'rides' | 'help' | 'chat' | 'groupChat' | 'news' | 'rideTracking';
type SyncChannelState = {
  isSyncing: boolean;
  error: string | null;
  lastSuccessAt: string | null;
};
type SyncState = Record<SyncChannel, SyncChannelState>;
type AppNotificationPayload = {
  type?: Notification['type'];
  senderId?: string;
  senderName?: string;
  senderAvatar?: string;
  content: string;
  data?: Record<string, unknown>;
  soundKind?: NotificationSoundKind;
  openCenter?: boolean;
  sendPush?: boolean;
  pushTitle?: string;
  pushBody?: string;
};
type OpenConversationOptions = {
  conversationId?: string;
  participantName?: string;
  participantAvatar?: string;
};

const INITIAL_SYNC_STATE: SyncState = {
  rides: { isSyncing: false, error: null, lastSuccessAt: null },
  help: { isSyncing: false, error: null, lastSuccessAt: null },
  chat: { isSyncing: false, error: null, lastSuccessAt: null },
  groupChat: { isSyncing: false, error: null, lastSuccessAt: null },
  news: { isSyncing: false, error: null, lastSuccessAt: null },
  rideTracking: { isSyncing: false, error: null, lastSuccessAt: null }
};

const EMPTY_USERS: User[] = [];
const EMPTY_NOTIFICATIONS: Notification[] = [];
const EMPTY_RIDES: RidePost[] = [];
const EMPTY_HELP_POSTS: HelpPost[] = [];
const EMPTY_CONVERSATIONS: Conversation[] = [];
const EMPTY_NEWS: NewsArticle[] = [];
const EMPTY_GROUPS: Group[] = [];
const LEGACY_MOCK_USER_IDS = new Set(['u1', 'u2', 'u3']);
const LEGACY_MOCK_RIDE_IDS = new Set(['r1', 'r2', 'r3']);
const LEGACY_MOCK_HELP_IDS = new Set(['h1']);
const LEGACY_MOCK_CONVERSATION_IDS = new Set(['c1', 'c2']);
const LEGACY_MOCK_NOTIFICATION_IDS = new Set(['n1', 'n2']);
const LEGACY_MOCK_NEWS_IDS = new Set(['news-1', 'news-2', 'news-3', 'news-4']);
const LEGACY_MOCK_GROUP_IDS = new Set(['sq-1', 'sq-2', 'sq-3', 'sq-4']);

const uniqueStrings = (values: string[]) => Array.from(new Set(values));
const LEGACY_USER_ALIAS_REGEX = /^user-(\d{10})$/i;
const INVALID_FIREBASE_KEY_CHARS_REGEX = /[.#$/\[\]]/g;
const extractPhoneLast10 = (value: string): string => {
  const normalized = value.trim();
  if (!normalized) return '';
  const aliasMatch = normalized.match(LEGACY_USER_ALIAS_REGEX);
  if (aliasMatch?.[1]) return aliasMatch[1];
  const digits = normalized.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
};

const sanitizeFirebaseKeyPart = (value: string): string => value.trim().replace(INVALID_FIREBASE_KEY_CHARS_REGEX, '_');
const buildDirectConversationId = (leftUserId: string, rightUserId: string): string => {
  const left = sanitizeFirebaseKeyPart(leftUserId || 'unknown-a');
  const right = sanitizeFirebaseKeyPart(rightUserId || 'unknown-b');
  const [a, b] = [left, right].sort((first, second) => first.localeCompare(second));
  return `dm-${a}-${b}`;
};

const resolveConversationUnreadCount = (conversation: { unreadCount?: unknown; isUnread?: unknown }): number => {
  const unreadCount = typeof conversation.unreadCount === 'number' && Number.isFinite(conversation.unreadCount)
    ? Math.max(0, Math.floor(conversation.unreadCount))
    : 0;
  if (unreadCount > 0) {
    return unreadCount;
  }
  return conversation.isUnread === true ? 1 : 0;
};

const normalizeConversationSnapshot = (conversation: Conversation): Conversation => ({
  ...conversation,
  unreadCount: resolveConversationUnreadCount(conversation)
});
const normalizeConversationsSnapshot = (conversations: Conversation[]): Conversation[] =>
  conversations.map(normalizeConversationSnapshot);

const formatConversationPreviewTimestamp = (value?: string): string => {
  if (!value) return 'Now';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return 'Now';
  return new Date(parsed).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const replaceGroupNameMentions = (content: string, previousName: string, nextName: string): string => {
  const from = previousName.trim();
  const to = nextName.trim();
  if (!content || !from || !to || from === to) return content;

  let updated = content.split(`"${from}"`).join(`"${to}"`);
  updated = updated.split(`'${from}'`).join(`'${to}'`);
  if (updated === content) {
    updated = updated.split(from).join(to);
  }
  return updated;
};
const RIDE_VISIBILITY_OPTIONS: RideVisibility[] = ['Nearby', 'City', 'Friends'];
const GROUP_JOIN_PERMISSION_OPTIONS: GroupJoinPermission[] = ['anyone', 'request_to_join', 'invite_only'];
const isRideVisibility = (value: string): value is RideVisibility => RIDE_VISIBILITY_OPTIONS.includes(value as RideVisibility);
const isGroupJoinPermission = (value: string): value is GroupJoinPermission =>
  GROUP_JOIN_PERMISSION_OPTIONS.includes(value as GroupJoinPermission);
const FRIEND_REQUEST_WINDOW_MS = 10 * 60 * 1000;
const FRIEND_REQUEST_MAX_IN_WINDOW = 6;
const FRIEND_REQUEST_TARGET_COOLDOWN_MS = 2 * 60 * 1000;
const HELP_REPLY_WINDOW_MS = 5 * 60 * 1000;
const HELP_REPLY_MAX_IN_WINDOW = 8;
const HELP_REPLY_POST_COOLDOWN_MS = 20 * 1000;
const HELP_REPLY_DUPLICATE_COOLDOWN_MS = 2 * 60 * 1000;
const HELP_REPLY_MAX_LENGTH = 500;
const CHAT_BURST_WINDOW_MS = 12 * 1000;
const CHAT_BURST_MAX_MESSAGES = 6;
const CHAT_MIN_INTERVAL_MS = 700;
const CHAT_DUPLICATE_COOLDOWN_MS = 6 * 1000;
const CHAT_MESSAGE_MAX_LENGTH = 500;
const RIDE_CHECK_IN_GEOFENCE_RADIUS_METERS = 250;

type RideCoordinate = {
  lat: number;
  lng: number;
  label?: string;
};

const getRideStartPoint = (ride: RidePost): RideCoordinate | null => {
  const startPoint = ride.routePoints?.find((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (!startPoint) return null;

  return {
    lat: startPoint.lat,
    lng: startPoint.lng,
    label: startPoint.label
  };
};

const toRadians = (value: number): number => (value * Math.PI) / 180;

const calculateDistanceMeters = (
  source: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): number => {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(destination.lat - source.lat);
  const dLng = toRadians(destination.lng - source.lng);
  const lat1 = toRadians(source.lat);
  const lat2 = toRadians(destination.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
};

const formatDistanceMeters = (distanceMeters: number): string => {
  if (distanceMeters < 1000) return `${Math.round(distanceMeters)} m`;

  const distanceKm = distanceMeters / 1000;
  if (distanceKm < 10) return `${distanceKm.toFixed(1)} km`;
  return `${Math.round(distanceKm)} km`;
};

const isEnabledFlag = (value: string | undefined, fallback = false): boolean => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const normalizePhoneToE164 = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (value.trim().startsWith('+') && digits.length >= 10) return `+${digits}`;
  return '';
};

const normalizeEmergencyContactNumber = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(-10);
  return '';
};

const dedupeEmergencyContactNumbers = (values: string[]): string[] => {
  const uniqueByDigits = new Set<string>();
  const normalized: string[] = [];

  values.forEach((value) => {
    const candidate = normalizeEmergencyContactNumber(value);
    if (!candidate) return;
    const key = candidate.replace(/\D/g, '');
    if (uniqueByDigits.has(key)) return;
    uniqueByDigits.add(key);
    normalized.push(candidate);
  });

  return normalized;
};

const normalizeBikePhotosByName = (
  garage: string[],
  bikePhotosByName: Record<string, string> | undefined
): Record<string, string> | undefined => {
  if (!bikePhotosByName) return undefined;

  const normalizedGarageNames = new Set(garage.map((bike) => bike.trim()).filter(Boolean));
  if (normalizedGarageNames.size === 0) return undefined;

  const entries = Object.entries(bikePhotosByName)
    .map(([bikeName, url]) => [bikeName.trim(), url.trim()] as const)
    .filter(([bikeName, url]) => normalizedGarageNames.has(bikeName) && url.length > 0);

  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
};

const normalizeBikePhotoAssetsByName = (
  garage: string[],
  bikePhotoAssetsByName: Record<string, SignedImageAsset> | undefined
): Record<string, SignedImageAsset> | undefined => {
  if (!bikePhotoAssetsByName) return undefined;

  const normalizedGarageNames = new Set(garage.map((bike) => bike.trim()).filter(Boolean));
  if (normalizedGarageNames.size === 0) return undefined;

  const entries = Object.entries(bikePhotoAssetsByName)
    .map(([bikeName, asset]) => [bikeName.trim(), asset] as const)
    .filter(([bikeName, asset]) => normalizedGarageNames.has(bikeName) && Boolean(asset?.objectKey) && Boolean(asset?.signedUrl));

  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
};

const formatEmergencyContactLabel = (phoneNumber: string): string => {
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.length < 4) return phoneNumber;
  return `••••${digits.slice(-4)}`;
};

const buildEmergencySmsDeeplink = (recipients: string[], body: string): string => {
  const recipientString = recipients.join(',');
  const separator = Platform.OS === 'ios' ? '&' : '?';
  return `sms:${recipientString}${separator}body=${encodeURIComponent(body)}`;
};

const parseBetaAllowedPhones = (value: string | undefined): string[] => {
  if (typeof value !== 'string' || value.trim().length === 0) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];
  value
    .split(/[,\n]/)
    .map((item) => normalizePhoneToE164(item.trim()))
    .filter((item) => item.length > 0)
    .forEach((item) => {
      if (seen.has(item)) return;
      seen.add(item);
      normalized.push(item);
    });

  return normalized;
};

const BETA_MODE_ENABLED = isEnabledFlag(process.env.EXPO_PUBLIC_BETA_MODE, true);
const BETA_DEFAULT_OTP = (process.env.EXPO_PUBLIC_BETA_DEFAULT_OTP ?? '1234').trim() || '1234';
const BETA_ALLOWED_PHONES = parseBetaAllowedPhones(process.env.EXPO_PUBLIC_BETA_ALLOWED_PHONES);

const pruneTimestamps = (timestamps: number[], now: number, windowMs: number): number[] =>
  timestamps.filter((timestamp) => now - timestamp < windowMs);

const formatCooldown = (milliseconds: number): string => {
  const seconds = Math.ceil(milliseconds / 1000);
  if (seconds >= 60) return `${Math.ceil(seconds / 60)} min`;
  return `${Math.max(1, seconds)}s`;
};

const waitForAuthSession = async (timeoutMs = 1200, pollMs = 80): Promise<boolean> => {
  if (!FIREBASE_ENABLED) return false;
  const auth = getFirebaseServices()?.auth;
  if (!auth) return false;
  if (auth.currentUser) return true;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, pollMs));
    if (auth.currentUser) return true;
  }

  return false;
};

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const normalizeRideVisibility = (value: unknown): RideVisibility[] => {
  if (Array.isArray(value)) {
    const normalized = value.filter((item): item is RideVisibility => typeof item === 'string' && isRideVisibility(item));
    return normalized.length > 0 ? Array.from(new Set<RideVisibility>(normalized)) : ['City'];
  }

  if (typeof value === 'string' && isRideVisibility(value)) {
    return [value];
  }

  return ['City'];
};

const normalizeRidePaymentStatusByUserId = (value: unknown): Record<string, RidePaymentStatus> | undefined => {
  if (!value || typeof value !== 'object') return undefined;

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([userId, raw]): RidePaymentStatus | null => {
      if (!raw || typeof raw !== 'object') return null;
      const statusValue = raw as Record<string, unknown>;
      const amountRaw = statusValue.amount;
      const amount = typeof amountRaw === 'number' && Number.isFinite(amountRaw) ? amountRaw : NaN;
      if (!Number.isFinite(amount) || amount < 0) return null;

      return {
        userId,
        amount,
        status: statusValue.status === 'paid' ? 'paid' : 'pending',
        updatedAt: typeof statusValue.updatedAt === 'string' ? statusValue.updatedAt : new Date().toISOString(),
        paidAt: typeof statusValue.paidAt === 'string' ? statusValue.paidAt : undefined,
        method: statusValue.method === 'UPI_LINK' ? 'UPI_LINK' : undefined,
        transactionRef: typeof statusValue.transactionRef === 'string' ? statusValue.transactionRef : undefined
      };
    })
    .filter((item): item is RidePaymentStatus => item !== null);

  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries.map((item) => [item.userId, item]));
};

const parseCoordinateNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const normalizeRoutePoint = (value: unknown): MapPoint | null => {
  if (!value || typeof value !== 'object') return null;

  const raw = value as {
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
    parseCoordinateNumber(raw.lat) ??
    parseCoordinateNumber(raw.latitude) ??
    parseCoordinateNumber(raw._latitude) ??
    parseCoordinateNumber(raw._lat);
  const lng =
    parseCoordinateNumber(raw.lng) ??
    parseCoordinateNumber(raw.longitude) ??
    parseCoordinateNumber(raw._longitude) ??
    parseCoordinateNumber(raw._long);

  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return {
    lat,
    lng,
    label: typeof raw.label === 'string' && raw.label.trim().length > 0 ? raw.label.trim() : undefined
  };
};

const normalizeRoutePoints = (value: unknown): MapPoint[] => {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeRoutePoint).filter((point): point is MapPoint => point !== null);
};

const normalizeRides = (items: RidePost[]): RidePost[] =>
  items.map((ride) => ({
    ...ride,
    routePoints: normalizeRoutePoints(ride.routePoints),
    visibility: normalizeRideVisibility(ride.visibility),
    splitTotalAmount:
      typeof ride.splitTotalAmount === 'number' && Number.isFinite(ride.splitTotalAmount) && ride.splitTotalAmount >= 0
        ? ride.splitTotalAmount
        : undefined,
    paymentMethod: ride.paymentMethod === 'UPI_LINK' ? 'UPI_LINK' : undefined,
    upiPaymentLink: typeof ride.upiPaymentLink === 'string' && ride.upiPaymentLink.trim().length > 0
      ? ride.upiPaymentLink.trim()
      : undefined,
    paymentStatusByUserId: normalizeRidePaymentStatusByUserId(ride.paymentStatusByUserId)
  }));

type LegacyGroup = Omit<Group, 'rideStyles' | 'joinPermission' | 'joinRequests' | 'adminIds'> & {
  rideStyle?: unknown;
  rideStyles?: unknown;
  adminIds?: unknown;
  joinPermission?: unknown;
  rideCreatePermission?: unknown;
  joinRequests?: unknown;
};

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const normalizeGroupRideStyles = (group: LegacyGroup): string[] => {
  const normalizedStyles = asStringArray(group.rideStyles).map((value) => value.trim()).filter(Boolean);
  if (normalizedStyles.length > 0) return uniqueStrings(normalizedStyles);

  if (typeof group.rideStyle === 'string' && group.rideStyle.trim().length > 0) {
    return [group.rideStyle.trim()];
  }

  return ['Touring'];
};

const normalizeGroupJoinPermission = (value: unknown): GroupJoinPermission =>
  typeof value === 'string' && isGroupJoinPermission(value) ? value : 'anyone';

const normalizeGroupRideCreatePermission = (value: unknown): GroupRideCreatePermission =>
  value === 'admin' ? 'admin' : 'anyone';

const normalizeGroup = (group: LegacyGroup): Group => {
  const memberIds = uniqueStrings(asStringArray(group.members));
  const adminIds = uniqueStrings(asStringArray(group.adminIds)).filter((id) => id !== group.creatorId && memberIds.includes(id));
  const joinRequests = uniqueStrings(asStringArray(group.joinRequests)).filter((id) => !memberIds.includes(id));

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    creatorId: group.creatorId,
    members: memberIds,
    adminIds,
    avatar: group.avatar,
    avatarAsset: group.avatarAsset,
    city: group.city,
    rideStyles: normalizeGroupRideStyles(group),
    joinPermission: normalizeGroupJoinPermission(group.joinPermission),
    rideCreatePermission: normalizeGroupRideCreatePermission(group.rideCreatePermission),
    joinRequests,
    createdAt: group.createdAt
  };
};

const normalizeGroups = (items: LegacyGroup[]): Group[] => items.map(normalizeGroup);
const isRuntimeCreatedGroupId = (groupId: string): boolean => /^sq-\d{10,}$/.test(groupId);

const getCurrentUserIdAliases = (currentUserId: string, currentUserPhoneNumber?: string): Set<string> => {
  const aliases = new Set<string>();
  if (currentUserId) {
    aliases.add(currentUserId);
  }

  const normalizedPhoneDigits = (currentUserPhoneNumber ?? '').replace(/\D/g, '');
  if (normalizedPhoneDigits.length >= 10) {
    aliases.add(`user-${normalizedPhoneDigits.slice(-10)}`);
  }

  return aliases;
};

const mergeGroupsPreservingLocalMembership = (
  remoteGroups: Group[],
  localGroups: Group[],
  currentUserId: string,
  currentUserPhoneNumber?: string
): Group[] => {
  if (!currentUserId) return remoteGroups;

  const currentUserAliases = getCurrentUserIdAliases(currentUserId, currentUserPhoneNumber);
  const hasUserAlias = (ids: string[]): boolean => ids.some((id) => currentUserAliases.has(id));

  const localById = new Map(localGroups.map((group) => [group.id, group]));
  const remoteIds = new Set(remoteGroups.map((group) => group.id));
  const mergedRemoteGroups = remoteGroups.map((remoteGroup) => {
    const localGroup = localById.get(remoteGroup.id);
    if (!localGroup) return remoteGroup;

    const localIsMember = hasUserAlias(localGroup.members);
    const remoteIsMember = hasUserAlias(remoteGroup.members);
    if (localIsMember && !remoteIsMember) {
      return {
        ...remoteGroup,
        members: uniqueStrings([...remoteGroup.members, currentUserId]),
        joinRequests: remoteGroup.joinRequests.filter((id) => !currentUserAliases.has(id))
      };
    }

    const localHasPendingRequest = hasUserAlias(localGroup.joinRequests);
    const remoteHasPendingRequest = hasUserAlias(remoteGroup.joinRequests);
    if (localHasPendingRequest && !remoteHasPendingRequest && !remoteIsMember) {
      return {
        ...remoteGroup,
        joinRequests: uniqueStrings([...remoteGroup.joinRequests, currentUserId])
      };
    }

    return remoteGroup;
  });

  // Keep optimistic local groups (e.g., newly created) until they appear in cloud snapshots.
  const localOnlyRelevantGroups = localGroups.filter((localGroup) => {
    if (remoteIds.has(localGroup.id)) return false;
    return currentUserAliases.has(localGroup.creatorId) || hasUserAlias(localGroup.members);
  });

  if (localOnlyRelevantGroups.length === 0) {
    return mergedRemoteGroups;
  }

  return [...localOnlyRelevantGroups, ...mergedRemoteGroups].sort((a, b) => {
    const aTime = Date.parse(a.createdAt);
    const bTime = Date.parse(b.createdAt);
    if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0;
    return bTime - aTime;
  });
};

const safeParse = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const getPhoneProfileCompletionMap = async (): Promise<Record<string, boolean>> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.profileCompletionByPhone);
    return safeParse<Record<string, boolean>>(raw, {});
  } catch {
    return {};
  }
};

const isProfileCompletedForPhone = async (phoneNumber: string): Promise<boolean> => {
  const key = normalizePhoneToE164(phoneNumber);
  if (!key) return false;
  const map = await getPhoneProfileCompletionMap();
  return map[key] === true;
};

const markProfileCompletedForPhone = async (phoneNumber: string): Promise<void> => {
  const key = normalizePhoneToE164(phoneNumber);
  if (!key) return;

  const map = await getPhoneProfileCompletionMap();
  if (map[key] === true) return;

  await saveToStorage(STORAGE_KEYS.profileCompletionByPhone, {
    ...map,
    [key]: true
  });
};

type LoginPayload = {
  uid?: string;
  phoneNumber: string;
};

const fallbackSyncErrorByChannel: Record<SyncChannel, string> = {
  rides: 'Unable to sync rides right now. Check your network and retry.',
  help: 'Unable to sync help posts right now. Check your network and retry.',
  chat: 'Chat sync is unavailable right now. Check your network and retry.',
  groupChat: 'Group chat sync is unavailable right now. Check your network and retry.',
  news: 'Unable to refresh the news feed right now. Check your network and retry.',
  rideTracking: 'Live tracking sync is unavailable right now. Check your network and retry.'
};

const containsPermissionDeniedMarker = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes('permission_denied') ||
    normalized.includes('permission-denied') ||
    normalized.includes('permission denied')
  );
};

const isFirebasePermissionDeniedError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;

  const code = 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
  const message = error instanceof Error
    ? error.message
    : 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';

  return containsPermissionDeniedMarker(code) || containsPermissionDeniedMarker(message);
};

const buildSyncErrorMessage = (channel: SyncChannel, error: unknown): string => {
  const fallback = fallbackSyncErrorByChannel[channel];
  if (!(error instanceof Error)) return fallback;
  if (isFirebasePermissionDeniedError(error)) {
    return `${fallback} (Permission denied by Firebase. Sign in again and retry. If this continues, deploy the latest Realtime Database rules.)`;
  }
  const message = error.message.trim();
  if (!message) return fallback;
  if (message.toLowerCase() === fallback.toLowerCase()) return fallback;
  return `${fallback} (${message})`;
};

const buildAuthenticatedUser = (uid: string, phoneNumber: string | undefined, seed?: Partial<User>): User => {
  const phoneDigits = (phoneNumber ?? '').replace(/\D/g, '');
  const fallbackName = phoneDigits.length >= 4 ? `Rider ${phoneDigits.slice(-4)}` : `Rider ${uid.slice(0, 4).toUpperCase()}`;
  const base = seed ?? {};

  return {
    ...MOCK_CURRENT_USER,
    ...base,
    id: uid,
    phoneNumber: phoneNumber ?? base.phoneNumber,
    name: base.name?.trim() ? base.name : fallbackName,
    friends: Array.isArray(base.friends) ? base.friends : [],
    friendRequests: {
      sent: Array.isArray(base.friendRequests?.sent) ? base.friendRequests.sent : [],
      received: Array.isArray(base.friendRequests?.received) ? base.friendRequests.received : []
    },
    blockedUserIds: Array.isArray(base.blockedUserIds) ? base.blockedUserIds : [],
    profileComplete: typeof base.profileComplete === 'boolean' ? base.profileComplete : false
  };
};

const getCurrentUserFromStorage = async (): Promise<{ user: User; hasPersistedSession: boolean }> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.currentUser);
  const hasPersistedSession = typeof raw === 'string' && raw.trim().length > 0;
  const persisted = safeParse<Partial<User>>(raw, {});

  return {
    user: {
      ...MOCK_CURRENT_USER,
      ...persisted,
      friendRequests: {
        ...MOCK_CURRENT_USER.friendRequests,
        ...(persisted.friendRequests ?? {})
      },
      blockedUserIds: Array.isArray(persisted.blockedUserIds) ? persisted.blockedUserIds : MOCK_CURRENT_USER.blockedUserIds
    },
    hasPersistedSession
  };
};

const saveSerializedToStorage = async (key: string, serializedValue: string) => {
  try {
    await AsyncStorage.setItem(key, serializedValue);
  } catch {
    // ignore persistence errors
  }
};

const saveToStorage = async <T,>(key: string, value: T) => {
  try {
    await saveSerializedToStorage(key, JSON.stringify(value));
  } catch {
    // ignore persistence errors
  }
};

const useDebouncedStorageValue = <T,>(
  enabled: boolean,
  key: string,
  value: T,
  delayMs = STORAGE_WRITE_DEBOUNCE_MS
) => {
  const lastSerializedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      lastSerializedRef.current = null;
      return;
    }

    const timer = setTimeout(() => {
      const serialized = JSON.stringify(value);
      if (lastSerializedRef.current === serialized) return;
      lastSerializedRef.current = serialized;
      void saveSerializedToStorage(key, serialized);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [delayMs, enabled, key, value]);
};

const SplashRoute = ({ theme, ready, onComplete }: { theme: Theme; ready: boolean; onComplete: () => void }) => {
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(onComplete, 2200);
    return () => clearTimeout(timer);
  }, [onComplete, ready]);

  return <SplashScreen theme={theme} />;
};

const AppShell = () => {
  const isExpoGo = Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo';
  const insets = useSafeAreaInsets();
  const {
    hydrated,
    setHydrated,
    isLoggedIn,
    setIsLoggedIn,
    theme,
    setTheme,
    activeTab,
    setActiveTab,
    feedFilter,
    setFeedFilter,
    currentUser,
    setCurrentUser,
    users,
    setUsers,
    notifications,
    setNotifications,
    rides,
    setRides,
    helpPosts,
    setHelpPosts,
    conversations,
    setConversations,
    newsArticles,
    setNewsArticles,
    locationMode,
    setLocationMode,
    locationPermissionStatus,
    setLocationPermissionStatus,
    notificationPermissionStatus,
    setNotificationPermissionStatus,
    isDetectingLocation,
    setIsDetectingLocation,
    isNotificationsOpen,
    setIsNotificationsOpen,
    isLocationModalOpen,
    setIsLocationModalOpen,
    manualCityInput,
    setManualCityInput,
    isCreateMenuOpen,
    setIsCreateMenuOpen,
    isCreateRideModalOpen,
    setIsCreateRideModalOpen,
    isCreateHelpModalOpen,
    setIsCreateHelpModalOpen,
    isEditProfileOpen,
    setIsEditProfileOpen,
    isRideDetailOpen,
    setIsRideDetailOpen,
    selectedRideId,
    setSelectedRideId,
    isHelpDetailOpen,
    setIsHelpDetailOpen,
    selectedHelpPost,
    setSelectedHelpPost,
    activeConversation,
    setActiveConversation,
    selectedUserId,
    setSelectedUserId,
    groups,
    setGroups,
    isCreateGroupModalOpen,
    setIsCreateGroupModalOpen,
    selectedGroupId,
    setSelectedGroupId,
    groupSearchQuery,
    setGroupSearchQuery
  } = useAppState();

  const t = TOKENS[theme];
  const createMenuButtonTextStyle = [styles.createMenuButtonText, { color: t.text }];
  const lastSyncedUsersRef = useRef<Map<string, string> | null>(null);
  const friendRequestTimestampsRef = useRef<number[]>([]);
  const friendRequestCooldownByUserRef = useRef<Map<string, number>>(new Map());
  const helpReplyTimestampsRef = useRef<number[]>([]);
  const helpReplyMetaByPostRef = useRef<Map<string, { sentAt: number; text: string }>>(new Map());
  const chatTimestampsByConversationRef = useRef<Map<string, number[]>>(new Map());
  const chatLastMessageByConversationRef = useRef<Map<string, { sentAt: number; text: string }>>(new Map());
  const groupChatTimestampsByRoomRef = useRef<Map<string, number[]>>(new Map());
  const groupChatLastMessageByRoomRef = useRef<Map<string, { sentAt: number; text: string }>>(new Map());
  const lastGuardrailNotificationRef = useRef<{ sentAt: number; message: string } | null>(null);
  const lastRideSosByRideRef = useRef<Map<string, string>>(new Map());
  const previousRidesForNotificationRef = useRef<RidePost[] | null>(null);
  const previousGroupsForNotificationRef = useRef<Group[] | null>(null);
  const previousCurrentUserIdentityRef = useRef<{ id: string; name: string } | null>(null);
  const previousGroupNamesRef = useRef<Map<string, string>>(new Map());
  const rideNotificationUserRef = useRef<string | null>(null);
  const groupNotificationUserRef = useRef<string | null>(null);
  const attemptedGroupCloudSyncIdsRef = useRef<Set<string>>(new Set());
  const attemptedGroupMemberProfileFetchIdsRef = useRef<Set<string>>(new Set());
  const hasLoggedAppOpenRef = useRef(false);
  const [syncState, setSyncState] = useState<SyncState>(INITIAL_SYNC_STATE);
  const [chatSyncRetryToken, setChatSyncRetryToken] = useState(0);
  const [groupChatSyncRetryToken, setGroupChatSyncRetryToken] = useState(0);
  const [activeNewsArticleUrl, setActiveNewsArticleUrl] = useState<string | null>(null);
  const [activeGroupChatId, setActiveGroupChatId] = useState<string | null>(null);
  const [editingRideId, setEditingRideId] = useState<string | null>(null);
  const [createdRide, setCreatedRide] = useState<RidePost | null>(null);
  const [pendingRideJoinRequest, setPendingRideJoinRequest] = useState<{ rideId: string } | null>(null);
  const [groupChatMessagesByRoom, setGroupChatMessagesByRoom] = useState<Record<string, ChatMessage[]>>({});
  const [rideTrackingSyncRetryToken, setRideTrackingSyncRetryToken] = useState(0);
  const [visibleNewsCount, setVisibleNewsCount] = useState(NEWS_PAGE_SIZE);
  const [selectedRideTrackingSession, setSelectedRideTrackingSession] = useState<RideTrackingSession | null>(null);
  const [localRideTrackingSessions, setLocalRideTrackingSessions] = useState<Record<string, RideTrackingSession>>({});
  const [isStartingRideTracking, setIsStartingRideTracking] = useState(false);
  const [isStoppingRideTracking, setIsStoppingRideTracking] = useState(false);
  const [isUpdatingRideCheckIn, setIsUpdatingRideCheckIn] = useState(false);
  const [isSendingRideSos, setIsSendingRideSos] = useState(false);
  const [isUploadingProfilePhoto, setIsUploadingProfilePhoto] = useState(false);
  const [uploadingBikeName, setUploadingBikeName] = useState<string | null>(null);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const rideTrackingLocationAlertShownRef = useRef(false);
  const lastNewsLoadTriggerHeightRef = useRef(0);
  const hasFirebaseAuthSession = FIREBASE_ENABLED && Boolean(getFirebaseServices()?.auth.currentUser);

  const clearPersistedSessionStorage = useCallback(async () => {
    try {
      await AsyncStorage.multiRemove(SESSION_STORAGE_KEYS);
    } catch {
      // ignore persistence cleanup errors
    }
  }, []);

  const persistGroupsSnapshot = useCallback(
    (nextGroups: Group[]) => {
      if (!hydrated || !isLoggedIn) return;
      void saveToStorage(STORAGE_KEYS.groups, nextGroups);
    },
    [hydrated, isLoggedIn]
  );

  const resetSessionState = useCallback(() => {
    setCurrentUser(MOCK_CURRENT_USER);
    setUsers(EMPTY_USERS);
    setNotifications(EMPTY_NOTIFICATIONS);
    setRides(EMPTY_RIDES);
    setHelpPosts(EMPTY_HELP_POSTS);
    setConversations(normalizeConversationsSnapshot(EMPTY_CONVERSATIONS));
    setGroups(EMPTY_GROUPS);
    setLocationMode('auto');
    setLocationPermissionStatus('undetermined');
    setNotificationPermissionStatus('undetermined');
    setIsDetectingLocation(false);
    setIsNotificationsOpen(false);
    setIsLocationModalOpen(false);
    setManualCityInput('');
    setIsCreateMenuOpen(false);
    setIsCreateRideModalOpen(false);
    setIsCreateHelpModalOpen(false);
    setIsEditProfileOpen(false);
    setIsRideDetailOpen(false);
    setSelectedRideId(null);
    setIsHelpDetailOpen(false);
    setSelectedHelpPost(null);
    setActiveConversation(null);
    setSelectedUserId(null);
    setIsCreateGroupModalOpen(false);
    setSelectedGroupId(null);
    setGroupSearchQuery('');
    setFeedFilter('rides');
    setActiveTab('feed');
    setSyncState(INITIAL_SYNC_STATE);
    setChatSyncRetryToken(0);
    setGroupChatSyncRetryToken(0);
    setRideTrackingSyncRetryToken(0);
    setActiveNewsArticleUrl(null);
    setActiveGroupChatId(null);
    setEditingRideId(null);
    setPendingRideJoinRequest(null);
    setGroupChatMessagesByRoom({});
    setSelectedRideTrackingSession(null);
    setLocalRideTrackingSessions({});
    setIsStartingRideTracking(false);
    setIsStoppingRideTracking(false);
    setIsUpdatingRideCheckIn(false);
    setIsSendingRideSos(false);
    setIsUploadingProfilePhoto(false);
    setUploadingBikeName(null);
    setIsCreatingGroup(false);
    setEditingGroupId(null);

    lastSyncedUsersRef.current = null;
    friendRequestTimestampsRef.current = [];
    friendRequestCooldownByUserRef.current = new Map();
    helpReplyTimestampsRef.current = [];
    helpReplyMetaByPostRef.current = new Map();
    chatTimestampsByConversationRef.current = new Map();
    chatLastMessageByConversationRef.current = new Map();
    groupChatTimestampsByRoomRef.current = new Map();
    groupChatLastMessageByRoomRef.current = new Map();
    lastGuardrailNotificationRef.current = null;
    lastRideSosByRideRef.current = new Map();
    previousRidesForNotificationRef.current = null;
    previousGroupsForNotificationRef.current = null;
    rideNotificationUserRef.current = null;
    groupNotificationUserRef.current = null;
    rideTrackingLocationAlertShownRef.current = false;
  }, [
    setActiveConversation,
    setActiveGroupChatId,
    setActiveNewsArticleUrl,
    setActiveTab,
    setChatSyncRetryToken,
    setGroupChatMessagesByRoom,
    setGroupChatSyncRetryToken,
    setRideTrackingSyncRetryToken,
    setConversations,
    setCurrentUser,
    setFeedFilter,
    setHelpPosts,
    setIsCreateHelpModalOpen,
    setIsCreateMenuOpen,
    setIsCreateRideModalOpen,
    setIsCreateGroupModalOpen,
    setIsDetectingLocation,
    setIsEditProfileOpen,
    setIsHelpDetailOpen,
    setIsLocationModalOpen,
    setIsNotificationsOpen,
    setIsRideDetailOpen,
    setLocationMode,
    setLocationPermissionStatus,
    setManualCityInput,
    setNotificationPermissionStatus,
    setNotifications,
    setRides,
    setSelectedHelpPost,
    setSelectedRideId,
    setPendingRideJoinRequest,
    setSelectedGroupId,
    setSelectedUserId,
    setGroupSearchQuery,
    setGroups,
    setSyncState,
    setUsers,
    setSelectedRideTrackingSession,
    setLocalRideTrackingSessions,
    setIsStartingRideTracking,
    setIsStoppingRideTracking,
    setIsUpdatingRideCheckIn,
    setIsSendingRideSos,
    setIsUploadingProfilePhoto,
    setUploadingBikeName,
    setIsCreatingGroup
  ]);

  const clearSession = useCallback(() => {
    setIsLoggedIn(false);
    resetSessionState();
    void clearPersistedSessionStorage();
  }, [clearPersistedSessionStorage, resetSessionState, setIsLoggedIn]);

  const startSync = useCallback((channel: SyncChannel) => {
    setSyncState((prev) => ({
      ...prev,
      [channel]: {
        ...prev[channel],
        isSyncing: true
      }
    }));
  }, []);

  const markSyncSuccess = useCallback((channel: SyncChannel) => {
    setSyncState((prev) => ({
      ...prev,
      [channel]: {
        isSyncing: false,
        error: null,
        lastSuccessAt: new Date().toISOString()
      }
    }));
  }, []);

  const markSyncFailure = useCallback((channel: SyncChannel, error: unknown) => {
    const message = buildSyncErrorMessage(channel, error);
    setSyncState((prev) => ({
      ...prev,
      [channel]: {
        ...prev[channel],
        isSyncing: false,
        error: message
      }
    }));
  }, []);

  const ensureFirebaseAuthSession = useCallback(
    async (preferredPhoneNumber?: string, expectedUid?: string): Promise<boolean> => {
    if (!FIREBASE_ENABLED) return false;
    const auth = getFirebaseServices()?.auth;
    if (!auth) return false;

    const hasValidSession = async (): Promise<boolean> => {
      if (!auth.currentUser) return false;
      if (expectedUid && auth.currentUser.uid !== expectedUid) return false;
      try {
        await auth.currentUser.getIdToken();
        return true;
      } catch {
        return false;
      }
    };

    if (await hasValidSession()) return true;

    if (auth.currentUser && expectedUid && auth.currentUser.uid !== expectedUid) {
      try {
        await signOutFirebase();
      } catch {
        // ignore sign-out failures and continue with fresh sign-in attempt.
      }
    }

    const candidatePhones = uniqueStrings(
      [preferredPhoneNumber, currentUser.phoneNumber]
        .map((value) => normalizePhoneToE164(value ?? ''))
        .filter((value) => value.length > 0)
    );

    if (!BETA_MODE_ENABLED || candidatePhones.length === 0) return false;

    for (const phone of candidatePhones) {
      try {
        await signInWithBetaPhoneIdentity(phone);
      } catch {
        continue;
      }

      const hasSession = await waitForAuthSession(2200, 110);
      if (!hasSession) continue;
      if (await hasValidSession()) return true;
    }

    return false;
    },
    [currentUser.phoneNumber]
  );

  const runRideMutationSync = useCallback(
    (operation: () => Promise<void>) => {
      if (!FIREBASE_ENABLED) return;
      startSync('rides');
      void (async () => {
        const hasAuthSession = await ensureFirebaseAuthSession();
        if (!hasAuthSession) {
          throw new Error('Ride sync requires an authenticated Firebase session. Please log in again.');
        }
        await operation();
        markSyncSuccess('rides');
      })().catch((error) => markSyncFailure('rides', error));
    },
    [ensureFirebaseAuthSession, markSyncFailure, markSyncSuccess, startSync]
  );
  const runRideMutationSyncWithResult = useCallback(
    async (operation: () => Promise<void>): Promise<boolean> => {
      if (!FIREBASE_ENABLED) return true;
      startSync('rides');
      try {
        const hasAuthSession = await ensureFirebaseAuthSession();
        if (!hasAuthSession) {
          throw new Error('Ride sync requires an authenticated Firebase session. Please log in again.');
        }
        await operation();
        markSyncSuccess('rides');
        return true;
      } catch (error) {
        markSyncFailure('rides', error);
        return false;
      }
    },
    [ensureFirebaseAuthSession, markSyncFailure, markSyncSuccess, startSync]
  );

  const runHelpMutationSync = useCallback(
    (operation: () => Promise<void>) => {
      if (!FIREBASE_ENABLED) return;
      startSync('help');
      void (async () => {
        const hasAuthSession = await ensureFirebaseAuthSession();
        if (!hasAuthSession) {
          throw new Error('Help sync requires an authenticated Firebase session. Please log in again.');
        }
        await operation();
        markSyncSuccess('help');
      })().catch((error) => markSyncFailure('help', error));
    },
    [ensureFirebaseAuthSession, markSyncFailure, markSyncSuccess, startSync]
  );

  const runRideTrackingMutationSync = useCallback(
    (operation: () => Promise<void>) => {
      if (!FIREBASE_ENABLED) return;
      startSync('rideTracking');
      void (async () => {
        const hasAuthSession = await ensureFirebaseAuthSession();
        if (!hasAuthSession) {
          throw new Error('Live tracking sync requires an authenticated Firebase session. Please log in again.');
        }
        await operation();
        markSyncSuccess('rideTracking');
      })().catch((error) => markSyncFailure('rideTracking', error));
    },
    [ensureFirebaseAuthSession, markSyncFailure, markSyncSuccess, startSync]
  );

  const mergeRemoteRidesWithLocalCreated = useCallback(
    (remoteRides: RidePost[], localRides: RidePost[], userIdToPreserve: string): RidePost[] => {
      const normalizedRemoteRides = normalizeRides(remoteRides);
      if (localRides.length === 0) {
        return normalizedRemoteRides;
      }

      const remoteRideIds = new Set(normalizedRemoteRides.map((ride) => ride.id));
      const localCreatedMissingInRemote = localRides.filter(
        (ride) => ride.creatorId === userIdToPreserve && !remoteRideIds.has(ride.id)
      );

      if (localCreatedMissingInRemote.length === 0) {
        return normalizedRemoteRides;
      }

      const merged = [...localCreatedMissingInRemote, ...normalizedRemoteRides];
      return normalizeRides(merged).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    },
    []
  );

  const propagateUserNameAcrossState = useCallback(
    (userId: string, nextName: string, syncOwnedContentToCloud = false) => {
      const normalizedName = nextName.trim();
      if (!userId || !normalizedName) return;

      const shouldSyncOwnedContent = syncOwnedContentToCloud && FIREBASE_ENABLED && userId === currentUser.id;

      setUsers((prev) => {
        let changed = false;
        const next = prev.map((user) => {
          if (user.id !== userId || user.name === normalizedName) return user;
          changed = true;
          return { ...user, name: normalizedName };
        });
        return changed ? next : prev;
      });

      setRides((prev) => {
        const ridesToSync: RidePost[] = [];
        let changed = false;
        const next = prev.map((ride) => {
          if (ride.creatorId !== userId || ride.creatorName === normalizedName) return ride;
          const updatedRide = { ...ride, creatorName: normalizedName };
          changed = true;
          if (shouldSyncOwnedContent) {
            ridesToSync.push(updatedRide);
          }
          return updatedRide;
        });

        if (ridesToSync.length > 0) {
          ridesToSync.forEach((ride) => {
            runRideMutationSync(() => upsertRideInFirestore(ride));
          });
        }

        return changed ? next : prev;
      });

      setHelpPosts((prev) => {
        const postsToSync: HelpPost[] = [];
        let changed = false;
        const next = prev.map((post) => {
          let postChanged = false;
          let creatorName = post.creatorName;
          if (post.creatorId === userId && post.creatorName !== normalizedName) {
            creatorName = normalizedName;
            postChanged = true;
          }

          const replies = post.replies.map((reply) => {
            if (reply.creatorId !== userId || reply.creatorName === normalizedName) return reply;
            postChanged = true;
            return { ...reply, creatorName: normalizedName };
          });

          if (!postChanged) return post;
          changed = true;
          const updatedPost = {
            ...post,
            creatorName,
            replies
          };
          if (shouldSyncOwnedContent) {
            postsToSync.push(updatedPost);
          }
          return updatedPost;
        });

        if (postsToSync.length > 0) {
          postsToSync.forEach((post) => {
            runHelpMutationSync(() => upsertHelpPostInFirestore(post));
          });
        }

        return changed ? next : prev;
      });

      setSelectedHelpPost((prev) => {
        if (!prev) return prev;

        let changed = false;
        let creatorName = prev.creatorName;
        if (prev.creatorId === userId && prev.creatorName !== normalizedName) {
          creatorName = normalizedName;
          changed = true;
        }

        const replies = prev.replies.map((reply) => {
          if (reply.creatorId !== userId || reply.creatorName === normalizedName) return reply;
          changed = true;
          return { ...reply, creatorName: normalizedName };
        });

        if (!changed) return prev;
        return {
          ...prev,
          creatorName,
          replies
        };
      });

      const updateConversation = (conversation: Conversation): Conversation => {
        let changed = false;
        let participantName = conversation.participantName;
        if (conversation.participantId === userId && conversation.participantName !== normalizedName) {
          participantName = normalizedName;
          changed = true;
        }

        const messages = conversation.messages.map((message) => {
          if (message.senderId !== userId || message.senderName === normalizedName) return message;
          changed = true;
          return { ...message, senderName: normalizedName };
        });

        return changed
          ? {
            ...conversation,
            participantName,
            messages
          }
          : conversation;
      };

      setConversations((prev) => {
        let changed = false;
        const next = prev.map((conversation) => {
          const updatedConversation = updateConversation(conversation);
          if (updatedConversation !== conversation) {
            changed = true;
          }
          return updatedConversation;
        });
        return changed ? next : prev;
      });

      setActiveConversation((prev) => {
        if (!prev) return prev;
        const updatedConversation = updateConversation(prev);
        return updatedConversation === prev ? prev : updatedConversation;
      });

      setNotifications((prev) => {
        let changed = false;
        const next = prev.map((notification) => {
          if (notification.senderId !== userId || notification.senderName === normalizedName) return notification;
          changed = true;
          return {
            ...notification,
            senderName: normalizedName
          };
        });
        return changed ? next : prev;
      });

      setGroupChatMessagesByRoom((prev) => {
        let changed = false;
        const nextEntries = Object.entries(prev).map(([roomId, messages]) => {
          let roomChanged = false;
          const nextMessages = messages.map((message) => {
            if (message.senderId !== userId || message.senderName === normalizedName) return message;
            roomChanged = true;
            return { ...message, senderName: normalizedName };
          });

          if (roomChanged) {
            changed = true;
            return [roomId, nextMessages] as const;
          }
          return [roomId, messages] as const;
        });

        return changed ? Object.fromEntries(nextEntries) : prev;
      });
    },
    [currentUser.id, runHelpMutationSync, runRideMutationSync, setSelectedHelpPost]
  );

  const syncRidesFromCloud = useCallback(async () => {
    if (!FIREBASE_ENABLED) return;
    startSync('rides');

    const hasAuthSession = await ensureFirebaseAuthSession();
    if (!hasAuthSession) {
      markSyncFailure('rides', new Error('Cloud sync requires an authenticated Firebase session. Please log in again.'));
      return;
    }

    try {
      const remoteRides = await fetchRidesFromFirestore();
      setRides((prev) => mergeRemoteRidesWithLocalCreated(remoteRides, prev, currentUser.id));
      markSyncSuccess('rides');
    } catch (error) {
      markSyncFailure('rides', error);
    }
  }, [currentUser.id, ensureFirebaseAuthSession, markSyncFailure, markSyncSuccess, mergeRemoteRidesWithLocalCreated, setRides, startSync]);

  const syncHelpFromCloud = useCallback(async () => {
    if (!FIREBASE_ENABLED) return;
    startSync('help');

    const hasAuthSession = await ensureFirebaseAuthSession();
    if (!hasAuthSession) {
      markSyncFailure('help', new Error('Cloud sync requires an authenticated Firebase session. Please log in again.'));
      return;
    }

    try {
      const remoteHelpPosts = await fetchHelpPostsFromFirestore();
      setHelpPosts(remoteHelpPosts);
      markSyncSuccess('help');
    } catch (error) {
      markSyncFailure('help', error);
    }
  }, [ensureFirebaseAuthSession, markSyncFailure, markSyncSuccess, setHelpPosts, startSync]);

  useEffect(() => {
    const uninstall = installCrashLogging();
    return uninstall;
  }, []);

  useEffect(() => {
    if (hasLoggedAppOpenRef.current) return;
    hasLoggedAppOpenRef.current = true;
    void logAnalyticsEvent('app_open', {
      firebase_enabled: FIREBASE_ENABLED,
      expo_go: isExpoGo
    });
  }, [isExpoGo]);

  const refreshNewsFeed = useCallback(async () => {
    startSync('news');
    try {
      const latestNews = await fetchLatestNewsArticles();
      setNewsArticles((previousNews) => {
        const previousById = new Map(previousNews.map((item) => [item.id, item]));
        const previousByTitle = new Map(
          previousNews.map((item) => [item.title.toLowerCase().replace(/\s+/g, ' ').trim(), item])
        );
        const mergedLatest = latestNews.map((item) => {
          if (item.image) return item;

          const directMatch = previousById.get(item.id);
          if (directMatch?.image) {
            return {
              ...item,
              image: directMatch.image
            };
          }

          const titleKey = item.title.toLowerCase().replace(/\s+/g, ' ').trim();
          const titleMatch = previousByTitle.get(titleKey);
          if (titleMatch?.image) {
            return {
              ...item,
              image: titleMatch.image
            };
          }

          return item;
        });

        const toSignature = (items: NewsArticle[]) =>
          items
            .map(
              (item) =>
                `${item.id}:${item.image ?? ''}:${item.imageDebugSource ?? ''}:${item.summary}:${item.duplicateScore}:${item.relevanceScore}:${item.viralityScore}`
            )
            .join('|');

        const previousSignature = toSignature(previousNews);
        const nextSignature = toSignature(mergedLatest);
        return previousSignature === nextSignature ? previousNews : mergedLatest;
      });
      markSyncSuccess('news');
    } catch (error) {
      markSyncFailure('news', error);
    }
  }, [markSyncFailure, markSyncSuccess, setNewsArticles, startSync]);

  const applyAuthenticatedSession = useCallback(
    async (payload: { uid: string; phoneNumber?: string }) => {
      let remoteUser: User | null = null;
      let resolvedUser: User | null = null;
      const canSyncCloud = FIREBASE_ENABLED && await ensureFirebaseAuthSession(payload.phoneNumber, payload.uid);

      if (canSyncCloud) {
        try {
          remoteUser = await fetchUserByIdFromFirestore(payload.uid);
        } catch {
          remoteUser = null;
        }
      }

      setCurrentUser((prev) => {
        const seed = remoteUser ?? (prev.id === payload.uid ? prev : undefined);
        const next = buildAuthenticatedUser(payload.uid, payload.phoneNumber, seed);
        resolvedUser = next;
        return next;
      });
      setUsers((prev) => prev.filter((user) => user.id !== payload.uid));
      setIsLoggedIn(true);

      if (!canSyncCloud) {
        return resolvedUser ?? buildAuthenticatedUser(payload.uid, payload.phoneNumber, remoteUser ?? undefined);
      }

      startSync('rides');
      startSync('help');

      const [remoteUsersResult, remoteRidesResult, remoteHelpPostsResult, remoteGroupsResult] = await Promise.allSettled([
        fetchUsersFromFirestore(),
        fetchRidesFromFirestore(),
        fetchHelpPostsFromFirestore(),
        fetchGroupsFromFirestore()
      ]);

      if (remoteUsersResult.status === 'fulfilled' && remoteUsersResult.value.length > 0) {
        const me = remoteUsersResult.value.find((user) => user.id === payload.uid);
        const matchedByPhone = !me && payload.phoneNumber
          ? remoteUsersResult.value.find((user) => normalizePhoneToE164(user.phoneNumber ?? '') === payload.phoneNumber)
          : null;
        const normalizedPhoneDigits = (payload.phoneNumber ?? '').replace(/\D/g, '');
        const legacyUid = normalizedPhoneDigits.length >= 10 ? `user-${normalizedPhoneDigits.slice(-10)}` : '';
        const matchedByLegacyUid = !me && !matchedByPhone && legacyUid
          ? remoteUsersResult.value.find((user) => user.id === legacyUid)
          : null;
        const resolvedRemoteUser = me ?? matchedByPhone ?? matchedByLegacyUid;

        if (resolvedRemoteUser) {
          setCurrentUser((prev) => {
            const next = {
              ...prev,
              ...resolvedRemoteUser,
              id: payload.uid,
              phoneNumber: payload.phoneNumber ?? resolvedRemoteUser.phoneNumber ?? prev.phoneNumber,
              profileComplete:
                typeof resolvedRemoteUser.profileComplete === 'boolean' ? resolvedRemoteUser.profileComplete : true,
              friendRequests: {
                ...prev.friendRequests,
                ...resolvedRemoteUser.friendRequests
              }
            };
            resolvedUser = next;
            return next;
          });
        }
        setUsers(
          remoteUsersResult.value.filter((user) => user.id !== payload.uid && user.id !== resolvedRemoteUser?.id)
        );
      }

      if (remoteRidesResult.status === 'fulfilled') {
        setRides((prev) => mergeRemoteRidesWithLocalCreated(remoteRidesResult.value, prev, payload.uid));
        markSyncSuccess('rides');
      } else {
        markSyncFailure('rides', remoteRidesResult.reason);
      }

      if (remoteHelpPostsResult.status === 'fulfilled') {
        setHelpPosts(remoteHelpPostsResult.value);
        markSyncSuccess('help');
      } else {
        markSyncFailure('help', remoteHelpPostsResult.reason);
      }

      if (remoteGroupsResult.status === 'fulfilled') {
        const normalizedRemoteGroups = normalizeGroups(remoteGroupsResult.value);
        setGroups((prev) =>
          mergeGroupsPreservingLocalMembership(normalizedRemoteGroups, prev, payload.uid, payload.phoneNumber)
        );
      }

      const finalResolvedUser = resolvedUser ?? buildAuthenticatedUser(payload.uid, payload.phoneNumber, remoteUser ?? undefined);
      try {
        await upsertUserInFirestore({
          ...finalResolvedUser,
          id: payload.uid,
          phoneNumber: payload.phoneNumber ?? finalResolvedUser.phoneNumber
        });
      } catch (error) {
        console.warn('[user-sync] Failed to upsert authenticated user profile:', {
          error,
          targetUid: payload.uid,
          authUid: getFirebaseServices()?.auth.currentUser?.uid ?? null
        });
      }

      return finalResolvedUser;
    },
    [
      ensureFirebaseAuthSession,
      markSyncFailure,
      markSyncSuccess,
      setCurrentUser,
      setHelpPosts,
      setIsLoggedIn,
      mergeRemoteRidesWithLocalCreated,
      setRides,
      setGroups,
      setUsers,
      startSync
    ]
  );

  useEffect(() => {
    let mounted = true;

    const hydrate = async () => {
      try {
        const [
          savedTheme,
          savedUsers,
          savedNotifications,
          savedRides,
          savedHelpPosts,
          savedConversations,
          savedGroupChats,
          savedNews,
          savedGroups,
          savedLocationMode
        ] =
          await Promise.all([
            AsyncStorage.getItem(STORAGE_KEYS.theme),
            AsyncStorage.getItem(STORAGE_KEYS.users),
            AsyncStorage.getItem(STORAGE_KEYS.notifications),
            AsyncStorage.getItem(STORAGE_KEYS.rides),
            AsyncStorage.getItem(STORAGE_KEYS.helpPosts),
            AsyncStorage.getItem(STORAGE_KEYS.conversations),
            AsyncStorage.getItem(STORAGE_KEYS.groupChats),
            AsyncStorage.getItem(STORAGE_KEYS.news),
            AsyncStorage.getItem(STORAGE_KEYS.groups),
            AsyncStorage.getItem(STORAGE_KEYS.locationMode)
          ]);

        const { user: nextCurrentUser, hasPersistedSession } = await getCurrentUserFromStorage();
        let authUser = FIREBASE_ENABLED ? getFirebaseServices()?.auth.currentUser ?? null : null;
        if (FIREBASE_ENABLED && authUser && !hasPersistedSession) {
          await signOutFirebase();
          authUser = null;
        }
        if (FIREBASE_ENABLED && !authUser && hasPersistedSession) {
          const restoredAuthSession = await waitForAuthSession(2000, 100);
          if (restoredAuthSession) {
            authUser = getFirebaseServices()?.auth.currentUser ?? null;
          }
        }
        const completedForAuthenticatedPhone =
          authUser?.phoneNumber ? await isProfileCompletedForPhone(authUser.phoneNumber) : false;
        const hasCloudAuthenticatedSession = FIREBASE_ENABLED ? Boolean(authUser) : false;
        const hasRestorableSession = FIREBASE_ENABLED
          ? hasCloudAuthenticatedSession || hasPersistedSession
          : hasPersistedSession;
        const effectiveCurrentUser = authUser
          ? buildAuthenticatedUser(
            authUser.uid,
            authUser.phoneNumber ?? undefined,
            nextCurrentUser.id === authUser.uid ? nextCurrentUser : undefined
          )
          : hasRestorableSession
            ? nextCurrentUser
            : MOCK_CURRENT_USER;

        if (!mounted) return;

        const persistedUsers = safeParse<User[]>(savedUsers, EMPTY_USERS);
        const persistedNotifications = safeParse<Notification[]>(savedNotifications, EMPTY_NOTIFICATIONS);
        const persistedRides = normalizeRides(safeParse<RidePost[]>(savedRides, EMPTY_RIDES));
        const persistedHelpPosts = safeParse<HelpPost[]>(savedHelpPosts, EMPTY_HELP_POSTS);
        const persistedConversations = normalizeConversationsSnapshot(safeParse<Conversation[]>(savedConversations, EMPTY_CONVERSATIONS));
        const persistedNews = safeParse<NewsArticle[]>(savedNews, EMPTY_NEWS);
        const persistedGroups = normalizeGroups(safeParse<LegacyGroup[]>(savedGroups, EMPTY_GROUPS));
        const hasLegacyMockSeed =
          persistedUsers.some((item) => LEGACY_MOCK_USER_IDS.has(item.id)) ||
          persistedNotifications.some((item) => LEGACY_MOCK_NOTIFICATION_IDS.has(item.id)) ||
          persistedRides.some((item) => LEGACY_MOCK_RIDE_IDS.has(item.id)) ||
          persistedHelpPosts.some((item) => LEGACY_MOCK_HELP_IDS.has(item.id)) ||
          persistedConversations.some((item) => LEGACY_MOCK_CONVERSATION_IDS.has(item.id)) ||
          persistedNews.some((item) => LEGACY_MOCK_NEWS_IDS.has(item.id)) ||
          persistedGroups.some((item) => LEGACY_MOCK_GROUP_IDS.has(item.id));

        if (hasLegacyMockSeed) {
          void clearPersistedSessionStorage();
        }

        setTheme(safeParse<Theme>(savedTheme, 'dark'));
        setCurrentUser(
          completedForAuthenticatedPhone && effectiveCurrentUser.profileComplete === false
            ? {
              ...effectiveCurrentUser,
              profileComplete: true
            }
            : effectiveCurrentUser
        );
        if (hasRestorableSession) {
          setIsLoggedIn(true);
        }
        setUsers(hasRestorableSession && !hasLegacyMockSeed ? persistedUsers : EMPTY_USERS);
        setNotifications(hasRestorableSession && !hasLegacyMockSeed ? persistedNotifications : EMPTY_NOTIFICATIONS);
        setRides(hasRestorableSession && !hasLegacyMockSeed ? persistedRides : EMPTY_RIDES);
        setHelpPosts(hasRestorableSession && !hasLegacyMockSeed ? persistedHelpPosts : EMPTY_HELP_POSTS);
        setConversations(
          hasRestorableSession && !hasLegacyMockSeed
            ? persistedConversations
            : normalizeConversationsSnapshot(EMPTY_CONVERSATIONS)
        );
        setGroupChatMessagesByRoom(hasRestorableSession ? safeParse<Record<string, ChatMessage[]>>(savedGroupChats, {}) : {});
        setNewsArticles(hasLegacyMockSeed ? EMPTY_NEWS : persistedNews);
        setGroups(
          hasRestorableSession && !hasLegacyMockSeed
            ? persistedGroups
            : normalizeGroups(EMPTY_GROUPS)
        );
        setLocationMode(hasRestorableSession ? safeParse<LocationMode>(savedLocationMode, 'auto') : 'auto');

        if (FIREBASE_ENABLED && !hasRestorableSession) {
          void clearPersistedSessionStorage();
        }

        if (FIREBASE_ENABLED && hasCloudAuthenticatedSession) {
          startSync('rides');
          startSync('help');

          const [remoteUsersResult, remoteRidesResult, remoteHelpPostsResult, remoteGroupsResult] = await Promise.allSettled([
            fetchUsersFromFirestore(),
            fetchRidesFromFirestore(),
            fetchHelpPostsFromFirestore(),
            fetchGroupsFromFirestore()
          ]);

          if (!mounted) return;

          if (remoteUsersResult.status === 'fulfilled' && remoteUsersResult.value.length > 0) {
            const me = remoteUsersResult.value.find((user) => user.id === effectiveCurrentUser.id);
            if (me) {
              setCurrentUser((prev) => ({
                ...prev,
                ...me,
                profileComplete:
                  completedForAuthenticatedPhone
                    ? true
                    : (typeof me.profileComplete === 'boolean' ? me.profileComplete : prev.profileComplete),
                friendRequests: {
                  ...prev.friendRequests,
                  ...me.friendRequests
                }
              }));
            }

            setUsers(remoteUsersResult.value.filter((user) => user.id !== effectiveCurrentUser.id));
          }

          if (remoteRidesResult.status === 'fulfilled') {
            setRides((prev) => mergeRemoteRidesWithLocalCreated(remoteRidesResult.value, prev, effectiveCurrentUser.id));
            markSyncSuccess('rides');
          } else {
            markSyncFailure('rides', remoteRidesResult.reason);
          }

          if (remoteHelpPostsResult.status === 'fulfilled') {
            setHelpPosts(remoteHelpPostsResult.value);
            markSyncSuccess('help');
          } else {
            markSyncFailure('help', remoteHelpPostsResult.reason);
          }

          if (remoteGroupsResult.status === 'fulfilled') {
            const normalizedRemoteGroups = normalizeGroups(remoteGroupsResult.value);
            setGroups((prev) =>
              mergeGroupsPreservingLocalMembership(
                normalizedRemoteGroups,
                prev,
                effectiveCurrentUser.id,
                effectiveCurrentUser.phoneNumber
              )
            );
          }
        }
      } finally {
        if (mounted) {
          setHydrated(true);
        }
      }
    };

    hydrate();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!FIREBASE_ENABLED) return;
    const unsubscribe = subscribeToAuthState((user) => {
      if (!hydrated) return;
      if (!user) {
        const hasLocalSession = isLoggedIn && currentUser.id !== MOCK_CURRENT_USER.id;
        if (hasLocalSession) {
          return;
        }
        clearSession();
        return;
      }

      void applyAuthenticatedSession({
        uid: user.uid,
        phoneNumber: user.phoneNumber ?? undefined
      });
    });
    return unsubscribe;
  }, [applyAuthenticatedSession, clearSession, currentUser.id, hydrated, isLoggedIn]);

  useEffect(() => {
    if (!FIREBASE_ENABLED || !hydrated || !isLoggedIn) return;

    let disposed = false;
    let unsubscribeRides: (() => void) | null = null;
    startSync('rides');

    void (async () => {
      const hasAuthSession = await ensureFirebaseAuthSession();
      if (!hasAuthSession) {
        if (!disposed) {
          markSyncFailure('rides', new Error('Cloud sync requires an authenticated Firebase session. Please log in again.'));
        }
        return;
      }

      if (disposed) return;
      unsubscribeRides = subscribeRidesFromFirestore({
        onChange: (remoteRides) => {
          if (disposed) return;
          setRides((prev) => mergeRemoteRidesWithLocalCreated(remoteRides, prev, currentUser.id));
          markSyncSuccess('rides');
        },
        onError: (error) => {
          if (disposed) return;
          markSyncFailure('rides', error);
        }
      });
    })();

    return () => {
      disposed = true;
      unsubscribeRides?.();
    };
  }, [currentUser.id, ensureFirebaseAuthSession, hydrated, isLoggedIn, markSyncFailure, markSyncSuccess, mergeRemoteRidesWithLocalCreated, setRides, startSync]);

  useEffect(() => {
    if (!FIREBASE_ENABLED || !hydrated || !isLoggedIn) return;

    let disposed = false;
    let unsubscribeHelpPosts: (() => void) | null = null;
    startSync('help');

    void (async () => {
      const hasAuthSession = await ensureFirebaseAuthSession();
      if (!hasAuthSession) {
        if (!disposed) {
          markSyncFailure('help', new Error('Cloud sync requires an authenticated Firebase session. Please log in again.'));
        }
        return;
      }

      if (disposed) return;
      unsubscribeHelpPosts = subscribeHelpPostsFromFirestore({
        onChange: (remoteHelpPosts) => {
          if (disposed) return;
          setHelpPosts(remoteHelpPosts);
          markSyncSuccess('help');
        },
        onError: (error) => {
          if (disposed) return;
          markSyncFailure('help', error);
        }
      });
    })();

    return () => {
      disposed = true;
      unsubscribeHelpPosts?.();
    };
  }, [ensureFirebaseAuthSession, hydrated, isLoggedIn, markSyncFailure, markSyncSuccess, setHelpPosts, startSync]);

  useEffect(() => {
    if (!FIREBASE_ENABLED || !hydrated || !isLoggedIn || !currentUser.id) return;

    let disposed = false;
    let unsubscribeGroups: (() => void) | null = null;

    void (async () => {
      const hasAuthSession = await ensureFirebaseAuthSession();
      if (!hasAuthSession) {
        return;
      }

      if (disposed) return;
      unsubscribeGroups = subscribeGroupsFromFirestore({
        onChange: (remoteGroups) => {
          if (disposed) return;
          const normalizedRemoteGroups = normalizeGroups(remoteGroups);
          setGroups((prev) =>
            mergeGroupsPreservingLocalMembership(
              normalizedRemoteGroups,
              prev,
              currentUser.id,
              currentUser.phoneNumber
            )
          );
        },
        onError: () => {
          // Groups do not currently expose a dedicated sync status channel.
        }
      });
    })();

    return () => {
      disposed = true;
      unsubscribeGroups?.();
    };
  }, [currentUser.id, ensureFirebaseAuthSession, hydrated, isLoggedIn, setGroups]);

  useDebouncedStorageValue(hydrated, STORAGE_KEYS.theme, theme);
  useDebouncedStorageValue(hydrated && isLoggedIn, STORAGE_KEYS.currentUser, currentUser);
  useDebouncedStorageValue(hydrated && isLoggedIn, STORAGE_KEYS.users, users);
  useDebouncedStorageValue(hydrated && isLoggedIn, STORAGE_KEYS.notifications, notifications);
  useDebouncedStorageValue(hydrated && isLoggedIn, STORAGE_KEYS.rides, rides);
  useDebouncedStorageValue(hydrated && isLoggedIn, STORAGE_KEYS.helpPosts, helpPosts);
  useDebouncedStorageValue(hydrated && isLoggedIn, STORAGE_KEYS.conversations, conversations);
  useDebouncedStorageValue(hydrated && isLoggedIn, STORAGE_KEYS.groupChats, groupChatMessagesByRoom);
  useDebouncedStorageValue(hydrated, STORAGE_KEYS.news, newsArticles);
  useDebouncedStorageValue(hydrated && isLoggedIn, STORAGE_KEYS.groups, groups);
  useDebouncedStorageValue(hydrated && isLoggedIn, STORAGE_KEYS.locationMode, locationMode);

  useEffect(() => {
    const normalizedName = currentUser.name.trim();
    if (!normalizedName) {
      previousCurrentUserIdentityRef.current = null;
      return;
    }

    const previous = previousCurrentUserIdentityRef.current;
    previousCurrentUserIdentityRef.current = {
      id: currentUser.id,
      name: normalizedName
    };

    if (!previous) return;
    if (previous.id !== currentUser.id) return;
    if (previous.name === normalizedName) return;

    propagateUserNameAcrossState(currentUser.id, normalizedName, true);
  }, [currentUser.id, currentUser.name, propagateUserNameAcrossState]);

  useEffect(() => {
    const nextGroupNames = new Map(groups.map((group) => [group.id, group.name]));
    const previousGroupNames = previousGroupNamesRef.current;
    previousGroupNamesRef.current = nextGroupNames;

    if (previousGroupNames.size === 0) return;

    const renamedGroups = new Map<string, { from: string; to: string }>();
    nextGroupNames.forEach((nextName, groupId) => {
      const previousName = previousGroupNames.get(groupId);
      if (!previousName || previousName === nextName) return;
      renamedGroups.set(groupId, { from: previousName, to: nextName });
    });

    if (renamedGroups.size === 0) return;

    setNotifications((prev) => {
      let changed = false;
      const next = prev.map((notification) => {
        const data = notification.data;
        const groupId = typeof data?.groupId === 'string' ? data.groupId : '';
        if (!groupId) return notification;
        const rename = renamedGroups.get(groupId);
        if (!rename) return notification;

        const nextContent = replaceGroupNameMentions(notification.content, rename.from, rename.to);
        if (nextContent === notification.content) return notification;

        changed = true;
        return {
          ...notification,
          content: nextContent
        };
      });

      return changed ? next : prev;
    });
  }, [groups]);

  useEffect(() => {
    if (!hydrated || !isLoggedIn || !FIREBASE_ENABLED) return;

    let disposed = false;
    void (async () => {
      const hasAuthSession = await ensureFirebaseAuthSession(currentUser.phoneNumber);
      if (!hasAuthSession || disposed) return;

      try {
        await upsertUserInFirestore(currentUser);
      } catch {
        // ignore transient write failures; later sync attempts can retry
      }
    })();

    return () => {
      disposed = true;
    };
  }, [currentUser, ensureFirebaseAuthSession, hydrated, isLoggedIn]);

  useEffect(() => {
    if (!hydrated || !isLoggedIn || !FIREBASE_ENABLED) return;

    const nextSignatures = new Map<string, string>();
    users.forEach((user) => {
      nextSignatures.set(user.id, JSON.stringify(user));
    });

    if (!lastSyncedUsersRef.current) {
      lastSyncedUsersRef.current = nextSignatures;
      return;
    }

    const previousSignatures = lastSyncedUsersRef.current;
    void (async () => {
      const hasAuthSession = await ensureFirebaseAuthSession(currentUser.phoneNumber);
      if (!hasAuthSession) return;

      await Promise.all(
        users.map(async (user) => {
          if (previousSignatures.get(user.id) === nextSignatures.get(user.id)) return;
          try {
            await upsertUserInFirestore(user);
          } catch {
            // ignore transient write failures; later sync attempts can retry
          }
        })
      );
    })();

    lastSyncedUsersRef.current = nextSignatures;
  }, [currentUser.phoneNumber, ensureFirebaseAuthSession, hydrated, isLoggedIn, users]);

  useEffect(() => {
    if (!hydrated) return;

    let disposed = false;
    const runRefresh = async () => {
      if (disposed) return;
      await refreshNewsFeed();
    };

    void runRefresh();
    const timer = setInterval(() => {
      void runRefresh();
    }, NEWS_REFRESH_INTERVAL_MS);

    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [hydrated, refreshNewsFeed]);

  useEffect(() => {
    if (!hydrated || activeTab !== 'news') return;
    void refreshNewsFeed();
  }, [hydrated, activeTab, refreshNewsFeed]);

  useEffect(() => {
    if (activeTab !== 'news') return;
    lastNewsLoadTriggerHeightRef.current = 0;
    setVisibleNewsCount(Math.min(NEWS_PAGE_SIZE, newsArticles.length));
  }, [activeTab]);

  useEffect(() => {
    setVisibleNewsCount((previousCount) => {
      if (newsArticles.length === 0) return NEWS_PAGE_SIZE;
      return Math.min(Math.max(previousCount, NEWS_PAGE_SIZE), newsArticles.length);
    });
  }, [newsArticles.length]);

  const usersById = useMemo(() => {
    const byId = new Map<string, User>();
    byId.set(currentUser.id, currentUser);
    users.forEach((user) => byId.set(user.id, user));
    return byId;
  }, [currentUser, users]);
  const ridesById = useMemo(() => new Map<string, RidePost>(rides.map((ride) => [ride.id, ride])), [rides]);
  const helpPostsById = useMemo(() => new Map<string, HelpPost>(helpPosts.map((post) => [post.id, post])), [helpPosts]);
  const groupsById = useMemo(() => new Map<string, Group>(groups.map((group) => [group.id, group])), [groups]);
  const canCurrentUserCreateGroupRide = useCallback(
    (group: Group): boolean => {
      const isMember = group.creatorId === currentUser.id || group.members.includes(currentUser.id);
      if (!isMember) return false;
      if (group.rideCreatePermission !== 'admin') return true;
      return group.creatorId === currentUser.id || group.adminIds.includes(currentUser.id);
    },
    [currentUser.id]
  );
  const rideComposerGroups = useMemo(
    () => groups.filter((group) => canCurrentUserCreateGroupRide(group)),
    [canCurrentUserCreateGroupRide, groups]
  );

  const allUsers = useMemo(() => Array.from(usersById.values()), [usersById]);
  const blockedUserIds = useMemo(() => {
    const blocked = new Set(uniqueStrings(currentUser.blockedUserIds.filter(Boolean)));
    const blockedPhoneLast10 = new Set<string>();

    currentUser.blockedUserIds.forEach((blockedId) => {
      const fromId = extractPhoneLast10(blockedId);
      if (fromId) blockedPhoneLast10.add(fromId);

      const blockedUser = usersById.get(blockedId);
      const fromPhone = extractPhoneLast10(blockedUser?.phoneNumber ?? '');
      if (fromPhone) blockedPhoneLast10.add(fromPhone);
    });

    if (blockedPhoneLast10.size === 0) return blocked;

    allUsers.forEach((user) => {
      const phoneLast10 = extractPhoneLast10(user.phoneNumber ?? '');
      if (!phoneLast10 || !blockedPhoneLast10.has(phoneLast10)) return;
      blocked.add(user.id);
    });

    return blocked;
  }, [allUsers, currentUser.blockedUserIds, usersById]);
  const visibleUsers = useMemo(() => users.filter((user) => !blockedUserIds.has(user.id)), [users, blockedUserIds]);
  const visibleNotifications = useMemo(
    () => notifications.filter((notification) => !blockedUserIds.has(notification.senderId)),
    [notifications, blockedUserIds]
  );
  const unreadCount = useMemo(() => visibleNotifications.filter((item) => !item.read).length, [visibleNotifications]);
  const visibleConversations = useMemo(
    () => conversations.filter((conversation) => !blockedUserIds.has(conversation.participantId)),
    [conversations, blockedUserIds]
  );
  const visibleRides = useMemo(() => rides.filter((ride) => !blockedUserIds.has(ride.creatorId)), [rides, blockedUserIds]);
  const visibleHelpPosts = useMemo(() => helpPosts.filter((post) => !blockedUserIds.has(post.creatorId)), [helpPosts, blockedUserIds]);

  const feedRides = useMemo(
    () => visibleRides.filter((ride) => canUserViewRideInFeed({ ride, viewer: currentUser, usersById })),
    [visibleRides, currentUser, usersById]
  );
  const visibleNewsArticles = useMemo(
    () => newsArticles.slice(0, Math.min(visibleNewsCount, newsArticles.length)),
    [newsArticles, visibleNewsCount]
  );
  const hasMoreNewsArticles = visibleNewsCount < newsArticles.length;

  const selectedRide = useMemo(() => {
    if (!selectedRideId) return null;
    return ridesById.get(selectedRideId) ?? null;
  }, [ridesById, selectedRideId]);

  const editingRide = useMemo(() => {
    if (!editingRideId) return null;
    return ridesById.get(editingRideId) ?? null;
  }, [editingRideId, ridesById]);

  const effectiveRideTrackingSession = useMemo(() => {
    if (!selectedRideId) return null;
    if (FIREBASE_ENABLED && hasFirebaseAuthSession) {
      return selectedRideTrackingSession;
    }
    return localRideTrackingSessions[selectedRideId] ?? null;
  }, [hasFirebaseAuthSession, localRideTrackingSessions, selectedRideId, selectedRideTrackingSession]);

  const inferredUserSummariesById = useMemo(() => {
    const byId = new Map<string, { name: string; avatar: string; city?: string; garage: string[] }>();

    const isGenericName = (value: string): boolean => {
      const normalized = value.trim().toLowerCase();
      return normalized.length === 0 || normalized === 'rider' || normalized === 'a rider' || normalized === 'user';
    };

    const mergeSummary = (
      userId: string,
      incoming: { name?: string; avatar?: string; city?: string; bikeModel?: string }
    ) => {
      const existing = byId.get(userId);
      const fallbackName = existing?.name || 'Rider';
      const nextRawName = incoming.name?.trim() || '';
      const existingName = existing?.name || '';
      const resolvedName =
        nextRawName && (!existingName || (isGenericName(existingName) && !isGenericName(nextRawName)))
          ? nextRawName
          : fallbackName;
      const incomingAvatar = incoming.avatar?.trim() || '';
      const existingAvatar = existing?.avatar || '';
      const resolvedAvatar =
        incomingAvatar && incomingAvatar !== avatarFallback
          ? incomingAvatar
          : existingAvatar || incomingAvatar || avatarFallback;
      const existingGarage = existing?.garage ?? [];
      const nextGarage = incoming.bikeModel ? uniqueStrings([...existingGarage, incoming.bikeModel]) : existingGarage;
      byId.set(userId, {
        name: resolvedName,
        avatar: resolvedAvatar || avatarFallback,
        city: existing?.city || incoming.city,
        garage: nextGarage
      });
    };

    rides.forEach((ride) => {
      mergeSummary(ride.creatorId, {
        name: ride.creatorName,
        avatar: ride.creatorAvatar,
        city: ride.city
      });
    });

    helpPosts.forEach((post) => {
      mergeSummary(post.creatorId, {
        name: post.creatorName,
        avatar: post.creatorAvatar,
        bikeModel: post.bikeModel
      });
    });

    conversations.forEach((conversation) => {
      mergeSummary(conversation.participantId, {
        name: conversation.participantName,
        avatar: conversation.participantAvatar
      });
    });

    notifications.forEach((notification) => {
      mergeSummary(notification.senderId, {
        name: notification.senderName,
        avatar: notification.senderAvatar
      });
    });

    return byId;
  }, [conversations, helpPosts, notifications, rides]);

  const buildInferredUserRecord = useCallback(
    (userId: string): User | null => {
      const inferredSummary = inferredUserSummariesById.get(userId);
      if (!inferredSummary) return null;
      const city = inferredSummary.city?.trim() || '';
      return {
        id: userId,
        name: inferredSummary.name || 'Rider',
        garage: inferredSummary.garage,
        bikeType: inferredSummary.garage[0] || '',
        city,
        style: '',
        experience: 'Beginner',
        distance: '',
        isPro: false,
        avatar: inferredSummary.avatar || avatarFallback,
        verified: false,
        typicalRideTime: '',
        friends: [],
        friendRequests: {
          sent: [],
          received: []
        },
        blockedUserIds: [],
        isInferredProfile: true
      };
    },
    [inferredUserSummariesById]
  );

  const resolveCanonicalUser = useCallback(
    (userId: string): User | null => {
      if (!userId) return null;
      if (userId === currentUser.id) return currentUser;

      const exact = usersById.get(userId);
      if (exact && !exact.isInferredProfile) return exact;

      const aliasMatch = userId.match(LEGACY_USER_ALIAS_REGEX);
      const e164Digits = userId.trim().startsWith('+') ? userId.replace(/\D/g, '') : '';
      const aliasPhoneLast10 = aliasMatch?.[1] ?? (e164Digits.length >= 10 ? e164Digits.slice(-10) : '');
      if (!aliasPhoneLast10) {
        return exact ?? null;
      }

      const matched = allUsers.find((user) => {
        if (user.id === userId) return false;
        const digits = (user.phoneNumber ?? '').replace(/\D/g, '');
        return digits.length >= 10 && digits.slice(-10) === aliasPhoneLast10 && user.isInferredProfile !== true;
      });

      return matched ?? exact ?? null;
    },
    [allUsers, currentUser, usersById]
  );

  const rideUsersForModal = useMemo(() => {
    if (!selectedRide) return allUsers;

    const byId = new Map<string, User>(allUsers.map((user) => [user.id, user]));
    const sanitizeInferredName = (value: string, fallback: string): string => {
      const normalized = value.trim().toLowerCase();
      if (!normalized || normalized === 'rider' || normalized === 'a rider' || normalized === 'user' || normalized === 'a') {
        return fallback;
      }
      return value.trim();
    };
    uniqueStrings([...selectedRide.currentParticipants, ...selectedRide.requests]).forEach((userId) => {
      const resolvedUser = resolveCanonicalUser(userId);
      if (resolvedUser) {
        byId.set(resolvedUser.id, resolvedUser);
        return;
      }
      if (byId.has(userId)) return;
      const inferredSummary = inferredUserSummariesById.get(userId);
      if (!inferredSummary) return;
      const fallbackName = `Rider ${userId.slice(-4).toUpperCase()}`;

      byId.set(userId, {
        id: userId,
        name: sanitizeInferredName(inferredSummary.name, fallbackName),
        garage: inferredSummary.garage,
        bikeType: inferredSummary.garage[0] || '',
        city: inferredSummary.city?.trim() || '',
        style: '',
        experience: 'Beginner',
        distance: '',
        isPro: false,
        avatar: inferredSummary.avatar || avatarFallback,
        verified: false,
        typicalRideTime: '',
        friends: [],
        friendRequests: {
          sent: [],
          received: []
        },
        blockedUserIds: [],
        isInferredProfile: true
      });
    });

    return Array.from(byId.values());
  }, [allUsers, inferredUserSummariesById, resolveCanonicalUser, selectedRide]);

  const selectedUserProfile = useMemo(() => {
    if (!selectedUserId) return null;
    const canonicalUser = resolveCanonicalUser(selectedUserId);
    if (blockedUserIds.has(canonicalUser?.id ?? selectedUserId)) return null;
    if (canonicalUser) return canonicalUser;
    return buildInferredUserRecord(selectedUserId);
  }, [blockedUserIds, buildInferredUserRecord, resolveCanonicalUser, selectedUserId]);

  const selectedGroup = useMemo(() => {
    if (!selectedGroupId) return null;
    return groupsById.get(selectedGroupId) ?? null;
  }, [selectedGroupId, groupsById]);
  const editingGroup = useMemo(() => {
    if (!editingGroupId) return null;
    return groupsById.get(editingGroupId) ?? null;
  }, [editingGroupId, groupsById]);

  const activeGroupChat = useMemo(() => {
    if (!activeGroupChatId) return null;
    return groupsById.get(activeGroupChatId) ?? null;
  }, [activeGroupChatId, groupsById]);

  const groupUsersForModal = useMemo(() => {
    if (!selectedGroup) return allUsers;

    const byId = new Map<string, User>(allUsers.map((user) => [user.id, user]));
    uniqueStrings([...selectedGroup.members, ...selectedGroup.joinRequests]).forEach((userId) => {
      const resolvedUser = resolveCanonicalUser(userId);
      if (resolvedUser) {
        byId.set(resolvedUser.id, resolvedUser);
        return;
      }
      if (byId.has(userId)) return;
      const inferred = buildInferredUserRecord(userId);
      if (inferred) {
        byId.set(userId, inferred);
      }
    });

    return Array.from(byId.values());
  }, [allUsers, buildInferredUserRecord, resolveCanonicalUser, selectedGroup]);

  const activeGroupChatMessages = useMemo(() => {
    if (!activeGroupChat) return [];
    const roomMessages = groupChatMessagesByRoom[activeGroupChat.id] ?? [];
    return roomMessages.filter((message) => message.senderId === currentUser.id || !blockedUserIds.has(message.senderId));
  }, [activeGroupChat, groupChatMessagesByRoom, currentUser.id, blockedUserIds]);

  const selectedFriendStatus: FriendStatus = useMemo(() => {
    if (!selectedUserProfile) return 'none';
    if (selectedUserProfile.id === currentUser.id) return 'self';
    if (currentUser.friends.includes(selectedUserProfile.id)) return 'friend';
    if (currentUser.friendRequests.sent.includes(selectedUserProfile.id)) return 'requested';
    return 'none';
  }, [selectedUserProfile, currentUser]);

  useEffect(() => {
    if (isRideDetailOpen && selectedRideId && !selectedRide) {
      setIsRideDetailOpen(false);
      setSelectedRideId(null);
    }
  }, [isRideDetailOpen, selectedRideId, selectedRide]);

  useEffect(() => {
    if (!editingRideId || editingRide) return;
    setEditingRideId(null);
  }, [editingRide, editingRideId]);

  useEffect(() => {
    if (!selectedRide) return;
    if (!blockedUserIds.has(selectedRide.creatorId)) return;
    setIsRideDetailOpen(false);
    setSelectedRideId(null);
  }, [selectedRide, blockedUserIds]);

  useEffect(() => {
    if (!selectedHelpPost) return;
    if (!blockedUserIds.has(selectedHelpPost.creatorId)) return;
    setIsHelpDetailOpen(false);
    setSelectedHelpPost(null);
  }, [selectedHelpPost, blockedUserIds, setIsHelpDetailOpen, setSelectedHelpPost]);

  useEffect(() => {
    if (!selectedHelpPost) return;
    const latestPost = helpPostsById.get(selectedHelpPost.id);
    if (!latestPost) {
      setIsHelpDetailOpen(false);
      setSelectedHelpPost(null);
      return;
    }
    if (latestPost === selectedHelpPost) return;
    setSelectedHelpPost(latestPost);
  }, [helpPostsById, selectedHelpPost, setIsHelpDetailOpen, setSelectedHelpPost]);

  useEffect(() => {
    if (!activeGroupChatId) return;
    const group = groupsById.get(activeGroupChatId);
    if (group && group.members.includes(currentUser.id)) return;
    setActiveGroupChatId(null);
  }, [activeGroupChatId, currentUser.id, groupsById]);

  useEffect(() => {
    if (!FIREBASE_ENABLED || !hydrated || !isLoggedIn || !selectedRide) return;

    let disposed = false;
    void (async () => {
      const hasAuthSession = await ensureFirebaseAuthSession();
      if (!hasAuthSession || disposed) return;

      const idsToFetch = uniqueStrings([...selectedRide.currentParticipants, ...selectedRide.requests]).filter((userId) => {
        if (!userId || userId === currentUser.id) return false;
        return true;
      });

      if (idsToFetch.length === 0) return;

      const resolvedUsersById = new Map<string, User>();
      (
        await Promise.all(
          idsToFetch.map(async (userId) => {
            try {
              return await fetchUserByIdFromFirestore(userId);
            } catch {
              return null;
            }
          })
        )
      )
        .filter((user): user is User => user !== null)
        .forEach((user) => {
          resolvedUsersById.set(user.id, user);
        });

      const unresolvedIds = idsToFetch.filter((userId) => !resolvedUsersById.has(userId));
      if (unresolvedIds.length > 0) {
        try {
          const remoteUsers = await fetchUsersFromFirestore();
          const remoteUsersById = new Map<string, User>(remoteUsers.map((user) => [user.id, user]));

          unresolvedIds.forEach((userId) => {
            const direct = remoteUsersById.get(userId);
            if (direct) {
              resolvedUsersById.set(direct.id, direct);
              return;
            }

            const digitsFromId = userId.replace(/\D/g, '');
            const last10 = digitsFromId.length >= 10 ? digitsFromId.slice(-10) : '';
            if (!last10) return;
            const aliasMatch = remoteUsers.find((user) => {
              const phoneDigits = (user.phoneNumber ?? '').replace(/\D/g, '');
              return phoneDigits.length >= 10 && phoneDigits.slice(-10) === last10;
            });
            if (aliasMatch) {
              resolvedUsersById.set(aliasMatch.id, aliasMatch);
            }
          });
        } catch {
          // ignore fallback lookup errors; UI still shows participant placeholders.
        }
      }

      if (disposed || resolvedUsersById.size === 0) return;
      const resolvedUsers = Array.from(resolvedUsersById.values());

      setUsers((prev) => {
        const byId = new Map<string, User>(prev.map((user) => [user.id, user]));
        let changed = false;

        resolvedUsers.forEach((resolvedUser) => {
          const existing = byId.get(resolvedUser.id);
          if (!existing) {
            byId.set(resolvedUser.id, resolvedUser);
            changed = true;
            return;
          }

          const merged: User = {
            ...existing,
            ...resolvedUser,
            friendRequests: {
              sent: resolvedUser.friendRequests?.sent ?? existing.friendRequests?.sent ?? [],
              received: resolvedUser.friendRequests?.received ?? existing.friendRequests?.received ?? []
            }
          };

          if (JSON.stringify(existing) !== JSON.stringify(merged)) {
            byId.set(resolvedUser.id, merged);
            changed = true;
          }
        });

        return changed ? Array.from(byId.values()) : prev;
      });
    })();

    return () => {
      disposed = true;
    };
  }, [currentUser.id, ensureFirebaseAuthSession, hydrated, isLoggedIn, selectedRide]);

  useEffect(() => {
    if (!FIREBASE_ENABLED || !hydrated || !isLoggedIn || !selectedGroup) return;

    const idsToFetch = uniqueStrings([...selectedGroup.members, ...selectedGroup.joinRequests]).filter((userId) => {
      if (!userId || userId === currentUser.id) return false;
      if (attemptedGroupMemberProfileFetchIdsRef.current.has(userId)) return false;
      return true;
    });

    if (idsToFetch.length === 0) return;
    idsToFetch.forEach((userId) => {
      attemptedGroupMemberProfileFetchIdsRef.current.add(userId);
    });

    let disposed = false;
    void (async () => {
      const resolvedUsers = (
        await Promise.all(
          idsToFetch.map(async (userId) => {
            try {
              return await fetchUserByIdFromFirestore(userId);
            } catch {
              return null;
            }
          })
        )
      ).filter((user): user is User => user !== null);

      if (disposed || resolvedUsers.length === 0) return;

      setUsers((prev) => {
        const byId = new Map<string, User>(prev.map((user) => [user.id, user]));
        let changed = false;

        resolvedUsers.forEach((resolvedUser) => {
          const existing = byId.get(resolvedUser.id);
          if (!existing) {
            byId.set(resolvedUser.id, resolvedUser);
            changed = true;
            return;
          }

          const merged: User = {
            ...existing,
            ...resolvedUser,
            friendRequests: {
              sent: resolvedUser.friendRequests?.sent ?? existing.friendRequests?.sent ?? [],
              received: resolvedUser.friendRequests?.received ?? existing.friendRequests?.received ?? []
            }
          };

          if (JSON.stringify(existing) !== JSON.stringify(merged)) {
            byId.set(resolvedUser.id, merged);
            changed = true;
          }
        });

        return changed ? Array.from(byId.values()) : prev;
      });
    })();

    return () => {
      disposed = true;
    };
  }, [currentUser.id, hydrated, isLoggedIn, selectedGroup]);

  useEffect(() => {
    if (!FIREBASE_ENABLED || !activeConversation) return;
    const conversationId = activeConversation.id;
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    let retriedAfterPermissionError = false;

    const subscribe = () => {
      if (disposed) return;
      startSync('chat');
      unsubscribe?.();
      unsubscribe = subscribeChatMessages(
        conversationId,
        (messages) => {
          markSyncSuccess('chat');
          if (messages.length === 0) return;
          const lastMessage = messages[messages.length - 1];

          setConversations((prev) =>
            prev.map((conversation) =>
              conversation.id === conversationId
                ? {
                  ...conversation,
                  messages,
                  lastMessage: lastMessage.text,
                  timestamp: lastMessage.timestamp
                }
                : conversation
            )
          );

          setActiveConversation((prev) =>
            prev && prev.id === conversationId
              ? {
                ...prev,
                messages,
                lastMessage: lastMessage.text,
                timestamp: lastMessage.timestamp
              }
              : prev
          );
        },
        (error) => {
          if (disposed) return;
          if (!retriedAfterPermissionError && isFirebasePermissionDeniedError(error)) {
            retriedAfterPermissionError = true;
            void (async () => {
              const hasAuthSession = await ensureFirebaseAuthSession();
              if (disposed) return;
              if (!hasAuthSession) {
                markSyncFailure('chat', error);
                return;
              }
              subscribe();
            })();
            return;
          }
          markSyncFailure('chat', error);
        }
      );
    };

    void (async () => {
      const hasAuthSession = await ensureFirebaseAuthSession();
      if (disposed) return;
      if (!hasAuthSession) {
        markSyncFailure('chat', new Error('Chat sync requires an authenticated Firebase session. Please log in again.'));
        return;
      }
      subscribe();
    })();

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [activeConversation?.id, chatSyncRetryToken, ensureFirebaseAuthSession, markSyncFailure, markSyncSuccess, startSync]);

  useEffect(() => {
    if (!FIREBASE_ENABLED || !activeGroupChatId) return;
    const group = groupsById.get(activeGroupChatId);
    if (!group || !group.members.includes(currentUser.id)) return;
    const groupChatId = activeGroupChatId;
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    let retriedAfterPermissionError = false;

    const subscribe = () => {
      if (disposed) return;
      startSync('groupChat');
      unsubscribe?.();
      unsubscribe = subscribeGroupChatMessages(
        groupChatId,
        (messages) => {
          markSyncSuccess('groupChat');
          setGroupChatMessagesByRoom((prev) => ({
            ...prev,
            [groupChatId]: messages
          }));
        },
        (error) => {
          if (disposed) return;
          if (!retriedAfterPermissionError && isFirebasePermissionDeniedError(error)) {
            retriedAfterPermissionError = true;
            void (async () => {
              const hasAuthSession = await ensureFirebaseAuthSession();
              if (disposed) return;
              if (!hasAuthSession) {
                markSyncFailure('groupChat', error);
                return;
              }
              subscribe();
            })();
            return;
          }
          markSyncFailure('groupChat', error);
        }
      );
    };

    void (async () => {
      const hasAuthSession = await ensureFirebaseAuthSession();
      if (disposed) return;
      if (!hasAuthSession) {
        markSyncFailure('groupChat', new Error('Group chat sync requires an authenticated Firebase session. Please log in again.'));
        return;
      }
      subscribe();
    })();

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [
    activeGroupChatId,
    currentUser.id,
    ensureFirebaseAuthSession,
    markSyncFailure,
    markSyncSuccess,
    groupChatSyncRetryToken,
    groupsById,
    startSync
  ]);

  useEffect(() => {
    if (!isRideDetailOpen || !selectedRideId) {
      setSelectedRideTrackingSession(null);
      return;
    }

    if (FIREBASE_ENABLED && hasFirebaseAuthSession) return;

    setSelectedRideTrackingSession(localRideTrackingSessions[selectedRideId] ?? null);
  }, [hasFirebaseAuthSession, isRideDetailOpen, localRideTrackingSessions, selectedRideId]);

  useEffect(() => {
    if (!FIREBASE_ENABLED || !hasFirebaseAuthSession || !isRideDetailOpen || !selectedRideId) return;

    setSelectedRideTrackingSession(null);
    startSync('rideTracking');
    return subscribeRideTrackingSession(
      selectedRideId,
      (session) => {
        setSelectedRideTrackingSession(session);
        markSyncSuccess('rideTracking');
      },
      (error) => {
        markSyncFailure('rideTracking', error);
      }
    );
  }, [hasFirebaseAuthSession, isRideDetailOpen, markSyncFailure, markSyncSuccess, rideTrackingSyncRetryToken, selectedRideId, startSync]);

  const resolveCityFromGeocode = (address: Location.LocationGeocodedAddress | undefined) =>
    address?.city ?? address?.district ?? address?.subregion ?? address?.region ?? null;

  const updateCityFromCoordinates = async (latitude: number, longitude: number) => {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    const detectedCity = resolveCityFromGeocode(results[0]);
    if (!detectedCity) return false;

    setCurrentUser((prev) => (prev.city === detectedCity ? prev : { ...prev, city: detectedCity }));
    return true;
  };

  const detectAndApplyCurrentLocation = async (silent = false) => {
    setIsDetectingLocation(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationPermissionStatus('denied');
        if (!silent) {
          Alert.alert('Location Permission Needed', 'Enable location permission to auto-detect your city.');
        }
        return false;
      }

      setLocationPermissionStatus('granted');
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return updateCityFromCoordinates(position.coords.latitude, position.coords.longitude);
    } catch {
      if (!silent) {
        Alert.alert('Location Error', 'Unable to detect location right now. You can enter city manually.');
      }
      return false;
    } finally {
      setIsDetectingLocation(false);
    }
  };

  const setupNotificationChannel = useCallback(async () => {
    try {
      await registerNotificationChannel(isExpoGo);
    } catch {
      // ignore channel setup failures
    }
  }, [isExpoGo]);

  const ensureNotificationPermission = useCallback(
    async (showAlertOnDeny = false) => {
      if (isExpoGo) {
        setNotificationPermissionStatus('denied');
        if (showAlertOnDeny) {
          Alert.alert(
            'Expo Go Limitation',
            'Notification permission in this app works in a development build or APK, not in Expo Go.'
          );
        }
        return false;
      }

      try {
        const permission = await ensureDeviceNotificationPermission(isExpoGo);
        setNotificationPermissionStatus(permission.status);
        if (permission.granted) void setupNotificationChannel();

        if (!permission.granted && showAlertOnDeny) {
          Alert.alert(
            'Notifications Disabled',
            'You can enable notifications later in app settings to receive ride and chat alerts.'
          );
        }
        return permission.granted;
      } catch {
        setNotificationPermissionStatus('denied');
        return false;
      }
    },
    [isExpoGo, setupNotificationChannel, setNotificationPermissionStatus]
  );

  const scheduleDevicePushNotification = useCallback(
    async (title: string, body: string, data: Record<string, unknown> | undefined, soundKind: NotificationSoundKind) => {
      try {
        await scheduleImmediateNotification({
          title,
          body,
          data,
          isExpoGo,
          permissionStatus: notificationPermissionStatus,
          soundKind
        });
      } catch {
        // ignore local push scheduling failures
      }
    },
    [isExpoGo, notificationPermissionStatus]
  );

  const lastRegisteredExpoPushTokenRef = useRef<string | null>(null);
  const lastRegisteredFirebasePushTokenRef = useRef<string | null>(null);
  const handledNotificationResponseIdsRef = useRef<Set<string>>(new Set());
  const syncDevicePushTokens = useCallback(async () => {
    if (isExpoGo || notificationPermissionStatus !== 'granted') return;
    if (!FIREBASE_ENABLED || !hydrated || !isLoggedIn || !currentUser.id) return;

    try {
      const expoPushToken = await getExpoPushToken();
      if (expoPushToken && lastRegisteredExpoPushTokenRef.current !== expoPushToken) {
        await addExpoPushTokenToUser(currentUser.id, expoPushToken);
        lastRegisteredExpoPushTokenRef.current = expoPushToken;
        setCurrentUser((prev) => {
          const existingTokens = prev.expoPushTokens ?? [];
          if (existingTokens.includes(expoPushToken)) return prev;
          return {
            ...prev,
            expoPushTokens: [...existingTokens, expoPushToken]
          };
        });
      }

      const firebasePushToken = await getFirebasePushToken({
        isExpoGo,
        permissionStatus: notificationPermissionStatus
      });
      if (firebasePushToken && lastRegisteredFirebasePushTokenRef.current !== firebasePushToken) {
        await addFirebasePushTokenToUser(currentUser.id, firebasePushToken);
        lastRegisteredFirebasePushTokenRef.current = firebasePushToken;
        setCurrentUser((prev) => {
          const existingTokens = prev.firebasePushTokens ?? [];
          if (existingTokens.includes(firebasePushToken)) return prev;
          return {
            ...prev,
            firebasePushTokens: [...existingTokens, firebasePushToken]
          };
        });
      }
    } catch {
      // ignore token registration failures; local notifications still work.
    }
  }, [currentUser.id, hydrated, isExpoGo, isLoggedIn, notificationPermissionStatus, setCurrentUser]);

  const pushAppNotification = useCallback(
    (payload: AppNotificationPayload) => {
      const notification = buildStoredNotification({
        type: payload.type,
        senderId: payload.senderId,
        senderName: payload.senderName,
        senderAvatar: payload.senderAvatar,
        content: payload.content,
        data: payload.data
      });

      setNotifications((prev) => mergeNotification(prev, notification));
      if (payload.openCenter) {
        setIsNotificationsOpen(true);
      }
      if (payload.sendPush) {
        const target = typeof payload.data?.target === 'string' ? payload.data.target.trim().toLowerCase() : '';
        const soundKind: NotificationSoundKind =
          payload.soundKind ?? (target === 'chat' || target === 'conversation' ? 'message' : 'ride');

        void scheduleDevicePushNotification(payload.pushTitle ?? notification.senderName, payload.pushBody ?? payload.content, {
          ...(payload.data ?? {}),
          appNotificationId: notification.id,
          type: notification.type,
          senderId: notification.senderId,
          senderName: notification.senderName,
          senderAvatar: notification.senderAvatar,
          content: notification.content
        }, soundKind);
      }
    },
    [scheduleDevicePushNotification, setIsNotificationsOpen, setNotifications]
  );

  useEffect(() => {
    if (isExpoGo) return;
    let active = true;

    const configureHandler = async () => {
      try {
        if (!active) return;
        await configureForegroundNotificationHandler(isExpoGo);
      } catch {
        // ignore handler setup failures
      }
    };

    void configureHandler();

    return () => {
      active = false;
    };
  }, [isExpoGo]);

  useEffect(() => {
    if (!hydrated || !isLoggedIn) return;
    void ensureNotificationPermission();
  }, [ensureNotificationPermission, hydrated, isLoggedIn]);

  useEffect(() => {
    if (!hydrated || !isLoggedIn || notificationPermissionStatus !== 'granted') return;
    void syncDevicePushTokens();
  }, [hydrated, isLoggedIn, notificationPermissionStatus, syncDevicePushTokens]);

  useEffect(() => {
    if (!hydrated || !isLoggedIn || !currentUser.id) return;
    if (!FIREBASE_ENABLED || isExpoGo || notificationPermissionStatus !== 'granted') return;

    return subscribeToFirebasePushTokenRefresh({
      isExpoGo,
      permissionStatus: notificationPermissionStatus,
      onToken: (token) => {
        if (!currentUser.id || lastRegisteredFirebasePushTokenRef.current === token) return;
        lastRegisteredFirebasePushTokenRef.current = token;
        void addFirebasePushTokenToUser(currentUser.id, token);
        setCurrentUser((prev) => {
          const existingTokens = prev.firebasePushTokens ?? [];
          if (existingTokens.includes(token)) return prev;
          return {
            ...prev,
            firebasePushTokens: [...existingTokens, token]
          };
        });
      }
    });
  }, [currentUser.id, hydrated, isExpoGo, isLoggedIn, notificationPermissionStatus, setCurrentUser]);

  useEffect(() => {
    if (!hydrated || !isLoggedIn || locationMode !== 'auto') return;

    let active = true;
    let locationSub: Location.LocationSubscription | null = null;

    const startAutoCityTracking = async () => {
      const detected = await detectAndApplyCurrentLocation(true);
      if (!active) return;
      if (!detected && locationPermissionStatus === 'denied') return;

      const permission = await Location.getForegroundPermissionsAsync();
      if (!active || permission.status !== 'granted') return;

      locationSub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 120000,
          distanceInterval: 1000
        },
        (position: Location.LocationObject) => {
          void updateCityFromCoordinates(position.coords.latitude, position.coords.longitude);
        }
      );
    };

    void startAutoCityTracking();

    return () => {
      active = false;
      locationSub?.remove();
    };
  }, [hydrated, isLoggedIn, locationMode, locationPermissionStatus]);

  const pushSystemNotification = (content: string) => {
    pushAppNotification({
      type: 'message',
      senderId: 'system',
      senderName: 'ThrottleUp',
      senderAvatar: avatarFallback,
      content,
      pushTitle: 'ThrottleUp',
      pushBody: content
    });
  };

  const showActionGuardrail = (message: string) => {
    const now = Date.now();
    if (
      lastGuardrailNotificationRef.current &&
      lastGuardrailNotificationRef.current.message === message &&
      now - lastGuardrailNotificationRef.current.sentAt < 1500
    ) {
      return;
    }

    lastGuardrailNotificationRef.current = { sentAt: now, message };
    pushSystemNotification(message);
    setIsNotificationsOpen(true);
  };

  const handleIncomingDeepLink = useCallback((url: string | null) => {
    if (!url) return;

    const rideId = parseRideJoinIdFromUrl(url);
    if (!rideId) return;

    setPendingRideJoinRequest({ rideId });
  }, []);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleIncomingDeepLink(url);
    });

    void Linking.getInitialURL()
      .then((url) => {
        handleIncomingDeepLink(url);
      })
      .catch(() => undefined);

    return () => {
      subscription.remove();
    };
  }, [handleIncomingDeepLink]);

  const updateLocalRideTrackingSession = useCallback(
    (rideId: string, updater: (session: RideTrackingSession | null) => RideTrackingSession | null) => {
      setLocalRideTrackingSessions((prev) => {
        const current = prev[rideId] ?? null;
        const next = updater(current);
        if (!next) {
          if (!(rideId in prev)) return prev;
          const copy = { ...prev };
          delete copy[rideId];
          return copy;
        }
        return {
          ...prev,
          [rideId]: next
        };
      });
    },
    [setLocalRideTrackingSessions]
  );

  useEffect(() => {
    if (!isRideDetailOpen || !selectedRide || !effectiveRideTrackingSession?.isActive) return;
    if (!selectedRide.currentParticipants.includes(currentUser.id)) return;

    let active = true;
    let locationSub: Location.LocationSubscription | null = null;

    const publishLocation = async (coords: Location.LocationObjectCoords) => {
      if (!active) return;
      if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return;

      const updatedAt = new Date().toISOString();
      const nextLocation = {
        lat: coords.latitude,
        lng: coords.longitude,
        accuracy: typeof coords.accuracy === 'number' ? coords.accuracy : undefined,
        speed: typeof coords.speed === 'number' ? coords.speed : undefined,
        heading: typeof coords.heading === 'number' ? coords.heading : undefined,
        updatedAt
      };

      updateLocalRideTrackingSession(selectedRide.id, (session) => {
        if (!session) return session;

        const existingParticipant = session.participants[currentUser.id];
        return {
          ...session,
          updatedAt,
          participants: {
            ...session.participants,
            [currentUser.id]: {
              userId: currentUser.id,
              checkedIn: existingParticipant?.checkedIn ?? false,
              checkedInAt: existingParticipant?.checkedInAt,
              lastLocation: nextLocation,
              updatedAt
            }
          }
        };
      });

      if (FIREBASE_ENABLED && hasFirebaseAuthSession) {
        void updateRideParticipantLocation({
          rideId: selectedRide.id,
          userId: currentUser.id,
          location: nextLocation
        }).catch((error) => {
          markSyncFailure('rideTracking', error);
        });
      }
    };

    const startTracking = async () => {
      const existingPermission = await Location.getForegroundPermissionsAsync();
      let status = existingPermission.status;

      if (status !== 'granted') {
        const requested = await Location.requestForegroundPermissionsAsync();
        status = requested.status;
      }

      if (!active) return;
      if (status !== 'granted') {
        if (!rideTrackingLocationAlertShownRef.current) {
          rideTrackingLocationAlertShownRef.current = true;
          Alert.alert('Location Permission Needed', 'Enable location permission to share live ride tracking updates.');
        }
        return;
      }

      rideTrackingLocationAlertShownRef.current = false;

      try {
        const currentPosition = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await publishLocation(currentPosition.coords);
      } catch {
        // ignore one-off location read failures and continue watching
      }

      locationSub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 20000,
          distanceInterval: 60
        },
        (position) => {
          void publishLocation(position.coords);
        }
      );
    };

    void startTracking();

    return () => {
      active = false;
      locationSub?.remove();
    };
  }, [currentUser.id, effectiveRideTrackingSession?.isActive, hasFirebaseAuthSession, isRideDetailOpen, markSyncFailure, selectedRide, updateLocalRideTrackingSession]);

  useEffect(() => {
    const latestSos = effectiveRideTrackingSession?.lastSos;
    if (!latestSos) return;

    const previousSosId = lastRideSosByRideRef.current.get(effectiveRideTrackingSession.rideId);
    if (previousSosId === latestSos.id) return;
    lastRideSosByRideRef.current.set(effectiveRideTrackingSession.rideId, latestSos.id);

    if (latestSos.userId === currentUser.id) return;

    const rideTitle = selectedRide?.id === effectiveRideTrackingSession.rideId
      ? selectedRide.title
      : ridesById.get(effectiveRideTrackingSession.rideId)?.title ?? 'an active ride';
    const sender = usersById.get(latestSos.userId);

    pushAppNotification({
      type: 'message',
      senderId: latestSos.userId,
      senderName: sender?.name ?? 'Rider',
      senderAvatar: sender?.avatar ?? avatarFallback,
      content: `triggered SOS on "${rideTitle}"`,
      data: {
        target: 'ride',
        rideId: effectiveRideTrackingSession.rideId,
        userId: latestSos.userId
      },
      openCenter: true,
      sendPush: true,
      pushTitle: 'SOS Alert',
      pushBody: `${sender?.name ?? 'A rider'} triggered SOS on "${rideTitle}".`
    });
  }, [
    currentUser.id,
    effectiveRideTrackingSession,
    pushAppNotification,
    ridesById,
    selectedRide?.id,
    selectedRide?.title,
    usersById
  ]);

  useEffect(() => {
    if (!hydrated || !isLoggedIn) {
      previousRidesForNotificationRef.current = null;
      rideNotificationUserRef.current = null;
      return;
    }

    if (rideNotificationUserRef.current !== currentUser.id) {
      rideNotificationUserRef.current = currentUser.id;
      previousRidesForNotificationRef.current = rides;
      return;
    }

    const previousRides = previousRidesForNotificationRef.current;
    if (!previousRides) {
      previousRidesForNotificationRef.current = rides;
      return;
    }

    const previousById = new Map<string, RidePost>(previousRides.map((ride) => [ride.id, ride]));
    const resolveSender = (userId: string, fallbackName = 'A rider') => {
      const user = usersById.get(userId);
      return {
        senderId: userId,
        senderName: user?.name ?? fallbackName,
        senderAvatar: user?.avatar ?? avatarFallback
      };
    };

    rides.forEach((ride) => {
      const previousRide = previousById.get(ride.id);
      if (!previousRide) return;

      if (ride.creatorId === currentUser.id) {
        const newRequesterIds = ride.requests.filter((id) => id !== currentUser.id && !previousRide.requests.includes(id));
        newRequesterIds.forEach((requesterId) => {
          const requester = resolveSender(requesterId);
          pushAppNotification({
            type: 'ride_request',
            senderId: requester.senderId,
            senderName: requester.senderName,
            senderAvatar: requester.senderAvatar,
            content: `requested to join "${ride.title}"`,
            data: {
              target: 'ride',
              rideId: ride.id,
              requesterId
            },
            sendPush: true,
            pushTitle: 'Request received',
            pushBody: `${requester.senderName} requested to join "${ride.title}".`
          });
        });
      }

      const hadPendingRequest = previousRide.requests.includes(currentUser.id);
      const hasPendingRequest = ride.requests.includes(currentUser.id);
      if (hadPendingRequest && !hasPendingRequest) {
        const creator = usersById.get(ride.creatorId);
        const senderName = creator?.name ?? ride.creatorName;
        const senderAvatar = creator?.avatar ?? ride.creatorAvatar ?? avatarFallback;
        const wasApproved = ride.currentParticipants.includes(currentUser.id);
        pushAppNotification({
          type: wasApproved ? 'ride_joined' : 'ride_request',
          senderId: ride.creatorId,
          senderName,
          senderAvatar,
          content: `${wasApproved ? 'approved' : 'rejected'} your join request for "${ride.title}"`,
          data: {
            target: 'ride',
            rideId: ride.id
          },
          sendPush: true,
          pushTitle: wasApproved ? 'Request approved' : 'Request rejected',
          pushBody: wasApproved
            ? `Your request to join "${ride.title}" was approved.`
            : `Your request to join "${ride.title}" was rejected.`
        });
      }

      const shouldNotifyMemberChanges =
        ride.creatorId === currentUser.id ||
        previousRide.currentParticipants.includes(currentUser.id) ||
        ride.currentParticipants.includes(currentUser.id);
      if (!shouldNotifyMemberChanges) return;

      const newParticipantIds = ride.currentParticipants.filter(
        (participantId) => participantId !== currentUser.id && !previousRide.currentParticipants.includes(participantId)
      );
      newParticipantIds.forEach((participantId) => {
        const participant = resolveSender(participantId);
        pushAppNotification({
          type: 'ride_joined',
          senderId: participant.senderId,
          senderName: participant.senderName,
          senderAvatar: participant.senderAvatar,
          content: `joined "${ride.title}"`,
          data: {
            target: 'ride',
            rideId: ride.id,
            userId: participantId
          },
          sendPush: true,
          pushTitle: 'New member joined',
          pushBody: `${participant.senderName} joined "${ride.title}".`
        });
      });
    });

    previousRidesForNotificationRef.current = rides;
  }, [currentUser.id, hydrated, isLoggedIn, pushAppNotification, rides, usersById]);

  useEffect(() => {
    if (!hydrated || !isLoggedIn) {
      previousGroupsForNotificationRef.current = null;
      groupNotificationUserRef.current = null;
      return;
    }

    if (groupNotificationUserRef.current !== currentUser.id) {
      groupNotificationUserRef.current = currentUser.id;
      previousGroupsForNotificationRef.current = groups;
      return;
    }

    const previousGroups = previousGroupsForNotificationRef.current;
    if (!previousGroups) {
      previousGroupsForNotificationRef.current = groups;
      return;
    }

    const previousById = new Map<string, Group>(previousGroups.map((group) => [group.id, group]));
    const resolveSender = (userId: string, fallbackName = 'A rider') => {
      const user = usersById.get(userId);
      return {
        senderId: userId,
        senderName: user?.name ?? fallbackName,
        senderAvatar: user?.avatar ?? avatarFallback
      };
    };

    groups.forEach((group) => {
      const previousGroup = previousById.get(group.id);
      if (!previousGroup) return;

      if (group.creatorId === currentUser.id) {
        const newRequesterIds = group.joinRequests.filter((id) => id !== currentUser.id && !previousGroup.joinRequests.includes(id));
        newRequesterIds.forEach((requesterId) => {
          const requester = resolveSender(requesterId);
          pushAppNotification({
            type: 'ride_request',
            senderId: requester.senderId,
            senderName: requester.senderName,
            senderAvatar: requester.senderAvatar,
            content: `requested to join group "${group.name}"`,
            data: {
              target: 'group',
              groupId: group.id,
              requesterId
            },
            sendPush: true,
            pushTitle: 'Request received',
            pushBody: `${requester.senderName} requested to join group "${group.name}".`
          });
        });
      }

      const hadPendingRequest = previousGroup.joinRequests.includes(currentUser.id);
      const hasPendingRequest = group.joinRequests.includes(currentUser.id);
      if (hadPendingRequest && !hasPendingRequest) {
        const creator = resolveSender(group.creatorId, 'Group owner');
        const wasApproved = group.members.includes(currentUser.id);
        pushAppNotification({
          type: wasApproved ? 'ride_joined' : 'ride_request',
          senderId: creator.senderId,
          senderName: creator.senderName,
          senderAvatar: creator.senderAvatar,
          content: `${wasApproved ? 'approved' : 'rejected'} your join request for group "${group.name}"`,
          data: {
            target: 'group',
            groupId: group.id
          },
          sendPush: true,
          pushTitle: wasApproved ? 'Request approved' : 'Request rejected',
          pushBody: wasApproved
            ? `Your request to join "${group.name}" was approved.`
            : `Your request to join "${group.name}" was rejected.`
        });
      }

      const shouldNotifyMemberChanges =
        group.creatorId === currentUser.id || previousGroup.members.includes(currentUser.id) || group.members.includes(currentUser.id);
      if (!shouldNotifyMemberChanges) return;

      const newMemberIds = group.members.filter((memberId) => memberId !== currentUser.id && !previousGroup.members.includes(memberId));
      newMemberIds.forEach((memberId) => {
        const member = resolveSender(memberId);
        pushAppNotification({
          type: 'ride_joined',
          senderId: member.senderId,
          senderName: member.senderName,
          senderAvatar: member.senderAvatar,
          content: `joined group "${group.name}"`,
          data: {
            target: 'group',
            groupId: group.id,
            userId: memberId
          },
          sendPush: true,
          pushTitle: 'New member joined',
          pushBody: `${member.senderName} joined group "${group.name}".`
        });
      });
    });

    previousGroupsForNotificationRef.current = groups;
  }, [currentUser.id, hydrated, isLoggedIn, pushAppNotification, groups, usersById]);

  const persistModerationReport = async (report: ModerationReport) => {
    try {
      const existingRaw = await AsyncStorage.getItem(STORAGE_KEYS.moderationReports);
      const existing = safeParse<ModerationReport[]>(existingRaw, []);
      await saveToStorage(STORAGE_KEYS.moderationReports, [report, ...existing].slice(0, 200));
    } catch {
      // ignore persistence failures for local moderation queue
    }
  };

  const submitModerationReport = (payload: { targetType: ModerationReport['targetType']; targetId: string; reason: string; details?: string }) => {
    const report: ModerationReport = {
      id: `report-${Date.now()}-${currentUser.id}`,
      reporterId: currentUser.id,
      targetType: payload.targetType,
      targetId: payload.targetId,
      reason: payload.reason,
      details: payload.details,
      createdAt: new Date().toISOString()
    };

    void persistModerationReport(report);
    if (FIREBASE_ENABLED) {
      void createModerationReportInFirestore(report);
    }

    pushSystemNotification('Report submitted. Our moderation team will review it.');
    setIsNotificationsOpen(true);
  };

  const handleReportRide = (rideId: string) => {
    const targetRide = ridesById.get(rideId);
    if (!targetRide) return;

    Alert.alert('Report ride post?', `Report "${targetRide.title}" as spam or unsafe?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        style: 'destructive',
        onPress: () => {
          submitModerationReport({
            targetType: 'ride',
            targetId: rideId,
            reason: 'Unsafe or spam ride post'
          });
        }
      }
    ]);
  };

  const handleReportHelpPost = (postId: string) => {
    const targetPost = helpPostsById.get(postId);
    if (!targetPost) return;

    Alert.alert('Report help post?', `Report "${targetPost.title}" for abuse, scam, or spam?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        style: 'destructive',
        onPress: () => {
          submitModerationReport({
            targetType: 'helpPost',
            targetId: postId,
            reason: 'Abusive or spam help post'
          });
        }
      }
    ]);
  };

  const handleBlockUser = (userId: string) => {
    if (userId === currentUser.id) return;

    const targetUser = usersById.get(userId) ?? buildInferredUserRecord(userId);
    const targetName = targetUser?.name || 'this rider';

    if (currentUser.blockedUserIds.includes(userId)) {
      pushSystemNotification(`${targetName} is already blocked.`);
      setIsNotificationsOpen(true);
      return;
    }

    Alert.alert('Block rider?', `Block ${targetName}? You will no longer see their posts or chats.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () => {
          setCurrentUser((prev) => ({
            ...prev,
            blockedUserIds: uniqueStrings([...prev.blockedUserIds, userId]),
            friends: prev.friends.filter((id) => id !== userId),
            friendRequests: {
              sent: prev.friendRequests.sent.filter((id) => id !== userId),
              received: prev.friendRequests.received.filter((id) => id !== userId)
            }
          }));

          setUsers((prev) =>
            prev.map((user) => {
              if (user.id !== userId) return user;
              return {
                ...user,
                friends: user.friends.filter((id) => id !== currentUser.id),
                friendRequests: {
                  sent: user.friendRequests.sent.filter((id) => id !== currentUser.id),
                  received: user.friendRequests.received.filter((id) => id !== currentUser.id)
                }
              };
            })
          );

          setConversations((prev) => prev.filter((conversation) => conversation.participantId !== userId));
          setActiveConversation((prev) => (prev?.participantId === userId ? null : prev));
          setNotifications((prev) => prev.filter((notification) => notification.senderId !== userId));

          if (selectedRide?.creatorId === userId) {
            setIsRideDetailOpen(false);
            setSelectedRideId(null);
          }

          if (selectedHelpPost?.creatorId === userId) {
            setIsHelpDetailOpen(false);
            setSelectedHelpPost(null);
          }

          setSelectedUserId(null);
          pushSystemNotification(`${targetName} has been blocked.`);
          setIsNotificationsOpen(true);
        }
      }
    ]);
  };

  const openOrCreateConversation = useCallback(
    (userId: string, options?: OpenConversationOptions) => {
      if (userId === currentUser.id) return;

      const canonicalUser = resolveCanonicalUser(userId);
      const participant = canonicalUser ?? usersById.get(userId) ?? buildInferredUserRecord(userId);
      const participantId = participant?.id ?? userId;
      const participantName = participant?.name || options?.participantName?.trim() || 'Rider';
      const participantAvatar = participant?.avatar || options?.participantAvatar || avatarFallback;

      if (blockedUserIds.has(userId) || blockedUserIds.has(participantId)) {
        pushSystemNotification('This rider is blocked. Unblock them to start a chat.');
        setIsNotificationsOpen(true);
        return;
      }

      const preferredConversationId = options?.conversationId?.trim() || '';
      setConversations((prev) => {
        const normalizedPrev = normalizeConversationsSnapshot(prev);

        const existingByIdIndex = preferredConversationId
          ? normalizedPrev.findIndex((conversation) => conversation.id === preferredConversationId)
          : -1;
        const existingByParticipantIndex = normalizedPrev.findIndex((conversation) => {
          const canonicalParticipantId = resolveCanonicalUser(conversation.participantId)?.id ?? conversation.participantId;
          return canonicalParticipantId === participantId || conversation.participantId === userId || conversation.participantId === participantId;
        });
        const existingIndex = existingByIdIndex >= 0 ? existingByIdIndex : existingByParticipantIndex;
        const targetConversationId = preferredConversationId
          || (existingIndex >= 0 ? normalizedPrev[existingIndex].id : buildDirectConversationId(currentUser.id, participantId));

        if (existingIndex >= 0) {
          const existingConversation = normalizedPrev[existingIndex];
          const openedConversation: Conversation = {
            ...existingConversation,
            id: targetConversationId,
            participantId,
            participantName,
            participantAvatar,
            unreadCount: 0
          };
          setActiveConversation(openedConversation);

          const remaining = normalizedPrev.filter((_, index) => index !== existingIndex).filter((conversation) => {
            const canonicalParticipantId = resolveCanonicalUser(conversation.participantId)?.id ?? conversation.participantId;
            return canonicalParticipantId !== participantId;
          });
          return [openedConversation, ...remaining];
        }

        const newConversation: Conversation = {
          id: targetConversationId,
          participantId,
          participantName,
          participantAvatar,
          lastMessage: 'You are now connected! Say hi.',
          timestamp: 'Now',
          unreadCount: 0,
          messages: []
        };

        setActiveConversation(newConversation);
        return [newConversation, ...normalizedPrev];
      });

      setSelectedUserId(null);
      setActiveTab('chats');
    },
    [
      blockedUserIds,
      buildInferredUserRecord,
      currentUser.id,
      pushSystemNotification,
      resolveCanonicalUser,
      setActiveTab,
      setIsNotificationsOpen,
      setSelectedUserId,
      usersById
    ]
  );

  const upsertConversationFromChatNotification = useCallback(
    (incoming: Notification) => {
      const payload = incoming.data ?? {};
      const target = typeof payload.target === 'string' ? payload.target.trim().toLowerCase() : '';
      const type = typeof payload.type === 'string' ? payload.type.trim().toLowerCase() : '';
      const conversationId = typeof payload.conversationId === 'string' ? payload.conversationId.trim() : '';
      const senderIdCandidates = [payload.senderId, payload.userId, payload.requesterId]
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean);
      const senderId = senderIdCandidates[0] ?? '';
      const isDirectChatNotification =
        target === 'chat' || target === 'conversation' || type === 'chat_message' || Boolean(conversationId);

      if (!isDirectChatNotification || !senderId) return;
      if (senderId === currentUser.id) return;

      const sender = resolveCanonicalUser(senderId) ?? usersById.get(senderId) ?? buildInferredUserRecord(senderId);
      const senderIdResolved = sender?.id ?? senderId;
      const senderName = sender?.name || incoming.senderName?.trim() || 'Rider';
      const senderAvatar = sender?.avatar || incoming.senderAvatar || avatarFallback;
      if (blockedUserIds.has(senderId) || blockedUserIds.has(senderIdResolved)) return;

      const messagePreview = incoming.content.trim();
      const targetConversationId = conversationId || buildDirectConversationId(currentUser.id, senderIdResolved);
      const activeParticipantId = activeConversation
        ? (resolveCanonicalUser(activeConversation.participantId)?.id ?? activeConversation.participantId)
        : null;
      const isActiveThread = activeConversation?.id === targetConversationId || activeParticipantId === senderIdResolved;

      setConversations((prev) => {
        const normalizedPrev = normalizeConversationsSnapshot(prev);
        const existingByIdIndex = normalizedPrev.findIndex((conversation) => conversation.id === targetConversationId);
        const existingByParticipantIndex = normalizedPrev.findIndex((conversation) => {
          const canonicalParticipantId = resolveCanonicalUser(conversation.participantId)?.id ?? conversation.participantId;
          return canonicalParticipantId === senderIdResolved;
        });
        const existingIndex = existingByIdIndex >= 0 ? existingByIdIndex : existingByParticipantIndex;
        const nextUnreadCount = isActiveThread ? 0 : 1;

        if (existingIndex >= 0) {
          const existingConversation = normalizedPrev[existingIndex];
          const updatedConversation: Conversation = {
            ...existingConversation,
            id: targetConversationId,
            participantId: senderIdResolved,
            participantName: senderName,
            participantAvatar: senderAvatar,
            lastMessage: messagePreview || existingConversation.lastMessage,
            timestamp: formatConversationPreviewTimestamp(incoming.timestamp),
            unreadCount: isActiveThread
              ? 0
              : resolveConversationUnreadCount(existingConversation) + 1
          };

          const remaining = normalizedPrev.filter((_, index) => index !== existingIndex).filter((conversation) => {
            const canonicalParticipantId = resolveCanonicalUser(conversation.participantId)?.id ?? conversation.participantId;
            return canonicalParticipantId !== senderIdResolved;
          });
          return [updatedConversation, ...remaining];
        }

        const newConversation: Conversation = {
          id: targetConversationId,
          participantId: senderIdResolved,
          participantName: senderName,
          participantAvatar: senderAvatar,
          lastMessage: messagePreview || 'New message',
          timestamp: formatConversationPreviewTimestamp(incoming.timestamp),
          unreadCount: nextUnreadCount,
          messages: []
        };

        return [newConversation, ...normalizedPrev];
      });
    },
    [
      activeConversation,
      blockedUserIds,
      buildInferredUserRecord,
      currentUser.id,
      resolveCanonicalUser,
      usersById
    ]
  );

  const handleNotificationNavigation = useCallback(
    (data?: Record<string, unknown>) => {
      const payload = data ?? {};
      const target = typeof payload.target === 'string' ? payload.target.trim().toLowerCase() : '';
      const type = typeof payload.type === 'string' ? payload.type.trim().toLowerCase() : '';
      const rideId = typeof payload.rideId === 'string' ? payload.rideId.trim() : '';
      const helpPostId = typeof payload.helpPostId === 'string' ? payload.helpPostId.trim() : '';
      const conversationId = typeof payload.conversationId === 'string' ? payload.conversationId.trim() : '';
      const groupId = typeof payload.groupId === 'string' ? payload.groupId.trim() : '';
      const senderName = typeof payload.senderName === 'string' ? payload.senderName.trim() : '';
      const senderAvatar = typeof payload.senderAvatar === 'string' ? payload.senderAvatar.trim() : '';
      const userIdCandidates = [payload.userId, payload.senderId, payload.requesterId]
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean);
      const userId = userIdCandidates[0] ?? '';

      if ((target === 'chat' || target === 'conversation' || type === 'chat_message' || Boolean(conversationId)) && userId) {
        if (blockedUserIds.has(userId)) {
          pushSystemNotification('This rider is blocked.');
          setIsNotificationsOpen(true);
          return;
        }
        openOrCreateConversation(userId, {
          conversationId,
          participantName: senderName || undefined,
          participantAvatar: senderAvatar || undefined
        });
        return;
      }

      if (rideId) {
        const ride = ridesById.get(rideId);
        if (!ride) {
          setIsNotificationsOpen(true);
          return;
        }
        if (blockedUserIds.has(ride.creatorId)) {
          pushSystemNotification('This ride is from a blocked rider.');
          setIsNotificationsOpen(true);
          return;
        }
        setActiveTab('feed');
        setFeedFilter('rides');
        setSelectedRideId(rideId);
        setIsRideDetailOpen(true);
        return;
      }

      if (helpPostId) {
        const post = helpPostsById.get(helpPostId);
        if (!post) {
          setIsNotificationsOpen(true);
          return;
        }
        if (blockedUserIds.has(post.creatorId)) {
          pushSystemNotification('This help post is from a blocked rider.');
          setIsNotificationsOpen(true);
          return;
        }
        setActiveTab('feed');
        setFeedFilter('help');
        setSelectedHelpPost(post);
        setIsHelpDetailOpen(true);
        return;
      }

      if (groupId) {
        if (!groupsById.has(groupId)) {
          setIsNotificationsOpen(true);
          return;
        }
        setActiveTab('group');
        if (target === 'group_chat' || type === 'group_chat_message') {
          setSelectedGroupId(null);
          setActiveGroupChatId(groupId);
          return;
        }
        setSelectedGroupId(groupId);
        return;
      }

      setIsNotificationsOpen(true);
    },
    [
      blockedUserIds,
      helpPostsById,
      openOrCreateConversation,
      pushSystemNotification,
      ridesById,
      setActiveGroupChatId,
      setFeedFilter,
      setIsHelpDetailOpen,
      setIsNotificationsOpen,
      setIsRideDetailOpen,
      setSelectedHelpPost,
      setSelectedRideId,
      setSelectedGroupId,
      setActiveTab,
      groupsById
    ]
  );

  useEffect(() => {
    if (isExpoGo || !hydrated || !isLoggedIn) return;

    let active = true;
    let cleanup: () => void = () => undefined;

    const handleIncomingNotification = (incoming: Awaited<ReturnType<typeof buildStoredNotificationFromExpo>>) => {
      if (!incoming) return;
      let isNewNotification = false;
      setNotifications((prev) => {
        isNewNotification = !prev.some((notification) => notification.id === incoming.id);
        return mergeNotification(prev, incoming);
      });
      if (isNewNotification) {
        upsertConversationFromChatNotification(incoming);
      }
    };

    const handleNotificationResponse = (
      response: import('expo-notifications').NotificationResponse,
      markRead = true
    ) => {
      const responseKey = getNotificationResponseKey(response);
      if (handledNotificationResponseIdsRef.current.has(responseKey)) return;
      handledNotificationResponseIdsRef.current.add(responseKey);

      const incoming = buildStoredNotificationFromExpo(response.notification);
      if (incoming) {
        handleIncomingNotification(markRead ? { ...incoming, read: true } : incoming);
      }

      const responseData = response.notification.request.content.data;
      const fallbackData =
        responseData && typeof responseData === 'object' && !Array.isArray(responseData)
          ? (responseData as Record<string, unknown>)
          : undefined;
      handleNotificationNavigation(incoming?.data ?? fallbackData);
    };

    const subscribe = async () => {
      try {
        const subscription = await subscribeToNotificationEvents({
          onReceived: (notification) => {
            handleIncomingNotification(buildStoredNotificationFromExpo(notification));
          },
          onResponse: (response) => {
            handleNotificationResponse(response);
          }
        });

        if (!active) {
          subscription.cleanup();
          return;
        }

        cleanup = subscription.cleanup;

        if (subscription.lastResponse) {
          handleNotificationResponse(subscription.lastResponse);
        }
      } catch {
        // ignore listener registration failures
      }
    };

    void subscribe();

    return () => {
      active = false;
      cleanup();
    };
  }, [handleNotificationNavigation, hydrated, isExpoGo, isLoggedIn, setNotifications, upsertConversationFromChatNotification]);

  const handleViewProfile = (userId: string) => {
    const canonicalUser = resolveCanonicalUser(userId);
    const profileId = canonicalUser?.id ?? userId;
    if (blockedUserIds.has(profileId) || blockedUserIds.has(userId)) {
      pushSystemNotification('This rider is blocked.');
      setIsNotificationsOpen(true);
      return;
    }
    setSelectedUserId(profileId);
  };

  const handleUpdateRide = (rideId: string, updates: Partial<RidePost>) => {
    setRides((prev) => {
      let updatedRide: RidePost | null = null;
      const next = prev.map((ride) => {
        if (ride.id !== rideId) return ride;
        updatedRide = { ...ride, ...updates };
        return updatedRide;
      });

      if (updatedRide && FIREBASE_ENABLED) {
        const rideToSync = updatedRide;
        runRideMutationSync(() => upsertRideInFirestore(rideToSync));
      }

      return next;
    });
  };

  const handleCancelRide = (rideId: string) => {
    const rideToCancel = ridesById.get(rideId);
    if (!rideToCancel) return;

    const cancelNotifications: Notification[] = rideToCancel.currentParticipants
      .filter((participantId) => participantId !== currentUser.id)
      .map((participantId) => ({
        id: `cancel-notif-${rideId}-${participantId}-${Date.now()}`,
        type: 'message',
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderAvatar: currentUser.avatar,
        content: `has cancelled the ride: "${rideToCancel.title}"`,
        timestamp: new Date().toISOString(),
        read: false
      }));

    if (cancelNotifications.length > 0) {
      setNotifications((prev) => [...cancelNotifications, ...prev]);
    }

    setRides((prev) => prev.filter((ride) => ride.id !== rideId));
    updateLocalRideTrackingSession(rideId, () => null);
    if (selectedRideTrackingSession?.rideId === rideId) {
      setSelectedRideTrackingSession(null);
    }
    void (async () => {
      const syncSucceeded = await runRideMutationSyncWithResult(() => deleteRideInFirestore(rideId));
      if (!syncSucceeded) return;
      void triggerRideCancelledNotification(
        rideId,
        rideToCancel.title,
        currentUser.id,
        currentUser.name,
        rideToCancel.currentParticipants
      ).catch(() => undefined);
    })();
    setIsRideDetailOpen(false);
    setSelectedRideId(null);
  };

  const handleStartRideTracking = async (rideId: string) => {
    const rideToTrack = ridesById.get(rideId);
    if (!rideToTrack) return;
    if (rideToTrack.creatorId !== currentUser.id) {
      showActionGuardrail('Only the ride organizer can start live tracking.');
      return;
    }

    const now = new Date().toISOString();
    const participantIds = uniqueStrings(
      (rideToTrack.currentParticipants.length > 0 ? rideToTrack.currentParticipants : [rideToTrack.creatorId]).filter(Boolean)
    );
    const previousSession = localRideTrackingSessions[rideId] ?? effectiveRideTrackingSession ?? null;
    const participants: RideTrackingSession['participants'] = {};
    participantIds.forEach((participantId) => {
      const previousParticipant = previousSession?.participants[participantId];
      const checkedIn = participantId === currentUser.id || previousParticipant?.checkedIn === true;
      participants[participantId] = {
        userId: participantId,
        checkedIn,
        checkedInAt: checkedIn ? previousParticipant?.checkedInAt ?? now : undefined,
        lastLocation: previousParticipant?.lastLocation,
        updatedAt: now
      };
    });

    const nextSession: RideTrackingSession = {
      rideId,
      isActive: true,
      startedAt: now,
      startedByUserId: currentUser.id,
      updatedAt: now,
      participants,
      lastSos: undefined
    };

    updateLocalRideTrackingSession(rideId, () => nextSession);
    setSelectedRideTrackingSession(nextSession);

    setIsStartingRideTracking(true);
    try {
      if (FIREBASE_ENABLED) {
        const hasAuthSession = await ensureFirebaseAuthSession();
        if (!hasAuthSession) {
          throw new Error('Live tracking sync requires an authenticated Firebase session. Please log in again.');
        }
        startSync('rideTracking');
        await startRideTrackingSession(rideId, {
          startedByUserId: currentUser.id,
          participantIds,
          startedAt: now
        });
        markSyncSuccess('rideTracking');
      }
      pushSystemNotification(`Live tracking started for "${rideToTrack.title}".`);
    } catch (error) {
      markSyncFailure('rideTracking', error);
      showActionGuardrail('Unable to start live tracking right now. Please try again.');
    } finally {
      setIsStartingRideTracking(false);
    }
  };

  const handleStopRideTracking = async (rideId: string) => {
    const rideToTrack = ridesById.get(rideId);
    if (!rideToTrack) return;
    if (rideToTrack.creatorId !== currentUser.id) {
      showActionGuardrail('Only the ride organizer can stop live tracking.');
      return;
    }

    const now = new Date().toISOString();
    updateLocalRideTrackingSession(rideId, (session) => {
      if (!session) return session;
      return {
        ...session,
        isActive: false,
        endedAt: now,
        endedByUserId: currentUser.id,
        updatedAt: now
      };
    });

    setIsStoppingRideTracking(true);
    try {
      if (FIREBASE_ENABLED) {
        const hasAuthSession = await ensureFirebaseAuthSession();
        if (!hasAuthSession) {
          throw new Error('Live tracking sync requires an authenticated Firebase session. Please log in again.');
        }
        startSync('rideTracking');
        await stopRideTrackingSession(rideId, currentUser.id);
        markSyncSuccess('rideTracking');
      }
      pushSystemNotification(`Live tracking stopped for "${rideToTrack.title}".`);
    } catch (error) {
      markSyncFailure('rideTracking', error);
      showActionGuardrail('Unable to stop live tracking right now. Please try again.');
    } finally {
      setIsStoppingRideTracking(false);
    }
  };

  const handleToggleRideCheckIn = (rideId: string, checkedIn: boolean) => {
    void (async () => {
      const rideToTrack = ridesById.get(rideId);
      if (!rideToTrack) return;
      if (!rideToTrack.currentParticipants.includes(currentUser.id)) {
        showActionGuardrail('Join this ride first to use check-in.');
        return;
      }

      const session =
        (selectedRideTrackingSession?.rideId === rideId ? selectedRideTrackingSession : localRideTrackingSessions[rideId]) ?? null;
      if (!session?.isActive) {
        showActionGuardrail('Live tracking is not active for this ride yet.');
        return;
      }

      if (checkedIn) {
        const startPoint = getRideStartPoint(rideToTrack);
        if (!startPoint) {
          showActionGuardrail('Organizer needs to set a route start point before geofenced check-in can work.');
          return;
        }

        setIsUpdatingRideCheckIn(true);
        try {
          const existingPermission = await Location.getForegroundPermissionsAsync();
          let status = existingPermission.status;
          if (status !== 'granted') {
            const requestedPermission = await Location.requestForegroundPermissionsAsync();
            status = requestedPermission.status;
          }

          if (status !== 'granted') {
            showActionGuardrail('Location permission is required to check in at the ride start point.');
            return;
          }

          const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (!Number.isFinite(position.coords.latitude) || !Number.isFinite(position.coords.longitude)) {
            showActionGuardrail('Unable to verify your location for check-in right now. Try again.');
            return;
          }

          const distanceFromStartMeters = calculateDistanceMeters(
            { lat: position.coords.latitude, lng: position.coords.longitude },
            { lat: startPoint.lat, lng: startPoint.lng }
          );

          if (distanceFromStartMeters > RIDE_CHECK_IN_GEOFENCE_RADIUS_METERS) {
            const startLabel = startPoint.label?.trim() || 'the ride start point';
            showActionGuardrail(
              `Move closer to ${startLabel} to check in. You are ${formatDistanceMeters(distanceFromStartMeters)} away (within ${RIDE_CHECK_IN_GEOFENCE_RADIUS_METERS} m required).`
            );
            return;
          }
        } catch {
          showActionGuardrail('Unable to verify your location for check-in right now. Try again.');
          return;
        } finally {
          setIsUpdatingRideCheckIn(false);
        }
      }

      const now = new Date().toISOString();
      updateLocalRideTrackingSession(rideId, (current) => {
        if (!current) return current;
        const previousParticipant = current.participants[currentUser.id];
        return {
          ...current,
          updatedAt: now,
          participants: {
            ...current.participants,
            [currentUser.id]: {
              userId: currentUser.id,
              checkedIn,
              checkedInAt: checkedIn ? previousParticipant?.checkedInAt ?? now : undefined,
              lastLocation: previousParticipant?.lastLocation,
              updatedAt: now
            }
          }
        };
      });

      if (FIREBASE_ENABLED) {
        runRideTrackingMutationSync(() =>
          updateRideParticipantCheckIn({
            rideId,
            userId: currentUser.id,
            checkedIn
          })
        );
      }
    })();
  };

  const handleSendRideSos = async (rideId: string) => {
    const rideToTrack = ridesById.get(rideId);
    if (!rideToTrack) return;
    if (!rideToTrack.currentParticipants.includes(currentUser.id)) {
      showActionGuardrail('Join this ride first to send SOS alerts.');
      return;
    }

    const session = (selectedRideTrackingSession?.rideId === rideId ? selectedRideTrackingSession : localRideTrackingSessions[rideId]) ?? null;
    if (!session?.isActive) {
      showActionGuardrail('Live tracking is not active for this ride yet.');
      return;
    }

    setIsSendingRideSos(true);
    try {
      let locationPayload: { lat: number; lng: number; accuracy?: number; speed?: number; heading?: number; updatedAt?: string } | undefined;
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status === 'granted') {
          const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (Number.isFinite(position.coords.latitude) && Number.isFinite(position.coords.longitude)) {
            locationPayload = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: typeof position.coords.accuracy === 'number' ? position.coords.accuracy : undefined,
              speed: typeof position.coords.speed === 'number' ? position.coords.speed : undefined,
              heading: typeof position.coords.heading === 'number' ? position.coords.heading : undefined,
              updatedAt: new Date().toISOString()
            };
          }
        }
      } catch {
        // location is best effort for SOS payload
      }

      const createdAt = new Date().toISOString();
      const message = `SOS from ${currentUser.name}. Immediate assistance needed.`;
      updateLocalRideTrackingSession(rideId, (current) => {
        if (!current) return current;
        return {
          ...current,
          updatedAt: createdAt,
          lastSos: {
            id: `sos-${Date.now()}-${currentUser.id}`,
            userId: currentUser.id,
            message,
            createdAt,
            location: locationPayload
              ? {
                lat: locationPayload.lat,
                lng: locationPayload.lng,
                accuracy: locationPayload.accuracy,
                speed: locationPayload.speed,
                heading: locationPayload.heading,
                updatedAt: locationPayload.updatedAt ?? createdAt
              }
              : undefined
          }
        };
      });

      if (FIREBASE_ENABLED) {
        const hasAuthSession = await ensureFirebaseAuthSession();
        if (!hasAuthSession) {
          throw new Error('Live tracking sync requires an authenticated Firebase session. Please log in again.');
        }
        startSync('rideTracking');
        await sendRideSosSignal({
          rideId,
          userId: currentUser.id,
          message,
          location: locationPayload
        });
        markSyncSuccess('rideTracking');
      }

      pushAppNotification({
        type: 'message',
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderAvatar: currentUser.avatar,
        content: `SOS sent for "${rideToTrack.title}"`,
        data: {
          target: 'ride',
          rideId
        },
        openCenter: true,
        sendPush: true,
        pushTitle: 'SOS Sent',
        pushBody: `Your SOS alert was sent for "${rideToTrack.title}".`
      });

      const emergencyContacts = dedupeEmergencyContactNumbers([
        ...(currentUser.sosContacts ?? []),
        currentUser.sosNumber ?? ''
      ]);
      if (emergencyContacts.length === 0) {
        Alert.alert(
          'SOS Alert Sent',
          `Alert delivered for "${rideToTrack.title}". Add emergency contacts in your profile to enable one-tap call and SMS escalation.`
        );
        return;
      }

      const openCallDialer = (phoneNumber: string) => {
        void Linking.openURL(`tel:${phoneNumber}`).catch(() => {
          showActionGuardrail('Unable to place a call right now.');
        });
      };

      const promptCallContact = () => {
        if (emergencyContacts.length === 1) {
          openCallDialer(emergencyContacts[0]);
          return;
        }

        Alert.alert(
          'Call Emergency Contact',
          'Choose which contact to call now.',
          [
            ...emergencyContacts.map((phoneNumber, index) => ({
              text: `Contact ${index + 1} (${formatEmergencyContactLabel(phoneNumber)})`,
              onPress: () => {
                openCallDialer(phoneNumber);
              }
            })),
            { text: 'Cancel', style: 'cancel' as const }
          ]
        );
      };

      const smsLines = [
        `SOS from ${currentUser.name}.`,
        `Ride: ${rideToTrack.title}.`,
        locationPayload
          ? `My location: https://maps.google.com/?q=${locationPayload.lat},${locationPayload.lng}`
          : 'Location unavailable in this SOS payload.',
        `Timestamp: ${new Date(createdAt).toLocaleString()}`
      ];
      const smsBody = smsLines.join(' ');

      const smsActionLabel = locationPayload ? 'Send Location SMS' : 'Send SMS';
      const openSmsComposer = () => {
        const smsUrl = buildEmergencySmsDeeplink(emergencyContacts, smsBody);
        void Linking.openURL(smsUrl).catch(() => {
          showActionGuardrail('Unable to open SMS right now.');
        });
      };

      Alert.alert(
        'SOS Alert Sent',
        `Alert delivered for "${rideToTrack.title}". Choose an escalation action.`,
        [
          { text: 'Done', style: 'cancel' },
          { text: 'Call Contact', onPress: promptCallContact },
          { text: smsActionLabel, onPress: openSmsComposer }
        ]
      );
    } catch (error) {
      markSyncFailure('rideTracking', error);
      showActionGuardrail('Unable to send SOS right now. Please try again.');
    } finally {
      setIsSendingRideSos(false);
    }
  };

  const handleRequestToJoinRide = (rideId: string) => {
    let analyticsJoinMode: 'joined' | 'requested' | null = null;
    let shouldShowRideClosedAlert = false;
    let shouldShowRideFullAlert = false;
    let requestFanoutPayload: { rideId: string; rideTitle: string; creatorId: string } | null = null;
    let rideJoinStateToSync: { rideId: string; currentParticipants: string[]; requests: string[] } | null = null;
    setRides((prev) => {
      const next = prev.map((ride) => {
        if (ride.id !== rideId) return ride;
        if (blockedUserIds.has(ride.creatorId)) return ride;
        if (ride.currentParticipants.includes(currentUser.id) || ride.requests.includes(currentUser.id)) return ride;
        if (getRideLifecycleStatus(ride).joinClosed) {
          shouldShowRideClosedAlert = true;
          return ride;
        }

        if (ride.joinPermission === 'anyone') {
          if (ride.currentParticipants.length >= ride.maxParticipants) {
            shouldShowRideFullAlert = true;
            return ride;
          }
          const updatedRide = { ...ride, currentParticipants: [...ride.currentParticipants, currentUser.id] };
          rideJoinStateToSync = {
            rideId: updatedRide.id,
            currentParticipants: updatedRide.currentParticipants,
            requests: updatedRide.requests
          };
          analyticsJoinMode = 'joined';
          return updatedRide;
        }

        const updatedRide = { ...ride, requests: [...ride.requests, currentUser.id] };
        rideJoinStateToSync = {
          rideId: updatedRide.id,
          currentParticipants: updatedRide.currentParticipants,
          requests: updatedRide.requests
        };
        analyticsJoinMode = 'requested';
        requestFanoutPayload = {
          rideId: updatedRide.id,
          rideTitle: updatedRide.title,
          creatorId: updatedRide.creatorId
        };
        return updatedRide;
      });

      if (analyticsJoinMode) {
        void logAnalyticsEvent('join_ride', {
          ride_id: rideId,
          join_mode: analyticsJoinMode
        });
      }

      return next;
    });

    if (shouldShowRideClosedAlert) {
      showActionGuardrail('Ride has already started. Joining is closed.');
    }

    if (shouldShowRideFullAlert) {
      showActionGuardrail('Ride is full right now.');
    }

    const fanoutPayload = requestFanoutPayload as { rideId: string; rideTitle: string; creatorId: string } | null;
    const rideStateToSync = rideJoinStateToSync as { rideId: string; currentParticipants: string[]; requests: string[] } | null;
    void (async () => {
      if (!rideStateToSync) return;
      const syncSucceeded = await runRideMutationSyncWithResult(() =>
        updateRideJoinStateInFirestore(rideStateToSync.rideId, {
          currentParticipants: rideStateToSync.currentParticipants,
          requests: rideStateToSync.requests
        })
      );
      if (!syncSucceeded || !fanoutPayload) return;
      void triggerRideRequestOwnerNotification({
        rideId: fanoutPayload.rideId,
        rideTitle: fanoutPayload.rideTitle,
        requesterId: currentUser.id,
        requesterName: currentUser.name,
        ownerId: fanoutPayload.creatorId
      }).catch(() => undefined);
    })();
  };

  useEffect(() => {
    if (!pendingRideJoinRequest) return;
    if (!hydrated || !isLoggedIn) return;

    const ride = ridesById.get(pendingRideJoinRequest.rideId);
    if (!ride) {
      if (syncState.rides.isSyncing) return;
      setPendingRideJoinRequest(null);
      showActionGuardrail('This ride invite is no longer available.');
      return;
    }

    if (blockedUserIds.has(ride.creatorId)) {
      setPendingRideJoinRequest(null);
      showActionGuardrail('This ride is from a blocked rider.');
      return;
    }

    setActiveTab('feed');
    setFeedFilter('rides');
    setSelectedRideId(ride.id);
    setIsRideDetailOpen(true);

    const isCreator = ride.creatorId === currentUser.id;
    const isJoined = ride.currentParticipants.includes(currentUser.id);
    const hasPendingRequest = ride.requests.includes(currentUser.id);
    const isRideClosed = getRideLifecycleStatus(ride).joinClosed;
    if (isCreator || isJoined || hasPendingRequest) {
      setPendingRideJoinRequest(null);
      return;
    }

    if (isRideClosed) {
      setPendingRideJoinRequest(null);
      showActionGuardrail('This ride has already started. Joining is closed.');
      return;
    }

    const needsJoinApproval = ride.joinPermission !== 'anyone';
    const sharesGroupWithCreator = groups.some(
      (group) => group.members.includes(currentUser.id) && group.members.includes(ride.creatorId)
    );

    if (needsJoinApproval && !sharesGroupWithCreator) {
      setPendingRideJoinRequest(null);
      Alert.alert(
        'Request to join ride?',
        `You are not in ${ride.creatorName}'s group. Send a join request for "${ride.title}"?`,
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Send Request',
            onPress: () => {
              handleRequestToJoinRide(ride.id);
              pushSystemNotification(`Join request sent for "${ride.title}".`);
              setIsNotificationsOpen(true);
            }
          }
        ]
      );
      return;
    }

    setPendingRideJoinRequest(null);
    handleRequestToJoinRide(ride.id);
    pushSystemNotification(
      needsJoinApproval ? `Join request sent for "${ride.title}".` : `You joined "${ride.title}".`
    );
    setIsNotificationsOpen(true);
  }, [
    blockedUserIds,
    currentUser.id,
    handleRequestToJoinRide,
    hydrated,
    isLoggedIn,
    pendingRideJoinRequest,
    pushSystemNotification,
    ridesById,
    setActiveTab,
    setFeedFilter,
    setIsRideDetailOpen,
    setIsNotificationsOpen,
    setPendingRideJoinRequest,
    setSelectedRideId,
    showActionGuardrail,
    groups,
    syncState.rides.isSyncing
  ]);

  const handleAcceptRideRequest = (rideId: string, userId: string) => {
    let shouldShowRideClosedAlert = false;
    let rideJoinStateToSync: { rideId: string; currentParticipants: string[]; requests: string[] } | null = null;
    setRides((prev) => {
      const next = prev.map((ride) => {
        if (ride.id !== rideId) return ride;
        const canonicalUserId = resolveCanonicalUser(userId)?.id ?? userId;
        const requestAliases = uniqueStrings([userId, canonicalUserId]);
        if (getRideLifecycleStatus(ride).joinClosed) {
          shouldShowRideClosedAlert = true;
          return ride;
        }

        if (ride.currentParticipants.includes(canonicalUserId) || ride.currentParticipants.includes(userId)) {
          const updatedRide = { ...ride, requests: ride.requests.filter((id) => !requestAliases.includes(id)) };
          rideJoinStateToSync = {
            rideId: updatedRide.id,
            currentParticipants: updatedRide.currentParticipants,
            requests: updatedRide.requests
          };
          return updatedRide;
        }

        if (ride.currentParticipants.length >= ride.maxParticipants) {
          return ride;
        }

        const updatedRide = {
          ...ride,
          currentParticipants: uniqueStrings([...ride.currentParticipants, canonicalUserId]),
          requests: ride.requests.filter((id) => !requestAliases.includes(id))
        };
        rideJoinStateToSync = {
          rideId: updatedRide.id,
          currentParticipants: updatedRide.currentParticipants,
          requests: updatedRide.requests
        };
        return updatedRide;
      });

      if (rideJoinStateToSync && FIREBASE_ENABLED) {
        const rideToSync = rideJoinStateToSync;
        runRideMutationSync(() =>
          updateRideJoinStateInFirestore(rideToSync.rideId, {
            currentParticipants: rideToSync.currentParticipants,
            requests: rideToSync.requests
          })
        );
      }

      return next;
    });

    if (shouldShowRideClosedAlert) {
      showActionGuardrail('Ride has already started. New join approvals are disabled.');
    }
  };

  const handleRejectRideRequest = (rideId: string, userId: string) => {
    let rideJoinStateToSync: { rideId: string; currentParticipants: string[]; requests: string[] } | null = null;
    setRides((prev) => {
      const next = prev.map((ride) => {
        if (ride.id !== rideId) return ride;
        const updatedRide = { ...ride, requests: ride.requests.filter((id) => id !== userId) };
        rideJoinStateToSync = {
          rideId: updatedRide.id,
          currentParticipants: updatedRide.currentParticipants,
          requests: updatedRide.requests
        };
        return updatedRide;
      });

      if (rideJoinStateToSync && FIREBASE_ENABLED) {
        const rideToSync = rideJoinStateToSync;
        runRideMutationSync(() =>
          updateRideJoinStateInFirestore(rideToSync.rideId, {
            currentParticipants: rideToSync.currentParticipants,
            requests: rideToSync.requests
          })
        );
      }

      return next;
    });
  };

  const handleLeaveRide = (rideId: string) => {
    let rideJoinStateToSync: {
      rideId: string;
      currentParticipants: string[];
      requests: string[];
      paymentStatusByUserId?: Record<string, RidePaymentStatus>;
    } | null = null;
    let didLeaveRide = false;
    let leftRideTitle = '';
    setRides((prev) => {
      const next = prev.map((ride) => {
        if (ride.id !== rideId) return ride;
        if (ride.creatorId === currentUser.id) return ride;
        if (!ride.currentParticipants.includes(currentUser.id)) return ride;

        const paymentStatusByUserId = ride.paymentStatusByUserId ? { ...ride.paymentStatusByUserId } : undefined;
        if (paymentStatusByUserId) {
          delete paymentStatusByUserId[currentUser.id];
        }

        const updatedPaymentStatus =
          paymentStatusByUserId && Object.keys(paymentStatusByUserId).length > 0 ? paymentStatusByUserId : undefined;
        const updatedRide: RidePost = {
          ...ride,
          currentParticipants: ride.currentParticipants.filter((id) => id !== currentUser.id),
          requests: ride.requests.filter((id) => id !== currentUser.id),
          paymentStatusByUserId: updatedPaymentStatus
        };
        rideJoinStateToSync = {
          rideId: updatedRide.id,
          currentParticipants: updatedRide.currentParticipants,
          requests: updatedRide.requests,
          ...(ride.paymentStatusByUserId !== undefined && {
            paymentStatusByUserId: updatedPaymentStatus ?? {}
          })
        };
        didLeaveRide = true;
        leftRideTitle = updatedRide.title;
        return updatedRide;
      });

      if (rideJoinStateToSync && FIREBASE_ENABLED) {
        const rideToSync = rideJoinStateToSync;
        runRideMutationSync(() =>
          updateRideJoinStateInFirestore(rideToSync.rideId, {
            currentParticipants: rideToSync.currentParticipants,
            requests: rideToSync.requests,
            ...(rideToSync.paymentStatusByUserId !== undefined && {
              paymentStatusByUserId: rideToSync.paymentStatusByUserId
            })
          })
        );
      }

      return next;
    });

    if (didLeaveRide) {
      pushSystemNotification(`You left "${leftRideTitle}".`);
      setIsNotificationsOpen(true);
    }
  };

  const handleOpenRideDetail = (ride: RidePost) => {
    if (blockedUserIds.has(ride.creatorId)) {
      pushSystemNotification('This ride is from a blocked rider.');
      setIsNotificationsOpen(true);
      return;
    }
    setSelectedRideId(ride.id);
    setIsRideDetailOpen(true);
  };

  const handleOpenHelpDetail = (post: HelpPost) => {
    if (blockedUserIds.has(post.creatorId)) {
      pushSystemNotification('This help post is from a blocked rider.');
      setIsNotificationsOpen(true);
      return;
    }
    setSelectedHelpPost(post);
    setIsHelpDetailOpen(true);
  };

  const handleMarkNotificationRead = (id: string) => {
    setNotifications((prev) => prev.map((notification) => (notification.id === id ? { ...notification, read: true } : notification)));
  };

  const handleClearNotifications = () => setNotifications([]);

  const handleCreateHelpRequest = (
    data: Omit<HelpPost, 'id' | 'creatorId' | 'creatorName' | 'creatorAvatar' | 'resolved' | 'upvotes' | 'replies' | 'createdAt'>
  ) => {
    const newHelp: HelpPost = {
      id: `h-${Date.now()}`,
      creatorId: currentUser.id,
      creatorName: currentUser.name,
      creatorAvatar: currentUser.avatar,
      ...data,
      resolved: false,
      upvotes: 0,
      replies: [],
      createdAt: new Date().toISOString()
    };

    setHelpPosts((prev) => [newHelp, ...prev]);
    void logAnalyticsEvent('post_help', {
      help_id: newHelp.id,
      category: newHelp.category
    });
    if (FIREBASE_ENABLED) {
      runHelpMutationSync(() => upsertHelpPostInFirestore(newHelp));
    }
    setIsCreateHelpModalOpen(false);
    setIsCreateMenuOpen(false);
    setFeedFilter('help');
    setActiveTab('feed');
  };

  const handleCreateRide = (
    data: Omit<RidePost, 'id' | 'creatorId' | 'creatorName' | 'creatorAvatar' | 'currentParticipants' | 'requests' | 'createdAt' | 'city'>
  ) => {
    const newRide: RidePost = {
      id: `r-${Date.now()}`,
      creatorId: currentUser.id,
      creatorName: currentUser.name,
      creatorAvatar: currentUser.avatar,
      city: currentUser.city,
      ...data,
      currentParticipants: [currentUser.id],
      requests: [],
      createdAt: new Date().toISOString()
    };

    setRides((prev) => [newRide, ...prev]);
    void logAnalyticsEvent('create_ride', {
      ride_id: newRide.id,
      visibility: newRide.visibility.join('|')
    });
    void (async () => {
      const syncSucceeded = await runRideMutationSyncWithResult(() => upsertRideInFirestore(newRide));
      if (!syncSucceeded) return;
      void triggerRideCreatedNotification(newRide).catch(() => undefined);
    })();
    setCreatedRide(newRide);
    setIsCreateRideModalOpen(false);
    setIsCreateMenuOpen(false);
    setFeedFilter('rides');
    setActiveTab('feed');
  };

  const handleOpenRideEditor = (rideId: string) => {
    if (!ridesById.has(rideId)) return;
    setEditingRideId(rideId);
    setIsRideDetailOpen(false);
  };

  const handleCloseRideComposer = () => {
    if (editingRideId) {
      setEditingRideId(null);
      if (selectedRideId) {
        setIsRideDetailOpen(true);
      }
      return;
    }

    setIsCreateRideModalOpen(false);
  };

  const handleSubmitRideComposer = (
    data: Omit<RidePost, 'id' | 'creatorId' | 'creatorName' | 'creatorAvatar' | 'currentParticipants' | 'requests' | 'createdAt' | 'city'>
  ) => {
    const selectedGroupId = typeof data.groupId === 'string' ? data.groupId.trim() : '';
    let normalizedData = data;
    if (selectedGroupId) {
      const selectedGroup = groupsById.get(selectedGroupId);
      if (!selectedGroup) {
        showActionGuardrail('Selected group was not found. Please choose again.');
        return;
      }
      if (!canCurrentUserCreateGroupRide(selectedGroup)) {
        showActionGuardrail('Only group admins can host rides for this group.');
        return;
      }
      normalizedData = {
        ...data,
        groupId: selectedGroup.id,
        groupName: selectedGroup.name,
        groupAvatar: selectedGroup.avatar
      };
    } else {
      normalizedData = {
        ...data,
        groupId: undefined,
        groupName: undefined,
        groupAvatar: undefined
      };
    }

    if (editingRideId) {
      handleUpdateRide(editingRideId, normalizedData);
      setEditingRideId(null);
      setIsRideDetailOpen(true);
      setFeedFilter('rides');
      setActiveTab('feed');
      return;
    }

    handleCreateRide(normalizedData);
  };

  const handleUpdateProfile = (updates: Partial<User>) => {
    setCurrentUser((prev) => {
      const normalizedEmergencyContacts = dedupeEmergencyContactNumbers([
        ...(updates.sosContacts ?? prev.sosContacts ?? []),
        updates.sosNumber ?? prev.sosNumber ?? ''
      ]);
      const normalizedGarage = (updates.garage ?? prev.garage).map((bike) => bike.trim()).filter(Boolean);
      const normalizedBikePhotos = normalizeBikePhotosByName(normalizedGarage, updates.bikePhotosByName ?? prev.bikePhotosByName);
      const normalizedBikePhotoAssets = normalizeBikePhotoAssetsByName(
        normalizedGarage,
        updates.bikePhotoAssetsByName ?? prev.bikePhotoAssetsByName
      );

      const next: User = {
        ...prev,
        ...updates,
        garage: normalizedGarage,
        bikePhotosByName: normalizedBikePhotos,
        bikePhotoAssetsByName: normalizedBikePhotoAssets,
        ...(normalizedEmergencyContacts.length > 0
          ? {
            sosNumber: normalizedEmergencyContacts[0],
            sosContacts: normalizedEmergencyContacts
          }
          : {})
      };

      if (FIREBASE_ENABLED) {
        void upsertUserInFirestore(next);
      }

      return next;
    });
    setIsEditProfileOpen(false);
  };

  const handleUploadProfilePhoto = async (localUri: string) => {
    if (!localUri) return;

    setIsUploadingProfilePhoto(true);
    try {
      const uploadedPhoto = FIREBASE_ENABLED
        ? await uploadProfilePhoto(currentUser.id, localUri)
        : {
          objectKey: localUri,
          signedUrl: localUri,
          expiresAt: '2099-12-31T23:59:59.000Z'
        };
      setCurrentUser((prev) => {
        const next: User = {
          ...prev,
          avatar: uploadedPhoto.signedUrl,
          avatarAsset: uploadedPhoto
        };

        if (FIREBASE_ENABLED) {
          void upsertUserInFirestore(next);
        }

        return next;
      });
    } catch {
      Alert.alert('Upload failed', 'Could not upload profile photo. Please try again.');
    } finally {
      setIsUploadingProfilePhoto(false);
    }
  };

  const handleUploadBikePhoto = async (bikeName: string, localUri: string) => {
    const normalizedBikeName = bikeName.trim();
    if (!normalizedBikeName || !localUri) return;

    setUploadingBikeName(normalizedBikeName);
    try {
      const uploadedPhoto = FIREBASE_ENABLED
        ? await uploadBikePhoto(currentUser.id, normalizedBikeName, localUri)
        : {
          objectKey: localUri,
          signedUrl: localUri,
          expiresAt: '2099-12-31T23:59:59.000Z'
        };

      setCurrentUser((prev) => {
        const next: User = {
          ...prev,
          bikePhotosByName: {
            ...(prev.bikePhotosByName ?? {}),
            [normalizedBikeName]: uploadedPhoto.signedUrl
          },
          bikePhotoAssetsByName: {
            ...(prev.bikePhotoAssetsByName ?? {}),
            [normalizedBikeName]: uploadedPhoto
          }
        };

        if (FIREBASE_ENABLED) {
          void upsertUserInFirestore(next);
        }

        return next;
      });
    } catch {
      Alert.alert('Upload failed', 'Could not upload bike photo. Please try again.');
    } finally {
      setUploadingBikeName(null);
    }
  };

  const syncGroupToCloud = useCallback(
    async (group: Group): Promise<void> => {
      if (!FIREBASE_ENABLED) return;

      const hasAuthSession = await ensureFirebaseAuthSession(currentUser.phoneNumber);
      if (!hasAuthSession) {
        throw new Error('Group sync requires an authenticated Firebase session.');
      }

      const authUid = getFirebaseServices()?.auth.currentUser?.uid;
      if (!authUid) {
        throw new Error('No Firebase auth user is available for group sync.');
      }

      const authAliases = getCurrentUserIdAliases(authUid, currentUser.phoneNumber);
      // Include in-memory app identity as an alias (can differ from auth uid during migrations).
      authAliases.add(currentUser.id);
      const replaceAliasWithAuthUid = (ids: string[]): string[] =>
        uniqueStrings(
          ids
            .map((id) => (authAliases.has(id) ? authUid : id))
            .filter((id) => id.trim().length > 0)
        );

      const normalizedGroupForCloud: Group = {
        ...group,
        creatorId: authAliases.has(group.creatorId) ? authUid : group.creatorId,
        members: uniqueStrings([...replaceAliasWithAuthUid(group.members), authUid]),
        adminIds: replaceAliasWithAuthUid(group.adminIds).filter((id) => id !== authUid),
        joinRequests: replaceAliasWithAuthUid(group.joinRequests).filter((id) => id !== authUid)
      };

      await upsertGroupInFirestore(normalizedGroupForCloud);
    },
    [currentUser.phoneNumber, ensureFirebaseAuthSession]
  );

  const syncGroupToCloudInBackground = useCallback(
    (group: Group) => {
      if (!FIREBASE_ENABLED) return;
      void syncGroupToCloud(group).catch((error) => {
        console.warn('[group-sync] Failed to upsert group to cloud:', error);
      });
    },
    [syncGroupToCloud]
  );

  useEffect(() => {
    if (!FIREBASE_ENABLED || !hydrated || !isLoggedIn || !currentUser.id) return;

    const userAliases = getCurrentUserIdAliases(currentUser.id, currentUser.phoneNumber);
    groups.forEach((group) => {
      if (attemptedGroupCloudSyncIdsRef.current.has(group.id)) return;
      // Avoid trying to backfill static/mock groups like "sq-1", "sq-2", etc.
      if (!isRuntimeCreatedGroupId(group.id)) return;
      if (!userAliases.has(group.creatorId)) return;
      attemptedGroupCloudSyncIdsRef.current.add(group.id);
      void syncGroupToCloud(group).catch((error) => {
        const errorCode = error instanceof Error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
        console.warn('[group-sync] Background backfill failed:', {
          error,
          code: errorCode,
          groupId: group.id,
          groupCreatorId: group.creatorId,
          currentUserId: currentUser.id,
          authUid: getFirebaseServices()?.auth.currentUser?.uid ?? null
        });
      });
    });
  }, [currentUser.id, currentUser.phoneNumber, hydrated, isLoggedIn, groups, syncGroupToCloud]);

  const handleCreateGroup = async (data: {
    name: string;
    description: string;
    rideStyles: string[];
    joinPermission: GroupJoinPermission;
    rideCreatePermission: GroupRideCreatePermission;
    avatarUri?: string;
  }) => {
    if (isCreatingGroup) return;
    setIsCreatingGroup(true);
    try {
      let creatorId = currentUser.id;
      if (FIREBASE_ENABLED) {
        const hasAuthSession = await ensureFirebaseAuthSession(currentUser.phoneNumber);
        const authUid = getFirebaseServices()?.auth.currentUser?.uid;
        if (hasAuthSession && authUid) {
          creatorId = authUid;
        }
      }

      const rideStyles = uniqueStrings(data.rideStyles.map((style) => style.trim()).filter(Boolean));
      const groupId = `sq-${Date.now()}`;
      let groupAvatar = `https://api.dicebear.com/7.x/identicon/png?seed=${encodeURIComponent(data.name)}`;
      let groupAvatarAsset: SignedImageAsset | undefined;

      if (data.avatarUri) {
        try {
          const uploadedAvatar = FIREBASE_ENABLED
            ? await withTimeout(
              uploadGroupPhoto(groupId, creatorId, data.avatarUri),
              20_000,
              'Group photo upload timed out.'
            )
            : {
              objectKey: data.avatarUri,
              signedUrl: data.avatarUri,
              expiresAt: '2099-12-31T23:59:59.000Z'
            };
          groupAvatar = uploadedAvatar.signedUrl;
          groupAvatarAsset = uploadedAvatar;
        } catch {
          Alert.alert('Upload failed', 'Group photo upload failed. Using a default group avatar.');
        }
      }

      const newGroup: Group = {
        id: groupId,
        name: data.name,
        description: data.description,
        creatorId,
        members: [creatorId],
        adminIds: [],
        avatar: groupAvatar,
        avatarAsset: groupAvatarAsset,
        city: currentUser.city,
        rideStyles: rideStyles.length > 0 ? rideStyles : ['Touring'],
        joinPermission: data.joinPermission,
        rideCreatePermission: data.rideCreatePermission,
        joinRequests: [],
        createdAt: new Date().toISOString()
      };
      setGroups((prev) => {
        const next = [newGroup, ...prev];
        persistGroupsSnapshot(next);
        return next;
      });
      if (FIREBASE_ENABLED) {
        try {
          await syncGroupToCloud(newGroup);
        } catch {
          Alert.alert('Saved on this device only', 'Group was created locally but could not sync to cloud yet. Please check login/connectivity and try again.');
        }
      }
      setIsCreateGroupModalOpen(false);
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const handleUpdateGroup = async (data: {
    name: string;
    description: string;
    rideStyles: string[];
    joinPermission: GroupJoinPermission;
    rideCreatePermission: GroupRideCreatePermission;
    avatarUri?: string;
  }) => {
    if (!editingGroupId) return;
    if (isCreatingGroup) return;

    const existing = groupsById.get(editingGroupId);
    if (!existing) {
      setEditingGroupId(null);
      setIsCreateGroupModalOpen(false);
      return;
    }

    setIsCreatingGroup(true);
    try {
      const rideStyles = uniqueStrings(data.rideStyles.map((style) => style.trim()).filter(Boolean));
      let avatar = existing.avatar;
      let avatarAsset = existing.avatarAsset;
      if (data.avatarUri && data.avatarUri.startsWith('file')) {
        try {
          const uploadedAvatar = FIREBASE_ENABLED
            ? await withTimeout(
              uploadGroupPhoto(existing.id, existing.creatorId, data.avatarUri),
              20_000,
              'Group photo upload timed out.'
            )
            : {
              objectKey: data.avatarUri,
              signedUrl: data.avatarUri,
              expiresAt: '2099-12-31T23:59:59.000Z'
            };
          avatar = uploadedAvatar.signedUrl;
          avatarAsset = uploadedAvatar;
        } catch {
          Alert.alert('Upload failed', 'Could not update group photo. Keeping previous photo.');
        }
      }

      const promotedMembers = data.joinPermission === 'anyone'
        ? uniqueStrings([...existing.members, ...existing.joinRequests])
        : existing.members;

      const updatedGroup: Group = {
        ...existing,
        name: data.name,
        description: data.description,
        avatar,
        avatarAsset,
        rideStyles: rideStyles.length > 0 ? rideStyles : ['Touring'],
        joinPermission: data.joinPermission,
        rideCreatePermission: data.rideCreatePermission,
        members: promotedMembers,
        joinRequests: data.joinPermission === 'anyone' ? [] : existing.joinRequests
      };

      setGroups((prev) => {
        const next = prev.map((item) => (item.id === updatedGroup.id ? updatedGroup : item));
        persistGroupsSnapshot(next);
        return next;
      });
      if (FIREBASE_ENABLED) {
        syncGroupToCloudInBackground(updatedGroup);
      }
      setEditingGroupId(null);
      setIsCreateGroupModalOpen(false);
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const handleJoinGroup = (groupId: string) => {
    let shouldShowInviteOnlyAlert = false;
    setGroups((prev) => {
      let updatedGroup: Group | null = null;
      const next = prev.map((s) => {
        if (s.id !== groupId) return s;
        if (s.members.includes(currentUser.id)) return s;
        if (s.joinPermission === 'invite_only') {
          shouldShowInviteOnlyAlert = true;
          return s;
        }
        if (s.joinPermission === 'request_to_join') {
          if (s.joinRequests.includes(currentUser.id)) return s;
          updatedGroup = { ...s, joinRequests: [...s.joinRequests, currentUser.id] };
          return updatedGroup;
        }

        updatedGroup = {
          ...s,
          members: [...s.members, currentUser.id],
          joinRequests: s.joinRequests.filter((id) => id !== currentUser.id)
        };
        return updatedGroup;
      });

      persistGroupsSnapshot(next);

      if (updatedGroup && FIREBASE_ENABLED) {
        syncGroupToCloudInBackground(updatedGroup);
      }

      return next;
    });

    if (shouldShowInviteOnlyAlert) {
      showActionGuardrail('This group is invite only.');
    }
  };

  const handleLeaveGroup = (groupId: string) => {
    setGroups((prev) => {
      let updatedGroup: Group | null = null;
      const next = prev.map((s) => {
        if (s.id !== groupId) return s;
        if (s.creatorId === currentUser.id) return s;
        const isMember = s.members.includes(currentUser.id);
        const hasPendingRequest = s.joinRequests.includes(currentUser.id);
        if (!isMember && !hasPendingRequest) return s;
        updatedGroup = {
          ...s,
          members: s.members.filter((id) => id !== currentUser.id),
          adminIds: s.adminIds.filter((id) => id !== currentUser.id),
          joinRequests: s.joinRequests.filter((id) => id !== currentUser.id)
        };
        return updatedGroup;
      });

      persistGroupsSnapshot(next);

      if (updatedGroup && FIREBASE_ENABLED) {
        syncGroupToCloudInBackground(updatedGroup);
      }

      return next;
    });
  };

  const handleAcceptGroupJoinRequest = (groupId: string, userId: string) => {
    setGroups((prev) => {
      let updatedGroup: Group | null = null;
      const next = prev.map((s) => {
        if (s.id !== groupId) return s;
        const canApprove = s.creatorId === currentUser.id || s.adminIds.includes(currentUser.id);
        if (!canApprove) return s;
        if (!s.joinRequests.includes(userId)) return s;

        updatedGroup = {
          ...s,
          members: s.members.includes(userId) ? s.members : [...s.members, userId],
          joinRequests: s.joinRequests.filter((id) => id !== userId)
        };
        return updatedGroup;
      });

      persistGroupsSnapshot(next);

      if (updatedGroup && FIREBASE_ENABLED) {
        syncGroupToCloudInBackground(updatedGroup);
      }

      return next;
    });
  };

  const handleRejectGroupJoinRequest = (groupId: string, userId: string) => {
    setGroups((prev) => {
      let updatedGroup: Group | null = null;
      const next = prev.map((s) => {
        if (s.id !== groupId) return s;
        const canApprove = s.creatorId === currentUser.id || s.adminIds.includes(currentUser.id);
        if (!canApprove) return s;
        if (!s.joinRequests.includes(userId)) return s;

        updatedGroup = {
          ...s,
          joinRequests: s.joinRequests.filter((id) => id !== userId)
        };
        return updatedGroup;
      });

      persistGroupsSnapshot(next);

      if (updatedGroup && FIREBASE_ENABLED) {
        syncGroupToCloudInBackground(updatedGroup);
      }

      return next;
    });
  };

  const handlePromoteGroupAdmin = (groupId: string, userId: string) => {
    setGroups((prev) => {
      let updatedGroup: Group | null = null;
      const next = prev.map((s) => {
        if (s.id !== groupId) return s;
        if (s.creatorId !== currentUser.id) return s;
        if (userId === s.creatorId) return s;
        if (!s.members.includes(userId)) return s;
        if (s.adminIds.includes(userId)) return s;

        updatedGroup = {
          ...s,
          adminIds: [...s.adminIds, userId]
        };
        return updatedGroup;
      });

      persistGroupsSnapshot(next);

      if (updatedGroup && FIREBASE_ENABLED) {
        syncGroupToCloudInBackground(updatedGroup);
      }

      return next;
    });
  };

  const handleDemoteGroupAdmin = (groupId: string, userId: string) => {
    setGroups((prev) => {
      let updatedGroup: Group | null = null;
      const next = prev.map((s) => {
        if (s.id !== groupId) return s;
        if (s.creatorId !== currentUser.id) return s;
        if (!s.adminIds.includes(userId)) return s;

        updatedGroup = {
          ...s,
          adminIds: s.adminIds.filter((id) => id !== userId)
        };
        return updatedGroup;
      });

      persistGroupsSnapshot(next);

      if (updatedGroup && FIREBASE_ENABLED) {
        syncGroupToCloudInBackground(updatedGroup);
      }

      return next;
    });
  };

  const handleOpenGroupDetail = (groupId: string) => {
    setSelectedGroupId(groupId);
  };

  const handleDeleteGroup = (groupId: string) => {
    const group = groupsById.get(groupId);
    if (!group || group.creatorId !== currentUser.id) return;

    Alert.alert('Delete Group', 'This will permanently delete the group for all members.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setGroups((prev) => {
            const next = prev.filter((item) => item.id !== groupId);
            persistGroupsSnapshot(next);
            return next;
          });
          if (FIREBASE_ENABLED) {
            void deleteGroupInFirestore(groupId);
          }
          if (selectedGroupId === groupId) {
            setSelectedGroupId(null);
          }
          if (activeGroupChatId === groupId) {
            setActiveGroupChatId(null);
          }
        }
      }
    ]);
  };

  const handleRemoveGroupMember = (groupId: string, memberId: string) => {
    if (!memberId || memberId === currentUser.id) return;

    setGroups((prev) => {
      let updatedGroup: Group | null = null;
      const next = prev.map((group) => {
        if (group.id !== groupId) return group;
        if (group.creatorId !== currentUser.id) return group;
        if (memberId === group.creatorId) return group;
        if (!group.members.includes(memberId)) return group;

        updatedGroup = {
          ...group,
          members: group.members.filter((id) => id !== memberId),
          adminIds: group.adminIds.filter((id) => id !== memberId),
          joinRequests: group.joinRequests.filter((id) => id !== memberId)
        };
        return updatedGroup;
      });

      persistGroupsSnapshot(next);
      if (updatedGroup && FIREBASE_ENABLED) {
        syncGroupToCloudInBackground(updatedGroup);
      }
      return next;
    });
  };

  const handleOpenGroupChat = (groupId: string) => {
    const group = groupsById.get(groupId);
    if (!group || !group.members.includes(currentUser.id)) {
      showActionGuardrail('Join this group to access the group room.');
      return;
    }

    setSelectedGroupId(null);
    setActiveGroupChatId(groupId);
  };

  const handleResolveHelp = (id: string) => {
    setHelpPosts((prev) => {
      let updatedPost: HelpPost | null = null;
      const next = prev.map((post) => {
        if (post.id !== id) return post;
        updatedPost = { ...post, resolved: true };
        return updatedPost;
      });

      if (updatedPost && FIREBASE_ENABLED) {
        const postToSync = updatedPost;
        runHelpMutationSync(() => upsertHelpPostInFirestore(postToSync));
      }

      return next;
    });
    if (selectedHelpPost?.id === id) {
      setSelectedHelpPost((prev) => (prev ? { ...prev, resolved: true } : null));
    }
  };

  const handleUpvoteHelp = (id: string) => {
    const targetPost = helpPostsById.get(id);
    if (targetPost && blockedUserIds.has(targetPost.creatorId)) return;

    setHelpPosts((prev) => {
      let updatedPost: HelpPost | null = null;
      const next = prev.map((post) => {
        if (post.id !== id) return post;
        updatedPost = { ...post, upvotes: post.upvotes + 1 };
        return updatedPost;
      });

      if (updatedPost && FIREBASE_ENABLED) {
        const postToSync = updatedPost;
        runHelpMutationSync(() => upsertHelpPostInFirestore(postToSync));
      }

      return next;
    });
    if (selectedHelpPost?.id === id) {
      setSelectedHelpPost((prev) => (prev ? { ...prev, upvotes: prev.upvotes + 1 } : null));
    }
  };

  const handleReplyHelp = (postId: string, text: string) => {
    const targetPost = helpPostsById.get(postId);
    if (targetPost && blockedUserIds.has(targetPost.creatorId)) return;

    const normalizedText = text.trim();
    if (!normalizedText) return;

    if (normalizedText.length > HELP_REPLY_MAX_LENGTH) {
      showActionGuardrail(`Reply is too long. Keep it under ${HELP_REPLY_MAX_LENGTH} characters.`);
      return;
    }

    const now = Date.now();
    const recentReplies = pruneTimestamps(helpReplyTimestampsRef.current, now, HELP_REPLY_WINDOW_MS);
    if (recentReplies.length >= HELP_REPLY_MAX_IN_WINDOW) {
      showActionGuardrail('Too many help replies in a short time. Please slow down.');
      return;
    }

    const lastReplyForPost = helpReplyMetaByPostRef.current.get(postId);
    if (lastReplyForPost && now - lastReplyForPost.sentAt < HELP_REPLY_POST_COOLDOWN_MS) {
      showActionGuardrail(
        `Please wait ${formatCooldown(HELP_REPLY_POST_COOLDOWN_MS - (now - lastReplyForPost.sentAt))} before replying again on this post.`
      );
      return;
    }

    if (lastReplyForPost && lastReplyForPost.text === normalizedText && now - lastReplyForPost.sentAt < HELP_REPLY_DUPLICATE_COOLDOWN_MS) {
      showActionGuardrail('Duplicate reply detected. Please avoid repeating the same message.');
      return;
    }

    helpReplyTimestampsRef.current = [...recentReplies, now];
    helpReplyMetaByPostRef.current.set(postId, { sentAt: now, text: normalizedText });

    const reply: HelpReply = {
      id: `rep-${Date.now()}`,
      creatorId: currentUser.id,
      creatorName: currentUser.name,
      creatorAvatar: currentUser.avatar,
      text: normalizedText,
      isHelpful: false,
      createdAt: new Date().toISOString()
    };

    setHelpPosts((prev) => {
      let updatedPost: HelpPost | null = null;
      const next = prev.map((post) => {
        if (post.id !== postId) return post;
        updatedPost = { ...post, replies: [...post.replies, reply] };
        return updatedPost;
      });

      if (updatedPost && FIREBASE_ENABLED) {
        const postToSync = updatedPost;
        runHelpMutationSync(() => upsertHelpPostInFirestore(postToSync));
      }

      return next;
    });
    if (selectedHelpPost?.id === postId) {
      setSelectedHelpPost((prev) => (prev ? { ...prev, replies: [...prev.replies, reply] } : null));
    }
  };

  const handleAcceptFriendRequest = (senderId: string, notificationId: string) => {
    const friend = users.find((user) => user.id === senderId);
    if (!friend) return;
    if (blockedUserIds.has(senderId)) {
      handleMarkNotificationRead(notificationId);
      return;
    }

    setCurrentUser((prev) => ({
      ...prev,
      friends: uniqueStrings([...prev.friends, senderId]),
      friendRequests: {
        ...prev.friendRequests,
        received: prev.friendRequests.received.filter((id) => id !== senderId),
        sent: prev.friendRequests.sent.filter((id) => id !== senderId)
      }
    }));

    setUsers((prev) =>
      prev.map((user) => {
        if (user.id !== senderId) return user;

        return {
          ...user,
          friends: uniqueStrings([...user.friends, currentUser.id]),
          friendRequests: {
            ...user.friendRequests,
            sent: user.friendRequests.sent.filter((id) => id !== currentUser.id),
            received: user.friendRequests.received.filter((id) => id !== currentUser.id)
          }
        };
      })
    );

    handleMarkNotificationRead(notificationId);
    openOrCreateConversation(senderId);
  };

  const handleRejectFriendRequest = (notificationId: string) => {
    const notification = notifications.find((item) => item.id === notificationId);

    if (notification?.type === 'friend_request') {
      setCurrentUser((prev) => ({
        ...prev,
        friendRequests: {
          ...prev.friendRequests,
          received: prev.friendRequests.received.filter((id) => id !== notification.senderId)
        }
      }));

      setUsers((prev) =>
        prev.map((user) => {
          if (user.id !== notification.senderId) return user;
          return {
            ...user,
            friendRequests: {
              ...user.friendRequests,
              sent: user.friendRequests.sent.filter((id) => id !== currentUser.id)
            }
          };
        })
      );
    }

    handleMarkNotificationRead(notificationId);
  };

  const handleSendFriendRequest = (userId: string) => {
    if (userId === currentUser.id) return;
    if (blockedUserIds.has(userId)) {
      setSelectedUserId(null);
      showActionGuardrail('Unblock this rider before sending a friend request.');
      return;
    }

    const targetUser = usersById.get(userId) ?? buildInferredUserRecord(userId);
    if (!targetUser) {
      showActionGuardrail('Profile details are still syncing. Please try again in a moment.');
      return;
    }

    if (currentUser.friends.includes(userId)) {
      setSelectedUserId(null);
      showActionGuardrail(`${targetUser.name} is already in your riding group.`);
      return;
    }

    if (currentUser.friendRequests.sent.includes(userId)) {
      setSelectedUserId(null);
      showActionGuardrail(`Friend request already pending with ${targetUser.name}.`);
      return;
    }

    const now = Date.now();
    const recentRequests = pruneTimestamps(friendRequestTimestampsRef.current, now, FRIEND_REQUEST_WINDOW_MS);
    if (recentRequests.length >= FRIEND_REQUEST_MAX_IN_WINDOW) {
      showActionGuardrail('Too many friend requests sent recently. Please try again later.');
      return;
    }

    const lastRequestForUser = friendRequestCooldownByUserRef.current.get(userId);
    if (lastRequestForUser && now - lastRequestForUser < FRIEND_REQUEST_TARGET_COOLDOWN_MS) {
      showActionGuardrail(
        `Please wait ${formatCooldown(FRIEND_REQUEST_TARGET_COOLDOWN_MS - (now - lastRequestForUser))} before requesting ${targetUser.name} again.`
      );
      return;
    }

    friendRequestTimestampsRef.current = [...recentRequests, now];
    friendRequestCooldownByUserRef.current.set(userId, now);

    setCurrentUser((prev) => ({
      ...prev,
      friendRequests: {
        ...prev.friendRequests,
        sent: uniqueStrings([...prev.friendRequests.sent, userId])
      }
    }));

    setUsers((prev) => {
      let found = false;
      const next = prev.map((user) => {
        if (user.id !== userId) return user;
        found = true;
        return {
          ...user,
          friendRequests: {
            ...user.friendRequests,
            received: uniqueStrings([...user.friendRequests.received, currentUser.id])
          }
        };
      });

      if (found) return next;
      return [
        ...next,
        {
          ...targetUser,
          friendRequests: {
            ...targetUser.friendRequests,
            received: uniqueStrings([...(targetUser.friendRequests?.received ?? []), currentUser.id]),
            sent: targetUser.friendRequests?.sent ?? []
          }
        }
      ];
    });

    showActionGuardrail(`Friend request sent to ${targetUser.name}.`);
    setSelectedUserId(null);
  };

  const handleRetryRidesSync = () => {
    void syncRidesFromCloud();
  };

  const handleRetryHelpSync = () => {
    void syncHelpFromCloud();
  };

  const handleRetryNewsSync = () => {
    void refreshNewsFeed();
  };

  const handleMainScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (activeTab !== 'news' || !hasMoreNewsArticles) return;

      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
      const nearBottom = distanceFromBottom <= NEWS_LOAD_MORE_DISTANCE_FROM_BOTTOM;
      if (!nearBottom) return;
      if (contentSize.height <= lastNewsLoadTriggerHeightRef.current) return;

      lastNewsLoadTriggerHeightRef.current = contentSize.height;
      setVisibleNewsCount((previousCount) => Math.min(previousCount + NEWS_PAGE_SIZE, newsArticles.length));
    },
    [activeTab, hasMoreNewsArticles, newsArticles.length]
  );

  const handleRetryRideTrackingSync = () => {
    void (async () => {
      const hasSession = hasFirebaseAuthSession || await ensureFirebaseAuthSession();
      if (!hasSession) {
        markSyncFailure('rideTracking', new Error('Live tracking sync requires an authenticated Firebase session.'));
        return;
      }

      if (!selectedRideId) {
        markSyncFailure('rideTracking', new Error('Open a ride detail to retry live tracking sync.'));
        return;
      }
      setRideTrackingSyncRetryToken((prev) => prev + 1);
    })();
  };

  const handleRetryChatSync = () => {
    void (async () => {
      const hasSession = hasFirebaseAuthSession || await ensureFirebaseAuthSession();
      if (!hasSession) {
        markSyncFailure('chat', new Error('Chat sync requires an authenticated Firebase session.'));
        return;
      }

      if (!activeConversation) {
        markSyncFailure('chat', new Error('Open a chat room to retry chat sync.'));
        return;
      }

      setChatSyncRetryToken((prev) => prev + 1);
    })();
  };

  const handleRetryGroupChatSync = () => {
    void (async () => {
      const hasSession = hasFirebaseAuthSession || await ensureFirebaseAuthSession();
      if (!hasSession) {
        markSyncFailure('groupChat', new Error('Group chat sync requires an authenticated Firebase session.'));
        return;
      }

      if (!activeGroupChatId) {
        markSyncFailure('groupChat', new Error('Open a group chat room to retry sync.'));
        return;
      }

      setGroupChatSyncRetryToken((prev) => prev + 1);
    })();
  };

  const handleSendMessage = (conversationId: string, text: string) => {
    const targetConversation = conversations.find((conversation) => conversation.id === conversationId);
    const canonicalRecipientId = targetConversation?.participantId
      ? (resolveCanonicalUser(targetConversation.participantId)?.id ?? targetConversation.participantId)
      : undefined;
    if (targetConversation && (blockedUserIds.has(targetConversation.participantId) || blockedUserIds.has(canonicalRecipientId ?? ''))) return;

    const normalizedText = text.trim();
    if (!normalizedText) return;

    if (normalizedText.length > CHAT_MESSAGE_MAX_LENGTH) {
      showActionGuardrail(`Message is too long. Keep it under ${CHAT_MESSAGE_MAX_LENGTH} characters.`);
      return;
    }

    const now = Date.now();
    const previousTimestamps = chatTimestampsByConversationRef.current.get(conversationId) ?? [];
    const recentMessages = pruneTimestamps(previousTimestamps, now, CHAT_BURST_WINDOW_MS);
    const lastSentAt = recentMessages[recentMessages.length - 1];
    if (lastSentAt && now - lastSentAt < CHAT_MIN_INTERVAL_MS) {
      showActionGuardrail(
        `You're sending too fast. Wait ${formatCooldown(CHAT_MIN_INTERVAL_MS - (now - lastSentAt))} before the next message.`
      );
      return;
    }

    if (recentMessages.length >= CHAT_BURST_MAX_MESSAGES) {
      showActionGuardrail('Chat burst limit reached. Please pause for a few seconds.');
      return;
    }

    const lastMessageForConversation = chatLastMessageByConversationRef.current.get(conversationId);
    if (
      lastMessageForConversation &&
      lastMessageForConversation.text === normalizedText &&
      now - lastMessageForConversation.sentAt < CHAT_DUPLICATE_COOLDOWN_MS
    ) {
      showActionGuardrail('Duplicate message blocked. Please send a different message.');
      return;
    }

    chatTimestampsByConversationRef.current.set(conversationId, [...recentMessages, now]);
    chatLastMessageByConversationRef.current.set(conversationId, { sentAt: now, text: normalizedText });

    const newMsg: ChatMessage = {
      id: `m-${Date.now()}`,
      senderId: currentUser.id,
      recipientId: canonicalRecipientId,
      text: normalizedText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setConversations((prev) =>
      prev.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;

        const updatedConversation = {
          ...conversation,
          messages: [...conversation.messages, newMsg],
          lastMessage: normalizedText,
          timestamp: 'Just now'
        };

        if (activeConversation?.id === conversationId) {
          setActiveConversation(updatedConversation);
        }

        return updatedConversation;
      })
    );

    if (FIREBASE_ENABLED) {
      startSync('chat');
      void (async () => {
        const hasAuthSession = await ensureFirebaseAuthSession();
        if (!hasAuthSession) {
          throw new Error('Chat sync requires an authenticated Firebase session. Please log in again.');
        }
        await sendChatMessageToRealtime(conversationId, newMsg);
        markSyncSuccess('chat');
        if (canonicalRecipientId) {
          void triggerDirectChatMessageNotification({
            conversationId,
            senderId: currentUser.id,
            senderName: currentUser.name,
            recipientId: canonicalRecipientId,
            text: normalizedText
          }).catch((error) => {
            console.warn('[notifications] Failed to dispatch direct chat push event:', error);
          });
        }
      })().catch((error) => {
        markSyncFailure('chat', error);
      });
    }

    void logAnalyticsEvent('send_message', {
      conversation_id: conversationId,
      message_length: normalizedText.length
    });
  };

  const handleOpenChatRoom = (conversation: Conversation) => {
    openOrCreateConversation(conversation.participantId, { conversationId: conversation.id });
  };

  const handleSendGroupMessage = (groupId: string, text: string) => {
    const targetGroup = groupsById.get(groupId);
    if (!targetGroup || !targetGroup.members.includes(currentUser.id)) return;

    const normalizedText = text.trim();
    if (!normalizedText) return;

    if (normalizedText.length > CHAT_MESSAGE_MAX_LENGTH) {
      showActionGuardrail(`Message is too long. Keep it under ${CHAT_MESSAGE_MAX_LENGTH} characters.`);
      return;
    }

    const now = Date.now();
    const previousTimestamps = groupChatTimestampsByRoomRef.current.get(groupId) ?? [];
    const recentMessages = pruneTimestamps(previousTimestamps, now, CHAT_BURST_WINDOW_MS);
    const lastSentAt = recentMessages[recentMessages.length - 1];
    if (lastSentAt && now - lastSentAt < CHAT_MIN_INTERVAL_MS) {
      showActionGuardrail(
        `You're sending too fast. Wait ${formatCooldown(CHAT_MIN_INTERVAL_MS - (now - lastSentAt))} before the next message.`
      );
      return;
    }

    if (recentMessages.length >= CHAT_BURST_MAX_MESSAGES) {
      showActionGuardrail('Chat burst limit reached. Please pause for a few seconds.');
      return;
    }

    const lastMessageForRoom = groupChatLastMessageByRoomRef.current.get(groupId);
    if (lastMessageForRoom && lastMessageForRoom.text === normalizedText && now - lastMessageForRoom.sentAt < CHAT_DUPLICATE_COOLDOWN_MS) {
      showActionGuardrail('Duplicate message blocked. Please send a different message.');
      return;
    }

    groupChatTimestampsByRoomRef.current.set(groupId, [...recentMessages, now]);
    groupChatLastMessageByRoomRef.current.set(groupId, { sentAt: now, text: normalizedText });

    const newMsg: ChatMessage = {
      id: `sqm-${Date.now()}`,
      senderId: currentUser.id,
      senderName: currentUser.name,
      text: normalizedText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setGroupChatMessagesByRoom((prev) => ({
      ...prev,
      [groupId]: [...(prev[groupId] ?? []), newMsg]
    }));

    if (FIREBASE_ENABLED) {
      startSync('groupChat');
      void (async () => {
        const hasAuthSession = await ensureFirebaseAuthSession();
        if (!hasAuthSession) {
          throw new Error('Group chat sync requires an authenticated Firebase session. Please log in again.');
        }
        await sendGroupChatMessageToRealtime(groupId, newMsg);
        markSyncSuccess('groupChat');
        void triggerGroupChatMessageNotification({
          groupId,
          groupName: targetGroup.name,
          senderId: currentUser.id,
          senderName: currentUser.name,
          text: normalizedText,
          memberIds: targetGroup.members
        }).catch((error) => {
          console.warn('[notifications] Failed to dispatch group chat push event:', error);
        });
      })().catch((error) => {
        markSyncFailure('groupChat', error);
      });
    }

    void logAnalyticsEvent('send_group_message', {
      group_id: groupId,
      message_length: normalizedText.length
    });
  };

  const handleOpenLocationModal = () => {
    setManualCityInput(currentUser.city);
    setIsLocationModalOpen(true);
  };

  const handleSaveManualCity = () => {
    const city = manualCityInput.trim();
    if (!city) return;

    setCurrentUser((prev) => ({ ...prev, city }));
    setLocationMode('manual');
    setIsLocationModalOpen(false);
  };

  const handleSwitchToAutoLocation = async () => {
    setLocationMode('auto');
    const detected = await detectAndApplyCurrentLocation(false);
    if (!detected) {
      pushSystemNotification('Auto city detection enabled. Update may appear when location is available.');
    }
    setIsLocationModalOpen(false);
  };

  const handleOpenNotifications = async () => {
    if (notificationPermissionStatus !== 'granted') {
      await ensureNotificationPermission(true);
    }
    setIsNotificationsOpen(true);
  };

  const handleShareApp = async () => {
    try {
      await Share.share({
        title: 'ThrottleUp',
        message: 'Join me on ThrottleUp - The community grid for motorcycle explorers.'
      });
    } catch {
      pushSystemNotification('Unable to open share sheet right now.');
      setIsNotificationsOpen(true);
    }
  };

  const handleLogout = async () => {
    if (FIREBASE_ENABLED) {
      try {
        await signOutFirebase();
      } catch {
        // ignore sign-out errors and still clear local session state
      }
    }
    clearSession();
  };

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!isLoggedIn || currentUser.profileComplete === false) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert(
        'Exit app?',
        'Do you want to close ThrottleUp?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Exit',
            style: 'destructive',
            onPress: () => BackHandler.exitApp()
          }
        ]
      );
      return true;
    });

    return () => {
      subscription.remove();
    };
  }, [currentUser.profileComplete, isLoggedIn]);

  if (!hydrated) {
    return (
      <SafeAreaView style={[styles.fullScreen, { backgroundColor: TOKENS.dark.bg }]}>
        <ExpoStatusBar style="light" translucent={false} backgroundColor={TOKENS.dark.bg} />
      </SafeAreaView>
    );
  }

  const renderMainScreen = (onLogoutAndNavigate: () => void) => (
    <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg }]}>
      <ExpoStatusBar style={theme === 'light' ? 'dark' : 'light'} translucent={false} backgroundColor={t.bg} />
      <View style={[styles.container, { backgroundColor: t.bg }]}>
        <View style={[styles.header, { borderBottomColor: t.border, backgroundColor: t.surface }]}>
          <View style={styles.headerTopRow}>
            <View style={styles.brandRow}>
              <TouchableOpacity
                onPress={() => setActiveTab('profile')}
                style={[styles.headerProfileButton, { marginRight: 10, borderColor: activeTab === 'profile' ? t.primary : t.border }]}
              >
                <Image source={{ uri: currentUser.avatar || avatarFallback }} style={styles.headerProfileImage} />
              </TouchableOpacity>
              <Text style={[styles.brandTitle, { marginLeft: 0, color: t.text }]}>ThrottleUp</Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={handleOpenNotifications}
                style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}
              >
                <MaterialCommunityIcons
                  name="bell-outline"
                  size={20}
                  color={notificationPermissionStatus === 'denied' ? t.muted : t.text}
                />
                {unreadCount > 0 && (
                  <View style={[styles.badgeCounter, { backgroundColor: t.primary }]}>
                    <Text style={styles.badgeCounterText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleOpenLocationModal}
                style={[styles.cityChip, { borderColor: t.border, backgroundColor: t.subtle }]}
              >
                <MaterialCommunityIcons name={locationMode === 'auto' ? 'crosshairs-gps' : 'map-marker-outline'} size={12} color={t.primary} />
                <Text style={[styles.cityChipText, { color: t.muted }]}>{currentUser.city}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {activeTab === 'feed' ? (
            <View style={[styles.feedToggle, { backgroundColor: t.subtle }]}>
              <Pressable
                style={[styles.feedToggleButton, feedFilter === 'rides' && { backgroundColor: t.primary }]}
                onPress={() => setFeedFilter('rides')}
              >
                <MaterialCommunityIcons name="compass-outline" size={14} color={feedFilter === 'rides' ? '#fff' : t.muted} />
                <Text style={[styles.feedToggleText, { color: feedFilter === 'rides' ? '#fff' : t.muted }]}>Rides</Text>
              </Pressable>
              <Pressable
                style={[styles.feedToggleButton, feedFilter === 'help' && { backgroundColor: t.primary }]}
                onPress={() => setFeedFilter('help')}
              >
                <MaterialCommunityIcons name="wrench-outline" size={14} color={feedFilter === 'help' ? '#fff' : t.muted} />
                <Text style={[styles.feedToggleText, { color: feedFilter === 'help' ? '#fff' : t.muted }]}>Help</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={[styles.sectionLabel, { color: t.text }]}>
              {activeTab === 'news'
                ? 'BIKE NEWS'
                : activeTab === 'my-rides'
                  ? 'MY RIDES'
                  : activeTab === 'chats'
                    ? 'MESSAGES'
                    : activeTab === 'group'
                      ? 'GROUPS'
                      : 'MY PROFILE'}
            </Text>
          )}
        </View>

        <ScrollView
          contentContainerStyle={styles.mainScroll}
          showsVerticalScrollIndicator={false}
          onScroll={handleMainScroll}
          scrollEventThrottle={16}
        >
          {activeTab === 'feed' && (
            <FeedTab
              theme={theme}
              feedFilter={feedFilter}
              rides={feedRides}
              helpPosts={visibleHelpPosts}
              ridesSyncError={syncState.rides.error}
              helpSyncError={syncState.help.error}
              isSyncingRides={syncState.rides.isSyncing}
              isSyncingHelp={syncState.help.isSyncing}
              onRetryRidesSync={handleRetryRidesSync}
              onRetryHelpSync={handleRetryHelpSync}
              currentUser={currentUser}
              onOpenRideDetail={handleOpenRideDetail}
              onOpenHelpDetail={handleOpenHelpDetail}
              onViewProfile={handleViewProfile}
            />
          )}

          {activeTab === 'news' && (
            <NewsTab
              theme={theme}
              newsArticles={visibleNewsArticles}
              totalNewsCount={newsArticles.length}
              syncError={syncState.news.error}
              isSyncing={syncState.news.isSyncing}
              onRetrySync={handleRetryNewsSync}
              hasMoreItems={hasMoreNewsArticles}
              onOpenArticle={(url) => {
                setActiveNewsArticleUrl(url);
              }}
            />
          )}

          {activeTab === 'my-rides' && (
            <MyRidesTab
              theme={theme}
              rides={visibleRides}
              currentUser={currentUser}
              onOpenRideDetail={handleOpenRideDetail}
              onViewProfile={handleViewProfile}
            />
          )}

          {activeTab === 'chats' && (
            <ChatsTab
              theme={theme}
              conversations={visibleConversations}
              groups={groups}
              currentUser={currentUser}
              users={visibleUsers}
              syncError={syncState.chat.error}
              isSyncing={syncState.chat.isSyncing}
              onRetrySync={handleRetryChatSync}
              onOpenChatRoom={handleOpenChatRoom}
              onOpenGroupChat={(group) => handleOpenGroupChat(group.id)}
              onViewProfile={handleViewProfile}
              onStartConversation={openOrCreateConversation}
            />
          )}

          {activeTab === 'group' && (
            <GroupTab
              theme={theme}
              groups={groups}
              rides={visibleRides}
              currentUser={currentUser}
              users={visibleUsers}
              searchQuery={groupSearchQuery}
              onSearchChange={setGroupSearchQuery}
              onCreateGroup={() => {
                setEditingGroupId(null);
                setIsCreateGroupModalOpen(true);
              }}
              onOpenGroupDetail={handleOpenGroupDetail}
              onJoinGroup={handleJoinGroup}
              onLeaveGroup={handleLeaveGroup}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileTab
              theme={theme}
              currentUser={currentUser}
              users={visibleUsers}
              rides={visibleRides}
              conversations={visibleConversations}
              onEditProfile={() => setIsEditProfileOpen(true)}
              onViewProfile={handleViewProfile}
              onOpenConversation={handleOpenChatRoom}
              onStartConversation={openOrCreateConversation}
              onShareApp={handleShareApp}
              onLogout={onLogoutAndNavigate}
              onSetTheme={setTheme}
            />
          )}
        </ScrollView>

        {(activeTab === 'feed' || activeTab === 'my-rides') && (
          <View style={styles.fabWrap}>
            {isCreateMenuOpen && (
              <View style={styles.createMenu}>
                <TouchableOpacity
                  style={[styles.createMenuButton, { backgroundColor: t.surface, borderColor: t.border }]}
                  onPress={() => setIsCreateHelpModalOpen(true)}
                >
                  <MaterialCommunityIcons name="wrench" size={16} color={TOKENS[theme].blue} />
                  <Text style={createMenuButtonTextStyle}>Post Help Request</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.createMenuButton, { backgroundColor: t.surface, borderColor: t.border }]}
                  onPress={() => setIsCreateRideModalOpen(true)}
                >
                  <MaterialCommunityIcons name="bike-fast" size={16} color={t.primary} />
                  <Text style={createMenuButtonTextStyle}>Create Ride</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity
              style={[styles.fab, { backgroundColor: isCreateMenuOpen ? t.subtle : t.primary, borderColor: t.border }]}
              onPress={() => setIsCreateMenuOpen((prev) => !prev)}
            >
              <MaterialCommunityIcons name={isCreateMenuOpen ? 'close' : 'plus'} size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.tabBar, { borderTopColor: t.border, backgroundColor: t.surface }]}>
          <TabButton theme={theme} icon="compass-outline" label="Feed" active={activeTab === 'feed'} onPress={() => setActiveTab('feed')} />
          <TabButton theme={theme} icon="newspaper-variant-outline" label="News" active={activeTab === 'news'} onPress={() => setActiveTab('news')} />
          <TabButton
            theme={theme}
            icon="map-marker-path"
            label="My Rides"
            active={activeTab === 'my-rides'}
            onPress={() => setActiveTab('my-rides')}
          />
          <TabButton theme={theme} icon="message-outline" label="Chats" active={activeTab === 'chats'} onPress={() => setActiveTab('chats')} />
          <TabButton theme={theme} icon="account-group-outline" label="Groups" active={activeTab === 'group'} onPress={() => setActiveTab('group')} />
        </View>
      </View>

      <LocationSettingsModal
        visible={isLocationModalOpen}
        theme={theme}
        cityInput={manualCityInput}
        onChangeCityInput={setManualCityInput}
        locationMode={locationMode}
        isDetectingLocation={isDetectingLocation}
        locationPermissionStatus={locationPermissionStatus}
        onClose={() => setIsLocationModalOpen(false)}
        onSaveManualCity={handleSaveManualCity}
        onUseAutoLocation={handleSwitchToAutoLocation}
      />

      <NotificationsOverlay
        visible={isNotificationsOpen}
        theme={theme}
        notifications={visibleNotifications}
        onClose={() => setIsNotificationsOpen(false)}
        onClear={handleClearNotifications}
        onMarkRead={handleMarkNotificationRead}
        onAcceptFriend={handleAcceptFriendRequest}
        onRejectFriend={handleRejectFriendRequest}
      />

      <NewsArticleModal
        visible={Boolean(activeNewsArticleUrl)}
        url={activeNewsArticleUrl}
        theme={theme}
        onClose={() => setActiveNewsArticleUrl(null)}
      />

      <ChatRoomScreen
        visible={Boolean(activeConversation)}
        conversation={activeConversation}
        currentUserId={currentUser.id}
        syncError={syncState.chat.error}
        isSyncing={syncState.chat.isSyncing}
        onRetrySync={handleRetryChatSync}
        onClose={() => setActiveConversation(null)}
        onSendMessage={handleSendMessage}
        theme={theme}
      />

      <GroupChatRoomScreen
        visible={Boolean(activeGroupChat)}
        group={activeGroupChat}
        messages={activeGroupChatMessages}
        currentUserId={currentUser.id}
        users={allUsers}
        syncError={syncState.groupChat.error}
        isSyncing={syncState.groupChat.isSyncing}
        onRetrySync={handleRetryGroupChatSync}
        onClose={() => setActiveGroupChatId(null)}
        onSendMessage={handleSendGroupMessage}
        theme={theme}
      />

      <CreateHelpModal
        visible={isCreateHelpModalOpen}
        theme={theme}
        onClose={() => setIsCreateHelpModalOpen(false)}
        onSubmit={handleCreateHelpRequest}
      />

      <CreateRideModal
        visible={isCreateRideModalOpen || Boolean(editingRide)}
        theme={theme}
        currentCity={currentUser.city}
        userGroups={rideComposerGroups}
        initialRide={editingRide}
        onClose={handleCloseRideComposer}
        onSubmit={handleSubmitRideComposer}
      />

      <EditProfileModal
        visible={isEditProfileOpen}
        user={currentUser}
        theme={theme}
        onClose={() => setIsEditProfileOpen(false)}
        onSave={handleUpdateProfile}
        onUploadProfilePhoto={handleUploadProfilePhoto}
        onUploadBikePhoto={handleUploadBikePhoto}
        isUploadingProfilePhoto={isUploadingProfilePhoto}
        uploadingBikeName={uploadingBikeName}
      />

      <RideDetailScreen
        visible={isRideDetailOpen && Boolean(selectedRide)}
        ride={selectedRide}
        users={rideUsersForModal}
        currentUser={currentUser}
        theme={theme}
        onClose={() => setIsRideDetailOpen(false)}
        onRequestJoin={handleRequestToJoinRide}
        onAcceptRequest={handleAcceptRideRequest}
        onRejectRequest={handleRejectRideRequest}
        onUpdateRide={handleUpdateRide}
        onEditRide={handleOpenRideEditor}
        onCancelRide={handleCancelRide}
        onLeaveRide={handleLeaveRide}
        onReportRide={handleReportRide}
        rideTrackingSession={effectiveRideTrackingSession}
        isLiveTrackingSyncing={syncState.rideTracking.isSyncing}
        liveTrackingSyncError={syncState.rideTracking.error}
        isStartingRideTracking={isStartingRideTracking}
        isStoppingRideTracking={isStoppingRideTracking}
        isUpdatingRideCheckIn={isUpdatingRideCheckIn}
        isSendingRideSos={isSendingRideSos}
        rideCheckInGeofenceRadiusMeters={RIDE_CHECK_IN_GEOFENCE_RADIUS_METERS}
        onRetryRideTrackingSync={handleRetryRideTrackingSync}
        onStartRideTracking={handleStartRideTracking}
        onStopRideTracking={handleStopRideTracking}
        onToggleRideCheckIn={handleToggleRideCheckIn}
        onSendRideSos={handleSendRideSos}
        isCreatorBlocked={Boolean(selectedRide && blockedUserIds.has(selectedRide.creatorId))}
        onHandleViewProfile={handleViewProfile}
      />

      <HelpDetailScreen
        visible={isHelpDetailOpen && Boolean(selectedHelpPost)}
        post={selectedHelpPost}
        currentUser={currentUser}
        theme={theme}
        onClose={() => setIsHelpDetailOpen(false)}
        onResolve={handleResolveHelp}
        onUpvote={handleUpvoteHelp}
        onReply={handleReplyHelp}
        onReportPost={handleReportHelpPost}
        isCreatorBlocked={Boolean(selectedHelpPost && blockedUserIds.has(selectedHelpPost.creatorId))}
        onHandleViewProfile={handleViewProfile}
      />

      <UserProfileModal
        visible={Boolean(selectedUserProfile)}
        user={selectedUserProfile}
        rides={visibleRides}
        isLimitedProfile={Boolean(selectedUserProfile?.isInferredProfile)}
        theme={theme}
        friendStatus={selectedFriendStatus}
        onClose={() => setSelectedUserId(null)}
        onMessage={openOrCreateConversation}
        onAddFriend={handleSendFriendRequest}
        onBlockUser={handleBlockUser}
        isBlocked={Boolean(selectedUserProfile && blockedUserIds.has(selectedUserProfile.id))}
      />

      <CreateGroupModal
        visible={isCreateGroupModalOpen}
        theme={theme}
        mode={editingGroup ? 'edit' : 'create'}
        initialData={editingGroup}
        onClose={() => {
          setIsCreateGroupModalOpen(false);
          setEditingGroupId(null);
        }}
        onSubmit={editingGroup ? handleUpdateGroup : handleCreateGroup}
        isSubmitting={isCreatingGroup}
      />

      <GroupDetailModal
        visible={Boolean(selectedGroup)}
        group={selectedGroup}
        rides={visibleRides}
        currentUser={currentUser}
        users={groupUsersForModal}
        theme={theme}
        onClose={() => setSelectedGroupId(null)}
        onOpenGroupChat={handleOpenGroupChat}
        onJoinGroup={handleJoinGroup}
        onLeaveGroup={handleLeaveGroup}
        onAcceptJoinRequest={handleAcceptGroupJoinRequest}
        onRejectJoinRequest={handleRejectGroupJoinRequest}
        onPromoteAdmin={handlePromoteGroupAdmin}
        onDemoteAdmin={handleDemoteGroupAdmin}
        onEditGroup={(groupId) => {
          setEditingGroupId(groupId);
          setIsCreateGroupModalOpen(true);
        }}
        onDeleteGroup={handleDeleteGroup}
        onRemoveMember={handleRemoveGroupMember}
        onViewProfile={handleViewProfile}
      />

      <RideCreatedSuccessfullyModal
        visible={Boolean(createdRide)}
        theme={theme}
        ride={createdRide}
        currentUserId={currentUser.id}
        onClose={() => setCreatedRide(null)}
        onViewProfile={handleViewProfile}
      />
    </SafeAreaView>
  );

  // Never open CompleteProfile directly from app bootstrap.
  // Profile completion should only happen after an explicit login/OTP flow.
  const resolvePostLoginRoute = (user: typeof currentUser) => user.profileComplete === false ? 'Login' : 'Main';

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Splash">
          {({ navigation }) => (
            <SplashRoute theme={theme} ready={hydrated} onComplete={() => {
              if (!isLoggedIn) {
                navigation.replace('Login');
              } else {
                navigation.replace(resolvePostLoginRoute(currentUser));
              }
            }} />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Login">
          {({ navigation }) => (
            <LoginScreen
              onLogin={async (payload: LoginPayload) => {
                const normalizedPhone = normalizePhoneToE164(payload.phoneNumber);
                if (!normalizedPhone) {
                  throw new Error('Please enter a valid phone number.');
                }

                let resolvedUser: typeof currentUser | null = null;
                let isKnownExistingPhoneIdentity = false;

                if (BETA_MODE_ENABLED) {
                  if (BETA_ALLOWED_PHONES.length > 0 && !BETA_ALLOWED_PHONES.includes(normalizedPhone)) {
                    throw new Error('This number is not enabled for this beta build.');
                  }

                  const betaUser = await signInWithBetaPhoneIdentity(normalizedPhone);
                  isKnownExistingPhoneIdentity = betaUser.isNewUser === false;
                  resolvedUser = await applyAuthenticatedSession({
                    uid: betaUser.uid,
                    phoneNumber: normalizedPhone
                  });
                } else if (payload.uid) {
                  resolvedUser = await applyAuthenticatedSession({
                    uid: payload.uid,
                    phoneNumber: normalizedPhone
                  });
                } else if (FIREBASE_ENABLED) {
                  throw new Error('Phone verification did not create a Firebase session. Please request a new OTP and try again.');
                } else {
                  setCurrentUser((prev) => {
                    const updated = { ...prev, phoneNumber: normalizedPhone || prev.phoneNumber };
                    resolvedUser = updated;
                    return updated;
                  });
                  setIsLoggedIn(true);
                }

                let userForRoute = resolvedUser ?? currentUser;
                if (userForRoute.profileComplete === false) {
                  let completedForPhone = await isProfileCompletedForPhone(normalizedPhone);
                  if (!completedForPhone && isKnownExistingPhoneIdentity) {
                    completedForPhone = true;
                  }
                  if (completedForPhone) {
                    userForRoute = { ...userForRoute, profileComplete: true };
                    setCurrentUser((prev) => ({
                      ...prev,
                      profileComplete: true
                    }));
                  }
                }

                if (userForRoute.profileComplete) {
                  void markProfileCompletedForPhone(normalizedPhone);
                }

                if (userForRoute.profileComplete === false) {
                  navigation.replace('CompleteProfile');
                  return;
                }
                navigation.replace('Main');
              }}
              theme={theme}
              onToggleTheme={setTheme}
              firebaseEnabled={FIREBASE_ENABLED}
              betaModeEnabled={BETA_MODE_ENABLED}
              betaDefaultOtp={BETA_DEFAULT_OTP}
              betaAllowedPhones={BETA_ALLOWED_PHONES}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="CompleteProfile">
          {({ navigation }) => (
            <CompleteProfileScreen
              theme={theme}
              phoneNumber={currentUser.phoneNumber}
              onSubmit={(data) => {
                setCurrentUser((prev) => {
                  const normalizedFirstName = data.firstName.trim();
                  const normalizedLastName = data.lastName.trim();
                  const normalizedFullName = [normalizedFirstName, normalizedLastName].filter(Boolean).join(' ');
                  const updated = {
                    ...prev,
                    name: normalizedFirstName || prev.name,
                    firstName: normalizedFirstName,
                    lastName: normalizedLastName,
                    fullName: normalizedFullName || prev.fullName,
                    sosNumber: data.sosNumber,
                    sosContacts: data.sosContacts,
                    dob: data.dob,
                    bloodGroup: data.bloodGroup,
                    profileComplete: true
                  };
                  if (FIREBASE_ENABLED) {
                    void upsertUserInFirestore(updated);
                  }
                  if (updated.profileComplete && updated.phoneNumber) {
                    void markProfileCompletedForPhone(updated.phoneNumber);
                  }
                  void saveToStorage(STORAGE_KEYS.currentUser, updated);
                  return updated;
                });
                navigation.replace('Main');
              }}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Main">
          {({ navigation }) =>
            renderMainScreen(() => {
              void handleLogout().finally(() => {
                navigation.replace('Login');
              });
            })
          }
        </RootStack.Screen>
      </RootStack.Navigator>
    </NavigationContainer>
  );
};

const App = () => {
  const [iconFontsLoaded] = useFonts({
    ...MaterialCommunityIcons.font
  });

  if (!iconFontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <AppShell />
      </AppStateProvider>
    </SafeAreaProvider>
  );
};

export default App;
