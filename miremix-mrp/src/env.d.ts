/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
  readonly VITE_FIREBASE_DATABASE_ID?: string;
  readonly VITE_CRM_FIRESTORE_DATABASE_ID?: string;
  readonly VITE_CRM_SHARED_ORG_ID?: string;
  readonly VITE_CRM_ORDERS_COLLECTION?: string;
  readonly VITE_CRM_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
