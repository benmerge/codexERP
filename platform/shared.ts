export const SHARED_WORKSPACE_DOMAINS = ['40centurygrain.com', '40centurygrain.earth', 'mergeimpact.com'] as const;

export const LOCATION_ADMIN_EMAILS = ['ben@mergeimpact.com', 'ben@40centurygrain.com'] as const;

export const PLATFORM_ADMIN_EMAILS = ['ben@mergeimpact.com', 'jon@mergeimpact.com'] as const;

export const DEFAULT_SHARED_ORG_ID = 'org_40centurygrain_shared';

const normalizeString = (value?: string | null) => value?.trim() || '';

export const normalizeEmail = (value?: string | null) => normalizeString(value).toLowerCase();

export const getEmailDomain = (value?: string | null) => {
  const email = normalizeEmail(value);
  if (!email.includes('@')) return null;
  return email.split('@')[1] ?? null;
};

export const isSharedWorkspaceUser = (email?: string | null) => {
  const domain = getEmailDomain(email);
  return !!domain && SHARED_WORKSPACE_DOMAINS.includes(domain as (typeof SHARED_WORKSPACE_DOMAINS)[number]);
};

export const canManageLocations = (email?: string | null) => {
  const normalized = normalizeEmail(email);
  return LOCATION_ADMIN_EMAILS.includes(normalized as (typeof LOCATION_ADMIN_EMAILS)[number]);
};

export const canManagePlatform = (email?: string | null) => {
  const normalized = normalizeEmail(email);
  return PLATFORM_ADMIN_EMAILS.includes(normalized as (typeof PLATFORM_ADMIN_EMAILS)[number]);
};

export const resolveOrgId = (
  user: { uid?: string | null; email?: string | null } | null,
  sharedOrgId: string = DEFAULT_SHARED_ORG_ID
) => {
  if (!user?.uid) return null;
  if (isSharedWorkspaceUser(user.email)) {
    return sharedOrgId;
  }

  const domain = getEmailDomain(user.email);
  if (domain) {
    return `org_${domain.replace(/[^a-z0-9]+/g, '_')}`;
  }

  return `org_${user.uid.toLowerCase()}`;
};
