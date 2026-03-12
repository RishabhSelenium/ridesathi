import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { getFirebaseServices } from './client';
import { SignedImageAsset } from '../types';

type R2UploadResponse = {
  signedUrl?: unknown;
  objectKey?: unknown;
  expiresAt?: unknown;
  error?: unknown;
};

const imageStorageProvider = (process.env.EXPO_PUBLIC_IMAGE_STORAGE_PROVIDER ?? 'firebase').trim().toLowerCase();
const r2BackendBaseUrl = (
  process.env.EXPO_PUBLIC_R2_BACKEND_BASE_URL ??
  process.env.EXPO_PUBLIC_R2_UPLOAD_BASE_URL ??
  ''
).trim();
const r2BackendToken = (
  process.env.EXPO_PUBLIC_R2_BACKEND_TOKEN ??
  process.env.EXPO_PUBLIC_R2_UPLOAD_TOKEN ??
  ''
).trim();

const sanitizeStoragePathSegment = (value: string): string => {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return sanitized || 'image';
};

const parseSignedImageAsset = (payload: R2UploadResponse, fallbackObjectKey?: string): SignedImageAsset => {
  const signedUrl = typeof payload.signedUrl === 'string' ? payload.signedUrl.trim() : '';
  const objectKey =
    typeof payload.objectKey === 'string' && payload.objectKey.trim().length > 0
      ? payload.objectKey.trim()
      : fallbackObjectKey ?? '';
  const expiresAt = typeof payload.expiresAt === 'string' ? payload.expiresAt.trim() : '';

  if (!signedUrl || !objectKey || !expiresAt) {
    throw new Error('R2 backend returned an incomplete signed asset payload.');
  }

  return {
    objectKey,
    signedUrl,
    expiresAt
  };
};

const getR2AuthHeaders = (): Record<string, string> =>
  r2BackendToken ? { Authorization: `Bearer ${r2BackendToken}` } : {};

const uploadFileUriToR2 = async (storagePath: string, fileUri: string): Promise<SignedImageAsset> => {
  if (!r2BackendBaseUrl) {
    throw new Error('R2 upload is enabled but EXPO_PUBLIC_R2_BACKEND_BASE_URL is missing.');
  }

  const response = await fetch(fileUri);
  const blob = await response.blob();
  const uploadEndpoint = `${r2BackendBaseUrl.replace(/\/+$/, '')}/api/images/upload?key=${encodeURIComponent(storagePath)}`;

  const uploadResponse = await fetch(uploadEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': blob.type || 'application/octet-stream',
      ...getR2AuthHeaders()
    },
    body: blob
  });

  let payload: R2UploadResponse | null = null;
  try {
    payload = (await uploadResponse.json()) as R2UploadResponse;
  } catch {
    payload = null;
  }

  if (!uploadResponse.ok) {
    const errorMessage =
      payload && typeof payload.error === 'string'
        ? payload.error
        : `R2 upload failed with status ${uploadResponse.status}.`;
    throw new Error(errorMessage);
  }

  return parseSignedImageAsset(payload ?? {}, storagePath);
};

const uploadFileUriToFirebaseStorage = async (storagePath: string, fileUri: string): Promise<SignedImageAsset> => {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase is not configured.');
  }

  const response = await fetch(fileUri);
  const blob = await response.blob();
  const storageRef = ref(services.storage, storagePath);
  await uploadBytes(storageRef, blob);
  const signedUrl = await getDownloadURL(storageRef);

  return {
    objectKey: storagePath,
    signedUrl,
    // Firebase download URLs are effectively long-lived; keep a far-future expiry to avoid refresh flow.
    expiresAt: '2099-12-31T23:59:59.000Z'
  };
};

const uploadFileUri = async (storagePath: string, fileUri: string): Promise<SignedImageAsset> => {
  if (imageStorageProvider === 'r2') {
    return uploadFileUriToR2(storagePath, fileUri);
  }

  return uploadFileUriToFirebaseStorage(storagePath, fileUri);
};

export const refreshSignedImageAsset = async (objectKey: string): Promise<SignedImageAsset> => {
  if (imageStorageProvider !== 'r2') {
    return {
      objectKey,
      signedUrl: objectKey,
      expiresAt: '2099-12-31T23:59:59.000Z'
    };
  }

  if (!r2BackendBaseUrl) {
    throw new Error('R2 signing is enabled but EXPO_PUBLIC_R2_BACKEND_BASE_URL is missing.');
  }

  const response = await fetch(`${r2BackendBaseUrl.replace(/\/+$/, '')}/api/images/sign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getR2AuthHeaders()
    },
    body: JSON.stringify({ objectKey })
  });

  let payload: R2UploadResponse | null = null;
  try {
    payload = (await response.json()) as R2UploadResponse;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorMessage =
      payload && typeof payload.error === 'string'
        ? payload.error
        : `R2 sign failed with status ${response.status}.`;
    throw new Error(errorMessage);
  }

  return parseSignedImageAsset(payload ?? {}, objectKey);
};

export const uploadProfilePhoto = async (userId: string, fileUri: string): Promise<SignedImageAsset> =>
  uploadFileUri(`profiles/${userId}/${Date.now()}.jpg`, fileUri);

export const uploadGroupPhoto = async (groupId: string, userId: string, fileUri: string): Promise<SignedImageAsset> =>
  uploadFileUri(`groups/${groupId}/${userId}/${Date.now()}.jpg`, fileUri);

export const uploadBikePhoto = async (userId: string, bikeName: string, fileUri: string): Promise<SignedImageAsset> =>
  uploadFileUri(`bikes/${userId}/${sanitizeStoragePathSegment(bikeName)}/${Date.now()}.jpg`, fileUri);

export const uploadRidePhoto = async (rideId: string, fileUri: string): Promise<SignedImageAsset> =>
  uploadFileUri(`rides/${rideId}/${Date.now()}.jpg`, fileUri);
