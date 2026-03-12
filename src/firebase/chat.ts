import { onValue, ref, set } from 'firebase/database';

import { ChatMessage } from '../types';
import { getFirebaseServices } from './client';

type RealtimeChatMessage = ChatMessage & {
  timestampEpoch: number;
};

const messagePathForConversation = (conversationId: string) => `chats/${conversationId}/messages`;
const messagePathForGroup = (groupId: string) => `groupChats/${groupId}/messages`;

const normalizeRealtimeMessage = (value: unknown): RealtimeChatMessage | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;

  if (typeof raw.id !== 'string' || typeof raw.senderId !== 'string' || typeof raw.text !== 'string') {
    return null;
  }

  return {
    id: raw.id,
    senderId: raw.senderId,
    senderName: typeof raw.senderName === 'string' ? raw.senderName : undefined,
    recipientId: typeof raw.recipientId === 'string' ? raw.recipientId : undefined,
    text: raw.text,
    timestamp: typeof raw.timestamp === 'string' ? raw.timestamp : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    timestampEpoch: typeof raw.timestampEpoch === 'number' && Number.isFinite(raw.timestampEpoch) ? raw.timestampEpoch : Date.now()
  };
};

export const subscribeChatMessages = (
  conversationId: string,
  onMessages: (messages: ChatMessage[]) => void,
  onError?: (error: Error) => void
): (() => void) => {
  const path = messagePathForConversation(conversationId);
  return subscribeMessages(path, onMessages, onError);
};

export const subscribeGroupChatMessages = (
  groupId: string,
  onMessages: (messages: ChatMessage[]) => void,
  onError?: (error: Error) => void
): (() => void) => {
  const path = messagePathForGroup(groupId);
  return subscribeMessages(path, onMessages, onError);
};

const subscribeMessages = (
  path: string,
  onMessages: (messages: ChatMessage[]) => void,
  onError?: (error: Error) => void
): (() => void) => {
  const services = getFirebaseServices();
  if (!services) {
    onMessages([]);
    onError?.(new Error('Realtime chat service is unavailable.'));
    return () => undefined;
  }

  const messagesRef = ref(services.realtimeDb, path);

  return onValue(
    messagesRef,
    (snapshot) => {
      const value = snapshot.val() as Record<string, unknown> | null;
      if (!value) {
        onMessages([]);
        return;
      }

      const normalized = Object.values(value)
        .map(normalizeRealtimeMessage)
        .filter((item): item is RealtimeChatMessage => item !== null)
        .sort((a, b) => a.timestampEpoch - b.timestampEpoch)
        .map<ChatMessage>((item) => ({
          id: item.id,
          senderId: item.senderId,
          senderName: item.senderName,
          recipientId: item.recipientId,
          text: item.text,
          timestamp: item.timestamp
        }));

      onMessages(normalized);
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error('Chat sync failed.'));
    }
  );
};

export const sendChatMessageToRealtime = async (
  conversationId: string,
  message: ChatMessage
): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;

  if (!message.recipientId) {
    throw new Error('Direct chat recipient is required for realtime sync.');
  }

  const senderId = services.auth.currentUser?.uid ?? message.senderId;
  const payload: RealtimeChatMessage = {
    id: message.id,
    senderId,
    recipientId: message.recipientId,
    text: message.text,
    timestamp: message.timestamp,
    timestampEpoch: Date.now()
  };

  const path = messagePathForConversation(conversationId);
  const messageRef = ref(services.realtimeDb, `${path}/${message.id}`);
  await set(messageRef, payload);
};

export const sendGroupChatMessageToRealtime = async (
  groupId: string,
  message: ChatMessage
): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;

  const senderId = services.auth.currentUser?.uid ?? message.senderId;
  const payload: RealtimeChatMessage = {
    id: message.id,
    senderId,
    text: message.text,
    timestamp: message.timestamp,
    timestampEpoch: Date.now()
  };

  const path = messagePathForGroup(groupId);
  const messageRef = ref(services.realtimeDb, `${path}/${message.id}`);
  await set(messageRef, payload);
};
