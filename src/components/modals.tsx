import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  LayoutChangeEvent,
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
import { SafeAreaView as SafeAreaContextView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { styles } from '../app/styles';
import {
  FriendStatus,
  LocationMode,
  PermissionStatus,
  Theme,
  TOKENS,
  avatarFallback,
  colorForBadge,
  formatClock,
  formatDay,
  formatInrAmount,
  formatRideDistance,
  formatRideEta,
  getRideLifecycleStatus
} from '../app/ui';
import { buildRideJoinAndroidIntentUrl, buildRideJoinDeepLink, PLAY_STORE_URL } from '../app/deep-links';
import { Badge, LabeledInput, SelectorRow, RideCard } from './common';
import {
  ChatMessage,
  Conversation,
  HelpPost,
  MapPoint,
  Notification,
  RideJoinPermission,
  RidePost,
  RideTrackingSession,
  RideType,
  RideVisibility,
  Group,
  GroupJoinPermission,
  GroupRideCreatePermission,
  GroupRole,
  User
} from '../types';

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

type RouteMapPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type RouteMapViewRef = {
  fitToCoordinates?: (
    coordinates: RouteCoordinate[],
    options?: {
      edgePadding?: RouteMapPadding;
      animated?: boolean;
    }
  ) => void;
  pointForCoordinate?: (coordinate: RouteCoordinate) => Promise<{ x: number; y: number }>;
};

type RouteMapViewProps = {
  style?: unknown;
  initialRegion: RouteMapRegion;
  zoomEnabled?: boolean;
  rotateEnabled?: boolean;
  pitchEnabled?: boolean;
  toolbarEnabled?: boolean;
  mapPadding?: RouteMapPadding;
  scrollEnabled?: boolean;
  onPress?: (event: RoutePressEvent) => void;
  onLongPress?: (event: RoutePressEvent) => void;
  onMapReady?: () => void;
  children?: React.ReactNode;
};

type RouteMapModule = {
  MapView: React.ComponentType<RouteMapViewProps & { ref?: React.Ref<RouteMapViewRef | null> }>;
  Marker: React.ComponentType<{
    coordinate: RouteCoordinate;
    title?: string;
    description?: string;
    pinColor?: string;
    anchor?: { x: number; y: number };
    tracksViewChanges?: boolean;
    onPress?: () => void;
    children?: React.ReactNode;
  }>;
  Polyline: React.ComponentType<{
    coordinates: RouteCoordinate[];
    strokeWidth?: number;
    strokeColor?: string;
  }>;
};

type GooglePlacesAutocompletePrediction = {
  description?: string;
  place_id?: string;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
};

type GooglePlacesAutocompleteResponse = {
  status?: string;
  predictions?: GooglePlacesAutocompletePrediction[];
  error_message?: string;
};

type GooglePlaceDetailsResponse = {
  status?: string;
  result?: {
    formatted_address?: string;
    name?: string;
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
    photos?: Array<{
      photo_reference?: string;
    }>;
  };
  error_message?: string;
};

type GoogleFindPlaceResponse = {
  status?: string;
  candidates?: Array<{
    formatted_address?: string;
    name?: string;
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
    photos?: Array<{
      photo_reference?: string;
    }>;
  }>;
  error_message?: string;
};

type GooglePlaceSuggestion = {
  placeId: string;
  description: string;
  primaryText: string;
  secondaryText?: string;
};

type GoogleDirectionsRoute = {
  summary?: string;
  warnings?: string[];
  overview_polyline?: {
    points?: string;
  };
  legs?: Array<{
    distance?: { value?: number };
    duration?: { value?: number };
    duration_in_traffic?: { value?: number };
    steps?: Array<{
      html_instructions?: string;
      polyline?: {
        points?: string;
      };
    }>;
  }>;
};

type GoogleDirectionsResponse = {
  status?: string;
  routes?: GoogleDirectionsRoute[];
  error_message?: string;
};

type GoogleGeocodeResponse = {
  status?: string;
  results?: Array<{
    formatted_address?: string;
  }>;
  error_message?: string;
};

type OpenStreetMapGeocodeResponse = Array<{
  lat?: string;
  lon?: string;
  display_name?: string;
  name?: string;
}>;

type OpenStreetMapReverseGeocodeResponse = {
  display_name?: string;
  name?: string;
};

type OsrmRouteResponse = {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: string;
  }>;
};

type OsrmRouteData = {
  distanceKm: number;
  etaMinutes: number;
  coordinates: RouteCoordinate[];
};

type RouteEstimate = {
  distanceKm: number;
  etaMinutes: number;
  tollEstimateInr: number;
  source: 'google' | 'fallback';
};

type LiveParticipantStatus = {
  label: string;
  badgeColor: 'orange' | 'blue' | 'green' | 'slate';
  markerColor: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
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

const parseCoordinateNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const normalizeRoutePoints = (points: MapPoint[] | undefined): MapPoint[] =>
  (points ?? [])
    .map((point): MapPoint | null => {
      const raw = point as MapPoint & {
        latitude?: unknown;
        longitude?: unknown;
        _latitude?: unknown;
        _longitude?: unknown;
        _lat?: unknown;
        _long?: unknown;
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

      const normalizedLabel = typeof raw.label === 'string' ? raw.label.trim() : '';
      return {
        lat,
        lng,
        ...(normalizedLabel.length > 0 ? { label: normalizedLabel } : {})
      };
    })
    .filter((point): point is MapPoint => point !== null);

const isRideStartLabel = (label?: string): boolean => (label ?? '').trim().toLowerCase() === 'ride starts';

const isRideEndLabel = (label?: string): boolean => (label ?? '').trim().toLowerCase() === 'ride ends';

const splitRoutePointRoles = (
  points: MapPoint[] | undefined
): {
  startPoint: MapPoint | null;
  endPoint: MapPoint | null;
  stopPoints: MapPoint[];
} => {
  const normalizedPoints = normalizeRoutePoints(points).map((point) => ({ ...point }));
  if (normalizedPoints.length === 0) {
    return {
      startPoint: null,
      endPoint: null,
      stopPoints: []
    };
  }

  let startPoint: MapPoint | null = null;
  let endPoint: MapPoint | null = null;
  let stopPoints = normalizedPoints;

  if (stopPoints.length > 0 && isRideStartLabel(stopPoints[0]?.label)) {
    startPoint = { ...stopPoints[0], label: 'Ride starts' };
    stopPoints = stopPoints.slice(1);
  }

  if (stopPoints.length > 0 && isRideEndLabel(stopPoints[stopPoints.length - 1]?.label)) {
    endPoint = { ...stopPoints[stopPoints.length - 1], label: 'Ride ends' };
    stopPoints = stopPoints.slice(0, -1);
  }

  return {
    startPoint,
    endPoint,
    stopPoints
  };
};

const areRoutePointsAtSameCoordinate = (left: MapPoint, right: MapPoint): boolean =>
  Math.abs(left.lat - right.lat) < 0.000001 && Math.abs(left.lng - right.lng) < 0.000001;

const dedupeRoutePointsByCoordinate = (points: MapPoint[]): MapPoint[] => {
  const uniquePoints: MapPoint[] = [];

  points.forEach((point) => {
    const hasMatch = uniquePoints.some((existing) => areRoutePointsAtSameCoordinate(existing, point));
    if (!hasMatch) {
      uniquePoints.push(point);
    }
  });

  return uniquePoints;
};

const toRouteCoordinates = (points: MapPoint[]): RouteCoordinate[] =>
  points.map((point) => ({ latitude: point.lat, longitude: point.lng, label: point.label }));

const ROUTE_MAP_PADDING: RouteMapPadding = { top: 30, right: 12, bottom: 14, left: 12 };
const ROUTE_MAP_EDGE_PADDING: RouteMapPadding = { top: 44, right: 14, bottom: 18, left: 14 };
const COORDINATE_LABEL_PATTERN = /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/;

const toShortRouteMarkerLabel = (value: string | undefined, fallback: string): string => {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';
  if (!normalized) return fallback;
  if (COORDINATE_LABEL_PATTERN.test(normalized)) return fallback;

  const cleaned = normalized
    .replace(/^(ride\s*starts?|ride\s*ends?|destination)\s*[:-]\s*/i, '')
    .trim();
  const firstChunk = cleaned
    .split(',')
    .map((chunk) => chunk.trim())
    .filter(Boolean)[0];
  const candidate = (firstChunk || cleaned).replace(/\s+/g, ' ').trim();
  if (!candidate) return fallback;
  if (candidate.length <= 18) return candidate;
  return `${candidate.slice(0, 17).trimEnd()}...`;
};

const getRouteMarkerBubbleMetrics = (label: string): { width: number; fontSize: number } => {
  const normalizedLength = Math.max(4, label.trim().length);
  const cappedLength = Math.min(20, normalizedLength);
  const width = Math.max(92, Math.min(176, Math.round(cappedLength * 8.4 + 24)));
  const fontSize = normalizedLength > 14 ? 9 : 10;

  return {
    width,
    fontSize
  };
};

const isAndroidMarkerTextOverlayEnabled = Platform.OS === 'android';

const buildRouteRegion = (
  coordinates: RouteCoordinate[],
  options?: {
    paddingScale?: number;
    paddingDelta?: number;
    minDelta?: number;
  }
): RouteMapRegion => {
  const paddingScale = Number.isFinite(options?.paddingScale ?? NaN) ? Math.max(1, Number(options?.paddingScale)) : 1;
  const paddingDelta = Number.isFinite(options?.paddingDelta ?? NaN) ? Math.max(0, Number(options?.paddingDelta)) : 0.08;
  const minDelta = Number.isFinite(options?.minDelta ?? NaN) ? Math.max(0.005, Number(options?.minDelta)) : 0.02;

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
    latitudeDelta: Math.max((maxLat - minLat) * paddingScale + paddingDelta, minDelta),
    longitudeDelta: Math.max((maxLng - minLng) * paddingScale + paddingDelta, minDelta)
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

const buildGoogleDirectionsUrlFromRoute = ({
  startLabel,
  endLabel,
  startPoint,
  endPoint,
  intermediatePoints
}: {
  startLabel: string;
  endLabel: string;
  startPoint: MapPoint | null;
  endPoint: MapPoint | null;
  intermediatePoints: MapPoint[];
}): string | null => {
  const origin = toDirectionsLocationToken(startLabel, startPoint);
  const destination = toDirectionsLocationToken(endLabel, endPoint);
  if (!origin || !destination) return null;

  const waypointTokens = intermediatePoints
    .map((point, index) => toDirectionsLocationToken(point.label ?? `Stop ${index + 1}`, point))
    .filter((value): value is string => Boolean(value));

  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving'
  });

  if (waypointTokens.length > 0) {
    params.set('waypoints', waypointTokens.join('|'));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
};

const buildRouteTextFromPoints = (points: MapPoint[]): string =>
  points.map((point, index) => point.label ?? `Stop ${index + 1}`).join(' -> ');

const promptOpenRouteInGoogleMaps = (url: string | null): void => {
  if (!url) return;

  Alert.alert('Open route in Google Maps?', 'Do you want to continue with this route in Google Maps?', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Open',
      onPress: () => {
        void Linking.openURL(url).catch(() => {
          Alert.alert('Unable to open maps', 'Please try again in a moment.');
        });
      }
    }
  ]);
};

const getAndroidTopInset = (insets: { top: number }): number => (Platform.OS === 'android' ? Math.max(insets.top, 8) : 0);

const pickImageFromLibrary = async (): Promise<string | null> => {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (permission.status !== 'granted') {
    Alert.alert('Permission required', 'Allow photo library access to upload an image.');
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.8
  });

  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return result.assets[0].uri;
};

const formatInrCurrency = (amount: number): string => `₹${Math.max(0, Math.round(amount)).toLocaleString('en-IN')}`;

const sanitizeCurrencyInput = (value: string): string => value.replace(/[^\d]/g, '').slice(0, 6);

const isValidUpiId = (value: string): boolean => /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(value);

const resolveUpiDestination = (value: string): string | null => {
  const normalized = value.trim();
  if (!normalized) return null;
  if (/^upi:\/\/pay/i.test(normalized) || /^https?:\/\//i.test(normalized)) return normalized;
  if (isValidUpiId(normalized)) {
    return `upi://pay?pa=${encodeURIComponent(normalized)}`;
  }
  return null;
};

const buildUpiCheckoutUrl = (baseLink: string, amount: number, note: string): string => {
  if (!/^upi:\/\/pay/i.test(baseLink)) return baseLink;

  const params: string[] = [];
  if (!/(?:\?|&)am=/.test(baseLink) && Number.isFinite(amount) && amount > 0) {
    params.push(`am=${encodeURIComponent(amount.toFixed(2))}`);
  }
  if (!/(?:\?|&)cu=/.test(baseLink)) {
    params.push('cu=INR');
  }
  if (!/(?:\?|&)tn=/.test(baseLink) && note.trim().length > 0) {
    params.push(`tn=${encodeURIComponent(note.trim().slice(0, 80))}`);
  }
  if (params.length === 0) return baseLink;

  const separator = baseLink.includes('?') ? '&' : '?';
  return `${baseLink}${separator}${params.join('&')}`;
};

const getLiveParticipantStatus = ({
  checkedIn,
  hasLocation,
  theme
}: {
  checkedIn: boolean;
  hasLocation: boolean;
  theme: Theme;
}): LiveParticipantStatus => {
  const t = TOKENS[theme];

  if (checkedIn && hasLocation) {
    return {
      label: 'Checked in + GPS',
      badgeColor: 'green',
      markerColor: t.green,
      icon: 'shield-check-outline'
    };
  }

  if (checkedIn) {
    return {
      label: 'Checked in',
      badgeColor: 'blue',
      markerColor: t.blue,
      icon: 'shield-check-outline'
    };
  }

  if (hasLocation) {
    return {
      label: 'GPS only',
      badgeColor: 'orange',
      markerColor: t.primary,
      icon: 'crosshairs-gps'
    };
  }

  return {
    label: 'Awaiting check-in',
    badgeColor: 'slate',
    markerColor: t.red,
    icon: 'clock-outline'
  };
};

type RideCostOption = 'Paid' | 'Split' | 'Free';
type InviteAudience = 'groups' | 'riders';
type RideInclusion = 'Dinner' | 'Drinks' | 'Breakfast' | 'Lunch';
type RideStep = 1 | 2 | 3 | 4 | 5;
type StopPickerContext = `stop:${number}`;
type InsertStopPickerContext = `insertStop:${number}`;
type LocationPickerContext = 'primaryDestination' | 'rideStarts' | 'rideEnds' | StopPickerContext | InsertStopPickerContext;
type TimePickerField = 'assembly' | 'flagOff';
type DatePickerField = 'startDate' | 'returnDate';

const isStopPickerContext = (context: LocationPickerContext): context is StopPickerContext | InsertStopPickerContext =>
  context.startsWith('stop:') || context.startsWith('insertStop:');

const getStopIndexFromContext = (context: LocationPickerContext): number | null => {
  if (!isStopPickerContext(context)) return null;
  const parsed = Number(context.startsWith('stop:') ? context.slice(5) : context.slice(11));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

const normalizeRouteStopLabels = (points: MapPoint[]): MapPoint[] => {
  let stopOrdinal = 0;
  return points.map((point) => {
    stopOrdinal += 1;
    const trimmedLabel = point.label?.trim() ?? '';
    const hasCustomLabel = trimmedLabel.length > 0 && !/^stop\s+\d+$/i.test(trimmedLabel);

    return {
      ...point,
      label: hasCustomLabel ? trimmedLabel : `Stop ${stopOrdinal}`
    };
  });
};

const mergeIntermediateRoutePoints = ({
  routePoints,
  destinationIndex,
  destinationPoint,
  destinationLabel
}: {
  routePoints: MapPoint[];
  destinationIndex: number;
  destinationPoint: MapPoint | null;
  destinationLabel: string;
}): MapPoint[] => {
  const boundedDestinationIndex = Math.max(0, Math.min(routePoints.length, destinationIndex));
  const outboundStops = routePoints.slice(0, boundedDestinationIndex);
  const returnStops = routePoints.slice(boundedDestinationIndex);
  const destinationWaypoint =
    destinationPoint !== null
      ? [
        {
          ...destinationPoint,
          label: destinationLabel.trim() || destinationPoint.label?.trim() || 'Destination'
        }
      ]
      : [];

  return dedupeRoutePointsByCoordinate([...outboundStops, ...destinationWaypoint, ...returnStops]);
};

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
const RIDE_INCLUSION_OPTIONS: RideInclusion[] = ['Dinner', 'Drinks', 'Breakfast', 'Lunch'];

const DATE_PICKER_WINDOW_DAYS = 180;
const TIME_PICKER_INTERVAL_MINUTES = 15;
const PLACE_AUTOCOMPLETE_MIN_QUERY_LENGTH = 2;
const PLACE_AUTOCOMPLETE_DEBOUNCE_MS = 250;
const GOOGLE_PLACES_KEY =
  (process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '').trim();

const formatRideDateLabel = (value: Date): string => {
  const formatted = value.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
  return formatted.replace(',', ' |');
};

const formatRideTimeLabel = (value: Date): string =>
  value.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

const toStartOfDayEpoch = (value: Date): number => {
  const normalized = new Date(value);
  normalized.setHours(0, 0, 0, 0);
  return normalized.getTime();
};

const buildRideDateSummary = (ride: Pick<RidePost, 'date' | 'dayPlan' | 'startDate' | 'returnDate'>): string => {
  const legacyDate = ride.date.trim();
  const startDate = ride.startDate?.trim() || legacyDate;

  if (ride.dayPlan === 'multi') {
    const returnDate = ride.returnDate?.trim();
    if (startDate && returnDate) return `${startDate} -> ${returnDate}`;
    return startDate || returnDate || legacyDate;
  }

  return startDate || legacyDate;
};

const stripHtmlTags = (value: string): string => value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const containsTollKeyword = (value: string): boolean => /\btolls?\b/i.test(value);

const clampPositiveNumber = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);

const toRadians = (value: number): number => (value * Math.PI) / 180;

const calculateDistanceBetweenPointsKm = (from: MapPoint, to: MapPoint): number => {
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

const calculatePolylineDistanceKm = (points: MapPoint[]): number => {
  if (points.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += calculateDistanceBetweenPointsKm(points[index - 1], points[index]);
  }
  return total;
};

const estimateTollFromDistance = (distanceKm: number, likelyHasTolls: boolean): number => {
  const safeDistanceKm = clampPositiveNumber(distanceKm);
  if (safeDistanceKm < 30) return 0;

  const baseCharge = likelyHasTolls ? 40 : 0;
  const perKmCharge = likelyHasTolls ? 1.55 : safeDistanceKm >= 90 ? 0.6 : 0;
  const rawEstimate = baseCharge + safeDistanceKm * perKmCharge;
  return Math.max(0, Math.round(rawEstimate / 10) * 10);
};

const parseCoordinateLabelPoint = (value: string): MapPoint | null => {
  const match = value
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return {
    lat,
    lng,
    label: value.trim()
  };
};

const toDirectionsLocationToken = (label: string, point: MapPoint | null): string | null => {
  if (point && isFiniteNumber(point.lat) && isFiniteNumber(point.lng)) {
    return `${point.lat},${point.lng}`;
  }
  const normalizedLabel = label.trim();
  return normalizedLabel.length > 0 ? normalizedLabel : null;
};

const decodeGooglePolyline = (encodedPath: string): RouteCoordinate[] => {
  const normalizedPath = encodedPath.trim();
  if (!normalizedPath) return [];

  const points: RouteCoordinate[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < normalizedPath.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;

    do {
      if (index >= normalizedPath.length) return points;
      byte = normalizedPath.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    result = 0;
    shift = 0;
    do {
      if (index >= normalizedPath.length) return points;
      byte = normalizedPath.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    points.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5
    });
  }

  return points;
};

const dedupeRouteCoordinates = (coordinates: RouteCoordinate[]): RouteCoordinate[] =>
  coordinates.filter((point, index, arr) => {
    if (index === 0) return true;
    const previous = arr[index - 1];
    return Math.abs(previous.latitude - point.latitude) > 0.000001 || Math.abs(previous.longitude - point.longitude) > 0.000001;
  });

const extractGoogleRoutePathCoordinates = (route: GoogleDirectionsRoute): RouteCoordinate[] => {
  const overviewPolyline = route.overview_polyline?.points;
  if (typeof overviewPolyline === 'string' && overviewPolyline.trim().length > 0) {
    const overviewCoordinates = dedupeRouteCoordinates(decodeGooglePolyline(overviewPolyline));
    if (overviewCoordinates.length > 1) return overviewCoordinates;
  }

  const stepCoordinates = (route.legs ?? [])
    .flatMap((leg) => leg.steps ?? [])
    .flatMap((step) => decodeGooglePolyline(step.polyline?.points ?? ''));
  return dedupeRouteCoordinates(stepCoordinates);
};

const fetchOpenStreetMapGeocodePoint = async (label: string): Promise<MapPoint | null> => {
  const normalizedLabel = label.trim();
  if (!normalizedLabel) return null;

  try {
    const params = new URLSearchParams({
      q: normalizedLabel,
      format: 'json',
      limit: '1'
    });

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en',
        'User-Agent': 'ThrottleUpReact/1.0'
      }
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as OpenStreetMapGeocodeResponse;
    const candidate = Array.isArray(payload) ? payload[0] : null;
    if (!candidate) return null;

    const lat = Number(candidate.lat);
    const lng = Number(candidate.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    const resolvedLabel = candidate.display_name?.trim() || candidate.name?.trim() || normalizedLabel;
    return {
      lat,
      lng,
      label: resolvedLabel
    };
  } catch {
    return null;
  }
};

const fetchGoogleReverseGeocodeLabel = async (point: Pick<MapPoint, 'lat' | 'lng'>, apiKey: string): Promise<string | null> => {
  if (!apiKey.trim()) return null;

  try {
    const params = new URLSearchParams({
      latlng: `${point.lat},${point.lng}`,
      language: 'en',
      key: apiKey
    });
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`);
    if (!response.ok) return null;

    const payload = (await response.json()) as GoogleGeocodeResponse;
    if (payload.status !== 'OK') return null;

    const firstResult = payload.results?.[0]?.formatted_address?.trim();
    return firstResult && firstResult.length > 0 ? firstResult : null;
  } catch {
    return null;
  }
};

const fetchOpenStreetMapReverseGeocodeLabel = async (point: Pick<MapPoint, 'lat' | 'lng'>): Promise<string | null> => {
  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: String(point.lat),
      lon: String(point.lng)
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en',
        'User-Agent': 'ThrottleUpReact/1.0'
      }
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as OpenStreetMapReverseGeocodeResponse;
    const label = payload.display_name?.trim() || payload.name?.trim();
    return label && label.length > 0 ? label : null;
  } catch {
    return null;
  }
};

const resolvePointDisplayLabel = async (point: Pick<MapPoint, 'lat' | 'lng'>, apiKey: string): Promise<string | null> => {
  const googleLabel = await fetchGoogleReverseGeocodeLabel(point, apiKey);
  if (googleLabel) return googleLabel;
  return fetchOpenStreetMapReverseGeocodeLabel(point);
};

const parseGoogleDirectionsEstimate = (route: GoogleDirectionsRoute): RouteEstimate | null => {
  const legs = route.legs ?? [];
  if (legs.length === 0) return null;

  const distanceMeters = legs.reduce((sum, leg) => {
    const distanceValue = leg.distance?.value;
    if (!Number.isFinite(distanceValue ?? NaN)) return sum;
    return sum + Number(distanceValue);
  }, 0);

  const durationSeconds = legs.reduce((sum, leg) => {
    const durationInTrafficValue = leg.duration_in_traffic?.value;
    const durationValue = leg.duration?.value;
    if (Number.isFinite(durationInTrafficValue ?? NaN)) return sum + Number(durationInTrafficValue);
    if (Number.isFinite(durationValue ?? NaN)) return sum + Number(durationValue);
    return sum;
  }, 0);

  if (distanceMeters <= 0 || durationSeconds <= 0) return null;

  const legInstructionText = legs
    .flatMap((leg) => leg.steps ?? [])
    .map((step) => stripHtmlTags(step.html_instructions ?? ''))
    .filter(Boolean);
  const tollContext = [route.summary ?? '', ...(route.warnings ?? []), ...legInstructionText].join(' ');
  const hasTollHint = containsTollKeyword(tollContext);
  const distanceKm = distanceMeters / 1000;
  const etaMinutes = durationSeconds / 60;

  return {
    distanceKm,
    etaMinutes,
    tollEstimateInr: estimateTollFromDistance(distanceKm, hasTollHint),
    source: 'google'
  };
};

const buildFallbackRouteEstimate = (startPoint: MapPoint | null, endPoint: MapPoint | null, intermediatePoints: MapPoint[]): RouteEstimate | null => {
  const coordinatePoints = [startPoint, ...intermediatePoints, endPoint].filter((point): point is MapPoint => point !== null);
  if (coordinatePoints.length < 2) return null;

  const distanceKm = calculatePolylineDistanceKm(coordinatePoints);
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return null;

  const averageSpeedKmph = distanceKm >= 180 ? 62 : distanceKm >= 90 ? 54 : 42;
  const etaMinutes = Math.max(8, (distanceKm / averageSpeedKmph) * 60);

  return {
    distanceKm,
    etaMinutes,
    tollEstimateInr: estimateTollFromDistance(distanceKm, distanceKm >= 60),
    source: 'fallback'
  };
};

const buildRouteEstimateFromOsrmData = (routeData: OsrmRouteData): RouteEstimate => ({
  distanceKm: routeData.distanceKm,
  etaMinutes: routeData.etaMinutes,
  tollEstimateInr: estimateTollFromDistance(routeData.distanceKm, routeData.distanceKm >= 60),
  source: 'fallback'
});

const fetchOsrmRouteData = async ({
  startPoint,
  endPoint,
  intermediatePoints
}: {
  startPoint: MapPoint | null;
  endPoint: MapPoint | null;
  intermediatePoints: MapPoint[];
}): Promise<OsrmRouteData | null> => {
  const coordinatePoints = [startPoint, ...intermediatePoints, endPoint].filter((point): point is MapPoint => point !== null);
  if (coordinatePoints.length < 2) return null;

  const coordinateToken = coordinatePoints.map((point) => `${point.lng},${point.lat}`).join(';');

  try {
    const params = new URLSearchParams({
      overview: 'full',
      geometries: 'polyline',
      alternatives: 'false',
      steps: 'true'
    });

    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinateToken}?${params.toString()}`);
    if (!response.ok) return null;

    const payload = (await response.json()) as OsrmRouteResponse;
    if (payload.code !== 'Ok') return null;

    const route = payload.routes?.[0];
    if (!route) return null;

    const distanceMeters = Number(route.distance ?? NaN);
    const durationSeconds = Number(route.duration ?? NaN);
    if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSeconds)) return null;
    if (distanceMeters <= 0 || durationSeconds <= 0) return null;

    const coordinates = dedupeRouteCoordinates(decodeGooglePolyline(route.geometry ?? ''));
    if (coordinates.length < 2) return null;

    return {
      distanceKm: distanceMeters / 1000,
      etaMinutes: durationSeconds / 60,
      coordinates
    };
  } catch {
    return null;
  }
};

const fetchGoogleDirectionsRoute = async ({
  startLabel,
  endLabel,
  startPoint,
  endPoint,
  intermediatePoints,
  apiKey
}: {
  startLabel: string;
  endLabel: string;
  startPoint: MapPoint | null;
  endPoint: MapPoint | null;
  intermediatePoints: MapPoint[];
  apiKey: string;
}): Promise<GoogleDirectionsRoute | null> => {
  if (!apiKey.trim()) return null;

  const origin = toDirectionsLocationToken(startLabel, startPoint);
  const destination = toDirectionsLocationToken(endLabel, endPoint);
  if (!origin || !destination) return null;

  const params = new URLSearchParams({
    origin,
    destination,
    mode: 'driving',
    departure_time: 'now',
    traffic_model: 'best_guess',
    units: 'metric',
    key: apiKey
  });
  if (intermediatePoints.length > 0) {
    const waypoints = intermediatePoints.map((point) => `${point.lat},${point.lng}`).join('|');
    params.set('waypoints', waypoints);
  }

  const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Directions request failed (${response.status})`);
  }

  const payload = (await response.json()) as GoogleDirectionsResponse;
  const status = payload.status ?? 'UNKNOWN_ERROR';
  if (status !== 'OK') {
    return null;
  }

  return payload.routes?.[0] ?? null;
};

const fetchGoogleDirectionsEstimate = async ({
  startLabel,
  endLabel,
  startPoint,
  endPoint,
  intermediatePoints,
  apiKey
}: {
  startLabel: string;
  endLabel: string;
  startPoint: MapPoint | null;
  endPoint: MapPoint | null;
  intermediatePoints: MapPoint[];
  apiKey: string;
}): Promise<RouteEstimate | null> => {
  const route = await fetchGoogleDirectionsRoute({
    startLabel,
    endLabel,
    startPoint,
    endPoint,
    intermediatePoints,
    apiKey
  });
  if (!route) return null;
  return parseGoogleDirectionsEstimate(route);
};

const fetchGoogleDirectionsPathCoordinates = async ({
  startLabel,
  endLabel,
  startPoint,
  endPoint,
  intermediatePoints,
  apiKey
}: {
  startLabel: string;
  endLabel: string;
  startPoint: MapPoint | null;
  endPoint: MapPoint | null;
  intermediatePoints: MapPoint[];
  apiKey: string;
}): Promise<RouteCoordinate[] | null> => {
  const route = await fetchGoogleDirectionsRoute({
    startLabel,
    endLabel,
    startPoint,
    endPoint,
    intermediatePoints,
    apiKey
  });
  if (route) {
    const coordinates = extractGoogleRoutePathCoordinates(route);
    if (coordinates.length > 1) return coordinates;
  }

  const [resolvedStartPoint, resolvedEndPoint] = await Promise.all([
    startPoint ? Promise.resolve(startPoint) : fetchGoogleFindPlacePoint(startLabel, apiKey),
    endPoint ? Promise.resolve(endPoint) : fetchGoogleFindPlacePoint(endLabel, apiKey)
  ]);
  const osrmRoute = await fetchOsrmRouteData({
    startPoint: resolvedStartPoint,
    endPoint: resolvedEndPoint,
    intermediatePoints
  });
  if (!osrmRoute) return null;
  return osrmRoute.coordinates.length > 1 ? osrmRoute.coordinates : null;
};

const fetchGoogleFindPlacePoint = async (label: string, apiKey: string): Promise<MapPoint | null> => {
  const normalizedLabel = label.trim();
  if (!normalizedLabel) return null;

  const parsedCoordinatePoint = parseCoordinateLabelPoint(normalizedLabel);
  if (parsedCoordinatePoint) return parsedCoordinatePoint;
  if (apiKey.trim()) {
    try {
      const params = new URLSearchParams({
        input: normalizedLabel,
        inputtype: 'textquery',
        fields: 'formatted_address,name,geometry/location,photos',
        language: 'en',
        key: apiKey
      });

      const response = await fetch(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?${params.toString()}`);
      if (response.ok) {
        const payload = (await response.json()) as GoogleFindPlaceResponse;
        if (payload.status === 'OK') {
          const candidate = payload.candidates?.[0];
          const lat = candidate?.geometry?.location?.lat;
          const lng = candidate?.geometry?.location?.lng;
          if (isFiniteNumber(lat ?? NaN) && isFiniteNumber(lng ?? NaN)) {
            const photoRef = candidate?.photos?.[0]?.photo_reference;
            return {
              lat: lat as number,
              lng: lng as number,
              label: candidate?.formatted_address?.trim() || candidate?.name?.trim() || normalizedLabel,
              ...(photoRef ? { photoRef } : {})
            };
          }
        }
      }
    } catch {
      // Fall through to OSM geocode fallback.
    }
  }

  return fetchOpenStreetMapGeocodePoint(normalizedLabel);
};

const resolveRouteEstimate = async ({
  startLabel,
  endLabel,
  startPoint,
  endPoint,
  intermediatePoints,
  apiKey
}: {
  startLabel: string;
  endLabel: string;
  startPoint: MapPoint | null;
  endPoint: MapPoint | null;
  intermediatePoints: MapPoint[];
  apiKey: string;
}): Promise<RouteEstimate | null> => {
  try {
    const fromGoogle = await fetchGoogleDirectionsEstimate({
      startLabel,
      endLabel,
      startPoint,
      endPoint,
      intermediatePoints,
      apiKey
    });
    if (fromGoogle) {
      return fromGoogle;
    }
  } catch {
    // Fall through to coordinate-based estimate below.
  }

  const [resolvedStartPoint, resolvedEndPoint] = await Promise.all([
    startPoint ? Promise.resolve(startPoint) : fetchGoogleFindPlacePoint(startLabel, apiKey),
    endPoint ? Promise.resolve(endPoint) : fetchGoogleFindPlacePoint(endLabel, apiKey)
  ]);

  const osrmRoute = await fetchOsrmRouteData({
    startPoint: resolvedStartPoint,
    endPoint: resolvedEndPoint,
    intermediatePoints
  });
  if (osrmRoute) {
    return buildRouteEstimateFromOsrmData(osrmRoute);
  }

  return buildFallbackRouteEstimate(resolvedStartPoint, resolvedEndPoint, intermediatePoints);
};

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

export const GroupChatRoomScreen = ({
  visible,
  group,
  messages,
  currentUserId,
  users,
  syncError,
  isSyncing,
  onRetrySync,
  onClose,
  onSendMessage,
  theme
}: {
  visible: boolean;
  group: Group | null;
  messages: ChatMessage[];
  currentUserId: string;
  users: User[];
  syncError?: string | null;
  isSyncing?: boolean;
  onRetrySync?: () => void;
  onClose: () => void;
  onSendMessage: (groupId: string, text: string) => void;
  theme: Theme;
}) => {
  const t = TOKENS[theme];
  const insets = useSafeAreaInsets();
  const topInset = getAndroidTopInset(insets);
  const [inputText, setInputText] = useState('');

  const usersById = useMemo(() => {
    const map = new Map<string, User>();
    users.forEach((user) => map.set(user.id, user));
    return map;
  }, [users]);

  if (!group) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg, paddingTop: topInset }]}>
        <View style={[styles.modalHeader, { borderBottomColor: t.border }]}>
          <View style={styles.rowAligned}>
            <TouchableOpacity onPress={onClose} style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}>
              <MaterialCommunityIcons name="arrow-left" size={20} color={t.text} />
            </TouchableOpacity>
            <Image source={{ uri: group.avatar || avatarFallback }} style={styles.avatarSmall} />
            <View>
              <Text style={[styles.modalTitle, { color: t.text }]}>{group.name}</Text>
              <Text style={[styles.metaText, { color: t.muted }]}>{group.members.length} members</Text>
            </View>
          </View>
        </View>

        {!!syncError && (
          <View style={[styles.syncBanner, { margin: 14, borderColor: `${TOKENS[theme].red}66`, backgroundColor: t.subtle }]}>
            <MaterialCommunityIcons name="cloud-alert-outline" size={18} color={TOKENS[theme].red} />
            <View style={styles.syncBannerContent}>
              <Text style={[styles.syncBannerTitle, { color: TOKENS[theme].red }]}>Group Chat Sync Failed</Text>
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
          {messages.length === 0 ? (
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons name="account-group-outline" size={40} color={t.muted} />
              <Text style={[styles.emptyTitle, { color: t.text }]}>Group channel is quiet.</Text>
              <Text style={[styles.emptySubtitle, { color: t.muted }]}>Start planning your next ride.</Text>
            </View>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === currentUserId;
              const senderName = msg.senderName ?? usersById.get(msg.senderId)?.name ?? msg.senderId;

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
                    {!isMe && <Text style={[styles.metaText, { marginBottom: 4, color: t.primary }]}>{senderName}</Text>}
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
              placeholder="Message group..."
              placeholderTextColor={t.muted}
              value={inputText}
              onChangeText={setInputText}
            />
            <TouchableOpacity
              style={[styles.iconRoundButton, { backgroundColor: t.primary }]}
              onPress={() => {
                if (!inputText.trim()) return;
                onSendMessage(group.id, inputText.trim());
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

type RideComposerPayload = Omit<RidePost, 'id' | 'creatorId' | 'creatorName' | 'creatorAvatar' | 'currentParticipants' | 'requests' | 'createdAt' | 'city'>;

export const CreateRideModal = ({
  visible,
  onClose,
  onSubmit,
  theme,
  currentCity,
  userGroups = [],
  initialRide
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (ride: RideComposerPayload) => void;
  theme: Theme;
  currentCity: string;
  userGroups?: Group[];
  initialRide?: RidePost | null;
}) => {
  const t = TOKENS[theme];
  const insets = useSafeAreaInsets();
  const topInset = getAndroidTopInset(insets);
  const isEditMode = Boolean(initialRide);
  const accent = t.primary;
  const inactiveBorder = t.border;
  const inactiveText = t.muted;
  const selectedBackground = `${t.primary}1a`;
  const inactiveButtonBackground = `${t.muted}66`;
  const switchThumbOff = theme === 'dark' ? '#cbd5e1' : '#ffffff';
  const availableUserGroups = Array.isArray(userGroups) ? userGroups : [];
  const [primaryDestination, setPrimaryDestination] = useState('');
  const [rideName, setRideName] = useState('');
  const [dayMode, setDayMode] = useState<'single' | 'multi'>('single');
  const [startDate, setStartDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
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
  const [splitTotalAmount, setSplitTotalAmount] = useState('');
  const [upiPaymentInput, setUpiPaymentInput] = useState('');
  const [inclusions, setInclusions] = useState<RideInclusion[]>([]);
  const [rideNote, setRideNote] = useState(DEFAULT_RIDE_NOTE);
  const [inviteAudience, setInviteAudience] = useState<InviteAudience>('groups');
  const [isPrivateRide, setIsPrivateRide] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [rideJoinPermission, setRideJoinPermission] = useState<RideJoinPermission>('anyone');
  const [hasRiderLimit, setHasRiderLimit] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState('5');
  const [groupId, setGroupId] = useState('');
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [routePoints, setRoutePoints] = useState<MapPoint[]>([]);
  const [destinationIndex, setDestinationIndex] = useState(0);
  const [draftRoutePoints, setDraftRoutePoints] = useState<MapPoint[]>([]);
  const [destinationQuery, setDestinationQuery] = useState('');
  const [destinationPhotoRef, setDestinationPhotoRef] = useState<string | null>(null);
  const [destinationPoint, setDestinationPoint] = useState<MapPoint | null>(null);
  const [savedDestinations, setSavedDestinations] = useState<string[]>([]);
  const [isDestinationPickerOpen, setIsDestinationPickerOpen] = useState(false);
  const [locationPickerContext, setLocationPickerContext] = useState<LocationPickerContext>('primaryDestination');
  const [googleDestinationSuggestions, setGoogleDestinationSuggestions] = useState<GooglePlaceSuggestion[]>([]);
  const [isGoogleDestinationLoading, setIsGoogleDestinationLoading] = useState(false);
  const [googleDestinationError, setGoogleDestinationError] = useState<string | null>(null);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [timePickerField, setTimePickerField] = useState<TimePickerField>('assembly');
  const [datePickerField, setDatePickerField] = useState<DatePickerField>('startDate');
  const [pickerDraftValue, setPickerDraftValue] = useState<Date>(() => {
    const now = new Date();
    now.setSeconds(0, 0);
    return now;
  });
  const [startDateValue, setStartDateValue] = useState<Date | null>(null);
  const [returnDateValue, setReturnDateValue] = useState<Date | null>(null);
  const [assemblyTimeValue, setAssemblyTimeValue] = useState<Date | null>(null);
  const [flagOffTimeValue, setFlagOffTimeValue] = useState<Date | null>(null);
  const [isRidePointPickerOpen, setIsRidePointPickerOpen] = useState(false);
  const [draftRidePoint, setDraftRidePoint] = useState<MapPoint | null>(null);
  const [isStopPickerOpen, setIsStopPickerOpen] = useState(false);
  const [mapPickerCanPan, setMapPickerCanPan] = useState(false);
  const [routeEstimate, setRouteEstimate] = useState<RouteEstimate | null>(null);
  const [routePreviewPathCoordinates, setRoutePreviewPathCoordinates] = useState<RouteCoordinate[] | null>(null);
  const [isRouteEstimateLoading, setIsRouteEstimateLoading] = useState(false);
  const [routeEstimateError, setRouteEstimateError] = useState<string | null>(null);
  const [isRoutePreviewMapReady, setIsRoutePreviewMapReady] = useState(Platform.OS === 'web');
  const [routePreviewMapSize, setRoutePreviewMapSize] = useState({ width: 0, height: 0 });
  const [routePreviewOverlayLabels, setRoutePreviewOverlayLabels] = useState<
    Array<{
      key: string;
      label: string;
      color: string;
      width: number;
      fontSize: number;
      left: number;
      top: number;
    }>
  >([]);
  const rideNoteInputRef = useRef<TextInput | null>(null);
  const routePreviewMapRef = useRef<RouteMapViewRef | null>(null);
  const googleAutocompleteRequestRef = useRef(0);
  const routeEstimateRequestRef = useRef(0);
  const stopPickerSeedRequestRef = useRef(0);
  const rideStartPointLabelRequestRef = useRef(0);
  const rideEndPointLabelRequestRef = useRef(0);
  const inclusionOptions = RIDE_INCLUSION_OPTIONS;
  const trendingDestinations = useMemo(() => getTrendingDestinationsForCity(currentCity), [currentCity]);
  const normalizedCurrentCity = currentCity.trim();
  const hasGooglePlacesKey = GOOGLE_PLACES_KEY.length > 0;
  const destinationLabel = (ridingTo.trim() || primaryDestination.trim()).trim();
  const routeIntermediatePoints = useMemo(
    () =>
      mergeIntermediateRoutePoints({
        routePoints,
        destinationIndex,
        destinationPoint,
        destinationLabel
      }),
    [destinationIndex, destinationLabel, destinationPoint, routePoints]
  );
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
  const dedupedLocalDestinationSuggestions = useMemo(() => {
    if (googleDestinationSuggestions.length === 0) return filteredDestinationSuggestions;

    const remoteLabels = new Set(googleDestinationSuggestions.map((item) => item.description.trim().toLowerCase()));
    return filteredDestinationSuggestions.filter((item) => !remoteLabels.has(item.trim().toLowerCase()));
  }, [filteredDestinationSuggestions, googleDestinationSuggestions]);
  const minimumRideDate = useMemo(() => {
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    return currentDate;
  }, []);
  const maximumRideDate = useMemo(() => {
    const currentDate = new Date(minimumRideDate);
    currentDate.setDate(currentDate.getDate() + DATE_PICKER_WINDOW_DAYS - 1);
    return currentDate;
  }, [minimumRideDate]);

  const resetForm = () => {
    setPrimaryDestination('');
    setRideName('');
    setDayMode('single');
    setStartDate('');
    setReturnDate('');
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
    setSplitTotalAmount('');
    setUpiPaymentInput('');
    setInclusions([]);
    setRideNote(DEFAULT_RIDE_NOTE);
    setInviteAudience('groups');
    setIsPrivateRide(false);
    setRideJoinPermission('anyone');
    setHasRiderLimit(false);
    setMaxParticipants('5');
    setDestinationPhotoRef(null);
    setDestinationPoint(null);
    setDestinationQuery('');
    setGoogleDestinationSuggestions([]);
    setIsGoogleDestinationLoading(false);
    setGoogleDestinationError(null);
    setIsDestinationPickerOpen(false);
    setIsDatePickerOpen(false);
    setIsTimePickerOpen(false);
    setTimePickerField('assembly');
    setDatePickerField('startDate');
    setStartDateValue(null);
    setReturnDateValue(null);
    setAssemblyTimeValue(null);
    setFlagOffTimeValue(null);
    setPickerDraftValue(new Date());
    setIsRidePointPickerOpen(false);
    setDraftRidePoint(null);
    setRoutePoints([]);
    setDestinationIndex(0);
    setDraftRoutePoints([]);
    setIsStopPickerOpen(false);
    setRouteEstimate(null);
    setRoutePreviewPathCoordinates(null);
    setIsRouteEstimateLoading(false);
    setRouteEstimateError(null);
    routeEstimateRequestRef.current += 1;
    stopPickerSeedRequestRef.current += 1;
    rideStartPointLabelRequestRef.current += 1;
    rideEndPointLabelRequestRef.current += 1;
  };

  useEffect(() => {
    if (!visible) {
      resetForm();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !initialRide) return;

    const { startPoint: explicitStartPoint, endPoint: explicitEndPoint, stopPoints } = splitRoutePointRoles(initialRide.routePoints);
    const fallbackStartPoint = explicitStartPoint ?? parseCoordinateLabelPoint(initialRide.startLocation ?? '');
    const fallbackEndPoint = explicitEndPoint ?? parseCoordinateLabelPoint(initialRide.endLocation ?? '');
    const normalizedStopPoints = stopPoints.map((point, index) => ({
      ...point,
      label: point.label?.trim() || `Stop ${index + 1}`
    }));
    const nextCostOption: RideCostOption = initialRide.costType ?? 'Free';
    const existingEstimate =
      typeof initialRide.routeDistanceKm === 'number' || typeof initialRide.routeEtaMinutes === 'number' || typeof initialRide.tollEstimateInr === 'number'
        ? {
          distanceKm: clampPositiveNumber(initialRide.routeDistanceKm ?? 0),
          etaMinutes: clampPositiveNumber(initialRide.routeEtaMinutes ?? 0),
          tollEstimateInr: Math.max(0, Math.round(initialRide.tollEstimateInr ?? 0)),
          source: 'fallback' as const
        }
        : null;

    setPrimaryDestination(initialRide.primaryDestination?.trim() || initialRide.endLocation?.trim() || '');
    setRideName(initialRide.title.trim());
    setDayMode(initialRide.dayPlan === 'multi' ? 'multi' : 'single');
    setStartDate(initialRide.startDate?.trim() || initialRide.date.trim());
    setReturnDate(initialRide.returnDate?.trim() || '');
    setRideStartsAt(initialRide.startLocation?.trim() || '');
    setRidingTo(initialRide.primaryDestination?.trim() || initialRide.endLocation?.trim() || '');
    setRideEndsAt(initialRide.endLocation?.trim() || '');
    setRideStartPoint(fallbackStartPoint ? { ...fallbackStartPoint, label: 'Ride starts' } : null);
    setRideEndPoint(fallbackEndPoint ? { ...fallbackEndPoint, label: 'Ride ends' } : null);
    setAssemblyTime(initialRide.assemblyTime?.trim() || '');
    setFlagOffTime(initialRide.flagOffTime?.trim() || initialRide.startTime.trim());
    setRideDuration(initialRide.rideDuration?.trim() || '');
    setCostOption(nextCostOption);
    setPricePerPerson(typeof initialRide.pricePerPerson === 'number' && initialRide.pricePerPerson > 0 ? String(Math.round(initialRide.pricePerPerson)) : '');
    setSplitTotalAmount(
      typeof initialRide.splitTotalAmount === 'number' && initialRide.splitTotalAmount > 0 ? String(Math.round(initialRide.splitTotalAmount)) : ''
    );
    setUpiPaymentInput(initialRide.upiPaymentLink?.trim() || '');
    setInclusions((initialRide.inclusions ?? []).filter((item): item is RideInclusion => inclusionOptions.includes(item as RideInclusion)));
    setRideNote(initialRide.rideNote?.trim() || DEFAULT_RIDE_NOTE);
    setInviteAudience(initialRide.inviteAudience === 'riders' ? 'riders' : 'groups');
    setIsPrivateRide(initialRide.isPrivate === true);
    setRideJoinPermission(initialRide.joinPermission === 'request_to_join' ? 'request_to_join' : 'anyone');
    setHasRiderLimit(initialRide.maxParticipants < 20);
    setMaxParticipants(String(initialRide.maxParticipants > 0 ? initialRide.maxParticipants : 5));
    setDestinationPhotoRef(initialRide.destinationPhotoRef?.trim() || null);
    setDestinationPoint(parseCoordinateLabelPoint(initialRide.primaryDestination?.trim() || '') ?? null);
    setRoutePoints(normalizedStopPoints);
    setDestinationIndex(normalizedStopPoints.length);
    setDraftRoutePoints([]);
    setDestinationQuery('');
    setGoogleDestinationSuggestions([]);
    setIsGoogleDestinationLoading(false);
    setGoogleDestinationError(null);
    setIsDestinationPickerOpen(false);
    setDatePickerField('startDate');
    setTimePickerField('assembly');
    setStartDateValue(null);
    setReturnDateValue(null);
    setAssemblyTimeValue(null);
    setFlagOffTimeValue(null);
    setPickerDraftValue(new Date());
    setIsRidePointPickerOpen(false);
    setDraftRidePoint(null);
    setIsStopPickerOpen(false);
    setRouteEstimate(existingEstimate);
    setRoutePreviewPathCoordinates(null);
    setIsRouteEstimateLoading(false);
    setRouteEstimateError(null);
    routeEstimateRequestRef.current += 1;
    stopPickerSeedRequestRef.current += 1;
    rideStartPointLabelRequestRef.current += 1;
    rideEndPointLabelRequestRef.current += 1;
  }, [initialRide, visible]);

  useEffect(() => {
    if (dayMode !== 'single') return;
    setReturnDate('');
    setReturnDateValue(null);
    if (datePickerField === 'returnDate') {
      setDatePickerField('startDate');
    }
  }, [datePickerField, dayMode]);

  useEffect(() => {
    if (!isDestinationPickerOpen) {
      setGoogleDestinationSuggestions([]);
      setIsGoogleDestinationLoading(false);
      setGoogleDestinationError(null);
      return;
    }

    const query = destinationQuery.trim();
    if (!hasGooglePlacesKey || query.length < PLACE_AUTOCOMPLETE_MIN_QUERY_LENGTH) {
      setGoogleDestinationSuggestions([]);
      setIsGoogleDestinationLoading(false);
      setGoogleDestinationError(null);
      return;
    }

    const requestId = googleAutocompleteRequestRef.current + 1;
    googleAutocompleteRequestRef.current = requestId;
    let isCanceled = false;

    setIsGoogleDestinationLoading(true);
    setGoogleDestinationError(null);

    const timeoutId = setTimeout(() => {
      (async () => {
        try {
          const params = new URLSearchParams({
            input: query,
            language: 'en',
            components: 'country:in',
            key: GOOGLE_PLACES_KEY
          });

          const response = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`);
          if (!response.ok) {
            throw new Error(`Autocomplete request failed (${response.status})`);
          }

          const payload = (await response.json()) as GooglePlacesAutocompleteResponse;
          if (isCanceled || requestId !== googleAutocompleteRequestRef.current) return;
          const status = payload.status ?? 'UNKNOWN_ERROR';
          if (status !== 'OK' && status !== 'ZERO_RESULTS') {
            throw new Error(payload.error_message ?? status);
          }

          const suggestions = (payload.predictions ?? [])
            .map((prediction): GooglePlaceSuggestion | null => {
              const description = prediction.description?.trim();
              const placeId = prediction.place_id?.trim();
              if (!description || !placeId) return null;

              return {
                placeId,
                description,
                primaryText: prediction.structured_formatting?.main_text?.trim() || description,
                secondaryText: prediction.structured_formatting?.secondary_text?.trim() || undefined
              };
            })
            .filter((item): item is GooglePlaceSuggestion => item !== null)
            .slice(0, 6);

          setGoogleDestinationSuggestions(suggestions);
          setGoogleDestinationError(null);
        } catch (error) {
          if (isCanceled || requestId !== googleAutocompleteRequestRef.current) return;
          setGoogleDestinationSuggestions([]);
          setGoogleDestinationError(error instanceof Error ? error.message : 'Unable to fetch location suggestions.');
        } finally {
          if (!isCanceled && requestId === googleAutocompleteRequestRef.current) {
            setIsGoogleDestinationLoading(false);
          }
        }
      })();
    }, PLACE_AUTOCOMPLETE_DEBOUNCE_MS);

    return () => {
      isCanceled = true;
      clearTimeout(timeoutId);
    };
  }, [destinationQuery, hasGooglePlacesKey, isDestinationPickerOpen]);

  useEffect(() => {
    if (!destinationLabel) {
      setDestinationPoint(null);
      return;
    }

    if (destinationPoint?.label?.trim().toLowerCase() === destinationLabel.toLowerCase()) {
      return;
    }

    const parsedCoordinatePoint = parseCoordinateLabelPoint(destinationLabel);
    if (parsedCoordinatePoint) {
      setDestinationPoint({
        ...parsedCoordinatePoint,
        label: destinationLabel
      });
      return;
    }

    let isCanceled = false;
    (async () => {
      const resolved = await fetchGoogleFindPlacePoint(destinationLabel, GOOGLE_PLACES_KEY);
      if (isCanceled) return;
      setDestinationPoint(
        resolved
          ? {
            ...resolved,
            label: destinationLabel
          }
          : null
      );
    })();

    return () => {
      isCanceled = true;
    };
  }, [destinationLabel, destinationPoint]);

  useEffect(() => {
    if (!rideStartPoint) return;

    const coordinateLabelPoint = parseCoordinateLabelPoint(rideStartsAt);
    if (!coordinateLabelPoint) return;
    if (!areRoutePointsAtSameCoordinate(coordinateLabelPoint, rideStartPoint)) return;

    const requestId = rideStartPointLabelRequestRef.current + 1;
    rideStartPointLabelRequestRef.current = requestId;

    (async () => {
      const resolvedLabel = await resolvePointDisplayLabel(rideStartPoint, GOOGLE_PLACES_KEY);
      if (requestId !== rideStartPointLabelRequestRef.current) return;
      if (!resolvedLabel?.trim()) return;
      setRideStartsAt(resolvedLabel.trim());
      saveDestination(resolvedLabel.trim());
    })();
  }, [rideStartPoint, rideStartsAt]);

  useEffect(() => {
    if (!rideEndPoint) return;

    const coordinateLabelPoint = parseCoordinateLabelPoint(rideEndsAt);
    if (!coordinateLabelPoint) return;
    if (!areRoutePointsAtSameCoordinate(coordinateLabelPoint, rideEndPoint)) return;

    const requestId = rideEndPointLabelRequestRef.current + 1;
    rideEndPointLabelRequestRef.current = requestId;

    (async () => {
      const resolvedLabel = await resolvePointDisplayLabel(rideEndPoint, GOOGLE_PLACES_KEY);
      if (requestId !== rideEndPointLabelRequestRef.current) return;
      if (!resolvedLabel?.trim()) return;
      setRideEndsAt(resolvedLabel.trim());
      saveDestination(resolvedLabel.trim());
    })();
  }, [rideEndPoint, rideEndsAt]);

  useEffect(() => {
    const startLabel = rideStartsAt.trim();
    const endLabel = rideEndsAt.trim();
    if (!startLabel || !endLabel) {
      setRouteEstimate(null);
      setRouteEstimateError(null);
      setIsRouteEstimateLoading(false);
      return;
    }

    const requestId = routeEstimateRequestRef.current + 1;
    routeEstimateRequestRef.current = requestId;
    let isCanceled = false;
    setIsRouteEstimateLoading(true);
    setRouteEstimateError(null);

    (async () => {
      try {
        const estimate = await resolveRouteEstimate({
          startLabel,
          endLabel,
          startPoint: rideStartPoint,
          endPoint: rideEndPoint,
          intermediatePoints: routeIntermediatePoints,
          apiKey: GOOGLE_PLACES_KEY
        });

        if (isCanceled || requestId !== routeEstimateRequestRef.current) return;
        const fallbackEstimate = buildFallbackRouteEstimate(rideStartPoint, rideEndPoint, routeIntermediatePoints);
        const resolvedEstimate = estimate ?? fallbackEstimate;
        if (!resolvedEstimate) {
          setRouteEstimate(null);
          setRouteEstimateError(null);
          return;
        }

        setRouteEstimate(resolvedEstimate);
        setRouteEstimateError(null);
      } catch {
        if (isCanceled || requestId !== routeEstimateRequestRef.current) return;
        const fallbackEstimate = buildFallbackRouteEstimate(rideStartPoint, rideEndPoint, routeIntermediatePoints);
        if (fallbackEstimate) {
          setRouteEstimate(fallbackEstimate);
          setRouteEstimateError(null);
          return;
        }
        setRouteEstimate(null);
        setRouteEstimateError('Unable to estimate route right now. Try again in a moment.');
      } finally {
        if (!isCanceled && requestId === routeEstimateRequestRef.current) {
          setIsRouteEstimateLoading(false);
        }
      }
    })();

    return () => {
      isCanceled = true;
    };
  }, [rideEndPoint, rideEndsAt, rideStartPoint, rideStartsAt, routeIntermediatePoints]);

  useEffect(() => {
    const startLabel = rideStartsAt.trim();
    const endLabel = rideEndsAt.trim();
    if (!startLabel || !endLabel) {
      setRoutePreviewPathCoordinates(null);
      return;
    }

    let isCanceled = false;

    (async () => {
      try {
        const pathCoordinates = await fetchGoogleDirectionsPathCoordinates({
          startLabel,
          endLabel,
          startPoint: rideStartPoint,
          endPoint: rideEndPoint,
          intermediatePoints: routeIntermediatePoints,
          apiKey: GOOGLE_PLACES_KEY
        });

        if (isCanceled) return;
        setRoutePreviewPathCoordinates(pathCoordinates);
      } catch {
        if (!isCanceled) {
          setRoutePreviewPathCoordinates(null);
        }
      }
    })();

    return () => {
      isCanceled = true;
    };
  }, [rideEndPoint, rideEndsAt, rideStartPoint, rideStartsAt, routeIntermediatePoints]);

  const riderLimit = Math.max(2, Math.min(20, Number(maxParticipants) || 5));
  const routeSummary = [rideStartsAt.trim(), ridingTo.trim(), rideEndsAt.trim()].filter(Boolean).join(' -> ');
  const summaryDestination = destinationLabel || 'Pending destination';
  const routePreviewPoints: MapPoint[] = [
    ...(rideStartPoint ? [{ ...rideStartPoint, label: 'Ride starts' }] : []),
    ...routeIntermediatePoints.map((point, index) => ({
      ...point,
      label: point.label?.trim() || `Waypoint ${index + 1}`
    })),
    ...(rideEndPoint ? [{ ...rideEndPoint, label: 'Ride ends' }] : [])
  ];
  const routePreviewMarkerLabels = routePreviewPoints.map((point, index) => {
    const isStart = index === 0;
    const isEnd = index === routePreviewPoints.length - 1;

    if (isStart) {
      return toShortRouteMarkerLabel(rideStartsAt || point.label, 'Start');
    }

    if (isEnd) {
      return toShortRouteMarkerLabel(rideEndsAt || point.label, 'End');
    }

    return toShortRouteMarkerLabel(point.label, `Stop ${index + 1}`);
  });
  const routePreviewBaseCoordinates = toRouteCoordinates(routePreviewPoints);
  const routePreviewMarkerColors = routePreviewBaseCoordinates.map((_, index) => {
    const isStart = index === 0;
    const isEnd = index === routePreviewBaseCoordinates.length - 1;
    return isStart ? TOKENS[theme].green : isEnd ? TOKENS[theme].red : accent;
  });
  const routePreviewMarkerLabelKey = routePreviewMarkerLabels.join('|');
  const routePreviewMarkerColorKey = routePreviewMarkerColors.join('|');
  const routePreviewPolylineCoordinates = routePreviewPathCoordinates ?? routePreviewBaseCoordinates;
  const firstPreviewCoordinate = routePreviewPolylineCoordinates[0];
  const lastPreviewCoordinate =
    routePreviewPolylineCoordinates.length > 0 ? routePreviewPolylineCoordinates[routePreviewPolylineCoordinates.length - 1] : null;
  const routePreviewRegion = buildRouteRegion(routePreviewPolylineCoordinates, {
    paddingScale: 1.04,
    paddingDelta: 0.015,
    minDelta: 0.008
  });
  const routePreviewMapKey = [
    routePreviewPoints.map((point) => `${point.lat}:${point.lng}`).join('|'),
    routePreviewPathCoordinates ? 'live' : 'point',
    String(routePreviewPolylineCoordinates.length),
    firstPreviewCoordinate ? `${firstPreviewCoordinate.latitude}:${firstPreviewCoordinate.longitude}` : '',
    lastPreviewCoordinate ? `${lastPreviewCoordinate.latitude}:${lastPreviewCoordinate.longitude}` : ''
  ].join('::');

  useEffect(() => {
    if (Platform.OS === 'web') return;
    setIsRoutePreviewMapReady(false);
  }, [routePreviewMapKey]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!routeMapModule || !isRoutePreviewMapReady) return;
    if (routePreviewPolylineCoordinates.length < 2) return;

    const animationFrame = requestAnimationFrame(() => {
      routePreviewMapRef.current?.fitToCoordinates?.(routePreviewPolylineCoordinates, {
        edgePadding: ROUTE_MAP_EDGE_PADDING,
        animated: false
      });
    });

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [isRoutePreviewMapReady, routePreviewMapKey, routePreviewPolylineCoordinates]);

  useEffect(() => {
    if (!isAndroidMarkerTextOverlayEnabled) {
      setRoutePreviewOverlayLabels([]);
      return;
    }
    if (!routeMapModule || !isRoutePreviewMapReady) return;
    if (routePreviewBaseCoordinates.length === 0 || routePreviewMapSize.width <= 0 || routePreviewMapSize.height <= 0) {
      setRoutePreviewOverlayLabels([]);
      return;
    }

    let isCanceled = false;
    const timeoutId = setTimeout(() => {
      const mapRef = routePreviewMapRef.current;
      if (!mapRef?.pointForCoordinate) return;

      void (async () => {
        try {
          const positionedLabels = await Promise.all(
            routePreviewBaseCoordinates.map(async (coordinate, index) => {
              const projectedPoint = await mapRef.pointForCoordinate?.(coordinate);
              if (!projectedPoint) return null;

              const label = routePreviewMarkerLabels[index] ?? `Stop ${index + 1}`;
              const color = routePreviewMarkerColors[index] ?? accent;
              const metrics = getRouteMarkerBubbleMetrics(label);
              const bubbleWidth = metrics.width;
              const bubbleHeight = 34;
              const left = Math.max(6, Math.min(routePreviewMapSize.width - bubbleWidth - 6, projectedPoint.x - bubbleWidth / 2));
              const top = Math.max(6, Math.min(routePreviewMapSize.height - bubbleHeight - 6, projectedPoint.y - 44));

              return {
                key: `${coordinate.latitude}-${coordinate.longitude}-${index}-${label}`,
                label,
                color,
                width: bubbleWidth,
                fontSize: metrics.fontSize,
                left,
                top
              };
            })
          );
          if (isCanceled) return;

          setRoutePreviewOverlayLabels(positionedLabels.filter((item): item is NonNullable<typeof item> => item !== null));
        } catch {
          if (!isCanceled) {
            setRoutePreviewOverlayLabels([]);
          }
        }
      })();
    }, 210);

    return () => {
      isCanceled = true;
      clearTimeout(timeoutId);
    };
  }, [
    accent,
    isRoutePreviewMapReady,
    routePreviewMapKey,
    routePreviewMapSize.height,
    routePreviewMapSize.width,
    routePreviewMarkerColorKey,
    routePreviewMarkerLabelKey,
  ]);

  const routeCoordinatePointCount = (rideStartPoint ? 1 : 0) + routeIntermediatePoints.length + (rideEndPoint ? 1 : 0);
  const hasEnoughRouteCoordinatePoints = routeCoordinatePointCount >= 2;
  const hasStartEndLabels = rideStartsAt.trim().length > 0 && rideEndsAt.trim().length > 0;
  const routeEstimateHintText = !hasStartEndLabels
    ? 'Select ride start and end to get ETA, distance, and toll estimate.'
    : hasEnoughRouteCoordinatePoints
      ? 'Unable to fetch live map estimate right now. Route points are ready, so retry in a moment.'
      : 'Set start/end points on map for a reliable estimate when live map lookup is unavailable.';
  const routeEstimateMeta = routeEstimate?.source === 'google' ? 'Live map estimate' : routeEstimate?.source === 'fallback' ? 'Map-point estimate' : null;
  const routePreviewDirectionsUrl =
    buildGoogleDirectionsUrlFromRoute({
      startLabel: rideStartsAt.trim(),
      endLabel: rideEndsAt.trim(),
      startPoint: rideStartPoint,
      endPoint: rideEndPoint,
      intermediatePoints: routeIntermediatePoints
    }) ?? buildGoogleDirectionsUrl(routePreviewBaseCoordinates);
  const numericPrice = Number(pricePerPerson);
  const numericSplitTotal = Number(splitTotalAmount);
  const resolvedUpiPaymentLink = resolveUpiDestination(upiPaymentInput);
  const isPaidRide = costOption !== 'Free';
  const hasPaidPrice = costOption !== 'Paid' || (Number.isFinite(numericPrice) && numericPrice > 0);
  const hasSplitPrice = costOption !== 'Split' || (Number.isFinite(numericSplitTotal) && numericSplitTotal > 0);
  const hasUpiDestination = !isPaidRide || resolvedUpiPaymentLink !== null;
  const isUpiDestinationInvalid = upiPaymentInput.trim().length > 0 && resolvedUpiPaymentLink === null;
  const hasStartDate = startDate.trim().length > 0;
  const hasReturnDate = dayMode === 'single' || returnDate.trim().length > 0;
  const isReturnDateBeforeStart =
    dayMode === 'multi' &&
    startDateValue !== null &&
    returnDateValue !== null &&
    toStartOfDayEpoch(returnDateValue) < toStartOfDayEpoch(startDateValue);

  const canSubmit =
    primaryDestination.trim().length > 0 &&
    rideName.trim().length > 0 &&
    hasStartDate &&
    hasReturnDate &&
    !isReturnDateBeforeStart &&
    rideStartsAt.trim().length > 0 &&
    ridingTo.trim().length > 0 &&
    rideEndsAt.trim().length > 0 &&
    assemblyTime.trim().length > 0 &&
    flagOffTime.trim().length > 0 &&
    hasPaidPrice &&
    hasSplitPrice &&
    hasUpiDestination &&
    (!hasRiderLimit || Number(maxParticipants) >= 2);

  const submit = () => {
    if (!canSubmit) return;

    const resolvedRideType: RideType = dayMode === 'multi' ? 'Long Tour' : 'Sunday Morning';
    const resolvedVisibility: RideVisibility[] = isPrivateRide ? ['Friends'] : ['City'];
    const resolvedStartDate = startDate.trim();
    const resolvedReturnDate = dayMode === 'multi' ? returnDate.trim() || undefined : undefined;
    const resolvedDateLabel =
      dayMode === 'multi' && resolvedReturnDate ? `${resolvedStartDate} -> ${resolvedReturnDate}` : resolvedStartDate;
    const baseRoute = routeSummary || summaryDestination;
    const mappedRoutePoints: MapPoint[] = [
      ...(rideStartPoint ? [{ ...rideStartPoint, label: 'Ride starts' }] : []),
      ...routeIntermediatePoints,
      ...(rideEndPoint ? [{ ...rideEndPoint, label: 'Ride ends' }] : [])
    ];
    const finalRoutePoints = mappedRoutePoints.length > 0 ? mappedRoutePoints : routeIntermediatePoints;
    const finalRoute = finalRoutePoints.length > 0 ? buildRouteTextFromPoints(finalRoutePoints) : baseRoute;

    onSubmit({
      title: rideName.trim(),
      type: resolvedRideType,
      route: finalRoute,
      routePoints: finalRoutePoints,
      date: resolvedDateLabel,
      startDate: resolvedStartDate,
      returnDate: resolvedReturnDate,
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
      routeDistanceKm: routeEstimate ? clampPositiveNumber(routeEstimate.distanceKm) : undefined,
      routeEtaMinutes: routeEstimate ? clampPositiveNumber(routeEstimate.etaMinutes) : undefined,
      tollEstimateInr: routeEstimate ? Math.max(0, Math.round(routeEstimate.tollEstimateInr)) : undefined,
      costType: costOption,
      pricePerPerson: costOption === 'Paid' && Number.isFinite(numericPrice) ? numericPrice : undefined,
      splitTotalAmount: costOption === 'Split' && Number.isFinite(numericSplitTotal) ? numericSplitTotal : undefined,
      paymentMethod: isPaidRide ? 'UPI_LINK' : undefined,
      upiPaymentLink: isPaidRide ? resolvedUpiPaymentLink ?? undefined : undefined,
      inclusions: costOption === 'Paid' ? inclusions : [],
      rideNote: rideNote.trim(),
      inviteAudience,
      isPrivate: isPrivateRide,
      joinPermission: rideJoinPermission,
      destinationPhotoRef: destinationPhotoRef ?? undefined,
      groupId: groupId || undefined,
      groupName: groupId ? availableUserGroups.find((sq) => sq.id === groupId)?.name : undefined,
      groupAvatar: groupId ? availableUserGroups.find((sq) => sq.id === groupId)?.avatar : undefined
    });

    resetForm();
  };

  const handleRoutePreviewMapPress = () => {
    promptOpenRouteInGoogleMaps(routePreviewDirectionsUrl);
  };

  const handleDestinationSelected = (value: string, point: MapPoint | null = null) => {
    const destination = value.trim();
    if (!destination) return;
    const parsedPoint = parseCoordinateLabelPoint(destination);
    setPrimaryDestination(destination);
    setRidingTo(destination);
    setDestinationPoint(
      point
        ? {
          ...point,
          label: destination
        }
        : parsedPoint
          ? {
            ...parsedPoint,
            label: destination
          }
          : null
    );
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

  const handleApplyPrimaryDestination = (value: string, photoRef?: string | null, point?: MapPoint | null) => {
    const normalized = value.trim();
    if (!normalized) return;

    setPrimaryDestination(normalized);
    if (photoRef) {
      setDestinationPhotoRef(photoRef);
    } else {
      setDestinationPhotoRef(null);
    }
    setDestinationQuery(normalized);
    saveDestination(normalized);
    setIsDestinationPickerOpen(false);
    handleDestinationSelected(normalized, point ?? null);
  };

  const getLocationValueByContext = (context: LocationPickerContext): string => {
    if (context === 'rideStarts') return rideStartsAt;
    if (context === 'rideEnds') return rideEndsAt;
    const stopIndex = getStopIndexFromContext(context);
    if (stopIndex !== null) {
      return routePoints[stopIndex]?.label?.trim() ?? '';
    }
    return primaryDestination;
  };

  const getPointByContext = (context: LocationPickerContext): MapPoint | null => {
    if (context === 'rideStarts') return rideStartPoint;
    if (context === 'rideEnds') return rideEndPoint;
    const stopIndex = getStopIndexFromContext(context);
    if (stopIndex !== null) {
      return routePoints[stopIndex] ?? null;
    }
    return null;
  };

  const fetchGooglePlacePoint = async (placeId: string): Promise<MapPoint | null> => {
    if (!hasGooglePlacesKey) return null;

    try {
      const params = new URLSearchParams({
        place_id: placeId,
        fields: 'formatted_address,name,geometry/location,photos',
        language: 'en',
        key: GOOGLE_PLACES_KEY
      });

      const response = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`);
      if (!response.ok) return null;

      const payload = (await response.json()) as GooglePlaceDetailsResponse;
      if (payload.status !== 'OK') return null;

      const lat = payload.result?.geometry?.location?.lat;
      const lng = payload.result?.geometry?.location?.lng;
      if (!isFiniteNumber(lat ?? NaN) || !isFiniteNumber(lng ?? NaN)) return null;

      const label = payload.result?.formatted_address?.trim() || payload.result?.name?.trim();
      const photoRef = payload.result?.photos?.[0]?.photo_reference;

      return {
        lat: lat as number,
        lng: lng as number,
        label,
        ...(photoRef ? { photoRef } : {})
      };
    } catch {
      return null;
    }
  };

  const applyLocationByContext = (value: string, context: LocationPickerContext, point: MapPoint | null = null) => {
    const normalized = value.trim();
    if (!normalized) return;
    const parsedCoordinatePoint = parseCoordinateLabelPoint(normalized);
    const resolvedPoint = point ?? parsedCoordinatePoint;

    if (context === 'primaryDestination') {
      handleApplyPrimaryDestination(normalized, resolvedPoint?.photoRef, resolvedPoint);
      return;
    }

    const stopIndex = getStopIndexFromContext(context);
    if (stopIndex !== null) {
      if (!resolvedPoint) return;

      const isInsert = context.startsWith('insertStop:');
      if (isInsert) {
        setDestinationIndex((prev) => prev + 1);
      }

      setRoutePoints((prev) => {
        const nextPoint: MapPoint = {
          ...resolvedPoint,
          label: normalized
        };
        const nextStops = [...prev];
        if (isInsert) {
          nextStops.splice(stopIndex, 0, nextPoint);
        } else if (stopIndex >= 0 && stopIndex < nextStops.length) {
          nextStops[stopIndex] = nextPoint;
        } else {
          nextStops.push(nextPoint);
        }
        return normalizeRouteStopLabels(nextStops);
      });
      setDestinationQuery(normalized);
      saveDestination(normalized);
      setIsDestinationPickerOpen(false);
      return;
    }

    if (context === 'rideStarts') {
      setRideStartsAt(normalized);
      setRideStartPoint(resolvedPoint ? { ...resolvedPoint, label: 'Ride starts' } : null);
    } else {
      setRideEndsAt(normalized);
      setRideEndPoint(resolvedPoint ? { ...resolvedPoint, label: 'Ride ends' } : null);
    }

    setDestinationQuery(normalized);
    saveDestination(normalized);
    setIsDestinationPickerOpen(false);
  };

  const handleApplyLocationSelection = async (value: string, context: LocationPickerContext) => {
    const normalized = value.trim();
    if (!normalized) return;
    const parsedCoordinatePoint = parseCoordinateLabelPoint(normalized);
    const resolvedPoint = parsedCoordinatePoint ?? (await fetchGoogleFindPlacePoint(normalized, GOOGLE_PLACES_KEY));
    const stopIndex = getStopIndexFromContext(context);
    if (stopIndex !== null) {
      if (!resolvedPoint) {
        Alert.alert('Select a valid stop', 'Choose a suggested location or enter coordinates like 28.6139, 77.2090.');
        return;
      }
      applyLocationByContext(normalized, context, resolvedPoint);
      return;
    }

    applyLocationByContext(normalized, context, resolvedPoint);
  };

  const handleApplyGoogleSuggestion = async (suggestion: GooglePlaceSuggestion, context: LocationPickerContext) => {
    const point = await fetchGooglePlacePoint(suggestion.placeId);
    const resolvedLabel = point?.label?.trim() || suggestion.description;
    const fallbackPoint = point ?? (await fetchGoogleFindPlacePoint(resolvedLabel, GOOGLE_PLACES_KEY));
    applyLocationByContext(resolvedLabel, context, fallbackPoint);
  };

  const openRidePointPicker = (context: 'rideStarts' | 'rideEnds') => {
    setLocationPickerContext(context);
    setDraftRidePoint(getPointByContext(context));
    setMapPickerCanPan(false);
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

    const selectedPoint = { ...draftRidePoint };
    const fallbackLabel = `${selectedPoint.lat.toFixed(4)}, ${selectedPoint.lng.toFixed(4)}`;
    const isStartSelection = locationPickerContext === 'rideStarts';

    if (isStartSelection) {
      setRideStartPoint({ ...selectedPoint, label: 'Ride starts' });
      setRideStartsAt(fallbackLabel);
    } else if (locationPickerContext === 'rideEnds') {
      setRideEndPoint({ ...selectedPoint, label: 'Ride ends' });
      setRideEndsAt(fallbackLabel);
    }

    const requestRef = isStartSelection ? rideStartPointLabelRequestRef : rideEndPointLabelRequestRef;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    (async () => {
      const resolvedLabel = await resolvePointDisplayLabel(selectedPoint, GOOGLE_PLACES_KEY);
      if (requestId !== requestRef.current) return;
      const finalLabel = resolvedLabel?.trim() || fallbackLabel;
      if (isStartSelection) {
        setRideStartsAt(finalLabel);
      } else {
        setRideEndsAt(finalLabel);
      }
      saveDestination(finalLabel);
    })();

    setIsRidePointPickerOpen(false);
  };

  const openDestinationPicker = (context: LocationPickerContext = 'primaryDestination') => {
    setLocationPickerContext(context);
    setGoogleDestinationSuggestions([]);
    setGoogleDestinationError(null);
    setDestinationQuery(getLocationValueByContext(context));
    setIsDestinationPickerOpen(true);
  };

  const addLocationFromQuery = () => {
    void handleApplyLocationSelection(destinationQuery, locationPickerContext);
  };

  const openMapPickerFromDestination = () => {
    if (locationPickerContext !== 'rideStarts' && locationPickerContext !== 'rideEnds') return;
    setIsDestinationPickerOpen(false);
    openRidePointPicker(locationPickerContext);
  };

  const applyDateSelection = (selectedDate: Date) => {
    const normalizedDate = new Date(selectedDate);
    normalizedDate.setHours(0, 0, 0, 0);
    const formattedDate = formatRideDateLabel(normalizedDate);

    if (datePickerField === 'startDate') {
      setStartDateValue(normalizedDate);
      setStartDate(formattedDate);
      if (
        dayMode === 'multi' &&
        returnDateValue !== null &&
        toStartOfDayEpoch(returnDateValue) < toStartOfDayEpoch(normalizedDate)
      ) {
        setReturnDate('');
        setReturnDateValue(null);
      }
      return;
    }

    setReturnDateValue(normalizedDate);
    setReturnDate(formattedDate);
  };

  const applyTimeSelection = (selectedDate: Date) => {
    const normalizedTime = new Date(selectedDate);
    normalizedTime.setSeconds(0, 0);
    const formattedTime = formatRideTimeLabel(normalizedTime);

    if (timePickerField === 'assembly') {
      setAssemblyTimeValue(normalizedTime);
      setAssemblyTime(formattedTime);
      return;
    }

    setFlagOffTimeValue(normalizedTime);
    setFlagOffTime(formattedTime);
  };

  const openDatePicker = (field: DatePickerField) => {
    const referenceDate = field === 'startDate' ? startDateValue : returnDateValue;
    const minimumDateForField = field === 'returnDate' && startDateValue ? startDateValue : minimumRideDate;
    setDatePickerField(field);
    setPickerDraftValue(referenceDate ?? minimumDateForField);
    setIsDatePickerOpen(true);
  };

  const openTimePicker = (field: TimePickerField) => {
    const referenceTime = field === 'assembly' ? assemblyTimeValue : flagOffTimeValue;
    const fallbackTime = new Date();
    fallbackTime.setSeconds(0, 0);

    setTimePickerField(field);
    setPickerDraftValue(referenceTime ?? fallbackTime);
    setIsTimePickerOpen(true);
  };

  const handleIOSPickerValueChange = (_event: DateTimePickerEvent, selectedValue?: Date) => {
    if (!selectedValue) return;
    setPickerDraftValue(selectedValue);
  };

  const closeIOSNativePicker = () => {
    setIsDatePickerOpen(false);
    setIsTimePickerOpen(false);
  };

  const applyIOSNativePicker = () => {
    if (isDatePickerOpen) {
      applyDateSelection(pickerDraftValue);
    } else if (isTimePickerOpen) {
      applyTimeSelection(pickerDraftValue);
    }
    closeIOSNativePicker();
  };

  const handleAndroidDatePickerChange = (event: DateTimePickerEvent, selectedValue?: Date) => {
    setIsDatePickerOpen(false);
    if (event.type !== 'set' || !selectedValue) return;
    applyDateSelection(selectedValue);
  };

  const handleAndroidTimePickerChange = (event: DateTimePickerEvent, selectedValue?: Date) => {
    setIsTimePickerOpen(false);
    if (event.type !== 'set' || !selectedValue) return;
    applyTimeSelection(selectedValue);
  };

  const isIOSNativePickerVisible = Platform.OS === 'ios' && (isDatePickerOpen || isTimePickerOpen);
  const datePickerMinimumDate = datePickerField === 'returnDate' && startDateValue ? startDateValue : minimumRideDate;
  const iosNativePickerTitle = isDatePickerOpen
    ? datePickerField === 'returnDate'
      ? 'Select Return Date'
      : 'Select Start Date'
    : timePickerField === 'assembly'
      ? 'Select Assembly Time'
      : 'Select Flag Off Time';

  const activeStopIndex = getStopIndexFromContext(locationPickerContext);
  const destinationPlaceholder =
    locationPickerContext === 'primaryDestination'
      ? 'Primary Destination'
      : locationPickerContext === 'rideStarts'
        ? 'Ride starts'
        : locationPickerContext === 'rideEnds'
          ? 'Ride ends'
          : `Stop ${activeStopIndex !== null ? activeStopIndex + 1 : ''}`.trim();
  const destinationQueryValue = destinationQuery.trim();
  const shouldSearchGoogleSuggestions = destinationQueryValue.length >= PLACE_AUTOCOMPLETE_MIN_QUERY_LENGTH;
  const showMapPickerAction = locationPickerContext === 'rideStarts' || locationPickerContext === 'rideEnds';

  const buildRoutePointSnapshotKey = (points: MapPoint[]): string =>
    points
      .map((point) => `${point.lat.toFixed(6)}:${point.lng.toFixed(6)}:${(point.label ?? '').trim().toLowerCase()}`)
      .join('|');

  const resolveStopPickerSeedPoint = async (
    label: string,
    explicitPoint: MapPoint | null,
    fallbackLabel: string
  ): Promise<MapPoint | null> => {
    if (explicitPoint) {
      return {
        ...explicitPoint,
        label: explicitPoint.label?.trim() || fallbackLabel
      };
    }

    const normalizedLabel = label.trim();
    if (!normalizedLabel) return null;

    const parsedCoordinatePoint = parseCoordinateLabelPoint(normalizedLabel);
    if (parsedCoordinatePoint) {
      return {
        ...parsedCoordinatePoint,
        label: fallbackLabel
      };
    }

    const resolvedFromGoogle = await fetchGoogleFindPlacePoint(normalizedLabel, GOOGLE_PLACES_KEY);
    if (!resolvedFromGoogle) return null;

    return {
      ...resolvedFromGoogle,
      label: fallbackLabel
    };
  };

  const handleOpenStopPicker = () => {
    const immediateSeedPoints =
      routePreviewPoints.length > 0
        ? routePreviewPoints.map((point) => ({ ...point }))
        : routePoints.map((point, index) => ({
          ...point,
          label: point.label?.trim() || `Stop ${index + 1}`
        }));

    const immediateSeedKey = buildRoutePointSnapshotKey(immediateSeedPoints);
    setDraftRoutePoints(immediateSeedPoints);
    setMapPickerCanPan(false);
    setIsStopPickerOpen(true);

    const destinationLabel = ridingTo.trim() || primaryDestination.trim();
    const shouldResolveSeedPoints = Boolean(rideStartsAt.trim() || destinationLabel || rideEndsAt.trim());
    if (!shouldResolveSeedPoints) return;

    const requestId = stopPickerSeedRequestRef.current + 1;
    stopPickerSeedRequestRef.current = requestId;

    (async () => {
      const [resolvedStartPoint, resolvedDestinationPoint, resolvedEndPoint] = await Promise.all([
        resolveStopPickerSeedPoint(rideStartsAt, rideStartPoint, 'Ride starts'),
        routePoints.length > 0 || !destinationLabel
          ? Promise.resolve<MapPoint | null>(null)
          : resolveStopPickerSeedPoint(destinationLabel, null, destinationLabel),
        resolveStopPickerSeedPoint(rideEndsAt, rideEndPoint, 'Ride ends')
      ]);

      if (requestId !== stopPickerSeedRequestRef.current) return;

      const nextMiddlePoints =
        routePoints.length > 0
          ? routePoints.map((point, index) => ({
            ...point,
            label: point.label?.trim() || `Stop ${index + 1}`
          }))
          : resolvedDestinationPoint
            ? [resolvedDestinationPoint]
            : [];

      const seededPoints = dedupeRoutePointsByCoordinate([
        ...(resolvedStartPoint ? [resolvedStartPoint] : []),
        ...nextMiddlePoints,
        ...(resolvedEndPoint ? [resolvedEndPoint] : [])
      ]);

      if (seededPoints.length === 0) return;

      setDraftRoutePoints((prev) => {
        if (buildRoutePointSnapshotKey(prev) !== immediateSeedKey) {
          return prev;
        }
        return seededPoints;
      });
    })();
  };

  const handleAddStopFromMap = (event: RoutePressEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    setDraftRoutePoints((prev) => {
      const stopCount = prev.filter((point) => !isRideStartLabel(point.label) && !isRideEndLabel(point.label)).length;
      const nextStop: MapPoint = {
        lat: latitude,
        lng: longitude,
        label: `Stop ${stopCount + 1}`
      };

      if (prev.length > 0 && isRideEndLabel(prev[prev.length - 1]?.label)) {
        return [...prev.slice(0, -1), nextStop, prev[prev.length - 1]];
      }

      return [...prev, nextStop];
    });
  };

  const handleUndoStop = () => {
    setDraftRoutePoints((prev) => {
      if (prev.length === 0) return prev;

      const hasStartAnchor = isRideStartLabel(prev[0]?.label);
      const hasEndAnchor = isRideEndLabel(prev[prev.length - 1]?.label);
      const startOffset = hasStartAnchor ? 1 : 0;
      const endOffset = hasEndAnchor ? 1 : 0;
      const editableCount = prev.length - startOffset - endOffset;
      if (editableCount <= 0) return prev;

      const reducedMiddle = prev.slice(startOffset, prev.length - endOffset).slice(0, -1);
      return [
        ...(hasStartAnchor ? [prev[0]] : []),
        ...reducedMiddle,
        ...(hasEndAnchor ? [prev[prev.length - 1]] : [])
      ];
    });
  };

  const handleClearStops = () => {
    setDraftRoutePoints((prev) => {
      if (prev.length === 0) return prev;

      const first = prev[0];
      const last = prev[prev.length - 1];
      const anchoredPoints: MapPoint[] = [];

      if (first && isRideStartLabel(first.label)) {
        anchoredPoints.push(first);
      }

      if (last && isRideEndLabel(last.label)) {
        const alreadyIncluded = anchoredPoints.some((point) => areRoutePointsAtSameCoordinate(point, last));
        if (!alreadyIncluded) {
          anchoredPoints.push(last);
        }
      }

      return anchoredPoints;
    });
  };

  const handleApplyStops = () => {
    const normalizedPoints = draftRoutePoints.map((point, index) => ({
      ...point,
      label: point.label?.trim() || `Stop ${index + 1}`
    }));

    const { startPoint, endPoint, stopPoints } = splitRoutePointRoles(normalizedPoints);
    const normalizedStopPoints = stopPoints.map((point, index) => ({
      ...point,
      label: point.label?.trim() || `Stop ${index + 1}`
    }));

    if (startPoint) {
      setRideStartPoint({ ...startPoint, label: 'Ride starts' });
    }
    if (endPoint) {
      setRideEndPoint({ ...endPoint, label: 'Ride ends' });
    }

    setRoutePoints(normalizedStopPoints);
    setIsStopPickerOpen(false);
  };

  const handleAddOutboundStop = () => {
    openDestinationPicker(`insertStop:${destinationIndex}`);
  };

  const handleAddReturnStop = () => {
    openDestinationPicker(`stop:${routePoints.length}`);
  };

  const handleEditRouteStop = (index: number) => {
    openDestinationPicker(`stop:${index}`);
  };

  const handleRemoveRouteStop = (index: number) => {
    setRoutePoints((prev) => normalizeRouteStopLabels(prev.filter((_item, itemIndex) => itemIndex !== index)));
    if (index < destinationIndex) {
      setDestinationIndex((prev) => prev - 1);
    }
  };

  const handleRidingToChange = (value: string) => {
    setRidingTo(value);
    setDestinationPoint(null);
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
              <View style={[styles.rowAligned, createRideWizardStyles.headerRowUp]}>
                <TouchableOpacity onPress={onClose} style={createRideWizardStyles.headerBackButton}>
                  <MaterialCommunityIcons name="arrow-left" size={30} color={t.text} />
                </TouchableOpacity>
                <Text style={[createRideWizardStyles.headerTitle, { color: t.text }]}>{isEditMode ? 'Edit Ride' : 'Create Ride'}</Text>
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
                  <Text style={[createRideWizardStyles.fieldLabel, { color: t.text }]}>{dayMode === 'multi' ? 'Start date*' : 'Date*'}</Text>
                  <TouchableOpacity
                    style={[createRideWizardStyles.filledInput, createRideWizardStyles.locationPickerInput, { backgroundColor: t.surface, borderColor: t.border }]}
                    onPress={() => openDatePicker('startDate')}
                    activeOpacity={0.85}
                  >
                    <Text style={[createRideWizardStyles.locationPickerInputText, { color: startDate ? t.text : `${t.muted}99` }]}>
                      {startDate || 'Wed | Mar 4'}
                    </Text>
                    <MaterialCommunityIcons name="calendar-month-outline" size={18} color={t.muted} />
                  </TouchableOpacity>
                </View>

                {dayMode === 'multi' && (
                  <View style={createRideWizardStyles.fieldBlock}>
                    <Text style={[createRideWizardStyles.fieldLabel, { color: t.text }]}>Return date*</Text>
                    <TouchableOpacity
                      style={[createRideWizardStyles.filledInput, createRideWizardStyles.locationPickerInput, { backgroundColor: t.surface, borderColor: t.border }]}
                      onPress={() => openDatePicker('returnDate')}
                      activeOpacity={0.85}
                    >
                      <Text style={[createRideWizardStyles.locationPickerInputText, { color: returnDate ? t.text : `${t.muted}99` }]}>
                        {returnDate || 'Sun | Mar 8'}
                      </Text>
                      <MaterialCommunityIcons name="calendar-month-outline" size={18} color={t.muted} />
                    </TouchableOpacity>
                    {isReturnDateBeforeStart && (
                      <Text style={[styles.metaText, { color: TOKENS[theme].red }]}>Return date must be on or after start date.</Text>
                    )}
                  </View>
                )}

                <View style={[createRideWizardStyles.timelineWrap]}>
                  {/* Start Point */}
                  <View style={createRideWizardStyles.timelineRow}>
                    <View style={createRideWizardStyles.timelineLeftCol}>
                      <View style={[createRideWizardStyles.timelineNode, { borderColor: t.text }]} />
                      <View style={[createRideWizardStyles.timelineLine, { backgroundColor: t.border }]} />
                    </View>
                    <View style={createRideWizardStyles.timelineContent}>
                      <Text style={[createRideWizardStyles.fieldLabel, { color: t.text, marginBottom: 6 }]}>Ride starts</Text>
                      <TouchableOpacity
                        style={[createRideWizardStyles.filledInput, createRideWizardStyles.locationPickerInput, { backgroundColor: t.surface, borderColor: t.border }]}
                        onPress={() => openDestinationPicker('rideStarts')}
                      >
                        <Text style={[createRideWizardStyles.locationPickerInputText, { color: rideStartsAt ? t.text : `${t.muted}99` }]}>
                          {rideStartsAt || 'Search location'}
                        </Text>
                        <MaterialCommunityIcons name="map-marker-outline" size={18} color={t.muted} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Intermediate Route Points (Outbound) */}
                  {routePoints.slice(0, destinationIndex).map((point, i) => (
                    <View key={`${point.lat}-${point.lng}-out-${i}`} style={createRideWizardStyles.timelineRow}>
                      <View style={createRideWizardStyles.timelineLeftCol}>
                        <View style={[createRideWizardStyles.timelineNode, { borderColor: accent }]}>
                          <Text style={[createRideWizardStyles.timelineNodeText, { color: accent }]}>
                            {String.fromCharCode(65 + i)}
                          </Text>
                        </View>
                        <View style={[createRideWizardStyles.timelineLine, { backgroundColor: t.border }]} />
                      </View>
                      <View style={createRideWizardStyles.timelineContent}>
                        <View style={createRideWizardStyles.stopInputRow}>
                          <TouchableOpacity
                            style={[
                              createRideWizardStyles.filledInput,
                              createRideWizardStyles.locationPickerInput,
                              createRideWizardStyles.stopInputField,
                              { backgroundColor: t.surface, borderColor: t.border }
                            ]}
                            onPress={() => handleEditRouteStop(i)}
                          >
                            <Text style={[createRideWizardStyles.locationPickerInputText, { color: point.label?.trim() ? t.text : `${t.muted}99` }]}>
                              {point.label?.trim() || `Stop ${i + 1}`}
                            </Text>
                            <MaterialCommunityIcons name="map-marker-path" size={18} color={t.muted} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}
                            onPress={() => handleRemoveRouteStop(i)}
                          >
                            <MaterialCommunityIcons name="close" size={16} color={TOKENS[theme].red} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ))}

                  {/* Add Outbound Stop Button */}
                  {routePoints.length < 5 && (
                    <View style={createRideWizardStyles.timelineRow}>
                      <View style={createRideWizardStyles.timelineLeftCol}>
                        <View style={[createRideWizardStyles.timelineNode, { borderColor: t.muted, borderStyle: 'dashed' }]}>
                          <MaterialCommunityIcons name="plus" size={14} color={t.muted} />
                        </View>
                        <View style={[createRideWizardStyles.timelineLine, { backgroundColor: t.border }]} />
                      </View>
                      <View style={createRideWizardStyles.timelineContent}>
                        <TouchableOpacity
                          style={createRideWizardStyles.addStopButtonTimeline}
                          onPress={handleAddOutboundStop}
                        >
                          <Text style={[createRideWizardStyles.addStopButtonTextTimeline, { color: t.muted }]}>Add stop</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Riding To (Primary Destination) */}
                  <View style={createRideWizardStyles.timelineRow}>
                    <View style={createRideWizardStyles.timelineLeftCol}>
                      <View style={[createRideWizardStyles.timelineNode, { borderColor: accent }]}>
                        <Text style={[createRideWizardStyles.timelineNodeText, { color: accent }]}>
                          {String.fromCharCode(65 + destinationIndex)}
                        </Text>
                      </View>
                      <View style={[createRideWizardStyles.timelineLine, { backgroundColor: t.border }]} />
                    </View>
                    <View style={createRideWizardStyles.timelineContent}>
                      <Text style={[createRideWizardStyles.fieldLabel, { color: t.text, marginBottom: 6 }]}>Riding to</Text>
                      <TextInput
                        style={[createRideWizardStyles.filledInput, { backgroundColor: t.surface, borderColor: t.border, color: t.text }]}
                        value={ridingTo}
                        onChangeText={handleRidingToChange}
                        placeholder="Search location"
                        placeholderTextColor={`${t.muted}99`}
                      />
                    </View>
                  </View>

                  {/* Intermediate Route Points (Return) */}
                  {routePoints.slice(destinationIndex).map((point, index) => {
                    const absIndex = destinationIndex + index;
                    return (
                      <View key={`${point.lat}-${point.lng}-ret-${absIndex}`} style={createRideWizardStyles.timelineRow}>
                        <View style={createRideWizardStyles.timelineLeftCol}>
                          <View style={[createRideWizardStyles.timelineNode, { borderColor: accent }]}>
                            <Text style={[createRideWizardStyles.timelineNodeText, { color: accent }]}>
                              {String.fromCharCode(65 + absIndex + 1)}
                            </Text>
                          </View>
                          <View style={[createRideWizardStyles.timelineLine, { backgroundColor: t.border }]} />
                        </View>
                        <View style={createRideWizardStyles.timelineContent}>
                          <View style={createRideWizardStyles.stopInputRow}>
                            <TouchableOpacity
                              style={[
                                createRideWizardStyles.filledInput,
                                createRideWizardStyles.locationPickerInput,
                                createRideWizardStyles.stopInputField,
                                { backgroundColor: t.surface, borderColor: t.border }
                              ]}
                              onPress={() => handleEditRouteStop(absIndex)}
                            >
                              <Text style={[createRideWizardStyles.locationPickerInputText, { color: point.label?.trim() ? t.text : `${t.muted}99` }]}>
                                {point.label?.trim() || `Stop ${absIndex + 1}`}
                              </Text>
                              <MaterialCommunityIcons name="map-marker-path" size={18} color={t.muted} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}
                              onPress={() => handleRemoveRouteStop(absIndex)}
                            >
                              <MaterialCommunityIcons name="close" size={16} color={TOKENS[theme].red} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    );
                  })}

                  {/* Add Return Stop Button */}
                  {routePoints.length < 5 && (
                    <View style={createRideWizardStyles.timelineRow}>
                      <View style={createRideWizardStyles.timelineLeftCol}>
                        <View style={[createRideWizardStyles.timelineNode, { borderColor: t.muted, borderStyle: 'dashed' }]}>
                          <MaterialCommunityIcons name="plus" size={14} color={t.muted} />
                        </View>
                        <View style={[createRideWizardStyles.timelineLine, { backgroundColor: t.border }]} />
                      </View>
                      <View style={createRideWizardStyles.timelineContent}>
                        <TouchableOpacity
                          style={createRideWizardStyles.addStopButtonTimeline}
                          onPress={handleAddReturnStop}
                        >
                          <Text style={[createRideWizardStyles.addStopButtonTextTimeline, { color: t.muted }]}>Add stop</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* End Point */}
                  <View style={createRideWizardStyles.timelineRow}>
                    <View style={createRideWizardStyles.timelineLeftCol}>
                      <View style={[createRideWizardStyles.timelineNode, { borderColor: t.text }]} />
                    </View>
                    <View style={createRideWizardStyles.timelineContent}>
                      <Text style={[createRideWizardStyles.fieldLabel, { color: t.text, marginBottom: 6 }]}>Ride ends</Text>
                      <TouchableOpacity
                        style={[createRideWizardStyles.filledInput, createRideWizardStyles.locationPickerInput, { backgroundColor: t.surface, borderColor: t.border }]}
                        onPress={() => openDestinationPicker('rideEnds')}
                      >
                        <Text style={[createRideWizardStyles.locationPickerInputText, { color: rideEndsAt ? t.text : `${t.muted}99` }]}>
                          {rideEndsAt || 'Search location'}
                        </Text>
                        <MaterialCommunityIcons name="map-marker-outline" size={18} color={t.muted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                 {routePreviewPoints.length > 0 && (
                  <View style={[styles.routeMapCard, { borderColor: t.border, backgroundColor: t.subtle }]}>
                    <View style={styles.rowBetween}>
                      <Text style={[styles.inputLabel, { color: t.muted, marginBottom: 0 }]}>Route Preview</Text>
                      <Text style={[styles.metaText, { color: t.muted }]}>
                        {routePreviewPathCoordinates ? 'Live road path' : 'Point path'} | {routePreviewPoints.length} point
                        {routePreviewPoints.length === 1 ? '' : 's'}
                      </Text>
                    </View>

                    {routeMapModule ? (
                      <View
                        style={[styles.routeMapFrame, { borderColor: t.border }]}
                        onLayout={(event: LayoutChangeEvent) => {
                          const { width, height } = event.nativeEvent.layout;
                          const roundedWidth = Math.round(width);
                          const roundedHeight = Math.round(height);
                          setRoutePreviewMapSize((previous) =>
                            previous.width === roundedWidth && previous.height === roundedHeight
                              ? previous
                              : { width: roundedWidth, height: roundedHeight }
                          );
                        }}
                      >
                        <routeMapModule.MapView
                          key={routePreviewMapKey}
                          ref={Platform.OS === 'web' ? undefined : routePreviewMapRef}
                          style={styles.routeMap}
                          initialRegion={routePreviewRegion}
                          scrollEnabled={false}
                          zoomEnabled={false}
                          rotateEnabled={false}
                          pitchEnabled={false}
                          toolbarEnabled={false}
                          onMapReady={() => setIsRoutePreviewMapReady(true)}
                          onPress={handleRoutePreviewMapPress}
                          mapPadding={ROUTE_MAP_PADDING}
                        >
                          {routePreviewPolylineCoordinates.length > 1 && (
                            <routeMapModule.Polyline coordinates={routePreviewPolylineCoordinates} strokeWidth={4} strokeColor={accent} />
                          )}
                          {routePreviewBaseCoordinates.map((point, index) => {
                            const isStart = index === 0;
                            const isEnd = index === routePreviewBaseCoordinates.length - 1;
                            const labelText = routePreviewMarkerLabels[index] ?? `Stop ${index + 1}`;
                            const markerBubbleMetrics = getRouteMarkerBubbleMetrics(labelText);
                            const markerColor = isStart ? TOKENS[theme].green : isEnd ? TOKENS[theme].red : accent;

                            return (
                              <routeMapModule.Marker
                                key={`${point.latitude}-${point.longitude}-${index}-${labelText}`}
                                coordinate={point}
                                anchor={{ x: 0.5, y: 1 }}
                                tracksViewChanges={Platform.OS === 'android'}
                                onPress={handleRoutePreviewMapPress}
                              >
                                <View collapsable={false} style={{ alignItems: 'center' }}>
                                  {!isAndroidMarkerTextOverlayEnabled && (
                                    <View style={{ backgroundColor: markerColor, width: markerBubbleMetrics.width, minHeight: 34, paddingHorizontal: 10, justifyContent: 'center', paddingVertical: 7, borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 4 }}>
                                      <Text allowFontScaling={false} style={[styles.metaText, { width: '100%', color: '#fff', fontSize: markerBubbleMetrics.fontSize, lineHeight: markerBubbleMetrics.fontSize + 2, textAlign: 'center' }]}>
                                        {labelText}
                                      </Text>
                                    </View>
                                  )}
                                  {!isAndroidMarkerTextOverlayEnabled && (
                                    <View style={{ width: 0, height: 0, backgroundColor: 'transparent', borderStyle: 'solid', borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: markerColor }} />
                                  )}
                                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: markerColor, borderWidth: 2, borderColor: '#fff' }} />
                                </View>
                              </routeMapModule.Marker>
                            );
                          })}
                        </routeMapModule.MapView>
                        {isAndroidMarkerTextOverlayEnabled && routePreviewOverlayLabels.length > 0 && (
                          <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
                            {routePreviewOverlayLabels.map((overlayItem) => (
                              <View
                                key={overlayItem.key}
                                style={{
                                  position: 'absolute',
                                  left: overlayItem.left,
                                  top: overlayItem.top,
                                  backgroundColor: overlayItem.color,
                                  width: overlayItem.width,
                                  minHeight: 34,
                                  paddingHorizontal: 10,
                                  justifyContent: 'center',
                                  paddingVertical: 7,
                                  borderRadius: 8,
                                  shadowColor: '#000',
                                  shadowOffset: { width: 0, height: 2 },
                                  shadowOpacity: 0.2,
                                  shadowRadius: 3,
                                  elevation: 4
                                }}
                              >
                                <Text
                                  allowFontScaling={false}
                                  style={[
                                    styles.metaText,
                                    {
                                      width: '100%',
                                      color: '#fff',
                                      fontSize: overlayItem.fontSize,
                                      lineHeight: overlayItem.fontSize + 2,
                                      textAlign: 'center'
                                    }
                                  ]}
                                >
                                  {overlayItem.label}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    ) : (
                      <View style={[styles.mapUnavailable, { borderColor: t.border, backgroundColor: t.surface }]}>
                        <MaterialCommunityIcons name="map-search-outline" size={18} color={accent} />
                        <Text style={[styles.metaText, { color: t.muted }]}>Install `react-native-maps` to preview the selected route.</Text>
                      </View>
                    )}

                  </View>
                )}

                <View style={[createRideWizardStyles.routeEstimateCard, { borderColor: t.border, backgroundColor: t.subtle }]}>
                  <View style={createRideWizardStyles.routeEstimateHeader}>
                    <View style={styles.rowAligned}>
                      <MaterialCommunityIcons name="map-clock-outline" size={16} color={accent} />
                      <Text style={[createRideWizardStyles.routeEstimateTitle, { color: t.text }]}>Route estimate</Text>
                    </View>
                    {isRouteEstimateLoading ? <ActivityIndicator size="small" color={accent} /> : null}
                  </View>

                  {routeEstimate ? (
                    <View style={createRideWizardStyles.routeEstimateChipRow}>
                      <View style={[createRideWizardStyles.routeEstimateChip, { borderColor: t.border, backgroundColor: t.surface }]}>
                        <Text style={[createRideWizardStyles.routeEstimateChipLabel, { color: t.muted }]}>ETA</Text>
                        <Text style={[createRideWizardStyles.routeEstimateChipValue, { color: t.text }]}>
                          {formatRideEta(routeEstimate.etaMinutes)}
                        </Text>
                      </View>
                      <View style={[createRideWizardStyles.routeEstimateChip, { borderColor: t.border, backgroundColor: t.surface }]}>
                        <Text style={[createRideWizardStyles.routeEstimateChipLabel, { color: t.muted }]}>Distance</Text>
                        <Text style={[createRideWizardStyles.routeEstimateChipValue, { color: t.text }]}>
                          {formatRideDistance(routeEstimate.distanceKm)}
                        </Text>
                      </View>
                      <View style={[createRideWizardStyles.routeEstimateChip, { borderColor: t.border, backgroundColor: t.surface }]}>
                        <Text style={[createRideWizardStyles.routeEstimateChipLabel, { color: t.muted }]}>Toll</Text>
                        <Text style={[createRideWizardStyles.routeEstimateChipValue, { color: t.text }]}>
                          {formatInrAmount(routeEstimate.tollEstimateInr)}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={[createRideWizardStyles.routeEstimateHint, { color: t.muted }]}>
                      {routeEstimateHintText}
                    </Text>
                  )}

                  {!!routeEstimateMeta && !routeEstimateError && (
                    <Text style={[createRideWizardStyles.routeEstimateMeta, { color: t.muted }]}>{routeEstimateMeta}</Text>
                  )}
                  {!!routeEstimateError && <Text style={[createRideWizardStyles.routeEstimateError, { color: TOKENS[theme].red }]}>{routeEstimateError}</Text>}
                </View>

                <View style={createRideWizardStyles.timelineGrid}>
                  <TouchableOpacity
                    style={[createRideWizardStyles.timeTileInput, createRideWizardStyles.timeTileButton, { backgroundColor: t.surface }]}
                    onPress={() => openTimePicker('assembly')}
                    activeOpacity={0.85}
                  >
                    <Text style={[createRideWizardStyles.timeTileText, { color: assemblyTime ? t.text : `${t.muted}99` }]}>
                      {assemblyTime || 'Assembly*'}
                    </Text>
                    <MaterialCommunityIcons name="clock-time-four-outline" size={16} color={t.muted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[createRideWizardStyles.timeTileInput, createRideWizardStyles.timeTileButton, { backgroundColor: t.surface }]}
                    onPress={() => openTimePicker('flagOff')}
                    activeOpacity={0.85}
                  >
                    <Text style={[createRideWizardStyles.timeTileText, { color: flagOffTime ? t.text : `${t.muted}99` }]}>
                      {flagOffTime || 'Flag off*'}
                    </Text>
                    <MaterialCommunityIcons name="clock-time-four-outline" size={16} color={t.muted} />
                  </TouchableOpacity>
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
                    <Text style={[createRideWizardStyles.fieldLabel, { color: t.text }]}>How much per rider:</Text>
                    <TextInput
                      style={[createRideWizardStyles.lineInput, { borderBottomColor: t.muted, color: t.text }]}
                      value={pricePerPerson}
                      onChangeText={(value) => setPricePerPerson(sanitizeCurrencyInput(value))}
                      placeholder="Enter amount in INR"
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

                {costOption === 'Split' && (
                  <View style={createRideWizardStyles.fieldBlock}>
                    <Text style={[createRideWizardStyles.fieldLabel, { color: t.text }]}>Total amount to split:</Text>
                    <TextInput
                      style={[createRideWizardStyles.lineInput, { borderBottomColor: t.muted, color: t.text }]}
                      value={splitTotalAmount}
                      onChangeText={(value) => setSplitTotalAmount(sanitizeCurrencyInput(value))}
                      placeholder="Enter total shared amount"
                      placeholderTextColor={`${t.muted}99`}
                      keyboardType="number-pad"
                    />
                    <Text style={[styles.metaText, { color: t.muted }]}>
                      Amount will be split evenly across joined riders.
                    </Text>
                  </View>
                )}

                {costOption !== 'Free' && (
                  <View style={createRideWizardStyles.fieldBlock}>
                    <Text style={[createRideWizardStyles.fieldLabel, { color: t.text }]}>UPI ID or UPI payment link*</Text>
                    <TextInput
                      style={[createRideWizardStyles.lineInput, { borderBottomColor: t.muted, color: t.text }]}
                      value={upiPaymentInput}
                      onChangeText={setUpiPaymentInput}
                      placeholder="e.g. rider@upi or upi://pay?pa=..."
                      placeholderTextColor={`${t.muted}99`}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Text style={[styles.metaText, { color: t.muted }]}>
                      Riders can open this link in-app to pay and mark payment complete.
                    </Text>
                    {isUpiDestinationInvalid && (
                      <Text style={[styles.metaText, { color: TOKENS[theme].red }]}>
                        Enter a valid UPI ID (`name@bank`) or UPI payment URL.
                      </Text>
                    )}
                  </View>
                )}

                <View style={createRideWizardStyles.fieldBlock}>
                  <Text style={[createRideWizardStyles.fieldLabel, { color: t.text }]}>Ride Note</Text>
                  <View style={createRideWizardStyles.rideNoteInputWrap}>
                    <TextInput
                      ref={rideNoteInputRef}
                      style={[createRideWizardStyles.rideNoteInput, { borderColor: t.muted, color: t.text }]}
                      value={rideNote}
                      onChangeText={(value) => setRideNote(value.slice(0, 700))}
                      placeholder="Add ride rules and safety notes"
                      placeholderTextColor={`${t.muted}99`}
                      multiline
                    />
                    <TouchableOpacity
                      style={[createRideWizardStyles.rideNoteEditIcon, { backgroundColor: t.surface }]}
                      onPress={() => rideNoteInputRef.current?.focus()}
                      activeOpacity={0.85}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={16} color={t.muted} />
                    </TouchableOpacity>
                  </View>
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
                      <Text style={[createRideWizardStyles.preferenceTitle, { color: t.text }]}>Restrict join requests</Text>
                      <Text style={[createRideWizardStyles.preferenceText, { color: t.text }]}>
                        Turn on for request approval, or off so anyone can join instantly.
                      </Text>
                    </View>
                    <Switch
                      value={rideJoinPermission === 'request_to_join'}
                      onValueChange={(value) => setRideJoinPermission(value ? 'request_to_join' : 'anyone')}
                      trackColor={{ false: inactiveBorder, true: `${accent}77` }}
                      thumbColor={rideJoinPermission === 'request_to_join' ? accent : switchThumbOff}
                    />
                  </View>

                  {availableUserGroups.length > 0 && (
                    <View style={[createRideWizardStyles.preferenceRow, { marginTop: 10 }]}>
                      <View style={styles.flex1}>
                        <Text style={[createRideWizardStyles.preferenceTitle, { color: t.text }]}>Host as Group (Optional)</Text>
                        <Text style={[createRideWizardStyles.preferenceText, { color: t.text }]}>
                          Organize this ride on behalf of a group.
                        </Text>
                        <TouchableOpacity
                          style={[createRideWizardStyles.filledInput, { backgroundColor: t.surface, borderColor: t.border, marginTop: 8, height: 44, justifyContent: 'center' }]}
                          onPress={() => setShowGroupPicker(true)}
                        >
                          <Text style={{ color: groupId ? t.text : t.muted, fontWeight: '600' }}>
                            {groupId
                              ? availableUserGroups.find((sq) => sq.id === groupId)?.name || 'Unknown Group'
                              : 'None (Individual Ride)'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

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
                        style={[createRideWizardStyles.filledInput, { backgroundColor: t.surface, borderColor: t.border, color: t.text }]}
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
                <Text style={createRideWizardStyles.nextButtonText}>{isEditMode ? 'Save Changes' : 'Launch Ride'}</Text>
              </TouchableOpacity>
            </View>

            {isRidePointPickerOpen && (
              <View style={[createRideWizardStyles.mapPickerOverlay, { backgroundColor: t.bg }]}>
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
                  <Text style={[styles.bodyText, { color: t.muted }]}>
                    {mapPickerCanPan
                      ? 'Pan mode: move map, then tap "Done panning" to place a marker.'
                      : `Tap to set ${locationPickerContext === 'rideEnds' ? 'ride end' : 'ride start'}. Tap "Pan map" to move around.`}
                  </Text>

                  <TouchableOpacity
                    style={[styles.primaryCompactButton, { borderColor: t.border, backgroundColor: mapPickerCanPan ? accent : t.subtle }]}
                    onPress={() => setMapPickerCanPan((p) => !p)}
                  >
                    <MaterialCommunityIcons name={mapPickerCanPan ? 'check' : 'hand-back-right'} size={14} color={mapPickerCanPan ? '#fff' : t.primary} />
                    <Text style={[styles.primaryCompactButtonText, { color: mapPickerCanPan ? '#fff' : t.primary }]}>
                      {mapPickerCanPan ? 'Done panning' : 'Pan map'}
                    </Text>
                  </TouchableOpacity>

                  {routeMapModule ? (
                    <View
                      style={[
                        styles.routePickerMapFrame,
                        { borderColor: t.border, overflow: Platform.OS === 'ios' ? 'hidden' : 'visible' }
                      ]}
                    >
                      <routeMapModule.MapView
                        style={styles.routePickerMap}
                        initialRegion={ridePointRegion}
                        scrollEnabled={mapPickerCanPan}
                        onPress={(event) => {
                          if (!mapPickerCanPan) handlePickRidePointFromMap(event);
                        }}
                        onLongPress={(event) => {
                          if (!mapPickerCanPan) handlePickRidePointFromMap(event);
                        }}
                      >
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
                      <Text style={[styles.smallButtonText, { color: !draftRidePoint ? `${TOKENS[theme].red}66` : TOKENS[theme].red }]}>
                        Clear
                      </Text>
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
              </View>
            )}

            {isStopPickerOpen && (
              <View style={[createRideWizardStyles.mapPickerOverlay, { backgroundColor: t.bg }]}>
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
                    {mapPickerCanPan
                      ? 'Pan mode: move map, then tap "Done panning" to add stops.'
                      : 'Tap to add a stop. Tap "Pan map" to move around.'}
                  </Text>

                  <TouchableOpacity
                    style={[styles.primaryCompactButton, { borderColor: t.border, backgroundColor: mapPickerCanPan ? accent : t.subtle }]}
                    onPress={() => setMapPickerCanPan((p) => !p)}
                  >
                    <MaterialCommunityIcons name={mapPickerCanPan ? 'check' : 'hand-back-right'} size={14} color={mapPickerCanPan ? '#fff' : t.primary} />
                    <Text style={[styles.primaryCompactButtonText, { color: mapPickerCanPan ? '#fff' : t.primary }]}>
                      {mapPickerCanPan ? 'Done panning' : 'Pan map'}
                    </Text>
                  </TouchableOpacity>

                  {routeMapModule ? (
                    <View
                      style={[
                        styles.routePickerMapFrame,
                        { borderColor: t.border, overflow: Platform.OS === 'ios' ? 'hidden' : 'visible' }
                      ]}
                    >
                      <routeMapModule.MapView
                        style={styles.routePickerMap}
                        initialRegion={pickerRegion}
                        scrollEnabled={mapPickerCanPan}
                        onPress={(event) => {
                          if (!mapPickerCanPan) handleAddStopFromMap(event);
                        }}
                        onLongPress={(event) => {
                          if (!mapPickerCanPan) handleAddStopFromMap(event);
                        }}
                      >
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
                        <View
                          key={`${point.lat}-${point.lng}-${index}`}
                          style={[styles.routePickerPointRow, { borderColor: t.border, backgroundColor: t.subtle }]}
                        >
                          <Text style={[styles.boldText, { color: t.text }]}>{point.label ?? `Stop ${index + 1}`}</Text>
                          <Text style={[styles.metaText, { color: t.muted }]}>
                            {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
                          </Text>
                        </View>
                      ))
                    )}
                  </ScrollView>
                </View>
              </View>
            )}
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
              <MaterialCommunityIcons name="map-marker-check-outline" size={24} color={accent} />
              <Text style={[createRideWizardStyles.destinationActionText, { color: t.text }]}>
                {locationPickerContext === 'primaryDestination' ? 'Use This Destination' : 'Use This Location'}
              </Text>
            </TouchableOpacity>

            {showMapPickerAction && (
              <TouchableOpacity
                style={[createRideWizardStyles.destinationActionRow, { borderBottomColor: t.border, backgroundColor: t.surface }]}
                onPress={openMapPickerFromDestination}
              >
                <MaterialCommunityIcons name="map-search-outline" size={24} color={accent} />
                <Text style={[createRideWizardStyles.destinationActionText, { color: t.text }]}>Pick On Map</Text>
              </TouchableOpacity>
            )}

            {shouldSearchGoogleSuggestions && !hasGooglePlacesKey && (
              <View
                style={[
                  createRideWizardStyles.destinationSection,
                  { borderBottomColor: t.border, backgroundColor: t.subtle, borderBottomWidth: 1 }
                ]}
              >
                <Text style={[createRideWizardStyles.destinationSectionTitle, { color: t.text }]}>Map Suggestions Disabled</Text>
                <Text style={[createRideWizardStyles.destinationEmptyText, { color: t.muted }]}>
                  Add `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` (or `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`) in `.env`.
                </Text>
              </View>
            )}

            {hasGooglePlacesKey && shouldSearchGoogleSuggestions && (
              <View
                style={[
                  createRideWizardStyles.destinationSection,
                  { borderBottomColor: t.border, backgroundColor: t.subtle, borderBottomWidth: 1 }
                ]}
              >
                <Text style={[createRideWizardStyles.destinationSectionTitle, { color: t.text }]}>Google Maps</Text>

                {isGoogleDestinationLoading ? (
                  <View style={[createRideWizardStyles.destinationListRow, { borderBottomColor: t.border }]}>
                    <View style={styles.rowAligned}>
                      <ActivityIndicator size="small" color={accent} />
                      <Text style={[createRideWizardStyles.destinationListText, { color: t.text }]}>Searching locations...</Text>
                    </View>
                  </View>
                ) : googleDestinationError ? (
                  <Text style={[createRideWizardStyles.destinationEmptyText, { color: TOKENS[theme].red }]}>{googleDestinationError}</Text>
                ) : googleDestinationSuggestions.length === 0 ? (
                  <Text style={[createRideWizardStyles.destinationEmptyText, { color: t.muted }]}>No map suggestions found.</Text>
                ) : (
                  <View style={createRideWizardStyles.destinationList}>
                    {googleDestinationSuggestions.map((item) => (
                      <TouchableOpacity
                        key={`google-${item.placeId}`}
                        style={[createRideWizardStyles.destinationListRow, { borderBottomColor: t.border }]}
                        onPress={() => {
                          void handleApplyGoogleSuggestion(item, locationPickerContext);
                        }}
                      >
                        <View style={styles.rowAligned}>
                          <MaterialCommunityIcons name="map-marker-radius-outline" size={20} color={accent} />
                          <View style={styles.flex1}>
                            <Text style={[createRideWizardStyles.destinationListText, { color: t.text }]}>{item.primaryText}</Text>
                            {!!item.secondaryText && (
                              <Text style={[createRideWizardStyles.destinationListSubText, { color: t.muted }]}>{item.secondaryText}</Text>
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

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
                      onPress={() => {
                        void handleApplyLocationSelection(item, locationPickerContext);
                      }}
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
              {dedupedLocalDestinationSuggestions
                .filter((item) => item.toLowerCase() !== normalizedCurrentCity.toLowerCase())
                .slice(0, 6)
                .map((item) => (
                  <TouchableOpacity
                    key={`suggestion-${item}`}
                    style={[createRideWizardStyles.destinationListRow, { borderBottomColor: t.border }]}
                    onPress={() => {
                      void handleApplyLocationSelection(item, locationPickerContext);
                    }}
                  >
                    <View style={styles.rowAligned}>
                      <MaterialCommunityIcons name="map-marker-radius-outline" size={20} color={t.muted} />
                      <Text style={[createRideWizardStyles.destinationListText, { color: t.text }]}>{item}</Text>
                    </View>
                  </TouchableOpacity>
                ))}

              <TouchableOpacity
                style={[createRideWizardStyles.destinationListRow, { borderBottomColor: t.border, opacity: normalizedCurrentCity ? 1 : 0.5 }]}
                onPress={() => {
                  void handleApplyLocationSelection(normalizedCurrentCity, locationPickerContext);
                }}
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

      {isIOSNativePickerVisible && (
        <Modal visible={isIOSNativePickerVisible} animationType="slide" onRequestClose={closeIOSNativePicker}>
          <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg, paddingTop: topInset }]}>
            <View style={[createRideWizardStyles.selectorHeader, { borderBottomColor: t.border }]}>
              <TouchableOpacity onPress={closeIOSNativePicker} style={createRideWizardStyles.selectorBackButton}>
                <MaterialCommunityIcons name="close" size={26} color={t.text} />
              </TouchableOpacity>
              <Text style={[createRideWizardStyles.selectorTitle, { color: t.text }]}>{iosNativePickerTitle}</Text>
            </View>

            <View style={createRideWizardStyles.nativePickerBody}>
              <DateTimePicker
                value={pickerDraftValue}
                mode={isDatePickerOpen ? 'date' : 'time'}
                display="spinner"
                onChange={handleIOSPickerValueChange}
                minimumDate={isDatePickerOpen ? datePickerMinimumDate : undefined}
                maximumDate={isDatePickerOpen ? maximumRideDate : undefined}
                minuteInterval={isTimePickerOpen ? TIME_PICKER_INTERVAL_MINUTES : undefined}
              />
            </View>

            <View style={[createRideWizardStyles.nativePickerFooter, { borderTopColor: t.border }]}>
              <TouchableOpacity
                style={[createRideWizardStyles.nativePickerSecondaryButton, { borderColor: t.border, backgroundColor: t.subtle }]}
                onPress={closeIOSNativePicker}
              >
                <Text style={[createRideWizardStyles.nativePickerSecondaryButtonText, { color: t.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[createRideWizardStyles.nativePickerPrimaryButton, { backgroundColor: accent }]}
                onPress={applyIOSNativePicker}
              >
                <Text style={createRideWizardStyles.nativePickerPrimaryButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Modal>
      )}

      {Platform.OS === 'android' && isDatePickerOpen && (
        <DateTimePicker
          value={pickerDraftValue}
          mode="date"
          display="default"
          minimumDate={datePickerMinimumDate}
          maximumDate={maximumRideDate}
          onChange={handleAndroidDatePickerChange}
        />
      )}

      {Platform.OS === 'android' && isTimePickerOpen && (
        <DateTimePicker
          value={pickerDraftValue}
          mode="time"
          display="default"
          is24Hour={false}
          onChange={handleAndroidTimePickerChange}
        />
      )}

      {/* Group Picker Modal */}
      <Modal visible={showGroupPicker} animationType="slide" transparent>
        <View style={createRideWizardStyles.groupPickerOverlay}>
          <View style={[styles.bottomSheet, { backgroundColor: TOKENS[theme].card }]}>
            <View style={[createRideWizardStyles.groupPickerHeader, { borderBottomColor: TOKENS[theme].border }]}>
              <Text style={[createRideWizardStyles.groupPickerTitle, { color: TOKENS[theme].text }]}>Host as Group</Text>
              <TouchableOpacity onPress={() => setShowGroupPicker(false)} style={styles.iconButton}>
                <MaterialCommunityIcons name="close" size={20} color={TOKENS[theme].text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              <TouchableOpacity
                style={[
                  createRideWizardStyles.groupPickerOption,
                  { borderBottomColor: TOKENS[theme].border },
                  !groupId && { backgroundColor: TOKENS[theme].subtle }
                ]}
                onPress={() => {
                  setGroupId('');
                  setShowGroupPicker(false);
                }}
              >
                <Text style={[styles.bodyText, { color: !groupId ? TOKENS[theme].primary : TOKENS[theme].text }]}>
                  None (Individual Ride)
                </Text>
              </TouchableOpacity>
              {availableUserGroups.map((sq) => (
                <TouchableOpacity
                  key={sq.id}
                  style={[
                    createRideWizardStyles.groupPickerOption,
                    { borderBottomColor: TOKENS[theme].border },
                    groupId === sq.id && { backgroundColor: TOKENS[theme].subtle }
                  ]}
                  onPress={() => {
                    setGroupId(sq.id);
                    setShowGroupPicker(false);
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Text style={[styles.bodyText, { color: groupId === sq.id ? TOKENS[theme].primary : TOKENS[theme].text }]}>
                      {sq.name}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </>
  );
};

const createRideWizardStyles = StyleSheet.create({
  timelineWrap: {
    marginTop: 10,
    marginBottom: 4
  },
  timelineRow: {
    flexDirection: 'row',
    minHeight: 56
  },
  timelineLeftCol: {
    width: 32,
    alignItems: 'center',
    marginRight: 10
  },
  timelineNode: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    marginTop: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff'
  },
  timelineNodeText: {
    fontSize: 10,
    fontWeight: '800'
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
    marginBottom: -14
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 12
  },
  addStopButtonTimeline: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 8
  },
  addStopButtonTextTimeline: {
    fontSize: 13,
    fontWeight: '700'
  },
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
  headerRowUp: {
    marginTop: -4
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
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.7
  },
  stepTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 2
  },
  stepDescription: {
    fontSize: 14,
    lineHeight: 20
  },
  fieldBlock: {
    gap: 10,
    marginTop: 16
  },
  fieldLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.7,
    fontWeight: '800',
    marginBottom: 6
  },
  lineInput: {
    borderBottomWidth: 1,
    minHeight: 46,
    fontSize: 14,
    fontWeight: '600'
  },
  destinationPickerField: {
    borderBottomWidth: 1,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  destinationPickerValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600'
  },
  lineInputLarge: {
    borderBottomWidth: 1,
    minHeight: 46,
    fontSize: 14,
    fontWeight: '600'
  },
  charCount: {
    alignSelf: 'flex-end',
    fontSize: 10,
    fontWeight: '500'
  },
  trendingLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.7,
    fontWeight: '800'
  },
  trendingChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12
  },
  trendingChipText: {
    fontSize: 11,
    fontWeight: '700'
  },
  dayModeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14
  },
  dayModeButton: {
    minWidth: 100,
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14
  },
  dayModeText: {
    fontSize: 11,
    fontWeight: '700'
  },
  filledInput: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '600'
  },
  locationPickerInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  stopInputsWrap: {
    gap: 8
  },
  stopInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  stopInputField: {
    flex: 1
  },
  addStopButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  addStopButtonText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3
  },
  locationPickerInputText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600'
  },
  routeMapButton: {
    marginTop: 6,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8
  },
  routeMapButtonText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3
  },
  routeEstimateCard: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 8
  },
  routeEstimateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  routeEstimateTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3
  },
  routeEstimateChipRow: {
    flexDirection: 'row',
    gap: 8
  },
  routeEstimateChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 2
  },
  routeEstimateChipLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3
  },
  routeEstimateChipValue: {
    fontSize: 12,
    fontWeight: '800'
  },
  routeEstimateHint: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600'
  },
  routeEstimateMeta: {
    fontSize: 10,
    fontWeight: '700'
  },
  routeEstimateError: {
    fontSize: 11,
    fontWeight: '700'
  },
  timelineGrid: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8
  },
  timeTileInput: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '600'
  },
  timeTileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6
  },
  timeTileText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600'
  },
  costRow: {
    flexDirection: 'row',
    gap: 10
  },
  costButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center'
  },
  costButtonText: {
    fontSize: 11,
    fontWeight: '700'
  },
  inclusionHeader: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.7,
    fontWeight: '800',
    marginTop: 10
  },
  inclusionChip: {
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 38,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6
  },
  inclusionChipText: {
    fontSize: 11,
    fontWeight: '700'
  },
  rideNoteInputWrap: {
    position: 'relative'
  },
  rideNoteInput: {
    minHeight: 170,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    paddingBottom: 40,
    paddingRight: 40,
    textAlignVertical: 'top',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600'
  },
  rideNoteEditIcon: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  inviteModeRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    marginTop: 10
  },
  inviteModeButton: {
    minWidth: 170 / 2,
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16
  },
  inviteModeText: {
    fontSize: 11,
    fontWeight: '700'
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
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3
  },
  preferenceText: {
    fontSize: 14,
    lineHeight: 20
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
    fontSize: 14,
    paddingVertical: 0,
    fontWeight: '600'
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
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3
  },
  destinationSection: {
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  destinationSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.7
  },
  destinationEmptyText: {
    marginTop: 4,
    fontSize: 13,
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
    fontSize: 14,
    fontWeight: '600'
  },
  destinationListSubText: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '500'
  },
  selectorHeader: {
    borderBottomWidth: 1,
    minHeight: 56,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  selectorBackButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center'
  },
  selectorTitle: {
    fontSize: 14,
    fontWeight: '800'
  },
  selectorList: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8
  },
  nativePickerBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16
  },
  nativePickerFooter: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 10
  },
  nativePickerSecondaryButton: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  nativePickerSecondaryButtonText: {
    fontSize: 13,
    fontWeight: '700'
  },
  nativePickerPrimaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  nativePickerPrimaryButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3
  },
  mapPickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20
  },
  selectorOption: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  selectorOptionText: {
    fontSize: 14,
    fontWeight: '600'
  },
  groupPickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2, 6, 23, 0.45)'
  },
  groupPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1
  },
  groupPickerTitle: {
    fontSize: 16,
    fontWeight: '800'
  },
  groupPickerOption: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1
  },
  nextButton: {
    minHeight: 46,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4
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
  onUploadProfilePhoto,
  onUploadBikePhoto,
  isUploadingProfilePhoto,
  uploadingBikeName,
  theme
}: {
  visible: boolean;
  user: User;
  onClose: () => void;
  onSave: (updates: Partial<User>) => void;
  onUploadProfilePhoto: (localUri: string) => Promise<void>;
  onUploadBikePhoto: (bikeName: string, localUri: string) => Promise<void>;
  isUploadingProfilePhoto: boolean;
  uploadingBikeName: string | null;
  theme: Theme;
}) => {
  const ridingStyleOptions = [
    'Touring / Off-road',
    'Fast / Spirited',
    'Long Distance',
    'Chill / City',
    'Night Cruise',
    'Adventure / Off-road',
    'City / Urban',
    'Sport'
  ];
  const sanitizeEmergencyInput = (value: string): string => {
    const digits = value.replace(/\D/g, '');
    return digits.length <= 10 ? digits : digits.slice(-10);
  };
  const normalizeEmergencyContacts = (values: string[]): string[] => {
    const seen = new Set<string>();
    const normalized: string[] = [];
    values
      .map((value) => sanitizeEmergencyInput(value))
      .filter((value) => value.length === 10)
      .forEach((value) => {
        if (seen.has(value)) return;
        seen.add(value);
        normalized.push(value);
      });
    return normalized;
  };

  const initialEmergencyContacts = normalizeEmergencyContacts([
    ...(user.sosContacts ?? []),
    user.sosNumber ?? ''
  ]);
  const deriveNameParts = (profile: User): { first: string; last: string } => {
    const fullNameParts = (profile.fullName?.trim() ?? '').split(/\s+/).filter(Boolean);
    const first = profile.firstName?.trim() || fullNameParts[0] || profile.name.trim();
    const last = profile.lastName?.trim() || (fullNameParts.length > 1 ? fullNameParts.slice(1).join(' ') : '');
    return { first, last };
  };
  const initialNameParts = deriveNameParts(user);
  const t = TOKENS[theme];
  const [firstName, setFirstName] = useState(initialNameParts.first);
  const [lastName, setLastName] = useState(initialNameParts.last);
  const [garage, setGarage] = useState<string[]>(user.garage || []);
  const [style, setStyle] = useState(user.style);
  const [typicalRideTime, setTypicalRideTime] = useState(user.typicalRideTime);
  const [primarySosContact, setPrimarySosContact] = useState(initialEmergencyContacts[0] ?? '');
  const [secondarySosContact, setSecondarySosContact] = useState(initialEmergencyContacts[1] ?? '');
  const [thirdSosContact, setThirdSosContact] = useState(initialEmergencyContacts[2] ?? '');
  const [error, setError] = useState('');
  const initializedForOpenRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      initializedForOpenRef.current = false;
      return;
    }
    if (initializedForOpenRef.current) return;

    initializedForOpenRef.current = true;
    const contacts = normalizeEmergencyContacts([...(user.sosContacts ?? []), user.sosNumber ?? '']);
    const nameParts = deriveNameParts(user);
    setFirstName(nameParts.first);
    setLastName(nameParts.last);
    setGarage(user.garage || []);
    setStyle(user.style);
    setTypicalRideTime(user.typicalRideTime);
    setPrimarySosContact(contacts[0] ?? '');
    setSecondarySosContact(contacts[1] ?? '');
    setThirdSosContact(contacts[2] ?? '');
    setError('');
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

  const handleUploadProfilePhoto = async () => {
    if (isUploadingProfilePhoto) return;
    const localUri = await pickImageFromLibrary();
    if (!localUri) return;
    await onUploadProfilePhoto(localUri);
  };

  const handleUploadBikePhoto = async (bikeName: string) => {
    const normalizedBikeName = bikeName.trim();
    if (!normalizedBikeName) {
      Alert.alert('Bike name required', 'Add a bike name before uploading its photo.');
      return;
    }

    if (uploadingBikeName && uploadingBikeName === normalizedBikeName) return;
    const localUri = await pickImageFromLibrary();
    if (!localUri) return;
    await onUploadBikePhoto(normalizedBikeName, localUri);
  };

  const submit = () => {
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedDisplayName = normalizedFirstName || user.name.trim() || 'Rider';
    const normalizedFullName = [normalizedFirstName, normalizedLastName].filter(Boolean).join(' ') || normalizedDisplayName;
    const filteredGarage = garage.map((value) => value.trim()).filter(Boolean);
    const emergencyContacts = normalizeEmergencyContacts([primarySosContact, secondarySosContact, thirdSosContact]);
    const hasInvalidSosLength = [primarySosContact, secondarySosContact, thirdSosContact].some(
      (contact) => contact.length > 0 && contact.length !== 10
    );

    if (hasInvalidSosLength) {
      setError('Each SOS contact must be exactly 10 digits.');
      return;
    }

    if (emergencyContacts.length === 0) {
      setError('Add at least one emergency contact (10 digits).');
      return;
    }

    setError('');
    onSave({
      name: normalizedDisplayName,
      firstName: normalizedFirstName || undefined,
      lastName: normalizedLastName || undefined,
      fullName: normalizedFullName,
      garage: filteredGarage,
      style,
      typicalRideTime,
      sosNumber: emergencyContacts[0],
      sosContacts: emergencyContacts
    });
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
              <View style={styles.rowAligned}>
                <Image source={{ uri: user.avatar || avatarFallback }} style={styles.avatarLarge} />
                <TouchableOpacity
                  style={[styles.primaryCompactButton, { borderColor: t.border, backgroundColor: t.subtle }]}
                  onPress={() => {
                    void handleUploadProfilePhoto();
                  }}
                  disabled={isUploadingProfilePhoto}
                >
                  {isUploadingProfilePhoto ? (
                    <ActivityIndicator size="small" color={t.primary} />
                  ) : (
                    <MaterialCommunityIcons name="camera" size={14} color={t.primary} />
                  )}
                  <Text style={[styles.primaryCompactButtonText, { color: t.primary }]}>
                    {isUploadingProfilePhoto ? 'Uploading...' : 'Change Profile Photo'}
                  </Text>
                </TouchableOpacity>
              </View>

              <LabeledInput label="First Name" value={firstName} onChangeText={setFirstName} theme={theme} />
              <LabeledInput label="Last Name" value={lastName} onChangeText={setLastName} theme={theme} />

              <Text style={[styles.inputLabel, { color: t.muted }]}>Garage</Text>
              {garage.map((bike, idx) => {
                const bikeName = bike.trim();
                const bikePhotoUrl = bikeName ? user.bikePhotosByName?.[bikeName] : undefined;
                const isUploadingThisBike = Boolean(uploadingBikeName && uploadingBikeName === bikeName);

                return (
                  <View key={`bike-${idx}`}>
                    <View style={styles.rowAligned}>
                      <TextInput
                        style={[styles.input, styles.flex1, { backgroundColor: t.subtle, borderColor: t.border, color: t.text }]}
                        value={bike}
                        placeholder="Bike name"
                        placeholderTextColor={t.muted}
                        onChangeText={(value) => updateBike(idx, value)}
                      />
                      <TouchableOpacity
                        style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}
                        onPress={() => {
                          void handleUploadBikePhoto(bike);
                        }}
                        disabled={isUploadingThisBike}
                      >
                        {isUploadingThisBike ? (
                          <ActivityIndicator size="small" color={t.primary} />
                        ) : (
                          <MaterialCommunityIcons name="camera-outline" size={18} color={t.primary} />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}
                        onPress={() => removeBike(idx)}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={18} color={TOKENS[theme].red} />
                      </TouchableOpacity>
                    </View>
                    {bikePhotoUrl ? (
                      <Image source={{ uri: bikePhotoUrl }} style={[styles.helpImage, { marginBottom: 8 }]} resizeMode="cover" />
                    ) : null}
                  </View>
                );
              })}
              <TouchableOpacity
                style={[styles.ghostButton, { borderColor: t.border, backgroundColor: t.subtle }]}
                onPress={() => setGarage((prev) => [...prev, ''])}
              >
                <MaterialCommunityIcons name="plus" size={18} color={t.primary} />
                <Text style={[styles.ghostButtonText, { color: t.primary }]}>Add bike</Text>
              </TouchableOpacity>
              <Text style={[styles.metaText, { color: t.muted }]}>
                Add one photo per bike. Upload uses your account storage.
              </Text>

              <View>
                <Text style={[styles.inputLabel, { color: t.muted }]}>Riding Style</Text>
                <View style={styles.wrapRow}>
                  {ridingStyleOptions.map((option) => {
                    const isActive = style === option;
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
                        onPress={() => setStyle(option)}
                      >
                        <Text style={[styles.selectorChipText, { color: isActive ? t.primary : t.muted }]}>{option}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <LabeledInput label="Typical Ride Time" value={typicalRideTime} onChangeText={setTypicalRideTime} theme={theme} />

              <Text style={[styles.inputLabel, { color: t.muted }]}>Primary Emergency Contact</Text>
              <TextInput
                style={[styles.input, { backgroundColor: t.subtle, borderColor: t.border, color: t.text }]}
                value={primarySosContact}
                placeholder="Primary emergency number"
                placeholderTextColor={t.muted}
                keyboardType="number-pad"
                maxLength={10}
                onChangeText={(value) => {
                  setPrimarySosContact(sanitizeEmergencyInput(value));
                  setError('');
                }}
              />

              <Text style={[styles.inputLabel, { color: t.muted }]}>Secondary Contact (Optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: t.subtle, borderColor: t.border, color: t.text }]}
                value={secondarySosContact}
                placeholder="Secondary emergency number"
                placeholderTextColor={t.muted}
                keyboardType="number-pad"
                maxLength={10}
                onChangeText={(value) => {
                  setSecondarySosContact(sanitizeEmergencyInput(value));
                  setError('');
                }}
              />

              <Text style={[styles.inputLabel, { color: t.muted }]}>Third Contact (Optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: t.subtle, borderColor: t.border, color: t.text }]}
                value={thirdSosContact}
                placeholder="Third emergency number"
                placeholderTextColor={t.muted}
                keyboardType="number-pad"
                maxLength={10}
                onChangeText={(value) => {
                  setThirdSosContact(sanitizeEmergencyInput(value));
                  setError('');
                }}
              />

              {!!error && <Text style={[styles.errorText, { color: TOKENS[theme].red }]}>{error}</Text>}

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
  onEditRide,
  onCancelRide,
  onLeaveRide,
  onReportRide,
  rideTrackingSession,
  isLiveTrackingSyncing = false,
  liveTrackingSyncError,
  isStartingRideTracking = false,
  isStoppingRideTracking = false,
  isUpdatingRideCheckIn = false,
  isSendingRideSos = false,
  rideCheckInGeofenceRadiusMeters = 250,
  onRetryRideTrackingSync,
  onStartRideTracking,
  onStopRideTracking,
  onToggleRideCheckIn,
  onSendRideSos,
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
  onEditRide?: (rideId: string) => void;
  onCancelRide: (rideId: string) => void;
  onLeaveRide: (rideId: string) => void;
  onReportRide?: (rideId: string) => void;
  rideTrackingSession?: RideTrackingSession | null;
  isLiveTrackingSyncing?: boolean;
  liveTrackingSyncError?: string | null;
  isStartingRideTracking?: boolean;
  isStoppingRideTracking?: boolean;
  isUpdatingRideCheckIn?: boolean;
  isSendingRideSos?: boolean;
  rideCheckInGeofenceRadiusMeters?: number;
  onRetryRideTrackingSync?: () => void;
  onStartRideTracking?: (rideId: string) => void;
  onStopRideTracking?: (rideId: string) => void;
  onToggleRideCheckIn?: (rideId: string, checkedIn: boolean) => void;
  onSendRideSos?: (rideId: string) => void;
  isCreatorBlocked?: boolean;
  onHandleViewProfile?: (userId: string) => void;
  theme: Theme;
}) => {
  const t = TOKENS[theme];
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'ios' ? insets.top : getAndroidTopInset(insets);
  const [routeDetailMapSize, setRouteDetailMapSize] = useState({ width: 0, height: 0 });
  const [routeDetailOverlayLabels, setRouteDetailOverlayLabels] = useState<
    Array<{
      key: string;
      label: string;
      color: string;
      width: number;
      fontSize: number;
      left: number;
      top: number;
    }>
  >([]);
  const routeDetailMapRef = useRef<RouteMapViewRef | null>(null);
  const routeDetailOverlayRequestRef = useRef(0);
  const [routeDetailLivePathCoordinates, setRouteDetailLivePathCoordinates] = useState<RouteCoordinate[] | null>(null);

  const routeLookupPoints = normalizeRoutePoints(ride?.routePoints);
  const {
    startPoint: routeLookupStartPoint,
    endPoint: routeLookupEndPoint,
    stopPoints: routeLookupStopPoints
  } = splitRoutePointRoles(routeLookupPoints);
  const routeLookupStartLabel = ride?.startLocation?.trim() ?? '';
  const routeLookupEndLabel = ride?.endLocation?.trim() ?? '';
  const resolvedRouteLookupStartPoint = routeLookupStartPoint ?? parseCoordinateLabelPoint(ride?.startLocation ?? '');
  const resolvedRouteLookupEndPoint = routeLookupEndPoint ?? parseCoordinateLabelPoint(ride?.endLocation ?? '');
  const routeLookupStopsKey = routeLookupStopPoints.map((point) => `${point.lat}:${point.lng}`).join('|');

  useEffect(() => {
    if (!ride) {
      setRouteDetailLivePathCoordinates(null);
      return;
    }

    const startLabel = routeLookupStartLabel;
    const endLabel = routeLookupEndLabel;
    if (!startLabel || !endLabel) {
      setRouteDetailLivePathCoordinates(null);
      return;
    }

    let isCanceled = false;
    (async () => {
      try {
        const pathCoordinates = await fetchGoogleDirectionsPathCoordinates({
          startLabel,
          endLabel,
          startPoint: resolvedRouteLookupStartPoint,
          endPoint: resolvedRouteLookupEndPoint,
          intermediatePoints: routeLookupStopPoints,
          apiKey: GOOGLE_PLACES_KEY
        });
        if (isCanceled) return;
        setRouteDetailLivePathCoordinates(pathCoordinates);
      } catch {
        if (!isCanceled) {
          setRouteDetailLivePathCoordinates(null);
        }
      }
    })();

    return () => {
      isCanceled = true;
    };
  }, [
    ride?.id,
    routeLookupEndLabel,
    routeLookupStartLabel,
    routeLookupStopsKey,
    resolvedRouteLookupEndPoint?.lat,
    resolvedRouteLookupEndPoint?.lng,
    resolvedRouteLookupStartPoint?.lat,
    resolvedRouteLookupStartPoint?.lng
  ]);

  if (!ride) return null;

  const isCreator = ride.creatorId === currentUser.id;
  const isPending = ride.requests.includes(currentUser.id);
  const isJoined = ride.currentParticipants.includes(currentUser.id);
  const requiresJoinApproval = ride.joinPermission !== 'anyone';
  const usersById = new Map(users.map((user) => [user.id, user]));
  const isGenericRiderName = (value: string): boolean => {
    const normalized = value.trim().toLowerCase();
    return normalized.length === 0 || normalized === 'rider' || normalized === 'a rider' || normalized === 'user' || normalized === 'a';
  };
  const getUserDisplayName = (user: User | null | undefined, fallback: string): string => {
    if (!user) return fallback;

    const fullName = user.fullName?.trim();
    if (fullName && !isGenericRiderName(fullName)) return fullName;

    const joinedName = [user.firstName?.trim(), user.lastName?.trim()].filter(Boolean).join(' ').trim();
    if (joinedName && !isGenericRiderName(joinedName)) return joinedName;

    return fallback;
  };
  const getDisplayFirstName = (value: string | undefined): string => {
    const normalized = value?.trim() ?? '';
    if (!normalized) return 'Rider';
    return normalized.split(/\s+/)[0] || 'Rider';
  };
  const normalizeRiderName = (value: string | undefined, fallback: string): string => {
    const trimmed = value?.trim() ?? '';
    return isGenericRiderName(trimmed) ? fallback : trimmed;
  };
  const resolveUserById = (userId: string): User | null => {
    if (userId === currentUser.id) return currentUser;

    const exact = usersById.get(userId);
    if (exact && !exact.isInferredProfile) return exact;

    const digitsFromId = userId.replace(/\D/g, '');
    const aliasPhoneLast10 = digitsFromId.length >= 10 ? digitsFromId.slice(-10) : '';
    if (!aliasPhoneLast10) return exact ?? null;
    const matched = users.find((user) => {
      if (user.id === userId) return false;
      const digits = (user.phoneNumber ?? '').replace(/\D/g, '');
      return digits.length >= 10 && digits.slice(-10) === aliasPhoneLast10 && user.isInferredProfile !== true;
    });
    if (matched) return matched;
    return (
      users.find((user) => {
        const digits = (user.phoneNumber ?? '').replace(/\D/g, '');
        return digits.length >= 10 && digits.slice(-10) === aliasPhoneLast10;
      }) ?? exact ?? null
    );
  };
  const participantIds = Array.from(new Set(ride.currentParticipants));
  const participantMap = new Map<
    string,
    {
      participantId: string;
      profileId: string;
      name: string;
      avatar: string;
      garage: string[];
    }
  >();
  participantIds.forEach((participantId) => {
    const user = resolveUserById(participantId);
    const fallbackName = 'Rider';
    const candidate = {
      participantId,
      profileId: user?.id ?? participantId,
      name: normalizeRiderName(getUserDisplayName(user, user?.name ?? fallbackName), fallbackName),
      avatar: user?.avatar ?? avatarFallback,
      garage: user?.garage ?? []
    };
    const digitsFromId = participantId.replace(/\D/g, '');
    const dedupeKey = user?.id ?? (digitsFromId.length >= 10 ? `phone:${digitsFromId.slice(-10)}` : `id:${participantId}`);
    const existing = participantMap.get(dedupeKey);
    if (!existing) {
      participantMap.set(dedupeKey, candidate);
      return;
    }

    const existingLooksGeneric = isGenericRiderName(existing.name) || /^rider\b/i.test(existing.name);
    const candidateLooksGeneric = isGenericRiderName(candidate.name) || /^rider\b/i.test(candidate.name);
    if (existingLooksGeneric && !candidateLooksGeneric) {
      participantMap.set(dedupeKey, candidate);
    }
  });
  const participants = Array.from(participantMap.values());
  const requestEntries = ride.requests.map((requesterId) => {
    const user = resolveUserById(requesterId);
    const fallbackName = 'Rider';
    return {
      id: requesterId,
      name: normalizeRiderName(getUserDisplayName(user, user?.name ?? fallbackName), fallbackName),
      avatar: user?.avatar ?? avatarFallback,
      bikeModel: user?.garage?.[0] ?? 'Unknown bike'
    };
  });
  const isRideParticipant = isJoined;
  const isLiveTrackingActive = Boolean(rideTrackingSession?.isActive);
  const myTrackingState = rideTrackingSession?.participants[currentUser.id];
  const isCheckedIn = Boolean(myTrackingState?.checkedIn);
  const liveParticipantStates = participants.map((participant) => {
    const state = rideTrackingSession?.participants[participant.participantId];
    const checkedIn = Boolean(state?.checkedIn);
    const hasLocation = Boolean(state?.lastLocation);
    const status = getLiveParticipantStatus({
      checkedIn,
      hasLocation,
      theme
    });

    return {
      user: participant,
      state,
      checkedIn,
      hasLocation,
      status
    };
  });
  const liveParticipantCoordinates = liveParticipantStates
    .map((entry) => {
      const location = entry.state?.lastLocation;
      if (!location) return null;
      return {
        id: entry.user.participantId,
        name: entry.user.name,
        checkedIn: entry.checkedIn,
        statusLabel: entry.status.label,
        markerColor: entry.status.markerColor,
        updatedAt: location.updatedAt,
        coordinate: {
          latitude: location.lat,
          longitude: location.lng
        }
      };
    })
    .filter(
      (
        item
      ): item is {
        id: string;
        name: string;
        checkedIn: boolean;
        statusLabel: string;
        markerColor: string;
        updatedAt: string;
        coordinate: { latitude: number; longitude: number };
      } => item !== null
    );
  const liveTrackingRegion = buildRouteRegion(liveParticipantCoordinates.map((item) => item.coordinate));
  const lastSos = rideTrackingSession?.lastSos;
  const lastSosUser = lastSos ? usersById.get(lastSos.userId) : null;
  const routePoints = normalizeRoutePoints(ride.routePoints);
  const {
    startPoint: explicitRouteStartPoint,
    endPoint: explicitRouteEndPoint,
    stopPoints: routeStopPoints
  } = splitRoutePointRoles(routePoints);
  const startCheckpoint = routePoints[0] ?? null;
  const routeCoordinates = toRouteCoordinates(routePoints);
  const routeMapPolylineCoordinates =
    routeDetailLivePathCoordinates && routeDetailLivePathCoordinates.length > 1 ? routeDetailLivePathCoordinates : routeCoordinates;
  const routeMapMarkerLabels = routePoints.map((point, index) => {
    const isStart = index === 0;
    const isEnd = index === routePoints.length - 1;

    if (isStart) {
      return toShortRouteMarkerLabel(ride.startLocation ?? point.label, 'Start');
    }

    if (isEnd) {
      return toShortRouteMarkerLabel(ride.endLocation ?? point.label, 'End');
    }

    return toShortRouteMarkerLabel(point.label, `Stop ${index + 1}`);
  });
  const routeMapMarkerColors = routeCoordinates.map((_, index) => {
    const isStart = index === 0;
    const isEnd = index === routeCoordinates.length - 1;
    return isStart ? TOKENS[theme].green : isEnd ? TOKENS[theme].red : t.primary;
  });
  const routeMapMarkerLabelKey = routeMapMarkerLabels.join('|');
  const routeMapKey = [
    routeMapPolylineCoordinates.map((point) => `${point.latitude}:${point.longitude}`).join('|'),
    routeMapMarkerLabelKey
  ].join('::');
  const routeRegion = buildRouteRegion(routeMapPolylineCoordinates, {
    paddingScale: 1.04,
    paddingDelta: 0.015,
    minDelta: 0.008
  });
  const routeDirectionsUrl = buildGoogleDirectionsUrlFromRoute({
    startLabel: ride.startLocation ?? explicitRouteStartPoint?.label ?? '',
    endLabel: ride.endLocation ?? explicitRouteEndPoint?.label ?? '',
    startPoint: explicitRouteStartPoint ?? parseCoordinateLabelPoint(ride.startLocation ?? ''),
    endPoint: explicitRouteEndPoint ?? parseCoordinateLabelPoint(ride.endLocation ?? ''),
    intermediatePoints: routeStopPoints
  });
  const hasRouteMapSection = Boolean(routeDirectionsUrl) || routeMapPolylineCoordinates.length > 0;
  const hasRouteStats =
    typeof ride.routeEtaMinutes === 'number' || typeof ride.routeDistanceKm === 'number' || typeof ride.tollEstimateInr === 'number';
  const rideDateLabel = buildRideDateSummary(ride);
  const rideLifecycle = getRideLifecycleStatus(ride);
  const isRideClosed = rideLifecycle.joinClosed;
  const paymentParticipantIds = Array.from(new Set(ride.currentParticipants.filter((participantId) => participantId !== ride.creatorId)));
  const hasPaidCost = ride.costType === 'Paid' || ride.costType === 'Split';
  const splitPerRiderAmount =
    ride.costType === 'Split' && typeof ride.splitTotalAmount === 'number' && paymentParticipantIds.length > 0
      ? ride.splitTotalAmount / paymentParticipantIds.length
      : undefined;
  const basePaymentAmount =
    ride.costType === 'Paid'
      ? typeof ride.pricePerPerson === 'number'
        ? ride.pricePerPerson
        : 0
      : ride.costType === 'Split'
        ? splitPerRiderAmount ?? (typeof ride.pricePerPerson === 'number' ? ride.pricePerPerson : 0)
        : 0;
  const hasPaymentFlow = hasPaidCost && basePaymentAmount > 0 && paymentParticipantIds.length > 0;
  const hasUpiLink = typeof ride.upiPaymentLink === 'string' && ride.upiPaymentLink.trim().length > 0;
  const paymentStatusByUserId = ride.paymentStatusByUserId ?? {};
  const paymentRows = paymentParticipantIds.map((participantId) => {
    const rowStatus = paymentStatusByUserId[participantId];
    const fallbackAmount = Number(basePaymentAmount.toFixed(2));
    const amount = ride.costType === 'Split'
      ? fallbackAmount
      : typeof rowStatus?.amount === 'number' && Number.isFinite(rowStatus.amount) && rowStatus.amount > 0
        ? rowStatus.amount
        : fallbackAmount;

    return {
      userId: participantId,
      user: resolveUserById(participantId),
      amount,
      status: rowStatus?.status === 'paid' ? 'paid' : 'pending',
      paidAt: rowStatus?.paidAt
    };
  });
  const totalCollectableAmount = paymentRows.reduce((total, row) => total + row.amount, 0);
  const totalCollectedAmount = paymentRows.reduce((total, row) => (row.status === 'paid' ? total + row.amount : total), 0);
  const pendingPayments = paymentRows.filter((row) => row.status !== 'paid');
  const myPaymentRow = paymentRows.find((row) => row.userId === currentUser.id);
  const isMyPaymentPaid = myPaymentRow?.status === 'paid';

  const handleOpenRouteInMaps = () => {
    const url = routeDirectionsUrl ?? buildGoogleDirectionsUrl(routeCoordinates);
    if (!url) return;

    void Linking.openURL(url).catch(() => {
      Alert.alert('Unable to open maps', 'Please try again in a moment.');
    });
  };

  const handleRouteMapPress = () => {
    const url = routeDirectionsUrl ?? buildGoogleDirectionsUrl(routeCoordinates);
    promptOpenRouteInGoogleMaps(url);
  };

  const fitRouteDetailMapToBounds = () => {
    if (Platform.OS === 'web') return;
    if (routeMapPolylineCoordinates.length < 2) return;

    requestAnimationFrame(() => {
      routeDetailMapRef.current?.fitToCoordinates?.(routeMapPolylineCoordinates, {
        edgePadding: ROUTE_MAP_EDGE_PADDING,
        animated: false
      });
    });
  };

  const updateRouteDetailOverlayLabels = (mapSize?: { width: number; height: number }) => {
    if (!isAndroidMarkerTextOverlayEnabled) {
      setRouteDetailOverlayLabels([]);
      return;
    }

    const resolvedSize = mapSize ?? routeDetailMapSize;
    if (routeCoordinates.length === 0 || resolvedSize.width <= 0 || resolvedSize.height <= 0) {
      setRouteDetailOverlayLabels([]);
      return;
    }

    const mapRef = routeDetailMapRef.current;
    if (!mapRef?.pointForCoordinate) return;

    const requestId = routeDetailOverlayRequestRef.current + 1;
    routeDetailOverlayRequestRef.current = requestId;

    setTimeout(() => {
      void (async () => {
        try {
          const positionedLabels = await Promise.all(
            routeCoordinates.map(async (coordinate, index) => {
              const projectedPoint = await mapRef.pointForCoordinate?.(coordinate);
              if (!projectedPoint) return null;

              const label = routeMapMarkerLabels[index] ?? `Stop ${index + 1}`;
              const color = routeMapMarkerColors[index] ?? t.primary;
              const metrics = getRouteMarkerBubbleMetrics(label);
              const bubbleWidth = metrics.width;
              const bubbleHeight = 34;
              const left = Math.max(6, Math.min(resolvedSize.width - bubbleWidth - 6, projectedPoint.x - bubbleWidth / 2));
              const top = Math.max(6, Math.min(resolvedSize.height - bubbleHeight - 6, projectedPoint.y - 44));

              return {
                key: `${coordinate.latitude}-${coordinate.longitude}-${index}-${label}`,
                label,
                color,
                width: bubbleWidth,
                fontSize: metrics.fontSize,
                left,
                top
              };
            })
          );

          if (requestId !== routeDetailOverlayRequestRef.current) return;
          setRouteDetailOverlayLabels(positionedLabels.filter((item): item is NonNullable<typeof item> => item !== null));
        } catch {
          if (requestId === routeDetailOverlayRequestRef.current) {
            setRouteDetailOverlayLabels([]);
          }
        }
      })();
    }, 210);
  };

  const handleShareRide = async () => {
    const joinAppLink = buildRideJoinDeepLink(ride.id);
    const joinIntentLink = buildRideJoinAndroidIntentUrl(ride.id);

    const shareLines = [
      `Join my ride "${ride.title}" on ThrottleUp.`,
      `Date: ${rideDateLabel}`,
      `Time: ${ride.startTime}`,
      `Route: ${ride.route}`,
      '',
      `Open in app: ${joinIntentLink}`,
      `Direct deep link: ${joinAppLink}`,
      `If app is not installed: ${PLAY_STORE_URL}`
    ];

    try {
      await Share.share({
        message: shareLines.join('\n')
      });
    } catch {
      Alert.alert('Unable to share ride', 'Please try again in a moment.');
    }
  };

  const updateRiderPaymentStatus = (userId: string, status: 'pending' | 'paid') => {
    if (!hasPaymentFlow) return;
    const row = paymentRows.find((item) => item.userId === userId);
    if (!row) return;

    const now = new Date().toISOString();
    const nextPaymentStatusByUserId = {
      ...(ride.paymentStatusByUserId ?? {}),
      [userId]: {
        userId,
        amount: row.amount,
        status,
        updatedAt: now,
        paidAt: status === 'paid' ? now : undefined,
        method: status === 'paid' ? ('UPI_LINK' as const) : undefined
      }
    };
    onUpdateRide(ride.id, { paymentStatusByUserId: nextPaymentStatusByUserId });
  };

  const handleOpenUpiPayment = async () => {
    if (!myPaymentRow || !ride.upiPaymentLink) return;

    const paymentUrl = buildUpiCheckoutUrl(ride.upiPaymentLink, myPaymentRow.amount, `${ride.title} #${ride.id}`);
    try {
      const canOpen = await Linking.canOpenURL(paymentUrl).catch(() => true);
      if (!canOpen) {
        Alert.alert('UPI App Not Available', 'No app could handle this payment link. Try another UPI app.');
        return;
      }

      await Linking.openURL(paymentUrl);
      Alert.alert('Mark payment complete?', `Confirm once you finish paying ${formatInrCurrency(myPaymentRow.amount)}.`, [
        { text: 'Not yet', style: 'cancel' },
        { text: 'Mark Paid', onPress: () => updateRiderPaymentStatus(currentUser.id, 'paid') }
      ]);
    } catch {
      Alert.alert('Unable to open UPI', 'Please try again in a moment.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaContextView edges={['left', 'right', 'bottom']} style={[styles.fullScreen, { backgroundColor: t.bg, paddingTop: topInset }]}>
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
            {isCreator && (
              <TouchableOpacity
                style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}
                onPress={() => onEditRide?.(ride.id)}
              >
                <MaterialCommunityIcons name="pencil-outline" size={18} color={t.primary} />
              </TouchableOpacity>
            )}
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
                void handleShareRide();
              }}
            >
              <MaterialCommunityIcons name="share-variant-outline" size={18} color={t.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.listWrap}>
          <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
            <View style={styles.rowBetween}>
              <View style={styles.rowAligned}>
                {isRideClosed && (
                  <>
                    <Badge color="red" theme={theme}>
                      Closed
                    </Badge>
                    <View style={{ width: 6 }} />
                  </>
                )}
                <Badge color="orange" theme={theme}>
                  {ride.type}
                </Badge>
              </View>
              <Text style={[styles.metaText, { color: t.muted }]}>{rideDateLabel}</Text>
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

            {hasRouteStats && (
              <View style={styles.wrapRow}>
                {typeof ride.routeEtaMinutes === 'number' && (
                  <View style={[styles.pillTag, { borderColor: t.border, backgroundColor: t.subtle }]}>
                    <Text style={[styles.pillTagText, { color: t.text }]}>ETA {formatRideEta(ride.routeEtaMinutes)}</Text>
                  </View>
                )}
                {typeof ride.routeDistanceKm === 'number' && (
                  <View style={[styles.pillTag, { borderColor: t.border, backgroundColor: t.subtle }]}>
                    <Text style={[styles.pillTagText, { color: t.text }]}>{formatRideDistance(ride.routeDistanceKm)}</Text>
                  </View>
                )}
                {typeof ride.tollEstimateInr === 'number' && (
                  <View style={[styles.pillTag, { borderColor: t.border, backgroundColor: t.subtle }]}>
                    <Text style={[styles.pillTagText, { color: t.text }]}>Toll {formatInrAmount(ride.tollEstimateInr)}</Text>
                  </View>
                )}
              </View>
            )}

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

            {hasRouteMapSection && (
              <View style={[styles.routeMapCard, { borderColor: t.border, backgroundColor: t.subtle }]}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.inputLabel, { color: t.muted, marginBottom: 0 }]}>Route Map</Text>
                  <TouchableOpacity
                    style={[
                      styles.primaryCompactButton,
                      {
                        borderColor: t.border,
                        backgroundColor: t.card,
                        opacity: routeDirectionsUrl ? 1 : 0.55
                      }
                    ]}
                    onPress={handleOpenRouteInMaps}
                    disabled={!routeDirectionsUrl}
                  >
                    <MaterialCommunityIcons name="map-marker-path" size={14} color={t.primary} />
                    <Text style={[styles.primaryCompactButtonText, { color: t.primary }]}>Open in Maps</Text>
                  </TouchableOpacity>
                </View>

                {routeCoordinates.length > 0 ? (
                  routeMapModule ? (
                    <View
                      style={[styles.routeMapFrame, { borderColor: t.border }]}
                      onLayout={(event: LayoutChangeEvent) => {
                        const { width, height } = event.nativeEvent.layout;
                        const roundedWidth = Math.round(width);
                        const roundedHeight = Math.round(height);
                        setRouteDetailOverlayLabels([]);
                        setRouteDetailMapSize((previous) =>
                          previous.width === roundedWidth && previous.height === roundedHeight
                            ? previous
                            : { width: roundedWidth, height: roundedHeight }
                        );
                        updateRouteDetailOverlayLabels({ width: roundedWidth, height: roundedHeight });
                      }}
                    >
                      <routeMapModule.MapView
                        key={routeMapKey}
                        ref={Platform.OS === 'web' ? undefined : routeDetailMapRef}
                        style={styles.routeMap}
                        initialRegion={routeRegion}
                        scrollEnabled={false}
                        zoomEnabled={false}
                        rotateEnabled={false}
                        pitchEnabled={false}
                        toolbarEnabled={false}
                        onMapReady={() => {
                          fitRouteDetailMapToBounds();
                          updateRouteDetailOverlayLabels();
                        }}
                        onPress={handleRouteMapPress}
                        mapPadding={ROUTE_MAP_PADDING}
                      >
                        <routeMapModule.Polyline coordinates={routeMapPolylineCoordinates} strokeWidth={4} strokeColor={t.primary} />
                        {routeCoordinates.map((point, index) => {
                          const isStart = index === 0;
                          const isEnd = index === routeCoordinates.length - 1;
                          const labelText = routeMapMarkerLabels[index] ?? `Stop ${index + 1}`;
                          const markerBubbleMetrics = getRouteMarkerBubbleMetrics(labelText);
                          const markerColor = routeMapMarkerColors[index] ?? (isStart ? TOKENS[theme].green : isEnd ? TOKENS[theme].red : t.primary);

                          return (
                            <routeMapModule.Marker
                              key={`${point.latitude}-${point.longitude}-${index}-${labelText}`}
                              coordinate={point}
                              anchor={{ x: 0.5, y: 1 }}
                              tracksViewChanges={Platform.OS === 'android'}
                              onPress={handleRouteMapPress}
                            >
                              <View collapsable={false} style={{ alignItems: 'center' }}>
                                {!isAndroidMarkerTextOverlayEnabled && (
                                  <View style={{ backgroundColor: markerColor, width: markerBubbleMetrics.width, minHeight: 34, paddingHorizontal: 10, justifyContent: 'center', paddingVertical: 7, borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 4 }}>
                                    <Text allowFontScaling={false} style={[styles.metaText, { width: '100%', color: '#fff', fontSize: markerBubbleMetrics.fontSize, lineHeight: markerBubbleMetrics.fontSize + 2, textAlign: 'center' }]}>
                                      {labelText}
                                    </Text>
                                  </View>
                                )}
                                {!isAndroidMarkerTextOverlayEnabled && (
                                  <View style={{ width: 0, height: 0, backgroundColor: 'transparent', borderStyle: 'solid', borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: markerColor }} />
                                )}
                                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: markerColor, borderWidth: 2, borderColor: '#fff' }} />
                              </View>
                            </routeMapModule.Marker>
                          );
                        })}
                      </routeMapModule.MapView>
                      {isAndroidMarkerTextOverlayEnabled && routeDetailOverlayLabels.length > 0 && (
                        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
                          {routeDetailOverlayLabels.map((overlayItem) => (
                            <View
                              key={overlayItem.key}
                              style={{
                                position: 'absolute',
                                left: overlayItem.left,
                                top: overlayItem.top,
                                backgroundColor: overlayItem.color,
                                width: overlayItem.width,
                                minHeight: 34,
                                paddingHorizontal: 10,
                                justifyContent: 'center',
                                paddingVertical: 7,
                                borderRadius: 8,
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.2,
                                shadowRadius: 3,
                                elevation: 4
                              }}
                            >
                              <Text
                                allowFontScaling={false}
                                style={[
                                  styles.metaText,
                                  {
                                    width: '100%',
                                    color: '#fff',
                                    fontSize: overlayItem.fontSize,
                                    lineHeight: overlayItem.fontSize + 2,
                                    textAlign: 'center'
                                  }
                                ]}
                              >
                                {overlayItem.label}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={[styles.mapUnavailable, { borderColor: t.border, backgroundColor: t.card }]}>
                      <MaterialCommunityIcons name="map-search-outline" size={18} color={t.primary} />
                      <Text style={[styles.metaText, { color: t.muted }]}>Install `react-native-maps` to render in-app route maps.</Text>
                    </View>
                  )
                ) : (
                  <View style={[styles.mapUnavailable, { borderColor: t.border, backgroundColor: t.card }]}>
                    <MaterialCommunityIcons name="map-clock-outline" size={18} color={t.primary} />
                    <Text style={[styles.metaText, { color: t.muted }]}>
                      {routeDirectionsUrl
                        ? 'Open this route in Google Maps to review the full directions.'
                        : 'Add route points on map to preview directions inside the app.'}
                    </Text>
                  </View>
                )}

              </View>
            )}
          </View>

          {hasPaymentFlow && (
            <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
              <View style={styles.rowBetween}>
                <Text style={[styles.cardHeader, { color: t.muted }]}>PAYMENTS</Text>
                <Badge color={pendingPayments.length === 0 ? 'green' : 'orange'} theme={theme}>
                  {pendingPayments.length === 0 ? 'Settled' : `${pendingPayments.length} pending`}
                </Badge>
              </View>

              <Text style={[styles.bodyText, { color: t.muted }]}>
                {ride.costType === 'Split'
                  ? `Split ${formatInrCurrency(ride.splitTotalAmount ?? 0)} across joined riders.`
                  : `Each joined rider pays ${formatInrCurrency(basePaymentAmount)} to the organizer.`}
              </Text>

              <View style={styles.profileStatsRow}>
                <View style={[styles.profileStatCard, { borderColor: t.border, backgroundColor: t.subtle }]}>
                  <Text style={[styles.profileStatValue, { color: t.text }]}>{formatInrCurrency(totalCollectableAmount)}</Text>
                  <Text style={[styles.profileStatLabel, { color: t.muted }]}>Total</Text>
                </View>
                <View style={[styles.profileStatCard, { borderColor: t.border, backgroundColor: t.subtle }]}>
                  <Text style={[styles.profileStatValue, { color: TOKENS[theme].green }]}>{formatInrCurrency(totalCollectedAmount)}</Text>
                  <Text style={[styles.profileStatLabel, { color: t.muted }]}>Collected</Text>
                </View>
              </View>

              {!hasUpiLink && (
                <View style={[styles.safetyHintCard, { borderColor: t.border, backgroundColor: t.subtle }]}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={16} color={TOKENS[theme].red} />
                  <Text style={[styles.metaText, { color: t.muted }]}>Organizer has not added a UPI link yet.</Text>
                </View>
              )}

              {!!myPaymentRow && (
                <View style={[styles.routePreview, { borderColor: t.border, backgroundColor: t.subtle }]}>
                  <View style={styles.rowBetween}>
                    <Text style={[styles.inputLabel, { color: t.muted, marginBottom: 0 }]}>Your payment</Text>
                    <Badge color={isMyPaymentPaid ? 'green' : 'slate'} theme={theme}>
                      {isMyPaymentPaid ? 'Paid' : 'Pending'}
                    </Badge>
                  </View>
                  <Text style={[styles.cardTitle, { color: t.text }]}>{formatInrCurrency(myPaymentRow.amount)}</Text>
                  {myPaymentRow.paidAt && (
                    <Text style={[styles.metaText, { color: t.muted }]}>Paid at {formatClock(myPaymentRow.paidAt)}</Text>
                  )}

                  {!isMyPaymentPaid ? (
                    hasUpiLink ? (
                      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: t.primary }]} onPress={handleOpenUpiPayment}>
                        <MaterialCommunityIcons name="qrcode-scan" size={18} color="#fff" />
                        <Text style={styles.primaryButtonText}>Pay via UPI</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.primaryButton, { backgroundColor: TOKENS[theme].blue }]}
                        onPress={() => updateRiderPaymentStatus(currentUser.id, 'paid')}
                      >
                        <MaterialCommunityIcons name="check-circle-outline" size={18} color="#fff" />
                        <Text style={styles.primaryButtonText}>Mark as Paid</Text>
                      </TouchableOpacity>
                    )
                  ) : (
                    <TouchableOpacity
                      style={[styles.ghostButton, { borderColor: t.border, backgroundColor: t.card }]}
                      onPress={() => updateRiderPaymentStatus(currentUser.id, 'pending')}
                    >
                      <MaterialCommunityIcons name="history" size={16} color={t.muted} />
                      <Text style={[styles.ghostButtonText, { color: t.muted }]}>Mark Pending</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <Text style={[styles.cardHeader, { color: t.muted }]}>RIDER STATUS</Text>
              <View style={styles.liveParticipantList}>
                {paymentRows.map((row) => (
                  <View key={`payment-${row.userId}`} style={[styles.requestRow, { borderColor: t.border, backgroundColor: t.subtle }]}>
                    <View style={styles.rowAligned}>
                      <Image source={{ uri: row.user?.avatar || avatarFallback }} style={styles.avatarSmall} />
                      <View>
                        <Text style={[styles.boldText, { color: t.text }]}>{row.user?.name ?? 'Rider'}</Text>
                        <Text style={[styles.metaText, { color: t.muted }]}>{formatInrCurrency(row.amount)}</Text>
                      </View>
                    </View>
                    <View style={styles.rowAligned}>
                      <Badge color={row.status === 'paid' ? 'green' : 'slate'} theme={theme}>
                        {row.status === 'paid' ? 'Paid' : 'Pending'}
                      </Badge>
                      {isCreator && (
                        <TouchableOpacity
                          style={[styles.primaryCompactButton, { borderColor: t.border, backgroundColor: t.card }]}
                          onPress={() => updateRiderPaymentStatus(row.userId, row.status === 'paid' ? 'pending' : 'paid')}
                        >
                          <MaterialCommunityIcons
                            name={row.status === 'paid' ? 'arrow-u-left-top' : 'check'}
                            size={14}
                            color={t.primary}
                          />
                          <Text style={[styles.primaryCompactButtonText, { color: t.primary }]}>
                            {row.status === 'paid' ? 'Reopen' : 'Settle'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.cardHeader, { color: t.muted }]}>LIVE TRACKING + SAFETY</Text>
              <Badge color={isLiveTrackingActive ? 'green' : 'orange'} theme={theme}>
                {isLiveTrackingActive ? 'Active' : 'Inactive'}
              </Badge>
            </View>

            <Text style={[styles.bodyText, { color: t.muted }]}>
              {isLiveTrackingActive
                ? 'Realtime location updates and SOS alerts are live for this ride.'
                : isCreator
                  ? 'Start live tracking before ride-out so participants can check in and share location.'
                  : 'Waiting for the organizer to start live tracking for this ride.'}
            </Text>

            {!!liveTrackingSyncError && (
              <View style={[styles.syncBanner, { borderColor: `${TOKENS[theme].red}66`, backgroundColor: t.subtle }]}>
                <MaterialCommunityIcons name="cloud-alert-outline" size={18} color={TOKENS[theme].red} />
                <View style={styles.syncBannerContent}>
                  <Text style={[styles.syncBannerTitle, { color: TOKENS[theme].red }]}>Live Sync Failed</Text>
                  <Text style={[styles.syncBannerMessage, { color: t.muted }]}>{liveTrackingSyncError}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.syncBannerRetry, { borderColor: t.border, backgroundColor: t.card, opacity: isLiveTrackingSyncing ? 0.7 : 1 }]}
                  onPress={onRetryRideTrackingSync}
                  disabled={!onRetryRideTrackingSync || isLiveTrackingSyncing}
                >
                  {isLiveTrackingSyncing ? (
                    <ActivityIndicator size="small" color={t.primary} />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="refresh" size={14} color={t.primary} />
                      <Text style={[styles.syncBannerRetryText, { color: t.primary }]}>Retry</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {isCreator ? (
              <TouchableOpacity
                style={[
                  styles.safetyActionButton,
                  {
                    borderColor: isLiveTrackingActive ? `${TOKENS[theme].red}66` : t.border,
                    backgroundColor: isLiveTrackingActive ? `${TOKENS[theme].red}14` : t.subtle,
                    opacity: isStartingRideTracking || isStoppingRideTracking ? 0.75 : 1
                  }
                ]}
                onPress={() => (isLiveTrackingActive ? onStopRideTracking?.(ride.id) : onStartRideTracking?.(ride.id))}
                disabled={isStartingRideTracking || isStoppingRideTracking}
              >
                {isStartingRideTracking || isStoppingRideTracking ? (
                  <ActivityIndicator size="small" color={t.primary} />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name={isLiveTrackingActive ? 'stop-circle-outline' : 'play-circle-outline'}
                      size={18}
                      color={isLiveTrackingActive ? TOKENS[theme].red : t.primary}
                    />
                    <Text style={[styles.safetyActionButtonText, { color: isLiveTrackingActive ? TOKENS[theme].red : t.primary }]}>
                      {isLiveTrackingActive ? 'Stop Live Session' : 'Start Live Session'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <View style={styles.liveActionRow}>
                <TouchableOpacity
                  style={[
                    styles.safetyActionButton,
                    styles.flex1,
                    {
                      borderColor: isCheckedIn ? `${TOKENS[theme].green}66` : t.border,
                      backgroundColor: isCheckedIn ? `${TOKENS[theme].green}14` : t.subtle,
                      opacity: isRideParticipant && isLiveTrackingActive && !isUpdatingRideCheckIn ? 1 : 0.55
                    }
                  ]}
                  onPress={() => onToggleRideCheckIn?.(ride.id, !isCheckedIn)}
                  disabled={!isRideParticipant || !isLiveTrackingActive || isUpdatingRideCheckIn}
                >
                  {isUpdatingRideCheckIn ? (
                    <ActivityIndicator size="small" color={t.primary} />
                  ) : (
                    <>
                      <MaterialCommunityIcons
                        name={isCheckedIn ? 'shield-check-outline' : 'shield-outline'}
                        size={18}
                        color={isCheckedIn ? TOKENS[theme].green : t.primary}
                      />
                      <Text style={[styles.safetyActionButtonText, { color: isCheckedIn ? TOKENS[theme].green : t.primary }]}>
                        {isCheckedIn ? 'Checked In' : 'Check In'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.safetyActionButton,
                    styles.flex1,
                    {
                      borderColor: `${TOKENS[theme].red}66`,
                      backgroundColor: `${TOKENS[theme].red}14`,
                      opacity: isRideParticipant && isLiveTrackingActive && !isSendingRideSos ? 1 : 0.55
                    }
                  ]}
                  onPress={() => onSendRideSos?.(ride.id)}
                  disabled={!isRideParticipant || !isLiveTrackingActive || isSendingRideSos}
                >
                  {isSendingRideSos ? (
                    <ActivityIndicator size="small" color={TOKENS[theme].red} />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="alert-outline" size={18} color={TOKENS[theme].red} />
                      <Text style={[styles.safetyActionButtonText, { color: TOKENS[theme].red }]}>Send SOS</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {!isCreator && !isRideParticipant && (
              <View style={[styles.safetyHintCard, { borderColor: t.border, backgroundColor: t.subtle }]}>
                <MaterialCommunityIcons name="information-outline" size={16} color={t.muted} />
                <Text style={[styles.metaText, { color: t.muted }]}>Join this ride to check in and use SOS mode.</Text>
              </View>
            )}

            {!isCreator && (
              <View style={[styles.safetyHintCard, { borderColor: t.border, backgroundColor: t.subtle }]}>
                <MaterialCommunityIcons name="map-marker-radius-outline" size={16} color={t.muted} />
                <Text style={[styles.metaText, { color: t.muted }]}>
                  {startCheckpoint
                    ? `Check-in is geofenced to ${rideCheckInGeofenceRadiusMeters}m around start point (${startCheckpoint.label ?? 'Waypoint 1'}).`
                    : 'Organizer needs to set a route start point before geofenced check-in can work.'}
                </Text>
              </View>
            )}

            {isLiveTrackingActive && (
              <View style={styles.liveParticipantList}>
                {liveParticipantStates.map(({ user, state, checkedIn, hasLocation }) => {
                  const latestLocationTimestamp = state?.lastLocation?.updatedAt;

                  return (
                    <View key={user.participantId} style={[styles.liveParticipantRow, { borderColor: t.border, backgroundColor: t.subtle }]}>
                      <View style={styles.rowAligned}>
                        <Image source={{ uri: user.avatar || avatarFallback }} style={styles.avatarTiny} />
                        <View>
                          <Text style={[styles.boldText, { color: t.text }]}>{user.name}</Text>
                          <Text style={[styles.metaText, { color: t.muted }]}>
                            {checkedIn ? 'Checked in' : 'Not checked in'}
                            {latestLocationTimestamp ? ` • ${formatClock(latestLocationTimestamp)}` : ''}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.rowAligned}>
                        {hasLocation && <MaterialCommunityIcons name="crosshairs-gps" size={16} color={t.primary} />}
                        <MaterialCommunityIcons
                          name={checkedIn ? 'check-circle' : 'clock-outline'}
                          size={16}
                          color={checkedIn ? TOKENS[theme].green : t.muted}
                          style={hasLocation ? { marginLeft: 8 } : undefined}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {isLiveTrackingActive && (
              <View>
                <Text style={[styles.inputLabel, { color: t.muted, marginBottom: 8 }]}>Participant Status</Text>
                <View style={styles.liveStatusBadgeWrap}>
                  {liveParticipantStates.map(({ user, status }) => {
                    const badgeTone = colorForBadge(status.badgeColor, theme);
                    const riderName = getDisplayFirstName(user.name);

                    return (
                      <View
                        key={`live-status-${user.participantId}`}
                        style={[styles.liveStatusBadge, { borderColor: badgeTone.border, backgroundColor: badgeTone.bg }]}
                      >
                        <MaterialCommunityIcons name={status.icon} size={12} color={badgeTone.text} />
                        <Text style={[styles.liveStatusBadgeText, { color: badgeTone.text }]}>
                          {riderName} • {status.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {isLiveTrackingActive && liveParticipantCoordinates.length > 0 && routeMapModule && (
              <View style={[styles.routeMapFrame, { borderColor: t.border }]}>
                <routeMapModule.MapView style={styles.routeMap} initialRegion={liveTrackingRegion}>
                  {routeCoordinates.length > 1 && (
                    <routeMapModule.Polyline coordinates={routeCoordinates} strokeWidth={3} strokeColor={`${t.primary}88`} />
                  )}
                  {liveParticipantCoordinates.map((participant) => (
                    <routeMapModule.Marker
                      key={`live-${participant.id}`}
                      coordinate={participant.coordinate}
                      title={participant.name}
                      description={`${participant.statusLabel} • ${formatClock(participant.updatedAt)}`}
                      pinColor={participant.markerColor}
                    />
                  ))}
                </routeMapModule.MapView>
              </View>
            )}

            {isLiveTrackingActive && liveParticipantCoordinates.length === 0 && (
              <View style={[styles.mapUnavailable, { borderColor: t.border, backgroundColor: t.subtle }]}>
                <MaterialCommunityIcons name="crosshairs-question" size={18} color={t.primary} />
                <Text style={[styles.metaText, { color: t.muted }]}>Waiting for riders to share live location.</Text>
              </View>
            )}

            {lastSos && (
              <View style={[styles.sosAlertCard, { borderColor: `${TOKENS[theme].red}66`, backgroundColor: `${TOKENS[theme].red}14` }]}>
                <MaterialCommunityIcons name="alert-decagram-outline" size={18} color={TOKENS[theme].red} />
                <View style={styles.flex1}>
                  <Text style={[styles.sosAlertTitle, { color: TOKENS[theme].red }]}>Latest SOS Alert</Text>
                  <Text style={[styles.metaText, { color: t.muted }]}>
                    {lastSosUser?.name ?? 'Rider'} • {formatClock(lastSos.createdAt)}
                  </Text>
                  <Text style={[styles.bodyText, { color: t.text }]}>{lastSos.message}</Text>
                </View>
              </View>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
            <Text style={[styles.cardHeader, { color: t.muted }]}>RIDERS ({participants.length})</Text>
            <View style={styles.wrapRow}>
              {participants.map((u) => (
                <TouchableOpacity
                  key={u.participantId}
                  style={styles.participantPill}
                  onPress={() => onHandleViewProfile?.(u.profileId)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${u.name}'s profile`}
                >
                  <Image source={{ uri: u.avatar || avatarFallback }} style={styles.avatarTiny} />
                  <Text style={[styles.metaText, { color: t.text, textAlign: 'center' }]}>{getDisplayFirstName(u.name)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {isCreator && requestEntries.length > 0 && !isRideClosed && (
            <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
              <Text style={[styles.cardHeader, { color: t.primary }]}>JOIN REQUESTS ({requestEntries.length})</Text>
              {requestEntries.map((entry) => (
                <View key={entry.id} style={[styles.requestRow, { borderColor: t.border }]}>
                  <View style={styles.rowAligned}>
                    <Image source={{ uri: entry.avatar }} style={styles.avatarSmall} />
                    <View>
                      <Text style={[styles.boldText, { color: t.text }]}>{entry.name}</Text>
                      <Text style={[styles.metaText, { color: t.muted }]}>{entry.bikeModel}</Text>
                    </View>
                  </View>
                  <View style={styles.rowAligned}>
                    <TouchableOpacity
                      style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}
                      onPress={() => onRejectRequest(ride.id, entry.id)}
                    >
                      <MaterialCommunityIcons name="close" size={18} color={TOKENS[theme].red} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.iconButton, { borderColor: t.primary, backgroundColor: t.primary }]}
                      onPress={() => onAcceptRequest(ride.id, entry.id)}
                    >
                      <MaterialCommunityIcons name="check" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {isCreator && requestEntries.length > 0 && isRideClosed && (
            <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
              <Text style={[styles.cardHeader, { color: TOKENS[theme].red }]}>JOIN REQUESTS ({requestEntries.length})</Text>
              <View style={[styles.statusStrip, { borderColor: `${TOKENS[theme].red}55`, backgroundColor: `${TOKENS[theme].red}14` }]}>
                <MaterialCommunityIcons name="clock-alert-outline" size={18} color={TOKENS[theme].red} />
                <Text style={[styles.statusStripText, { color: TOKENS[theme].red }]}>Ride closed. New join approvals are disabled.</Text>
              </View>
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
            <TouchableOpacity
              style={[styles.dangerButton, { borderColor: TOKENS[theme].red }]}
              onPress={() =>
                Alert.alert('Leave ride?', 'You can join again later if seats are available.', [
                  { text: 'Stay', style: 'cancel' },
                  { text: 'Leave Ride', style: 'destructive', onPress: () => onLeaveRide(ride.id) }
                ])
              }
            >
              <MaterialCommunityIcons name="account-arrow-right-outline" size={18} color={TOKENS[theme].red} />
              <Text style={[styles.dangerButtonText, { color: TOKENS[theme].red }]}>Leave Ride</Text>
            </TouchableOpacity>
          ) : isCreatorBlocked ? (
            <View style={[styles.statusStrip, { borderColor: TOKENS[theme].red, backgroundColor: `${TOKENS[theme].red}1f` }]}>
              <MaterialCommunityIcons name="account-cancel-outline" size={18} color={TOKENS[theme].red} />
              <Text style={[styles.statusStripText, { color: TOKENS[theme].red }]}>Creator blocked</Text>
            </View>
          ) : isRideClosed ? (
            <View style={[styles.statusStrip, { borderColor: TOKENS[theme].red, backgroundColor: `${TOKENS[theme].red}14` }]}>
              <MaterialCommunityIcons name="clock-alert-outline" size={18} color={TOKENS[theme].red} />
              <Text style={[styles.statusStripText, { color: TOKENS[theme].red }]}>Ride closed</Text>
            </View>
          ) : isPending ? (
            <View style={[styles.statusStrip, { borderColor: t.border, backgroundColor: t.subtle }]}>
              <MaterialCommunityIcons name="clock-outline" size={18} color={t.muted} />
              <Text style={[styles.statusStripText, { color: t.muted }]}>Request sent</Text>
            </View>
          ) : (
            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: t.primary }]} onPress={() => onRequestJoin(ride.id)}>
              <MaterialCommunityIcons
                name={requiresJoinApproval ? 'account-clock-outline' : 'account-plus-outline'}
                size={18}
                color="#fff"
              />
              <Text style={styles.primaryButtonText}>{requiresJoinApproval ? 'Request to Join' : 'Join Ride'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaContextView>
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
  isLimitedProfile,
  friendStatus,
  isBlocked,
  onClose,
  onMessage,
  onAddFriend,
  onBlockUser,
  theme
}: {
  visible: boolean;
  user: User | null;
  rides: RidePost[];
  isLimitedProfile?: boolean;
  friendStatus: FriendStatus;
  isBlocked: boolean;
  onClose: () => void;
  onMessage: (userId: string) => void;
  onAddFriend: (userId: string) => void;
  onBlockUser: (userId: string) => void;
  theme: Theme;
}) => {
  const t = TOKENS[theme];

  if (!user) return null;

  const userRides = rides.filter((ride) => ride.creatorId === user.id || ride.currentParticipants.includes(user.id));
  const canMessage = friendStatus !== 'self' && !isBlocked;
  const canAddFriend = friendStatus === 'none' && !isBlocked;
  const friendButtonLabel = friendStatus === 'friend' ? 'Connected' : friendStatus === 'requested' ? 'Pending' : friendStatus === 'self' ? 'You' : 'Add';
  const hasCity = Boolean(user.city?.trim());
  const hasGarage = user.garage.length > 0;
  const hasStyle = Boolean(user.style?.trim());
  const hasWindow = Boolean(user.typicalRideTime?.trim());

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalBackdrop}>
        <Pressable style={styles.modalScrim} onPress={onClose} />
        <View style={[styles.profileSheet, { backgroundColor: t.bg, borderTopColor: t.primary }]}>
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
                <TouchableOpacity style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]} onPress={onClose}>
                  <MaterialCommunityIcons name="close" size={18} color={t.muted} />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={[styles.profileName, { color: t.text }]}>{user.fullName?.trim() || user.name}</Text>
            {isLimitedProfile && (
              <Text style={[styles.metaText, { color: t.muted }]}>Basic profile preview from feed data.</Text>
            )}

            {isBlocked && (
              <View style={[styles.newsScoreChip, { borderColor: TOKENS[theme].red, backgroundColor: `${TOKENS[theme].red}1f` }]}>
                <Text style={[styles.metaText, { color: TOKENS[theme].red }]}>Blocked</Text>
              </View>
            )}

            <View style={styles.rowAligned}>
              <Badge color="orange" theme={theme}>
                {user.experience}
              </Badge>
              {hasCity && (
                <>
                  <View style={{ width: 8 }} />
                  <Badge color="blue" theme={theme}>
                    {user.city}
                  </Badge>
                </>
              )}
            </View>

            {isLimitedProfile ? (
              <View style={styles.profileStatsRow}>
                <View style={[styles.profileStatCard, { borderColor: t.border, backgroundColor: t.subtle }]}>
                  <Text style={[styles.profileStatValue, { color: t.text }]}>{userRides.length}</Text>
                  <Text style={[styles.profileStatLabel, { color: t.muted }]}>Rides</Text>
                </View>
              </View>
            ) : (
              <View style={styles.profileStatsRow}>
                <View style={[styles.profileStatCard, { borderColor: t.border, backgroundColor: t.subtle }]}>
                  <Text style={[styles.profileStatValue, { color: t.text }]}>{user.friends.length}</Text>
                  <Text style={[styles.profileStatLabel, { color: t.muted }]}>Group</Text>
                </View>
                <View style={[styles.profileStatCard, { borderColor: t.border, backgroundColor: t.subtle }]}>
                  <Text style={[styles.profileStatValue, { color: t.text }]}>{userRides.length}</Text>
                  <Text style={[styles.profileStatLabel, { color: t.muted }]}>Rides</Text>
                </View>
                <View style={[styles.profileStatCard, { borderColor: t.border, backgroundColor: t.subtle }]}>
                  <Text style={[styles.profileStatValue, { color: t.text }]}>{user.garage.length}</Text>
                  <Text style={[styles.profileStatLabel, { color: t.muted }]}>Machines</Text>
                </View>
              </View>
            )}

            {hasGarage && (
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
            )}

            {(hasStyle || hasWindow) && (
              <View style={styles.gridTwo}>
                {hasStyle && (
                  <View style={[styles.infoTile, { borderColor: t.border, backgroundColor: t.subtle }]}>
                    <Text style={[styles.inputLabel, { color: t.muted }]}>Style</Text>
                    <Text style={[styles.bodyText, { color: t.text }]}>{user.style}</Text>
                  </View>
                )}
                {hasWindow && (
                  <View style={[styles.infoTile, { borderColor: t.border, backgroundColor: t.subtle }]}>
                    <Text style={[styles.inputLabel, { color: t.muted }]}>Window</Text>
                    <Text style={[styles.bodyText, { color: t.text }]}>{user.typicalRideTime}</Text>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

export const CreateGroupModal = ({
  visible,
  onClose,
  onSubmit,
  isSubmitting,
  mode = 'create',
  initialData,
  theme
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; description: string; rideStyles: string[]; joinPermission: GroupJoinPermission; rideCreatePermission: GroupRideCreatePermission; avatarUri?: string }) => void;
  isSubmitting: boolean;
  mode?: 'create' | 'edit';
  initialData?: Group | null;
  theme: Theme;
}) => {
  const t = TOKENS[theme];
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rideStyles, setRideStyles] = useState<string[]>(['Touring']);
  const [joinPermission, setJoinPermission] = useState<GroupJoinPermission>('anyone');
  const [rideCreatePermission, setRideCreatePermission] = useState<GroupRideCreatePermission>('anyone');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  const rideStyleOptions = ['Touring', 'City / Urban', 'Adventure / Off-road', 'Night Cruise', 'Sport', 'Cafe Racer'];

  const toggleRideStyle = (style: string) => {
    setRideStyles((prev) => {
      if (prev.includes(style)) {
        if (prev.length === 1) return prev;
        return prev.filter((item) => item !== style);
      }
      return [...prev, style];
    });
  };

  useEffect(() => {
    if (!visible) {
      setName('');
      setDescription('');
      setRideStyles(['Touring']);
      setJoinPermission('anyone');
      setRideCreatePermission('anyone');
      setAvatarUri(null);
      return;
    }

    if (mode === 'edit' && initialData) {
      setName(initialData.name);
      setDescription(initialData.description);
      setRideStyles(initialData.rideStyles.length > 0 ? [...initialData.rideStyles] : ['Touring']);
      setJoinPermission(initialData.joinPermission);
      setRideCreatePermission(initialData.rideCreatePermission ?? 'anyone');
      setAvatarUri(initialData.avatar || null);
      return;
    }

    setName('');
    setDescription('');
    setRideStyles(['Touring']);
    setJoinPermission('anyone');
    setRideCreatePermission('anyone');
    setAvatarUri(null);
  }, [initialData, mode, visible]);

  const handlePickGroupPhoto = async () => {
    if (isSubmitting) return;
    const localUri = await pickImageFromLibrary();
    if (!localUri) return;
    setAvatarUri(localUri);
  };

  const submit = () => {
    if (isSubmitting) return;
    if (!name.trim() || !description.trim() || rideStyles.length === 0) return;
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      rideStyles,
      joinPermission,
      rideCreatePermission,
      avatarUri: avatarUri ?? undefined
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalBackdrop}>
        <Pressable style={styles.modalScrim} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
          <View style={[styles.bottomSheet, { backgroundColor: t.surface, borderTopColor: t.primary }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.modalTitle, { color: t.text }]}>{mode === 'edit' ? 'Edit Group' : 'Create Group'}</Text>
              <TouchableOpacity onPress={onClose}>
                <MaterialCommunityIcons name="close" size={24} color={t.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formSection} showsVerticalScrollIndicator={false}>
              <View style={styles.rowAligned}>
                <Image source={{ uri: avatarUri || avatarFallback }} style={styles.groupAvatar} />
                <TouchableOpacity
                  style={[styles.primaryCompactButton, { borderColor: t.border, backgroundColor: t.subtle }]}
                  onPress={() => {
                    void handlePickGroupPhoto();
                  }}
                  disabled={isSubmitting}
                >
                  <MaterialCommunityIcons name="camera" size={14} color={t.primary} />
                  <Text style={[styles.primaryCompactButtonText, { color: t.primary }]}>Choose Group Photo</Text>
                </TouchableOpacity>
              </View>

              <LabeledInput label="Group Name" value={name} onChangeText={setName} theme={theme} placeholder="e.g. NCR Touring Pack" />

              <View>
                <Text style={[styles.inputLabel, { color: t.muted }]}>Description</Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline, { backgroundColor: t.subtle, borderColor: t.border, color: t.text }]}
                  multiline
                  textAlignVertical="top"
                  value={description}
                  onChangeText={setDescription}
                  placeholder="What's your group about?"
                  placeholderTextColor={t.muted}
                />
              </View>

              <View>
                <Text style={[styles.inputLabel, { color: t.muted }]}>Ride Styles</Text>
                <View style={styles.wrapRow}>
                  {rideStyleOptions.map((option) => {
                    const isActive = rideStyles.includes(option);
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
                        onPress={() => toggleRideStyle(option)}
                      >
                        <Text style={[styles.selectorChipText, { color: isActive ? t.primary : t.muted }]}>{option}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={[styles.metaText, { color: t.muted, marginTop: 8 }]}>Select one or more styles.</Text>
              </View>

              <View>
                <Text style={[styles.inputLabel, { color: t.muted }]}>Join Permission</Text>
                <View style={styles.wrapRow}>
                  <TouchableOpacity
                    style={[
                      styles.selectorChip,
                      {
                        borderColor: joinPermission === 'anyone' ? t.primary : t.border,
                        backgroundColor: joinPermission === 'anyone' ? `${t.primary}22` : t.subtle
                      }
                    ]}
                    onPress={() => setJoinPermission('anyone')}
                  >
                    <Text style={[styles.selectorChipText, { color: joinPermission === 'anyone' ? t.primary : t.muted }]}>Anyone</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.selectorChip,
                      {
                        borderColor: joinPermission === 'request_to_join' ? t.primary : t.border,
                        backgroundColor: joinPermission === 'request_to_join' ? `${t.primary}22` : t.subtle
                      }
                    ]}
                    onPress={() => setJoinPermission('request_to_join')}
                  >
                    <Text style={[styles.selectorChipText, { color: joinPermission === 'request_to_join' ? t.primary : t.muted }]}>
                      Request to Join
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.selectorChip,
                      {
                        borderColor: joinPermission === 'invite_only' ? t.primary : t.border,
                        backgroundColor: joinPermission === 'invite_only' ? `${t.primary}22` : t.subtle
                      }
                    ]}
                    onPress={() => setJoinPermission('invite_only')}
                  >
                    <Text style={[styles.selectorChipText, { color: joinPermission === 'invite_only' ? t.primary : t.muted }]}>
                      Invite Only
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View>
                <Text style={[styles.inputLabel, { color: t.muted }]}>Who Can Create Rides</Text>
                <View style={styles.wrapRow}>
                  <TouchableOpacity
                    style={[
                      styles.selectorChip,
                      {
                        borderColor: rideCreatePermission === 'anyone' ? t.primary : t.border,
                        backgroundColor: rideCreatePermission === 'anyone' ? `${t.primary}22` : t.subtle
                      }
                    ]}
                    onPress={() => setRideCreatePermission('anyone')}
                  >
                    <Text style={[styles.selectorChipText, { color: rideCreatePermission === 'anyone' ? t.primary : t.muted }]}>Anyone</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.selectorChip,
                      {
                        borderColor: rideCreatePermission === 'admin' ? t.primary : t.border,
                        backgroundColor: rideCreatePermission === 'admin' ? `${t.primary}22` : t.subtle
                      }
                    ]}
                    onPress={() => setRideCreatePermission('admin')}
                  >
                    <Text style={[styles.selectorChipText, { color: rideCreatePermission === 'admin' ? t.primary : t.muted }]}>
                      Admin Only
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: t.primary }]} onPress={submit} disabled={isSubmitting}>
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialCommunityIcons name="account-group" size={18} color="#fff" />
                )}
                <Text style={styles.primaryButtonText}>
                  {isSubmitting
                    ? (mode === 'edit' ? 'Saving...' : 'Uploading...')
                    : (mode === 'edit' ? 'Save Changes' : 'Create Group')}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

export const GroupDetailModal = ({
  visible,
  group,
  rides,
  currentUser,
  users,
  onClose,
  onOpenGroupChat,
  onJoinGroup,
  onLeaveGroup,
  onAcceptJoinRequest,
  onRejectJoinRequest,
  onPromoteAdmin,
  onDemoteAdmin,
  onEditGroup,
  onDeleteGroup,
  onRemoveMember,
  onViewProfile,
  theme
}: {
  visible: boolean;
  group: Group | null;
  rides: RidePost[];
  currentUser: User;
  users: User[];
  onClose: () => void;
  onOpenGroupChat: (groupId: string) => void;
  onJoinGroup: (groupId: string) => void;
  onLeaveGroup: (groupId: string) => void;
  onAcceptJoinRequest: (groupId: string, userId: string) => void;
  onRejectJoinRequest: (groupId: string, userId: string) => void;
  onPromoteAdmin: (groupId: string, userId: string) => void;
  onDemoteAdmin: (groupId: string, userId: string) => void;
  onEditGroup: (groupId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onRemoveMember: (groupId: string, userId: string) => void;
  onViewProfile: (userId: string) => void;
  theme: Theme;
}) => {
  const t = TOKENS[theme];
  const insets = useSafeAreaInsets();
  const topInset = getAndroidTopInset(insets);
  const [isLeadershipExpanded, setIsLeadershipExpanded] = useState(false);

  if (!group) return null;

  const allUsers = Array.from(new Map([currentUser, ...users].map((user) => [user.id, user])).values());
  const resolveUserForGroupId = (memberId: string): User | undefined => {
    const exact = allUsers.find((user) => user.id === memberId);
    if (exact && !exact.isInferredProfile) return exact;

    const aliasMatch = memberId.match(/^user-(\d{10})$/);
    if (!aliasMatch) return exact;
    const aliasPhoneLast10 = aliasMatch[1];

    const matched = allUsers.find((user) => {
      if (user.id === memberId) return false;
      const digits = (user.phoneNumber ?? '').replace(/\D/g, '');
      return digits.length >= 10 && digits.slice(-10) === aliasPhoneLast10 && user.isInferredProfile !== true;
    });
    if (matched) return matched;

    return allUsers.find((user) => {
      const digits = (user.phoneNumber ?? '').replace(/\D/g, '');
      return digits.length >= 10 && digits.slice(-10) === aliasPhoneLast10;
    }) ?? exact;
  };
  const isMember = group.members.includes(currentUser.id);
  const isOwner = group.creatorId === currentUser.id;
  const isAdmin = group.adminIds.includes(currentUser.id);
  const canManageRequests = isOwner || isAdmin;
  const isPending = group.joinRequests.includes(currentUser.id);
  const requestUsers = Array.from(new Set(group.joinRequests)).flatMap((memberId: string) => {
    const resolved = resolveUserForGroupId(memberId);
    return resolved ? [resolved] : [];
  });
  const joinPermissionLabel =
    group.joinPermission === 'invite_only'
      ? 'Invite only'
      : group.joinPermission === 'request_to_join'
        ? 'Request approval'
        : 'Anyone can join';
  const getMemberRole = (memberId: string): GroupRole => {
    if (memberId === group.creatorId) return 'owner';
    if (group.adminIds.includes(memberId)) return 'admin';
    return 'member';
  };
  const handleShareGroup = () => {
    const details = [`Check out "${group.name}" on ThrottleUp.`, group.city ? `City: ${group.city}` : null]
      .filter(Boolean)
      .join('\n');
    void Share.share({
      title: group.name,
      message: details
    });
  };
  const openGroupActions = () => {
    const actions: Array<{ text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }> = [];
    if (isOwner) {
      actions.push({
        text: 'Edit Group',
        onPress: () => onEditGroup(group.id)
      });
      actions.push({
        text: 'Delete Group',
        style: 'destructive',
        onPress: () => onDeleteGroup(group.id)
      });
    } else if (isMember || isPending) {
      actions.push({
        text: isPending ? 'Cancel Join Request' : 'Leave Group',
        style: 'destructive',
        onPress: () => onLeaveGroup(group.id)
      });
    }
    actions.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Group Actions', 'Manage this group', actions);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg, paddingTop: topInset }]}>
        <View style={[styles.modalHeader, { borderBottomColor: t.border }]}>
          <View style={styles.rowAligned}>
            <TouchableOpacity onPress={onClose} style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}>
              <MaterialCommunityIcons name="arrow-left" size={20} color={t.text} />
            </TouchableOpacity>
            <View style={{ marginLeft: 'auto', flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={handleShareGroup} style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}>
                <MaterialCommunityIcons name="share-variant" size={20} color={t.text} />
              </TouchableOpacity>
              <TouchableOpacity onPress={openGroupActions} style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}>
                <MaterialCommunityIcons name="dots-vertical" size={20} color={t.text} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 100 }} bounces={false} showsVerticalScrollIndicator={false}>
          {/* Top Banner Pattern */}
          <View style={{ height: 100, backgroundColor: t.primary, opacity: 0.2, overflow: 'hidden' }}>
            <View style={{
               position: 'absolute', width: 400, height: 400, borderRadius: 200, 
               borderWidth: 1, borderColor: t.primary, top: -200, left: -50, opacity: 0.3 
            }} />
            <View style={{
               position: 'absolute', width: 450, height: 450, borderRadius: 225, 
               borderWidth: 1, borderColor: t.primary, top: -225, left: -75, opacity: 0.2 
            }} />
            <View style={{
               position: 'absolute', width: 500, height: 500, borderRadius: 250, 
               borderWidth: 1, borderColor: t.primary, top: -250, left: -100, opacity: 0.1 
            }} />
          </View>

          <View style={{ padding: 16, marginTop: -60 }}>
            {/* Avatar & Title Row */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
               <View>
                 <Image 
                   source={{ uri: group.avatar || avatarFallback }} 
                   style={{ width: 88, height: 88, borderRadius: 12, backgroundColor: t.bg, borderWidth: 3, borderColor: t.bg }} 
                 />
                 <Text style={{ fontSize: 24, fontWeight: '700', color: t.text, marginTop: 8 }}>{group.name}</Text>
                 <Text style={{ fontSize: 13, color: t.muted, fontStyle: 'italic', marginBottom: 4 }}>
                   @{group.name.toLowerCase().replace(/\s+/g, '')}
                 </Text>
                 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                   <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                     <MaterialCommunityIcons name="map-marker-outline" size={14} color={t.primary} />
                     <Text style={{ color: t.muted, fontSize: 13 }}>{group.city || 'India'}</Text>
                   </View>
                   <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                     <MaterialCommunityIcons name="shield-check-outline" size={14} color={t.primary} />
                     <Text style={{ color: t.muted, fontSize: 13 }}>Est. 2025</Text>
                   </View>
                 </View>
               </View>

               <View style={{ backgroundColor: '#10b981', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignItems: 'center' }}>
                 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MaterialCommunityIcons name="star" size={12} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>5.0</Text>
                 </View>
                 <Text style={{ color: '#fff', fontSize: 10 }}>2 reviews</Text>
               </View>
            </View>

            {/* Stats Block */}
            <View style={{ flexDirection: 'row', backgroundColor: t.subtle, borderRadius: 12, paddingVertical: 16, marginBottom: 24 }}>
               <View style={{ flex: 1, alignItems: 'center', borderRightWidth: 1, borderRightColor: t.border }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: t.primary }}>{rides.filter((r) => r.groupId === group.id).length.toString()}</Text>
                  <Text style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>Total Rides</Text>
               </View>
               <View style={{ flex: 1, alignItems: 'center', borderRightWidth: 1, borderRightColor: t.border }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: t.primary }}>1K+</Text>
                  <Text style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>Km Driven</Text>
               </View>
               <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: t.primary }}>{group.members.length.toString()}</Text>
                  <Text style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>Members</Text>
               </View>
            </View>

            <Text style={{ fontSize: 15, color: t.text, lineHeight: 22, marginBottom: 24 }}>
              {group.description}
            </Text>

            {canManageRequests && (
              <View style={{ marginBottom: 24, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 12, backgroundColor: t.card }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }}>Join Requests</Text>
                  <Text style={{ color: t.muted, fontSize: 12 }}>{requestUsers.length} pending</Text>
                </View>
                {requestUsers.length === 0 ? (
                  <Text style={{ color: t.muted, fontSize: 13 }}>No pending requests right now.</Text>
                ) : (
                  requestUsers.map((requestUser) => (
                    <View
                      key={requestUser.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        borderWidth: 1,
                        borderColor: t.border,
                        borderRadius: 10,
                        padding: 10,
                        marginBottom: 8
                      }}
                    >
                      <TouchableOpacity onPress={() => onViewProfile(requestUser.id)}>
                        <Image source={{ uri: requestUser.avatar || avatarFallback }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                      </TouchableOpacity>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: t.text, fontWeight: '600' }} numberOfLines={1}>{requestUser.name}</Text>
                      </View>
                      <TouchableOpacity
                        style={{ borderWidth: 1, borderColor: t.border, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 }}
                        onPress={() => onRejectJoinRequest(group.id, requestUser.id)}
                      >
                        <Text style={{ color: t.muted, fontSize: 12, fontWeight: '600' }}>Decline</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ borderWidth: 1, borderColor: t.primary, backgroundColor: t.primary, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 }}
                        onPress={() => onAcceptJoinRequest(group.id, requestUser.id)}
                      >
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Approve</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* Leadership Block */}
            <View style={{ marginBottom: 24 }}>
               <Text style={{ fontSize: 18, fontWeight: '600', color: t.text, marginBottom: 16 }}>Leadership</Text>
               <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                  {group.members.map((memberId) => {
                     const role = getMemberRole(memberId);
                     const isLeader = role === 'owner' || role === 'admin';
                     
                     // If shrunk, only show leaders or max 4 people.
                     if (!isLeadershipExpanded && !isLeader) return null;

                     const member = resolveUserForGroupId(memberId);
                     if (!member) return null;
                     const handle = member.id.startsWith('user-') ? `${member.name.split(' ')[0]}${member.id.slice(-4)}` : member.id.slice(-6);
                     const canManageMember = isOwner && member.id !== currentUser.id && member.id !== group.creatorId;
                     const roleLabel = role === 'owner' ? 'Owner' : role === 'admin' ? 'Admin' : null;

                     return (
                        <View key={memberId} style={{ alignItems: 'center', width: 110 }}>
                           <TouchableOpacity style={{ alignItems: 'center' }} onPress={() => onViewProfile(member.id)}>
                             <View>
                                <Image source={{ uri: member.avatar || avatarFallback }} style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: t.primary }} />
                                {roleLabel && (
                                   <View style={{ position: 'absolute', bottom: -8, alignSelf: 'center', backgroundColor: t.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 }}>
                                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>{roleLabel}</Text>
                                   </View>
                                )}
                             </View>
                             <Text style={{ fontSize: 13, color: t.text, textAlign: 'center', marginTop: 12 }} numberOfLines={1}>{member.name}</Text>
                             <Text style={{ fontSize: 11, color: t.muted, textAlign: 'center', marginTop: 2 }} numberOfLines={1}>{handle}</Text>
                           </TouchableOpacity>
                           {canManageMember && (
                             <View style={{ marginTop: 8, width: '100%', gap: 6 }}>
                               <TouchableOpacity
                                 style={{ borderWidth: 1, borderColor: t.primary, borderRadius: 8, paddingVertical: 5, alignItems: 'center' }}
                                 onPress={() => {
                                   if (role === 'admin') {
                                     onDemoteAdmin(group.id, member.id);
                                     return;
                                   }
                                   onPromoteAdmin(group.id, member.id);
                                 }}
                               >
                                 <Text style={{ color: t.primary, fontSize: 11, fontWeight: '700' }}>
                                   {role === 'admin' ? 'Demote Admin' : 'Promote Admin'}
                                 </Text>
                               </TouchableOpacity>
                               <TouchableOpacity
                                 style={{ borderWidth: 1, borderColor: '#ef4444', borderRadius: 8, paddingVertical: 5, alignItems: 'center' }}
                                 onPress={() => onRemoveMember(group.id, member.id)}
                               >
                                 <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '700' }}>Remove</Text>
                               </TouchableOpacity>
                             </View>
                           )}
                        </View>
                     );
                  })}
               </View>

               {group.members.length > group.adminIds.length + 1 && (
                 <TouchableOpacity style={{ alignItems: 'center', marginTop: 16 }} onPress={() => setIsLeadershipExpanded(!isLeadershipExpanded)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                       <Text style={{ color: t.primary, fontWeight: '600' }}>{isLeadershipExpanded ? 'View Less' : 'View More'}</Text>
                       <MaterialCommunityIcons name={isLeadershipExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={t.primary} />
                    </View>
                 </TouchableOpacity>
               )}
            </View>

            {/* Roadbook Section */}
            <View style={{ marginBottom: 16, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 24 }}>
               <Text style={{ fontSize: 18, fontWeight: '600', color: t.muted, textTransform: 'uppercase', marginBottom: 16 }}>ROADBOOK</Text>
               
               {rides.filter((r) => r.groupId === group.id).map((rideItem) => (
                  <View key={rideItem.id} style={{ marginBottom: 16 }}>
                    <RideCard 
                       ride={rideItem} 
                       currentUserId={currentUser.id} 
                       onOpenDetail={() => {}} 
                       onViewProfile={onViewProfile} 
                       theme={theme} 
                    />
                  </View>
               ))}
               
               {rides.filter((r) => r.groupId === group.id).length === 0 && (
                  <Text style={{ color: t.muted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 24 }}>No rides in roadbook yet.</Text>
               )}
            </View>

          </View>
        </ScrollView>

        {/* Sticky Bottom Action Bar */}
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: t.bg, borderTopWidth: 1, borderTopColor: t.border, paddingBottom: Math.max(insets.bottom, 16) }}>
           {isMember ? (
              <View style={{ gap: 10 }}>
                <TouchableOpacity style={[styles.primaryButton, { backgroundColor: t.primary, borderRadius: 24 }]} onPress={() => onOpenGroupChat(group.id)}>
                   <Text style={[styles.primaryButtonText, { fontSize: 16 }]}>Go To Chat</Text>
                </TouchableOpacity>
                {!isOwner && (
                  <TouchableOpacity
                    style={[styles.primaryButton, { backgroundColor: t.subtle, borderRadius: 24, borderWidth: 1, borderColor: t.border }]}
                    onPress={() => onLeaveGroup(group.id)}
                  >
                     <Text style={[styles.primaryButtonText, { color: '#ef4444', fontSize: 15 }]}>Leave Group</Text>
                  </TouchableOpacity>
                )}
              </View>
           ) : isPending ? (
              <View style={{ gap: 10 }}>
                <View style={[styles.primaryButton, { backgroundColor: t.subtle, borderRadius: 24 }]}>
                   <Text style={[styles.primaryButtonText, { color: t.muted, fontSize: 16 }]}>Request Sent</Text>
                </View>
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: t.bg, borderRadius: 24, borderWidth: 1, borderColor: t.border }]}
                  onPress={() => onLeaveGroup(group.id)}
                >
                   <Text style={[styles.primaryButtonText, { color: '#ef4444', fontSize: 15 }]}>Cancel Request</Text>
                </TouchableOpacity>
              </View>
           ) : group.joinPermission === 'invite_only' ? (
              <View style={[styles.primaryButton, { backgroundColor: t.subtle, borderRadius: 24 }]}>
                 <Text style={[styles.primaryButtonText, { color: t.muted, fontSize: 16 }]}>Invite Only</Text>
              </View>
           ) : (
              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: t.primary, borderRadius: 24 }]} onPress={() => onJoinGroup(group.id)}>
                 <Text style={[styles.primaryButtonText, { fontSize: 16 }]}>{group.joinPermission === 'request_to_join' ? 'Request to Join' : 'Join Group'}</Text>
              </TouchableOpacity>
           )}
        </View>

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

export const RideCreatedSuccessfullyModal = ({
  visible,
  theme,
  ride,
  onClose,
  onViewProfile,
  currentUserId
}: {
  visible: boolean;
  theme: Theme;
  ride: RidePost | null;
  onClose: () => void;
  onViewProfile?: (userId: string) => void;
  currentUserId: string;
}) => {
  const t = TOKENS[theme];
  if (!ride) return null;

  const handleShare = async () => {
    try {
      await Share.share({
        title: ride.title,
        message: `Join my ride "${ride.title}" on ThrottleUp!`
      });
    } catch {
      // ignore
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, styles.modalScrim, { justifyContent: 'center', alignItems: 'center' }]}>
        <View style={{ width: '90%', maxWidth: 400, alignItems: 'center' }}>
          <TouchableOpacity 
            onPress={onClose}
            style={{
              marginBottom: 16,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: t.surface,
              justifyContent: 'center',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: t.border
            }}
          >
            <MaterialCommunityIcons name="close" size={20} color={t.text} />
          </TouchableOpacity>

          <View style={{ 
            backgroundColor: t.surface, 
            borderRadius: 16, 
            width: '100%', 
            padding: 20,
            paddingBottom: 24,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
            elevation: 8,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24, alignSelf: 'flex-start', marginLeft: 10 }}>
              <View style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: '#10b981',
                marginRight: 12
              }} />
              <Text style={{ fontSize: 18, fontWeight: '500', color: t.text }}>Ride created successfully</Text>
            </View>

            <View style={{ width: '100%' }}>
              <RideCard 
                ride={ride} 
                currentUserId={currentUserId} 
                onOpenDetail={() => {}} 
                onViewProfile={onViewProfile} 
                theme={theme} 
              />
            </View>
          </View>

          <View style={{ marginTop: 40, alignItems: 'center' }}>
            <TouchableOpacity 
              onPress={handleShare}
              style={{
                width: 50,
                height: 50,
                borderRadius: 25,
                backgroundColor: t.surface,
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 8,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 8,
                elevation: 4
              }}
            >
              <MaterialCommunityIcons name="share" size={24} color={t.primary} />
            </TouchableOpacity>
            <Text style={{ color: t.primary, fontSize: 13, fontWeight: '600' }}>Share</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
};
