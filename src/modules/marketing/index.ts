import { Elysia } from 'elysia';
import { requireAuth, requirePermission } from '@/shared/auth/guards';
import { MarketingService } from './service';

/**
 * Admin marketing surface: discount codes, abandoned-cart recovery rules and
 * the dashboard that reports on both.
 *
 * Gated by `marketing.manage` rather than `orders.write` — creating a coupon is
 * minting money off future orders, which is a narrower thing than fulfilling
 * one, and support staff who can process orders should not be able to do it.
 */
export const adminMarketingController = new Elysia({ name: 'admin-marketing-controller' }).group(
  '/admin/marketing',
  (app) =>
    app
      // ── Coupons ────────────────────────────────────────────────────────────
      .get('/coupons', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        requirePermission(user, 'marketing.manage');
        return MarketingService.listCoupons();
      })
      .get('/coupons/:id', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        requirePermission(user, 'marketing.manage');
        return MarketingService.getCoupon(String(ctx.params.id));
      })
      .post('/coupons', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        requirePermission(user, 'marketing.manage');
        return MarketingService.createCoupon((ctx.body ?? {}) as Record<string, unknown>);
      })
      .put('/coupons/:id', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        requirePermission(user, 'marketing.manage');
        return MarketingService.updateCoupon(String(ctx.params.id), (ctx.body ?? {}) as Record<string, unknown>);
      })
      .delete('/coupons/:id', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        requirePermission(user, 'marketing.manage');
        return MarketingService.deleteCoupon(String(ctx.params.id));
      })

      // ── Abandoned-cart rules ───────────────────────────────────────────────
      .get('/abandoned-cart-rules', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        requirePermission(user, 'marketing.manage');
        return MarketingService.listRules();
      })
      .post('/abandoned-cart-rules', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        requirePermission(user, 'marketing.manage');
        return MarketingService.createRule((ctx.body ?? {}) as Record<string, unknown>);
      })
      .put('/abandoned-cart-rules/:id', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        requirePermission(user, 'marketing.manage');
        return MarketingService.updateRule(String(ctx.params.id), (ctx.body ?? {}) as Record<string, unknown>);
      })
      .delete('/abandoned-cart-rules/:id', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        requirePermission(user, 'marketing.manage');
        return MarketingService.deleteRule(String(ctx.params.id));
      })

      // ── Dashboard ──────────────────────────────────────────────────────────
      .get('/analytics', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        requirePermission(user, 'marketing.manage');
        return MarketingService.analytics();
      }),
);

/**
 * Customer-facing coupon check.
 *
 * Preview only — it never reserves or spends the code. Checkout re-evaluates
 * everything under a row lock, so a code that looks valid here can still be
 * refused there if someone else takes the last use in between. That is the
 * correct trade: the alternative is holding a lock across a user's checkout.
 */
export const marketingController = new Elysia({ name: 'marketing-controller' }).group(
  '/marketing',
  (app) =>
    app.post('/coupons/preview', async (ctx: any) => {
      const user = await requireAuth(ctx.headers, ctx.jwt);
      const body = (ctx.body ?? {}) as Record<string, unknown>;
      return MarketingService.previewCoupon(user.id, String(body.code ?? ''));
    }),
);
