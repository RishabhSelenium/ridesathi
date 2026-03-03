import { RidePost, RideVisibility, User } from '../types';

const DEFAULT_VISIBILITY: RideVisibility[] = ['City'];

const normalizeCity = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ');

const NEARBY_CITY_GROUPS = [
  ['new delhi', 'delhi', 'ncr', 'gurugram', 'gurgaon', 'noida', 'greater noida', 'faridabad', 'ghaziabad']
] as const;

const nearbyCityByGroup = new Map<string, number>();
NEARBY_CITY_GROUPS.forEach((group, groupIndex) => {
  group.forEach((city) => nearbyCityByGroup.set(city, groupIndex));
});

const getVisibilityAudience = (visibility: RidePost['visibility']): RideVisibility[] => {
  const normalized = Array.isArray(visibility)
    ? visibility.filter((item): item is RideVisibility => item === 'Nearby' || item === 'City' || item === 'Friends')
    : [];
  return normalized.length > 0 ? Array.from(new Set(normalized)) : DEFAULT_VISIBILITY;
};

const isSameCity = (leftCity: string, rightCity: string): boolean => {
  const left = normalizeCity(leftCity);
  const right = normalizeCity(rightCity);
  if (!left || !right) return false;
  return left === right;
};

const sharesCityAlias = (leftCity: string, rightCity: string): boolean => {
  const left = normalizeCity(leftCity);
  const right = normalizeCity(rightCity);
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
};

const isNearbyCity = (leftCity: string, rightCity: string): boolean => {
  if (isSameCity(leftCity, rightCity)) return true;
  if (sharesCityAlias(leftCity, rightCity)) return true;

  const leftGroup = nearbyCityByGroup.get(normalizeCity(leftCity));
  const rightGroup = nearbyCityByGroup.get(normalizeCity(rightCity));
  return leftGroup !== undefined && rightGroup !== undefined && leftGroup === rightGroup;
};

const areUsersFriends = (viewer: User, creatorId: string, usersById: Map<string, User>): boolean => {
  if (viewer.friends.includes(creatorId)) return true;
  const creator = usersById.get(creatorId);
  return Boolean(creator?.friends.includes(viewer.id));
};

export const canUserViewRideInFeed = ({
  ride,
  viewer,
  usersById
}: {
  ride: RidePost;
  viewer: User;
  usersById: Map<string, User>;
}): boolean => {
  if (ride.creatorId === viewer.id) return true;
  if (ride.currentParticipants.includes(viewer.id)) return true;
  if (ride.requests.includes(viewer.id)) return true;

  const audience = getVisibilityAudience(ride.visibility);
  return audience.some((visibilityRule) => {
    if (visibilityRule === 'Friends') {
      return areUsersFriends(viewer, ride.creatorId, usersById);
    }

    if (visibilityRule === 'City') {
      return isSameCity(ride.city, viewer.city);
    }

    return isNearbyCity(ride.city, viewer.city);
  });
};
