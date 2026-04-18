const normalizeOptional = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export const crmAppConfig = {
  sharedOrgId: normalizeOptional(import.meta.env.VITE_SHARED_ORG_ID) ?? 'org_40centurygrain_shared',
};
