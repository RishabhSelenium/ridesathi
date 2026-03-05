import { NativeModules, Platform } from 'react-native';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { getFirebaseServices } from './client';

const ANALYTICS_EVENTS_COLLECTION = 'analyticsEvents';
const CRASH_EVENTS_COLLECTION = 'crashEvents';
const MAX_PARAM_LENGTH = 200;

export type AppAnalyticsEvent = 'app_open' | 'create_ride' | 'join_ride' | 'post_help' | 'send_message';

type AnalyticsParamValue = string | number | boolean;
type AnalyticsParams = Record<string, AnalyticsParamValue>;

type NativeAnalytics = {
  logEvent: (eventName: string, params?: AnalyticsParams) => Promise<void>;
};

type NativeCrashlytics = {
  setCrashlyticsCollectionEnabled?: (enabled: boolean) => Promise<void>;
  log?: (message: string) => void;
  recordError: (error: Error) => void;
};

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;
type GlobalErrorUtils = {
  getGlobalHandler?: () => GlobalErrorHandler | undefined;
  setGlobalHandler?: (handler: GlobalErrorHandler) => void;
};
const hasRnfbAppModule = (): boolean => Boolean((NativeModules as Record<string, unknown>).RNFBAppModule);

const getNativeAnalytics = (): NativeAnalytics | null => {
  if (!hasRnfbAppModule()) {
    return null;
  }

  try {
    const module = require('@react-native-firebase/analytics');
    const factory = module?.default;
    if (typeof factory !== 'function') return null;
    return factory() as NativeAnalytics;
  } catch {
    return null;
  }
};

const getNativeCrashlytics = (): NativeCrashlytics | null => {
  if (!hasRnfbAppModule()) {
    return null;
  }

  try {
    const module = require('@react-native-firebase/crashlytics');
    const factory = module?.default;
    if (typeof factory !== 'function') return null;
    return factory() as NativeCrashlytics;
  } catch {
    return null;
  }
};

const normalizeParamValue = (value: unknown): AnalyticsParamValue => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') return value.slice(0, MAX_PARAM_LENGTH);
  if (value == null) return 'null';

  try {
    return JSON.stringify(value).slice(0, MAX_PARAM_LENGTH);
  } catch {
    return 'unserializable';
  }
};

const sanitizeParams = (params?: Record<string, unknown>): AnalyticsParams => {
  if (!params) return {};

  const sanitized: AnalyticsParams = {};
  Object.entries(params).forEach(([key, value]) => {
    sanitized[key] = normalizeParamValue(value);
  });
  return sanitized;
};

const toError = (error: unknown): Error => {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);

  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error('Unknown error');
  }
};

export const logAnalyticsEvent = async (eventName: AppAnalyticsEvent, params?: Record<string, unknown>): Promise<void> => {
  const payload = sanitizeParams(params);
  const tasks: Array<Promise<unknown>> = [];

  const nativeAnalytics = getNativeAnalytics();
  if (nativeAnalytics) {
    tasks.push(nativeAnalytics.logEvent(eventName, payload));
  }

  const services = getFirebaseServices();
  if (services) {
    tasks.push(
      addDoc(collection(services.firestore, ANALYTICS_EVENTS_COLLECTION), {
        eventName,
        params: payload,
        platform: Platform.OS,
        createdAt: serverTimestamp(),
        createdAtIso: new Date().toISOString()
      })
    );
  }

  if (tasks.length === 0) return;
  await Promise.allSettled(tasks);
};

export const logCrashError = async (error: unknown, context?: Record<string, unknown>): Promise<void> => {
  const normalizedError = toError(error);
  const sanitizedContext = sanitizeParams(context);
  const tasks: Array<Promise<unknown>> = [];

  const crashlytics = getNativeCrashlytics();
  if (crashlytics) {
    if (Object.keys(sanitizedContext).length > 0 && crashlytics.log) {
      crashlytics.log(`context=${JSON.stringify(sanitizedContext)}`);
    }
    tasks.push(
      Promise.resolve(
        crashlytics.recordError(normalizedError)
      )
    );
  }

  const services = getFirebaseServices();
  if (services) {
    tasks.push(
      addDoc(collection(services.firestore, CRASH_EVENTS_COLLECTION), {
        message: normalizedError.message,
        name: normalizedError.name,
        stack: typeof normalizedError.stack === 'string' ? normalizedError.stack.slice(0, 4000) : '',
        context: sanitizedContext,
        platform: Platform.OS,
        createdAt: serverTimestamp(),
        createdAtIso: new Date().toISOString()
      })
    );
  }

  if (tasks.length === 0) return;
  await Promise.allSettled(tasks);
};

export const installCrashLogging = (): (() => void) => {
  const crashlytics = getNativeCrashlytics();
  if (crashlytics?.setCrashlyticsCollectionEnabled) {
    void crashlytics.setCrashlyticsCollectionEnabled(true);
  }

  const errorUtils = (globalThis as { ErrorUtils?: GlobalErrorUtils }).ErrorUtils;
  const setGlobalHandler = errorUtils?.setGlobalHandler;
  const getGlobalHandler = errorUtils?.getGlobalHandler;
  if (!setGlobalHandler || !getGlobalHandler) {
    return () => undefined;
  }

  const previousHandler = getGlobalHandler();
  if (!previousHandler) {
    return () => undefined;
  }

  const nextHandler: GlobalErrorHandler = (error, isFatal) => {
    void logCrashError(error, {
      is_fatal: Boolean(isFatal),
      source: 'global_error_handler'
    });

    previousHandler(error, isFatal);
  };

  setGlobalHandler(nextHandler);

  return () => {
    setGlobalHandler(previousHandler);
  };
};
