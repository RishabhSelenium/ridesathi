type AuthUser = {
  uid: string;
  phoneNumber?: string | null;
};

type NativeConfirmation = {
  confirm: (code: string) => Promise<{ user: AuthUser }>;
};

type NativeAuth = {
  signInWithPhoneNumber: (phoneNumber: string) => Promise<NativeConfirmation>;
  onAuthStateChanged: (listener: (user: AuthUser | null) => void) => () => void;
  signOut: () => Promise<void>;
};

type NativeAppModule = {
  getApps: () => unknown[];
  getApp: (name?: string) => unknown;
};

type NativeAuthModule = {
  getAuth: (app?: unknown) => unknown;
  signInWithPhoneNumber: (auth: unknown, phoneNumber: string) => Promise<NativeConfirmation>;
  onAuthStateChanged: (auth: unknown, listener: (user: AuthUser | null) => void) => () => void;
  signOut: (auth: unknown) => Promise<void>;
};

const nativeConfirmationMap = new Map<string, NativeConfirmation>();
const nativeAuthMissingMessage =
  'Native Firebase Phone Auth is not available in this build. Rebuild the Android app with @react-native-firebase/auth.';

const generateNativeVerificationId = (): string => `native-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const getNativeAuth = (): NativeAuth | null => {
  try {
    const appModule = require('@react-native-firebase/app/lib/modular') as NativeAppModule;
    const authModule = require('@react-native-firebase/auth/lib/modular') as NativeAuthModule;
    if (
      typeof appModule.getApps !== 'function' ||
      typeof appModule.getApp !== 'function' ||
      typeof authModule.getAuth !== 'function' ||
      typeof authModule.signInWithPhoneNumber !== 'function' ||
      typeof authModule.onAuthStateChanged !== 'function' ||
      typeof authModule.signOut !== 'function'
    ) {
      return null;
    }

    const apps = appModule.getApps();
    if (!Array.isArray(apps) || apps.length === 0) {
      return null;
    }

    const nativeAuth = authModule.getAuth(appModule.getApp());
    if (!nativeAuth) return null;

    return {
      signInWithPhoneNumber: (phoneNumber: string) => authModule.signInWithPhoneNumber(nativeAuth, phoneNumber),
      onAuthStateChanged: (listener: (user: AuthUser | null) => void) => authModule.onAuthStateChanged(nativeAuth, listener),
      signOut: () => authModule.signOut(nativeAuth)
    };
  } catch {
    return null;
  }
};

export const isNativePhoneAuthAvailable = (): boolean => Boolean(getNativeAuth());

const requireNativeAuth = (): NativeAuth => {
  const nativeAuth = getNativeAuth();
  if (!nativeAuth) {
    throw new Error(nativeAuthMissingMessage);
  }
  return nativeAuth;
};

export const requestPhoneOtp = async (phoneNumber: string): Promise<string> => {
  const nativeAuth = requireNativeAuth();
  const confirmation = await nativeAuth.signInWithPhoneNumber(phoneNumber);
  const verificationId = generateNativeVerificationId();
  nativeConfirmationMap.set(verificationId, confirmation);
  return verificationId;
};

export const verifyPhoneOtp = async (verificationId: string, otpCode: string): Promise<AuthUser> => {
  requireNativeAuth();
  const nativeConfirmation = nativeConfirmationMap.get(verificationId);
  if (!nativeConfirmation) {
    throw new Error('Please request OTP again.');
  }
  const result = await nativeConfirmation.confirm(otpCode);
  nativeConfirmationMap.delete(verificationId);
  return result.user;
};

export const subscribeToAuthState = (
  listener: (user: AuthUser | null) => void
): (() => void) => {
  const nativeAuth = getNativeAuth();
  if (nativeAuth) {
    return nativeAuth.onAuthStateChanged(listener);
  }
  listener(null);
  return () => undefined;
};

export const signOutFirebase = async (): Promise<void> => {
  const nativeAuth = getNativeAuth();
  if (nativeAuth) {
    await nativeAuth.signOut();
  }
};
