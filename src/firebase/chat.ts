import { onValue, ref, set } from 'firebase/database';

import { ChatMessage } from '../types';
import { getFirebaseServices } from './client';

type RealtimeChatMessage = ChatMessage & {
  timestampEpoch: number;
};

const messagePathForConversation = (conversationId: string) => `chats/${conversationId}/messages`;

const normalizeRealtimeMessage = (value: unknown): RealtimeChatMessage | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;

  if (typeof raw.id !== 'string' || typeof raw.senderId !== 'string' || typeof raw.text !== 'string') {
    return null;
  }

  return {
    id: raw.id,
    senderId: raw.senderId,
    text: raw.text,
    timestamp: typeof raw.timestamp === 'string' ? raw.timestamp : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    timestampEpoch: typeof raw.timestampEpoch === 'number' && Number.isFinite(raw.timestampEpoch) ? raw.timestampEpoch : Date.now()
  };
};

export const subscribeChatMessages = (
  conversationId: string,
  onMessages: (messages: ChatMessage[]) => void
): (() => void) => {
  const services = getFirebaseServices();
  if (!services) {
    onMessages([]);
    return () => undefined;
  }

  const messagesRef = ref(services.realtimeDb, messagePathForConversation(conversationId));

  return onValue(messagesRef, (snapshot) => {
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
        text: item.text,
        timestamp: item.timestamp
      }));

    onMessages(normalized);
  });
};

export const sendChatMessageToRealtime = async (
  conversationId: string,
  message: ChatMessage
): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;

  const messageRef = ref(services.realtimeDb, `${messagePathForConversation(conversationId)}/${message.id}`);
  const payload: RealtimeChatMessage = {
    ...message,
    timestampEpoch: Date.now()
  };
  await set(messageRef, payload);
};
