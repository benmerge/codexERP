import { type FirebaseOptions } from 'firebase/app';

const fallback = (value: string | undefined, defaultValue: string) => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? defaultValue : trimmed;
};

export const firebaseWebConfig: FirebaseOptions = {
  apiKey: fallback(import.meta.env.VITE_FIREBASE_API_KEY, 'AIzaSyDaFqitHD81GHEdUlKkvVG68r_POj5hJLg'),
  authDomain: fallback(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, 'gen-lang-client-0021754998.firebaseapp.com'),
  projectId: fallback(import.meta.env.VITE_FIREBASE_PROJECT_ID, 'gen-lang-client-0021754998'),
  appId: fallback(import.meta.env.VITE_FIREBASE_APP_ID, '1:1015963821956:web:8554aaf0bf511befbf1fd1'),
  storageBucket: fallback(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, 'gen-lang-client-0021754998.firebasestorage.app'),
  messagingSenderId: fallback(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, '1015963821956'),
  measurementId: fallback(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID, ''),
};

export const firebaseDatabaseId = fallback(
  import.meta.env.VITE_FIREBASE_DATABASE_ID,
  'ai-studio-eb8d88f4-51e8-4643-b410-dd1062becfc3'
);
