import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar as RNStatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import {
  MOCK_CONVERSATIONS,
  MOCK_CURRENT_USER,
  MOCK_HELP,
  MOCK_NEWS,
  MOCK_NOTIFICATIONS,
  MOCK_RIDES,
  MOCK_USERS
} from './src/constants';
import { ChatMessage, Conversation, HelpPost, HelpReply, NewsArticle, Notification, RidePost, RideType, User } from './src/types';

const STORAGE_KEYS = {
  theme: 'ridesathi.theme',
  currentUser: 'ridesathi.currentUser',
  users: 'ridesathi.users',
  notifications: 'ridesathi.notifications',
  rides: 'ridesathi.rides',
  helpPosts: 'ridesathi.helpPosts',
  conversations: 'ridesathi.conversations',
  news: 'ridesathi.news',
  locationMode: 'ridesathi.locationMode'
} as const;

type AppState = 'splash' | 'login' | 'main';
type Tab = 'feed' | 'news' | 'my-rides' | 'chats' | 'profile';
type Theme = 'dark' | 'light';
type FriendStatus = 'self' | 'friend' | 'requested' | 'none';
type LocationMode = 'auto' | 'manual';
type PermissionStatus = 'undetermined' | 'granted' | 'denied';

const TOKENS = {
  dark: {
    bg: '#020617',
    surface: '#0f172a',
    card: '#111827',
    border: '#1e293b',
    text: '#f8fafc',
    muted: '#94a3b8',
    subtle: '#1f2937',
    primary: '#f97316',
    blue: '#2563eb',
    green: '#16a34a',
    red: '#ef4444'
  },
  light: {
    bg: '#f8fafc',
    surface: '#ffffff',
    card: '#ffffff',
    border: '#e2e8f0',
    text: '#0f172a',
    muted: '#64748b',
    subtle: '#f1f5f9',
    primary: '#f97316',
    blue: '#2563eb',
    green: '#16a34a',
    red: '#ef4444'
  }
} as const;

const uniqueStrings = (values: string[]) => Array.from(new Set(values));

const safeParse = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
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
    }
  };
};

const saveToStorage = async <T,>(key: string, value: T) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore persistence errors
  }
};

const colorForBadge = (color: 'orange' | 'blue' | 'green' | 'slate', theme: Theme) => {
  const t = TOKENS[theme];
  if (color === 'orange') {
    return { bg: `${t.primary}22`, text: t.primary, border: `${t.primary}66` };
  }
  if (color === 'blue') {
    return { bg: `${t.blue}22`, text: t.blue, border: `${t.blue}66` };
  }
  if (color === 'green') {
    return { bg: `${t.green}22`, text: t.green, border: `${t.green}66` };
  }
  return { bg: `${t.muted}22`, text: t.muted, border: `${t.muted}66` };
};

const formatClock = (isoTime: string) => {
  try {
    return new Date(isoTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoTime;
  }
};

const formatDay = (isoTime: string) => {
  try {
    return new Date(isoTime).toLocaleDateString();
  } catch {
    return isoTime;
  }
};

const formatRelative = (isoTime: string) => {
  const delta = Date.now() - new Date(isoTime).getTime();
  if (Number.isNaN(delta)) return isoTime;

  const minutes = Math.floor(delta / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const avatarFallback = 'https://api.dicebear.com/7.x/avataaars/png?seed=RideSathi';

const App = () => {
  const isExpoGo = Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo';
  const [hydrated, setHydrated] = useState(false);
  const [appState, setAppState] = useState<AppState>('splash');
  const [theme, setTheme] = useState<Theme>('dark');
  const [activeTab, setActiveTab] = useState<Tab>('feed');
  const [feedFilter, setFeedFilter] = useState<'rides' | 'help'>('rides');

  const [currentUser, setCurrentUser] = useState<User>(MOCK_CURRENT_USER);
  const [users, setUsers] = useState<User[]>(MOCK_USERS);
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const [rides, setRides] = useState<RidePost[]>(MOCK_RIDES);
  const [helpPosts, setHelpPosts] = useState<HelpPost[]>(MOCK_HELP);
  const [conversations, setConversations] = useState<Conversation[]>(MOCK_CONVERSATIONS);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>(MOCK_NEWS);
  const [locationMode, setLocationMode] = useState<LocationMode>('auto');
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<PermissionStatus>('undetermined');
  const [notificationPermissionStatus, setNotificationPermissionStatus] = useState<PermissionStatus>('undetermined');
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [manualCityInput, setManualCityInput] = useState('');
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [isCreateRideModalOpen, setIsCreateRideModalOpen] = useState(false);
  const [isCreateHelpModalOpen, setIsCreateHelpModalOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);

  const [isRideDetailOpen, setIsRideDetailOpen] = useState(false);
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [isHelpDetailOpen, setIsHelpDetailOpen] = useState(false);
  const [selectedHelpPost, setSelectedHelpPost] = useState<HelpPost | null>(null);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const t = TOKENS[theme];
  const androidTopInset = Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0;
  const unreadCount = notifications.filter((item) => !item.read).length;

  useEffect(() => {
    let mounted = true;

    const hydrate = async () => {
      try {
        const [savedTheme, savedUsers, savedNotifications, savedRides, savedHelpPosts, savedConversations, savedNews, savedLocationMode] =
          await Promise.all([
            AsyncStorage.getItem(STORAGE_KEYS.theme),
            AsyncStorage.getItem(STORAGE_KEYS.users),
            AsyncStorage.getItem(STORAGE_KEYS.notifications),
            AsyncStorage.getItem(STORAGE_KEYS.rides),
            AsyncStorage.getItem(STORAGE_KEYS.helpPosts),
            AsyncStorage.getItem(STORAGE_KEYS.conversations),
            AsyncStorage.getItem(STORAGE_KEYS.news),
            AsyncStorage.getItem(STORAGE_KEYS.locationMode)
          ]);

        const nextCurrentUser = await getCurrentUserFromStorage();

        if (!mounted) return;

        setTheme(safeParse<Theme>(savedTheme, 'dark'));
        setCurrentUser(nextCurrentUser);
        setUsers(safeParse<User[]>(savedUsers, MOCK_USERS));
        setNotifications(safeParse<Notification[]>(savedNotifications, MOCK_NOTIFICATIONS));
        setRides(safeParse<RidePost[]>(savedRides, MOCK_RIDES));
        setHelpPosts(safeParse<HelpPost[]>(savedHelpPosts, MOCK_HELP));
        setConversations(safeParse<Conversation[]>(savedConversations, MOCK_CONVERSATIONS));
        setNewsArticles(safeParse<NewsArticle[]>(savedNews, MOCK_NEWS));
        setLocationMode(safeParse<LocationMode>(savedLocationMode, 'auto'));
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
    if (!hydrated || appState !== 'splash') return;

    const timer = setTimeout(() => setAppState('login'), 2200);
    return () => clearTimeout(timer);
  }, [hydrated, appState]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(STORAGE_KEYS.theme, theme);
  }, [hydrated, theme]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(STORAGE_KEYS.currentUser, currentUser);
  }, [hydrated, currentUser]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(STORAGE_KEYS.users, users);
  }, [hydrated, users]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(STORAGE_KEYS.notifications, notifications);
  }, [hydrated, notifications]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(STORAGE_KEYS.rides, rides);
  }, [hydrated, rides]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(STORAGE_KEYS.helpPosts, helpPosts);
  }, [hydrated, helpPosts]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(STORAGE_KEYS.conversations, conversations);
  }, [hydrated, conversations]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(STORAGE_KEYS.news, newsArticles);
  }, [hydrated, newsArticles]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(STORAGE_KEYS.locationMode, locationMode);
  }, [hydrated, locationMode]);

  const allUsers = useMemo(() => {
    const byId = new Map<string, User>();
    byId.set(currentUser.id, currentUser);
    users.forEach((user) => byId.set(user.id, user));
    return Array.from(byId.values());
  }, [currentUser, users]);

  const selectedRide = useMemo(() => {
    if (!selectedRideId) return null;
    return rides.find((ride) => ride.id === selectedRideId) ?? null;
  }, [rides, selectedRideId]);

  const selectedUserProfile = useMemo(() => {
    if (!selectedUserId) return null;
    if (selectedUserId === currentUser.id) return currentUser;
    return users.find((user) => user.id === selectedUserId) ?? null;
  }, [selectedUserId, currentUser, users]);

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
    if (!hydrated || appState !== 'main') return;
    void ensureNotificationPermission();
  }, [hydrated, appState]);

  useEffect(() => {
    if (!hydrated || appState !== 'main' || locationMode !== 'auto') return;

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
  }, [hydrated, appState, locationMode, locationPermissionStatus]);

  const pushSystemNotification = (content: string) => {
    const notification: Notification = {
      id: `system-${Date.now()}`,
      type: 'message',
      senderId: 'system',
      senderName: 'RideSathi',
      senderAvatar: avatarFallback,
      content,
      timestamp: new Date().toISOString(),
      read: false
    };

    setNotifications((prev) => [notification, ...prev]);
  };

  const openOrCreateConversation = (userId: string) => {
    if (userId === currentUser.id) return;

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
    if (!allUsers.some((user) => user.id === userId)) return;
    setSelectedUserId(userId);
  };

  const handleUpdateRide = (rideId: string, updates: Partial<RidePost>) => {
    setRides((prev) => prev.map((ride) => (ride.id === rideId ? { ...ride, ...updates } : ride)));
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
    setIsRideDetailOpen(false);
    setSelectedRideId(null);
  };

  const handleRequestToJoinRide = (rideId: string) => {
    setRides((prev) =>
      prev.map((ride) => {
        if (ride.id !== rideId) return ride;
        if (ride.currentParticipants.includes(currentUser.id) || ride.requests.includes(currentUser.id)) return ride;
        return { ...ride, requests: [...ride.requests, currentUser.id] };
      })
    );
  };

  const handleAcceptRideRequest = (rideId: string, userId: string) => {
    setRides((prev) =>
      prev.map((ride) => {
        if (ride.id !== rideId) return ride;

        if (ride.currentParticipants.includes(userId)) {
          return { ...ride, requests: ride.requests.filter((id) => id !== userId) };
        }

        if (ride.currentParticipants.length >= ride.maxParticipants) {
          return ride;
        }

        return {
          ...ride,
          currentParticipants: [...ride.currentParticipants, userId],
          requests: ride.requests.filter((id) => id !== userId)
        };
      })
    );
  };

  const handleRejectRideRequest = (rideId: string, userId: string) => {
    setRides((prev) =>
      prev.map((ride) => (ride.id === rideId ? { ...ride, requests: ride.requests.filter((id) => id !== userId) } : ride))
    );
  };

  const handleOpenRideDetail = (ride: RidePost) => {
    setSelectedRideId(ride.id);
    setIsRideDetailOpen(true);
  };

  const handleOpenHelpDetail = (post: HelpPost) => {
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
    setIsCreateRideModalOpen(false);
    setIsCreateMenuOpen(false);
    setFeedFilter('rides');
    setActiveTab('feed');
  };

  const handleUpdateProfile = (updates: Partial<User>) => {
    setCurrentUser((prev) => ({ ...prev, ...updates }));
    setIsEditProfileOpen(false);
  };

  const handleResolveHelp = (id: string) => {
    setHelpPosts((prev) => prev.map((post) => (post.id === id ? { ...post, resolved: true } : post)));
    if (selectedHelpPost?.id === id) {
      setSelectedHelpPost((prev) => (prev ? { ...prev, resolved: true } : null));
    }
  };

  const handleUpvoteHelp = (id: string) => {
    setHelpPosts((prev) => prev.map((post) => (post.id === id ? { ...post, upvotes: post.upvotes + 1 } : post)));
    if (selectedHelpPost?.id === id) {
      setSelectedHelpPost((prev) => (prev ? { ...prev, upvotes: prev.upvotes + 1 } : null));
    }
  };

  const handleReplyHelp = (postId: string, text: string) => {
    const reply: HelpReply = {
      id: `rep-${Date.now()}`,
      creatorId: currentUser.id,
      creatorName: currentUser.name,
      creatorAvatar: currentUser.avatar,
      text,
      isHelpful: false,
      createdAt: new Date().toISOString()
    };

    setHelpPosts((prev) => prev.map((post) => (post.id === postId ? { ...post, replies: [...post.replies, reply] } : post)));
    if (selectedHelpPost?.id === postId) {
      setSelectedHelpPost((prev) => (prev ? { ...prev, replies: [...prev.replies, reply] } : null));
    }
  };

  const handleAcceptFriendRequest = (senderId: string, notificationId: string) => {
    const friend = users.find((user) => user.id === senderId);
    if (!friend) return;

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

    const targetUser = users.find((user) => user.id === userId);
    if (!targetUser) return;

    if (currentUser.friends.includes(userId)) {
      setSelectedUserId(null);
      pushSystemNotification(`${targetUser.name} is already in your riding squad.`);
      setIsNotificationsOpen(true);
      return;
    }

    if (currentUser.friendRequests.sent.includes(userId)) {
      setSelectedUserId(null);
      pushSystemNotification(`Friend request already pending with ${targetUser.name}.`);
      setIsNotificationsOpen(true);
      return;
    }

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

    pushSystemNotification(`Friend request sent to ${targetUser.name}.`);
    setIsNotificationsOpen(true);
    setSelectedUserId(null);
  };

  const handleSendMessage = (conversationId: string, text: string) => {
    const newMsg: ChatMessage = {
      id: `m-${Date.now()}`,
      senderId: currentUser.id,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setConversations((prev) =>
      prev.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;

        const updatedConversation = {
          ...conversation,
          messages: [...conversation.messages, newMsg],
          lastMessage: text,
          timestamp: 'Just now'
        };

        if (activeConversation?.id === conversationId) {
          setActiveConversation(updatedConversation);
        }

        return updatedConversation;
      })
    );
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
        title: 'RideSathi',
        message: 'Join me on RideSathi - The community grid for motorcycle explorers.'
      });
    } catch {
      pushSystemNotification('Unable to open share sheet right now.');
      setIsNotificationsOpen(true);
    }
  };

  const handleLogout = () => {
    setAppState('login');
    setActiveTab('feed');
    setIsCreateMenuOpen(false);
    setActiveConversation(null);
    setSelectedUserId(null);
  };

  if (!hydrated) {
    return (
      <SafeAreaView style={[styles.fullScreen, { backgroundColor: TOKENS.dark.bg }]}> 
        <ExpoStatusBar style="light" translucent={false} backgroundColor={TOKENS.dark.bg} />
        <View style={styles.centered}>
          <MaterialCommunityIcons name="bike-fast" size={46} color={TOKENS.dark.primary} />
          <Text style={[styles.brandTitle, { marginTop: 12, color: TOKENS.dark.text }]}>RideSathi</Text>
          <Text style={[styles.mutedSmall, { marginTop: 6, color: TOKENS.dark.muted }]}>Loading workspace...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (appState === 'splash') {
    return <SplashScreen theme={theme} />;
  }

  if (appState === 'login') {
    return <LoginScreen onLogin={() => setAppState('main')} theme={theme} onToggleTheme={setTheme} />;
  }

  return (
    <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg }]}> 
      <ExpoStatusBar style={theme === 'light' ? 'dark' : 'light'} translucent={false} backgroundColor={t.bg} />
      <View style={[styles.container, { backgroundColor: t.bg, paddingTop: androidTopInset }]}> 
        <View style={[styles.header, { borderBottomColor: t.border, backgroundColor: t.surface }]}> 
          <View style={styles.headerTopRow}>
            <View style={styles.brandRow}>
              <View style={[styles.brandIconWrap, { backgroundColor: t.primary }]}>
                <MaterialCommunityIcons name="flash" size={18} color="#fff" />
              </View>
              <Text style={[styles.brandTitle, { color: t.text }]}>RideSathi</Text>
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
                    : 'MY PROFILE'}
            </Text>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.mainScroll} showsVerticalScrollIndicator={false}>
          {activeTab === 'feed' && (
            <FeedTab
              theme={theme}
              feedFilter={feedFilter}
              rides={rides}
              helpPosts={helpPosts}
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
              onOpenArticle={(url) => {
                void Linking.openURL(url);
              }}
            />
          )}

          {activeTab === 'my-rides' && (
            <MyRidesTab
              theme={theme}
              rides={rides}
              currentUser={currentUser}
              onOpenRideDetail={handleOpenRideDetail}
              onViewProfile={handleViewProfile}
            />
          )}

          {activeTab === 'chats' && (
            <ChatsTab
              theme={theme}
              conversations={conversations}
              onOpenChatRoom={handleOpenChatRoom}
              onViewProfile={handleViewProfile}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileTab
              theme={theme}
              currentUser={currentUser}
              users={users}
              rides={rides}
              conversations={conversations}
              onEditProfile={() => setIsEditProfileOpen(true)}
              onViewProfile={handleViewProfile}
              onOpenConversation={handleOpenChatRoom}
              onStartConversation={openOrCreateConversation}
              onShareApp={handleShareApp}
              onLogout={handleLogout}
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
                  <Text style={[styles.createMenuButtonText, { color: t.text }]}>Post Help Request</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.createMenuButton, { backgroundColor: t.surface, borderColor: t.border }]}
                  onPress={() => setIsCreateRideModalOpen(true)}
                >
                  <MaterialCommunityIcons name="bike-fast" size={16} color={t.primary} />
                  <Text style={[styles.createMenuButtonText, { color: t.text }]}>Create Ride</Text>
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
          <TabButton theme={theme} icon="account-outline" label="Profile" active={activeTab === 'profile'} onPress={() => setActiveTab('profile')} />
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
        notifications={notifications}
        onClose={() => setIsNotificationsOpen(false)}
        onClear={handleClearNotifications}
        onMarkRead={handleMarkNotificationRead}
        onAcceptFriend={handleAcceptFriendRequest}
        onRejectFriend={handleRejectFriendRequest}
      />

      <ChatRoomScreen
        visible={Boolean(activeConversation)}
        conversation={activeConversation}
        currentUserId={currentUser.id}
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
        users={allUsers}
        currentUser={currentUser}
        theme={theme}
        onClose={() => setIsRideDetailOpen(false)}
        onRequestJoin={handleRequestToJoinRide}
        onAcceptRequest={handleAcceptRideRequest}
        onRejectRequest={handleRejectRideRequest}
        onUpdateRide={handleUpdateRide}
        onCancelRide={handleCancelRide}
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
        onHandleViewProfile={handleViewProfile}
      />

      <UserProfileModal
        visible={Boolean(selectedUserProfile)}
        user={selectedUserProfile}
        rides={rides}
        theme={theme}
        friendStatus={selectedFriendStatus}
        onClose={() => setSelectedUserId(null)}
        onMessage={openOrCreateConversation}
        onAddFriend={handleSendFriendRequest}
      />
    </SafeAreaView>
  );
};

const SplashScreen = ({ theme }: { theme: Theme }) => {
  const t = TOKENS[theme];

  return (
    <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg }]}> 
      <ExpoStatusBar style={theme === 'light' ? 'dark' : 'light'} translucent={false} backgroundColor={t.bg} />
      <View style={styles.centered}>
        <View style={[styles.splashIcon, { backgroundColor: t.primary }]}> 
          <MaterialCommunityIcons name="flash" size={56} color="#fff" />
        </View>
        <Text style={[styles.splashBrand, { color: t.text }]}>RideSathi</Text>
        <Text style={[styles.splashSubtitle, { color: t.primary }]}>COMMUNITY GRID</Text>
      </View>
    </SafeAreaView>
  );
};

const LoginScreen = ({
  onLogin,
  theme,
  onToggleTheme
}: {
  onLogin: () => void;
  theme: Theme;
  onToggleTheme: (next: Theme) => void;
}) => {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const t = TOKENS[theme];

  const expectedOtp = phoneNumber.slice(-4);
  const maskedPhone = phoneNumber.length >= 4 ? `+91******${phoneNumber.slice(-4)}` : '+91******9443';

  const handleGetOtp = () => {
    if (phoneNumber.length < 10) {
      setError('Enter a valid 10-digit phone number.');
      return;
    }
    setError('');
    setStep('otp');
  };

  const handleVerify = () => {
    if (otp.length < 4) {
      setError('Enter the 4-digit OTP.');
      return;
    }

    if (otp !== expectedOtp) {
      setError('Invalid OTP. For prototype, use your phone last 4 digits.');
      return;
    }

    setError('');
    onLogin();
  };

  return (
    <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg }]}> 
      <ExpoStatusBar style={theme === 'light' ? 'dark' : 'light'} translucent={false} backgroundColor={t.bg} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fullScreen}>
        <ScrollView contentContainerStyle={styles.loginScroll} keyboardShouldPersistTaps="handled">
          <View style={[styles.loginCard, { backgroundColor: t.surface, borderColor: t.border }]}> 
            <View style={styles.loginTopRow}>
              <View style={[styles.brandIconWrap, { backgroundColor: t.primary }]}> 
                <MaterialCommunityIcons name="flash" size={20} color="#fff" />
              </View>
              <View style={styles.themeToggleCompact}>
                <TouchableOpacity
                  style={[styles.themeSmallButton, { backgroundColor: theme === 'light' ? t.primary : t.subtle }]}
                  onPress={() => onToggleTheme('light')}
                >
                  <MaterialCommunityIcons name="weather-sunny" size={16} color={theme === 'light' ? '#fff' : t.muted} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.themeSmallButton, { backgroundColor: theme === 'dark' ? t.primary : t.subtle }]}
                  onPress={() => onToggleTheme('dark')}
                >
                  <MaterialCommunityIcons name="weather-night" size={16} color={theme === 'dark' ? '#fff' : t.muted} />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={[styles.loginTitle, { color: t.text }]}>{step === 'phone' ? 'Ride Connected' : 'Enter Verification code'}</Text>
            {step !== 'phone' && (
              <Text style={[styles.loginSubtitle, { color: t.muted }]}>
                {`We've sent a 4-digit code to ${maskedPhone}`}
              </Text>
            )}

            {step === 'phone' ? (
              <View style={styles.formSection}>
                <Text style={[styles.inputLabel, { color: t.muted }]}>Phone Number</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: t.subtle, borderColor: t.border, color: t.text }]}
                  keyboardType="number-pad"
                  maxLength={10}
                  value={phoneNumber}
                  placeholder="10 digit number"
                  placeholderTextColor={t.muted}
                  onChangeText={(value) => {
                    setPhoneNumber(value.replace(/\D/g, '').slice(0, 10));
                    setError('');
                  }}
                />
                <TouchableOpacity style={[styles.primaryButton, { backgroundColor: t.primary }]} onPress={handleGetOtp}>
                  <MaterialCommunityIcons name="message-text-outline" size={18} color="#fff" />
                  <Text style={styles.primaryButtonText}>Get OTP</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.formSection}>
                <TextInput
                  style={[styles.input, { backgroundColor: t.subtle, borderColor: t.border, color: t.text }]}
                  keyboardType="number-pad"
                  maxLength={4}
                  value={otp}
                  placeholder="4 digit OTP"
                  placeholderTextColor={t.muted}
                  onChangeText={(value) => {
                    setOtp(value.replace(/\D/g, '').slice(0, 4));
                    setError('');
                  }}
                />

                <TouchableOpacity style={[styles.primaryButton, { backgroundColor: t.primary }]} onPress={handleVerify}>
                  <MaterialCommunityIcons name="fingerprint" size={18} color="#fff" />
                  <Text style={styles.primaryButtonText}>Verify & Enter</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setStep('phone')}>
                  <Text style={[styles.linkText, { color: t.muted }]}>Change number</Text>
                </TouchableOpacity>
              </View>
            )}

            {!!error && <Text style={[styles.errorText, { color: TOKENS[theme].red }]}>{error}</Text>}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const FeedTab = ({
  theme,
  feedFilter,
  rides,
  helpPosts,
  currentUser,
  onOpenRideDetail,
  onOpenHelpDetail,
  onViewProfile
}: {
  theme: Theme;
  feedFilter: 'rides' | 'help';
  rides: RidePost[];
  helpPosts: HelpPost[];
  currentUser: User;
  onOpenRideDetail: (ride: RidePost) => void;
  onOpenHelpDetail: (post: HelpPost) => void;
  onViewProfile: (userId: string) => void;
}) => {
  const t = TOKENS[theme];

  if (feedFilter === 'rides') {
    return (
      <View style={styles.listWrap}>
        {rides.map((ride) => (
          <RideCard
            key={ride.id}
            ride={ride}
            currentUserId={currentUser.id}
            theme={theme}
            onOpenDetail={onOpenRideDetail}
            onViewProfile={onViewProfile}
          />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.listWrap}>
      {helpPosts.map((post) => (
        <TouchableOpacity
          key={post.id}
          onPress={() => onOpenHelpDetail(post)}
          style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}
        >
          <View style={styles.rowBetween}>
            <TouchableOpacity style={styles.rowAligned} onPress={() => onViewProfile(post.creatorId)}>
              <Image style={styles.avatarSmall} source={{ uri: post.creatorAvatar || avatarFallback }} />
              <Text style={[styles.boldText, { color: t.text }]}>{post.creatorName}</Text>
            </TouchableOpacity>
            <Badge color="blue" theme={theme}>
              {post.resolved ? 'Resolved' : post.category}
            </Badge>
          </View>

          <Text style={[styles.cardTitle, { color: t.text }]}>{post.title}</Text>

          <View style={styles.metaRow}>
            <View style={styles.rowAligned}>
              <MaterialCommunityIcons name="motorbike" size={14} color={t.primary} />
              <Text style={[styles.metaText, { color: t.muted }]}>{post.bikeModel}</Text>
            </View>
            <View style={styles.rowAligned}>
              <MaterialCommunityIcons name="clock-outline" size={14} color={t.primary} />
              <Text style={[styles.metaText, { color: t.muted }]}>{formatClock(post.createdAt)}</Text>
            </View>
          </View>

          <Text style={[styles.bodyText, { color: t.muted }]} numberOfLines={3}>
            {post.description}
          </Text>

          <View style={styles.rowBetween}>
            <View style={[styles.statChip, { borderColor: t.border, backgroundColor: t.subtle }]}> 
              <MaterialCommunityIcons name="message-outline" size={14} color={t.muted} />
              <Text style={[styles.statText, { color: t.muted }]}>{post.replies.length} replies</Text>
            </View>
            <View style={[styles.statChip, { borderColor: t.border, backgroundColor: t.subtle }]}> 
              <MaterialCommunityIcons name="arrow-up-bold" size={14} color={t.primary} />
              <Text style={[styles.statText, { color: t.text }]}>{post.upvotes}</Text>
            </View>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const NewsTab = ({
  theme,
  newsArticles,
  onOpenArticle
}: {
  theme: Theme;
  newsArticles: NewsArticle[];
  onOpenArticle: (url: string) => void;
}) => {
  const t = TOKENS[theme];

  return (
    <View style={styles.listWrap}>
      {newsArticles.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={[styles.newsCard, { backgroundColor: t.card, borderColor: t.border }]}
          onPress={() => onOpenArticle(item.url)}
        >
          {item.image && <Image source={{ uri: item.image }} style={styles.newsImage} resizeMode="cover" />}

          <View style={styles.newsMetaRow}>
            <View style={styles.rowAligned}>
              <MaterialCommunityIcons name="rss" size={14} color={t.primary} />
              <Text style={[styles.metaText, { color: t.muted }]}>{item.source}</Text>
            </View>
            <View style={styles.rowAligned}>
              <Text style={[styles.metaText, { color: t.muted }]}>{formatRelative(item.publishedAt)}</Text>
              <Text style={[styles.metaText, { color: t.muted }]}>•</Text>
              <MaterialCommunityIcons name="check-decagram-outline" size={14} color={TOKENS[theme].blue} />
              <Text style={[styles.metaText, { color: t.muted }]}>AI Enriched</Text>
            </View>
          </View>

          <Text style={[styles.newsTitle, { color: t.text }]}>{item.title}</Text>

          <Text style={[styles.newsSummary, { color: t.text }]}>{item.summary}</Text>

          <View style={styles.wrapRow}>
            {item.tags.map((tag) => (
              <View key={`${item.id}-${tag}`} style={[styles.newsTag, { borderColor: t.border, backgroundColor: t.subtle }]}> 
                <Text style={[styles.newsTagText, { color: t.muted }]}>{tag}</Text>
              </View>
            ))}
          </View>

          <View style={styles.newsScoreRow}>
            <View style={[styles.newsScoreChip, { borderColor: t.border, backgroundColor: t.subtle }]}> 
              <Text style={[styles.metaText, { color: t.muted }]}>Dup {(item.duplicateScore * 100).toFixed(0)}%</Text>
            </View>
            <View style={[styles.newsScoreChip, { borderColor: t.border, backgroundColor: t.subtle }]}> 
              <Text style={[styles.metaText, { color: t.muted }]}>Rel {item.relevanceScore}</Text>
            </View>
            <View style={[styles.newsScoreChip, { borderColor: t.border, backgroundColor: t.subtle }]}> 
              <Text style={[styles.metaText, { color: t.muted }]}>Vir {item.viralityScore}</Text>
            </View>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const MyRidesTab = ({
  theme,
  rides,
  currentUser,
  onOpenRideDetail,
  onViewProfile
}: {
  theme: Theme;
  rides: RidePost[];
  currentUser: User;
  onOpenRideDetail: (ride: RidePost) => void;
  onViewProfile: (userId: string) => void;
}) => {
  const myRides = rides.filter((ride) => ride.currentParticipants.includes(currentUser.id));
  const t = TOKENS[theme];

  if (myRides.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <MaterialCommunityIcons name="bike-fast" size={48} color={t.muted} />
        <Text style={[styles.emptyTitle, { color: t.text }]}>No active rides found.</Text>
        <Text style={[styles.emptySubtitle, { color: t.muted }]}>Join one from feed or create your own.</Text>
      </View>
    );
  }

  return (
    <View style={styles.listWrap}>
      {myRides.map((ride) => (
        <RideCard
          key={ride.id}
          ride={ride}
          currentUserId={currentUser.id}
          theme={theme}
          onOpenDetail={onOpenRideDetail}
          onViewProfile={onViewProfile}
        />
      ))}
    </View>
  );
};

const ChatsTab = ({
  theme,
  conversations,
  onOpenChatRoom,
  onViewProfile
}: {
  theme: Theme;
  conversations: Conversation[];
  onOpenChatRoom: (conversation: Conversation) => void;
  onViewProfile: (userId: string) => void;
}) => {
  const t = TOKENS[theme];

  return (
    <View style={styles.listWrap}>
      {conversations.map((chat) => (
        <TouchableOpacity
          key={chat.id}
          style={[styles.chatRow, { backgroundColor: t.card, borderColor: t.border }]}
          onPress={() => onOpenChatRoom(chat)}
        >
          <TouchableOpacity onPress={() => onViewProfile(chat.participantId)}>
            <View>
              <Image source={{ uri: chat.participantAvatar || avatarFallback }} style={styles.avatarMedium} />
              {chat.unreadCount > 0 && <View style={[styles.unreadDot, { backgroundColor: t.primary }]} />}
            </View>
          </TouchableOpacity>
          <View style={styles.chatInfo}>
            <View style={styles.rowBetween}>
              <Text style={[styles.boldText, { color: t.text }]} numberOfLines={1}>
                {chat.participantName}
              </Text>
              <Text style={[styles.metaText, { color: t.muted }]}>{chat.timestamp}</Text>
            </View>
            <Text style={[styles.chatPreview, { color: chat.unreadCount > 0 ? t.text : t.muted }]} numberOfLines={1}>
              {chat.lastMessage}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const ProfileTab = ({
  theme,
  currentUser,
  users,
  rides,
  conversations,
  onEditProfile,
  onViewProfile,
  onOpenConversation,
  onStartConversation,
  onShareApp,
  onLogout,
  onSetTheme
}: {
  theme: Theme;
  currentUser: User;
  users: User[];
  rides: RidePost[];
  conversations: Conversation[];
  onEditProfile: () => void;
  onViewProfile: (userId: string) => void;
  onOpenConversation: (conv: Conversation) => void;
  onStartConversation: (userId: string) => void;
  onShareApp: () => void;
  onLogout: () => void;
  onSetTheme: (theme: Theme) => void;
}) => {
  const t = TOKENS[theme];

  return (
    <View style={styles.listWrap}>
      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}> 
        <View style={styles.rowBetween}>
          <View style={styles.rowAligned}>
            <Image source={{ uri: currentUser.avatar || avatarFallback }} style={styles.avatarLarge} />
            <View>
              <Text style={[styles.profileName, { color: t.text }]}>{currentUser.name}</Text>
              <Text style={[styles.metaText, { color: t.muted }]}>{currentUser.handle}</Text>
              <View style={styles.rowAligned}>
                <Badge color="orange" theme={theme}>
                  {currentUser.experience}
                </Badge>
                <View style={{ width: 8 }} />
                <Badge color="slate" theme={theme}>
                  {currentUser.bikeType}
                </Badge>
              </View>
            </View>
          </View>
          <TouchableOpacity style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]} onPress={onEditProfile}>
            <MaterialCommunityIcons name="pencil" size={18} color={t.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.profileStatsRow}>
          <View style={[styles.profileStatCard, { borderColor: t.border, backgroundColor: t.subtle }]}> 
            <Text style={[styles.profileStatValue, { color: t.primary }]}>{currentUser.friends.length}</Text>
            <Text style={[styles.profileStatLabel, { color: t.muted }]}>Friends</Text>
          </View>
          <View style={[styles.profileStatCard, { borderColor: t.border, backgroundColor: t.subtle }]}> 
            <Text style={[styles.profileStatValue, { color: t.primary }]}>{rides.filter((r) => r.creatorId === currentUser.id).length}</Text>
            <Text style={[styles.profileStatLabel, { color: t.muted }]}>Rides</Text>
          </View>
        </View>

        <Text style={[styles.inputLabel, { color: t.muted }]}>My Garage</Text>
        <View style={styles.wrapRow}>
          {currentUser.garage.length > 0 ? (
            currentUser.garage.map((bike, idx) => (
              <View key={`${bike}-${idx}`} style={[styles.pillTag, { borderColor: t.border, backgroundColor: t.subtle }]}> 
                <Text style={[styles.pillTagText, { color: t.text }]}>{bike}</Text>
              </View>
            ))
          ) : (
            <Text style={[styles.bodyText, { color: t.muted }]}>No bikes added yet.</Text>
          )}
        </View>

        <View style={styles.gridTwo}>
          <View style={[styles.infoTile, { borderColor: t.border, backgroundColor: t.subtle }]}> 
            <Text style={[styles.inputLabel, { color: t.muted }]}>Riding Style</Text>
            <Text style={[styles.bodyText, { color: t.text }]}>{currentUser.style}</Text>
          </View>
          <View style={[styles.infoTile, { borderColor: t.border, backgroundColor: t.subtle }]}> 
            <Text style={[styles.inputLabel, { color: t.muted }]}>Typical Ride</Text>
            <Text style={[styles.bodyText, { color: t.text }]}>{currentUser.typicalRideTime}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}> 
        <Text style={[styles.cardHeader, { color: t.muted }]}>MY RIDING SQUAD</Text>
        {currentUser.friends.length === 0 ? (
          <Text style={[styles.bodyText, { color: t.muted }]}>No riders in your squad yet.</Text>
        ) : (
          currentUser.friends.map((friendId) => {
            const friend = users.find((u) => u.id === friendId);
            if (!friend) return null;

            return (
              <TouchableOpacity
                key={friendId}
                style={[styles.friendRow, { borderColor: t.border }]}
                onPress={() => onViewProfile(friendId)}
              >
                <View style={styles.rowAligned}>
                  <Image source={{ uri: friend.avatar || avatarFallback }} style={styles.avatarMedium} />
                  <View>
                    <Text style={[styles.boldText, { color: t.text }]}>{friend.name}</Text>
                    <Text style={[styles.metaText, { color: t.muted }]}>{friend.garage?.[0] ?? 'Unknown machine'}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => {
                    const conv = conversations.find((item) => item.participantId === friendId);
                    if (conv) {
                      onOpenConversation(conv);
                      return;
                    }
                    onStartConversation(friendId);
                  }}
                  style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}
                >
                  <MaterialCommunityIcons name="message-outline" size={18} color={t.primary} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}> 
        <Text style={[styles.cardHeader, { color: t.muted }]}>PREFERENCES</Text>
        <View style={[styles.preferenceRow, { borderColor: t.border, backgroundColor: t.subtle }]}> 
          <View style={styles.rowAligned}>
            <MaterialCommunityIcons name={theme === 'light' ? 'weather-sunny' : 'weather-night'} size={20} color={t.primary} />
            <View>
              <Text style={[styles.boldText, { color: t.text }]}>App Theme</Text>
              <Text style={[styles.metaText, { color: t.muted }]}>{theme === 'light' ? 'Light Mode' : 'Dark Mode'}</Text>
            </View>
          </View>
          <Switch
            value={theme === 'dark'}
            onValueChange={(value) => onSetTheme(value ? 'dark' : 'light')}
            trackColor={{ false: '#94a3b8', true: t.primary }}
          />
        </View>
      </View>

      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: TOKENS[theme].blue }]} onPress={onShareApp}>
        <MaterialCommunityIcons name="share-variant-outline" size={18} color="#fff" />
        <Text style={styles.primaryButtonText}>Invite Riders</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.dangerButton, { borderColor: TOKENS[theme].red }]} onPress={onLogout}>
        <MaterialCommunityIcons name="logout" size={18} color={TOKENS[theme].red} />
        <Text style={[styles.dangerButtonText, { color: TOKENS[theme].red }]}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
};

const RideCard = ({
  ride,
  currentUserId,
  onOpenDetail,
  onViewProfile,
  theme
}: {
  ride: RidePost;
  currentUserId: string;
  onOpenDetail: (ride: RidePost) => void;
  onViewProfile?: (userId: string) => void;
  theme: Theme;
}) => {
  const t = TOKENS[theme];
  const isCreator = ride.creatorId === currentUserId;
  const isJoined = ride.currentParticipants.includes(currentUserId);

  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]} onPress={() => onOpenDetail(ride)}>
      <View style={styles.rowBetween}>
        <TouchableOpacity style={styles.rowAligned} onPress={() => onViewProfile?.(ride.creatorId)}>
          <Image source={{ uri: ride.creatorAvatar || avatarFallback }} style={styles.avatarSmall} />
          <Text style={[styles.boldText, { color: t.text }]}>{ride.creatorName}</Text>
        </TouchableOpacity>
        <View style={styles.rowAligned}>
          {isCreator && (
            <>
              <Badge color="blue" theme={theme}>
                Organizing
              </Badge>
              <View style={{ width: 6 }} />
            </>
          )}
          {isJoined && !isCreator && (
            <>
              <Badge color="green" theme={theme}>
                Joined
              </Badge>
              <View style={{ width: 6 }} />
            </>
          )}
          <Badge color="orange" theme={theme}>
            {ride.type}
          </Badge>
        </View>
      </View>

      <Text style={[styles.cardTitle, { color: t.text }]}>{ride.title}</Text>

      <View style={styles.metaRow}>
        <View style={styles.rowAligned}>
          <MaterialCommunityIcons name="clock-outline" size={14} color={t.primary} />
          <Text style={[styles.metaText, { color: t.muted }]}>{ride.startTime}</Text>
        </View>
        <View style={styles.rowAligned}>
          <MaterialCommunityIcons name="account-group-outline" size={14} color={t.primary} />
          <Text style={[styles.metaText, { color: t.muted }]}>
            {ride.currentParticipants.length}/{ride.maxParticipants}
          </Text>
        </View>
      </View>

      <View style={[styles.routePreview, { borderColor: t.border, backgroundColor: t.subtle }]}> 
        <Text style={[styles.inputLabel, { color: t.muted }]}>Route</Text>
        <Text style={[styles.bodyText, { color: t.text }]} numberOfLines={2}>
          {ride.route}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const Badge = ({ children, color = 'orange', theme }: { children: React.ReactNode; color?: 'orange' | 'blue' | 'green' | 'slate'; theme: Theme }) => {
  const c = colorForBadge(color, theme);

  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }]}> 
      <Text style={[styles.badgeText, { color: c.text }]}>{children}</Text>
    </View>
  );
};

const TabButton = ({
  theme,
  icon,
  label,
  active,
  onPress
}: {
  theme: Theme;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
}) => {
  const t = TOKENS[theme];

  return (
    <TouchableOpacity style={styles.tabButton} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={22} color={active ? t.primary : t.muted} />
      <Text style={[styles.tabLabel, { color: active ? t.primary : t.muted }]}>{label}</Text>
    </TouchableOpacity>
  );
};

const LocationSettingsModal = ({
  visible,
  theme,
  cityInput,
  onChangeCityInput,
  locationMode,
  isDetectingLocation,
  locationPermissionStatus,
  onClose,
  onSaveManualCity,
  onUseAutoLocation
}: {
  visible: boolean;
  theme: Theme;
  cityInput: string;
  onChangeCityInput: (value: string) => void;
  locationMode: LocationMode;
  isDetectingLocation: boolean;
  locationPermissionStatus: PermissionStatus;
  onClose: () => void;
  onSaveManualCity: () => void;
  onUseAutoLocation: () => void;
}) => {
  const t = TOKENS[theme];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalBackdrop}>
        <Pressable style={styles.modalScrim} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.bottomSheet, { backgroundColor: t.surface, borderTopColor: t.primary }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.modalTitle, { color: t.text }]}>Location Settings</Text>
              <TouchableOpacity onPress={onClose}>
                <MaterialCommunityIcons name="close" size={24} color={t.muted} />
              </TouchableOpacity>
            </View>

            <View style={styles.formSection}>
              <View style={styles.rowAligned}>
                <View style={[styles.newsScoreChip, { borderColor: t.border, backgroundColor: t.subtle }]}>
                  <Text style={[styles.metaText, { color: t.muted }]}>Mode: {locationMode === 'auto' ? 'Auto' : 'Manual'}</Text>
                </View>
                <View style={[styles.newsScoreChip, { borderColor: t.border, backgroundColor: t.subtle }]}>
                  <Text style={[styles.metaText, { color: t.muted }]}>
                    Permission: {locationPermissionStatus === 'granted' ? 'Granted' : locationPermissionStatus === 'denied' ? 'Denied' : 'Ask'}
                  </Text>
                </View>
              </View>

              <LabeledInput
                label="Set City Manually"
                value={cityInput}
                onChangeText={onChangeCityInput}
                theme={theme}
                placeholder="Enter city name"
              />

              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: t.primary }]} onPress={onSaveManualCity}>
                <MaterialCommunityIcons name="content-save-outline" size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>Save Manual City</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.ghostButton, { borderColor: t.border, backgroundColor: t.subtle }]} onPress={onUseAutoLocation}>
                <MaterialCommunityIcons
                  name={isDetectingLocation ? 'progress-clock' : 'crosshairs-gps'}
                  size={18}
                  color={t.primary}
                />
                <Text style={[styles.ghostButtonText, { color: t.primary }]}>
                  {isDetectingLocation ? 'Detecting location...' : 'Use Auto Location'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const NotificationsOverlay = ({
  visible,
  notifications,
  onClose,
  onClear,
  onMarkRead,
  onAcceptFriend,
  onRejectFriend,
  theme
}: {
  visible: boolean;
  notifications: Notification[];
  onClose: () => void;
  onClear: () => void;
  onMarkRead: (id: string) => void;
  onAcceptFriend: (senderId: string, notificationId: string) => void;
  onRejectFriend: (notificationId: string) => void;
  theme: Theme;
}) => {
  const t = TOKENS[theme];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalBackdrop}>
        <Pressable style={styles.modalScrim} onPress={onClose} />
        <View style={[styles.sideSheet, { backgroundColor: t.bg, borderLeftColor: t.border }]}> 
          <View style={[styles.modalHeader, { borderBottomColor: t.border }]}> 
            <View style={styles.rowAligned}>
              <MaterialCommunityIcons name="bell-outline" size={20} color={t.primary} />
              <Text style={[styles.modalTitle, { color: t.text }]}>Alert Center</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color={t.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.listWrap}>
            {notifications.length === 0 ? (
              <View style={styles.emptyWrap}>
                <MaterialCommunityIcons name="bell-off-outline" size={40} color={t.muted} />
                <Text style={[styles.emptyTitle, { color: t.text }]}>No new alerts.</Text>
              </View>
            ) : (
              notifications.map((n) => (
                <View key={n.id} style={[styles.card, { backgroundColor: t.card, borderColor: n.read ? t.border : `${t.primary}66` }]}> 
                  <View style={styles.rowAlignedTop}>
                    <TouchableOpacity onPress={() => onMarkRead(n.id)}>
                      <Image source={{ uri: n.senderAvatar || avatarFallback }} style={styles.avatarSmall} />
                    </TouchableOpacity>
                    <View style={styles.flex1}>
                      <TouchableOpacity onPress={() => onMarkRead(n.id)}>
                        <Text style={[styles.bodyText, { color: t.text }]}>
                          <Text style={styles.boldText}>{n.senderName}</Text> {n.content}
                        </Text>
                        <Text style={[styles.metaText, { color: t.muted }]}>{formatClock(n.timestamp)}</Text>
                      </TouchableOpacity>

                      {n.type === 'friend_request' && !n.read && (
                        <View style={styles.rowButtons}>
                          <TouchableOpacity
                            style={[styles.smallButton, { borderColor: t.border, backgroundColor: t.subtle }]}
                            onPress={() => onRejectFriend(n.id)}
                          >
                            <Text style={[styles.smallButtonText, { color: t.muted }]}>Decline</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.smallButton, { borderColor: t.primary, backgroundColor: t.primary }]}
                            onPress={() => onAcceptFriend(n.senderId, n.id)}
                          >
                            <Text style={[styles.smallButtonText, { color: '#fff' }]}>Accept</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          {notifications.length > 0 && (
            <View style={[styles.modalFooter, { borderTopColor: t.border }]}> 
              <TouchableOpacity style={[styles.ghostButton, { borderColor: t.border, backgroundColor: t.subtle }]} onPress={onClear}>
                <Text style={[styles.ghostButtonText, { color: t.muted }]}>Clear All</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const ChatRoomScreen = ({
  visible,
  conversation,
  currentUserId,
  onClose,
  onSendMessage,
  theme
}: {
  visible: boolean;
  conversation: Conversation | null;
  currentUserId: string;
  onClose: () => void;
  onSendMessage: (conversationId: string, text: string) => void;
  theme: Theme;
}) => {
  const t = TOKENS[theme];
  const [inputText, setInputText] = useState('');

  if (!conversation) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg }]}> 
        <View style={[styles.modalHeader, { borderBottomColor: t.border }]}> 
          <View style={styles.rowAligned}>
            <TouchableOpacity onPress={onClose} style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}>
              <MaterialCommunityIcons name="arrow-left" size={20} color={t.text} />
            </TouchableOpacity>
            <Image source={{ uri: conversation.participantAvatar || avatarFallback }} style={styles.avatarSmall} />
            <View>
              <Text style={[styles.modalTitle, { color: t.text }]}>{conversation.participantName}</Text>
              <Text style={[styles.metaText, { color: t.muted }]}>Active now</Text>
            </View>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.chatMessagesWrap}>
          {conversation.messages.length === 0 ? (
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons name="message-outline" size={40} color={t.muted} />
              <Text style={[styles.emptyTitle, { color: t.text }]}>No transmissions yet.</Text>
            </View>
          ) : (
            conversation.messages.map((msg) => {
              const isMe = msg.senderId === currentUserId;

              return (
                <View key={msg.id} style={[styles.messageRow, isMe ? styles.messageRight : styles.messageLeft]}>
                  <View
                    style={[
                      styles.messageBubble,
                      {
                        backgroundColor: isMe ? t.primary : t.card,
                        borderColor: isMe ? t.primary : t.border
                      }
                    ]}
                  >
                    <Text style={[styles.bodyText, { color: isMe ? '#fff' : t.text }]}>{msg.text}</Text>
                    <Text style={[styles.metaText, { color: isMe ? '#fff' : t.muted }]}>{msg.timestamp}</Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.messageComposer, { borderTopColor: t.border, backgroundColor: t.surface }]}> 
            <TextInput
              style={[styles.input, styles.flex1, { backgroundColor: t.subtle, borderColor: t.border, color: t.text }]}
              placeholder="Type a message..."
              placeholderTextColor={t.muted}
              value={inputText}
              onChangeText={setInputText}
            />
            <TouchableOpacity
              style={[styles.iconRoundButton, { backgroundColor: t.primary }]}
              onPress={() => {
                if (!inputText.trim()) return;
                onSendMessage(conversation.id, inputText.trim());
                setInputText('');
              }}
            >
              <MaterialCommunityIcons name="send" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const CreateRideModal = ({
  visible,
  onClose,
  onSubmit,
  theme
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (ride: Omit<RidePost, 'id' | 'creatorId' | 'creatorName' | 'creatorAvatar' | 'currentParticipants' | 'requests' | 'createdAt' | 'city'>) => void;
  theme: Theme;
}) => {
  const t = TOKENS[theme];
  const [title, setTitle] = useState('');
  const [type, setType] = useState<RideType>('Sunday Morning');
  const [route, setRoute] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('5');
  const [visibility, setVisibility] = useState<RidePost['visibility']>('City');

  const submit = () => {
    if (!title || !route || !date || !startTime) return;

    const max = Math.max(2, Math.min(20, Number(maxParticipants) || 5));

    onSubmit({
      title,
      type,
      route,
      date,
      startTime,
      maxParticipants: max,
      visibility,
      routePoints: []
    });

    setTitle('');
    setType('Sunday Morning');
    setRoute('');
    setDate('');
    setStartTime('');
    setMaxParticipants('5');
    setVisibility('City');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalBackdrop}>
        <Pressable style={styles.modalScrim} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.bottomSheet, { backgroundColor: t.surface, borderTopColor: t.primary }]}> 
            <View style={styles.rowBetween}>
              <Text style={[styles.modalTitle, { color: t.text }]}>Create Ride</Text>
              <TouchableOpacity onPress={onClose}>
                <MaterialCommunityIcons name="close" size={24} color={t.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formSection} showsVerticalScrollIndicator={false}>
              <LabeledInput label="Ride Title" value={title} onChangeText={setTitle} theme={theme} placeholder="Highway sunrise run" />

              <SelectorRow
                label="Ride Type"
                options={['Sunday Morning', 'Coffee Ride', 'Night Ride', 'Long Tour', 'Track Day']}
                selected={type}
                onSelect={(value) => setType(value as RideType)}
                theme={theme}
              />

              <SelectorRow
                label="Visibility"
                options={['City', 'Nearby', 'Friends']}
                selected={visibility}
                onSelect={(value) => setVisibility(value as RidePost['visibility'])}
                theme={theme}
              />

              <LabeledInput label="Route" value={route} onChangeText={setRoute} theme={theme} placeholder="Noida -> Jewar -> Mathura" />
              <LabeledInput label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} theme={theme} placeholder="2026-03-15" />
              <LabeledInput label="Start Time" value={startTime} onChangeText={setStartTime} theme={theme} placeholder="05:30 AM" />
              <LabeledInput
                label="Max Participants"
                value={maxParticipants}
                onChangeText={(value) => setMaxParticipants(value.replace(/\D/g, '').slice(0, 2))}
                theme={theme}
                placeholder="5"
                keyboardType="number-pad"
              />

              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: t.primary }]} onPress={submit}>
                <MaterialCommunityIcons name="flag-checkered" size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>Launch Ride</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const CreateHelpModal = ({
  visible,
  onClose,
  onSubmit,
  theme
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (post: Omit<HelpPost, 'id' | 'creatorId' | 'creatorName' | 'creatorAvatar' | 'resolved' | 'upvotes' | 'replies' | 'createdAt'>) => void;
  theme: Theme;
}) => {
  const t = TOKENS[theme];
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<HelpPost['category']>('Mechanical');
  const [bikeModel, setBikeModel] = useState('');
  const [description, setDescription] = useState('');
  const [hasPhoto, setHasPhoto] = useState(false);

  const submit = () => {
    if (!title || !description || !bikeModel) return;

    onSubmit({
      title,
      category,
      bikeModel,
      description,
      image: hasPhoto ? 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&q=80&w=800' : undefined
    });

    setTitle('');
    setCategory('Mechanical');
    setBikeModel('');
    setDescription('');
    setHasPhoto(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalBackdrop}>
        <Pressable style={styles.modalScrim} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.bottomSheet, { backgroundColor: t.surface, borderTopColor: TOKENS[theme].blue }]}> 
            <View style={styles.rowBetween}>
              <Text style={[styles.modalTitle, { color: t.text }]}>Create Help Request</Text>
              <TouchableOpacity onPress={onClose}>
                <MaterialCommunityIcons name="close" size={24} color={t.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formSection} showsVerticalScrollIndicator={false}>
              <LabeledInput label="Title" value={title} onChangeText={setTitle} theme={theme} placeholder="Strange clicking while shifting" />

              <SelectorRow
                label="Category"
                options={['Mechanical', 'Gear', 'Route', 'Other']}
                selected={category}
                onSelect={(value) => setCategory(value as HelpPost['category'])}
                theme={theme}
              />

              <LabeledInput
                label="Bike Model"
                value={bikeModel}
                onChangeText={setBikeModel}
                theme={theme}
                placeholder="Royal Enfield Himalayan 450"
              />

              <LabeledInput
                label="Description"
                value={description}
                onChangeText={setDescription}
                theme={theme}
                placeholder="Describe issue and observations"
                multiline
              />

              <TouchableOpacity
                style={[styles.togglePhotoButton, { borderColor: hasPhoto ? t.primary : t.border, backgroundColor: t.subtle }]}
                onPress={() => setHasPhoto((prev) => !prev)}
              >
                <MaterialCommunityIcons name={hasPhoto ? 'camera-plus-outline' : 'camera-outline'} size={18} color={hasPhoto ? t.primary : t.muted} />
                <Text style={[styles.bodyText, { color: hasPhoto ? t.primary : t.muted }]}>
                  {hasPhoto ? 'Photo attached' : 'Attach photo (optional)'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: t.primary }]} onPress={submit}>
                <MaterialCommunityIcons name="send-outline" size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>Post Help</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const EditProfileModal = ({
  visible,
  user,
  onClose,
  onSave,
  theme
}: {
  visible: boolean;
  user: User;
  onClose: () => void;
  onSave: (updates: Partial<User>) => void;
  theme: Theme;
}) => {
  const t = TOKENS[theme];
  const [name, setName] = useState(user.name);
  const [handle, setHandle] = useState(user.handle);
  const [garage, setGarage] = useState<string[]>(user.garage || []);
  const [style, setStyle] = useState(user.style);
  const [typicalRideTime, setTypicalRideTime] = useState(user.typicalRideTime);

  useEffect(() => {
    if (!visible) return;
    setName(user.name);
    setHandle(user.handle);
    setGarage(user.garage || []);
    setStyle(user.style);
    setTypicalRideTime(user.typicalRideTime);
  }, [visible, user]);

  const updateBike = (index: number, value: string) => {
    setGarage((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const removeBike = (index: number) => {
    setGarage((prev) => prev.filter((_, idx) => idx !== index));
  };

  const submit = () => {
    const filteredGarage = garage.map((value) => value.trim()).filter(Boolean);
    onSave({ name, handle, garage: filteredGarage, style, typicalRideTime });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalBackdrop}>
        <Pressable style={styles.modalScrim} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.bottomSheet, { backgroundColor: t.surface, borderTopColor: t.primary }]}> 
            <View style={styles.rowBetween}>
              <Text style={[styles.modalTitle, { color: t.text }]}>Edit Profile</Text>
              <TouchableOpacity onPress={onClose}>
                <MaterialCommunityIcons name="close" size={24} color={t.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formSection} showsVerticalScrollIndicator={false}>
              <LabeledInput label="Name" value={name} onChangeText={setName} theme={theme} />
              <LabeledInput label="Handle" value={handle} onChangeText={setHandle} theme={theme} />

              <Text style={[styles.inputLabel, { color: t.muted }]}>Garage</Text>
              {garage.map((bike, idx) => (
                <View key={`bike-${idx}`} style={styles.rowAligned}>
                  <TextInput
                    style={[styles.input, styles.flex1, { backgroundColor: t.subtle, borderColor: t.border, color: t.text }]}
                    value={bike}
                    placeholder="Bike name"
                    placeholderTextColor={t.muted}
                    onChangeText={(value) => updateBike(idx, value)}
                  />
                  <TouchableOpacity style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]} onPress={() => removeBike(idx)}>
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color={TOKENS[theme].red} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={[styles.ghostButton, { borderColor: t.border, backgroundColor: t.subtle }]} onPress={() => setGarage((prev) => [...prev, ''])}>
                <MaterialCommunityIcons name="plus" size={18} color={t.primary} />
                <Text style={[styles.ghostButtonText, { color: t.primary }]}>Add bike</Text>
              </TouchableOpacity>

              <LabeledInput label="Riding Style" value={style} onChangeText={setStyle} theme={theme} />
              <LabeledInput label="Typical Ride Time" value={typicalRideTime} onChangeText={setTypicalRideTime} theme={theme} />

              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: t.primary }]} onPress={submit}>
                <MaterialCommunityIcons name="content-save-outline" size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>Save Profile</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const RideDetailScreen = ({
  visible,
  ride,
  users,
  currentUser,
  onClose,
  onRequestJoin,
  onAcceptRequest,
  onRejectRequest,
  onUpdateRide,
  onCancelRide,
  onHandleViewProfile,
  theme
}: {
  visible: boolean;
  ride: RidePost | null;
  users: User[];
  currentUser: User;
  onClose: () => void;
  onRequestJoin: (rideId: string) => void;
  onAcceptRequest: (rideId: string, userId: string) => void;
  onRejectRequest: (rideId: string, userId: string) => void;
  onUpdateRide: (rideId: string, updates: Partial<RidePost>) => void;
  onCancelRide: (rideId: string) => void;
  onHandleViewProfile?: (userId: string) => void;
  theme: Theme;
}) => {
  const t = TOKENS[theme];

  if (!ride) return null;

  const isCreator = ride.creatorId === currentUser.id;
  const isPending = ride.requests.includes(currentUser.id);
  const isJoined = ride.currentParticipants.includes(currentUser.id);
  const participants = users.filter((u) => ride.currentParticipants.includes(u.id));
  const requestUsers = users.filter((u) => ride.requests.includes(u.id));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg }]}> 
        <View style={[styles.modalHeader, { borderBottomColor: t.border }]}> 
          <View style={styles.rowAligned}>
            <TouchableOpacity onPress={onClose} style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}>
              <MaterialCommunityIcons name="arrow-left" size={20} color={t.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: t.text }]} numberOfLines={1}>
              {ride.title}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}
            onPress={() => {
              void onUpdateRide(ride.id, ride);
            }}
          >
            <MaterialCommunityIcons name="share-variant-outline" size={18} color={t.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.listWrap}>
          <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}> 
            <View style={styles.rowBetween}>
              <Badge color="orange" theme={theme}>
                {ride.type}
              </Badge>
              <Text style={[styles.metaText, { color: t.muted }]}>{ride.date}</Text>
            </View>

            <Text style={[styles.cardTitle, { color: t.text }]}>{ride.title}</Text>

            <View style={styles.metaRow}>
              <View style={styles.rowAligned}>
                <MaterialCommunityIcons name="clock-outline" size={14} color={t.primary} />
                <Text style={[styles.metaText, { color: t.muted }]}>{ride.startTime}</Text>
              </View>
              <View style={styles.rowAligned}>
                <MaterialCommunityIcons name="account-group-outline" size={14} color={t.primary} />
                <Text style={[styles.metaText, { color: t.muted }]}>
                  {ride.currentParticipants.length}/{ride.maxParticipants}
                </Text>
              </View>
            </View>

            <TouchableOpacity style={[styles.organizerCard, { borderColor: t.border, backgroundColor: t.subtle }]} onPress={() => onHandleViewProfile?.(ride.creatorId)}>
              <View style={styles.rowAligned}>
                <Image source={{ uri: ride.creatorAvatar || avatarFallback }} style={styles.avatarSmall} />
                <View>
                  <Text style={[styles.inputLabel, { color: t.muted }]}>Organizer</Text>
                  <Text style={[styles.boldText, { color: t.text }]}>{ride.creatorName}</Text>
                </View>
              </View>
            </TouchableOpacity>

            <View style={[styles.routePreview, { borderColor: t.border, backgroundColor: t.subtle }]}> 
              <Text style={[styles.inputLabel, { color: t.muted }]}>Route Details</Text>
              <Text style={[styles.bodyText, { color: t.text }]}>{ride.route}</Text>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}> 
            <Text style={[styles.cardHeader, { color: t.muted }]}>RIDERS ({participants.length})</Text>
            <View style={styles.wrapRow}>
              {participants.map((u) => (
                <TouchableOpacity key={u.id} style={styles.participantPill} onPress={() => onHandleViewProfile?.(u.id)}>
                  <Image source={{ uri: u.avatar || avatarFallback }} style={styles.avatarTiny} />
                  <Text style={[styles.metaText, { color: t.text }]}>{u.name.split(' ')[0]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {isCreator && requestUsers.length > 0 && (
            <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}> 
              <Text style={[styles.cardHeader, { color: t.primary }]}>JOIN REQUESTS ({requestUsers.length})</Text>
              {requestUsers.map((u) => (
                <View key={u.id} style={[styles.requestRow, { borderColor: t.border }]}> 
                  <View style={styles.rowAligned}>
                    <Image source={{ uri: u.avatar || avatarFallback }} style={styles.avatarSmall} />
                    <View>
                      <Text style={[styles.boldText, { color: t.text }]}>{u.name}</Text>
                      <Text style={[styles.metaText, { color: t.muted }]}>{u.garage?.[0] ?? 'Unknown bike'}</Text>
                    </View>
                  </View>
                  <View style={styles.rowAligned}>
                    <TouchableOpacity
                      style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}
                      onPress={() => onRejectRequest(ride.id, u.id)}
                    >
                      <MaterialCommunityIcons name="close" size={18} color={TOKENS[theme].red} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.iconButton, { borderColor: t.primary, backgroundColor: t.primary }]}
                      onPress={() => onAcceptRequest(ride.id, u.id)}
                    >
                      <MaterialCommunityIcons name="check" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={[styles.modalFooter, { borderTopColor: t.border, backgroundColor: t.surface }]}> 
          {isCreator ? (
            <TouchableOpacity
              style={[styles.dangerButton, { borderColor: TOKENS[theme].red }]}
              onPress={() =>
                Alert.alert('Cancel ride?', 'All riders will be notified.', [
                  { text: 'Keep', style: 'cancel' },
                  { text: 'Cancel Ride', style: 'destructive', onPress: () => onCancelRide(ride.id) }
                ])
              }
            >
              <MaterialCommunityIcons name="trash-can-outline" size={18} color={TOKENS[theme].red} />
              <Text style={[styles.dangerButtonText, { color: TOKENS[theme].red }]}>Cancel Ride</Text>
            </TouchableOpacity>
          ) : isJoined ? (
            <View style={[styles.statusStrip, { borderColor: TOKENS[theme].green, backgroundColor: `${TOKENS[theme].green}22` }]}> 
              <MaterialCommunityIcons name="account-check-outline" size={18} color={TOKENS[theme].green} />
              <Text style={[styles.statusStripText, { color: TOKENS[theme].green }]}>You are joined</Text>
            </View>
          ) : isPending ? (
            <View style={[styles.statusStrip, { borderColor: t.border, backgroundColor: t.subtle }]}> 
              <MaterialCommunityIcons name="clock-outline" size={18} color={t.muted} />
              <Text style={[styles.statusStripText, { color: t.muted }]}>Request sent</Text>
            </View>
          ) : (
            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: t.primary }]} onPress={() => onRequestJoin(ride.id)}>
              <MaterialCommunityIcons name="account-plus-outline" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>Join Ride</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const HelpDetailScreen = ({
  visible,
  post,
  currentUser,
  onClose,
  onResolve,
  onUpvote,
  onReply,
  onHandleViewProfile,
  theme
}: {
  visible: boolean;
  post: HelpPost | null;
  currentUser: User;
  onClose: () => void;
  onResolve: (id: string) => void;
  onUpvote: (id: string) => void;
  onReply: (postId: string, text: string) => void;
  onHandleViewProfile?: (userId: string) => void;
  theme: Theme;
}) => {
  const t = TOKENS[theme];
  const [replyText, setReplyText] = useState('');

  useEffect(() => {
    if (!visible) {
      setReplyText('');
    }
  }, [visible]);

  if (!post) return null;

  const isCreator = post.creatorId === currentUser.id;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg }]}> 
        <View style={[styles.modalHeader, { borderBottomColor: t.border }]}> 
          <View style={styles.rowAligned}>
            <TouchableOpacity onPress={onClose} style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}>
              <MaterialCommunityIcons name="arrow-left" size={20} color={t.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: t.text }]}>SOS Intel</Text>
          </View>
          <TouchableOpacity style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]} onPress={() => onUpvote(post.id)}>
            <MaterialCommunityIcons name="arrow-up-bold" size={16} color={t.primary} />
            <Text style={[styles.metaText, { color: t.text, marginLeft: 4 }]}>{post.upvotes}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.listWrap}>
          <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}> 
            <View style={styles.rowBetween}>
              <Badge color={post.resolved ? 'green' : 'blue'} theme={theme}>
                {post.resolved ? 'Resolved' : post.category}
              </Badge>
              <Text style={[styles.metaText, { color: t.muted }]}>{formatDay(post.createdAt)}</Text>
            </View>

            <Text style={[styles.cardTitle, { color: t.text }]}>{post.title}</Text>

            <View style={[styles.routePreview, { borderColor: t.border, backgroundColor: t.subtle }]}> 
              <Text style={[styles.inputLabel, { color: t.muted }]}>Affected Machine</Text>
              <Text style={[styles.bodyText, { color: t.text }]}>{post.bikeModel}</Text>
            </View>

            <TouchableOpacity style={[styles.organizerCard, { borderColor: t.border, backgroundColor: t.subtle }]} onPress={() => onHandleViewProfile?.(post.creatorId)}>
              <View style={styles.rowAligned}>
                <Image source={{ uri: post.creatorAvatar || avatarFallback }} style={styles.avatarSmall} />
                <View>
                  <Text style={[styles.inputLabel, { color: t.muted }]}>Signaler</Text>
                  <Text style={[styles.boldText, { color: t.text }]}>{post.creatorName}</Text>
                </View>
              </View>
            </TouchableOpacity>

            <View style={[styles.routePreview, { borderColor: t.border, backgroundColor: t.subtle }]}> 
              <Text style={[styles.inputLabel, { color: t.muted }]}>Details</Text>
              <Text style={[styles.bodyText, { color: t.text }]}>{post.description}</Text>
            </View>

            {post.image && <Image source={{ uri: post.image }} style={styles.helpImage} resizeMode="cover" />}
          </View>

          <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}> 
            <Text style={[styles.cardHeader, { color: t.muted }]}>REPLIES ({post.replies.length})</Text>
            {post.replies.length === 0 ? (
              <Text style={[styles.bodyText, { color: t.muted }]}>No replies yet.</Text>
            ) : (
              post.replies.map((reply) => (
                <View key={reply.id} style={[styles.replyCard, { borderColor: t.border, backgroundColor: t.subtle }]}> 
                  <View style={styles.rowBetween}>
                    <View style={styles.rowAligned}>
                      <Image source={{ uri: reply.creatorAvatar || avatarFallback }} style={styles.avatarTiny} />
                      <Text style={[styles.boldText, { color: t.text }]}>{reply.creatorName}</Text>
                    </View>
                    {reply.isHelpful && <Badge color="green" theme={theme}>Helpful</Badge>}
                  </View>
                  <Text style={[styles.bodyText, { color: t.text }]}>{reply.text}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalFooter, { borderTopColor: t.border, backgroundColor: t.surface }]}> 
            {isCreator ? (
              <TouchableOpacity
                disabled={post.resolved}
                style={[styles.primaryButton, { backgroundColor: post.resolved ? `${TOKENS[theme].green}66` : TOKENS[theme].green }]}
                onPress={() => onResolve(post.id)}
              >
                <MaterialCommunityIcons name={post.resolved ? 'check-circle-outline' : 'trophy-outline'} size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>{post.resolved ? 'Marked Resolved' : 'Mark Resolved'}</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.rowAligned}>
                <TextInput
                  value={replyText}
                  onChangeText={setReplyText}
                  placeholder="Write reply..."
                  placeholderTextColor={t.muted}
                  style={[styles.input, styles.flex1, { backgroundColor: t.subtle, borderColor: t.border, color: t.text }]}
                />
                <TouchableOpacity
                  style={[styles.iconRoundButton, { backgroundColor: TOKENS[theme].blue }]}
                  onPress={() => {
                    if (!replyText.trim()) return;
                    onReply(post.id, replyText.trim());
                    setReplyText('');
                  }}
                >
                  <MaterialCommunityIcons name="send" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const UserProfileModal = ({
  visible,
  user,
  rides,
  friendStatus,
  onClose,
  onMessage,
  onAddFriend,
  theme
}: {
  visible: boolean;
  user: User | null;
  rides: RidePost[];
  friendStatus: FriendStatus;
  onClose: () => void;
  onMessage: (userId: string) => void;
  onAddFriend: (userId: string) => void;
  theme: Theme;
}) => {
  const t = TOKENS[theme];

  if (!user) return null;

  const userRides = rides.filter((ride) => ride.creatorId === user.id || ride.currentParticipants.includes(user.id));
  const canMessage = friendStatus !== 'self';
  const canAddFriend = friendStatus === 'none';
  const friendButtonLabel = friendStatus === 'friend' ? 'Connected' : friendStatus === 'requested' ? 'Pending' : friendStatus === 'self' ? 'You' : 'Add';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalBackdrop}>
        <Pressable style={styles.modalScrim} onPress={onClose} />
        <View style={[styles.profileSheet, { backgroundColor: t.bg, borderTopColor: t.primary }]}> 
          <View style={styles.profileCoverWrap}>
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&q=80&w=800' }}
              style={styles.profileCover}
            />
            <TouchableOpacity style={styles.profileCloseButton} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.userProfileContent}>
            <View style={styles.userTopRow}>
              <Image source={{ uri: user.avatar || avatarFallback }} style={styles.userAvatarHuge} />
              <View style={styles.rowAligned}>
                <TouchableOpacity
                  style={[styles.iconButton, { borderColor: t.border, backgroundColor: canMessage ? t.subtle : `${t.muted}22` }]}
                  disabled={!canMessage}
                  onPress={() => onMessage(user.id)}
                >
                  <MaterialCommunityIcons name="message-outline" size={18} color={canMessage ? t.primary : t.muted} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryCompactButton, { backgroundColor: canAddFriend ? t.primary : t.subtle, borderColor: t.border }]}
                  disabled={!canAddFriend}
                  onPress={() => onAddFriend(user.id)}
                >
                  <MaterialCommunityIcons name="account-plus-outline" size={16} color={canAddFriend ? '#fff' : t.muted} />
                  <Text style={[styles.primaryCompactButtonText, { color: canAddFriend ? '#fff' : t.muted }]}>{friendButtonLabel}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={[styles.profileName, { color: t.text }]}>{user.name}</Text>
            <Text style={[styles.metaText, { color: t.muted }]}>{user.handle}</Text>

            <View style={styles.rowAligned}>
              <Badge color="orange" theme={theme}>
                {user.experience}
              </Badge>
              <View style={{ width: 8 }} />
              <Badge color="blue" theme={theme}>
                {user.city}
              </Badge>
            </View>

            <View style={styles.profileStatsRow}>
              <View style={[styles.profileStatCard, { borderColor: t.border, backgroundColor: t.subtle }]}> 
                <Text style={[styles.profileStatValue, { color: t.text }]}>{user.friends.length}</Text>
                <Text style={[styles.profileStatLabel, { color: t.muted }]}>Squad</Text>
              </View>
              <View style={[styles.profileStatCard, { borderColor: t.border, backgroundColor: t.subtle }]}> 
                <Text style={[styles.profileStatValue, { color: t.text }]}>{userRides.length}</Text>
                <Text style={[styles.profileStatLabel, { color: t.muted }]}>Missions</Text>
              </View>
              <View style={[styles.profileStatCard, { borderColor: t.border, backgroundColor: t.subtle }]}> 
                <Text style={[styles.profileStatValue, { color: t.text }]}>{user.garage.length}</Text>
                <Text style={[styles.profileStatLabel, { color: t.muted }]}>Machines</Text>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}> 
              <Text style={[styles.cardHeader, { color: t.muted }]}>GARAGE</Text>
              <View style={styles.wrapRow}>
                {user.garage.map((bike, idx) => (
                  <View key={`${bike}-${idx}`} style={[styles.pillTag, { borderColor: t.border, backgroundColor: t.subtle }]}> 
                    <Text style={[styles.pillTagText, { color: t.text }]}>{bike}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.gridTwo}>
              <View style={[styles.infoTile, { borderColor: t.border, backgroundColor: t.subtle }]}> 
                <Text style={[styles.inputLabel, { color: t.muted }]}>Style</Text>
                <Text style={[styles.bodyText, { color: t.text }]}>{user.style}</Text>
              </View>
              <View style={[styles.infoTile, { borderColor: t.border, backgroundColor: t.subtle }]}> 
                <Text style={[styles.inputLabel, { color: t.muted }]}>Window</Text>
                <Text style={[styles.bodyText, { color: t.text }]}>{user.typicalRideTime}</Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const LabeledInput = ({
  label,
  value,
  onChangeText,
  theme,
  placeholder,
  multiline,
  keyboardType
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  theme: Theme;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad' | 'email-address';
}) => {
  const t = TOKENS[theme];

  return (
    <View>
      <Text style={[styles.inputLabel, { color: t.muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.muted}
        multiline={multiline}
        keyboardType={keyboardType}
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          {
            backgroundColor: t.subtle,
            borderColor: t.border,
            color: t.text,
            textAlignVertical: multiline ? 'top' : 'center'
          }
        ]}
      />
    </View>
  );
};

const SelectorRow = ({
  label,
  options,
  selected,
  onSelect,
  theme
}: {
  label: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
  theme: Theme;
}) => {
  const t = TOKENS[theme];

  return (
    <View>
      <Text style={[styles.inputLabel, { color: t.muted }]}>{label}</Text>
      <View style={styles.wrapRow}>
        {options.map((option) => {
          const isActive = selected === option;
          return (
            <TouchableOpacity
              key={option}
              style={[
                styles.selectorChip,
                {
                  borderColor: isActive ? t.primary : t.border,
                  backgroundColor: isActive ? `${t.primary}22` : t.subtle
                }
              ]}
              onPress={() => onSelect(option)}
            >
              <Text style={[styles.selectorChipText, { color: isActive ? t.primary : t.muted }]}>{option}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  container: {
    flex: 1
  },
  header: {
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 12
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  brandIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center'
  },
  brandTitle: {
    marginLeft: 10,
    fontSize: 22,
    fontWeight: '900'
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  iconButton: {
    borderWidth: 1,
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  badgeCounter: {
    position: 'absolute',
    right: -4,
    top: -5,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3
  },
  badgeCounterText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800'
  },
  cityChip: {
    marginLeft: 8,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 8,
    height: 34,
    alignItems: 'center',
    flexDirection: 'row'
  },
  cityChipText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4
  },
  feedToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3
  },
  feedToggleButton: {
    flex: 1,
    borderRadius: 10,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row'
  },
  feedToggleText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '800'
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 2.4,
    fontWeight: '900'
  },
  mainScroll: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 130
  },
  listWrap: {
    gap: 12
  },
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    gap: 10
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800'
  },
  newsCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 12,
    gap: 12
  },
  newsImage: {
    width: '100%',
    height: 178,
    borderRadius: 14
  },
  newsMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8
  },
  newsTitle: {
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '900'
  },
  newsSummary: {
    fontSize: 17,
    lineHeight: 26,
    fontWeight: '500'
  },
  newsTag: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  newsTagText: {
    fontSize: 11,
    fontWeight: '700'
  },
  newsScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  newsScoreChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  rowAligned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  rowAlignedTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10
  },
  flex1: {
    flex: 1
  },
  avatarSmall: {
    width: 34,
    height: 34,
    borderRadius: 17
  },
  avatarTiny: {
    width: 22,
    height: 22,
    borderRadius: 11
  },
  avatarMedium: {
    width: 48,
    height: 48,
    borderRadius: 24
  },
  avatarLarge: {
    width: 74,
    height: 74,
    borderRadius: 24
  },
  boldText: {
    fontSize: 13,
    fontWeight: '700'
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center'
  },
  metaText: {
    fontSize: 11,
    fontWeight: '700'
  },
  mutedSmall: {
    fontSize: 12,
    fontWeight: '600'
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 19
  },
  statChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center'
  },
  statText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 5
  },
  routePreview: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    gap: 4
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 5
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700'
  },
  fabWrap: {
    position: 'absolute',
    right: 16,
    bottom: 84,
    alignItems: 'flex-end'
  },
  fab: {
    width: 62,
    height: 62,
    borderRadius: 31,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1
  },
  createMenu: {
    marginBottom: 12,
    gap: 8,
    alignItems: 'flex-end'
  },
  createMenuButton: {
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 42,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center'
  },
  createMenuButtonText: {
    marginLeft: 8,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  emptyWrap: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800'
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: 'center'
  },
  chatRow: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center'
  },
  unreadDot: {
    position: 'absolute',
    right: 0,
    top: 1,
    width: 10,
    height: 10,
    borderRadius: 5
  },
  chatInfo: {
    marginLeft: 12,
    flex: 1
  },
  chatPreview: {
    fontSize: 12,
    marginTop: 4
  },
  profileName: {
    fontSize: 21,
    fontWeight: '800'
  },
  profileStatsRow: {
    flexDirection: 'row',
    gap: 10
  },
  profileStatCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 68,
    padding: 8
  },
  profileStatValue: {
    fontSize: 20,
    fontWeight: '900'
  },
  profileStatLabel: {
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  cardHeader: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  pillTag: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  pillTagText: {
    fontSize: 12,
    fontWeight: '700'
  },
  gridTwo: {
    flexDirection: 'row',
    gap: 8
  },
  infoTile: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 6
  },
  friendRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  preferenceRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  primaryButton: {
    borderRadius: 14,
    minHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row'
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 13,
    marginLeft: 8,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  dangerButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    backgroundColor: '#00000005'
  },
  dangerButtonText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  modalScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.72)'
  },
  sideSheet: {
    width: '92%',
    alignSelf: 'flex-end',
    height: '100%',
    borderLeftWidth: 1
  },
  modalHeader: {
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800'
  },
  modalFooter: {
    borderTopWidth: 1,
    padding: 14
  },
  ghostButton: {
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 46,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row'
  },
  ghostButtonText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '700'
  },
  rowButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10
  },
  smallButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center'
  },
  smallButtonText: {
    fontSize: 11,
    fontWeight: '800'
  },
  chatMessagesWrap: {
    padding: 14,
    gap: 10,
    paddingBottom: 24
  },
  messageRow: {
    width: '100%'
  },
  messageLeft: {
    alignItems: 'flex-start'
  },
  messageRight: {
    alignItems: 'flex-end'
  },
  messageBubble: {
    maxWidth: '82%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    gap: 4
  },
  messageComposer: {
    borderTopWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  iconRoundButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center'
  },
  bottomSheet: {
    width: '100%',
    maxHeight: '92%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10
  },
  formSection: {
    paddingTop: 10,
    gap: 10,
    paddingBottom: 14
  },
  inputLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.7,
    fontWeight: '800',
    marginBottom: 6
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 46,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '600'
  },
  inputMultiline: {
    minHeight: 96,
    paddingTop: 12
  },
  togglePhotoButton: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 56,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8
  },
  selectorChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  selectorChipText: {
    fontSize: 11,
    fontWeight: '700'
  },
  organizerCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 10
  },
  participantPill: {
    alignItems: 'center',
    gap: 4,
    minWidth: 58
  },
  requestRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  statusStrip: {
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row'
  },
  statusStripText: {
    marginLeft: 8,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  helpImage: {
    width: '100%',
    height: 180,
    borderRadius: 14
  },
  replyCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 8
  },
  profileSheet: {
    width: '100%',
    maxHeight: '94%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    overflow: 'hidden'
  },
  profileCoverWrap: {
    height: 170
  },
  profileCover: {
    width: '100%',
    height: '100%'
  },
  profileCloseButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(2, 6, 23, 0.5)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  userProfileContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 22,
    gap: 12
  },
  userTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: -42
  },
  userAvatarHuge: {
    width: 100,
    height: 100,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: '#fff'
  },
  primaryCompactButton: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 38,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row'
  },
  primaryCompactButtonText: {
    marginLeft: 5,
    fontSize: 11,
    fontWeight: '700'
  },
  loginScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20
  },
  loginCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 12
  },
  loginTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  themeToggleCompact: {
    flexDirection: 'row',
    gap: 7
  },
  themeSmallButton: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loginTitle: {
    fontSize: 32,
    fontWeight: '900'
  },
  loginSubtitle: {
    fontSize: 13,
    lineHeight: 18
  },
  linkText: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2
  },
  errorText: {
    fontSize: 12,
    fontWeight: '700'
  },
  splashIcon: {
    width: 104,
    height: 104,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center'
  },
  splashBrand: {
    marginTop: 20,
    fontSize: 38,
    fontWeight: '900'
  },
  splashSubtitle: {
    marginTop: 8,
    fontSize: 11,
    letterSpacing: 4,
    fontWeight: '900'
  }
});

export default App;
