import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { getFirebaseServices } from './client';

type R2UploadResponse = {
  url?: unknown;
  key?: unknown;
  error?: unknown;
};

const imageStorageProvider = (process.env.EXPO_PUBLIC_IMAGE_STORAGE_PROVIDER ?? 'firebase').trim().toLowerCase();
const r2UploadBaseUrl = (process.env.EXPO_PUBLIC_R2_UPLOAD_BASE_URL ?? '').trim();
const r2UploadToken = (process.env.EXPO_PUBLIC_R2_UPLOAD_TOKEN ?? '').trim();

const sanitizeStoragePathSegment = (value: string): string => {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return sanitized || 'image';
};

const uploadFileUriToR2 = async (storagePath: string, fileUri: string): Promise<string> => {
  if (!r2UploadBaseUrl) {
    throw new Error('R2 upload is enabled but EXPO_PUBLIC_R2_UPLOAD_BASE_URL is missing.');
  }

  const response = await fetch(fileUri);
  const blob = await response.blob();
  const uploadEndpoint = `${r2UploadBaseUrl.replace(/\/+$/, '')}/upload?key=${encodeURIComponent(storagePath)}`;

  const uploadResponse = await fetch(uploadEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': blob.type || 'application/octet-stream',
      ...(r2UploadToken ? { Authorization: `Bearer ${r2UploadToken}` } : {})
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

  if (!payload || typeof payload.url !== 'string' || payload.url.trim().length === 0) {
    throw new Error('R2 upload succeeded but did not return a URL.');
  }

  return payload.url;
};

const uploadFileUriToFirebaseStorage = async (storagePath: string, fileUri: string): Promise<string> => {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase is not configured.');
  }

  const response = await fetch(fileUri);
  const blob = await response.blob();
  const storageRef = ref(services.storage, storagePath);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
};

const uploadFileUri = async (storagePath: string, fileUri: string): Promise<string> => {
  if (imageStorageProvider === 'r2') {
    return uploadFileUriToR2(storagePath, fileUri);
  }

  return uploadFileUriToFirebaseStorage(storagePath, fileUri);
};

export const uploadProfilePhoto = async (userId: string, fileUri: string): Promise<string> =>
  uploadFileUri(`profiles/${userId}/${Date.now()}.jpg`, fileUri);

export const uploadSquadPhoto = async (squadId: string, userId: string, fileUri: string): Promise<string> =>
  uploadFileUri(`squads/${squadId}/${userId}/${Date.now()}.jpg`, fileUri);

export const uploadBikePhoto = async (userId: string, bikeName: string, fileUri: string): Promise<string> =>
  uploadFileUri(`bikes/${userId}/${sanitizeStoragePathSegment(bikeName)}/${Date.now()}.jpg`, fileUri);

export const uploadRidePhoto = async (rideId: string, fileUri: string): Promise<string> =>
  uploadFileUri(`rides/${rideId}/${Date.now()}.jpg`, fileUri);
