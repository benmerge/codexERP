import { DEFAULT_SHARED_ORG_ID } from '@platform/shared';

const normalizeOptional = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export const crmConfig = {
  sharedOrgId:
    normalizeOptional(import.meta.env.VITE_CRM_SHARED_ORG_ID) ??
    normalizeOptional(import.meta.env.VITE_SHARED_ORG_ID) ??
    DEFAULT_SHARED_ORG_ID,
  firestoreDatabaseId:
    normalizeOptional(import.meta.env.VITE_CRM_FIRESTORE_DATABASE_ID) ??
    'ai-studio-af887f16-decc-48d2-b6b7-47c85e2eed76',
  miremixFirestoreDatabaseId:
    normalizeOptional(import.meta.env.VITE_MIREMIX_FIRESTORE_DATABASE_ID) ??
    'ai-studio-eb8d88f4-51e8-4643-b410-dd1062becfc3',
  ordersCollection: normalizeOptional(import.meta.env.VITE_CRM_ORDERS_COLLECTION) ?? 'orders',
  appUrl: normalizeOptional(import.meta.env.VITE_CRM_APP_URL) ?? 'https://foodcrm-pro-1015963821956.us-west1.run.app/',
};

export const crmAppConfig = crmConfig;
