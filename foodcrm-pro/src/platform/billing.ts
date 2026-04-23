export type BillingSubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'paused';

export type OrgBillingSubscription = {
  id: string;
  amount?: number | null;
  createdAt?: string | null;
  currency?: string | null;
  plan?: string | null;
  provider: string;
  renewalDate?: string | null;
  status: BillingSubscriptionStatus;
  toolId: string;
  updatedAt?: string | null;
};

export const getBillingBadgeLabel = (subscription?: OrgBillingSubscription) => {
  if (!subscription) return 'No billing record';
  switch (subscription.status) {
    case 'active':
      return 'Billing active';
    case 'trialing':
      return 'Trial';
    case 'past_due':
      return 'Past due';
    case 'canceled':
      return 'Canceled';
    case 'incomplete':
      return 'Setup needed';
    case 'paused':
      return 'Paused';
    default:
      return subscription.status;
  }
};
