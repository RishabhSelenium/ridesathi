import { onValue, ref, update } from 'firebase/database';

import {
  LiveRideLocation,
  LiveRideParticipantState,
  RideSosSignal,
  RideTrackingSession
} from '../types';
import { getFirebaseServices } from './client';

type StartRideTrackingPayload = {
  startedByUserId: string;
  participantIds: string[];
  startedAt?: string;
};

type UpdateParticipantCheckInPayload = {
  rideId: string;
  userId: string;
  checkedIn: boolean;
};

type UpdateParticipantLocationPayload = {
  rideId: string;
  userId: string;
  location: Omit<LiveRideLocation, 'updatedAt'> & { updatedAt?: string };
};

type SendRideSosPayload = {
  rideId: string;
  userId: string;
  message: string;
  location?: Omit<LiveRideLocation, 'updatedAt'> & { updatedAt?: string };
};

const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const asBoolean = (value: unknown, fallback = false): boolean => (typeof value === 'boolean' ? value : fallback);
const asNumber = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';

const sessionPathForRide = (rideId: string): string => `rideTracking/${rideId}`;

const normalizeLocation = (value: unknown): LiveRideLocation | undefined => {
  if (!isObject(value)) return undefined;

  const lat = asNumber(value.lat);
  const lng = asNumber(value.lng);
  if (lat === undefined || lng === undefined) return undefined;

  return {
    lat,
    lng,
    accuracy: asNumber(value.accuracy),
    speed: asNumber(value.speed),
    heading: asNumber(value.heading),
    updatedAt: asString(value.updatedAt, new Date().toISOString())
  };
};

const normalizeParticipant = (value: unknown, fallbackUserId: string): LiveRideParticipantState | null => {
  if (!isObject(value)) return null;

  const userId = asString(value.userId, fallbackUserId);
  if (!userId) return null;

  return {
    userId,
    checkedIn: asBoolean(value.checkedIn, false),
    checkedInAt: typeof value.checkedInAt === 'string' ? value.checkedInAt : undefined,
    lastLocation: normalizeLocation(value.lastLocation),
    updatedAt: asString(value.updatedAt, new Date().toISOString())
  };
};

const normalizeSos = (value: unknown): RideSosSignal | undefined => {
  if (!isObject(value)) return undefined;
  const id = asString(value.id);
  const userId = asString(value.userId);
  const message = asString(value.message);
  if (!id || !userId || !message) return undefined;

  return {
    id,
    userId,
    message,
    createdAt: asString(value.createdAt, new Date().toISOString()),
    location: normalizeLocation(value.location)
  };
};

const normalizeSession = (value: unknown, rideId: string): RideTrackingSession | null => {
  if (!isObject(value)) return null;

  const rawParticipants = isObject(value.participants) ? value.participants : {};
  const participants: Record<string, LiveRideParticipantState> = {};
  Object.entries(rawParticipants).forEach(([participantId, participantValue]) => {
    const normalized = normalizeParticipant(participantValue, participantId);
    if (!normalized) return;
    participants[normalized.userId] = normalized;
  });

  return {
    rideId: asString(value.rideId, rideId),
    isActive: asBoolean(value.isActive, false),
    startedAt: asString(value.startedAt, new Date().toISOString()),
    startedByUserId: asString(value.startedByUserId),
    endedAt: typeof value.endedAt === 'string' ? value.endedAt : undefined,
    endedByUserId: typeof value.endedByUserId === 'string' ? value.endedByUserId : undefined,
    updatedAt: asString(value.updatedAt, new Date().toISOString()),
    participants,
    lastSos: normalizeSos(value.lastSos)
  };
};

export const subscribeRideTrackingSession = (
  rideId: string,
  onSession: (session: RideTrackingSession | null) => void,
  onError?: (error: Error) => void
): (() => void) => {
  const services = getFirebaseServices();
  if (!services) {
    onSession(null);
    onError?.(new Error('Realtime ride tracking service is unavailable.'));
    return () => undefined;
  }

  const sessionRef = ref(services.realtimeDb, sessionPathForRide(rideId));

  return onValue(
    sessionRef,
    (snapshot) => {
      const normalized = normalizeSession(snapshot.val(), rideId);
      onSession(normalized);
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error('Ride tracking sync failed.'));
    }
  );
};

export const startRideTrackingSession = async (rideId: string, payload: StartRideTrackingPayload): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;

  const now = payload.startedAt ?? new Date().toISOString();
  const uniqueParticipantIds = Array.from(new Set(payload.participantIds.filter(Boolean)));

  const participants: Record<string, LiveRideParticipantState> = {};
  uniqueParticipantIds.forEach((participantId) => {
    const isStarter = participantId === payload.startedByUserId;
    participants[participantId] = {
      userId: participantId,
      checkedIn: isStarter,
      checkedInAt: isStarter ? now : undefined,
      updatedAt: now
    };
  });

  await update(ref(services.realtimeDb, sessionPathForRide(rideId)), {
    rideId,
    isActive: true,
    startedAt: now,
    startedByUserId: payload.startedByUserId,
    endedAt: null,
    endedByUserId: null,
    updatedAt: now,
    participants,
    lastSos: null
  });
};

export const stopRideTrackingSession = async (rideId: string, endedByUserId: string): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;

  const now = new Date().toISOString();
  await update(ref(services.realtimeDb, sessionPathForRide(rideId)), {
    isActive: false,
    endedAt: now,
    endedByUserId,
    updatedAt: now
  });
};

export const updateRideParticipantCheckIn = async (payload: UpdateParticipantCheckInPayload): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;

  const now = new Date().toISOString();
  await update(ref(services.realtimeDb, sessionPathForRide(payload.rideId)), {
    [`participants/${payload.userId}/userId`]: payload.userId,
    [`participants/${payload.userId}/checkedIn`]: payload.checkedIn,
    [`participants/${payload.userId}/checkedInAt`]: payload.checkedIn ? now : null,
    [`participants/${payload.userId}/updatedAt`]: now,
    updatedAt: now
  });
};

export const updateRideParticipantLocation = async (payload: UpdateParticipantLocationPayload): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;

  if (!Number.isFinite(payload.location.lat) || !Number.isFinite(payload.location.lng)) {
    return;
  }

  const updatedAt = payload.location.updatedAt ?? new Date().toISOString();
  await update(ref(services.realtimeDb, sessionPathForRide(payload.rideId)), {
    [`participants/${payload.userId}/userId`]: payload.userId,
    [`participants/${payload.userId}/updatedAt`]: updatedAt,
    [`participants/${payload.userId}/lastLocation`]: {
      lat: payload.location.lat,
      lng: payload.location.lng,
      accuracy: payload.location.accuracy ?? null,
      speed: payload.location.speed ?? null,
      heading: payload.location.heading ?? null,
      updatedAt
    },
    updatedAt
  });
};

export const sendRideSosSignal = async (payload: SendRideSosPayload): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;

  const createdAt = new Date().toISOString();
  const signalId = `sos-${Date.now()}-${payload.userId}`;
  const normalizedMessage = payload.message.trim();
  if (!normalizedMessage) return;

  await update(ref(services.realtimeDb, sessionPathForRide(payload.rideId)), {
    lastSos: {
      id: signalId,
      userId: payload.userId,
      message: normalizedMessage,
      createdAt,
      location:
        payload.location && Number.isFinite(payload.location.lat) && Number.isFinite(payload.location.lng)
          ? {
            lat: payload.location.lat,
            lng: payload.location.lng,
            accuracy: payload.location.accuracy ?? null,
            speed: payload.location.speed ?? null,
            heading: payload.location.heading ?? null,
            updatedAt: payload.location.updatedAt ?? createdAt
          }
          : null
    },
    updatedAt: createdAt
  });
};
