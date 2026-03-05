import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

import { styles } from '../app/styles';
import { TOKENS, Theme, avatarFallback, formatClock, formatRelative } from '../app/ui';
import { Badge, RideCard } from '../components/common';

import { Conversation, HelpPost, NewsArticle, RidePost, Squad, User } from '../types';

const SyncErrorBanner = ({
  theme,
  title,
  message,
  isSyncing,
  onRetry
}: {
  theme: Theme;
  title: string;
  message: string;
  isSyncing: boolean;
  onRetry: () => void;
}) => {
  const t = TOKENS[theme];

  return (
    <View style={[styles.syncBanner, { borderColor: `${TOKENS[theme].red}66`, backgroundColor: t.subtle }]}>
      <MaterialCommunityIcons name="cloud-alert-outline" size={18} color={TOKENS[theme].red} />
      <View style={styles.syncBannerContent}>
        <Text style={[styles.syncBannerTitle, { color: TOKENS[theme].red }]}>{title}</Text>
        <Text style={[styles.syncBannerMessage, { color: t.muted }]}>{message}</Text>
      </View>
      <TouchableOpacity
        style={[styles.syncBannerRetry, { borderColor: t.border, backgroundColor: t.card, opacity: isSyncing ? 0.7 : 1 }]}
        onPress={onRetry}
        disabled={isSyncing}
      >
        {isSyncing ? (
          <ActivityIndicator size="small" color={t.primary} />
        ) : (
          <>
            <MaterialCommunityIcons name="refresh" size={14} color={t.primary} />
            <Text style={[styles.syncBannerRetryText, { color: t.primary }]}>Retry</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};

export const SplashScreen = ({ theme }: { theme: Theme }) => {
  const t = TOKENS[theme];

  return (
    <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg }]}>
      <ExpoStatusBar style={theme === 'light' ? 'dark' : 'light'} translucent={false} backgroundColor={t.bg} />
      <View style={styles.centered}>
        <View style={[styles.splashIcon, { backgroundColor: t.primary }]}>
          <MaterialCommunityIcons name="flash" size={56} color="#fff" />
        </View>
        <Text style={[styles.splashBrand, { color: t.text }]}>ThrottleUp</Text>
        <Text style={[styles.splashSubtitle, { color: t.primary }]}>COMMUNITY GRID</Text>
      </View>
    </SafeAreaView>
  );
};

export const LoginScreen = ({
  onLogin,
  theme,
  onToggleTheme,
  firebaseEnabled,
  betaModeEnabled,
  betaDefaultOtp,
  betaAllowedPhones
}: {
  onLogin: (payload: { uid?: string; phoneNumber: string }) => Promise<void>;
  theme: Theme;
  onToggleTheme: (next: Theme) => void;
  firebaseEnabled: boolean;
  betaModeEnabled: boolean;
  betaDefaultOtp: string;
  betaAllowedPhones: string[];
}) => {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const phoneInputRef = useRef<TextInput>(null);
  const t = TOKENS[theme];

  const e164Phone = phoneNumber.length === 10 ? `+91${phoneNumber}` : '';
  const maskedPhone = phoneNumber.length >= 4 ? `+91******${phoneNumber.slice(-4)}` : '+91******0000';
  const otpLength = betaModeEnabled ? Math.max(4, betaDefaultOtp.length) : 4;
  const expectedOtp = phoneNumber.slice(-4);
  const isNumberAllowedForBeta = betaAllowedPhones.length === 0 || betaAllowedPhones.includes(e164Phone);

  const readError = (value: unknown) => {
    const rawMessage = value instanceof Error ? value.message : 'Unable to continue right now.';
    const message = rawMessage.toLowerCase();

    if (message.includes('too-many-requests')) {
      return 'Too many attempts. Please wait a few minutes and try again.';
    }

    if (message.includes('invalid-phone-number')) {
      return 'Invalid phone number. Please check and try again.';
    }

    if (message.includes('invalid-verification-code')) {
      return 'Incorrect OTP. Please re-enter the code.';
    }

    if (message.includes('code-expired')) {
      return 'OTP expired. Please request a new code.';
    }

    return rawMessage;
  };

  const handleGetOtp = () => {
    if (phoneNumber.length < 10) {
      setError('Enter a valid 10-digit phone number.');
      return;
    }

    if (betaModeEnabled && !isNumberAllowedForBeta) {
      setError('This number is not enabled for this beta build.');
      return;
    }

    setError('');
    setStep('otp');
  };

  const handleVerify = async () => {
    if (otp.length < otpLength) {
      setError(`Enter the ${otpLength}-digit PIN.`);
      return;
    }

    if (betaModeEnabled) {
      if (otp !== betaDefaultOtp) {
        setError('Incorrect beta OTP. Please use the OTP shared for this beta.');
        return;
      }
    } else if (otp !== expectedOtp) {
      setError('Incorrect PIN. Enter the last 4 digits of your phone number.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      if (betaModeEnabled) {
        await onLogin({ phoneNumber: e164Phone });
      } else {
        const uid = `user-${phoneNumber}`;
        await onLogin({ uid, phoneNumber: e164Phone });
      }
    } catch (verifyError) {
      setError(readError(verifyError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangeNumber = () => {
    setOtp('');
    setError('');
    setStep('phone');
    setTimeout(() => phoneInputRef.current?.focus(), 0);
  };

  return (
    <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg }]}>
      <ExpoStatusBar style={theme === 'light' ? 'dark' : 'light'} translucent={false} backgroundColor={t.bg} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.fullScreen}>
        <ScrollView contentContainerStyle={styles.loginScroll} keyboardShouldPersistTaps="always">
          <View style={[styles.loginCard, { backgroundColor: t.surface, borderColor: t.border }]}>
            <View style={styles.loginTopRow}>
              <View style={[styles.brandIconWrap, { backgroundColor: t.primary }]}>
                <MaterialCommunityIcons name="flash" size={20} color="#fff" />
              </View>
              <View style={styles.themeToggleCompact}>
                <TouchableOpacity
                  style={[styles.themeSmallButton, { backgroundColor: theme === 'light' ? t.primary : t.subtle }]}
                  onPress={() => onToggleTheme('light')}
                >
                  <MaterialCommunityIcons name="weather-sunny" size={16} color={theme === 'light' ? '#fff' : t.muted} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.themeSmallButton, { backgroundColor: theme === 'dark' ? t.primary : t.subtle }]}
                  onPress={() => onToggleTheme('dark')}
                >
                  <MaterialCommunityIcons name="weather-night" size={16} color={theme === 'dark' ? '#fff' : t.muted} />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={[styles.loginTitle, { color: t.text }]}>{step === 'phone' ? 'Ride Connected' : 'Enter Your PIN'}</Text>
            {step !== 'phone' && (
              <Text style={[styles.loginSubtitle, { color: t.muted }]}>
                {betaModeEnabled ? `Enter the beta OTP for ${maskedPhone}` : `Enter the last 4 digits of ${maskedPhone}`}
              </Text>
            )}

            {step === 'phone' ? (
              <View style={styles.formSection}>
                <Text style={[styles.inputLabel, { color: t.muted }]}>Phone Number</Text>
                <TextInput
                  ref={phoneInputRef}
                  style={[styles.input, { backgroundColor: t.subtle, borderColor: t.border, color: t.text }]}
                  keyboardType="number-pad"
                  maxLength={10}
                  value={phoneNumber}
                  placeholder="10 digit number"
                  placeholderTextColor={t.muted}
                  onChangeText={(value) => {
                    setPhoneNumber(value.replace(/\D/g, '').slice(0, 10));
                    setError('');
                  }}
                />
                {betaModeEnabled && (
                  <Text style={[styles.metaText, { color: t.muted }]}>
                    Beta mode active: use the shared OTP to continue.
                  </Text>
                )}
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: t.primary }]}
                  onPress={handleGetOtp}
                >
                  <MaterialCommunityIcons name="lock-outline" size={18} color="#fff" />
                  <Text style={styles.primaryButtonText}>Continue</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.formSection}>
                <TextInput
                  style={[styles.input, { backgroundColor: t.subtle, borderColor: t.border, color: t.text }]}
                  keyboardType="number-pad"
                  maxLength={otpLength}
                  value={otp}
                  placeholder={betaModeEnabled ? 'Enter shared beta OTP' : 'Last 4 digits of your number'}
                  placeholderTextColor={t.muted}
                  onChangeText={(value) => {
                    setOtp(value.replace(/\D/g, '').slice(0, otpLength));
                    setError('');
                  }}
                />

                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: t.primary, opacity: isSubmitting ? 0.7 : 1 }]}
                  onPress={() => {
                    void handleVerify();
                  }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialCommunityIcons name="fingerprint" size={18} color="#fff" />
                  )}
                  <Text style={styles.primaryButtonText}>Verify & Enter</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={handleChangeNumber}>
                  <Text style={[styles.linkText, { color: t.muted }]}>Change number</Text>
                </TouchableOpacity>
              </View>
            )}

            {!!error && <Text style={[styles.errorText, { color: TOKENS[theme].red }]}>{error}</Text>}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export const FeedTab = ({
  theme,
  feedFilter,
  rides,
  helpPosts,
  ridesSyncError,
  helpSyncError,
  isSyncingRides,
  isSyncingHelp,
  onRetryRidesSync,
  onRetryHelpSync,
  currentUser,
  onOpenRideDetail,
  onOpenHelpDetail,
  onViewProfile
}: {
  theme: Theme;
  feedFilter: 'rides' | 'help';
  rides: RidePost[];
  helpPosts: HelpPost[];
  ridesSyncError: string | null;
  helpSyncError: string | null;
  isSyncingRides: boolean;
  isSyncingHelp: boolean;
  onRetryRidesSync: () => void;
  onRetryHelpSync: () => void;
  currentUser: User;
  onOpenRideDetail: (ride: RidePost) => void;
  onOpenHelpDetail: (post: HelpPost) => void;
  onViewProfile: (userId: string) => void;
}) => {
  const t = TOKENS[theme];

  if (feedFilter === 'rides') {
    return (
      <View style={styles.listWrap}>
        {ridesSyncError ? (
          <SyncErrorBanner
            theme={theme}
            title="Ride Sync Failed"
            message={ridesSyncError}
            isSyncing={isSyncingRides}
            onRetry={onRetryRidesSync}
          />
        ) : null}

        {rides.length === 0 ? (
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="map-search-outline" size={48} color={t.muted} />
            <Text style={[styles.emptyTitle, { color: t.text }]}>No rides available right now.</Text>
            <Text style={[styles.emptySubtitle, { color: t.muted }]}>
              {ridesSyncError ? 'Retry sync after network is back.' : 'Try switching city or adding more riding friends.'}
            </Text>
          </View>
        ) : (
          rides.map((ride) => (
            <RideCard
              key={ride.id}
              ride={ride}
              currentUserId={currentUser.id}
              theme={theme}
              onOpenDetail={onOpenRideDetail}
              onViewProfile={onViewProfile}
            />
          ))
        )}
      </View>
    );
  }

  return (
    <View style={styles.listWrap}>
      {helpSyncError ? (
        <SyncErrorBanner
          theme={theme}
          title="Help Sync Failed"
          message={helpSyncError}
          isSyncing={isSyncingHelp}
          onRetry={onRetryHelpSync}
        />
      ) : null}

      {helpPosts.length === 0 ? (
        <View style={styles.emptyWrap}>
          <MaterialCommunityIcons name="wrench-outline" size={48} color={t.muted} />
          <Text style={[styles.emptyTitle, { color: t.text }]}>{helpSyncError ? 'No help posts available.' : 'No help posts yet.'}</Text>
          <Text style={[styles.emptySubtitle, { color: t.muted }]}>
            {helpSyncError ? 'Retry sync once your connection is stable.' : 'Create one to ask the riding community.'}
          </Text>
        </View>
      ) : (
        helpPosts.map((post) => (
          <TouchableOpacity
            key={post.id}
            onPress={() => onOpenHelpDetail(post)}
            style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}
          >
            <View style={styles.rowBetween}>
              <TouchableOpacity style={styles.rowAligned} onPress={() => onViewProfile(post.creatorId)}>
                <Image style={styles.avatarSmall} source={{ uri: post.creatorAvatar || avatarFallback }} />
                <Text style={[styles.boldText, { color: t.text }]}>{post.creatorName}</Text>
              </TouchableOpacity>
              <Badge color="blue" theme={theme}>
                {post.resolved ? 'Resolved' : post.category}
              </Badge>
            </View>

            <Text style={[styles.cardTitle, { color: t.text }]}>{post.title}</Text>

            <View style={styles.metaRow}>
              <View style={styles.rowAligned}>
                <MaterialCommunityIcons name="motorbike" size={14} color={t.primary} />
                <Text style={[styles.metaText, { color: t.muted }]}>{post.bikeModel}</Text>
              </View>
              <View style={styles.rowAligned}>
                <MaterialCommunityIcons name="clock-outline" size={14} color={t.primary} />
                <Text style={[styles.metaText, { color: t.muted }]}>{formatClock(post.createdAt)}</Text>
              </View>
            </View>

            <Text style={[styles.bodyText, { color: t.muted }]} numberOfLines={3}>
              {post.description}
            </Text>

            <View style={styles.rowBetween}>
              <View style={[styles.statChip, { borderColor: t.border, backgroundColor: t.subtle }]}>
                <MaterialCommunityIcons name="message-outline" size={14} color={t.muted} />
                <Text style={[styles.statText, { color: t.muted }]}>{post.replies.length} replies</Text>
              </View>
              <View style={[styles.statChip, { borderColor: t.border, backgroundColor: t.subtle }]}>
                <MaterialCommunityIcons name="arrow-up-bold" size={14} color={t.primary} />
                <Text style={[styles.statText, { color: t.text }]}>{post.upvotes}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
};

export const NewsTab = ({
  theme,
  newsArticles,
  syncError,
  isSyncing,
  onRetrySync,
  onOpenArticle
}: {
  theme: Theme;
  newsArticles: NewsArticle[];
  syncError: string | null;
  isSyncing: boolean;
  onRetrySync: () => void;
  onOpenArticle: (url: string) => void;
}) => {
  const t = TOKENS[theme];
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setFailedImages((previous) => {
      const previousIds = Object.keys(previous);
      if (previousIds.length === 0) return previous;

      const validIds = new Set(newsArticles.map((article) => article.id));
      let changed = false;
      const next: Record<string, boolean> = {};

      previousIds.forEach((id) => {
        if (!validIds.has(id)) {
          changed = true;
          return;
        }
        next[id] = previous[id];
      });

      return changed ? next : previous;
    });
  }, [newsArticles]);

  return (
    <View style={styles.listWrap}>
      {syncError ? (
        <SyncErrorBanner
          theme={theme}
          title="News Sync Failed"
          message={syncError}
          isSyncing={isSyncing}
          onRetry={onRetrySync}
        />
      ) : null}

      {newsArticles.length === 0 ? (
        <View style={styles.emptyWrap}>
          <MaterialCommunityIcons name="newspaper-variant-outline" size={48} color={t.muted} />
          <Text style={[styles.emptyTitle, { color: t.text }]}>{syncError ? 'News feed unavailable.' : 'No news available.'}</Text>
          <Text style={[styles.emptySubtitle, { color: t.muted }]}>
            {syncError ? 'Retry when internet connectivity returns.' : 'Pull to refresh or try again later.'}
          </Text>
        </View>
      ) : (
        newsArticles.map((item) => {
          const primaryTag = item.tags[0] ?? 'Motorcycles';

          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.newsCard, { backgroundColor: t.card, borderColor: t.border }]}
              onPress={() => onOpenArticle(item.url)}
            >
              {item.image && !failedImages[item.id] ? (
                <Image
                  source={{ uri: item.image }}
                  style={styles.newsImage}
                  resizeMode="cover"
                  onError={() =>
                    setFailedImages((previous) => (previous[item.id] ? previous : { ...previous, [item.id]: true }))
                  }
                />
              ) : (
                <View style={[styles.newsImageFallback, { backgroundColor: t.subtle, borderColor: t.border }]}>
                  <View style={styles.newsImageFallbackContent}>
                    <View style={[styles.newsImageFallbackPill, { borderColor: `${t.primary}66`, backgroundColor: `${t.primary}1f` }]}>
                      <MaterialCommunityIcons name="newspaper-variant-outline" size={12} color={t.primary} />
                      <Text style={[styles.newsImageFallbackPillText, { color: t.primary }]}>{primaryTag}</Text>
                    </View>
                    <Text style={[styles.newsImageFallbackSource, { color: t.text }]} numberOfLines={1}>
                      {item.source}
                    </Text>
                    <Text style={[styles.newsImageFallbackSubtext, { color: t.muted }]}>Publisher preview not available</Text>
                  </View>
                </View>
              )}

              <View style={styles.newsMetaRow}>
                <View style={styles.rowAligned}>
                  <MaterialCommunityIcons name="rss" size={14} color={t.primary} />
                  <Text style={[styles.metaText, { color: t.muted }]}>{item.source}</Text>
                </View>
                <View style={styles.rowAligned}>
                  <Text style={[styles.metaText, { color: t.muted }]}>{formatRelative(item.publishedAt)}</Text>
                  <Text style={[styles.metaText, { color: t.muted }]}>•</Text>
                  <MaterialCommunityIcons name="check-decagram-outline" size={14} color={TOKENS[theme].blue} />
                  <Text style={[styles.metaText, { color: t.muted }]}>AI Enriched</Text>
                </View>
              </View>

              <Text style={[styles.newsTitle, { color: t.text }]}>{item.title}</Text>

              <Text style={[styles.newsSummary, { color: t.text }]}>{item.summary}</Text>

              <TouchableOpacity
                style={[styles.newsReadMoreButton, { borderColor: t.border, backgroundColor: t.subtle }]}
                onPress={() => onOpenArticle(item.url)}
              >
                <Text style={[styles.newsReadMoreText, { color: t.primary }]}>Read more</Text>
                <MaterialCommunityIcons name="arrow-right" size={14} color={t.primary} />
              </TouchableOpacity>

              <View style={styles.wrapRow}>
                {item.tags.map((tag) => (
                  <View key={`${item.id}-${tag}`} style={[styles.newsTag, { borderColor: t.border, backgroundColor: t.subtle }]}>
                    <Text style={[styles.newsTagText, { color: t.muted }]}>{tag}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.newsScoreRow}>
                <View style={[styles.newsScoreChip, { borderColor: t.border, backgroundColor: t.subtle }]}>
                  <Text style={[styles.metaText, { color: t.muted }]}>Dup {(item.duplicateScore * 100).toFixed(0)}%</Text>
                </View>
                <View style={[styles.newsScoreChip, { borderColor: t.border, backgroundColor: t.subtle }]}>
                  <Text style={[styles.metaText, { color: t.muted }]}>Rel {item.relevanceScore}</Text>
                </View>
                <View style={[styles.newsScoreChip, { borderColor: t.border, backgroundColor: t.subtle }]}>
                  <Text style={[styles.metaText, { color: t.muted }]}>Vir {item.viralityScore}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );
};

export const MyRidesTab = ({
  theme,
  rides,
  currentUser,
  onOpenRideDetail,
  onViewProfile
}: {
  theme: Theme;
  rides: RidePost[];
  currentUser: User;
  onOpenRideDetail: (ride: RidePost) => void;
  onViewProfile: (userId: string) => void;
}) => {
  const myRides = useMemo(
    () => rides.filter((ride) => ride.currentParticipants.includes(currentUser.id)),
    [currentUser.id, rides]
  );
  const t = TOKENS[theme];

  if (myRides.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <MaterialCommunityIcons name="bike-fast" size={48} color={t.muted} />
        <Text style={[styles.emptyTitle, { color: t.text }]}>No active rides found.</Text>
        <Text style={[styles.emptySubtitle, { color: t.muted }]}>Join one from feed or create your own.</Text>
      </View>
    );
  }

  return (
    <View style={styles.listWrap}>
      {myRides.map((ride) => (
        <RideCard
          key={ride.id}
          ride={ride}
          currentUserId={currentUser.id}
          theme={theme}
          onOpenDetail={onOpenRideDetail}
          onViewProfile={onViewProfile}
        />
      ))}
    </View>
  );
};

export const ChatsTab = ({
  theme,
  conversations,
  syncError,
  isSyncing,
  onRetrySync,
  onOpenChatRoom,
  onViewProfile
}: {
  theme: Theme;
  conversations: Conversation[];
  syncError: string | null;
  isSyncing: boolean;
  onRetrySync: () => void;
  onOpenChatRoom: (conversation: Conversation) => void;
  onViewProfile: (userId: string) => void;
}) => {
  const t = TOKENS[theme];

  return (
    <View style={styles.listWrap}>
      {syncError ? (
        <SyncErrorBanner
          theme={theme}
          title="Chat Sync Failed"
          message={syncError}
          isSyncing={isSyncing}
          onRetry={onRetrySync}
        />
      ) : null}

      {conversations.length === 0 ? (
        <View style={styles.emptyWrap}>
          <MaterialCommunityIcons name="message-outline" size={48} color={t.muted} />
          <Text style={[styles.emptyTitle, { color: t.text }]}>No chats yet.</Text>
          <Text style={[styles.emptySubtitle, { color: t.muted }]}>Connect with riders to start messaging.</Text>
        </View>
      ) : (
        conversations.map((chat) => (
          <TouchableOpacity
            key={chat.id}
            style={[styles.chatRow, { backgroundColor: t.card, borderColor: t.border }]}
            onPress={() => onOpenChatRoom(chat)}
          >
            <TouchableOpacity onPress={() => onViewProfile(chat.participantId)}>
              <View>
                <Image source={{ uri: chat.participantAvatar || avatarFallback }} style={styles.avatarMedium} />
                {chat.unreadCount > 0 && <View style={[styles.unreadDot, { backgroundColor: t.primary }]} />}
              </View>
            </TouchableOpacity>
            <View style={styles.chatInfo}>
              <View style={styles.rowBetween}>
                <Text style={[styles.boldText, { color: t.text }]} numberOfLines={1}>
                  {chat.participantName}
                </Text>
                <Text style={[styles.metaText, { color: t.muted }]}>{chat.timestamp}</Text>
              </View>
              <Text style={[styles.chatPreview, { color: chat.unreadCount > 0 ? t.text : t.muted }]} numberOfLines={1}>
                {chat.lastMessage}
              </Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
};

export const ProfileTab = ({
  theme,
  currentUser,
  users,
  rides,
  conversations,
  onEditProfile,
  onViewProfile,
  onOpenConversation,
  onStartConversation,
  onShareApp,
  onLogout,
  onSetTheme
}: {
  theme: Theme;
  currentUser: User;
  users: User[];
  rides: RidePost[];
  conversations: Conversation[];
  onEditProfile: () => void;
  onViewProfile: (userId: string) => void;
  onOpenConversation: (conv: Conversation) => void;
  onStartConversation: (userId: string) => void;
  onShareApp: () => void;
  onLogout: () => void;
  onSetTheme: (theme: Theme) => void;
}) => {
  const t = TOKENS[theme];
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const conversationsByParticipantId = useMemo(
    () => new Map(conversations.map((conversation) => [conversation.participantId, conversation])),
    [conversations]
  );
  const createdRideCount = useMemo(
    () => rides.reduce((count, ride) => (ride.creatorId === currentUser.id ? count + 1 : count), 0),
    [currentUser.id, rides]
  );
  const squadFriends = useMemo(
    () =>
      currentUser.friends
        .map((friendId) => {
          const friend = usersById.get(friendId);
          if (!friend) return null;
          return { friendId, friend };
        })
        .filter((item): item is { friendId: string; friend: User } => item !== null),
    [currentUser.friends, usersById]
  );

  return (
    <View style={styles.listWrap}>
      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
        <View style={styles.rowBetween}>
          <View style={styles.rowAligned}>
            <Image source={{ uri: currentUser.avatar || avatarFallback }} style={styles.avatarLarge} />
            <View>
              <Text style={[styles.profileName, { color: t.text }]}>{currentUser.name}</Text>
              <View style={styles.rowAligned}>
                <Badge color="orange" theme={theme}>
                  {currentUser.experience}
                </Badge>
                <View style={{ width: 8 }} />
                <Badge color="slate" theme={theme}>
                  {currentUser.bikeType}
                </Badge>
              </View>
            </View>
          </View>
          <TouchableOpacity style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]} onPress={onEditProfile}>
            <MaterialCommunityIcons name="pencil" size={18} color={t.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.profileStatsRow}>
          <View style={[styles.profileStatCard, { borderColor: t.border, backgroundColor: t.subtle }]}>
            <Text style={[styles.profileStatValue, { color: t.primary }]}>{currentUser.friends.length}</Text>
            <Text style={[styles.profileStatLabel, { color: t.muted }]}>Friends</Text>
          </View>
          <View style={[styles.profileStatCard, { borderColor: t.border, backgroundColor: t.subtle }]}>
            <Text style={[styles.profileStatValue, { color: t.primary }]}>{createdRideCount}</Text>
            <Text style={[styles.profileStatLabel, { color: t.muted }]}>Rides</Text>
          </View>
        </View>

        <Text style={[styles.inputLabel, { color: t.muted }]}>My Garage</Text>
        <View style={styles.wrapRow}>
          {currentUser.garage.length > 0 ? (
            currentUser.garage.map((bike, idx) => (
              <View key={`${bike}-${idx}`} style={[styles.pillTag, { borderColor: t.border, backgroundColor: t.subtle }]}>
                <Text style={[styles.pillTagText, { color: t.text }]}>{bike}</Text>
              </View>
            ))
          ) : (
            <Text style={[styles.bodyText, { color: t.muted }]}>No bikes added yet.</Text>
          )}
        </View>

        <View style={styles.gridTwo}>
          <View style={[styles.infoTile, { borderColor: t.border, backgroundColor: t.subtle }]}>
            <Text style={[styles.inputLabel, { color: t.muted }]}>Riding Style</Text>
            <Text style={[styles.bodyText, { color: t.text }]}>{currentUser.style}</Text>
          </View>
          <View style={[styles.infoTile, { borderColor: t.border, backgroundColor: t.subtle }]}>
            <Text style={[styles.inputLabel, { color: t.muted }]}>Typical Ride</Text>
            <Text style={[styles.bodyText, { color: t.text }]}>{currentUser.typicalRideTime}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
        <Text style={[styles.cardHeader, { color: t.muted }]}>MY RIDING SQUAD</Text>
        {squadFriends.length === 0 ? (
          <Text style={[styles.bodyText, { color: t.muted }]}>No riders in your squad yet.</Text>
        ) : (
          squadFriends.map(({ friendId, friend }) => (
            <TouchableOpacity
              key={friendId}
              style={[styles.friendRow, { borderColor: t.border }]}
              onPress={() => onViewProfile(friendId)}
            >
              <View style={styles.rowAligned}>
                <Image source={{ uri: friend.avatar || avatarFallback }} style={styles.avatarMedium} />
                <View>
                  <Text style={[styles.boldText, { color: t.text }]}>{friend.name}</Text>
                  <Text style={[styles.metaText, { color: t.muted }]}>{friend.garage?.[0] ?? 'Unknown machine'}</Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => {
                  const conversation = conversationsByParticipantId.get(friendId);
                  if (conversation) {
                    onOpenConversation(conversation);
                    return;
                  }
                  onStartConversation(friendId);
                }}
                style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}
              >
                <MaterialCommunityIcons name="message-outline" size={18} color={t.primary} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
        <Text style={[styles.cardHeader, { color: t.muted }]}>PREFERENCES</Text>
        <View style={[styles.preferenceRow, { borderColor: t.border, backgroundColor: t.subtle }]}>
          <View style={styles.rowAligned}>
            <MaterialCommunityIcons name={theme === 'light' ? 'weather-sunny' : 'weather-night'} size={20} color={t.primary} />
            <View>
              <Text style={[styles.boldText, { color: t.text }]}>App Theme</Text>
              <Text style={[styles.metaText, { color: t.muted }]}>{theme === 'light' ? 'Light Mode' : 'Dark Mode'}</Text>
            </View>
          </View>
          <Switch
            value={theme === 'dark'}
            onValueChange={(value) => onSetTheme(value ? 'dark' : 'light')}
            trackColor={{ false: '#94a3b8', true: t.primary }}
          />
        </View>
      </View>

      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: TOKENS[theme].blue }]} onPress={onShareApp}>
        <MaterialCommunityIcons name="share-variant-outline" size={18} color="#fff" />
        <Text style={styles.primaryButtonText}>Invite Riders</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.dangerButton, { borderColor: TOKENS[theme].red }]} onPress={onLogout}>
        <MaterialCommunityIcons name="logout" size={18} color={TOKENS[theme].red} />
        <Text style={[styles.dangerButtonText, { color: TOKENS[theme].red }]}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
};

export const SquadTab = ({
  theme,
  squads,
  currentUser,
  users,
  searchQuery,
  onSearchChange,
  onCreateSquad,
  onOpenSquadDetail,
  onJoinSquad,
  onLeaveSquad
}: {
  theme: Theme;
  squads: Squad[];
  currentUser: User;
  users: User[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCreateSquad: () => void;
  onOpenSquadDetail: (squadId: string) => void;
  onJoinSquad: (squadId: string) => void;
  onLeaveSquad: (squadId: string) => void;
}) => {
  const t = TOKENS[theme];
  const usersById = useMemo(() => {
    const byId = new Map<string, User>();
    byId.set(currentUser.id, currentUser);
    users.forEach((user) => byId.set(user.id, user));
    return byId;
  }, [currentUser, users]);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredSquads = useMemo(
    () =>
      normalizedSearchQuery
        ? squads.filter((squad) => squad.name.toLowerCase().includes(normalizedSearchQuery))
        : squads,
    [normalizedSearchQuery, squads]
  );
  const mySquads = useMemo(
    () => filteredSquads.filter((squad) => squad.members.includes(currentUser.id)),
    [currentUser.id, filteredSquads]
  );
  const discoverSquads = useMemo(
    () => filteredSquads.filter((squad) => !squad.members.includes(currentUser.id)),
    [currentUser.id, filteredSquads]
  );

  const renderMemberAvatars = (memberIds: string[], maxShow = 4) => {
    const shown = memberIds.slice(0, maxShow);
    const extra = memberIds.length - maxShow;

    return (
      <View style={styles.squadMemberAvatars}>
        {shown.map((id, idx) => {
          const user = usersById.get(id);
          return (
            <Image
              key={id}
              source={{ uri: user?.avatar || avatarFallback }}
              style={[
                styles.squadMemberAvatar,
                { borderColor: t.card, marginLeft: idx === 0 ? 0 : -8 }
              ]}
            />
          );
        })}
        {extra > 0 && (
          <View
            style={[
              styles.squadMemberAvatar,
              {
                borderColor: t.card,
                backgroundColor: t.subtle,
                alignItems: 'center',
                justifyContent: 'center'
              }
            ]}
          >
            <Text style={{ fontSize: 10, fontWeight: '800', color: t.muted }}>+{extra}</Text>
          </View>
        )}
      </View>
    );
  };

  const renderSquadCard = (squad: Squad, isMember: boolean) => {
    const rideStyleLabel = squad.rideStyles.join(' • ');
    const hasPendingRequest = squad.joinRequests.includes(currentUser.id);
    const joinModeLabel = squad.joinPermission === 'request_to_join' ? 'Request approval' : 'Open join';
    const isAdmin = squad.adminIds.includes(currentUser.id);

    return (
      <TouchableOpacity
        key={squad.id}
        style={[styles.squadCard, { backgroundColor: t.card, borderColor: t.border }]}
        onPress={() => onOpenSquadDetail(squad.id)}
      >
        <View style={styles.squadCardHeader}>
          <Image source={{ uri: squad.avatar || avatarFallback }} style={styles.squadAvatar} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.squadName, { color: t.text }]}>{squad.name}</Text>
            <View style={[styles.rowAligned, { marginTop: 2 }]}>
              <View style={styles.rowAligned}>
                <MaterialCommunityIcons name="account-group" size={13} color={t.muted} />
                <Text style={[styles.metaText, { color: t.muted }]}>{squad.members.length}</Text>
              </View>
              <View style={styles.rowAligned}>
                <MaterialCommunityIcons name="map-marker-outline" size={13} color={t.primary} />
                <Text style={[styles.metaText, { color: t.muted }]}>{squad.city}</Text>
              </View>
            </View>
          </View>
        </View>

        <Text style={[styles.bodyText, { color: t.muted }]} numberOfLines={2}>
          {squad.description}
        </Text>

        <View style={styles.rowBetween}>
          <View style={styles.rowAligned}>
            {renderMemberAvatars(squad.members)}
            <View style={[styles.pillTag, { borderColor: t.border, backgroundColor: t.subtle }]}>
              <Text style={[styles.pillTagText, { color: t.muted }]} numberOfLines={1}>{rideStyleLabel}</Text>
            </View>
            <View style={[styles.pillTag, { borderColor: t.border, backgroundColor: t.subtle }]}>
              <Text style={[styles.pillTagText, { color: t.muted }]}>{joinModeLabel}</Text>
            </View>
          </View>
          {isMember ? (
            squad.creatorId === currentUser.id ? (
              <View style={[styles.squadActionButton, { borderColor: t.primary, backgroundColor: `${t.primary}15` }]}>
                <MaterialCommunityIcons name="crown" size={14} color={t.primary} />
                <Text style={[styles.squadActionButtonText, { color: t.primary }]}>Owner</Text>
              </View>
            ) : isAdmin ? (
              <View style={[styles.squadActionButton, { borderColor: t.primary, backgroundColor: `${t.primary}15` }]}>
                <MaterialCommunityIcons name="shield-account-outline" size={14} color={t.primary} />
                <Text style={[styles.squadActionButtonText, { color: t.primary }]}>Admin</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.squadActionButton, { borderColor: t.border, backgroundColor: t.subtle }]}
                onPress={(e) => { e.stopPropagation?.(); onLeaveSquad(squad.id); }}
              >
                <MaterialCommunityIcons name="logout" size={14} color={t.red} />
                <Text style={[styles.squadActionButtonText, { color: t.red }]}>Leave</Text>
              </TouchableOpacity>
            )
          ) : hasPendingRequest ? (
            <View style={[styles.squadActionButton, { borderColor: t.border, backgroundColor: t.subtle }]}>
              <MaterialCommunityIcons name="clock-outline" size={14} color={t.muted} />
              <Text style={[styles.squadActionButtonText, { color: t.muted }]}>Requested</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.squadActionButton, { borderColor: t.primary, backgroundColor: t.primary }]}
              onPress={(e) => { e.stopPropagation?.(); onJoinSquad(squad.id); }}
            >
              <MaterialCommunityIcons
                name={squad.joinPermission === 'request_to_join' ? 'account-clock-outline' : 'plus'}
                size={14}
                color="#fff"
              />
              <Text style={[styles.squadActionButtonText, { color: '#fff' }]}>
                {squad.joinPermission === 'request_to_join' ? 'Request' : 'Join'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.listWrap}>
      <View style={styles.squadSearchRow}>
        <View style={{ flex: 1 }}>
          <TextInput
            style={[styles.squadSearchInput, { backgroundColor: t.subtle, borderColor: t.border, color: t.text }]}
            placeholder="Search squads..."
            placeholderTextColor={t.muted}
            value={searchQuery}
            onChangeText={onSearchChange}
          />
        </View>
        <TouchableOpacity
          style={[styles.squadActionButton, { borderColor: t.primary, backgroundColor: t.primary, minHeight: 44 }]}
          onPress={onCreateSquad}
        >
          <MaterialCommunityIcons name="plus" size={16} color="#fff" />
          <Text style={[styles.squadActionButtonText, { color: '#fff' }]}>Create</Text>
        </TouchableOpacity>
      </View>

      {mySquads.length > 0 && (
        <>
          <Text style={[styles.cardHeader, { color: t.muted, marginTop: 6 }]}>MY SQUADS</Text>
          {mySquads.map((squad) => renderSquadCard(squad, true))}
        </>
      )}

      {discoverSquads.length > 0 && (
        <>
          <Text style={[styles.cardHeader, { color: t.muted, marginTop: 6 }]}>DISCOVER SQUADS</Text>
          {discoverSquads.map((squad) => renderSquadCard(squad, false))}
        </>
      )}

      {filteredSquads.length === 0 && (
        <View style={styles.emptyWrap}>
          <MaterialCommunityIcons name="account-group-outline" size={48} color={t.muted} />
          <Text style={[styles.emptyTitle, { color: t.text }]}>
            {searchQuery ? 'No squads found.' : 'No squads yet.'}
          </Text>
          <Text style={[styles.emptySubtitle, { color: t.muted }]}>
            {searchQuery ? 'Try a different search term.' : 'Create your own riding squad!'}
          </Text>
        </View>
      )}
    </View>
  );
};

const BLOOD_GROUPS = ['A+', 'A−', 'B+', 'B−', 'O+', 'O−', 'AB+', 'AB−'] as const;

export const CompleteProfileScreen = ({
  theme,
  onSubmit
}: {
  theme: Theme;
  onSubmit: (data: {
    firstName: string;
    lastName: string;
    sosNumber: string;
    sosContacts: string[];
    dob: string;
    bloodGroup: string;
  }) => void;
}) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [sosNumber, setSosNumber] = useState('');
  const [secondarySosNumber, setSecondarySosNumber] = useState('');
  const [thirdSosNumber, setThirdSosNumber] = useState('');
  const [dob, setDob] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const t = TOKENS[theme];

  const sanitizeEmergencyNumber = (value: string): string => value.replace(/\D/g, '').slice(0, 15);

  const handleDobChange = (value: string) => {
    const digits = value.replace(/\D/g, '');
    let formatted = '';
    if (digits.length <= 2) {
      formatted = digits;
    } else if (digits.length <= 4) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    } else {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
    }
    setDob(formatted);
    setError('');
  };

  const handleSubmit = () => {
    if (!firstName.trim()) {
      setError('Please enter your first name.');
      return;
    }
    if (!lastName.trim()) {
      setError('Please enter your last name.');
      return;
    }
    if (!dob || dob.length < 10) {
      setError('Please enter a valid date of birth (DD/MM/YYYY).');
      return;
    }
    const primaryContact = sanitizeEmergencyNumber(sosNumber);
    const secondaryContact = sanitizeEmergencyNumber(secondarySosNumber);
    const thirdContact = sanitizeEmergencyNumber(thirdSosNumber);
    const candidateContacts = [primaryContact, secondaryContact, thirdContact].filter((contact) => contact.length > 0);
    const invalidContact = candidateContacts.find((contact) => contact.length < 10);

    if (!primaryContact || primaryContact.length < 10) {
      setError('Please enter a valid primary SOS contact number.');
      return;
    }
    if (invalidContact) {
      setError('Each emergency contact should be at least 10 digits.');
      return;
    }
    if (!bloodGroup) {
      setError('Please select your blood group.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    const sosContacts = Array.from(new Set(candidateContacts));
    onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      sosNumber: sosContacts[0] ?? primaryContact,
      sosContacts,
      dob,
      bloodGroup
    });
  };

  return (
    <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg }]}>
      <ExpoStatusBar style={theme === 'light' ? 'dark' : 'light'} translucent={false} backgroundColor={t.bg} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.fullScreen}>
        <ScrollView contentContainerStyle={styles.loginScroll} keyboardShouldPersistTaps="always">
          <View style={[styles.loginCard, { backgroundColor: t.surface, borderColor: t.border }]}>
            <View style={[styles.brandIconWrap, { backgroundColor: t.primary }]}>
              <MaterialCommunityIcons name="account-check" size={20} color="#fff" />
            </View>

            <Text style={[styles.profileCompleteTitle, { color: t.text }]}>Complete Your Profile</Text>
            <Text style={[styles.loginSubtitle, { color: t.muted }]}>
              We need a few details before you hit the road.
            </Text>

            {/* Personal Details */}
            <View style={styles.formSection}>
              <Text style={[styles.profileCompleteSectionLabel, { color: t.primary }]}>Personal Details</Text>

              <Text style={[styles.inputLabel, { color: t.muted }]}>First Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: t.subtle, borderColor: t.border, color: t.text }]}
                placeholder="Enter your first name"
                placeholderTextColor={t.muted}
                value={firstName}
                onChangeText={(v) => { setFirstName(v); setError(''); }}
                autoCapitalize="words"
              />

              <Text style={[styles.inputLabel, { color: t.muted }]}>Last Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: t.subtle, borderColor: t.border, color: t.text }]}
                placeholder="Enter your last name"
                placeholderTextColor={t.muted}
                value={lastName}
                onChangeText={(v) => { setLastName(v); setError(''); }}
                autoCapitalize="words"
              />

              <Text style={[styles.inputLabel, { color: t.muted }]}>Date of Birth</Text>
              <TextInput
                style={[styles.input, { backgroundColor: t.subtle, borderColor: t.border, color: t.text }]}
                placeholder="DD/MM/YYYY"
                placeholderTextColor={t.muted}
                keyboardType="number-pad"
                maxLength={10}
                value={dob}
                onChangeText={handleDobChange}
              />
            </View>

            {/* Emergency Details */}
            <View style={styles.formSection}>
              <Text style={[styles.profileCompleteSectionLabel, { color: t.primary }]}>Emergency Details</Text>

              <Text style={[styles.inputLabel, { color: t.muted }]}>Primary SOS Contact</Text>
              <TextInput
                style={[styles.input, { backgroundColor: t.subtle, borderColor: t.border, color: t.text }]}
                placeholder="Primary emergency number"
                placeholderTextColor={t.muted}
                keyboardType="number-pad"
                maxLength={15}
                value={sosNumber}
                onChangeText={(v) => { setSosNumber(sanitizeEmergencyNumber(v)); setError(''); }}
              />

              <Text style={[styles.inputLabel, { color: t.muted }]}>Secondary Contact (Optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: t.subtle, borderColor: t.border, color: t.text }]}
                placeholder="Secondary emergency number"
                placeholderTextColor={t.muted}
                keyboardType="number-pad"
                maxLength={15}
                value={secondarySosNumber}
                onChangeText={(v) => { setSecondarySosNumber(sanitizeEmergencyNumber(v)); setError(''); }}
              />

              <Text style={[styles.inputLabel, { color: t.muted }]}>Third Contact (Optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: t.subtle, borderColor: t.border, color: t.text }]}
                placeholder="Third emergency number"
                placeholderTextColor={t.muted}
                keyboardType="number-pad"
                maxLength={15}
                value={thirdSosNumber}
                onChangeText={(v) => { setThirdSosNumber(sanitizeEmergencyNumber(v)); setError(''); }}
              />
            </View>

            {/* Blood Group */}
            <View style={styles.formSection}>
              <Text style={[styles.inputLabel, { color: t.muted }]}>Blood Group</Text>
              <View style={styles.bloodGroupRow}>
                {BLOOD_GROUPS.map((bg) => {
                  const selected = bloodGroup === bg;
                  return (
                    <TouchableOpacity
                      key={bg}
                      style={[
                        styles.bloodGroupChip,
                        {
                          borderColor: selected ? t.primary : t.border,
                          backgroundColor: selected ? `${t.primary}22` : t.subtle
                        }
                      ]}
                      onPress={() => { setBloodGroup(bg); setError(''); }}
                    >
                      <Text style={[styles.bloodGroupChipText, { color: selected ? t.primary : t.muted }]}>
                        {bg}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {!!error && <Text style={[styles.errorText, { color: t.red }]}>{error}</Text>}

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: t.primary, opacity: isSubmitting ? 0.7 : 1 }]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <MaterialCommunityIcons name="check-bold" size={18} color="#fff" />
              )}
              <Text style={styles.primaryButtonText}>Submit</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};
