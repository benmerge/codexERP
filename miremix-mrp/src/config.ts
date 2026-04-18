const normalizeOptional = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export const crmConfig = {
  firestoreDatabaseId:
    normalizeOptional(import.meta.env.VITE_CRM_FIRESTORE_DATABASE_ID) ??
    'ai-studio-af887f16-decc-48d2-b6b7-47c85e2eed76',
  sharedOrgId: normalizeOptional(import.meta.env.VITE_CRM_SHARED_ORG_ID) ?? 'org_40centurygrain_shared',
  ordersCollection: normalizeOptional(import.meta.env.VITE_CRM_ORDERS_COLLECTION) ?? 'orders',
  appUrl: normalizeOptional(import.meta.env.VITE_CRM_APP_URL) ?? 'https://foodcrm-pro-1015963821956.us-west1.run.app/',
};
