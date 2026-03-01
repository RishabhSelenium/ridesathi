import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import React, { useRef, useState } from 'react';
import {
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
import { Conversation, HelpPost, NewsArticle, RidePost, User } from '../types';

export const SplashScreen = ({ theme }: { theme: Theme }) => {
  const t = TOKENS[theme];

  return (
    <SafeAreaView style={[styles.fullScreen, { backgroundColor: t.bg }]}> 
      <ExpoStatusBar style={theme === 'light' ? 'dark' : 'light'} translucent={false} backgroundColor={t.bg} />
      <View style={styles.centered}>
        <View style={[styles.splashIcon, { backgroundColor: t.primary }]}> 
          <MaterialCommunityIcons name="flash" size={56} color="#fff" />
        </View>
        <Text style={[styles.splashBrand, { color: t.text }]}>RideSathi</Text>
        <Text style={[styles.splashSubtitle, { color: t.primary }]}>COMMUNITY GRID</Text>
      </View>
    </SafeAreaView>
  );
};

export const LoginScreen = ({
  onLogin,
  theme,
  onToggleTheme
}: {
  onLogin: () => void;
  theme: Theme;
  onToggleTheme: (next: Theme) => void;
}) => {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const phoneInputRef = useRef<TextInput>(null);
  const t = TOKENS[theme];

  const expectedOtp = phoneNumber.slice(-4);
  const maskedPhone = phoneNumber.length >= 4 ? `+91******${phoneNumber.slice(-4)}` : '+91******9443';

  const handleGetOtp = () => {
    if (phoneNumber.length < 10) {
      setError('Enter a valid 10-digit phone number.');
      return;
    }
    setError('');
    setStep('otp');
  };

  const handleVerify = () => {
    if (otp.length < 4) {
      setError('Enter the 4-digit OTP.');
      return;
    }

    if (otp !== expectedOtp) {
      setError('Invalid OTP. For prototype, use your phone last 4 digits.');
      return;
    }

    setError('');
    onLogin();
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fullScreen}>
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

            <Text style={[styles.loginTitle, { color: t.text }]}>{step === 'phone' ? 'Ride Connected' : 'Enter Verification code'}</Text>
            {step !== 'phone' && (
              <Text style={[styles.loginSubtitle, { color: t.muted }]}>
                {`We've sent a 4-digit code to ${maskedPhone}`}
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
                <TouchableOpacity style={[styles.primaryButton, { backgroundColor: t.primary }]} onPress={handleGetOtp}>
                  <MaterialCommunityIcons name="message-text-outline" size={18} color="#fff" />
                  <Text style={styles.primaryButtonText}>Get OTP</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.formSection}>
                <TextInput
                  style={[styles.input, { backgroundColor: t.subtle, borderColor: t.border, color: t.text }]}
                  keyboardType="number-pad"
                  maxLength={4}
                  value={otp}
                  placeholder="4 digit OTP"
                  placeholderTextColor={t.muted}
                  onChangeText={(value) => {
                    setOtp(value.replace(/\D/g, '').slice(0, 4));
                    setError('');
                  }}
                />

                <TouchableOpacity style={[styles.primaryButton, { backgroundColor: t.primary }]} onPress={handleVerify}>
                  <MaterialCommunityIcons name="fingerprint" size={18} color="#fff" />
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
  currentUser,
  onOpenRideDetail,
  onOpenHelpDetail,
  onViewProfile
}: {
  theme: Theme;
  feedFilter: 'rides' | 'help';
  rides: RidePost[];
  helpPosts: HelpPost[];
  currentUser: User;
  onOpenRideDetail: (ride: RidePost) => void;
  onOpenHelpDetail: (post: HelpPost) => void;
  onViewProfile: (userId: string) => void;
}) => {
  const t = TOKENS[theme];

  if (feedFilter === 'rides') {
    return (
      <View style={styles.listWrap}>
        {rides.map((ride) => (
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
  }

  return (
    <View style={styles.listWrap}>
      {helpPosts.map((post) => (
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
      ))}
    </View>
  );
};

export const NewsTab = ({
  theme,
  newsArticles,
  onOpenArticle
}: {
  theme: Theme;
  newsArticles: NewsArticle[];
  onOpenArticle: (url: string) => void;
}) => {
  const t = TOKENS[theme];

  return (
    <View style={styles.listWrap}>
      {newsArticles.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={[styles.newsCard, { backgroundColor: t.card, borderColor: t.border }]}
          onPress={() => onOpenArticle(item.url)}
        >
          {item.image && <Image source={{ uri: item.image }} style={styles.newsImage} resizeMode="cover" />}

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
      ))}
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
  const myRides = rides.filter((ride) => ride.currentParticipants.includes(currentUser.id));
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
  onOpenChatRoom,
  onViewProfile
}: {
  theme: Theme;
  conversations: Conversation[];
  onOpenChatRoom: (conversation: Conversation) => void;
  onViewProfile: (userId: string) => void;
}) => {
  const t = TOKENS[theme];

  return (
    <View style={styles.listWrap}>
      {conversations.map((chat) => (
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
      ))}
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

  return (
    <View style={styles.listWrap}>
      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}> 
        <View style={styles.rowBetween}>
          <View style={styles.rowAligned}>
            <Image source={{ uri: currentUser.avatar || avatarFallback }} style={styles.avatarLarge} />
            <View>
              <Text style={[styles.profileName, { color: t.text }]}>{currentUser.name}</Text>
              <Text style={[styles.metaText, { color: t.muted }]}>{currentUser.handle}</Text>
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
            <Text style={[styles.profileStatValue, { color: t.primary }]}>{rides.filter((r) => r.creatorId === currentUser.id).length}</Text>
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
        {currentUser.friends.length === 0 ? (
          <Text style={[styles.bodyText, { color: t.muted }]}>No riders in your squad yet.</Text>
        ) : (
          currentUser.friends.map((friendId) => {
            const friend = users.find((u) => u.id === friendId);
            if (!friend) return null;

            return (
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
                    const conv = conversations.find((item) => item.participantId === friendId);
                    if (conv) {
                      onOpenConversation(conv);
                      return;
                    }
                    onStartConversation(friendId);
                  }}
                  style={[styles.iconButton, { borderColor: t.border, backgroundColor: t.subtle }]}
                >
                  <MaterialCommunityIcons name="message-outline" size={18} color={t.primary} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })
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
