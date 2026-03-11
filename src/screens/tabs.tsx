import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Pressable,
  Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  // Simple animated progress bar logic
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(progressAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: false
        }),
        Animated.timing(progressAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: false
        })
      ])
    ).start();
  }, [progressAnim]);

  return (
    <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg }]}>
      <ExpoStatusBar style={theme === 'light' ? 'dark' : 'light'} translucent={false} backgroundColor={t.bg} />
      <View style={styles.centered}>
        <Image
          source={require('../assets/logo.png')}
          style={{ width: 140, height: 140, marginBottom: 16 }}
          resizeMode="contain"
        />
        <Text style={[styles.splashBrand, { color: t.text }]}>ThrottleUp</Text>
        <Text style={{ color: t.muted, fontSize: 13, marginTop: 12, marginBottom: 20 }}>
          Warming up the engine...
        </Text>
        <View style={{ width: 140, height: 4, backgroundColor: t.border, borderRadius: 2, overflow: 'hidden' }}>
          <Animated.View
            style={{
              height: '100%',
              backgroundColor: t.primary,
              borderRadius: 2,
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%']
              })
            }}
          />
        </View>
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
            {!firebaseEnabled && (
              <Text style={[styles.errorText, { color: TOKENS[theme].red }]}>
                Cloud sync is disabled in this build. Data will stay on this device only.
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
  totalNewsCount,
  syncError,
  isSyncing,
  onRetrySync,
  hasMoreItems,
  onOpenArticle
}: {
  theme: Theme;
  newsArticles: NewsArticle[];
  totalNewsCount: number;
  syncError: string | null;
  isSyncing: boolean;
  onRetrySync: () => void;
  hasMoreItems: boolean;
  onOpenArticle: (url: string) => void;
}) => {
  const t = TOKENS[theme];
  const [failedImages, setFailedImages] = useState<Record<string, { url: string; failedAt: number }>>({});

  useEffect(() => {
    setFailedImages((previous) => {
      const previousEntries = Object.entries(previous);
      if (previousEntries.length === 0) return previous;

      const currentImageByKey = new Map(newsArticles.map((article) => [`${article.id}-${article.url}`, article.image ?? '']));
      let changed = false;
      const next: Record<string, { url: string; failedAt: number }> = {};

      previousEntries.forEach(([articleKey, failed]) => {
        const currentUrl = currentImageByKey.get(articleKey);
        if (!currentUrl) {
          changed = true;
          return;
        }
        if (currentUrl !== failed.url) {
          changed = true;
          return;
        }
        if (Date.now() - failed.failedAt > 90_000) {
          changed = true;
          return;
        }

        next[articleKey] = failed;
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

      {totalNewsCount > 0 ? (
        <View
          style={[
            {
              borderWidth: 1,
              borderRadius: 10,
              minHeight: 34,
              paddingHorizontal: 10,
              alignItems: 'center',
              justifyContent: 'center'
            },
            { borderColor: t.border, backgroundColor: t.subtle }
          ]}
        >
          <Text style={[styles.metaText, { color: t.muted }]}>
            Showing {newsArticles.length} of {totalNewsCount} news items
          </Text>
        </View>
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
        newsArticles.map((item, index) => {
          const failedImageKey = `${item.id}-${item.url}`;
          const primaryTag = item.tags[0] ?? 'Motorcycles';
          const imageUrl = item.image ?? '';
          const failed = failedImages[failedImageKey];
          const shouldRenderImage = Boolean(imageUrl) && (!failed || failed.url !== imageUrl || Date.now() - failed.failedAt > 90_000);
          const imageDebugSource = shouldRenderImage ? (item.imageDebugSource === 'enriched' ? 'enriched' : 'feed') : 'fallback';

          return (
            <TouchableOpacity
              key={`${item.id}-${item.url}-${index}`}
              style={[styles.newsCard, { backgroundColor: t.card, borderColor: t.border }]}
              onPress={() => onOpenArticle(item.url)}
            >
              {shouldRenderImage ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={styles.newsImage}
                  resizeMode="cover"
                  onError={() => {
                    if (!imageUrl) return;
                    setFailedImages((previous) => {
                      const previousEntry = previous[failedImageKey];
                      if (previousEntry && previousEntry.url === imageUrl && Date.now() - previousEntry.failedAt < 1_500) return previous;
                      return {
                        ...previous,
                        [failedImageKey]: { url: imageUrl, failedAt: Date.now() }
                      };
                    });
                  }}
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

              {__DEV__ ? (
                <Text style={[styles.metaText, { color: t.muted }]}>image: {imageDebugSource}</Text>
              ) : null}

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

      {hasMoreItems ? (
        <View
          style={[
            {
              borderWidth: 1,
              borderRadius: 12,
              minHeight: 40,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            },
            { borderColor: t.border, backgroundColor: t.subtle }
          ]}
        >
          <MaterialCommunityIcons name="chevron-double-down" size={16} color={t.muted} />
          <Text style={[styles.metaText, { color: t.muted }]}>Scroll down to load more news</Text>
        </View>
      ) : null}
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
  squads,
  currentUser,
  syncError,
  isSyncing,
  users,
  onRetrySync,
  onOpenChatRoom,
  onOpenSquadChat,
  onViewProfile,
  onStartConversation
}: {
  theme: Theme;
  conversations: Conversation[];
  squads: Squad[];
  currentUser: User;
  users: User[];
  syncError: string | null;
  isSyncing: boolean;
  onRetrySync: () => void;
  onOpenChatRoom: (conversation: Conversation) => void;
  onOpenSquadChat: (squad: Squad) => void;
  onViewProfile: (userId: string) => void;
  onStartConversation: (userId: string) => void;
}) => {
  const t = TOKENS[theme];
  type ChatFilter = 'all' | 'friends' | 'squads' | 'unread';
  const [activeFilter, setActiveFilter] = useState<ChatFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const friends = useMemo(() => {
    return currentUser.friends
      .map(id => users.find(u => u.id === id))
      .filter((u): u is User => !!u);
  }, [currentUser.friends, users]);

  const mySquads = useMemo(() => squads.filter((sq) => sq.members.includes(currentUser.id)), [squads, currentUser.id]);

  const filteredConversations = useMemo(() => {
    let result = conversations;
    
    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(c => 
        c.participantName.toLowerCase().includes(query) || 
        c.lastMessage.toLowerCase().includes(query)
      );
    }

    // Apply pills
    if (activeFilter === 'unread') {
      result = result.filter(c => c.unreadCount > 0);
    }
    
    return result;
  }, [conversations, activeFilter, searchQuery]);

  const filteredSquads = useMemo(() => {
    let result = mySquads;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(s => s.name.toLowerCase().includes(query));
    }
    return result;
  }, [mySquads, searchQuery]);

  const renderFilterPill = (filter: ChatFilter, label: string) => (
    <TouchableOpacity
      style={[
        styles.chatFilterPill,
        { 
          backgroundColor: activeFilter === filter ? `${t.primary}22` : t.bg,
          borderColor: activeFilter === filter ? 'transparent' : t.border 
        }
      ]}
      onPress={() => setActiveFilter(filter)}
    >
      <Text style={[
        styles.chatFilterPillText, 
        { color: activeFilter === filter ? t.primary : t.muted }
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.listWrap}>
      <View style={styles.chatHeaderContainer}>
        <View style={[styles.chatSearchContainer, { backgroundColor: t.subtle, borderColor: t.border }]}>
          <MaterialCommunityIcons name="magnify" size={20} color={t.muted} />
          <TextInput
            style={[styles.chatSearchInput, { color: t.text }]}
            placeholder="Search chats"
            placeholderTextColor={t.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.chatFiltersScroll}
          contentContainerStyle={styles.chatFiltersContainer}
        >
          {renderFilterPill('all', 'All')}
          {renderFilterPill('friends', 'Friends')}
          {renderFilterPill('squads', 'Squads')}
          {renderFilterPill('unread', 'Unread')}
        </ScrollView>
      </View>

      {syncError ? (
        <SyncErrorBanner
          theme={theme}
          title="Chat Sync Failed"
          message={syncError}
          isSyncing={isSyncing}
          onRetry={onRetrySync}
        />
      ) : null}

      <View style={{ paddingHorizontal: 0 }}>
      {activeFilter === 'all' || activeFilter === 'unread' ? (
        filteredConversations.length === 0 ? (
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="message-outline" size={48} color={t.muted} />
            <Text style={[styles.emptyTitle, { color: t.text }]}>No chats yet.</Text>
            <Text style={[styles.emptySubtitle, { color: t.muted }]}>Connect with riders to start messaging.</Text>
          </View>
        ) : (
          filteredConversations.map((chat) => (
            <TouchableOpacity
              key={chat.id}
              style={styles.chatRow}
              onPress={() => onOpenChatRoom(chat)}
            >
              <TouchableOpacity onPress={() => onViewProfile(chat.participantId)}>
                <View>
                  <Image source={{ uri: chat.participantAvatar || avatarFallback }} style={styles.chatAvatar} />
                </View>
              </TouchableOpacity>
              <View style={styles.chatInfo}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.chatParticipantName, { color: t.text }]} numberOfLines={1}>
                    {chat.participantName}
                  </Text>
                  <Text style={[styles.chatTimestamp, { color: chat.unreadCount > 0 ? t.primary : t.muted }]}>{chat.timestamp}</Text>
                </View>
                <View style={styles.rowBetween}>
                  <Text style={[styles.chatPreviewText, { color: t.muted, flex: 1, paddingRight: 10 }]} numberOfLines={1}>
                    {chat.lastMessage}
                  </Text>
                  {chat.unreadCount > 0 && (
                     <View style={[styles.chatUnreadBadge, { backgroundColor: t.primary }]}>
                        <Text style={styles.chatUnreadBadgeText}>{chat.unreadCount}</Text>
                     </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ))
        )
      ) : activeFilter === 'squads' ? (
        filteredSquads.length === 0 ? (
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="account-group-outline" size={48} color={t.muted} />
            <Text style={[styles.emptyTitle, { color: t.text }]}>No squads joined.</Text>
            <Text style={[styles.emptySubtitle, { color: t.muted }]}>Join a squad to participate in group chats.</Text>
          </View>
        ) : (
          filteredSquads.map((squad) => (
            <TouchableOpacity
              key={squad.id}
              style={styles.chatRow}
              onPress={() => onOpenSquadChat(squad)}
            >
              <View>
                <Image source={{ uri: squad.avatar || avatarFallback }} style={styles.chatAvatar} />
              </View>
              <View style={styles.chatInfo}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.chatParticipantName, { color: t.text }]} numberOfLines={1}>
                    {squad.name}
                  </Text>
                </View>
                <Text style={[styles.chatPreviewText, { color: t.muted }]} numberOfLines={1}>
                  {squad.members.length} member{squad.members.length === 1 ? '' : 's'}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )
      ) : (
        friends.length === 0 ? (
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="account-search-outline" size={48} color={t.muted} />
            <Text style={[styles.emptyTitle, { color: t.text }]}>No friends found</Text>
            <Text style={[styles.emptySubtitle, { color: t.muted }]}>Add friends to start messaging them.</Text>
          </View>
        ) : (
          friends.map(friend => (
            <TouchableOpacity 
              key={friend.id} 
              style={styles.chatRow}
              onPress={() => onStartConversation(friend.id)}
            >
              <Image source={{ uri: friend.avatar || avatarFallback }} style={styles.chatAvatar} />
              <View style={styles.chatInfo}>
                <Text style={[styles.chatParticipantName, { color: t.text }]}>{friend.name}</Text>
                <Text style={[styles.chatPreviewText, { color: t.muted }]}>{friend.bikeType} • {friend.city}</Text>
              </View>
              <MaterialCommunityIcons name="message-text-outline" size={24} color={t.primary} />
            </TouchableOpacity>
          ))
        )
      )}
      </View>
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
  rides,
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
  rides: RidePost[];
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
  const [searchDraft, setSearchDraft] = useState(searchQuery);
  useEffect(() => {
    setSearchDraft(searchQuery);
  }, [searchQuery]);

  const applySearch = () => {
    onSearchChange(searchDraft.trim());
  };

  const usersById = useMemo(() => {
    const byId = new Map<string, User>();
    byId.set(currentUser.id, currentUser);
    users.forEach((user) => byId.set(user.id, user));
    return byId;
  }, [currentUser, users]);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredSquads = useMemo(
    () => {
      if (!normalizedSearchQuery) return squads;
      return squads.filter((squad) => {
        const nameMatch = squad.name.toLowerCase().includes(normalizedSearchQuery);
        const cityMatch = squad.city.toLowerCase().includes(normalizedSearchQuery);
        const styleMatch = squad.rideStyles.some(style => style.toLowerCase().includes(normalizedSearchQuery));
        return nameMatch || cityMatch || styleMatch;
      });
    },
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

  const nearbySquads = useMemo(
    () => discoverSquads.filter((squad) => squad.city.toLowerCase() === currentUser.city.toLowerCase()),
    [discoverSquads, currentUser.city]
  );

  const otherDiscoverSquads = useMemo(
    () => discoverSquads.filter((squad) => squad.city.toLowerCase() !== currentUser.city.toLowerCase()),
    [discoverSquads, currentUser.city]
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
    const hasPendingRequest = squad.joinRequests.includes(currentUser.id);
    const isAdmin = squad.adminIds.includes(currentUser.id);
    const canManageRequests = squad.creatorId === currentUser.id || isAdmin;
    const pendingRequestCount = squad.joinRequests.length;
    const squadRidesCount = rides.filter((r) => r.squadId === squad.id).length;

    return (
      <TouchableOpacity
        key={squad.id}
        style={[styles.squadCard, { backgroundColor: t.card, borderColor: t.border, padding: 12, borderRadius: 12 }]}
        onPress={() => onOpenSquadDetail(squad.id)}
      >
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <Image 
            source={{ uri: squad.avatar || avatarFallback }} 
            style={{ width: 84, height: 84, borderRadius: 8, backgroundColor: t.subtle }} 
            resizeMode="cover"
          />
          <View style={{ flex: 1, justifyContent: 'space-between', paddingVertical: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
               <Text style={[styles.squadName, { color: t.text, flex: 1, marginRight: 8, fontSize: 15, textTransform: 'uppercase' }]} numberOfLines={2}>
                 {squad.name}
               </Text>
               {isMember ? (
                  <TouchableOpacity onPress={(e) => { e.stopPropagation(); onOpenSquadDetail(squad.id); }}>
                     <MaterialCommunityIcons name="menu" size={22} color={t.muted} />
                  </TouchableOpacity>
               ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                     <MaterialCommunityIcons name="map-marker" size={14} color={t.muted} />
                     <Text style={[styles.metaText, { color: t.muted }]}>{squad.city}</Text>
                  </View>
               )}
            </View>

            {canManageRequests && pendingRequestCount > 0 && (
              <View style={[styles.pillTag, { borderColor: t.primary, backgroundColor: `${t.primary}18`, marginTop: 4, alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 6 }]}>
                <Text style={[styles.pillTagText, { color: t.primary, fontSize: 10 }]}>Requests: {pendingRequestCount}</Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 }}>
               <View style={{ flexDirection: 'row', gap: 16 }}>
                  <View>
                     <Text style={[styles.profileStatValue, { color: t.text, fontSize: 15, marginBottom: 2 }]}>{squad.members.length}</Text>
                     <Text style={[styles.metaText, { color: t.muted, fontSize: 11 }]}>Members</Text>
                  </View>
                  <View>
                     <Text style={[styles.profileStatValue, { color: t.text, fontSize: 15, marginBottom: 2 }]}>{squadRidesCount}</Text>
                     <Text style={[styles.metaText, { color: t.muted, fontSize: 11 }]}>Rides</Text>
                  </View>
               </View>

               {isMember ? (
                  <TouchableOpacity
                     style={[styles.squadActionButton, { borderColor: t.primary, paddingHorizontal: 16, minHeight: 32, borderRadius: 16 }]}
                     onPress={(e) => { e.stopPropagation?.(); onOpenSquadDetail(squad.id); }}
                  >
                     <Text style={[styles.squadActionButtonText, { color: t.primary, fontWeight: '700', textTransform: 'none' }]}>View Details</Text>
                  </TouchableOpacity>
               ) : hasPendingRequest ? (
                  <View style={[styles.squadActionButton, { borderColor: t.border, backgroundColor: t.subtle, paddingHorizontal: 16, minHeight: 32, borderRadius: 16 }]}>
                     <Text style={[styles.squadActionButtonText, { color: t.muted, fontWeight: '700', textTransform: 'none' }]}>Requested</Text>
                  </View>
               ) : squad.joinPermission === 'invite_only' ? (
                  <View
                     style={[styles.squadActionButton, { borderColor: t.text, paddingHorizontal: 16, minHeight: 32, borderRadius: 16 }]}
                  >
                     <Text style={[styles.squadActionButtonText, { color: t.text, fontWeight: '700', textTransform: 'none' }]}>Invite Only</Text>
                  </View>
               ) : (
                  <TouchableOpacity
                     style={[styles.squadActionButton, { borderColor: t.primary, backgroundColor: t.primary, paddingHorizontal: 16, minHeight: 32, borderRadius: 16 }]}
                     onPress={(e) => { e.stopPropagation?.(); onJoinSquad(squad.id); }}
                  >
                     <Text style={[styles.squadActionButtonText, { color: '#fff', fontWeight: '700', textTransform: 'none' }]}>
                        {squad.joinPermission === 'request_to_join' ? 'Send Request' : 'Join'}
                     </Text>
                  </TouchableOpacity>
               )}
            </View>
          </View>
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
            value={searchDraft}
            onChangeText={setSearchDraft}
            returnKeyType="search"
            onSubmitEditing={applySearch}
          />
        </View>
        <TouchableOpacity
          style={[styles.squadActionButton, { borderColor: t.border, backgroundColor: t.subtle, minHeight: 44 }]}
          onPress={applySearch}
        >
          <MaterialCommunityIcons name="magnify" size={16} color={t.primary} />
          <Text style={[styles.squadActionButtonText, { color: t.primary }]}>Search</Text>
        </TouchableOpacity>
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

      {nearbySquads.length > 0 && (
        <>
          <Text style={[styles.cardHeader, { color: t.muted, marginTop: 6 }]}>NEARBY SQUADS</Text>
          {nearbySquads.map((squad) => renderSquadCard(squad, false))}
        </>
      )}

      {otherDiscoverSquads.length > 0 && (
        <>
          <Text style={[styles.cardHeader, { color: t.muted, marginTop: 6 }]}>
            {nearbySquads.length > 0 ? 'OTHER SQUADS' : 'DISCOVER SQUADS'}
          </Text>
          {otherDiscoverSquads.map((squad) => renderSquadCard(squad, false))}
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
  phoneNumber,
  onSubmit
}: {
  theme: Theme;
  phoneNumber?: string;
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
  const [dob, setDob] = useState('');
  const [dobDate, setDobDate] = useState<Date | null>(null);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [bloodGroup, setBloodGroup] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const t = TOKENS[theme];

  const sanitizeEmergencyNumber = (value: string): string => {
    const digits = value.replace(/\D/g, '');
    return digits.length <= 10 ? digits : digits.slice(-10);
  };
  const normalizeComparablePhone = (value: string): string => {
    const digits = value.replace(/\D/g, '');
    return digits.length > 10 ? digits.slice(-10) : digits;
  };
  const formatDate = (value: Date): string => {
    const day = `${value.getDate()}`.padStart(2, '0');
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const year = value.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const handleDobPickerChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === 'dismissed' || !selectedDate) return;
    setDobDate(selectedDate);
    setDob(formatDate(selectedDate));
    setError('');
  };

  const openDobPicker = () => {
    setError('');
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: dobDate ?? new Date(2000, 0, 1),
        mode: 'date',
        display: 'calendar',
        maximumDate: new Date(),
        onChange: handleDobPickerChange
      });
      return;
    }
    setShowDobPicker(true);
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
    if (!dobDate || !dob || dob.length < 10) {
      setError('Please select your date of birth.');
      return;
    }
    const primaryContact = sanitizeEmergencyNumber(sosNumber);
    const currentUserPhone = normalizeComparablePhone(phoneNumber ?? '');
    const candidateContacts = [primaryContact].filter((contact) => contact.length > 0);
    const invalidContact = candidateContacts.find((contact) => contact.length !== 10);

    if (!primaryContact || primaryContact.length !== 10) {
      setError('Please enter a valid 10-digit primary SOS contact number.');
      return;
    }
    if (invalidContact) {
      setError('Each emergency contact should be exactly 10 digits.');
      return;
    }
    const comparableContacts = candidateContacts.map(normalizeComparablePhone);
    if (new Set(comparableContacts).size !== comparableContacts.length) {
      setError('SOS contacts must be different.');
      return;
    }
    if (currentUserPhone.length >= 10 && comparableContacts.includes(currentUserPhone)) {
      setError('SOS contacts cannot be the same as your phone number.');
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
              <TouchableOpacity
                style={[styles.input, { backgroundColor: t.subtle, borderColor: t.border, justifyContent: 'center' }]}
                onPress={openDobPicker}
              >
                <Text style={{ color: dob ? t.text : t.muted }}>
                  {dob || 'Select your date of birth'}
                </Text>
              </TouchableOpacity>
              {Platform.OS === 'ios' && showDobPicker && (
                <View style={{ marginTop: 8 }}>
                  <DateTimePicker
                    value={dobDate ?? new Date(2000, 0, 1)}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    maximumDate={new Date()}
                    onChange={handleDobPickerChange}
                  />
                  {Platform.OS === 'ios' && (
                    <TouchableOpacity
                      style={[styles.primaryCompactButton, { borderColor: t.border, backgroundColor: t.subtle, alignSelf: 'flex-end', marginTop: 6 }]}
                      onPress={() => setShowDobPicker(false)}
                    >
                      <Text style={[styles.primaryCompactButtonText, { color: t.primary, marginLeft: 0 }]}>Done</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
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
                maxLength={10}
                value={sosNumber}
                onChangeText={(v) => { setSosNumber(sanitizeEmergencyNumber(v)); setError(''); }}
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
