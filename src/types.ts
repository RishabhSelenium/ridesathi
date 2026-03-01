export type RideType = 'Coffee Ride' | 'Night Ride' | 'Long Tour' | 'Track Day' | 'Sunday Morning';
export type ExperienceLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Pro';
export type RideVisibility = 'Nearby' | 'City' | 'Friends';

export interface User {
  id: string;
  name: string;
  handle: string;
  garage: string[];
  bikeType: string;
  city: string;
  style: string;
  experience: ExperienceLevel;
  distance: string;
  isPro: boolean;
  avatar: string;
  verified: boolean;
  typicalRideTime: string;
  friends: string[];
  friendRequests: {
    sent: string[];
    received: string[];
  };
}

export interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface RidePost {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar: string;
  type: RideType;
  title: string;
  route: string;
  routePoints?: MapPoint[];
  date: string;
  startTime: string;
  maxParticipants: number;
  currentParticipants: string[];
  requests: string[];
  city: string;
  visibility: RideVisibility[];
  createdAt: string;
}

export interface HelpPost {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar: string;
  title: string;
  description: string;
  bikeModel: string;
  category: 'Mechanical' | 'Gear' | 'Route' | 'Other';
  resolved: boolean;
  upvotes: number;
  image?: string;
  replies: HelpReply[];
  createdAt: string;
}

export interface HelpReply {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar?: string;
  text: string;
  isHelpful: boolean;
  createdAt: string;
}

export interface NewsArticle {
  id: string;
  title: string;
  source: string;
  url: string;
  image?: string;
  publishedAt: string;
  summary: string;
  tags: string[];
  duplicateScore: number;
  relevanceScore: number;
  viralityScore: number;
}

export interface Notification {
  id: string;
  type: 'friend_request' | 'ride_joined' | 'ride_request' | 'help_helpful' | 'message';
  senderId: string;
  senderName: string;
  senderAvatar: string;
  content: string;
  timestamp: string;
  read: boolean;
  data?: unknown;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  participantId: string;
  participantName: string;
  participantAvatar: string;
  lastMessage: string;
  timestamp: string;
  unreadCount: number;
  messages: ChatMessage[];
}
