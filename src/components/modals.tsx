import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { styles } from '../app/styles';
import {
  FriendStatus,
  LocationMode,
  PermissionStatus,
  Theme,
  TOKENS,
  avatarFallback,
  formatClock,
  formatDay
} from '../app/ui';
import { Badge, LabeledInput, SelectorRow } from './common';
import { Conversation, HelpPost, MapPoint, Notification, RidePost, RideType, RideVisibility, Squad, User } from '../types';

type RouteCoordinate = {
  latitude: number;
  longitude: number;
  label?: string;
};

type RouteMapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type RoutePressEvent = {
  nativeEvent: {
    coordinate: {
      latitude: number;
      longitude: number;
    };
  };
};

type RouteMapModule = {
  MapView: React.ComponentType<{
    style?: unknown;
    initialRegion: RouteMapRegion;
    mapPadding?: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
    onPress?: (event: RoutePressEvent) => void;
    children?: React.ReactNode;
  }>;
  Marker: React.ComponentType<{
    coordinate: RouteCoordinate;
    title?: string;
    pinColor?: string;
  }>;
  Polyline: React.ComponentType<{
    coordinates: RouteCoordinate[];
    strokeWidth?: number;
    strokeColor?: string;
  }>;
};

type NewsWebViewModule = {
  WebView: React.ComponentType<{
    key?: string;
    source: { uri: string };
    style?: unknown;
    onLoadStart?: () => void;
    onLoadEnd?: () => void;
    onError?: () => void;
    javaScriptEnabled?: boolean;
    domStorageEnabled?: boolean;
  }>;
};

const routeMapModule: RouteMapModule | null = (() => {
  try {
    const maps = require('react-native-maps') as {
      default: RouteMapModule['MapView'];
      Marker: RouteMapModule['Marker'];
      Polyline: RouteMapModule['Polyline'];
    };

    return {
      MapView: maps.default,
      Marker: maps.Marker,
      Polyline: maps.Polyline
    };
  } catch {
    return null;
  }
})();

const newsWebViewModule: NewsWebViewModule | null = (() => {
  try {
    return require('react-native-webview') as NewsWebViewModule;
  } catch {
    return null;
  }
})();

const isFiniteNumber = (value: number): boolean => Number.isFinite(value);

const normalizeRoutePoints = (points: MapPoint[] | undefined): MapPoint[] =>
  (points ?? []).filter((point) => isFiniteNumber(point.lat) && isFiniteNumber(point.lng));

const toRouteCoordinates = (points: MapPoint[]): RouteCoordinate[] =>
  points.map((point) => ({ latitude: point.lat, longitude: point.lng, label: point.label }));

const buildRouteRegion = (coordinates: RouteCoordinate[]): RouteMapRegion => {
  if (coordinates.length === 0) {
    return {
      latitude: 28.6139,
      longitude: 77.209,
      latitudeDelta: 0.32,
      longitudeDelta: 0.32
    };
  }

  const latitudes = coordinates.map((point) => point.latitude);
  const longitudes = coordinates.map((point) => point.longitude);

  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(maxLat - minLat + 0.08, 0.02),
    longitudeDelta: Math.max(maxLng - minLng + 0.08, 0.02)
  };
};

const buildGoogleDirectionsUrl = (coordinates: RouteCoordinate[]): string | null => {
  if (coordinates.length === 0) return null;

  const start = coordinates[0];
  const end = coordinates[coordinates.length - 1];
  const waypoints = coordinates
    .slice(1, -1)
    .map((point) => `${point.latitude},${point.longitude}`)
    .join('|');

  const query = [
    'api=1',
    `origin=${encodeURIComponent(`${start.latitude},${start.longitude}`)}`,
    `destination=${encodeURIComponent(`${end.latitude},${end.longitude}`)}`,
    waypoints ? `waypoints=${encodeURIComponent(waypoints)}` : ''
  ]
    .filter(Boolean)
    .join('&');

  return `https://www.google.com/maps/dir/?${query}`;
};

const buildRouteTextFromPoints = (points: MapPoint[]): string =>
  points.map((point, index) => point.label ?? `Stop ${index + 1}`).join(' -> ');

const getAndroidTopInset = (insets: { top: number }): number => (Platform.OS === 'android' ? Math.max(insets.top, 8) : 0);

type RideCostOption = 'Paid' | 'Split' | 'Free';
type InviteAudience = 'groups' | 'riders';
type RideInclusion = 'Dinner' | 'Drinks' | 'Breakfast' | 'Lunch';
type RideStep = 1 | 2 | 3 | 4 | 5;
type LocationPickerContext = 'primaryDestination' | 'rideStarts' | 'rideEnds';

const TRENDING_DESTINATIONS_FALLBACK = [
  'United Coffee House Rewind',
  'Andhra Pradesh Bhavan',
  'The Blue Door Cafe',
  'Spirito Libero',
  'Diggin Cafe',
  'Flywheel cafe roasters'
];

const NCR_TRENDING_DESTINATIONS = [
  'Murthal, Haryana',
  'India Gate, Delhi',
  'Leopard Trail, Gurugram',
  'Sultanpur Bird Sanctuary',
  'Paranthe Wali Gali',
  'Neemrana Fort'
];

const CITY_TRENDING_DESTINATIONS: Record<string, string[]> = {
  mumbai: ['Marine Drive', 'Gateway of India', 'Bandra Fort', 'Lonavala', 'Alibaug', 'Malshej Ghat'],
  bengaluru: ['Nandi Hills', 'Skandagiri', 'Savandurga', 'Ramanagara', 'Mysuru', 'Coorg'],
  pune: ['Lavasa', 'Lonavala', 'Mulshi', 'Sinhagad Fort', 'Mahabaleshwar', 'Tamhini Ghat'],
  hyderabad: ['Ananthagiri Hills', 'Ramoji Film City', 'Srisailam', 'Bidar', 'Warangal', 'Nagarjuna Sagar'],
  chennai: ['Mahabalipuram', 'Pondicherry', 'Yelagiri', 'Pulicat Lake', 'Vellore', 'Kanchipuram'],
  kolkata: ['Digha', 'Shantiniketan', 'Bakkhali', 'Raichak', 'Sundarbans', 'Bishnupur'],
  jaipur: ['Nahargarh Fort', 'Sariska', 'Pushkar', 'Ajmer', 'Sambhar Lake', 'Alwar'],
  chandigarh: ['Kasauli', 'Morni Hills', 'Shimla', 'Barog', 'Chail', 'Nahan']
};

const normalizeCityKey = (city: string): string => city.trim().toLowerCase();

const isNcrCity = (cityKey: string): boolean =>
  [
    'delhi',
    'new delhi',
    'noida',
    'greater noida',
    'ghaziabad',
    'gurugram',
    'gurgaon',
    'faridabad',
    'sonipat'
  ].some((keyword) => cityKey.includes(keyword));

const getTrendingDestinationsForCity = (city: string): string[] => {
  const cityKey = normalizeCityKey(city);
  if (!cityKey) return TRENDING_DESTINATIONS_FALLBACK;
  if (isNcrCity(cityKey)) return NCR_TRENDING_DESTINATIONS;

  const exact = CITY_TRENDING_DESTINATIONS[cityKey];
  if (exact) return exact;

  const partial = Object.entries(CITY_TRENDING_DESTINATIONS).find(([key]) => cityKey.includes(key))?.[1];
  return partial ?? TRENDING_DESTINATIONS_FALLBACK;
};

const DEFAULT_RIDE_NOTE = [
  '• Start with a full tank to avoid delays.',
  '• All riders and pillions must wear proper riding gear (helmet, gloves, jacket, etc.).',
  '• Arrive at least 15 minutes before the ride starts.',
  '• Ride in a staggered formation and maintain your position.',
  '• Follow traffic rules, keep a safe distance, and look out for fellow riders.'
].join('\n');

export const LocationSettingsModal = ({
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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
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

export const NotificationsOverlay = ({
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
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.modalScrim} onPress={onClose} />
        <View
          style={[
            styles.sideSheet,
            {
              backgroundColor: t.bg,
              borderLeftColor: t.border,
              paddingTop: Math.max(insets.top, 8),
              paddingBottom: Math.max(insets.bottom, 8)
            }
          ]}
        >
          <View style={[styles.modalHeader, { borderBottomColor: t.border }]}>
            <View style={styles.rowAligned}>
              <MaterialCommunityIcons name="bell-outline" size={20} color={t.primary} />
              <Text style={[styles.modalTitle, { color: t.text }]}>Alert Center</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color={t.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.notificationListWrap}>
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
      </View>
    </Modal>
  );
};

export const ChatRoomScreen = ({
  visible,
  conversation,
  currentUserId,
  syncError,
  isSyncing,
  onRetrySync,
  onClose,
  onSendMessage,
  theme
}: {
  visible: boolean;
  conversation: Conversation | null;
  currentUserId: string;
  syncError?: string | null;
  isSyncing?: boolean;
  onRetrySync?: () => void;
  onClose: () => void;
  onSendMessage: (conversationId: string, text: string) => void;
  theme: Theme;
}) => {
  const t = TOKENS[theme];
  const insets = useSafeAreaInsets();
  const topInset = getAndroidTopInset(insets);
  const [inputText, setInputText] = useState('');

  if (!conversation) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg, paddingTop: topInset }]}>
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

        {!!syncError && (
          <View style={[styles.syncBanner, { margin: 14, borderColor: `${TOKENS[theme].red}66`, backgroundColor: t.subtle }]}>
            <MaterialCommunityIcons name="cloud-alert-outline" size={18} color={TOKENS[theme].red} />
            <View style={styles.syncBannerContent}>
              <Text style={[styles.syncBannerTitle, { color: TOKENS[theme].red }]}>Chat Sync Failed</Text>
              <Text style={[styles.syncBannerMessage, { color: t.muted }]}>{syncError}</Text>
            </View>
            <TouchableOpacity
              style={[styles.syncBannerRetry, { borderColor: t.border, backgroundColor: t.card, opacity: isSyncing ? 0.7 : 1 }]}
              onPress={onRetrySync}
              disabled={!onRetrySync || isSyncing}
            >
              {isSyncing ? (
                <MaterialCommunityIcons name="progress-clock" size={16} color={t.primary} />
              ) : (
                <>
                  <MaterialCommunityIcons name="refresh" size={14} color={t.primary} />
                  <Text style={[styles.syncBannerRetryText, { color: t.primary }]}>Retry</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

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

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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

export const CreateRideModal = ({
  visible,
  onClose,
  onSubmit,
  theme,
  currentCity
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (ride: Omit<RidePost, 'id' | 'creatorId' | 'creatorName' | 'creatorAvatar' | 'currentParticipants' | 'requests' | 'createdAt' | 'city'>) => void;
  theme: Theme;
  currentCity: string;
}) => {
  const t = TOKENS[theme];
  const insets = useSafeAreaInsets();
  const topInset = getAndroidTopInset(insets);
  const accent = t.primary;
  const inactiveBorder = t.border;
  const inactiveText = t.muted;
  const selectedBackground = `${t.primary}1a`;
  const inactiveButtonBackground = `${t.muted}66`;
  const switchThumbOff = theme === 'dark' ? '#cbd5e1' : '#ffffff';
  const [primaryDestination, setPrimaryDestination] = useState('');
  const [rideName, setRideName] = useState('');
  const [dayMode, setDayMode] = useState<'single' | 'multi'>('single');
  const [date, setDate] = useState('');
  const [rideStartsAt, setRideStartsAt] = useState('');
  const [ridingTo, setRidingTo] = useState('');
  const [rideEndsAt, setRideEndsAt] = useState('');
  const [rideStartPoint, setRideStartPoint] = useState<MapPoint | null>(null);
  const [rideEndPoint, setRideEndPoint] = useState<MapPoint | null>(null);
  const [assemblyTime, setAssemblyTime] = useState('');
  const [flagOffTime, setFlagOffTime] = useState('');
  const [rideDuration, setRideDuration] = useState('');
  const [costOption, setCostOption] = useState<RideCostOption>('Free');
  const [pricePerPerson, setPricePerPerson] = useState('');
  const [inclusions, setInclusions] = useState<RideInclusion[]>([]);
  const [rideNote, setRideNote] = useState(DEFAULT_RIDE_NOTE);
  const [inviteAudience, setInviteAudience] = useState<InviteAudience>('groups');
  const [isPrivateRide, setIsPrivateRide] = useState(false);
  const [hasRiderLimit, setHasRiderLimit] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState('5');
  const [routePoints, setRoutePoints] = useState<MapPoint[]>([]);
  const [draftRoutePoints, setDraftRoutePoints] = useState<MapPoint[]>([]);
  const [destinationQuery, setDestinationQuery] = useState('');
  const [savedDestinations, setSavedDestinations] = useState<string[]>([]);
  const [isDestinationPickerOpen, setIsDestinationPickerOpen] = useState(false);
  const [locationPickerContext, setLocationPickerContext] = useState<LocationPickerContext>('primaryDestination');
  const [isRidePointPickerOpen, setIsRidePointPickerOpen] = useState(false);
  const [draftRidePoint, setDraftRidePoint] = useState<MapPoint | null>(null);
  const [isStopPickerOpen, setIsStopPickerOpen] = useState(false);
  const inclusionOptions: RideInclusion[] = ['Dinner', 'Drinks', 'Breakfast', 'Lunch'];
  const trendingDestinations = useMemo(() => getTrendingDestinationsForCity(currentCity), [currentCity]);
  const normalizedCurrentCity = currentCity.trim();
  const destinationSuggestions = useMemo(() => {
    const pool = [normalizedCurrentCity, ...savedDestinations, ...trendingDestinations].filter((item) => item.trim().length > 0);
    const seen = new Set<string>();
    const unique: string[] = [];

    pool.forEach((item) => {
      const normalized = item.trim();
      const key = normalized.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(normalized);
      }
    });

    return unique;
  }, [normalizedCurrentCity, savedDestinations, trendingDestinations]);
  const filteredDestinationSuggestions = useMemo(() => {
    const query = destinationQuery.trim().toLowerCase();
    if (!query) return destinationSuggestions;
    return destinationSuggestions.filter((item) => item.toLowerCase().includes(query));
  }, [destinationQuery, destinationSuggestions]);

  const resetForm = () => {
    setPrimaryDestination('');
    setRideName('');
    setDayMode('single');
    setDate('');
    setRideStartsAt('');
    setRidingTo('');
    setRideEndsAt('');
    setRideStartPoint(null);
    setRideEndPoint(null);
    setAssemblyTime('');
    setFlagOffTime('');
    setRideDuration('');
    setCostOption('Free');
    setPricePerPerson('');
    setInclusions([]);
    setRideNote(DEFAULT_RIDE_NOTE);
    setInviteAudience('groups');
    setIsPrivateRide(false);
    setHasRiderLimit(false);
    setMaxParticipants('5');
    setDestinationQuery('');
    setIsDestinationPickerOpen(false);
    setIsRidePointPickerOpen(false);
    setDraftRidePoint(null);
    setRoutePoints([]);
    setDraftRoutePoints([]);
    setIsStopPickerOpen(false);
  };

  useEffect(() => {
    if (!visible) {
      resetForm();
    }
  }, [visible]);

  const riderLimit = Math.max(2, Math.min(20, Number(maxParticipants) || 5));
  const routeSummary = [rideStartsAt.trim(), ridingTo.trim(), rideEndsAt.trim()].filter(Boolean).join(' -> ');
  const summaryDestination = primaryDestination.trim() || ridingTo.trim() || 'Pending destination';

  const canSubmit =
    primaryDestination.trim().length > 0 &&
    rideName.trim().length > 0 &&
    date.trim().length > 0 &&
    rideStartsAt.trim().length > 0 &&
    ridingTo.trim().length > 0 &&
    rideEndsAt.trim().length > 0 &&
    assemblyTime.trim().length > 0 &&
    flagOffTime.trim().length > 0 &&
    (costOption !== 'Paid' || pricePerPerson.trim().length > 0) &&
    (!hasRiderLimit || Number(maxParticipants) >= 2);

  const submit = () => {
    if (!canSubmit) return;

    const resolvedRideType: RideType = dayMode === 'multi' ? 'Long Tour' : 'Sunday Morning';
    const resolvedVisibility: RideVisibility[] = isPrivateRide ? ['Friends'] : ['City'];
    const baseRoute = routeSummary || summaryDestination;
    const mappedRoutePoints: MapPoint[] = [
      ...(rideStartPoint ? [{ ...rideStartPoint, label: 'Ride starts' }] : []),
      ...routePoints,
      ...(rideEndPoint ? [{ ...rideEndPoint, label: 'Ride ends' }] : [])
    ];
    const finalRoutePoints = mappedRoutePoints.length > 0 ? mappedRoutePoints : routePoints;
    const finalRoute = finalRoutePoints.length > 0 ? buildRouteTextFromPoints(finalRoutePoints) : baseRoute;
    const numericPrice = Number(pricePerPerson);

    onSubmit({
      title: rideName.trim(),
      type: resolvedRideType,
      route: finalRoute,
      routePoints: finalRoutePoints,
      date: date.trim(),
      startTime: flagOffTime.trim(),
      maxParticipants: hasRiderLimit ? riderLimit : 20,
      visibility: resolvedVisibility,
      primaryDestination: summaryDestination,
      dayPlan: dayMode,
      startLocation: rideStartsAt.trim(),
      endLocation: rideEndsAt.trim(),
      assemblyTime: assemblyTime.trim(),
      flagOffTime: flagOffTime.trim(),
      rideDuration: rideDuration.trim() || undefined,
      costType: costOption,
      pricePerPerson: costOption === 'Paid' && Number.isFinite(numericPrice) ? numericPrice : undefined,
      inclusions: costOption === 'Paid' ? inclusions : [],
      rideNote: rideNote.trim(),
      inviteAudience,
      isPrivate: isPrivateRide
    });

    resetForm();
  };

  const handleDestinationSelected = (value: string) => {
    const destination = value.trim();
    if (!destination) return;
    setPrimaryDestination(destination);
    setRidingTo(destination);
    if (!rideName.trim()) {
      setRideName(`Ride To ${destination}`);
    }
  };

  const saveDestination = (value: string) => {
    const normalized = value.trim();
    if (!normalized) return;

    setSavedDestinations((prev) => {
      const withoutDuplicate = prev.filter((item) => item.toLowerCase() !== normalized.toLowerCase());
      return [normalized, ...withoutDuplicate].slice(0, 6);
    });
  };

  const handleApplyPrimaryDestination = (value: string) => {
    const normalized = value.trim();
    if (!normalized) return;

    setPrimaryDestination(normalized);
    setDestinationQuery(normalized);
    saveDestination(normalized);
    setIsDestinationPickerOpen(false);
    handleDestinationSelected(normalized);
  };

  const getLocationValueByContext = (context: LocationPickerContext): string => {
    if (context === 'rideStarts') return rideStartsAt;
    if (context === 'rideEnds') return rideEndsAt;
    return primaryDestination;
  };

  const getPointByContext = (context: LocationPickerContext): MapPoint | null => {
    if (context === 'rideStarts') return rideStartPoint;
    if (context === 'rideEnds') return rideEndPoint;
    return null;
  };

  const handleApplyLocationSelection = (value: string, context: LocationPickerContext) => {
    const normalized = value.trim();
    if (!normalized) return;

    if (context === 'primaryDestination') {
      handleApplyPrimaryDestination(normalized);
      return;
    }

    if (context === 'rideStarts') {
      setRideStartsAt(normalized);
    } else {
      setRideEndsAt(normalized);
    }

    setDestinationQuery(normalized);
    saveDestination(normalized);
    setIsDestinationPickerOpen(false);
  };

  const openRidePointPicker = (context: 'rideStarts' | 'rideEnds') => {
    setLocationPickerContext(context);
    setDraftRidePoint(getPointByContext(context));
    setIsRidePointPickerOpen(true);
  };

  const handlePickRidePointFromMap = (event: RoutePressEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    setDraftRidePoint({
      lat: latitude,
      lng: longitude,
      label: locationPickerContext === 'rideEnds' ? 'Ride ends' : 'Ride starts'
    });
  };

  const clearDraftRidePoint = () => {
    setDraftRidePoint(null);
  };

  const applyRidePointFromMap = () => {
    if (!draftRidePoint) return;

    const formattedLabel = `${draftRidePoint.lat.toFixed(4)}, ${draftRidePoint.lng.toFixed(4)}`;
    if (locationPickerContext === 'rideStarts') {
      setRideStartPoint({ ...draftRidePoint, label: 'Ride starts' });
      setRideStartsAt(formattedLabel);
    } else if (locationPickerContext === 'rideEnds') {
      setRideEndPoint({ ...draftRidePoint, label: 'Ride ends' });
      setRideEndsAt(formattedLabel);
    }

    saveDestination(formattedLabel);
    setIsRidePointPickerOpen(false);
  };

  const openDestinationPicker = (context: LocationPickerContext = 'primaryDestination') => {
    setLocationPickerContext(context);
    if (context === 'rideStarts' || context === 'rideEnds') {
      openRidePointPicker(context);
      return;
    }
    setDestinationQuery(getLocationValueByContext(context));
    setIsDestinationPickerOpen(true);
  };

  const addLocationFromQuery = () => {
    handleApplyLocationSelection(destinationQuery, locationPickerContext);
  };

  const destinationPlaceholder =
    locationPickerContext === 'primaryDestination'
      ? 'Primary Destination'
      : locationPickerContext === 'rideStarts'
        ? 'Ride starts'
        : 'Ride ends';

  const handleOpenStopPicker = () => {
    setDraftRoutePoints(routePoints.map((point) => ({ ...point })));
    setIsStopPickerOpen(true);
  };

  const handleAddStopFromMap = (event: RoutePressEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    setDraftRoutePoints((prev) => [
      ...prev,
      {
        lat: latitude,
        lng: longitude,
        label: `Stop ${prev.length + 1}`
      }
    ]);
  };

  const handleUndoStop = () => {
    setDraftRoutePoints((prev) => prev.slice(0, -1));
  };

  const handleClearStops = () => {
    setDraftRoutePoints([]);
  };

  const handleApplyStops = () => {
    const normalizedPoints = draftRoutePoints.map((point, index) => ({
      ...point,
      label: point.label?.trim() || `Stop ${index + 1}`
    }));

    setRoutePoints(normalizedPoints);
    setIsStopPickerOpen(false);
  };

  const toggleInclusion = (option: RideInclusion) => {
    setInclusions((prev) => {
      if (prev.includes(option)) {
        return prev.filter((item) => item !== option);
      }
      return [...prev, option];
    });
  };

  const pickerCoordinates = toRouteCoordinates(draftRoutePoints);
  const pickerRegion = buildRouteRegion(pickerCoordinates);
  const ridePointCoordinates = draftRidePoint ? toRouteCoordinates([draftRidePoint]) : [];
  const ridePointRegion = buildRouteRegion(ridePointCoordinates);
  const ridePointTitle = locationPickerContext === 'rideEnds' ? 'Ride ends location' : 'Ride starts location';

  return (
    <>
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg, paddingTop: topInset }]}>
          <KeyboardAvoidingView style={styles.fullScreen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.modalHeader, { borderBottomColor: t.border, paddingHorizontal: 16 }]}>
              <View style={styles.rowAligned}>
                <TouchableOpacity onPress={onClose} style={createRideWizardStyles.headerBackButton}>
                  <MaterialCommunityIcons name="arrow-left" size={30} color={t.text} />
                </TouchableOpacity>
                <Text style={[createRideWizardStyles.headerTitle, { color: t.text }]}>Create Ride</Text>
              </View>
            </View>

            <ScrollView
              contentContainerStyle={createRideWizardStyles.content}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >

              {/* ── Section: Destination ── */}
              <View style={createRideWizardStyles.stepSection}>
                <Text style={[createRideWizardStyles.stepTitle, { color: accent }]}>Destination</Text>

                <View style={createRideWizardStyles.fieldBlock}>
                  <Text style={[createRideWizardStyles.fieldLabel, { color: t.text }]}>Primary destination*</Text>
                  <TouchableOpacity
                    style={[createRideWizardStyles.destinationPickerField, { borderBottomColor: t.muted }]}
                    onPress={() => openDestinationPicker('primaryDestination')}
                  >
                    <Text style={[createRideWizardStyles.destinationPickerValue, { color: primaryDestination ? t.text : `${t.muted}99` }]}>
                      {primaryDestination || 'Murthal, Haryana, India'}
                    </Text>
                    <MaterialCommunityIcons name="map-marker-outline" size={18} color={t.muted} />
                  </TouchableOpacity>
                </View>

                <View style={createRideWizardStyles.fieldBlock}>
                  <Text style={[createRideWizardStyles.trendingLabel, { color: t.text }]}>Trending Destinations</Text>
                  <View style={styles.wrapRow}>
                    {trendingDestinations.map((item) => {
                      const isActive = item === primaryDestination;
                      return (
                        <TouchableOpacity
                          key={item}
                          style={[
                            createRideWizardStyles.trendingChip,
                            {
                              borderColor: isActive ? accent : inactiveBorder,
                              backgroundColor: isActive ? selectedBackground : t.subtle
                            }
                          ]}
                          onPress={() => handleApplyPrimaryDestination(item)}
                        >
                          <Text style={[createRideWizardStyles.trendingChipText, { color: t.text }]}>{item}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>

              {/* ── Section divider ── */}
              <View style={[createRideWizardStyles.sectionDivider, { borderBottomColor: t.border }]} />

              {/* ── Section: Ride Name ── */}
              <View style={createRideWizardStyles.stepSection}>
                <Text style={[createRideWizardStyles.stepTitle, { color: accent }]}>Ride Name</Text>

                <View style={createRideWizardStyles.fieldBlock}>
                  <Text style={[createRideWizardStyles.fieldLabel, { color: t.text }]}>Give the ride a name*</Text>
                  <TextInput
                    style={[createRideWizardStyles.lineInputLarge, { borderBottomColor: t.muted, color: t.text }]}
                    value={rideName}
                    onChangeText={(value) => setRideName(value.slice(0, 65))}
                    placeholder="Ride To Murthal"
                    placeholderTextColor={`${t.muted}99`}
                  />
                  <Text style={[createRideWizardStyles.charCount, { color: t.muted }]}>({65 - rideName.length})</Text>
                </View>
              </View>

              {/* ── Section divider ── */}
              <View style={[createRideWizardStyles.sectionDivider, { borderBottomColor: t.border }]} />

              {/* ── Section: Itinerary ── */}
              <View style={createRideWizardStyles.stepSection}>
                <Text style={[createRideWizardStyles.stepTitle, { color: accent }]}>Itinerary</Text>

                <View style={[createRideWizardStyles.dayModeRow, { marginTop: 8 }]}>
                  <TouchableOpacity
                    style={[
                      createRideWizardStyles.dayModeButton,
                      {
                        borderColor: dayMode === 'single' ? accent : inactiveBorder,
                        backgroundColor: dayMode === 'single' ? selectedBackground : t.subtle
                      }
                    ]}
                    onPress={() => setDayMode('single')}
                  >
                    <Text style={[createRideWizardStyles.dayModeText, { color: dayMode === 'single' ? accent : inactiveText }]}>Single Day</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      createRideWizardStyles.dayModeButton,
                      {
                        borderColor: dayMode === 'multi' ? accent : inactiveBorder,
                        backgroundColor: dayMode === 'multi' ? selectedBackground : t.subtle
                      }
                    ]}
                    onPress={() => setDayMode('multi')}
                  >
                    <Text style={[createRideWizardStyles.dayModeText, { color: dayMode === 'multi' ? accent : inactiveText }]}>Multi Day</Text>
                  </TouchableOpacity>
                </View>

                <View style={createRideWizardStyles.fieldBlock}>
                  <Text style={[createRideWizardStyles.fieldLabel, { color: t.text }]}>Date*</Text>
                  <TextInput
                    style={[createRideWizardStyles.filledInput, { backgroundColor: t.surface, color: t.text }]}
                    value={date}
                    onChangeText={setDate}
                    placeholder="Wed | Mar 4"
                    placeholderTextColor={`${t.muted}99`}
                  />
                </View>

                <View style={createRideWizardStyles.fieldBlock}>
                  <TouchableOpacity
                    style={[createRideWizardStyles.filledInput, createRideWizardStyles.locationPickerInput, { backgroundColor: t.surface }]}
                    onPress={() => openRidePointPicker('rideStarts')}
                  >
                    <Text style={[createRideWizardStyles.locationPickerInputText, { color: rideStartsAt ? t.text : `${t.muted}99` }]}>
                      {rideStartsAt || 'Ride starts*'}
                    </Text>
                    <MaterialCommunityIcons name="map-marker-outline" size={18} color={t.muted} />
                  </TouchableOpacity>

                  <TextInput
                    style={[createRideWizardStyles.filledInput, { backgroundColor: t.surface, color: t.text }]}
                    value={ridingTo}
                    onChangeText={setRidingTo}
                    placeholder="Riding to*"
                    placeholderTextColor={`${t.muted}99`}
                  />

                  <TouchableOpacity
                    style={[createRideWizardStyles.filledInput, createRideWizardStyles.locationPickerInput, { backgroundColor: t.surface }]}
                    onPress={() => openRidePointPicker('rideEnds')}
                  >
                    <Text style={[createRideWizardStyles.locationPickerInputText, { color: rideEndsAt ? t.text : `${t.muted}99` }]}>
                      {rideEndsAt || 'Ride ends*'}
                    </Text>
                    <MaterialCommunityIcons name="map-marker-outline" size={18} color={t.muted} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[createRideWizardStyles.routeMapButton, { borderColor: t.border, backgroundColor: t.surface }]}
                  onPress={handleOpenStopPicker}
                >
                  <MaterialCommunityIcons name="map-marker-path" size={18} color={accent} />
                  <Text style={[createRideWizardStyles.routeMapButtonText, { color: accent }]}>
                    {routePoints.length > 0 ? `Edit route on map (${routePoints.length})` : 'Add route on map'}
                  </Text>
                </TouchableOpacity>

                <View style={createRideWizardStyles.timelineGrid}>
                  <TextInput
                    style={[createRideWizardStyles.timeTileInput, { backgroundColor: t.surface, color: t.text }]}
                    value={assemblyTime}
                    onChangeText={setAssemblyTime}
                    placeholder="Assembly*"
                    placeholderTextColor={`${t.muted}99`}
                  />
                  <TextInput
                    style={[createRideWizardStyles.timeTileInput, { backgroundColor: t.surface, color: t.text }]}
                    value={flagOffTime}
                    onChangeText={setFlagOffTime}
                    placeholder="Flag off*"
                    placeholderTextColor={`${t.muted}99`}
                  />
                  <TextInput
                    style={[createRideWizardStyles.timeTileInput, { backgroundColor: t.surface, color: t.text }]}
                    value={rideDuration}
                    onChangeText={setRideDuration}
                    placeholder="Duration"
                    placeholderTextColor={`${t.muted}99`}
                  />
                </View>
              </View>

              {/* ── Section divider ── */}
              <View style={[createRideWizardStyles.sectionDivider, { borderBottomColor: t.border }]} />

              {/* ── Section: Cost & Extras ── */}
              <View style={createRideWizardStyles.stepSection}>
                <Text style={[createRideWizardStyles.stepTitle, { color: accent }]}>Cost & Extras</Text>

                <View style={[createRideWizardStyles.fieldBlock, { marginTop: 8 }]}>
                  <Text style={[createRideWizardStyles.fieldLabel, { color: t.text }]}>Is this ride free?</Text>
                  <View style={createRideWizardStyles.costRow}>
                    {(['Paid', 'Split', 'Free'] as RideCostOption[]).map((option) => {
                      const isActive = costOption === option;
                      return (
                        <TouchableOpacity
                          key={option}
                          style={[
                            createRideWizardStyles.costButton,
                            {
                              borderColor: isActive ? accent : inactiveBorder,
                              backgroundColor: isActive ? selectedBackground : t.subtle
                            }
                          ]}
                          onPress={() => setCostOption(option)}
                        >
                          <Text style={[createRideWizardStyles.costButtonText, { color: isActive ? accent : t.text }]}>{option}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {costOption === 'Paid' && (
                  <View style={createRideWizardStyles.fieldBlock}>
                    <Text style={[createRideWizardStyles.fieldLabel, { color: t.text }]}>How much per person:</Text>
                    <TextInput
                      style={[createRideWizardStyles.lineInput, { borderBottomColor: t.muted, color: t.text }]}
                      value={pricePerPerson}
                      onChangeText={(value) => setPricePerPerson(value.replace(/[^\d]/g, '').slice(0, 5))}
                      placeholder="Enter amount"
                      placeholderTextColor={`${t.muted}99`}
                      keyboardType="number-pad"
                    />

                    <Text style={[createRideWizardStyles.inclusionHeader, { color: t.text }]}>
                      Inclusions: {inclusions.length} selected
                    </Text>
                    <View style={styles.wrapRow}>
                      {inclusionOptions.map((option) => {
                        const isSelected = inclusions.includes(option);
                        const iconName =
                          option === 'Drinks' ? 'glass-cocktail' : option === 'Breakfast' ? 'coffee' : 'silverware-fork-knife';
                        return (
                          <TouchableOpacity
                            key={option}
                            style={[
                              createRideWizardStyles.inclusionChip,
                              {
                                borderColor: isSelected ? accent : inactiveBorder,
                                backgroundColor: isSelected ? selectedBackground : t.subtle
                              }
                            ]}
                            onPress={() => toggleInclusion(option)}
                          >
                            <MaterialCommunityIcons name={iconName} size={20} color={t.text} />
                            <Text style={[createRideWizardStyles.inclusionChipText, { color: t.text }]}>{option}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                <View style={createRideWizardStyles.fieldBlock}>
                  <Text style={[createRideWizardStyles.fieldLabel, { color: t.text }]}>Ride Note</Text>
                  <TextInput
                    style={[createRideWizardStyles.rideNoteInput, { borderColor: t.muted, color: t.text }]}
                    value={rideNote}
                    onChangeText={(value) => setRideNote(value.slice(0, 700))}
                    placeholder="Add ride rules and safety notes"
                    placeholderTextColor={`${t.muted}99`}
                    multiline
                  />
                  <Text style={[createRideWizardStyles.charCount, { color: t.muted }]}>({rideNote.length})</Text>
                </View>
              </View>

              {/* ── Section divider ── */}
              <View style={[createRideWizardStyles.sectionDivider, { borderBottomColor: t.border }]} />

              {/* ── Section: Preferences ── */}
              <View style={createRideWizardStyles.stepSection}>
                <Text style={[createRideWizardStyles.stepTitle, { color: accent }]}>Preferences</Text>

                <View style={createRideWizardStyles.inviteModeRow}>
                  <TouchableOpacity
                    style={[
                      createRideWizardStyles.inviteModeButton,
                      {
                        borderColor: inviteAudience === 'groups' ? accent : inactiveBorder,
                        backgroundColor: inviteAudience === 'groups' ? selectedBackground : t.subtle
                      }
                    ]}
                    onPress={() => setInviteAudience('groups')}
                  >
                    <Text style={[createRideWizardStyles.inviteModeText, { color: inviteAudience === 'groups' ? accent : inactiveText }]}>Groups</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      createRideWizardStyles.inviteModeButton,
                      {
                        borderColor: inviteAudience === 'riders' ? accent : inactiveBorder,
                        backgroundColor: inviteAudience === 'riders' ? selectedBackground : t.subtle
                      }
                    ]}
                    onPress={() => setInviteAudience('riders')}
                  >
                    <Text style={[createRideWizardStyles.inviteModeText, { color: inviteAudience === 'riders' ? accent : inactiveText }]}>Riders</Text>
                  </TouchableOpacity>
                </View>

                <View style={[createRideWizardStyles.preferenceCard, { borderTopColor: t.border }]}>
                  <View style={createRideWizardStyles.preferenceRow}>
                    <View style={styles.flex1}>
                      <Text style={[createRideWizardStyles.preferenceTitle, { color: t.text }]}>Make ride private</Text>
                      <Text style={[createRideWizardStyles.preferenceText, { color: t.text }]}>
                        Riders outside your group cannot request to join.
                      </Text>
                    </View>
                    <Switch
                      value={isPrivateRide}
                      onValueChange={setIsPrivateRide}
                      trackColor={{ false: inactiveBorder, true: `${accent}77` }}
                      thumbColor={isPrivateRide ? accent : switchThumbOff}
                    />
                  </View>

                  <View style={createRideWizardStyles.preferenceRow}>
                    <View style={styles.flex1}>
                      <Text style={[createRideWizardStyles.preferenceTitle, { color: t.text }]}>Limit number of riders</Text>
                      <Text style={[createRideWizardStyles.preferenceText, { color: t.text }]}>
                        Set a threshold to ensure ride safety.
                      </Text>
                    </View>
                    <Switch
                      value={hasRiderLimit}
                      onValueChange={setHasRiderLimit}
                      trackColor={{ false: inactiveBorder, true: `${accent}77` }}
                      thumbColor={hasRiderLimit ? accent : switchThumbOff}
                    />
                  </View>

                  {hasRiderLimit && (
                    <View style={createRideWizardStyles.fieldBlock}>
                      <Text style={[createRideWizardStyles.fieldLabel, { color: t.text }]}>Maximum riders</Text>
                      <TextInput
                        style={[createRideWizardStyles.filledInput, { backgroundColor: t.surface, color: t.text }]}
                        value={maxParticipants}
                        onChangeText={(value) => setMaxParticipants(value.replace(/[^\d]/g, '').slice(0, 2))}
                        placeholder="5"
                        placeholderTextColor={`${t.muted}99`}
                        keyboardType="number-pad"
                      />
                    </View>
                  )}
                </View>
              </View>
            </ScrollView>

            <View
              style={[
                createRideWizardStyles.footer,
                {
                  borderTopColor: t.border,
                  backgroundColor: t.bg,
                  paddingBottom: Math.max(insets.bottom, 12)
                }
              ]}
            >
              <TouchableOpacity
                style={[
                  createRideWizardStyles.nextButton,
                  {
                    backgroundColor: canSubmit ? accent : inactiveButtonBackground
                  }
                ]}
                onPress={submit}
                disabled={!canSubmit}
              >
                <Text style={createRideWizardStyles.nextButtonText}>Launch Ride</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      <Modal visible={isDestinationPickerOpen} animationType="slide" onRequestClose={() => setIsDestinationPickerOpen(false)}>
        <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg, paddingTop: topInset }]}>
          <View style={[createRideWizardStyles.destinationHeader, { borderBottomColor: t.border }]}>
            <TouchableOpacity onPress={() => setIsDestinationPickerOpen(false)} style={createRideWizardStyles.destinationHeaderBack}>
              <MaterialCommunityIcons name="arrow-left" size={30} color={t.text} />
            </TouchableOpacity>
            <View style={[createRideWizardStyles.destinationSearchBox, { borderColor: t.border, backgroundColor: t.surface }]}>
              <TextInput
                style={[createRideWizardStyles.destinationSearchInput, { color: t.text }]}
                value={destinationQuery}
                onChangeText={setDestinationQuery}
                placeholder={destinationPlaceholder}
                placeholderTextColor={`${t.muted}99`}
                autoFocus
                returnKeyType="search"
                onSubmitEditing={addLocationFromQuery}
              />
              {destinationQuery.trim().length > 0 && (
                <TouchableOpacity onPress={() => setDestinationQuery('')}>
                  <MaterialCommunityIcons name="close" size={24} color={t.muted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <ScrollView style={styles.flex1} keyboardShouldPersistTaps="handled">
            <TouchableOpacity
              style={[createRideWizardStyles.destinationActionRow, { borderBottomColor: t.border, backgroundColor: t.surface }]}
              onPress={addLocationFromQuery}
            >
              <MaterialCommunityIcons name="map-marker-plus-outline" size={24} color={accent} />
              <Text style={[createRideWizardStyles.destinationActionText, { color: t.text }]}>Add Location</Text>
            </TouchableOpacity>

            <View style={[createRideWizardStyles.destinationSection, { borderBottomColor: t.border, backgroundColor: t.subtle }]}>
              <Text style={[createRideWizardStyles.destinationSectionTitle, { color: t.text }]}>Your Saved Locations</Text>
              {savedDestinations.length === 0 ? (
                <Text style={[createRideWizardStyles.destinationEmptyText, { color: t.muted }]}>Empty</Text>
              ) : (
                <View style={createRideWizardStyles.destinationList}>
                  {savedDestinations.map((item) => (
                    <TouchableOpacity
                      key={`saved-${item}`}
                      style={[createRideWizardStyles.destinationListRow, { borderBottomColor: t.border }]}
                      onPress={() => handleApplyLocationSelection(item, locationPickerContext)}
                    >
                      <View style={styles.rowAligned}>
                        <MaterialCommunityIcons name="bookmark-outline" size={20} color={accent} />
                        <Text style={[createRideWizardStyles.destinationListText, { color: t.text }]}>{item}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={[createRideWizardStyles.destinationSection, { backgroundColor: t.bg }]}>
              {filteredDestinationSuggestions
                .filter((item) => item.toLowerCase() !== normalizedCurrentCity.toLowerCase())
                .slice(0, 6)
                .map((item) => (
                  <TouchableOpacity
                    key={`suggestion-${item}`}
                    style={[createRideWizardStyles.destinationListRow, { borderBottomColor: t.border }]}
                    onPress={() => handleApplyLocationSelection(item, locationPickerContext)}
                  >
                    <View style={styles.rowAligned}>
                      <MaterialCommunityIcons name="map-marker-radius-outline" size={20} color={t.muted} />
                      <Text style={[createRideWizardStyles.destinationListText, { color: t.text }]}>{item}</Text>
                    </View>
                  </TouchableOpacity>
                ))}

              <TouchableOpacity
                style={[createRideWizardStyles.destinationListRow, { borderBottomColor: t.border, opacity: normalizedCurrentCity ? 1 : 0.5 }]}
                onPress={() => handleApplyLocationSelection(normalizedCurrentCity, locationPickerContext)}
                disabled={!normalizedCurrentCity}
              >
                <View style={styles.rowAligned}>
                  <MaterialCommunityIcons name="crosshairs-gps" size={20} color={t.text} />
                  <View>
                    <Text style={[createRideWizardStyles.destinationListText, { color: t.text }]}>Current Location</Text>
                    {normalizedCurrentCity ? (
                      <Text style={[createRideWizardStyles.destinationListSubText, { color: t.muted }]}>{normalizedCurrentCity}</Text>
                    ) : (
                      <Text style={[createRideWizardStyles.destinationListSubText, { color: t.muted }]}>Location unavailable</Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={isRidePointPickerOpen} animationType="slide" onRequestClose={() => setIsRidePointPickerOpen(false)}>
        <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg, paddingTop: topInset }]}>
          <View style={[styles.modalHeader, { borderBottomColor: t.border }]}>
            <View style={styles.rowAligned}>
              <TouchableOpacity
                onPress={() => setIsRidePointPickerOpen(false)}
                style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}
              >
                <MaterialCommunityIcons name="arrow-left" size={20} color={t.text} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: t.text }]}>{ridePointTitle}</Text>
            </View>
            <TouchableOpacity
              style={[
                styles.primaryCompactButton,
                {
                  borderColor: draftRidePoint ? accent : t.border,
                  backgroundColor: draftRidePoint ? accent : t.subtle,
                  opacity: draftRidePoint ? 1 : 0.65
                }
              ]}
              onPress={applyRidePointFromMap}
              disabled={!draftRidePoint}
            >
              <MaterialCommunityIcons name="check" size={16} color={draftRidePoint ? '#fff' : t.muted} />
              <Text style={[styles.primaryCompactButtonText, { color: draftRidePoint ? '#fff' : t.muted }]}>Use Location</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.routePickerBody}>
            <Text style={[styles.bodyText, { color: t.muted }]}>Tap on the map to set {locationPickerContext === 'rideEnds' ? 'ride end' : 'ride start'}.</Text>

            {routeMapModule ? (
              <View style={[styles.routePickerMapFrame, { borderColor: t.border }]}>
                <routeMapModule.MapView style={styles.routePickerMap} initialRegion={ridePointRegion} onPress={handlePickRidePointFromMap}>
                  {ridePointCoordinates.map((point) => (
                    <routeMapModule.Marker
                      key={`${point.latitude}-${point.longitude}`}
                      coordinate={point}
                      title={ridePointTitle}
                      pinColor={locationPickerContext === 'rideEnds' ? TOKENS[theme].red : TOKENS[theme].green}
                    />
                  ))}
                </routeMapModule.MapView>
              </View>
            ) : (
              <View style={[styles.mapUnavailable, { borderColor: t.border, backgroundColor: t.subtle }]}>
                <MaterialCommunityIcons name="map-search-outline" size={18} color={accent} />
                <Text style={[styles.metaText, { color: t.muted }]}>Install `react-native-maps` to choose locations on map.</Text>
              </View>
            )}

            <View style={styles.routePickerActionRow}>
              <TouchableOpacity
                style={[styles.routePickerActionButton, { borderColor: t.border, backgroundColor: t.subtle }]}
                disabled={!draftRidePoint}
                onPress={clearDraftRidePoint}
              >
                <Text style={[styles.smallButtonText, { color: !draftRidePoint ? `${TOKENS[theme].red}66` : TOKENS[theme].red }]}>Clear</Text>
              </TouchableOpacity>
            </View>

            {draftRidePoint ? (
              <View style={[styles.routePickerPointRow, { borderColor: t.border, backgroundColor: t.subtle }]}>
                <Text style={[styles.boldText, { color: t.text }]}>{ridePointTitle}</Text>
                <Text style={[styles.metaText, { color: t.muted }]}>
                  {draftRidePoint.lat.toFixed(4)}, {draftRidePoint.lng.toFixed(4)}
                </Text>
              </View>
            ) : (
              <View style={[styles.routePickerEmpty, { borderColor: t.border, backgroundColor: t.subtle }]}>
                <MaterialCommunityIcons name="map-marker-plus-outline" size={18} color={accent} />
                <Text style={[styles.metaText, { color: t.muted }]}>No location selected yet.</Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={isStopPickerOpen} animationType="slide" onRequestClose={() => setIsStopPickerOpen(false)}>
        <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg, paddingTop: topInset }]}>
          <View style={[styles.modalHeader, { borderBottomColor: t.border }]}>
            <View style={styles.rowAligned}>
              <TouchableOpacity
                onPress={() => setIsStopPickerOpen(false)}
                style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}
              >
                <MaterialCommunityIcons name="arrow-left" size={20} color={t.text} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: t.text }]}>Route Stops</Text>
            </View>
            <TouchableOpacity
              style={[styles.primaryCompactButton, { borderColor: accent, backgroundColor: accent }]}
              onPress={handleApplyStops}
            >
              <MaterialCommunityIcons name="check" size={16} color="#fff" />
              <Text style={[styles.primaryCompactButtonText, { color: '#fff' }]}>Use Stops</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.routePickerBody}>
            <Text style={[styles.bodyText, { color: t.muted }]}>
              Tap anywhere on the map to add multiple route stops in order.
            </Text>

            {routeMapModule ? (
              <View style={[styles.routePickerMapFrame, { borderColor: t.border }]}>
                <routeMapModule.MapView style={styles.routePickerMap} initialRegion={pickerRegion} onPress={handleAddStopFromMap}>
                  {pickerCoordinates.length > 1 && (
                    <routeMapModule.Polyline coordinates={pickerCoordinates} strokeWidth={4} strokeColor={accent} />
                  )}
                  {pickerCoordinates.map((point, index) => (
                    <routeMapModule.Marker
                      key={`${point.latitude}-${point.longitude}-${index}`}
                      coordinate={point}
                      title={draftRoutePoints[index]?.label ?? `Stop ${index + 1}`}
                      pinColor={index === 0 ? TOKENS[theme].green : index === pickerCoordinates.length - 1 ? TOKENS[theme].red : accent}
                    />
                  ))}
                </routeMapModule.MapView>
              </View>
            ) : (
              <View style={[styles.mapUnavailable, { borderColor: t.border, backgroundColor: t.subtle }]}>
                <MaterialCommunityIcons name="map-search-outline" size={18} color={accent} />
                <Text style={[styles.metaText, { color: t.muted }]}>Install `react-native-maps` to add route stops from map.</Text>
              </View>
            )}

            <View style={styles.routePickerActionRow}>
              <TouchableOpacity
                style={[styles.routePickerActionButton, { borderColor: t.border, backgroundColor: t.subtle }]}
                disabled={draftRoutePoints.length === 0}
                onPress={handleUndoStop}
              >
                <Text style={[styles.smallButtonText, { color: draftRoutePoints.length === 0 ? `${t.muted}66` : t.muted }]}>Undo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.routePickerActionButton, { borderColor: t.border, backgroundColor: t.subtle }]}
                disabled={draftRoutePoints.length === 0}
                onPress={handleClearStops}
              >
                <Text style={[styles.smallButtonText, { color: draftRoutePoints.length === 0 ? `${TOKENS[theme].red}66` : TOKENS[theme].red }]}>
                  Clear
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.flex1} contentContainerStyle={styles.routePointList} showsVerticalScrollIndicator={false}>
              {draftRoutePoints.length === 0 ? (
                <View style={[styles.routePickerEmpty, { borderColor: t.border, backgroundColor: t.subtle }]}>
                  <MaterialCommunityIcons name="map-marker-plus-outline" size={18} color={accent} />
                  <Text style={[styles.metaText, { color: t.muted }]}>No stops yet. Tap map to add the first stop.</Text>
                </View>
              ) : (
                draftRoutePoints.map((point, index) => (
                  <View key={`${point.lat}-${point.lng}-${index}`} style={[styles.routePickerPointRow, { borderColor: t.border, backgroundColor: t.subtle }]}>
                    <Text style={[styles.boldText, { color: t.text }]}>{point.label ?? `Stop ${index + 1}`}</Text>
                    <Text style={[styles.metaText, { color: t.muted }]}>
                      {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
};

const createRideWizardStyles = StyleSheet.create({
  sectionDivider: {
    borderBottomWidth: 1,
    marginVertical: 4
  },
  headerBackButton: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center'
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  progressTrack: {
    height: 4,
    width: '100%'
  },
  progressFill: {
    height: 4
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 16
  },
  summarySection: {
    gap: 10
  },
  summaryLabel: {
    fontSize: 22 / 2,
    fontWeight: '500'
  },
  summaryTagRow: {
    flexDirection: 'row',
    gap: 10
  },
  summaryTag: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  summaryTagText: {
    fontSize: 18 / 2,
    fontWeight: '500'
  },
  summaryTagValue: {
    flex: 1,
    fontSize: 22 / 2,
    fontWeight: '600'
  },
  summaryCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 6
  },
  summaryCardMeta: {
    fontSize: 18 / 2,
    fontWeight: '500'
  },
  summaryCardRoute: {
    fontSize: 38 / 2,
    fontWeight: '700'
  },
  summaryCardDate: {
    fontSize: 18 / 2,
    fontWeight: '500'
  },
  stepSection: {
    gap: 8
  },
  stepMeta: {
    fontSize: 50 / 2,
    fontWeight: '600'
  },
  stepTitle: {
    fontSize: 74 / 2,
    lineHeight: 1.15 * (74 / 2),
    fontWeight: '600'
  },
  stepDescription: {
    fontSize: 20,
    lineHeight: 28
  },
  fieldBlock: {
    gap: 10,
    marginTop: 16
  },
  fieldLabel: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '500'
  },
  lineInput: {
    borderBottomWidth: 2,
    minHeight: 48,
    fontSize: 20
  },
  destinationPickerField: {
    borderBottomWidth: 2,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  destinationPickerValue: {
    flex: 1,
    fontSize: 20
  },
  lineInputLarge: {
    borderBottomWidth: 2,
    minHeight: 58,
    fontSize: 52 / 2,
    fontWeight: '500'
  },
  charCount: {
    alignSelf: 'flex-end',
    fontSize: 20 / 2,
    fontWeight: '500'
  },
  trendingLabel: {
    fontSize: 50 / 2,
    fontWeight: '700'
  },
  trendingChip: {
    borderWidth: 2,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14
  },
  trendingChipText: {
    fontSize: 22 / 2,
    fontWeight: '500'
  },
  dayModeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14
  },
  dayModeButton: {
    minWidth: 100,
    borderWidth: 2,
    borderRadius: 999,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18
  },
  dayModeText: {
    fontSize: 22 / 2,
    fontWeight: '500'
  },
  filledInput: {
    minHeight: 74 / 2,
    borderRadius: 10,
    fontSize: 18 / 2,
    paddingHorizontal: 12
  },
  locationPickerInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  locationPickerInputText: {
    flex: 1,
    fontSize: 18 / 2
  },
  routeMapButton: {
    marginTop: 6,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8
  },
  routeMapButtonText: {
    fontSize: 18 / 2,
    fontWeight: '700'
  },
  timelineGrid: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8
  },
  timeTileInput: {
    flex: 1,
    minHeight: 74 / 2,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 17 / 2
  },
  costRow: {
    flexDirection: 'row',
    gap: 10
  },
  costButton: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 999,
    minHeight: 62 / 2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  costButtonText: {
    fontSize: 21 / 2,
    fontWeight: '500'
  },
  inclusionHeader: {
    fontSize: 45 / 2,
    fontWeight: '500',
    marginTop: 10
  },
  inclusionChip: {
    borderWidth: 2,
    borderRadius: 999,
    minHeight: 46,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6
  },
  inclusionChipText: {
    fontSize: 20 / 2,
    fontWeight: '500'
  },
  rideNoteInput: {
    minHeight: 220,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    textAlignVertical: 'top',
    fontSize: 19 / 2,
    lineHeight: 26
  },
  inviteModeRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    marginTop: 10
  },
  inviteModeButton: {
    minWidth: 170 / 2,
    borderWidth: 2,
    borderRadius: 999,
    minHeight: 62 / 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20
  },
  inviteModeText: {
    fontSize: 23 / 2,
    fontWeight: '500'
  },
  emptyInviteState: {
    marginTop: 20,
    textAlign: 'center',
    fontSize: 47 / 2,
    lineHeight: 1.45 * (47 / 2)
  },
  preferenceCard: {
    marginTop: 26,
    borderTopWidth: 1,
    paddingTop: 16,
    gap: 18
  },
  preferenceRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start'
  },
  preferenceTitle: {
    fontSize: 50 / 2,
    fontWeight: '600',
    marginBottom: 3
  },
  preferenceText: {
    fontSize: 20,
    lineHeight: 30
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10
  },
  destinationHeader: {
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  destinationHeaderBack: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center'
  },
  destinationSearchBox: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14
  },
  destinationSearchInput: {
    flex: 1,
    fontSize: 19,
    paddingVertical: 0
  },
  destinationActionRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1
  },
  destinationActionText: {
    fontSize: 22 / 2,
    fontWeight: '700'
  },
  destinationSection: {
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  destinationSectionTitle: {
    fontSize: 28 / 2,
    fontWeight: '700'
  },
  destinationEmptyText: {
    marginTop: 4,
    fontSize: 26 / 2,
    fontWeight: '600'
  },
  destinationList: {
    marginTop: 10
  },
  destinationListRow: {
    minHeight: 62,
    borderBottomWidth: 1,
    justifyContent: 'center'
  },
  destinationListText: {
    fontSize: 22 / 2,
    fontWeight: '500'
  },
  destinationListSubText: {
    marginTop: 2,
    fontSize: 18 / 2,
    fontWeight: '500'
  },
  nextButton: {
    minHeight: 70 / 2,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 58 / 2,
    fontWeight: '700'
  }
});

export const CreateHelpModal = ({
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
  const insets = useSafeAreaInsets();
  const topInset = getAndroidTopInset(insets);
  const accent = t.primary;
  const inactiveBorder = t.border;
  const inactiveButtonBackground = `${t.muted}66`;
  const totalSteps = 2;
  type HelpStep = 1 | 2;
  const [step, setStep] = useState<HelpStep>(1);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<HelpPost['category']>('Mechanical');
  const [bikeModel, setBikeModel] = useState('');
  const [description, setDescription] = useState('');
  const categoryOptions: HelpPost['category'][] = ['Mechanical', 'Gear', 'Route', 'Other'];

  const resetForm = () => {
    setStep(1);
    setTitle('');
    setCategory('Mechanical');
    setBikeModel('');
    setDescription('');
  };

  useEffect(() => {
    if (!visible) resetForm();
  }, [visible]);

  const isStep1Valid = title.trim().length > 0 && bikeModel.trim().length > 0;
  const isStep2Valid = description.trim().length > 0;
  const canContinue = step === 1 ? isStep1Valid : isStep2Valid;

  const handleGoBack = () => {
    if (step === 1) {
      onClose();
      return;
    }
    setStep(1);
  };

  const submit = () => {
    if (!isStep1Valid || !isStep2Valid) return;

    onSubmit({
      title: title.trim(),
      category,
      bikeModel: bikeModel.trim(),
      description: description.trim()
    });

    resetForm();
  };

  const handleStepContinue = () => {
    if (!canContinue) return;
    if (step === 2) {
      submit();
      return;
    }
    setStep(2);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleGoBack}>
      <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg, paddingTop: topInset }]}>
        <KeyboardAvoidingView style={styles.fullScreen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalHeader, { borderBottomColor: t.border, paddingHorizontal: 16 }]}>
            <View style={styles.rowAligned}>
              <TouchableOpacity onPress={handleGoBack} style={createRideWizardStyles.headerBackButton}>
                <MaterialCommunityIcons name="arrow-left" size={30} color={t.text} />
              </TouchableOpacity>
              <Text style={[createRideWizardStyles.headerTitle, { color: t.text }]}>Post Help</Text>
            </View>
          </View>

          <View style={[createRideWizardStyles.progressTrack, { backgroundColor: t.border }]}>
            <View style={[createRideWizardStyles.progressFill, { backgroundColor: accent, width: `${(step / totalSteps) * 100}%` }]} />
          </View>

          <ScrollView
            contentContainerStyle={createRideWizardStyles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {step >= 2 && (
              <View style={createRideWizardStyles.summarySection}>
                <Text style={[createRideWizardStyles.summaryLabel, { color: t.muted }]}>Help request details</Text>
                <View style={createRideWizardStyles.summaryTagRow}>
                  <View style={[createRideWizardStyles.summaryTag, { backgroundColor: t.surface, borderColor: t.border }]}>
                    <Text style={[createRideWizardStyles.summaryTagText, { color: t.muted }]}>Issue:</Text>
                    <Text style={[createRideWizardStyles.summaryTagValue, { color: accent }]} numberOfLines={1}>
                      {title.trim() || 'Pending'}
                    </Text>
                  </View>
                  <View style={[createRideWizardStyles.summaryTag, { backgroundColor: t.surface, borderColor: t.border }]}>
                    <Text style={[createRideWizardStyles.summaryTagText, { color: t.muted }]}>Bike:</Text>
                    <Text style={[createRideWizardStyles.summaryTagValue, { color: accent }]} numberOfLines={1}>
                      {bikeModel.trim() || 'Pending'}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {step === 1 && (
              <View style={createRideWizardStyles.stepSection}>
                <Text style={[createRideWizardStyles.stepMeta, { color: t.text }]}>Step 1/{totalSteps}: Issue Details</Text>
                <Text style={[createRideWizardStyles.stepTitle, { color: accent }]}>What do you need help with?</Text>
                <Text style={[createRideWizardStyles.stepDescription, { color: t.muted }]}>
                  Describe your problem clearly so that the riding community can pitch in with solutions.
                </Text>

                <View style={createRideWizardStyles.fieldBlock}>
                  <Text style={[createRideWizardStyles.fieldLabel, { color: t.text }]}>Issue Title*</Text>
                  <TextInput
                    style={[createRideWizardStyles.lineInput, { borderBottomColor: t.muted, color: t.text }]}
                    value={title}
                    onChangeText={(value) => setTitle(value.slice(0, 80))}
                    placeholder="Strange clicking while shifting"
                    placeholderTextColor={`${t.muted}99`}
                  />
                  <Text style={[createRideWizardStyles.charCount, { color: t.muted }]}>({80 - title.length})</Text>
                </View>

                <View style={createRideWizardStyles.fieldBlock}>
                  <Text style={[createRideWizardStyles.fieldLabel, { color: t.text }]}>Category</Text>
                  <View style={createRideWizardStyles.costRow}>
                    {categoryOptions.map((option) => {
                      const isActive = category === option;
                      return (
                        <TouchableOpacity
                          key={option}
                          style={[
                            createRideWizardStyles.costButton,
                            {
                              borderColor: isActive ? accent : inactiveBorder,
                              backgroundColor: isActive ? `${accent}1a` : t.subtle
                            }
                          ]}
                          onPress={() => setCategory(option)}
                        >
                          <Text style={[createRideWizardStyles.costButtonText, { color: isActive ? accent : t.text }]}>{option}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={createRideWizardStyles.fieldBlock}>
                  <Text style={[createRideWizardStyles.fieldLabel, { color: t.text }]}>Bike Model*</Text>
                  <TextInput
                    style={[createRideWizardStyles.lineInput, { borderBottomColor: t.muted, color: t.text }]}
                    value={bikeModel}
                    onChangeText={setBikeModel}
                    placeholder="Royal Enfield Himalayan 450"
                    placeholderTextColor={`${t.muted}99`}
                  />
                </View>
              </View>
            )}

            {step === 2 && (
              <View style={createRideWizardStyles.stepSection}>
                <Text style={[createRideWizardStyles.stepMeta, { color: t.text }]}>Step 2/{totalSteps}: Description</Text>
                <Text style={[createRideWizardStyles.stepTitle, { color: accent }]}>Tell us more about it</Text>
                <Text style={[createRideWizardStyles.stepDescription, { color: t.muted }]}>
                  Add as much detail as you can — symptoms, when it started, what you've already tried, etc.
                </Text>

                <View style={createRideWizardStyles.fieldBlock}>
                  <Text style={[createRideWizardStyles.fieldLabel, { color: t.text }]}>Description*</Text>
                  <TextInput
                    style={[createRideWizardStyles.rideNoteInput, { borderColor: t.muted, color: t.text }]}
                    value={description}
                    onChangeText={(value) => setDescription(value.slice(0, 700))}
                    placeholder="Describe the issue, observations, and any troubleshooting already done..."
                    placeholderTextColor={`${t.muted}99`}
                    multiline
                  />
                  <Text style={[createRideWizardStyles.charCount, { color: t.muted }]}>({description.length}/700)</Text>
                </View>

                <TouchableOpacity
                  style={[styles.togglePhotoButton, { borderColor: t.border, backgroundColor: t.subtle, opacity: 0.7 }]}
                  disabled
                  activeOpacity={1}
                >
                  <MaterialCommunityIcons name="camera-off-outline" size={18} color={t.muted} />
                  <Text style={[styles.bodyText, { color: t.muted }]}>Photo upload coming soon</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          <View
            style={[
              createRideWizardStyles.footer,
              {
                borderTopColor: t.border,
                backgroundColor: t.bg,
                paddingBottom: Math.max(insets.bottom, 12)
              }
            ]}
          >
            <TouchableOpacity
              style={[
                createRideWizardStyles.nextButton,
                {
                  backgroundColor: canContinue ? accent : inactiveButtonBackground
                }
              ]}
              onPress={handleStepContinue}
              disabled={!canContinue}
            >
              <Text style={createRideWizardStyles.nextButtonText}>{step === 2 ? 'Post Help' : 'Next'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

export const EditProfileModal = ({
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
  const [garage, setGarage] = useState<string[]>(user.garage || []);
  const [style, setStyle] = useState(user.style);
  const [typicalRideTime, setTypicalRideTime] = useState(user.typicalRideTime);

  useEffect(() => {
    if (!visible) return;
    setName(user.name);
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
    onSave({ name, garage: filteredGarage, style, typicalRideTime });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalBackdrop}>
        <Pressable style={styles.modalScrim} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
          <View style={[styles.bottomSheet, { backgroundColor: t.surface, borderTopColor: t.primary }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.modalTitle, { color: t.text }]}>Edit Profile</Text>
              <TouchableOpacity onPress={onClose}>
                <MaterialCommunityIcons name="close" size={24} color={t.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formSection} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <LabeledInput label="Name" value={name} onChangeText={setName} theme={theme} />

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

export const RideDetailScreen = ({
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
  onReportRide,
  isCreatorBlocked = false,
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
  onReportRide?: (rideId: string) => void;
  isCreatorBlocked?: boolean;
  onHandleViewProfile?: (userId: string) => void;
  theme: Theme;
}) => {
  const t = TOKENS[theme];
  const insets = useSafeAreaInsets();
  const topInset = getAndroidTopInset(insets);

  if (!ride) return null;

  const isCreator = ride.creatorId === currentUser.id;
  const isPending = ride.requests.includes(currentUser.id);
  const isJoined = ride.currentParticipants.includes(currentUser.id);
  const participants = users.filter((u) => ride.currentParticipants.includes(u.id));
  const requestUsers = users.filter((u) => ride.requests.includes(u.id));
  const routePoints = normalizeRoutePoints(ride.routePoints);
  const routeCoordinates = toRouteCoordinates(routePoints);
  const routeRegion = buildRouteRegion(routeCoordinates);

  const handleOpenRouteInMaps = () => {
    const url = buildGoogleDirectionsUrl(routeCoordinates);
    if (!url) return;

    void Linking.openURL(url).catch(() => {
      Alert.alert('Unable to open maps', 'Please try again in a moment.');
    });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg, paddingTop: topInset }]}>
        <View style={[styles.modalHeader, { borderBottomColor: t.border }]}>
          <View style={styles.rowAligned}>
            <TouchableOpacity onPress={onClose} style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}>
              <MaterialCommunityIcons name="arrow-left" size={20} color={t.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: t.text }]} numberOfLines={1}>
              {ride.title}
            </Text>
          </View>
          <View style={styles.rowAligned}>
            {!isCreator && (
              <TouchableOpacity
                style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}
                onPress={() => onReportRide?.(ride.id)}
              >
                <MaterialCommunityIcons name="flag-outline" size={18} color={TOKENS[theme].red} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}
              onPress={() => {
                void Share.share({
                  message: `Join my ride "${ride.title}" on ThrottleUp!\nDate: ${ride.date}\nTime: ${ride.startTime}\nRoute: ${ride.route}`
                });
              }}
            >
              <MaterialCommunityIcons name="share-variant-outline" size={18} color={t.primary} />
            </TouchableOpacity>
          </View>
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

            {routeCoordinates.length > 0 && (
              <View style={[styles.routeMapCard, { borderColor: t.border, backgroundColor: t.subtle }]}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.inputLabel, { color: t.muted, marginBottom: 0 }]}>Route Map</Text>
                  <TouchableOpacity
                    style={[styles.primaryCompactButton, { borderColor: t.border, backgroundColor: t.card }]}
                    onPress={handleOpenRouteInMaps}
                  >
                    <MaterialCommunityIcons name="map-marker-path" size={14} color={t.primary} />
                    <Text style={[styles.primaryCompactButtonText, { color: t.primary }]}>Open in Maps</Text>
                  </TouchableOpacity>
                </View>

                {routeMapModule ? (
                  <View style={[styles.routeMapFrame, { borderColor: t.border }]}>
                    <routeMapModule.MapView style={styles.routeMap} initialRegion={routeRegion}>
                      <routeMapModule.Polyline coordinates={routeCoordinates} strokeWidth={4} strokeColor={t.primary} />
                      {routeCoordinates.map((point, index) => {
                        const isStart = index === 0;
                        const isEnd = index === routeCoordinates.length - 1;
                        const markerColor = isStart ? TOKENS[theme].green : isEnd ? TOKENS[theme].red : t.primary;

                        return (
                          <routeMapModule.Marker
                            key={`${point.latitude}-${point.longitude}-${index}`}
                            coordinate={point}
                            title={routePoints[index]?.label ?? `Waypoint ${index + 1}`}
                            pinColor={markerColor}
                          />
                        );
                      })}
                    </routeMapModule.MapView>
                  </View>
                ) : (
                  <View style={[styles.mapUnavailable, { borderColor: t.border, backgroundColor: t.card }]}>
                    <MaterialCommunityIcons name="map-search-outline" size={18} color={t.primary} />
                    <Text style={[styles.metaText, { color: t.muted }]}>Install `react-native-maps` to render in-app route maps.</Text>
                  </View>
                )}

                <View style={styles.routePointList}>
                  {routePoints.map((point, index) => {
                    const isStart = index === 0;
                    const isEnd = index === routePoints.length - 1;
                    const dotColor = isStart ? TOKENS[theme].green : isEnd ? TOKENS[theme].red : t.primary;

                    return (
                      <View key={`${point.lat}-${point.lng}-${index}`} style={styles.routePointRow}>
                        <View style={[styles.routePointDot, { backgroundColor: dotColor }]} />
                        <View style={styles.flex1}>
                          <Text style={[styles.boldText, { color: t.text }]}>{point.label ?? `Waypoint ${index + 1}`}</Text>
                          <Text style={[styles.metaText, { color: t.muted }]}>
                            {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
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
          ) : isCreatorBlocked ? (
            <View style={[styles.statusStrip, { borderColor: TOKENS[theme].red, backgroundColor: `${TOKENS[theme].red}1f` }]}>
              <MaterialCommunityIcons name="account-cancel-outline" size={18} color={TOKENS[theme].red} />
              <Text style={[styles.statusStripText, { color: TOKENS[theme].red }]}>Creator blocked</Text>
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

export const HelpDetailScreen = ({
  visible,
  post,
  currentUser,
  onClose,
  onResolve,
  onUpvote,
  onReply,
  onReportPost,
  isCreatorBlocked = false,
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
  onReportPost?: (postId: string) => void;
  isCreatorBlocked?: boolean;
  onHandleViewProfile?: (userId: string) => void;
  theme: Theme;
}) => {
  const t = TOKENS[theme];
  const insets = useSafeAreaInsets();
  const topInset = getAndroidTopInset(insets);
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
      <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg, paddingTop: topInset }]}>
        <View style={[styles.modalHeader, { borderBottomColor: t.border }]}>
          <View style={styles.rowAligned}>
            <TouchableOpacity onPress={onClose} style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}>
              <MaterialCommunityIcons name="arrow-left" size={20} color={t.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: t.text }]}>SOS Intel</Text>
          </View>
          <View style={styles.rowAligned}>
            {!isCreator && (
              <TouchableOpacity
                style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}
                onPress={() => onReportPost?.(post.id)}
              >
                <MaterialCommunityIcons name="flag-outline" size={16} color={TOKENS[theme].red} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              disabled={isCreatorBlocked}
              style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle, opacity: isCreatorBlocked ? 0.55 : 1 }]}
              onPress={() => onUpvote(post.id)}
            >
              <MaterialCommunityIcons name="arrow-up-bold" size={16} color={t.primary} />
              <Text style={[styles.metaText, { color: t.text, marginLeft: 4 }]}>{post.upvotes}</Text>
            </TouchableOpacity>
          </View>
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

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
              isCreatorBlocked ? (
                <View style={[styles.statusStrip, { borderColor: TOKENS[theme].red, backgroundColor: `${TOKENS[theme].red}1f` }]}>
                  <MaterialCommunityIcons name="account-cancel-outline" size={18} color={TOKENS[theme].red} />
                  <Text style={[styles.statusStripText, { color: TOKENS[theme].red }]}>Creator blocked</Text>
                </View>
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
              )
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

export const UserProfileModal = ({
  visible,
  user,
  rides,
  friendStatus,
  isBlocked,
  onClose,
  onMessage,
  onAddFriend,
  onReportUser,
  onBlockUser,
  theme
}: {
  visible: boolean;
  user: User | null;
  rides: RidePost[];
  friendStatus: FriendStatus;
  isBlocked: boolean;
  onClose: () => void;
  onMessage: (userId: string) => void;
  onAddFriend: (userId: string) => void;
  onReportUser: (userId: string) => void;
  onBlockUser: (userId: string) => void;
  theme: Theme;
}) => {
  const t = TOKENS[theme];

  if (!user) return null;

  const userRides = rides.filter((ride) => ride.creatorId === user.id || ride.currentParticipants.includes(user.id));
  const canMessage = friendStatus !== 'self' && !isBlocked;
  const canAddFriend = friendStatus === 'none' && !isBlocked;
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
                {friendStatus !== 'self' && (
                  <TouchableOpacity
                    style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}
                    onPress={() => onReportUser(user.id)}
                  >
                    <MaterialCommunityIcons name="flag-outline" size={18} color={TOKENS[theme].red} />
                  </TouchableOpacity>
                )}
                {friendStatus !== 'self' && (
                  <TouchableOpacity
                    style={[styles.iconButton, { borderColor: TOKENS[theme].red, backgroundColor: `${TOKENS[theme].red}1f` }]}
                    disabled={isBlocked}
                    onPress={() => onBlockUser(user.id)}
                  >
                    <MaterialCommunityIcons name="account-cancel-outline" size={18} color={TOKENS[theme].red} />
                  </TouchableOpacity>
                )}
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

            {isBlocked && (
              <View style={[styles.newsScoreChip, { borderColor: TOKENS[theme].red, backgroundColor: `${TOKENS[theme].red}1f` }]}>
                <Text style={[styles.metaText, { color: TOKENS[theme].red }]}>Blocked</Text>
              </View>
            )}

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

export const CreateSquadModal = ({
  visible,
  onClose,
  onSubmit,
  theme
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; description: string; rideStyle: string }) => void;
  theme: Theme;
}) => {
  const t = TOKENS[theme];
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rideStyle, setRideStyle] = useState('Touring');

  const rideStyleOptions = ['Touring', 'City / Urban', 'Adventure / Off-road', 'Night Cruise', 'Sport', 'Cafe Racer'];

  const submit = () => {
    if (!name.trim() || !description.trim()) return;
    onSubmit({ name: name.trim(), description: description.trim(), rideStyle });
    setName('');
    setDescription('');
    setRideStyle('Touring');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalBackdrop}>
        <Pressable style={styles.modalScrim} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
          <View style={[styles.bottomSheet, { backgroundColor: t.surface, borderTopColor: t.primary }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.modalTitle, { color: t.text }]}>Create Squad</Text>
              <TouchableOpacity onPress={onClose}>
                <MaterialCommunityIcons name="close" size={24} color={t.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formSection} showsVerticalScrollIndicator={false}>
              <LabeledInput label="Squad Name" value={name} onChangeText={setName} theme={theme} placeholder="e.g. NCR Touring Pack" />

              <View>
                <Text style={[styles.inputLabel, { color: t.muted }]}>Description</Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline, { backgroundColor: t.subtle, borderColor: t.border, color: t.text }]}
                  multiline
                  textAlignVertical="top"
                  value={description}
                  onChangeText={setDescription}
                  placeholder="What's your squad about?"
                  placeholderTextColor={t.muted}
                />
              </View>

              <View>
                <Text style={[styles.inputLabel, { color: t.muted }]}>Ride Style</Text>
                <View style={styles.wrapRow}>
                  {rideStyleOptions.map((option) => {
                    const isActive = rideStyle === option;
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
                        onPress={() => setRideStyle(option)}
                      >
                        <Text style={[styles.selectorChipText, { color: isActive ? t.primary : t.muted }]}>{option}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: t.primary }]} onPress={submit}>
                <MaterialCommunityIcons name="account-group" size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>Create Squad</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

export const SquadDetailModal = ({
  visible,
  squad,
  currentUser,
  users,
  onClose,
  onJoinSquad,
  onLeaveSquad,
  onViewProfile,
  theme
}: {
  visible: boolean;
  squad: Squad | null;
  currentUser: User;
  users: User[];
  onClose: () => void;
  onJoinSquad: (squadId: string) => void;
  onLeaveSquad: (squadId: string) => void;
  onViewProfile: (userId: string) => void;
  theme: Theme;
}) => {
  const t = TOKENS[theme];
  const insets = useSafeAreaInsets();
  const topInset = getAndroidTopInset(insets);
  if (!squad) return null;

  const allUsers = [currentUser, ...users];
  const isMember = squad.members.includes(currentUser.id);
  const isOwner = squad.creatorId === currentUser.id;
  const creator = allUsers.find((u) => u.id === squad.creatorId);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg, paddingTop: topInset }]}>
        <View style={[styles.modalHeader, { borderBottomColor: t.border }]}>
          <View style={styles.rowAligned}>
            <TouchableOpacity onPress={onClose} style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}>
              <MaterialCommunityIcons name="arrow-left" size={20} color={t.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: t.text }]}>Squad Details</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={[styles.mainScroll, { paddingBottom: 40 }]}>
          <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
            <View style={styles.squadCardHeader}>
              <Image source={{ uri: squad.avatar || avatarFallback }} style={styles.squadAvatar} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: t.text }]}>{squad.name}</Text>
                <View style={[styles.rowAligned, { marginTop: 4 }]}>
                  <View style={styles.rowAligned}>
                    <MaterialCommunityIcons name="map-marker-outline" size={13} color={t.primary} />
                    <Text style={[styles.metaText, { color: t.muted }]}>{squad.city}</Text>
                  </View>
                  <View style={[styles.pillTag, { borderColor: t.border, backgroundColor: t.subtle }]}>
                    <Text style={[styles.pillTagText, { color: t.muted }]}>{squad.rideStyle}</Text>
                  </View>
                </View>
              </View>
            </View>

            <Text style={[styles.bodyText, { color: t.text }]}>{squad.description}</Text>

            <View style={styles.profileStatsRow}>
              <View style={[styles.profileStatCard, { borderColor: t.border, backgroundColor: t.subtle }]}>
                <Text style={[styles.profileStatValue, { color: t.primary }]}>{squad.members.length}</Text>
                <Text style={[styles.profileStatLabel, { color: t.muted }]}>Members</Text>
              </View>
              <View style={[styles.profileStatCard, { borderColor: t.border, backgroundColor: t.subtle }]}>
                <Text style={[styles.profileStatValue, { color: t.primary }]}>{creator?.name?.split(' ')[0] ?? '\u2014'}</Text>
                <Text style={[styles.profileStatLabel, { color: t.muted }]}>Founded by</Text>
              </View>
            </View>

            {!isMember ? (
              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: t.primary }]} onPress={() => onJoinSquad(squad.id)}>
                <MaterialCommunityIcons name="plus" size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>Join Squad</Text>
              </TouchableOpacity>
            ) : isOwner ? (
              <View style={[styles.statusStrip, { borderColor: `${t.primary}66`, backgroundColor: `${t.primary}15` }]}>
                <MaterialCommunityIcons name="crown" size={16} color={t.primary} />
                <Text style={[styles.statusStripText, { color: t.primary }]}>You own this squad</Text>
              </View>
            ) : (
              <TouchableOpacity style={[styles.dangerButton, { borderColor: TOKENS[theme].red }]} onPress={() => onLeaveSquad(squad.id)}>
                <MaterialCommunityIcons name="logout" size={18} color={TOKENS[theme].red} />
                <Text style={[styles.dangerButtonText, { color: TOKENS[theme].red }]}>Leave Squad</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
            <Text style={[styles.cardHeader, { color: t.muted }]}>MEMBERS ({squad.members.length})</Text>
            {squad.members.map((memberId) => {
              const member = allUsers.find((u) => u.id === memberId);
              if (!member) return null;
              return (
                <TouchableOpacity
                  key={memberId}
                  style={[styles.friendRow, { borderColor: t.border }]}
                  onPress={() => onViewProfile(memberId)}
                >
                  <View style={styles.rowAligned}>
                    <Image source={{ uri: member.avatar || avatarFallback }} style={styles.avatarMedium} />
                    <View>
                      <View style={styles.rowAligned}>
                        <Text style={[styles.boldText, { color: t.text }]}>{member.name}</Text>
                        {memberId === squad.creatorId && (
                          <MaterialCommunityIcons name="crown" size={13} color={t.primary} />
                        )}
                      </View>
                      <Text style={[styles.metaText, { color: t.muted }]}>{member.garage?.[0] ?? 'Unknown machine'}</Text>
                    </View>
                  </View>
                  <Badge color={memberId === squad.creatorId ? 'orange' : 'slate'} theme={theme}>
                    {memberId === squad.creatorId ? 'Owner' : 'Member'}
                  </Badge>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

export const NewsArticleModal = ({
  visible,
  url,
  onClose,
  theme
}: {
  visible: boolean;
  url: string | null;
  onClose: () => void;
  theme: Theme;
}) => {
  const t = TOKENS[theme];
  const insets = useSafeAreaInsets();
  const WebViewComponent = newsWebViewModule?.WebView ?? null;
  const [reloadToken, setReloadToken] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setIsLoading(true);
    setHasError(false);
  }, [visible, url, reloadToken]);

  if (!url) return null;

  const sourceLabel = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return 'Article';
    }
  })();

  const retryLoad = () => {
    setHasError(false);
    setReloadToken((prev) => prev + 1);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View
        style={[
          styles.fullScreen,
          {
            backgroundColor: t.bg,
            paddingTop: Math.max(insets.top, 8),
            paddingBottom: Math.max(insets.bottom, 8)
          }
        ]}
      >
        <View style={[styles.modalHeader, { borderBottomColor: t.border }]}>
          <View style={styles.rowAligned}>
            <TouchableOpacity onPress={onClose} style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}>
              <MaterialCommunityIcons name="arrow-left" size={20} color={t.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: t.text }]} numberOfLines={1}>
              {sourceLabel}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}
            onPress={retryLoad}
          >
            <MaterialCommunityIcons name="refresh" size={18} color={t.primary} />
          </TouchableOpacity>
        </View>

        {!WebViewComponent ? (
          <View style={styles.newsReaderErrorWrap}>
            <MaterialCommunityIcons name="application-braces-outline" size={28} color={TOKENS[theme].red} />
            <Text style={[styles.newsReaderErrorTitle, { color: t.text }]}>Reader needs rebuild</Text>
            <Text style={[styles.newsReaderErrorText, { color: t.muted }]}>
              This app build does not include WebView yet. Rebuild once to open articles inside the app.
            </Text>
          </View>
        ) : hasError ? (
          <View style={styles.newsReaderErrorWrap}>
            <MaterialCommunityIcons name="alert-circle-outline" size={28} color={TOKENS[theme].red} />
            <Text style={[styles.newsReaderErrorTitle, { color: t.text }]}>Unable to load article</Text>
            <Text style={[styles.newsReaderErrorText, { color: t.muted }]}>
              Check connectivity and try again. The article will open inside the app.
            </Text>
            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: t.primary }]} onPress={retryLoad}>
              <MaterialCommunityIcons name="refresh" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.fullScreen}>
            <WebViewComponent
              key={`${url}-${reloadToken}`}
              source={{ uri: url }}
              style={styles.newsReaderWebView}
              onLoadStart={() => {
                setIsLoading(true);
                setHasError(false);
              }}
              onLoadEnd={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                setHasError(true);
              }}
              javaScriptEnabled
              domStorageEnabled
            />
            {isLoading ? (
              <View style={[styles.newsReaderLoadingOverlay, { backgroundColor: `${t.bg}cc` }]}>
                <ActivityIndicator size="small" color={t.primary} />
              </View>
            ) : null}
          </View>
        )}
      </View>
    </Modal>
  );
};
