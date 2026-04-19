const normalizeOptional = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export const crmAppConfig = {
  sharedOrgId: normalizeOptional(import.meta.env.VITE_SHARED_ORG_ID) ?? 'org_40centurygrain_shared',
  miremixFirestoreDatabaseId:
    normalizeOptional(import.meta.env.VITE_MIREMIX_FIRESTORE_DATABASE_ID) ??
    'ai-studio-eb8d88f4-51e8-4643-b410-dd1062becfc3',
};
