/**
 * The slices of RevenueCat's payloads this module actually reads.
 *
 * Deliberately partial and permissive: RevenueCat adds fields to both the
 * webhook event and the subscriber object without a version bump, and a strict
 * type here would only make the next added field a compile error for no gain.
 * Everything optional is treated as "may be absent" at the use site.
 */

/** https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields */
export type RevenueCatEventType =
  | 'TEST'
  | 'INITIAL_PURCHASE'
  | 'RENEWAL'
  | 'PRODUCT_CHANGE'
  | 'CANCELLATION'
  | 'UNCANCELLATION'
  | 'NON_RENEWING_PURCHASE'
  | 'SUBSCRIPTION_PAUSED'
  | 'SUBSCRIPTION_EXTENDED'
  | 'EXPIRATION'
  | 'BILLING_ISSUE'
  | 'TRANSFER'
  | 'REFUND_REVERSED'
  | 'TEMPORARY_ENTITLEMENT_GRANT'
  | 'INVOICE_ISSUANCE'
  | 'SUBSCRIBER_ALIAS'
  | 'VIRTUAL_CURRENCY_TRANSACTION';

export type RevenueCatEvent = {
  id?: string;
  type?: RevenueCatEventType | string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  product_id?: string;
  new_product_id?: string;
  entitlement_ids?: string[] | null;
  /** Superseded by `entitlement_ids`; still sent by older integrations. */
  entitlement_id?: string | null;
  period_type?: string;
  store?: string;
  environment?: string;
  purchased_at_ms?: number;
  expiration_at_ms?: number | null;
  grace_period_expiration_at_ms?: number | null;
  auto_resume_at_ms?: number | null;
  event_timestamp_ms?: number;
  cancel_reason?: string | null;
  expiration_reason?: string | null;
  is_trial_conversion?: boolean;
  price?: number;
  price_in_purchased_currency?: number;
  currency?: string;
  transaction_id?: string;
  original_transaction_id?: string;
  /** TRANSFER only: the app user ids the purchase moved between. */
  transferred_from?: string[];
  transferred_to?: string[];
};

export type RevenueCatWebhookBody = {
  api_version?: string;
  event?: RevenueCatEvent;
};

/** One entry of `subscriber.entitlements` from `GET /v1/subscribers/:id`. */
export type RevenueCatEntitlement = {
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  purchase_date?: string | null;
  product_identifier?: string;
};

/** One entry of `subscriber.subscriptions`, keyed by product identifier. */
export type RevenueCatSubscription = {
  expires_date?: string | null;
  purchase_date?: string | null;
  original_purchase_date?: string | null;
  period_type?: string;
  store?: string;
  is_sandbox?: boolean;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  auto_resume_date?: string | null;
  store_transaction_id?: string | null;
  original_store_transaction_id?: string | null;
};

export type RevenueCatSubscriber = {
  original_app_user_id?: string;
  entitlements?: Record<string, RevenueCatEntitlement>;
  subscriptions?: Record<string, RevenueCatSubscription>;
  management_url?: string | null;
};

export type RevenueCatSubscriberResponse = {
  subscriber?: RevenueCatSubscriber;
};
