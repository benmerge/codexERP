import { type FirebaseOptions } from 'firebase/app';

const DEFAULT_FIREBASE_WEB_CONFIG: FirebaseOptions = {
  apiKey: 'AIzaSyDaFqitHD81GHEdUlKkvVG68r_POj5hJLg',
  authDomain: 'gen-lang-client-0021754998.firebaseapp.com',
  projectId: 'gen-lang-client-0021754998',
  appId: '1:1015963821956:web:8554aaf0bf511befbf1fd1',
  storageBucket: 'gen-lang-client-0021754998.firebasestorage.app',
  messagingSenderId: '1015963821956',
  measurementId: '',
};

const DEFAULT_FIREBASE_DATABASE_ID = 'ai-studio-eb8d88f4-51e8-4643-b410-dd1062becfc3';

const requireEnv = (value: string | undefined, name: string) => {
  if (!value?.trim()) {
    throw new Error(`Missing required Firebase env var: ${name}`);
  }
  return value;
};

export const firebaseWebConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim() || DEFAULT_FIREBASE_WEB_CONFIG.apiKey,
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || DEFAULT_FIREBASE_WEB_CONFIG.authDomain,
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() || DEFAULT_FIREBASE_WEB_CONFIG.projectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() || DEFAULT_FIREBASE_WEB_CONFIG.appId,
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || DEFAULT_FIREBASE_WEB_CONFIG.storageBucket,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() ||
    DEFAULT_FIREBASE_WEB_CONFIG.messagingSenderId,
  measurementId:
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID?.trim() ?? DEFAULT_FIREBASE_WEB_CONFIG.measurementId,
};

export const firebaseDatabaseId =
  import.meta.env.VITE_FIREBASE_DATABASE_ID?.trim() || DEFAULT_FIREBASE_DATABASE_ID;
