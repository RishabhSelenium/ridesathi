import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { getFirebaseServices } from './client';

const uploadFileUri = async (storagePath: string, fileUri: string): Promise<string> => {
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

export const uploadProfilePhoto = async (userId: string, fileUri: string): Promise<string> =>
  uploadFileUri(`profiles/${userId}/${Date.now()}.jpg`, fileUri);

export const uploadRidePhoto = async (rideId: string, fileUri: string): Promise<string> =>
  uploadFileUri(`rides/${rideId}/${Date.now()}.jpg`, fileUri);
