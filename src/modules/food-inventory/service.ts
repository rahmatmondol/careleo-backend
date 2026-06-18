import { NotFoundError, ValidationError, UnauthorizedError } from '@/shared/errors';
import { PetsModel } from '@/modules/pets/model';
import { can } from '@/modules/subscriptions/entitlements';
import { addToShopCart, shopCheckout, placeInternalOrder } from '@/modules/store/shop-client';
import { FoodInventoryModel, type FoodInventoryRow, type ReorderRow } from './model';

const assertOwnership = async (userId: string, petId: string) => {
  const pet = await PetsModel.getById(userId, petId);
  if (!pet) throw new NotFoundError('Pet not found');
  return pet;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Days of food left = quantity / daily consumption (Infinity if no consumption). */
export const daysRemaining = (item: FoodInventoryRow): number => {
  const consumption = num(item.dailyConsumption);
  if (consumption <= 0) return Infinity;
  return num(item.quantityUnits) / consumption;
};

export const FoodInventoryService = {
  // ── Inventory ──────────────────────────────────────────────────────────────
  getInventory: async (userId: string, petId: string) => {
    await assertOwnership(userId, petId);
    const items = await FoodInventoryModel.listForPet(petId);
    return items.map((it) => ({ ...it, daysRemaining: daysRemaining(it) }));
  },

  /** Create or update an inventory line for a pet. inventoryId optional (update vs create). */
  updateInventory: async (
    userId: string,
    petId: string,
    body: Record<string, unknown>,
  ) => {
    await assertOwnership(userId, petId);
    if (!(await can(userId, 'food_inventory'))) {
      throw new UnauthorizedError('Food inventory tracking is not included in your plan');
    }
    const patch = {
      productId: body.productId != null ? String(body.productId) : undefined,
      productName: body.productName != null ? String(body.productName) : undefined,
      quantityUnits: body.quantityUnits != null ? num(body.quantityUnits) : undefined,
      dailyConsumption: body.dailyConsumption != null ? num(body.dailyConsumption) : undefined,
      lowStockThresholdDays: body.lowStockThresholdDays != null ? num(body.lowStockThresholdDays) : undefined,
    };

    const inventoryId = body.inventoryId ? String(body.inventoryId) : undefined;
    if (inventoryId) {
      const existing = await FoodInventoryModel.getById(inventoryId);
      if (!existing || existing.petId !== petId) throw new NotFoundError('Inventory item not found');
      return FoodInventoryModel.update(inventoryId, patch);
    }
    return FoodInventoryModel.create({ petId, userId, ...patch });
  },

  /** Deduct consumed units from an inventory line. */
  recordConsumption: async (userId: string, petId: string, inventoryId: string, unitsUsed: number) => {
    await assertOwnership(userId, petId);
    const item = await FoodInventoryModel.getById(inventoryId);
    if (!item || item.petId !== petId) throw new NotFoundError('Inventory item not found');
    const newQty = Math.max(0, num(item.quantityUnits) - num(unitsUsed));
    return FoodInventoryModel.update(inventoryId, { quantityUnits: newQty });
  },

  checkLowStockForUser: async (userId: string) => {
    const items = await FoodInventoryModel.findLowStock(userId);
    return items.map((it) => ({ ...it, daysRemaining: daysRemaining(it) }));
  },

  // ── Re-order ─────────────────────────────────────────────────────────────────
  listReorders: async (userId: string) => FoodInventoryModel.listReordersForUser(userId),

  /**
   * Create a re-order for an inventory item. Requires assisted_reorder (or
   * auto_reorder). If the user has auto_reorder, place it immediately via the
   * internal service path. Otherwise leave it pending for explicit confirm.
   */
  requestReorder: async (userId: string, inventoryId: string, quantity = 1) => {
    const item = await FoodInventoryModel.getById(inventoryId);
    if (!item || item.userId !== userId) throw new NotFoundError('Inventory item not found');
    if (!item.productId) throw new ValidationError('This inventory item has no linked product to re-order');

    const auto = await can(userId, 'auto_reorder');
    const assisted = await can(userId, 'assisted_reorder');
    if (!auto && !assisted) {
      throw new UnauthorizedError('Re-ordering is not included in your plan');
    }

    const reorder = await FoodInventoryModel.createReorder({
      userId,
      petId: item.petId,
      inventoryId: item.id,
      productId: item.productId,
      productName: item.productName,
      quantity,
      mode: auto ? 'auto' : 'assisted',
    });

    if (auto) {
      return FoodInventoryService.autoPlaceReorder(userId, reorder.id);
    }
    return reorder;
  },

  /** Assisted: place a pending re-order using the user's bearer token (cart+checkout). */
  confirmReorder: async (userId: string, reorderId: string, authToken: string): Promise<ReorderRow> => {
    if (!(await can(userId, 'assisted_reorder')) && !(await can(userId, 'auto_reorder'))) {
      throw new UnauthorizedError('Re-ordering is not included in your plan');
    }
    const reorder = await FoodInventoryModel.getReorder(reorderId);
    if (!reorder || reorder.userId !== userId) throw new NotFoundError('Re-order not found');
    if (reorder.status !== 'pending_confirm') return reorder;
    if (!reorder.productId) throw new ValidationError('Re-order has no product');
    if (!authToken) throw new ValidationError('Missing auth token for checkout');

    const added = await addToShopCart(authToken, reorder.productId, reorder.quantity);
    const order = added ? await shopCheckout(authToken) : null;
    if (!order) {
      return (await FoodInventoryModel.updateReorder(reorderId, { status: 'failed' }))!;
    }
    await FoodInventoryModel.update(reorder.inventoryId!, { lastReorderedAt: new Date() }).catch(() => {});
    return (await FoodInventoryModel.updateReorder(reorderId, { status: 'placed', shopOrderId: order.id }))!;
  },

  /** Auto: place a re-order via the internal service endpoint (no user token). */
  autoPlaceReorder: async (userId: string, reorderId: string): Promise<ReorderRow> => {
    const reorder = await FoodInventoryModel.getReorder(reorderId);
    if (!reorder || reorder.userId !== userId) throw new NotFoundError('Re-order not found');
    if (!reorder.productId) throw new ValidationError('Re-order has no product');

    const order = await placeInternalOrder(userId, [{ productId: reorder.productId, quantity: reorder.quantity }]);
    if (!order) {
      return (await FoodInventoryModel.updateReorder(reorderId, { status: 'failed' }))!;
    }
    if (reorder.inventoryId) {
      await FoodInventoryModel.update(reorder.inventoryId, { lastReorderedAt: new Date() }).catch(() => {});
    }
    return (await FoodInventoryModel.updateReorder(reorderId, { status: 'auto_placed', shopOrderId: order.id }))!;
  },
};
