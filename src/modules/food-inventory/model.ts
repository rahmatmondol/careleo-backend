import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import { foodInventory, reorders } from '@/shared/db/schema';

export type FoodInventoryRow = typeof foodInventory.$inferSelect;
export type ReorderRow = typeof reorders.$inferSelect;

export const FoodInventoryModel = {
  // ── Inventory ──────────────────────────────────────────────────────────────
  listForPet: async (petId: string): Promise<FoodInventoryRow[]> =>
    db.select().from(foodInventory).where(eq(foodInventory.petId, petId)).orderBy(desc(foodInventory.updatedAt)),

  listForUser: async (userId: string): Promise<FoodInventoryRow[]> =>
    db.select().from(foodInventory).where(eq(foodInventory.userId, userId)),

  getById: async (id: string): Promise<FoodInventoryRow | undefined> => {
    const [row] = await db.select().from(foodInventory).where(eq(foodInventory.id, id));
    return row;
  },

  create: async (input: {
    petId: string;
    userId: string;
    productId?: string | null;
    productName?: string | null;
    quantityUnits?: number;
    dailyConsumption?: number;
    lowStockThresholdDays?: number;
  }): Promise<FoodInventoryRow> => {
    const [row] = await db
      .insert(foodInventory)
      .values({
        petId: input.petId,
        userId: input.userId,
        productId: input.productId ?? null,
        productName: input.productName ?? null,
        quantityUnits: input.quantityUnits !== undefined ? String(input.quantityUnits) : undefined,
        dailyConsumption: input.dailyConsumption !== undefined ? String(input.dailyConsumption) : undefined,
        lowStockThresholdDays: input.lowStockThresholdDays,
      })
      .returning();
    return row;
  },

  update: async (
    id: string,
    patch: Partial<{
      productId: string | null;
      productName: string | null;
      quantityUnits: number;
      dailyConsumption: number;
      lowStockThresholdDays: number;
      lastReorderedAt: Date;
    }>,
  ): Promise<FoodInventoryRow | undefined> => {
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.productId !== undefined) values.productId = patch.productId;
    if (patch.productName !== undefined) values.productName = patch.productName;
    if (patch.quantityUnits !== undefined) values.quantityUnits = String(patch.quantityUnits);
    if (patch.dailyConsumption !== undefined) values.dailyConsumption = String(patch.dailyConsumption);
    if (patch.lowStockThresholdDays !== undefined) values.lowStockThresholdDays = patch.lowStockThresholdDays;
    if (patch.lastReorderedAt !== undefined) values.lastReorderedAt = patch.lastReorderedAt;
    const [row] = await db.update(foodInventory).set(values).where(eq(foodInventory.id, id)).returning();
    return row;
  },

  /** Inventory items that will run out within their threshold window. */
  findLowStock: async (userId?: string): Promise<FoodInventoryRow[]> => {
    // days_remaining = quantity / daily_consumption; low when <= threshold and consumption > 0.
    const lowCond = sql`${foodInventory.dailyConsumption} > 0 AND (${foodInventory.quantityUnits} / ${foodInventory.dailyConsumption}) <= ${foodInventory.lowStockThresholdDays}`;
    const where = userId ? and(eq(foodInventory.userId, userId), lowCond) : lowCond;
    return db.select().from(foodInventory).where(where);
  },

  // ── Reorders ───────────────────────────────────────────────────────────────
  createReorder: async (input: {
    userId: string;
    petId?: string | null;
    inventoryId?: string | null;
    productId?: string | null;
    productName?: string | null;
    quantity?: number;
    mode?: string;
    status?: string;
  }): Promise<ReorderRow> => {
    const [row] = await db
      .insert(reorders)
      .values({
        userId: input.userId,
        petId: input.petId ?? null,
        inventoryId: input.inventoryId ?? null,
        productId: input.productId ?? null,
        productName: input.productName ?? null,
        quantity: input.quantity ?? 1,
        mode: input.mode ?? 'assisted',
        status: input.status ?? 'pending_confirm',
      })
      .returning();
    return row;
  },

  getReorder: async (id: string): Promise<ReorderRow | undefined> => {
    const [row] = await db.select().from(reorders).where(eq(reorders.id, id));
    return row;
  },

  updateReorder: async (
    id: string,
    patch: Partial<{ status: string; shopOrderId: string | null }>,
  ): Promise<ReorderRow | undefined> => {
    const [row] = await db
      .update(reorders)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(reorders.id, id))
      .returning();
    return row;
  },

  listReordersForUser: async (userId: string): Promise<ReorderRow[]> =>
    db.select().from(reorders).where(eq(reorders.userId, userId)).orderBy(desc(reorders.createdAt)),
};
