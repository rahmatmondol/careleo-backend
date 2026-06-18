import { Elysia } from 'elysia';
import { requireAuth } from '@/shared/auth/guards';
import { FoodInventoryService } from './service';

/** Extract the raw bearer token from request headers (to forward to shop checkout). */
const bearer = (headers: Record<string, string | undefined>): string => {
  const a = headers.authorization;
  return a?.startsWith('Bearer ') ? a.slice(7) : '';
};

/**
 * Food inventory + re-order API. Inventory routes sit under /pets/:id (param
 * MUST be :id to match the pets controller). Re-order routes are user-scoped.
 */
export const foodInventoryController = new Elysia({ name: 'food-inventory-controller' })
  .group('/pets/:id', (app) =>
    app
      /** List a pet's food inventory with days-remaining. */
      .get('/inventory', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        return FoodInventoryService.getInventory(user.id, String(ctx.params.id));
      })
      /** Create or update an inventory line (body.inventoryId optional). */
      .put('/inventory', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        return FoodInventoryService.updateInventory(user.id, String(ctx.params.id), (ctx.body ?? {}) as Record<string, unknown>);
      })
      /** Record consumed units against an inventory line. */
      .post('/inventory/:invId/consume', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        return FoodInventoryService.recordConsumption(
          user.id,
          String(ctx.params.id),
          String(ctx.params.invId),
          Number(body.unitsUsed ?? 0),
        );
      }),
  )
  .group('/reorders', (app) =>
    app
      /** List the user's re-orders. */
      .get('', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        return FoodInventoryService.listReorders(user.id);
      })
      /** Confirm (place) a pending assisted re-order — forwards the user's token. */
      .post('/:reorderId/confirm', async (ctx: any) => {
        const user = await requireAuth(ctx.headers, ctx.jwt);
        return FoodInventoryService.confirmReorder(user.id, String(ctx.params.reorderId), bearer(ctx.headers));
      }),
  );
