type RideRequestFanoutPayload = {
  rideId: string;
  rideTitle: string;
  requesterId: string;
  requesterName: string;
  ownerPushTokens: string[];
};

const EXPO_PUSH_TOKEN_REGEX = /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/;

const resolveFanoutBaseUrl = (): string => {
  const explicitBase = (process.env.EXPO_PUBLIC_PUSH_FANOUT_BASE_URL ?? '').trim();
  if (explicitBase.length > 0) return explicitBase;
  return (process.env.EXPO_PUBLIC_R2_UPLOAD_BASE_URL ?? '').trim();
};

export const triggerRideRequestOwnerFanout = async (payload: RideRequestFanoutPayload): Promise<void> => {
  const baseUrl = resolveFanoutBaseUrl();
  const fanoutToken = (process.env.EXPO_PUBLIC_PUSH_FANOUT_TOKEN ?? '').trim();
  if (!baseUrl || !fanoutToken) return;

  const validOwnerTokens = Array.from(new Set(payload.ownerPushTokens)).filter((token) => EXPO_PUSH_TOKEN_REGEX.test(token));
  if (validOwnerTokens.length === 0) return;

  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/notify/ride-request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${fanoutToken}`
    },
    body: JSON.stringify({
      rideId: payload.rideId,
      rideTitle: payload.rideTitle,
      requesterId: payload.requesterId,
      requesterName: payload.requesterName,
      ownerPushTokens: validOwnerTokens
    })
  });

  if (!response.ok) {
    throw new Error(`Ride request fanout failed (${response.status})`);
  }
};
