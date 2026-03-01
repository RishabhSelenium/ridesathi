import {
  onAuthStateChanged,
  signInWithPhoneNumber,
  signOut,
  type ApplicationVerifier,
  type ConfirmationResult,
  type User as FirebaseUser
} from 'firebase/auth';

import { getFirebaseServices } from './client';

export const requestPhoneOtp = async (
  phoneNumber: string,
  appVerifier: ApplicationVerifier
): Promise<ConfirmationResult> => {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase is not configured.');
  }

  return signInWithPhoneNumber(services.auth, phoneNumber, appVerifier);
};

export const verifyPhoneOtp = async (
  confirmationResult: ConfirmationResult,
  otpCode: string
): Promise<FirebaseUser> => {
  const result = await confirmationResult.confirm(otpCode);
  return result.user;
};

export const subscribeToAuthState = (
  listener: (user: FirebaseUser | null) => void
): (() => void) => {
  const services = getFirebaseServices();
  if (!services) {
    listener(null);
    return () => undefined;
  }

  return onAuthStateChanged(services.auth, listener);
};

export const signOutFirebase = async (): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) return;
  await signOut(services.auth);
};
