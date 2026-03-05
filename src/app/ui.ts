export type AppState = 'splash' | 'login' | 'main';
export type Tab = 'feed' | 'news' | 'my-rides' | 'chats' | 'squad' | 'profile';
export type Theme = 'dark' | 'light';
export type FriendStatus = 'self' | 'friend' | 'requested' | 'none';
export type LocationMode = 'auto' | 'manual';
export type PermissionStatus = 'undetermined' | 'granted' | 'denied';
export type BadgeColor = 'orange' | 'blue' | 'green' | 'slate';

export const TOKENS = {
  dark: {
    bg: '#020617',
    surface: '#0f172a',
    card: '#111827',
    border: '#1e293b',
    text: '#f8fafc',
    muted: '#94a3b8',
    subtle: '#1f2937',
    primary: '#f97316',
    blue: '#2563eb',
    green: '#16a34a',
    red: '#ef4444'
  },
  light: {
    bg: '#f8fafc',
    surface: '#ffffff',
    card: '#ffffff',
    border: '#e2e8f0',
    text: '#0f172a',
    muted: '#64748b',
    subtle: '#f1f5f9',
    primary: '#f97316',
    blue: '#2563eb',
    green: '#16a34a',
    red: '#ef4444'
  }
} as const;

export const colorForBadge = (color: BadgeColor, theme: Theme) => {
  const t = TOKENS[theme];
  if (color === 'orange') {
    return { bg: `${t.primary}22`, text: t.primary, border: `${t.primary}66` };
  }
  if (color === 'blue') {
    return { bg: `${t.blue}22`, text: t.blue, border: `${t.blue}66` };
  }
  if (color === 'green') {
    return { bg: `${t.green}22`, text: t.green, border: `${t.green}66` };
  }
  return { bg: `${t.muted}22`, text: t.muted, border: `${t.muted}66` };
};

export const formatClock = (isoTime: string) => {
  try {
    return new Date(isoTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoTime;
  }
};

export const formatDay = (isoTime: string) => {
  try {
    return new Date(isoTime).toLocaleDateString();
  } catch {
    return isoTime;
  }
};

export const formatRideDistance = (distanceKm: number): string => {
  if (!Number.isFinite(distanceKm)) return 'N/A';
  return `${distanceKm >= 100 ? distanceKm.toFixed(0) : distanceKm.toFixed(1)} km`;
};

export const formatRideEta = (etaMinutes: number): string => {
  if (!Number.isFinite(etaMinutes) || etaMinutes <= 0) return 'N/A';
  const roundedMinutes = Math.max(1, Math.round(etaMinutes));
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
};

export const formatInrAmount = (amount: number): string => {
  if (!Number.isFinite(amount) || amount <= 0) return 'No toll';
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
};

export const formatRelative = (isoTime: string) => {
  const delta = Date.now() - new Date(isoTime).getTime();
  if (Number.isNaN(delta)) return isoTime;

  const minutes = Math.floor(delta / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export const avatarFallback = 'https://api.dicebear.com/7.x/avataaars/png?seed=ThrottleUp';
