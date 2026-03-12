export type RideType = 'Coffee Ride' | 'Night Ride' | 'Long Tour' | 'Track Day' | 'Sunday Morning';
export type ExperienceLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Pro';
export type RideVisibility = 'Nearby' | 'City' | 'Friends';
export type RideCostType = 'Paid' | 'Split' | 'Free';
export type RidePaymentMethod = 'UPI_LINK';
export type RidePaymentState = 'pending' | 'paid';
export type RideInviteAudience = 'groups' | 'riders';
export type RideJoinPermission = 'anyone' | 'request_to_join';
export type GroupJoinPermission = 'anyone' | 'request_to_join' | 'invite_only';
export type GroupRideCreatePermission = 'anyone' | 'admin';
export type GroupRole = 'owner' | 'admin' | 'member';

export interface SignedImageAsset {
  objectKey: string;
  signedUrl: string;
  expiresAt: string;
}

export interface RidePaymentStatus {
  userId: string;
  amount: number;
  status: RidePaymentState;
  updatedAt: string;
  paidAt?: string;
  method?: RidePaymentMethod;
  transactionRef?: string;
}

export interface User {
  id: string;
  phoneNumber?: string;
  name: string;
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
  blockedUserIds: string[];
  firstName?: string;
  lastName?: string;
  fullName?: string;
  sosNumber?: string;
  sosContacts?: string[];
  dob?: string;
  bloodGroup?: string;
  profileComplete?: boolean;
  avatarAsset?: SignedImageAsset;
  bikePhotosByName?: Record<string, string>;
  bikePhotoAssetsByName?: Record<string, SignedImageAsset>;
  expoPushTokens?: string[];
  firebasePushTokens?: string[];
  isInferredProfile?: boolean;
}

export interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
  photoRef?: string;
}

export interface LiveRideLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  updatedAt: string;
}

export interface LiveRideParticipantState {
  userId: string;
  checkedIn: boolean;
  checkedInAt?: string;
  lastLocation?: LiveRideLocation;
  updatedAt: string;
}

export interface RideSosSignal {
  id: string;
  userId: string;
  message: string;
  createdAt: string;
  location?: LiveRideLocation;
}

export interface RideTrackingSession {
  rideId: string;
  isActive: boolean;
  startedAt: string;
  startedByUserId: string;
  endedAt?: string;
  endedByUserId?: string;
  updatedAt: string;
  participants: Record<string, LiveRideParticipantState>;
  lastSos?: RideSosSignal;
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
  startDate?: string;
  returnDate?: string;
  startTime: string;
  maxParticipants: number;
  currentParticipants: string[];
  requests: string[];
  city: string;
  visibility: RideVisibility[];
  createdAt: string;
  primaryDestination?: string;
  dayPlan?: 'single' | 'multi';
  startLocation?: string;
  endLocation?: string;
  assemblyTime?: string;
  flagOffTime?: string;
  rideDuration?: string;
  routeDistanceKm?: number;
  routeEtaMinutes?: number;
  tollEstimateInr?: number;
  costType?: RideCostType;
  pricePerPerson?: number;
  splitTotalAmount?: number;
  paymentMethod?: RidePaymentMethod;
  upiPaymentLink?: string;
  paymentStatusByUserId?: Record<string, RidePaymentStatus>;
  inclusions?: string[];
  rideNote?: string;
  inviteAudience?: RideInviteAudience;
  isPrivate?: boolean;
  joinPermission?: RideJoinPermission;
  destinationPhotoRef?: string;
  groupId?: string;
  groupName?: string;
  groupAvatar?: string;
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
  imageDebugSource?: 'feed' | 'enriched' | 'fallback';
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
  data?: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName?: string;
  recipientId?: string;
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
  isUnread?: boolean;
  unreadCount: number;
  messages: ChatMessage[];
}

export interface Group {
  id: string;
  name: string;
  description: string;
  creatorId: string;
  members: string[];
  adminIds: string[];
  avatar: string;
  avatarAsset?: SignedImageAsset;
  city: string;
  rideStyles: string[];
  joinPermission: GroupJoinPermission;
  rideCreatePermission: GroupRideCreatePermission;
  joinRequests: string[];
  createdAt: string;
}

export type ModerationTargetType = 'user' | 'ride' | 'helpPost';

export interface ModerationReport {
  id: string;
  reporterId: string;
  targetType: ModerationTargetType;
  targetId: string;
  reason: string;
  details?: string;
  createdAt: string;
}
