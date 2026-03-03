import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
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
  const [visibility, setVisibility] = useState<RideVisibility[]>(['City']);
  const [routePoints, setRoutePoints] = useState<MapPoint[]>([]);
  const [draftRoutePoints, setDraftRoutePoints] = useState<MapPoint[]>([]);
  const [isStopPickerOpen, setIsStopPickerOpen] = useState(false);
  const [isRouteAutofilled, setIsRouteAutofilled] = useState(false);
  const visibilityOptions: RideVisibility[] = ['City', 'Nearby', 'Friends'];

  const submit = () => {
    const hasRouteText = route.trim().length > 0;
    if (!title || !date || !startTime || (!hasRouteText && routePoints.length === 0)) return;

    const max = Math.max(2, Math.min(20, Number(maxParticipants) || 5));
    const normalizedVisibility: RideVisibility[] = visibility.length > 0 ? visibility : ['City'];
    const finalRoute = hasRouteText ? route.trim() : buildRouteTextFromPoints(routePoints);

    onSubmit({
      title,
      type,
      route: finalRoute,
      date,
      startTime,
      maxParticipants: max,
      visibility: normalizedVisibility,
      routePoints
    });

    setTitle('');
    setType('Sunday Morning');
    setRoute('');
    setDate('');
    setStartTime('');
    setMaxParticipants('5');
    setVisibility(['City']);
    setRoutePoints([]);
    setDraftRoutePoints([]);
    setIsStopPickerOpen(false);
    setIsRouteAutofilled(false);
  };

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
    if (!route.trim() || isRouteAutofilled) {
      setRoute(buildRouteTextFromPoints(normalizedPoints));
      setIsRouteAutofilled(true);
    }
    setIsStopPickerOpen(false);
  };

  const toggleVisibility = (option: RideVisibility) => {
    setVisibility((prev) => {
      if (prev.includes(option)) {
        if (prev.length === 1) return prev;
        return prev.filter((item) => item !== option);
      }
      return [...prev, option];
    });
  };

  const pickerCoordinates = toRouteCoordinates(draftRoutePoints);
  const pickerRegion = buildRouteRegion(pickerCoordinates);

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <SafeAreaView style={styles.modalBackdrop}>
          <Pressable style={styles.modalScrim} onPress={onClose} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
            <View style={[styles.bottomSheet, { backgroundColor: t.surface, borderTopColor: t.primary }]}>
              <View style={styles.rowBetween}>
                <Text style={[styles.modalTitle, { color: t.text }]}>Create Ride</Text>
                <TouchableOpacity onPress={onClose}>
                  <MaterialCommunityIcons name="close" size={24} color={t.muted} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.formSection} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <LabeledInput label="Ride Title" value={title} onChangeText={setTitle} theme={theme} placeholder="Highway sunrise run" />

                <SelectorRow
                  label="Ride Type"
                  options={['Sunday Morning', 'Coffee Ride', 'Night Ride', 'Long Tour', 'Track Day']}
                  selected={type}
                  onSelect={(value) => setType(value as RideType)}
                  theme={theme}
                />

                <View>
                  <Text style={[styles.inputLabel, { color: t.muted }]}>Visibility</Text>
                  <View style={styles.wrapRow}>
                    {visibilityOptions.map((option) => {
                      const isActive = visibility.includes(option);
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
                          onPress={() => toggleVisibility(option)}
                        >
                          <Text style={[styles.selectorChipText, { color: isActive ? t.primary : t.muted }]}>{option}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={[styles.metaText, { color: t.muted }]}>Select one or more audiences.</Text>
                </View>

                <LabeledInput
                  label="Route"
                  value={route}
                  onChangeText={(value) => {
                    setRoute(value);
                    setIsRouteAutofilled(false);
                  }}
                  theme={theme}
                  placeholder="Noida -> Jewar -> Mathura"
                />

                <View style={[styles.routeMapCard, { borderColor: t.border, backgroundColor: t.subtle }]}>
                  <View style={styles.rowBetween}>
                    <Text style={[styles.inputLabel, { color: t.muted, marginBottom: 0 }]}>Map Stops</Text>
                    <View style={[styles.newsScoreChip, { borderColor: t.border, backgroundColor: t.card }]}>
                      <Text style={[styles.metaText, { color: t.muted }]}>{routePoints.length} stops</Text>
                    </View>
                  </View>

                  <TouchableOpacity style={[styles.ghostButton, { borderColor: t.border, backgroundColor: t.card }]} onPress={handleOpenStopPicker}>
                    <MaterialCommunityIcons name="map-marker-path" size={18} color={t.primary} />
                    <Text style={[styles.ghostButtonText, { color: t.primary }]}>
                      {routePoints.length > 0 ? 'Edit Stops on Map' : 'Add Stops on Map'}
                    </Text>
                  </TouchableOpacity>

                  {routePoints.length > 0 && (
                    <View style={styles.routePointList}>
                      {routePoints.map((point, index) => (
                        <View key={`${point.lat}-${point.lng}-${index}`} style={styles.routePointRow}>
                          <View style={[styles.routePointDot, { backgroundColor: index === 0 ? TOKENS[theme].green : t.primary }]} />
                          <View style={styles.flex1}>
                            <Text style={[styles.boldText, { color: t.text }]}>{point.label ?? `Stop ${index + 1}`}</Text>
                            <Text style={[styles.metaText, { color: t.muted }]}>
                              {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

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

      <Modal visible={isStopPickerOpen} animationType="slide" onRequestClose={() => setIsStopPickerOpen(false)}>
        <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg }]}>
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
              style={[styles.primaryCompactButton, { borderColor: t.primary, backgroundColor: t.primary }]}
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
                    <routeMapModule.Polyline coordinates={pickerCoordinates} strokeWidth={4} strokeColor={t.primary} />
                  )}
                  {pickerCoordinates.map((point, index) => (
                    <routeMapModule.Marker
                      key={`${point.latitude}-${point.longitude}-${index}`}
                      coordinate={point}
                      title={draftRoutePoints[index]?.label ?? `Stop ${index + 1}`}
                      pinColor={index === 0 ? TOKENS[theme].green : index === pickerCoordinates.length - 1 ? TOKENS[theme].red : t.primary}
                    />
                  ))}
                </routeMapModule.MapView>
              </View>
            ) : (
              <View style={[styles.mapUnavailable, { borderColor: t.border, backgroundColor: t.subtle }]}>
                <MaterialCommunityIcons name="map-search-outline" size={18} color={t.primary} />
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
                  <MaterialCommunityIcons name="map-marker-plus-outline" size={18} color={t.primary} />
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
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<HelpPost['category']>('Mechanical');
  const [bikeModel, setBikeModel] = useState('');
  const [description, setDescription] = useState('');

  const submit = () => {
    if (!title || !description || !bikeModel) return;

    onSubmit({
      title,
      category,
      bikeModel,
      description
    });

    setTitle('');
    setCategory('Mechanical');
    setBikeModel('');
    setDescription('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalBackdrop}>
        <Pressable style={styles.modalScrim} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
          <View style={[styles.bottomSheet, { backgroundColor: t.surface, borderTopColor: TOKENS[theme].blue }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.modalTitle, { color: t.text }]}>Create Help Request</Text>
              <TouchableOpacity onPress={onClose}>
                <MaterialCommunityIcons name="close" size={24} color={t.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formSection} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
                style={[styles.togglePhotoButton, { borderColor: t.border, backgroundColor: t.subtle, opacity: 0.7 }]}
                disabled
                activeOpacity={1}
              >
                <MaterialCommunityIcons name="camera-off-outline" size={18} color={t.muted} />
                <Text style={[styles.bodyText, { color: t.muted }]}>Photo upload coming soon</Text>
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
  if (!squad) return null;

  const allUsers = [currentUser, ...users];
  const isMember = squad.members.includes(currentUser.id);
  const isOwner = squad.creatorId === currentUser.id;
  const creator = allUsers.find((u) => u.id === squad.creatorId);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg }]}>
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
