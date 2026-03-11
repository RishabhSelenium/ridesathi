import { type FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, initializeAuth, type Auth } from 'firebase/auth';
import { type Database, getDatabase } from 'firebase/database';
import { type Firestore, getFirestore, initializeFirestore } from 'firebase/firestore';
import { type Functions, getFunctions } from 'firebase/functions';
import { type FirebaseStorage, getStorage } from 'firebase/storage';

type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  realtimeDb: Database;
  storage: FirebaseStorage;
  functions: Functions;
};

export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL ?? ''
};

const functionsRegion = process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION ?? 'us-central1';
const hasFirebaseConfig =
  firebaseConfig.apiKey.length > 0 &&
  firebaseConfig.projectId.length > 0 &&
  firebaseConfig.appId.length > 0 &&
  firebaseConfig.databaseURL.length > 0;

let cachedServices: FirebaseServices | null | undefined;

export const isFirebaseConfigured = (): boolean => hasFirebaseConfig;

const getReactNativePersistenceFactory = (): ((storage: unknown) => unknown) | null => {
  try {
    const authModule = require('@firebase/auth') as { getReactNativePersistence?: (storage: unknown) => unknown };
    return typeof authModule.getReactNativePersistence === 'function' ? authModule.getReactNativePersistence : null;
  } catch {
    return null;
  }
};

const initializeFirebaseAuth = (app: FirebaseApp): Auth => {
  const getReactNativePersistence = getReactNativePersistenceFactory();
  if (!getReactNativePersistence) {
    return getAuth(app);
  }

  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage) as never
    });
  } catch {
    return getAuth(app);
  }
};

const createFirebaseServices = (): FirebaseServices | null => {
  if (!hasFirebaseConfig) return null;

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

  const auth = initializeFirebaseAuth(app);

  let firestore: Firestore;
  try {
    firestore = initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      ignoreUndefinedProperties: true
    });
  } catch {
    firestore = getFirestore(app);
  }

  const realtimeDb = getDatabase(app);
  const storage = getStorage(app);
  const functions = getFunctions(app, functionsRegion);

  return {
    app,
    auth,
    firestore,
    realtimeDb,
    storage,
    functions
  };
};

export const getFirebaseServices = (): FirebaseServices | null => {
  if (cachedServices !== undefined) {
    return cachedServices;
  }

  cachedServices = createFirebaseServices();
  return cachedServices;
};
