import { httpsCallable } from 'firebase/functions';

import { RidePost } from '../types';
import { getFirebaseServices } from './client';

type RideNotificationPayload = {
  rideId: string;
  creatorId: string;
  creatorName: string;
  title: string;
  city: string;
  visibility: RidePost['visibility'];
};

export const triggerRideCreatedNotification = async (ride: RidePost): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;

  const notify = httpsCallable<RideNotificationPayload, { ok: boolean }>(services.functions, 'notifyRideCreated');
  await notify({
    rideId: ride.id,
    creatorId: ride.creatorId,
    creatorName: ride.creatorName,
    title: ride.title,
    city: ride.city,
    visibility: ride.visibility
  });
};

export const triggerRideCancelledNotification = async (
  rideId: string,
  title: string,
  cancelledBy: string
): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;

  const notify = httpsCallable<{ rideId: string; title: string; cancelledBy: string }, { ok: boolean }>(
    services.functions,
    'notifyRideCancelled'
  );
  await notify({ rideId, title, cancelledBy });
};
