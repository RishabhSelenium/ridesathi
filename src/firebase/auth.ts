import {
  createUserWithEmailAndPassword,
  onAuthStateChanged as onWebAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as signOutWebAuth
} from 'firebase/auth';
import { NativeModules } from 'react-native';

import { getFirebaseServices } from './client';

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
const BETA_AUTH_PASSWORD = process.env.EXPO_PUBLIC_BETA_AUTH_PASSWORD ?? 'ridesathi-beta';
const hasRnfbAppModule = (): boolean => Boolean((NativeModules as Record<string, unknown>).RNFBAppModule);

const generateNativeVerificationId = (): string => `native-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const toPhoneIdentityKey = (phoneNumber: string): string => phoneNumber.replace(/\D/g, '');
const toBetaEmailFromPhone = (phoneNumber: string): string => {
  const key = toPhoneIdentityKey(phoneNumber);
  if (key.length < 10) {
    throw new Error('Please enter a valid phone number.');
  }
  return `beta_phone_${key}@ridesathi.app`;
};
const getWebAuth = () => getFirebaseServices()?.auth ?? null;

const getNativeAuth = (): NativeAuth | null => {
  if (!hasRnfbAppModule()) {
    return null;
  }

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

export const signInWithBetaPhoneIdentity = async (phoneNumber: string): Promise<AuthUser> => {
  const webAuth = getWebAuth();
  if (!webAuth) {
    throw new Error('Firebase Auth is unavailable. Please check Firebase configuration.');
  }
  if (BETA_AUTH_PASSWORD.length < 6) {
    throw new Error('Beta auth password is invalid. Set EXPO_PUBLIC_BETA_AUTH_PASSWORD with at least 6 characters.');
  }

  const email = toBetaEmailFromPhone(phoneNumber);
  const normalizedPhone = phoneNumber.trim();

  try {
    const credential = await signInWithEmailAndPassword(webAuth, email, BETA_AUTH_PASSWORD);
    return {
      uid: credential.user.uid,
      phoneNumber: normalizedPhone
    };
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';

    if (code === 'auth/operation-not-allowed') {
      throw new Error('Enable Email/Password sign-in in Firebase Authentication for beta login.');
    }

    if (code !== 'auth/user-not-found' && code !== 'auth/invalid-credential' && code !== 'auth/wrong-password') {
      throw error;
    }
  }

  try {
    const createdCredential = await createUserWithEmailAndPassword(webAuth, email, BETA_AUTH_PASSWORD);
    return {
      uid: createdCredential.user.uid,
      phoneNumber: normalizedPhone
    };
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';

    if (code === 'auth/operation-not-allowed') {
      throw new Error('Enable Email/Password sign-in in Firebase Authentication for beta login.');
    }

    if (code === 'auth/email-already-in-use') {
      const credential = await signInWithEmailAndPassword(webAuth, email, BETA_AUTH_PASSWORD);
      return {
        uid: credential.user.uid,
        phoneNumber: normalizedPhone
      };
    }

    throw error;
  }
};

export const subscribeToAuthState = (
  listener: (user: AuthUser | null) => void
): (() => void) => {
  const nativeAuth = getNativeAuth();
  if (nativeAuth) {
    return nativeAuth.onAuthStateChanged(listener);
  }

  const webAuth = getWebAuth();
  if (webAuth) {
    return onWebAuthStateChanged(webAuth, (user) => {
      if (!user) {
        listener(null);
        return;
      }

      listener({
        uid: user.uid,
        phoneNumber: user.phoneNumber
      });
    });
  }

  listener(null);
  return () => undefined;
};

export const signOutFirebase = async (): Promise<void> => {
  const nativeAuth = getNativeAuth();
  const webAuth = getWebAuth();
  const tasks: Array<Promise<unknown>> = [];

  if (nativeAuth) {
    tasks.push(nativeAuth.signOut());
  }

  if (webAuth?.currentUser) {
    tasks.push(signOutWebAuth(webAuth));
  }

  if (tasks.length === 0) return;
  await Promise.allSettled(tasks);
};
