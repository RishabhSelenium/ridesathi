import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { Notification } from '../types';
import { PermissionStatus, avatarFallback } from './ui';

export type NotificationSoundKind = 'ride' | 'message';

const NOTIFICATION_CHANNEL_IDS: Record<NotificationSoundKind, string> = {
  ride: 'throttleup-ride-alerts',
  message: 'throttleup-message-alerts'
};
const NOTIFICATION_SOUNDS: Record<NotificationSoundKind, string> = {
  ride: 'Ride_notification.mp3',
  message: 'msg_notification.mp3'
};
const EXPO_PUSH_TOKEN_REGEX = /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/;
const VALID_NOTIFICATION_TYPES: Notification['type'][] = [
  'friend_request',
  'ride_joined',
  'ride_request',
  'help_helpful',
  'message'
];

type NotificationModule = typeof import('expo-notifications');
type ExpoNotification = import('expo-notifications').Notification;
type ExpoNotificationResponse = import('expo-notifications').NotificationResponse;
type NotificationSubscription = { remove(): void };

type StoredNotificationSeed = {
  id?: string;
  type?: string;
  senderId?: string;
  senderName?: string;
  senderAvatar?: string;
  content: string;
  timestamp?: string;
  read?: boolean;
  data?: Record<string, unknown>;
};

const loadNotificationsModule = async (): Promise<NotificationModule> => import('expo-notifications');

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const asString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const normalizeNotificationType = (value: unknown): Notification['type'] =>
  VALID_NOTIFICATION_TYPES.includes(value as Notification['type']) ? (value as Notification['type']) : 'message';

const buildNotificationTimestamp = (value?: string): string => {
  if (!value) return new Date().toISOString();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
};

export const buildStoredNotification = (seed: StoredNotificationSeed): Notification => ({
  id: seed.id || `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  type: normalizeNotificationType(seed.type),
  senderId: seed.senderId || 'system',
  senderName: seed.senderName || 'ThrottleUp',
  senderAvatar: seed.senderAvatar || avatarFallback,
  content: seed.content.trim(),
  timestamp: buildNotificationTimestamp(seed.timestamp),
  read: seed.read ?? false,
  data: seed.data
});

export const mergeNotification = (items: Notification[], notification: Notification, maxItems = 100): Notification[] => {
  const existingById = items.find((item) => item.id === notification.id);
  if (existingById) {
    return items.map((item) => (item.id === notification.id ? { ...item, ...notification } : item));
  }

  const next = [notification, ...items];
  return next.slice(0, maxItems);
};

export const setupNotificationChannel = async (isExpoGo: boolean): Promise<void> => {
  if (isExpoGo || Platform.OS !== 'android') return;
  const Notifications = await loadNotificationsModule();

  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_IDS.ride, {
    name: 'ThrottleUp Ride Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    sound: NOTIFICATION_SOUNDS.ride,
    vibrationPattern: [0, 250, 200, 250],
    lightColor: '#F97316'
  });
  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_IDS.message, {
    name: 'ThrottleUp Message Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    sound: NOTIFICATION_SOUNDS.message,
    vibrationPattern: [0, 120, 100, 120],
    lightColor: '#F97316'
  });
};

export const ensureNotificationPermission = async (
  isExpoGo: boolean
): Promise<{ granted: boolean; status: PermissionStatus }> => {
  if (isExpoGo) {
    return { granted: false, status: 'denied' };
  }

  const Notifications = await loadNotificationsModule();
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;

  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  return {
    granted: status === 'granted',
    status: status === 'granted' ? 'granted' : 'denied'
  };
};

export const configureForegroundNotificationHandler = async (isExpoGo: boolean): Promise<void> => {
  if (isExpoGo) return;
  const Notifications = await loadNotificationsModule();
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false
    })
  });
};

export const scheduleImmediateNotification = async ({
  title,
  body,
  data,
  isExpoGo,
  permissionStatus,
  soundKind
}: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  isExpoGo: boolean;
  permissionStatus: PermissionStatus;
  soundKind: NotificationSoundKind;
}): Promise<void> => {
  if (isExpoGo || permissionStatus !== 'granted') return;

  const Notifications = await loadNotificationsModule();
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: NOTIFICATION_SOUNDS[soundKind],
      ...(Platform.OS === 'android' ? { channelId: NOTIFICATION_CHANNEL_IDS[soundKind] } : {})
    },
    trigger: null
  });
};

export const getExpoPushToken = async (): Promise<string | null> => {
  const Notifications = await loadNotificationsModule();
  const easProjectId =
    Constants.easConfig?.projectId ??
    ((Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? undefined) ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  const response = easProjectId
    ? await Notifications.getExpoPushTokenAsync({ projectId: easProjectId })
    : await Notifications.getExpoPushTokenAsync();
  return EXPO_PUSH_TOKEN_REGEX.test(response.data) ? response.data : null;
};

export const buildStoredNotificationFromExpo = (notification: ExpoNotification): Notification | null => {
  const content = notification.request.content;
  const title = asString(content.title);
  const body = asString(content.body);
  const data = asRecord(content.data);
  const resolvedContent = body || asString(data.content);

  if (!resolvedContent) return null;

  return buildStoredNotification({
    id: asString(data.appNotificationId) || notification.request.identifier,
    type: asString(data.type),
    senderId: asString(data.senderId) || asString(data.requesterId) || 'system',
    senderName: asString(data.senderName) || title || 'ThrottleUp',
    senderAvatar: asString(data.senderAvatar) || avatarFallback,
    content: resolvedContent,
    timestamp: typeof notification.date === 'number' ? new Date(notification.date).toISOString() : undefined,
    read: false,
    data
  });
};

export const getNotificationResponseKey = (response: ExpoNotificationResponse): string =>
  response.notification.request.identifier;

export const subscribeToNotificationEvents = async ({
  onReceived,
  onResponse
}: {
  onReceived: (notification: ExpoNotification) => void;
  onResponse: (response: ExpoNotificationResponse) => void;
}): Promise<{
  cleanup: () => void;
  lastResponse: ExpoNotificationResponse | null;
}> => {
  const Notifications = await loadNotificationsModule();
  const receivedSubscription: NotificationSubscription = Notifications.addNotificationReceivedListener(onReceived);
  const responseSubscription: NotificationSubscription = Notifications.addNotificationResponseReceivedListener(onResponse);
  const lastResponse = await Notifications.getLastNotificationResponseAsync();

  return {
    cleanup: () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    },
    lastResponse
  };
};
