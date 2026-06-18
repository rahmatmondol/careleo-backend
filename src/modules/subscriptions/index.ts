import { Elysia } from 'elysia';
import { requireAuth, requirePermission } from '@/shared/auth/guards';
import { SubscriptionsService } from './service';

/**
 * Admin-facing plan management (Plan Builder backend). Gated by `plans.manage`.
 * Mounted under /admin so it sits with the rest of the admin surface.
 */
export const adminSubscriptionsController = new Elysia({ name: 'admin-subscriptions-controller' }).group(
  '/admin/subscription-plans',
  (app) =>
    app
      /** Feature/limit catalog for rendering the Plan Builder UI. */
      .get('/catalog', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        requirePermission(user, 'plans.manage');
        return SubscriptionsService.catalog();
      })
      /** List all plans (including inactive) for admin. */
      .get('', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        requirePermission(user, 'plans.manage');
        return SubscriptionsService.listPlans(true);
      })
      .get('/:id', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        requirePermission(user, 'plans.manage');
        return SubscriptionsService.getPlan(String(ctx.params.id));
      })
      .post('', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        requirePermission(user, 'plans.manage');
        return SubscriptionsService.createPlan((ctx.body ?? {}) as Record<string, unknown>);
      })
      .put('/:id', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        requirePermission(user, 'plans.manage');
        return SubscriptionsService.updatePlan(String(ctx.params.id), (ctx.body ?? {}) as Record<string, unknown>);
      })
      .delete('/:id', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        requirePermission(user, 'plans.manage');
        return SubscriptionsService.deletePlan(String(ctx.params.id));
      }),
);

/**
 * User-facing subscription endpoints: browse active plans, view own
 * subscription/entitlement, and subscribe to a plan.
 */
export const subscriptionsController = new Elysia({ name: 'subscriptions-controller' }).group(
  '/subscriptions',
  (app) =>
    app
      /** Active plans a user can choose from. */
      .get('/plans', async () => SubscriptionsService.listPlans(false))
      /** Caller's current subscription + resolved entitlement. */
      .get('/me', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        return SubscriptionsService.mySubscription(user.id);
      })
      /** Subscribe the caller to a plan. */
      .post('/subscribe', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        return SubscriptionsService.subscribe(user.id, String(body.planId ?? ''));
      }),
);
