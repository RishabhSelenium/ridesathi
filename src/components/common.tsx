import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Image, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { colorForBadge, formatInrAmount, formatRideDistance, formatRideEta, TOKENS, Theme, avatarFallback } from '../app/ui';
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
  const isCreator = ride.creatorId === currentUserId;
  const isJoined = ride.currentParticipants.includes(currentUserId);
  const requiresJoinApproval = ride.joinPermission !== 'anyone';
  const joinModeLabel = requiresJoinApproval ? 'Request approval' : 'Open join';
  const hasRouteStats =
    typeof ride.routeEtaMinutes === 'number' || typeof ride.routeDistanceKm === 'number' || typeof ride.tollEstimateInr === 'number';
  const paymentSummary = getRidePaymentSummary(ride);

  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]} onPress={() => onOpenDetail(ride)}>
      <View style={styles.rowBetween}>
        <TouchableOpacity style={styles.rowAligned} onPress={() => onViewProfile?.(ride.creatorId)}>
          <Image source={{ uri: ride.creatorAvatar || avatarFallback }} style={styles.avatarSmall} />
          <Text style={[styles.boldText, { color: t.text }]}>{ride.creatorName}</Text>
        </TouchableOpacity>
        <View style={styles.rowAligned}>
          {isCreator && (
            <>
              <Badge color="blue" theme={theme}>
                Organizing
              </Badge>
              {ride.requests.length > 0 && (
                <>
                  <View style={{ width: 6 }} />
                  <Badge color="orange" theme={theme}>
                    {ride.requests.length} requests
                  </Badge>
                </>
              )}
              <View style={{ width: 6 }} />
            </>
          )}
          {isJoined && !isCreator && (
            <>
              <Badge color="green" theme={theme}>
                Joined
              </Badge>
              <View style={{ width: 6 }} />
            </>
          )}
          <Badge color="orange" theme={theme}>
            {ride.type}
          </Badge>
        </View>
      </View>

      <Text style={[styles.cardTitle, { color: t.text }]}>{ride.title}</Text>

      <View style={styles.metaRow}>
        <View style={styles.rowAligned}>
          <MaterialCommunityIcons name="clock-outline" size={14} color={t.primary} />
          <Text style={[styles.metaText, { color: t.muted }]}>{ride.startTime}</Text>
        </View>
        <View style={styles.rowAligned}>
          <MaterialCommunityIcons name="account-group-outline" size={14} color={t.primary} />
          <Text style={[styles.metaText, { color: t.muted }]}>
            {ride.currentParticipants.length}/{ride.maxParticipants}
          </Text>
        </View>
      </View>

      {hasRouteStats && (
        <View style={styles.wrapRow}>
          {typeof ride.routeEtaMinutes === 'number' && (
            <View style={[styles.pillTag, { borderColor: t.border, backgroundColor: t.subtle }]}>
              <Text style={[styles.pillTagText, { color: t.text }]}>ETA {formatRideEta(ride.routeEtaMinutes)}</Text>
            </View>
          )}
          {typeof ride.routeDistanceKm === 'number' && (
            <View style={[styles.pillTag, { borderColor: t.border, backgroundColor: t.subtle }]}>
              <Text style={[styles.pillTagText, { color: t.text }]}>{formatRideDistance(ride.routeDistanceKm)}</Text>
            </View>
          )}
          {typeof ride.tollEstimateInr === 'number' && (
            <View style={[styles.pillTag, { borderColor: t.border, backgroundColor: t.subtle }]}>
              <Text style={[styles.pillTagText, { color: t.text }]}>Toll {formatInrAmount(ride.tollEstimateInr)}</Text>
            </View>
          )}
        </View>
      )}

      {paymentSummary && (
        <View style={[styles.pillTag, { alignSelf: 'flex-start', borderColor: t.border, backgroundColor: t.subtle }]}>
          <Text style={[styles.pillTagText, { color: t.text }]}>{paymentSummary}</Text>
        </View>
      )}

      <View style={[styles.pillTag, { alignSelf: 'flex-start', borderColor: t.border, backgroundColor: t.subtle }]}>
        <Text style={[styles.pillTagText, { color: t.muted }]}>{joinModeLabel}</Text>
      </View>

      <View style={[styles.routePreview, { borderColor: t.border, backgroundColor: t.subtle }]}> 
        <Text style={[styles.inputLabel, { color: t.muted }]}>Route</Text>
        <Text style={[styles.bodyText, { color: t.text }]} numberOfLines={2}>
          {ride.route}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export const Badge = ({ children, color = 'orange', theme }: { children: React.ReactNode; color?: 'orange' | 'blue' | 'green' | 'slate'; theme: Theme }) => {
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
