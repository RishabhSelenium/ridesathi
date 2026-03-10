import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Image, Text, TextInput, TouchableOpacity, View } from 'react-native';

import {
  colorForBadge,
  formatInrAmount,
  formatRideDistance,
  formatRideEta,
  getRideLifecycleStatus,
  getRideStartDateTime,
  TOKENS,
  Theme,
  avatarFallback
} from '../app/ui';
import { styles } from '../app/styles';
import { RidePost } from '../types';

const formatInrCurrency = (amount: number): string => `₹${Math.max(0, Math.round(amount)).toLocaleString('en-IN')}`;

const getRidePaymentSummary = (ride: RidePost): string | null => {
  if (ride.costType === 'Paid' && typeof ride.pricePerPerson === 'number' && ride.pricePerPerson > 0) {
    return `Paid • ${formatInrCurrency(ride.pricePerPerson)}/rider`;
  }

  if (ride.costType === 'Split') {
    if (typeof ride.splitTotalAmount === 'number' && ride.splitTotalAmount > 0) {
      const payingCount = Math.max(1, ride.currentParticipants.filter((participantId) => participantId !== ride.creatorId).length);
      const perRider = ride.splitTotalAmount / payingCount;
      return `Split • ${formatInrCurrency(perRider)}/rider`;
    }

    if (typeof ride.pricePerPerson === 'number' && ride.pricePerPerson > 0) {
      return `Split • ${formatInrCurrency(ride.pricePerPerson)}/rider`;
    }
  }

  return null;
};

export const RideCard = ({
  ride,
  currentUserId,
  onOpenDetail,
  onViewProfile,
  theme
}: {
  ride: RidePost;
  currentUserId: string;
  onOpenDetail: (ride: RidePost) => void;
  onViewProfile?: (userId: string) => void;
  theme: Theme;
}) => {
  const t = TOKENS[theme];
  const paymentSummary = getRidePaymentSummary(ride);

  const startLoc = ride.startLocation || ride.city || 'Start';
  const endLoc = ride.endLocation || ride.primaryDestination || 'Destination';
  const durationLabel = ride.rideDuration || '1 Day';
  const participantCount = ride.currentParticipants.length;

  const rideLifecycle = getRideLifecycleStatus(ride);
  const rideStartDt = getRideStartDateTime(ride);
  const now = Date.now();
  const startsAtTime = rideStartDt?.getTime() ?? rideLifecycle.startsAt?.getTime();
  const isUpcomingSoon = !!startsAtTime && (startsAtTime - now) > 0 && (startsAtTime - now) < 24 * 60 * 60 * 1000;

  const dateLabel = rideStartDt
    ? rideStartDt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
    : (ride.startDate?.trim() || ride.date?.trim() || '');

  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isUpcomingSoon) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: false
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1200,
            useNativeDriver: false
          })
        ])
      ).start();
    }
  }, [isUpcomingSoon, glowAnim]);

  const animatedBorderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [t.border, t.primary]
  });

  const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

  return (
    <AnimatedTouchableOpacity
      style={[
        styles.rideCard,
        { backgroundColor: t.card },
        isUpcomingSoon ? {
          borderColor: animatedBorderColor,
          elevation: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }),
          shadowColor: t.primary,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] }),
          shadowRadius: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 8] })
        } : { borderColor: t.border }
      ]}
      onPress={() => onOpenDetail(ride)}
    >

      <View style={styles.rideCardCover}>
        <Image
          source={{ uri: `https://picsum.photos/seed/${encodeURIComponent(endLoc)}/800/400` }}
          style={styles.rideCardCoverImage}
        />

        <View style={styles.rideCardCoverOverlayTopLeft}>
          <View style={styles.rideCardDurationPill}>
            <Text style={styles.rideCardDurationText}>{durationLabel}</Text>
          </View>
        </View>

        <View style={styles.rideCardCoverOverlayTopRight}>
          <MaterialCommunityIcons name="share" size={28} color="#fff" style={{ textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }} />
        </View>

        <View style={styles.rideCardCoverOverlayBottomLeft}>
          <MaterialCommunityIcons name="map-marker-outline" size={16} color="#fff" />
          <Text style={styles.rideCardCoverOverlayBottomText} numberOfLines={1}>
            {endLoc}
          </Text>
        </View>
      </View>

      <View style={styles.rideCardBody}>
        <View style={styles.rideCardTitleRow}>
          <Text style={[styles.rideCardTitle, { color: t.text }]} numberOfLines={1}>{ride.title}</Text>
        </View>

        <View style={styles.rideCardRouteRow}>
          <Text style={[styles.rideCardRoutePointText, { color: t.text }]} numberOfLines={1}>{startLoc}</Text>
          <View style={styles.rideCardRouteLineContainer}>
            <View style={[styles.rideCardRouteDot, { backgroundColor: t.primary }]} />
            <View style={[styles.rideCardRouteLine, { backgroundColor: t.primary }]} />
            <View style={[styles.rideCardRouteDot, { backgroundColor: t.primary }]} />
          </View>
          <Text style={[styles.rideCardRoutePointText, { color: t.text, textAlign: 'right' }]} numberOfLines={2}>{endLoc}</Text>
        </View>

        <View style={styles.rideCardMetaRow}>
          <View style={[styles.rideCardMetaChip, { backgroundColor: t.subtle }]}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={16} color={t.muted} />
            <Text style={[styles.rideCardMetaChipText, { color: t.muted }]}>{dateLabel}</Text>
          </View>

          {typeof ride.routeDistanceKm === 'number' && (
            <View style={[styles.rideCardMetaChip, { backgroundColor: t.subtle }]}>
              <MaterialCommunityIcons name="map-marker-distance" size={16} color={t.muted} />
              <Text style={[styles.rideCardMetaChipText, { color: t.muted }]}>{formatRideDistance(ride.routeDistanceKm)}</Text>
            </View>
          )}

          <View style={[styles.rideCardMetaChip, { backgroundColor: t.subtle }]}>
            <MaterialCommunityIcons name="account-group-outline" size={16} color={t.muted} />
            <Text style={[styles.rideCardMetaChipText, { color: t.muted }]}>{participantCount}</Text>
          </View>
        </View>

        <View style={[styles.rideCardDivider, { backgroundColor: t.border }]} />

        <View style={styles.rideCardFooter}>
          <View style={styles.rideCardFooterLeft}>
            <Text style={[styles.rideCardFooterLabel, { color: t.muted }]}>Riding With</Text>
            <TouchableOpacity onPress={() => onViewProfile?.(ride.creatorId)}>
              <Text style={[styles.rideCardCreatorName, { color: t.primary }]} numberOfLines={1}>{ride.creatorName}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.rideCardFooterRight}>
            <Text style={[styles.rideCardCostValue, { color: t.text }]}>
              {paymentSummary ? paymentSummary.split(' • ')[0] : (ride.costType || 'Free')}
            </Text>
            <Text style={[styles.rideCardCostSub, { color: t.muted }]}>Cost/person</Text>
          </View>
        </View>
      </View>
    </AnimatedTouchableOpacity>
  );
};

export const Badge = ({
  children,
  color = 'orange',
  theme
}: {
  children: React.ReactNode;
  color?: 'orange' | 'blue' | 'green' | 'red' | 'slate';
  theme: Theme;
}) => {
  const c = colorForBadge(color, theme);

  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={[styles.badgeText, { color: c.text }]}>{children}</Text>
    </View>
  );
};

export const TabButton = ({
  theme,
  icon,
  label,
  active,
  onPress
}: {
  theme: Theme;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
}) => {
  const t = TOKENS[theme];

  return (
    <TouchableOpacity style={styles.tabButton} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={22} color={active ? t.primary : t.muted} />
      <Text style={[styles.tabLabel, { color: active ? t.primary : t.muted }]}>{label}</Text>
    </TouchableOpacity>
  );
};


export const LabeledInput = ({
  label,
  value,
  onChangeText,
  theme,
  placeholder,
  multiline,
  keyboardType
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  theme: Theme;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad' | 'email-address';
}) => {
  const t = TOKENS[theme];

  return (
    <View>
      <Text style={[styles.inputLabel, { color: t.muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.muted}
        multiline={multiline}
        keyboardType={keyboardType}
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          {
            backgroundColor: t.subtle,
            borderColor: t.border,
            color: t.text,
            textAlignVertical: multiline ? 'top' : 'center'
          }
        ]}
      />
    </View>
  );
};

export const SelectorRow = ({
  label,
  options,
  selected,
  onSelect,
  theme
}: {
  label: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
  theme: Theme;
}) => {
  const t = TOKENS[theme];

  return (
    <View>
      <Text style={[styles.inputLabel, { color: t.muted }]}>{label}</Text>
      <View style={styles.wrapRow}>
        {options.map((option) => {
          const isActive = selected === option;
          return (
            <TouchableOpacity
              key={option}
              style={[
                styles.selectorChip,
                {
                  borderColor: isActive ? t.primary : t.border,
                  backgroundColor: isActive ? `${t.primary}22` : t.subtle
                }
              ]}
              onPress={() => onSelect(option)}
            >
              <Text style={[styles.selectorChipText, { color: isActive ? t.primary : t.muted }]}>{option}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};
