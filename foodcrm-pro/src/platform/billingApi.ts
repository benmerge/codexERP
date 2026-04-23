export type CheckoutSessionRequest = {
  amount?: number | null;
  currency?: string;
  orgId: string;
  plan?: string;
  returnUrl: string;
  toolId: string;
  userEmail?: string | null;
  userId: string;
};

export type CheckoutSessionResponse = {
  checkoutUrl: string;
  provider: string;
  sessionId: string;
  status: 'created';
  toolId: string;
};

export const createCheckoutSession = async (
  payload: CheckoutSessionRequest
): Promise<CheckoutSessionResponse> => {
  const response = await fetch('/api/platform/billing/checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error || 'Unable to create checkout session.');
  }

  return response.json();
};
