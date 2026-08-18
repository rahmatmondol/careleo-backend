/**
 * RevenueCat configuration, read from the environment.
 *
 * Nothing here is hard-coded per environment: the same build runs against the
 * sandbox and against production, and which one it trusts is decided by
 * `allowSandbox` below.
 */

const env = (key: string): string => (process.env[key] ?? '').trim();

export type RevenueCatPlatform = 'ios' | 'android' | 'web';

export const revenueCatConfig = {
  /** Server-side secret key (`sk_…`). Required for the REST reconcile calls. */
  secretApiKey: () => env('REVENUECAT_SECRET_API_KEY'),

  /**
   * The shared secret RevenueCat sends as the `Authorization` header on every
   * webhook delivery. Set the identical value in the RevenueCat dashboard
   * under Integrations → Webhooks. Without it the webhook route refuses every
   * request — an unauthenticated webhook would let anyone grant themselves a
   * paid plan.
   */
  webhookAuth: () => env('REVENUECAT_WEBHOOK_AUTH_HEADER'),

  /** Public SDK keys handed to clients, one per store. */
  publicKeys: (): Record<RevenueCatPlatform, string> => ({
    ios: env('REVENUECAT_IOS_PUBLIC_KEY'),
    android: env('REVENUECAT_ANDROID_PUBLIC_KEY'),
    web: env('REVENUECAT_WEB_PUBLIC_KEY'),
  }),

  /** RevenueCat offering to present by default; blank = the "current" offering. */
  defaultOffering: () => env('REVENUECAT_DEFAULT_OFFERING'),

  /**
   * Whether SANDBOX events may change a subscription.
   *
   * Sandbox purchases are free and any tester can make them, so honouring them
   * in production would be a way to get a paid plan for nothing. They are
   * honoured everywhere else, because otherwise a TestFlight or Play internal
   * test build could never exercise the paywall. Set
   * `REVENUECAT_ALLOW_SANDBOX=true` to override in production.
   */
  allowSandbox: (): boolean => {
    const explicit = env('REVENUECAT_ALLOW_SANDBOX').toLowerCase();
    if (explicit === 'true') return true;
    if (explicit === 'false') return false;
    return process.env.NODE_ENV !== 'production';
  },

  /** True once the webhook can actually be served. */
  isWebhookConfigured: (): boolean => Boolean(env('REVENUECAT_WEBHOOK_AUTH_HEADER')),

  /** True once the REST reconcile calls can be made. */
  isRestConfigured: (): boolean => Boolean(env('REVENUECAT_SECRET_API_KEY')),
};

/** REST base. v1 is what exposes the subscriber's resolved entitlement map. */
export const REVENUECAT_API_BASE = 'https://api.revenuecat.com/v1';
