import { type FirebaseOptions } from 'firebase/app';

const requireEnv = (value: string | undefined, name: string) => {
  if (!value?.trim()) {
    throw new Error(`Missing required Firebase env var: ${name}`);
  }
  return value;
};

export const firebaseWebConfig: FirebaseOptions = {
  apiKey: requireEnv(import.meta.env.VITE_FIREBASE_API_KEY, 'VITE_FIREBASE_API_KEY'),
  authDomain: requireEnv(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, 'VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: requireEnv(import.meta.env.VITE_FIREBASE_PROJECT_ID, 'VITE_FIREBASE_PROJECT_ID'),
  appId: requireEnv(import.meta.env.VITE_FIREBASE_APP_ID, 'VITE_FIREBASE_APP_ID'),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const firebaseDatabaseId =
  requireEnv(import.meta.env.VITE_FIREBASE_DATABASE_ID, 'VITE_FIREBASE_DATABASE_ID');
