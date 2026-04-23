import type { PlatformTool } from './tools';

export type EntitlementStatus = 'active' | 'inactive' | 'pending' | 'suspended' | 'expired';

export type OrgToolEntitlement = {
  id: string;
  toolId: string;
  status: EntitlementStatus;
  plan?: string;
  activatedAt?: string | null;
  expiresAt?: string | null;
  billingSubscriptionId?: string | null;
  source?: string;
  provisioningStatus?: 'not_required' | 'pending' | 'ready' | 'failed';
  provisioningRequestedAt?: string | null;
  provisioningCompletedAt?: string | null;
  failureReason?: string | null;
  rolesGranted?: string[];
  updatedAt?: string | null;
};

export type ToolAccessState = 'open' | 'activate' | 'pending' | 'blocked' | 'coming-soon';

export type ResolvedToolAccess = {
  state: ToolAccessState;
  label: string;
  cta: string;
  reason?: string;
};

const includesRole = (roles: string[] | undefined, role: string) =>
  !roles?.length || roles.includes(role);

export const resolveToolAccess = ({
  entitlement,
  isPlatformAdmin,
  tool,
  userRole,
}: {
  entitlement?: OrgToolEntitlement;
  isPlatformAdmin: boolean;
  tool: PlatformTool;
  userRole: string;
}): ResolvedToolAccess => {
  if (tool.status === 'planned') {
    return {
      state: 'coming-soon',
      label: 'Coming soon',
      cta: 'Coming soon',
      reason: 'This tool is not live yet.',
    };
  }

  if (!includesRole(tool.rolesAllowed, userRole) && !isPlatformAdmin) {
    return {
      state: 'blocked',
      label: 'Restricted',
      cta: 'Restricted',
      reason: 'Your role does not currently allow this tool.',
    };
  }

  if (!entitlement || entitlement.status === 'inactive' || entitlement.status === 'expired') {
    return {
      state: 'activate',
      label: tool.pricingType === 'paid' ? 'Activation required' : 'Not activated',
      cta: isPlatformAdmin ? (tool.pricingType === 'paid' ? 'Subscribe' : 'Activate') : 'Access required',
      reason: isPlatformAdmin
        ? 'This org can be activated manually until billing is connected.'
        : 'Ask an admin to activate this tool for the organization.',
    };
  }

  if (entitlement.status === 'pending' || entitlement.provisioningStatus === 'pending') {
    return {
      state: 'pending',
      label: 'Provisioning',
      cta: 'Provisioning',
      reason: 'Activation exists, but setup is still in progress.',
    };
  }

  if (entitlement.provisioningStatus === 'failed') {
    return {
      state: 'blocked',
      label: 'Provisioning failed',
      cta: 'Unavailable',
      reason: entitlement.failureReason || 'Setup failed and needs admin attention before launch.',
    };
  }

  if (entitlement.status === 'suspended') {
    return {
      state: 'blocked',
      label: 'Suspended',
      cta: 'Unavailable',
      reason: 'This entitlement is suspended and cannot launch right now.',
    };
  }

  return {
    state: 'open',
    label: 'Active',
    cta: 'Open',
  };
};
