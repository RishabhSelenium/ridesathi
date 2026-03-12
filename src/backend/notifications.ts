import { RidePost } from '../types';

type RideNotificationPayload = {
  rideId: string;
  creatorId: string;
  creatorName: string;
  title: string;
  city: string;
  visibility: RidePost['visibility'];
};

const notificationsBackendBaseUrl = (process.env.EXPO_PUBLIC_NOTIFICATIONS_BACKEND_BASE_URL ?? '').trim().replace(/\/+$/, '');
const notificationsBackendToken = (process.env.EXPO_PUBLIC_NOTIFICATIONS_BACKEND_TOKEN ?? '').trim();

const isNotificationsBackendConfigured = (): boolean => notificationsBackendBaseUrl.length > 0;

const postNotificationEvent = async (path: string, payload: Record<string, unknown>): Promise<void> => {
  if (!isNotificationsBackendConfigured()) return;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (notificationsBackendToken.length > 0) {
    headers.Authorization = `Bearer ${notificationsBackendToken}`;
  }

  const response = await fetch(`${notificationsBackendBaseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Notification backend request failed (${response.status})`);
  }
};

export const triggerRideCreatedNotification = async (ride: RidePost): Promise<void> => {
  const payload: RideNotificationPayload = {
    rideId: ride.id,
    creatorId: ride.creatorId,
    creatorName: ride.creatorName,
    title: ride.title,
    city: ride.city,
    visibility: ride.visibility
  };
  await postNotificationEvent('/notifications/ride-created', payload);
};

export const triggerRideCancelledNotification = async (
  rideId: string,
  title: string,
  cancelledBy: string,
  cancelledByName: string,
  participantIds: string[]
): Promise<void> => {
  await postNotificationEvent('/notifications/ride-cancelled', {
    rideId,
    title,
    cancelledBy,
    cancelledByName,
    participantIds
  });
};

export const triggerRideRequestOwnerNotification = async ({
  rideId,
  rideTitle,
  requesterId,
  requesterName,
  ownerId
}: {
  rideId: string;
  rideTitle: string;
  requesterId: string;
  requesterName: string;
  ownerId: string;
}): Promise<void> => {
  await postNotificationEvent('/notifications/ride-request-owner', {
    rideId,
    rideTitle,
    requesterId,
    requesterName,
    ownerId
  });
};

export const triggerDirectChatMessageNotification = async ({
  conversationId,
  senderId,
  senderName,
  recipientId,
  text
}: {
  conversationId: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  text: string;
}): Promise<void> => {
  await postNotificationEvent('/notifications/chat-message', {
    conversationId,
    senderId,
    senderName,
    recipientId,
    text
  });
};

export const triggerGroupChatMessageNotification = async ({
  groupId,
  groupName,
  senderId,
  senderName,
  text,
  memberIds
}: {
  groupId: string;
  groupName: string;
  senderId: string;
  senderName: string;
  text: string;
  memberIds: string[];
}): Promise<void> => {
  await postNotificationEvent('/notifications/group-chat-message', {
    groupId,
    groupName,
    senderId,
    senderName,
    text,
    memberIds
  });
};
