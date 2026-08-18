import { REVENUECAT_API_BASE, revenueCatConfig } from './config';
import type { RevenueCatSubscriber, RevenueCatSubscriberResponse } from './types';

/**
 * Thin REST client for RevenueCat's server API.
 *
 * Only the read side is used. Grants are never created from here — the store
 * owns the money, RevenueCat owns the receipt, and this app only mirrors the
 * result — so the client exists purely so `sync` can ask RevenueCat what a
 * customer is actually entitled to instead of trusting the caller.
 */

export class RevenueCatApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string,
  ) {
    super(message);
    this.name = 'RevenueCatApiError';
  }
}

const REQUEST_TIMEOUT_MS = 10_000;

const request = async (path: string): Promise<Response> => {
  const key = revenueCatConfig.secretApiKey();
  if (!key) throw new RevenueCatApiError('REVENUECAT_SECRET_API_KEY is not set', 500, '');

  // RevenueCat is a hard dependency of the sync path but not of the webhook
  // path, so a slow response must fail rather than hold a request open.
  const res = await fetch(`${REVENUECAT_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return res;
};

export const RevenueCatClient = {
  /**
   * Fetch a customer's resolved entitlements.
   *
   * Returns `null` for an app user id RevenueCat has never seen — that is the
   * normal answer for a user who has not bought anything, not an error.
   *
   * Note RevenueCat *creates* the customer record on this call, which is
   * harmless and is why it can be called for any signed-in user.
   */
  getSubscriber: async (appUserId: string): Promise<RevenueCatSubscriber | null> => {
    const res = await request(`/subscribers/${encodeURIComponent(appUserId)}`);
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new RevenueCatApiError(`RevenueCat subscriber lookup failed (${res.status})`, res.status, body);
    }
    const json = (await res.json()) as RevenueCatSubscriberResponse;
    return json.subscriber ?? null;
  },
};
