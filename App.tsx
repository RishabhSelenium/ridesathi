import 'react-native-gesture-handler';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
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
  Tab,
  Theme,
  TOKENS,
  avatarFallback
} from './src/app/ui';
import { TabButton } from './src/components/common';
import {
  ChatRoomScreen,
  CreateHelpModal,
  CreateRideModal,
  EditProfileModal,
  HelpDetailScreen,
  LocationSettingsModal,
  NotificationsOverlay,
  RideDetailScreen,
  UserProfileModal
} from './src/components/modals';
import { ChatsTab, FeedTab, LoginScreen, MyRidesTab, NewsTab, ProfileTab, SplashScreen } from './src/screens/tabs';
import {
  MOCK_CONVERSATIONS,
  MOCK_CURRENT_USER,
  MOCK_HELP,
  MOCK_NEWS,
  MOCK_NOTIFICATIONS,
  MOCK_RIDES,
  MOCK_USERS
} from './src/constants';
import { ChatMessage, Conversation, HelpPost, HelpReply, NewsArticle, Notification, RidePost, User } from './src/types';

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

type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  Main: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();

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

const SplashRoute = ({ theme, onComplete }: { theme: Theme; onComplete: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2200);
    return () => clearTimeout(timer);
  }, []);

  return <SplashScreen theme={theme} />;
};

const App = () => {
  const isExpoGo = Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo';
  const [hydrated, setHydrated] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
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
    setIsLoggedIn(false);
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

  const renderMainScreen = (onLogoutAndNavigate: () => void) => (
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
              onLogin={() => {
                setIsLoggedIn(true);
                navigation.replace('Main');
              }}
              theme={theme}
              onToggleTheme={setTheme}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Main">
          {({ navigation }) =>
            renderMainScreen(() => {
              handleLogout();
              navigation.replace('Login');
            })
          }
        </RootStack.Screen>
      </RootStack.Navigator>
    </NavigationContainer>
  );
};


export default App;
