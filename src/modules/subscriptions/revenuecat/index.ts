import { Elysia } from 'elysia';
import { requireAuth, requirePermission } from '@/shared/auth/guards';
import { RevenueCatClient } from './client';
import { revenueCatConfig } from './config';
import { RevenueCatService } from './service';

/**
 * RevenueCat routes.
 *
 * The webhook is the only unauthenticated route in the subscription surface —
 * it is called by RevenueCat, not by a signed-in user, and authenticates with
 * the shared secret in `REVENUECAT_WEBHOOK_AUTH_HEADER` instead of a JWT.
 * Everything else here is per-user and behind `requireAuth`.
 */
export const revenueCatController = new Elysia({ name: 'revenuecat-controller' }).group(
  '/subscriptions/revenuecat',
  (app) =>
    app
      /**
       * Webhook receiver.
       *
       * Answers 200 for anything it understood, including events it chose not
       * to act on, because RevenueCat retries every non-2xx until it gets one.
       * Only a bad secret (401), a malformed body (422) and genuine server
       * faults (500) are worth a retry, and those are exactly what throws.
       */
      .post('/webhook', async (ctx: any) => {
        const auth = ctx.headers?.authorization ?? ctx.headers?.Authorization;
        return RevenueCatService.handleWebhook(ctx.body, auth);
      })

      /** SDK bootstrap: public key per platform + the app user id to log in with. */
      .get('/config', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        return RevenueCatService.publicConfig(user.id);
      })

      /**
       * Reconcile the caller's subscription against RevenueCat.
       *
       * Clients call this right after a purchase or restore so the new tier is
       * live immediately rather than whenever the webhook lands.
       */
      .post('/sync', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        return RevenueCatService.syncUser(user.id);
      })

      /**
       * Where the user manages or cancels their subscription.
       *
       * Cancelling is the store's business, not ours — Apple, Google and
       * RevenueCat Web Billing each own the billing relationship, and the app
       * stores require the cancel path to go to them. RevenueCat returns the
       * right destination for whichever store sold the subscription.
       */
      .get('/management-url', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        return RevenueCatService.managementUrl(user.id);
      }),
);

/**
 * Admin view of webhook deliveries.
 *
 * Its own group rather than a path under `/admin/subscription-plans`, where
 * `/revenuecat/events` would have to compete with that group's `/:id` route.
 */
export const adminRevenueCatController = new Elysia({ name: 'admin-revenuecat-controller' }).group(
  '/admin/revenuecat',
  (app) =>
    app
      /** Whether the server is wired up — the admin panel shows this before asking for ids. */
      .get('/status', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        requirePermission(user, 'plans.manage');
        return {
          webhookConfigured: revenueCatConfig.isWebhookConfigured(),
          restConfigured: revenueCatConfig.isRestConfigured(),
          sandboxAllowed: revenueCatConfig.allowSandbox(),
          publicKeysSet: Object.entries(revenueCatConfig.publicKeys()).reduce<Record<string, boolean>>(
            (acc, [platform, key]) => ({ ...acc, [platform]: Boolean(key) }),
            {},
          ),
        };
      })

      /** Recent deliveries, newest first — the first place to look when a purchase did not land. */
      .get('/events', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        requirePermission(user, 'plans.manage');
        const q = ctx.query ?? {};
        return {
          events: await RevenueCatService.listEvents({
            limit: q.limit ? Number(q.limit) : undefined,
            userId: q.userId ? String(q.userId) : undefined,
          }),
        };
      })

      /** Force a reconcile for one user, for support requests. */
      .post('/users/:id/sync', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        requirePermission(user, 'plans.manage');
        return RevenueCatService.syncUser(String(ctx.params.id));
      })

      /** RevenueCat's raw view of a customer, for diagnosing a mapping mismatch. */
      .get('/users/:id/subscriber', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        requirePermission(user, 'plans.manage');
        return { subscriber: await RevenueCatClient.getSubscriber(String(ctx.params.id)) };
      }),
);
