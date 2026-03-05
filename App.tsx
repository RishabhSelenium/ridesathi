import 'react-native-gesture-handler';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar as RNStatusBar,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { styles } from './src/app/styles';
import {
  FriendStatus,
  LocationMode,
  PermissionStatus,
  Theme,
  TOKENS,
  avatarFallback
} from './src/app/ui';
import { canUserViewRideInFeed } from './src/app/feed-visibility';
import { TabButton } from './src/components/common';
import {
  ChatRoomScreen,
  CreateHelpModal,
  CreateRideModal,
  CreateSquadModal,
  EditProfileModal,
  HelpDetailScreen,
  LocationSettingsModal,
  NewsArticleModal,
  NotificationsOverlay,
  RideDetailScreen,
  SquadDetailModal,
  UserProfileModal
} from './src/components/modals';
import { ChatsTab, FeedTab, LoginScreen, MyRidesTab, NewsTab, ProfileTab, SplashScreen, SquadTab } from './src/screens/tabs';
import {
  MOCK_CONVERSATIONS,
  MOCK_CURRENT_USER,
  MOCK_HELP,
  MOCK_NEWS,
  MOCK_NOTIFICATIONS,
  MOCK_RIDES,
  MOCK_SQUADS,
  MOCK_USERS
} from './src/constants';
import {
  ChatMessage,
  Conversation,
  HelpPost,
  HelpReply,
  ModerationReport,
  NewsArticle,
  Notification,
  RidePost,
  RideVisibility,
  Squad,
  User
} from './src/types';
import { signInWithBetaPhoneIdentity, signOutFirebase, subscribeToAuthState } from './src/firebase/auth';
import { sendChatMessageToRealtime, subscribeChatMessages } from './src/firebase/chat';
import { getFirebaseServices, isFirebaseConfigured } from './src/firebase/client';
import {
  createModerationReportInFirestore,
  deleteRideInFirestore,
  fetchUserByIdFromFirestore,
  fetchHelpPostsFromFirestore,
  fetchRidesFromFirestore,
  fetchSquadsFromFirestore,
  fetchUsersFromFirestore,
  upsertHelpPostInFirestore,
  upsertRideInFirestore,
  upsertSquadInFirestore,
  upsertUserInFirestore
} from './src/firebase/firestore';
import { triggerRideCancelledNotification, triggerRideCreatedNotification } from './src/firebase/functions';
import { installCrashLogging, logAnalyticsEvent } from './src/firebase/telemetry';
import { fetchLatestNewsArticles } from './src/news/live-news';
import { AppStateProvider, useAppState } from './src/state/app-state-context';

const STORAGE_KEYS = {
  theme: 'ridesathi.theme',
  currentUser: 'ridesathi.currentUser',
  users: 'ridesathi.users',
  notifications: 'ridesathi.notifications',
  rides: 'ridesathi.rides',
  helpPosts: 'ridesathi.helpPosts',
  conversations: 'ridesathi.conversations',
  news: 'ridesathi.news',
  squads: 'ridesathi.squads',
  locationMode: 'ridesathi.locationMode',
  moderationReports: 'ridesathi.moderationReports'
} as const;

const SESSION_STORAGE_KEYS = [
  STORAGE_KEYS.currentUser,
  STORAGE_KEYS.users,
  STORAGE_KEYS.notifications,
  STORAGE_KEYS.rides,
  STORAGE_KEYS.helpPosts,
  STORAGE_KEYS.conversations,
  STORAGE_KEYS.squads,
  STORAGE_KEYS.locationMode,
  STORAGE_KEYS.moderationReports
];

type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  Main: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const FIREBASE_ENABLED = isFirebaseConfigured();
const NEWS_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
type SyncChannel = 'rides' | 'help' | 'chat' | 'news';
type SyncChannelState = {
  isSyncing: boolean;
  error: string | null;
  lastSuccessAt: string | null;
};
type SyncState = Record<SyncChannel, SyncChannelState>;

const INITIAL_SYNC_STATE: SyncState = {
  rides: { isSyncing: false, error: null, lastSuccessAt: null },
  help: { isSyncing: false, error: null, lastSuccessAt: null },
  chat: { isSyncing: false, error: null, lastSuccessAt: null },
  news: { isSyncing: false, error: null, lastSuccessAt: null }
};

const uniqueStrings = (values: string[]) => Array.from(new Set(values));
const RIDE_VISIBILITY_OPTIONS: RideVisibility[] = ['Nearby', 'City', 'Friends'];
const isRideVisibility = (value: string): value is RideVisibility => RIDE_VISIBILITY_OPTIONS.includes(value as RideVisibility);
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

const normalizeRides = (items: RidePost[]): RidePost[] =>
  items.map((ride) => ({
    ...ride,
    visibility: normalizeRideVisibility(ride.visibility)
  }));

const safeParse = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

type LoginPayload = {
  uid?: string;
  phoneNumber: string;
};

const fallbackSyncErrorByChannel: Record<SyncChannel, string> = {
  rides: 'Unable to sync rides right now. Check your network and retry.',
  help: 'Unable to sync help posts right now. Check your network and retry.',
  chat: 'Chat sync is unavailable right now. Check your network and retry.',
  news: 'Unable to refresh the news feed right now. Check your network and retry.'
};

const buildSyncErrorMessage = (channel: SyncChannel, error: unknown): string => {
  const fallback = fallbackSyncErrorByChannel[channel];
  if (!(error instanceof Error)) return fallback;
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
    blockedUserIds: Array.isArray(base.blockedUserIds) ? base.blockedUserIds : []
  };
};

const getCurrentUserFromStorage = async () => {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.currentUser);
  const persisted = safeParse<Partial<User>>(raw, {});

  return {
    ...MOCK_CURRENT_USER,
    ...persisted,
    friendRequests: {
      ...MOCK_CURRENT_USER.friendRequests,
      ...(persisted.friendRequests ?? {})
    },
    blockedUserIds: Array.isArray(persisted.blockedUserIds) ? persisted.blockedUserIds : MOCK_CURRENT_USER.blockedUserIds
  };
};

const saveToStorage = async <T,>(key: string, value: T) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore persistence errors
  }
};

const SplashRoute = ({ theme, onComplete }: { theme: Theme; onComplete: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2200);
    return () => clearTimeout(timer);
  }, []);

  return <SplashScreen theme={theme} />;
};

const AppShell = () => {
  const isExpoGo = Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo';
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
    squads,
    setSquads,
    isCreateSquadModalOpen,
    setIsCreateSquadModalOpen,
    selectedSquadId,
    setSelectedSquadId,
    squadSearchQuery,
    setSquadSearchQuery
  } = useAppState();

  const t = TOKENS[theme];
  const createMenuButtonTextStyle = [styles.createMenuButtonText, { color: t.text }];
  const androidTopInset = Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0;
  const lastSyncedUsersRef = useRef<Map<string, string> | null>(null);
  const friendRequestTimestampsRef = useRef<number[]>([]);
  const friendRequestCooldownByUserRef = useRef<Map<string, number>>(new Map());
  const helpReplyTimestampsRef = useRef<number[]>([]);
  const helpReplyMetaByPostRef = useRef<Map<string, { sentAt: number; text: string }>>(new Map());
  const chatTimestampsByConversationRef = useRef<Map<string, number[]>>(new Map());
  const chatLastMessageByConversationRef = useRef<Map<string, { sentAt: number; text: string }>>(new Map());
  const lastGuardrailNotificationRef = useRef<{ sentAt: number; message: string } | null>(null);
  const hasLoggedAppOpenRef = useRef(false);
  const [syncState, setSyncState] = useState<SyncState>(INITIAL_SYNC_STATE);
  const [chatSyncRetryToken, setChatSyncRetryToken] = useState(0);
  const [activeNewsArticleUrl, setActiveNewsArticleUrl] = useState<string | null>(null);

  const clearPersistedSessionStorage = useCallback(async () => {
    try {
      await AsyncStorage.multiRemove(SESSION_STORAGE_KEYS);
    } catch {
      // ignore persistence cleanup errors
    }
  }, []);

  const resetSessionState = useCallback(() => {
    setCurrentUser(MOCK_CURRENT_USER);
    setUsers(MOCK_USERS);
    setNotifications(MOCK_NOTIFICATIONS);
    setRides(MOCK_RIDES);
    setHelpPosts(MOCK_HELP);
    setConversations(MOCK_CONVERSATIONS);
    setSquads(MOCK_SQUADS);
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
    setIsCreateSquadModalOpen(false);
    setSelectedSquadId(null);
    setSquadSearchQuery('');
    setFeedFilter('rides');
    setActiveTab('feed');
    setSyncState(INITIAL_SYNC_STATE);
    setChatSyncRetryToken(0);
    setActiveNewsArticleUrl(null);

    lastSyncedUsersRef.current = null;
    friendRequestTimestampsRef.current = [];
    friendRequestCooldownByUserRef.current = new Map();
    helpReplyTimestampsRef.current = [];
    helpReplyMetaByPostRef.current = new Map();
    chatTimestampsByConversationRef.current = new Map();
    chatLastMessageByConversationRef.current = new Map();
    lastGuardrailNotificationRef.current = null;
  }, [
    setActiveConversation,
    setActiveNewsArticleUrl,
    setActiveTab,
    setChatSyncRetryToken,
    setConversations,
    setCurrentUser,
    setFeedFilter,
    setHelpPosts,
    setIsCreateHelpModalOpen,
    setIsCreateMenuOpen,
    setIsCreateRideModalOpen,
    setIsCreateSquadModalOpen,
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
    setSelectedSquadId,
    setSelectedUserId,
    setSquadSearchQuery,
    setSquads,
    setSyncState,
    setUsers
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

  const runRideMutationSync = useCallback(
    (operation: () => Promise<void>) => {
      if (!FIREBASE_ENABLED) return;
      startSync('rides');
      void operation().then(() => markSyncSuccess('rides')).catch((error) => markSyncFailure('rides', error));
    },
    [markSyncFailure, markSyncSuccess, startSync]
  );

  const runHelpMutationSync = useCallback(
    (operation: () => Promise<void>) => {
      if (!FIREBASE_ENABLED) return;
      startSync('help');
      void operation().then(() => markSyncSuccess('help')).catch((error) => markSyncFailure('help', error));
    },
    [markSyncFailure, markSyncSuccess, startSync]
  );

  const syncRidesFromCloud = useCallback(async () => {
    if (!FIREBASE_ENABLED) return;
    startSync('rides');

    try {
      const remoteRides = await fetchRidesFromFirestore();
      setRides(normalizeRides(remoteRides));
      markSyncSuccess('rides');
    } catch (error) {
      markSyncFailure('rides', error);
    }
  }, [markSyncFailure, markSyncSuccess, setRides, startSync]);

  const syncHelpFromCloud = useCallback(async () => {
    if (!FIREBASE_ENABLED) return;
    startSync('help');

    try {
      const remoteHelpPosts = await fetchHelpPostsFromFirestore();
      setHelpPosts(remoteHelpPosts);
      markSyncSuccess('help');
    } catch (error) {
      markSyncFailure('help', error);
    }
  }, [markSyncFailure, markSyncSuccess, setHelpPosts, startSync]);

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
        const toSignature = (items: NewsArticle[]) =>
          items
            .map((item) => `${item.id}:${item.image ?? ''}:${item.summary}:${item.duplicateScore}:${item.relevanceScore}:${item.viralityScore}`)
            .join('|');

        const previousSignature = toSignature(previousNews);
        const nextSignature = toSignature(latestNews);
        return previousSignature === nextSignature ? previousNews : latestNews;
      });
      markSyncSuccess('news');
    } catch (error) {
      markSyncFailure('news', error);
    }
  }, [markSyncFailure, markSyncSuccess, setNewsArticles, startSync]);

  const applyAuthenticatedSession = useCallback(
    async (payload: { uid: string; phoneNumber?: string }) => {
      let remoteUser: User | null = null;
      const authUser = FIREBASE_ENABLED ? getFirebaseServices()?.auth.currentUser ?? null : null;
      const canSyncCloud = FIREBASE_ENABLED && Boolean(authUser);

      if (canSyncCloud) {
        try {
          remoteUser = await fetchUserByIdFromFirestore(payload.uid);
        } catch {
          remoteUser = null;
        }
      }

      setCurrentUser((prev) => {
        const seed = remoteUser ?? (prev.id === payload.uid ? prev : undefined);
        return buildAuthenticatedUser(payload.uid, payload.phoneNumber, seed);
      });
      setUsers((prev) => prev.filter((user) => user.id !== payload.uid));
      setIsLoggedIn(true);

      if (!canSyncCloud) {
        return;
      }

      startSync('rides');
      startSync('help');

      const [remoteUsersResult, remoteRidesResult, remoteHelpPostsResult, remoteSquadsResult] = await Promise.allSettled([
        fetchUsersFromFirestore(),
        fetchRidesFromFirestore(),
        fetchHelpPostsFromFirestore(),
        fetchSquadsFromFirestore()
      ]);

      if (remoteUsersResult.status === 'fulfilled' && remoteUsersResult.value.length > 0) {
        const me = remoteUsersResult.value.find((user) => user.id === payload.uid);
        if (me) {
          setCurrentUser((prev) => ({
            ...prev,
            ...me,
            friendRequests: {
              ...prev.friendRequests,
              ...me.friendRequests
            }
          }));
        }
        setUsers(remoteUsersResult.value.filter((user) => user.id !== payload.uid));
      }

      if (remoteRidesResult.status === 'fulfilled') {
        setRides(normalizeRides(remoteRidesResult.value));
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

      if (remoteSquadsResult.status === 'fulfilled' && remoteSquadsResult.value.length > 0) {
        setSquads(remoteSquadsResult.value);
      }
    },
    [markSyncFailure, markSyncSuccess, setCurrentUser, setHelpPosts, setIsLoggedIn, setRides, setSquads, setUsers, startSync]
  );

  useEffect(() => {
    let mounted = true;

    const hydrate = async () => {
      try {
        const [savedTheme, savedUsers, savedNotifications, savedRides, savedHelpPosts, savedConversations, savedNews, savedSquads, savedLocationMode] =
          await Promise.all([
            AsyncStorage.getItem(STORAGE_KEYS.theme),
            AsyncStorage.getItem(STORAGE_KEYS.users),
            AsyncStorage.getItem(STORAGE_KEYS.notifications),
            AsyncStorage.getItem(STORAGE_KEYS.rides),
            AsyncStorage.getItem(STORAGE_KEYS.helpPosts),
            AsyncStorage.getItem(STORAGE_KEYS.conversations),
            AsyncStorage.getItem(STORAGE_KEYS.news),
            AsyncStorage.getItem(STORAGE_KEYS.squads),
            AsyncStorage.getItem(STORAGE_KEYS.locationMode)
          ]);

        const nextCurrentUser = await getCurrentUserFromStorage();
        const authUser = FIREBASE_ENABLED ? getFirebaseServices()?.auth.currentUser ?? null : null;
        const hasAuthenticatedSession = FIREBASE_ENABLED ? Boolean(authUser) : true;
        const effectiveCurrentUser = authUser
          ? buildAuthenticatedUser(
            authUser.uid,
            authUser.phoneNumber ?? undefined,
            nextCurrentUser.id === authUser.uid ? nextCurrentUser : undefined
          )
          : hasAuthenticatedSession
            ? nextCurrentUser
            : MOCK_CURRENT_USER;

        if (!mounted) return;

        setTheme(safeParse<Theme>(savedTheme, 'dark'));
        setCurrentUser(effectiveCurrentUser);
        if (authUser) {
          setIsLoggedIn(true);
        }
        setUsers(hasAuthenticatedSession ? safeParse<User[]>(savedUsers, MOCK_USERS) : MOCK_USERS);
        setNotifications(hasAuthenticatedSession ? safeParse<Notification[]>(savedNotifications, MOCK_NOTIFICATIONS) : MOCK_NOTIFICATIONS);
        setRides(hasAuthenticatedSession ? normalizeRides(safeParse<RidePost[]>(savedRides, MOCK_RIDES)) : MOCK_RIDES);
        setHelpPosts(hasAuthenticatedSession ? safeParse<HelpPost[]>(savedHelpPosts, MOCK_HELP) : MOCK_HELP);
        setConversations(hasAuthenticatedSession ? safeParse<Conversation[]>(savedConversations, MOCK_CONVERSATIONS) : MOCK_CONVERSATIONS);
        setNewsArticles(safeParse<NewsArticle[]>(savedNews, MOCK_NEWS));
        setSquads(hasAuthenticatedSession ? safeParse<Squad[]>(savedSquads, MOCK_SQUADS) : MOCK_SQUADS);
        setLocationMode(hasAuthenticatedSession ? safeParse<LocationMode>(savedLocationMode, 'auto') : 'auto');

        if (FIREBASE_ENABLED && !hasAuthenticatedSession) {
          void clearPersistedSessionStorage();
        }

        if (FIREBASE_ENABLED && hasAuthenticatedSession) {
          startSync('rides');
          startSync('help');

          const [remoteUsersResult, remoteRidesResult, remoteHelpPostsResult, remoteSquadsResult] = await Promise.allSettled([
            fetchUsersFromFirestore(),
            fetchRidesFromFirestore(),
            fetchHelpPostsFromFirestore(),
            fetchSquadsFromFirestore()
          ]);

          if (!mounted) return;

          if (remoteUsersResult.status === 'fulfilled' && remoteUsersResult.value.length > 0) {
            const me = remoteUsersResult.value.find((user) => user.id === effectiveCurrentUser.id);
            if (me) {
              setCurrentUser((prev) => ({
                ...prev,
                ...me,
                friendRequests: {
                  ...prev.friendRequests,
                  ...me.friendRequests
                }
              }));
            }

            setUsers(remoteUsersResult.value.filter((user) => user.id !== effectiveCurrentUser.id));
          }

          if (remoteRidesResult.status === 'fulfilled') {
            setRides(normalizeRides(remoteRidesResult.value));
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

          if (remoteSquadsResult.status === 'fulfilled' && remoteSquadsResult.value.length > 0) {
            setSquads(remoteSquadsResult.value);
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
      if (!user) {
        clearSession();
        return;
      }

      void applyAuthenticatedSession({
        uid: user.uid,
        phoneNumber: user.phoneNumber ?? undefined
      });
    });
    return unsubscribe;
  }, [applyAuthenticatedSession, clearSession]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(STORAGE_KEYS.theme, theme);
  }, [hydrated, theme]);

  useEffect(() => {
    if (!hydrated || !isLoggedIn) return;
    saveToStorage(STORAGE_KEYS.currentUser, currentUser);
  }, [hydrated, isLoggedIn, currentUser]);

  useEffect(() => {
    if (!hydrated || !isLoggedIn || !FIREBASE_ENABLED) return;
    void upsertUserInFirestore(currentUser);
  }, [hydrated, isLoggedIn, currentUser]);

  useEffect(() => {
    if (!hydrated || !isLoggedIn) return;
    saveToStorage(STORAGE_KEYS.users, users);
  }, [hydrated, isLoggedIn, users]);

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
    users.forEach((user) => {
      if (previousSignatures.get(user.id) !== nextSignatures.get(user.id)) {
        void upsertUserInFirestore(user);
      }
    });

    lastSyncedUsersRef.current = nextSignatures;
  }, [hydrated, isLoggedIn, users]);

  useEffect(() => {
    if (!hydrated || !isLoggedIn) return;
    saveToStorage(STORAGE_KEYS.notifications, notifications);
  }, [hydrated, isLoggedIn, notifications]);

  useEffect(() => {
    if (!hydrated || !isLoggedIn) return;
    saveToStorage(STORAGE_KEYS.rides, rides);
  }, [hydrated, isLoggedIn, rides]);

  useEffect(() => {
    if (!hydrated || !isLoggedIn) return;
    saveToStorage(STORAGE_KEYS.helpPosts, helpPosts);
  }, [hydrated, isLoggedIn, helpPosts]);

  useEffect(() => {
    if (!hydrated || !isLoggedIn) return;
    saveToStorage(STORAGE_KEYS.conversations, conversations);
  }, [hydrated, isLoggedIn, conversations]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(STORAGE_KEYS.news, newsArticles);
  }, [hydrated, newsArticles]);

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
    if (!hydrated || !isLoggedIn) return;
    saveToStorage(STORAGE_KEYS.squads, squads);
  }, [hydrated, isLoggedIn, squads]);

  useEffect(() => {
    if (!hydrated || !isLoggedIn) return;
    saveToStorage(STORAGE_KEYS.locationMode, locationMode);
  }, [hydrated, isLoggedIn, locationMode]);

  const usersById = useMemo(() => {
    const byId = new Map<string, User>();
    byId.set(currentUser.id, currentUser);
    users.forEach((user) => byId.set(user.id, user));
    return byId;
  }, [currentUser, users]);

  const blockedUserIds = useMemo(() => new Set(currentUser.blockedUserIds), [currentUser.blockedUserIds]);
  const visibleUsers = useMemo(() => users.filter((user) => !blockedUserIds.has(user.id)), [users, blockedUserIds]);
  const allUsers = useMemo(() => Array.from(usersById.values()), [usersById]);
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

  const selectedRide = useMemo(() => {
    if (!selectedRideId) return null;
    return rides.find((ride) => ride.id === selectedRideId) ?? null;
  }, [rides, selectedRideId]);

  const selectedUserProfile = useMemo(() => {
    if (!selectedUserId) return null;
    if (blockedUserIds.has(selectedUserId)) return null;
    if (selectedUserId === currentUser.id) return currentUser;
    return users.find((user) => user.id === selectedUserId) ?? null;
  }, [selectedUserId, blockedUserIds, currentUser, users]);

  const selectedSquad = useMemo(() => {
    if (!selectedSquadId) return null;
    return squads.find((s) => s.id === selectedSquadId) ?? null;
  }, [squads, selectedSquadId]);

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
    if (!FIREBASE_ENABLED || !activeConversation) return;
    const conversationId = activeConversation.id;
    startSync('chat');

    return subscribeChatMessages(
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
        markSyncFailure('chat', error);
      }
    );
  }, [activeConversation?.id, chatSyncRetryToken, markSyncFailure, markSyncSuccess, startSync]);

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

  const ensureNotificationPermission = async (showAlertOnDeny = false) => {
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
      const Notifications = await import('expo-notifications');
      const existing = await Notifications.getPermissionsAsync();
      let status = existing.status;

      if (status !== 'granted') {
        const asked = await Notifications.requestPermissionsAsync();
        status = asked.status;
      }

      const mapped: PermissionStatus = status === 'granted' ? 'granted' : 'denied';
      setNotificationPermissionStatus(mapped);

      if (mapped === 'denied' && showAlertOnDeny) {
        Alert.alert(
          'Notifications Disabled',
          'You can enable notifications later in app settings to receive ride and chat alerts.'
        );
      }
      return mapped === 'granted';
    } catch {
      setNotificationPermissionStatus('denied');
      return false;
    }
  };

  useEffect(() => {
    if (!hydrated || !isLoggedIn) return;
    void ensureNotificationPermission();
  }, [hydrated, isLoggedIn]);

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
    const notification: Notification = {
      id: `system-${Date.now()}`,
      type: 'message',
      senderId: 'system',
      senderName: 'ThrottleUp',
      senderAvatar: avatarFallback,
      content,
      timestamp: new Date().toISOString(),
      read: false
    };

    setNotifications((prev) => [notification, ...prev]);
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

  const handleReportUser = (userId: string) => {
    if (userId === currentUser.id) return;

    const targetUser = usersById.get(userId);
    if (!targetUser) return;

    Alert.alert('Report rider?', `Report ${targetUser.name} for abusive or unsafe behavior?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        style: 'destructive',
        onPress: () => {
          submitModerationReport({
            targetType: 'user',
            targetId: userId,
            reason: 'Abusive or unsafe rider behavior'
          });
        }
      }
    ]);
  };

  const handleReportRide = (rideId: string) => {
    const targetRide = rides.find((ride) => ride.id === rideId);
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
    const targetPost = helpPosts.find((post) => post.id === postId);
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

    const targetUser = usersById.get(userId);
    if (!targetUser) return;

    if (currentUser.blockedUserIds.includes(userId)) {
      pushSystemNotification(`${targetUser.name} is already blocked.`);
      setIsNotificationsOpen(true);
      return;
    }

    Alert.alert('Block rider?', `Block ${targetUser.name}? You will no longer see their posts or chats.`, [
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
          pushSystemNotification(`${targetUser.name} has been blocked.`);
          setIsNotificationsOpen(true);
        }
      }
    ]);
  };

  const openOrCreateConversation = (userId: string) => {
    if (userId === currentUser.id) return;
    if (blockedUserIds.has(userId)) {
      pushSystemNotification('This rider is blocked. Unblock them to start a chat.');
      setIsNotificationsOpen(true);
      return;
    }

    const participant = users.find((user) => user.id === userId);
    if (!participant) return;

    setConversations((prev) => {
      const existingConversation = prev.find((conv) => conv.participantId === userId);

      if (existingConversation) {
        const openedConversation = { ...existingConversation, unreadCount: 0 };
        setActiveConversation(openedConversation);
        return prev.map((conv) => (conv.id === openedConversation.id ? openedConversation : conv));
      }

      const newConversation: Conversation = {
        id: `conv-${Date.now()}`,
        participantId: participant.id,
        participantName: participant.name,
        participantAvatar: participant.avatar,
        lastMessage: 'You are now connected! Say hi.',
        timestamp: 'Just now',
        unreadCount: 0,
        messages: []
      };

      setActiveConversation(newConversation);
      return [newConversation, ...prev];
    });

    setSelectedUserId(null);
    setActiveTab('chats');
  };

  const handleViewProfile = (userId: string) => {
    if (blockedUserIds.has(userId)) {
      pushSystemNotification('This rider is blocked.');
      setIsNotificationsOpen(true);
      return;
    }
    if (!allUsers.some((user) => user.id === userId)) return;
    setSelectedUserId(userId);
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
    const rideToCancel = rides.find((ride) => ride.id === rideId);
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
    if (FIREBASE_ENABLED) {
      runRideMutationSync(() => deleteRideInFirestore(rideId));
      void triggerRideCancelledNotification(rideId, rideToCancel.title, currentUser.id).catch(() => undefined);
    }
    setIsRideDetailOpen(false);
    setSelectedRideId(null);
  };

  const handleRequestToJoinRide = (rideId: string) => {
    setRides((prev) => {
      let updatedRide: RidePost | null = null;
      let didRequestJoin = false;
      const next = prev.map((ride) => {
        if (ride.id !== rideId) return ride;
        if (blockedUserIds.has(ride.creatorId)) return ride;
        if (ride.currentParticipants.includes(currentUser.id) || ride.requests.includes(currentUser.id)) return ride;
        updatedRide = { ...ride, requests: [...ride.requests, currentUser.id] };
        didRequestJoin = true;
        return updatedRide;
      });

      if (updatedRide && FIREBASE_ENABLED) {
        const rideToSync = updatedRide;
        runRideMutationSync(() => upsertRideInFirestore(rideToSync));
      }

      if (didRequestJoin) {
        void logAnalyticsEvent('join_ride', {
          ride_id: rideId
        });
      }

      return next;
    });
  };

  const handleAcceptRideRequest = (rideId: string, userId: string) => {
    setRides((prev) => {
      let updatedRide: RidePost | null = null;
      const next = prev.map((ride) => {
        if (ride.id !== rideId) return ride;

        if (ride.currentParticipants.includes(userId)) {
          updatedRide = { ...ride, requests: ride.requests.filter((id) => id !== userId) };
          return updatedRide;
        }

        if (ride.currentParticipants.length >= ride.maxParticipants) {
          return ride;
        }

        updatedRide = {
          ...ride,
          currentParticipants: [...ride.currentParticipants, userId],
          requests: ride.requests.filter((id) => id !== userId)
        };
        return updatedRide;
      });

      if (updatedRide && FIREBASE_ENABLED) {
        const rideToSync = updatedRide;
        runRideMutationSync(() => upsertRideInFirestore(rideToSync));
      }

      return next;
    });
  };

  const handleRejectRideRequest = (rideId: string, userId: string) => {
    setRides((prev) => {
      let updatedRide: RidePost | null = null;
      const next = prev.map((ride) => {
        if (ride.id !== rideId) return ride;
        updatedRide = { ...ride, requests: ride.requests.filter((id) => id !== userId) };
        return updatedRide;
      });

      if (updatedRide && FIREBASE_ENABLED) {
        const rideToSync = updatedRide;
        runRideMutationSync(() => upsertRideInFirestore(rideToSync));
      }

      return next;
    });
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
    if (FIREBASE_ENABLED) {
      runRideMutationSync(() => upsertRideInFirestore(newRide));
      void triggerRideCreatedNotification(newRide).catch(() => undefined);
    }
    setIsCreateRideModalOpen(false);
    setIsCreateMenuOpen(false);
    setFeedFilter('rides');
    setActiveTab('feed');
  };

  const handleUpdateProfile = (updates: Partial<User>) => {
    setCurrentUser((prev) => ({ ...prev, ...updates }));
    setIsEditProfileOpen(false);
  };

  const handleCreateSquad = (data: { name: string; description: string; rideStyle: string }) => {
    const newSquad: Squad = {
      id: `sq-${Date.now()}`,
      name: data.name,
      description: data.description,
      creatorId: currentUser.id,
      members: [currentUser.id],
      avatar: `https://api.dicebear.com/7.x/identicon/png?seed=${encodeURIComponent(data.name)}`,
      city: currentUser.city,
      rideStyle: data.rideStyle,
      createdAt: new Date().toISOString()
    };
    setSquads((prev) => [newSquad, ...prev]);
    if (FIREBASE_ENABLED) {
      void upsertSquadInFirestore(newSquad);
    }
    setIsCreateSquadModalOpen(false);
  };

  const handleJoinSquad = (squadId: string) => {
    setSquads((prev) => {
      let updatedSquad: Squad | null = null;
      const next = prev.map((s) => {
        if (s.id !== squadId) return s;
        if (s.members.includes(currentUser.id)) return s;
        updatedSquad = { ...s, members: [...s.members, currentUser.id] };
        return updatedSquad;
      });

      if (updatedSquad && FIREBASE_ENABLED) {
        void upsertSquadInFirestore(updatedSquad);
      }

      return next;
    });
  };

  const handleLeaveSquad = (squadId: string) => {
    setSquads((prev) => {
      let updatedSquad: Squad | null = null;
      const next = prev.map((s) => {
        if (s.id !== squadId) return s;
        if (s.creatorId === currentUser.id) return s;
        if (!s.members.includes(currentUser.id)) return s;
        updatedSquad = { ...s, members: s.members.filter((id) => id !== currentUser.id) };
        return updatedSquad;
      });

      if (updatedSquad && FIREBASE_ENABLED) {
        void upsertSquadInFirestore(updatedSquad);
      }

      return next;
    });
  };

  const handleOpenSquadDetail = (squadId: string) => {
    setSelectedSquadId(squadId);
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
    const targetPost = helpPosts.find((post) => post.id === id);
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
    const targetPost = helpPosts.find((post) => post.id === postId);
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

    const targetUser = users.find((user) => user.id === userId);
    if (!targetUser) return;

    if (currentUser.friends.includes(userId)) {
      setSelectedUserId(null);
      showActionGuardrail(`${targetUser.name} is already in your riding squad.`);
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

    setUsers((prev) =>
      prev.map((user) => {
        if (user.id !== userId) return user;

        return {
          ...user,
          friendRequests: {
            ...user.friendRequests,
            received: uniqueStrings([...user.friendRequests.received, currentUser.id])
          }
        };
      })
    );

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

  const handleRetryChatSync = () => {
    if (!activeConversation) {
      markSyncFailure('chat', new Error('Open a chat room to retry chat sync.'));
      return;
    }

    setChatSyncRetryToken((prev) => prev + 1);
  };

  const handleSendMessage = (conversationId: string, text: string) => {
    const targetConversation = conversations.find((conversation) => conversation.id === conversationId);
    if (targetConversation && blockedUserIds.has(targetConversation.participantId)) return;

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
      void sendChatMessageToRealtime(conversationId, newMsg)
        .then(() => {
          markSyncSuccess('chat');
        })
        .catch((error) => {
          markSyncFailure('chat', error);
        });
    }

    void logAnalyticsEvent('send_message', {
      conversation_id: conversationId,
      message_length: normalizedText.length
    });
  };

  const handleOpenChatRoom = (conversation: Conversation) => {
    const openedConversation = { ...conversation, unreadCount: 0 };
    setActiveConversation(openedConversation);
    setConversations((prev) => prev.map((conv) => (conv.id === openedConversation.id ? openedConversation : conv)));
    setActiveTab('chats');
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

  if (!hydrated) {
    return (
      <SafeAreaView style={[styles.fullScreen, { backgroundColor: TOKENS.dark.bg }]}>
        <ExpoStatusBar style="light" translucent={false} backgroundColor={TOKENS.dark.bg} />
        <View style={styles.centered}>
          <MaterialCommunityIcons name="bike-fast" size={46} color={TOKENS.dark.primary} />
          <Text style={[styles.brandTitle, { marginTop: 12, color: TOKENS.dark.text }]}>ThrottleUp</Text>
          <Text style={[styles.mutedSmall, { marginTop: 6, color: TOKENS.dark.muted }]}>Loading workspace...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderMainScreen = (onLogoutAndNavigate: () => void) => (
    <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg }]}>
      <ExpoStatusBar style={theme === 'light' ? 'dark' : 'light'} translucent={false} backgroundColor={t.bg} />
      <View style={[styles.container, { backgroundColor: t.bg, paddingTop: androidTopInset }]}>
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
                  name={notificationPermissionStatus === 'denied' ? 'bell-off-outline' : 'bell-outline'}
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
                    : activeTab === 'squad'
                      ? 'SQUADS'
                      : 'MY PROFILE'}
            </Text>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.mainScroll} showsVerticalScrollIndicator={false}>
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
              newsArticles={newsArticles}
              syncError={syncState.news.error}
              isSyncing={syncState.news.isSyncing}
              onRetrySync={handleRetryNewsSync}
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
              syncError={syncState.chat.error}
              isSyncing={syncState.chat.isSyncing}
              onRetrySync={handleRetryChatSync}
              onOpenChatRoom={handleOpenChatRoom}
              onViewProfile={handleViewProfile}
            />
          )}

          {activeTab === 'squad' && (
            <SquadTab
              theme={theme}
              squads={squads}
              currentUser={currentUser}
              users={visibleUsers}
              searchQuery={squadSearchQuery}
              onSearchChange={setSquadSearchQuery}
              onCreateSquad={() => setIsCreateSquadModalOpen(true)}
              onOpenSquadDetail={handleOpenSquadDetail}
              onJoinSquad={handleJoinSquad}
              onLeaveSquad={handleLeaveSquad}
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
          <TabButton theme={theme} icon="account-group-outline" label="Squad" active={activeTab === 'squad'} onPress={() => setActiveTab('squad')} />
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

      <CreateHelpModal
        visible={isCreateHelpModalOpen}
        theme={theme}
        onClose={() => setIsCreateHelpModalOpen(false)}
        onSubmit={handleCreateHelpRequest}
      />

      <CreateRideModal
        visible={isCreateRideModalOpen}
        theme={theme}
        currentCity={currentUser.city}
        onClose={() => setIsCreateRideModalOpen(false)}
        onSubmit={handleCreateRide}
      />

      <EditProfileModal
        visible={isEditProfileOpen}
        user={currentUser}
        theme={theme}
        onClose={() => setIsEditProfileOpen(false)}
        onSave={handleUpdateProfile}
      />

      <RideDetailScreen
        visible={isRideDetailOpen && Boolean(selectedRide)}
        ride={selectedRide}
        users={allUsers.filter((user) => !blockedUserIds.has(user.id))}
        currentUser={currentUser}
        theme={theme}
        onClose={() => setIsRideDetailOpen(false)}
        onRequestJoin={handleRequestToJoinRide}
        onAcceptRequest={handleAcceptRideRequest}
        onRejectRequest={handleRejectRideRequest}
        onUpdateRide={handleUpdateRide}
        onCancelRide={handleCancelRide}
        onReportRide={handleReportRide}
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
        theme={theme}
        friendStatus={selectedFriendStatus}
        onClose={() => setSelectedUserId(null)}
        onMessage={openOrCreateConversation}
        onAddFriend={handleSendFriendRequest}
        onReportUser={handleReportUser}
        onBlockUser={handleBlockUser}
        isBlocked={Boolean(selectedUserProfile && blockedUserIds.has(selectedUserProfile.id))}
      />

      <CreateSquadModal
        visible={isCreateSquadModalOpen}
        theme={theme}
        onClose={() => setIsCreateSquadModalOpen(false)}
        onSubmit={handleCreateSquad}
      />

      <SquadDetailModal
        visible={Boolean(selectedSquad)}
        squad={selectedSquad}
        currentUser={currentUser}
        users={visibleUsers}
        theme={theme}
        onClose={() => setSelectedSquadId(null)}
        onJoinSquad={handleJoinSquad}
        onLeaveSquad={handleLeaveSquad}
        onViewProfile={handleViewProfile}
      />
    </SafeAreaView>
  );

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Splash">
          {({ navigation }) => (
            <SplashRoute theme={theme} onComplete={() => navigation.replace(isLoggedIn ? 'Main' : 'Login')} />
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

                if (BETA_MODE_ENABLED) {
                  if (BETA_ALLOWED_PHONES.length > 0 && !BETA_ALLOWED_PHONES.includes(normalizedPhone)) {
                    throw new Error('This number is not enabled for this beta build.');
                  }

                  const betaUser = await signInWithBetaPhoneIdentity(normalizedPhone);
                  await applyAuthenticatedSession({
                    uid: betaUser.uid,
                    phoneNumber: normalizedPhone
                  });
                } else if (payload.uid) {
                  await applyAuthenticatedSession({
                    uid: payload.uid,
                    phoneNumber: normalizedPhone
                  });
                } else {
                  setCurrentUser((prev) => ({ ...prev, phoneNumber: normalizedPhone || prev.phoneNumber }));
                  setIsLoggedIn(true);
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

const App = () => (
  <AppStateProvider>
    <AppShell />
  </AppStateProvider>
);

export default App;
