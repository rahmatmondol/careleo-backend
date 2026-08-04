import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/shared/db';
import { cartItems, products, orders, orderItems, productInventoryLogs } from '@/shared/db/schema';

/** Thrown inside the order transaction to roll back and surface a clean error. */
class OrderError extends Error {
  status: number;
  constructor(message: string, status = 400){ super(message); this.status = status; }
}

export async function listCart(userId: string){
  const items = await db.select({ id: cartItems.id, userId: cartItems.userId, productId: cartItems.productId, quantity: cartItems.quantity, createdAt: cartItems.createdAt, product: { id: products.id, name: products.name, brand: products.brand, price: products.price, imageUrl: products.imageUrl } }).from(cartItems).leftJoin(products, eq(cartItems.productId, products.id)).where(eq(cartItems.userId, userId)).orderBy(desc(cartItems.createdAt));
  return { cart: items };
}
export async function addCart(userId: string, b: any){
  const existing = await db.select().from(cartItems).where(and(eq(cartItems.userId, userId), eq(cartItems.productId, b.productId)));
  if (existing.length){ const result = await db.update(cartItems).set({ quantity: existing[0].quantity + (b.quantity || 1) }).where(eq(cartItems.id, existing[0].id)).returning(); return { message: 'Cart updated', item: result[0] }; }
  const result = await db.insert(cartItems).values({ userId, productId: b.productId, quantity: b.quantity || 1 }).returning();
  return { message: 'Added to cart', item: result[0] };
}
export async function updateCartItem(userId: string, itemId: string, quantity: number){
  const result = await db.update(cartItems).set({ quantity }).where(and(eq(cartItems.id, itemId), eq(cartItems.userId, userId))).returning();
  if (!result.length) return { error: 'Cart item not found', status: 404 };
  return { message: 'Cart item updated', item: result[0] };
}
export async function removeCartItem(userId: string, itemId: string){
  const result = await db.delete(cartItems).where(and(eq(cartItems.id, itemId), eq(cartItems.userId, userId))).returning();
  if (!result.length) return { error: 'Cart item not found', status: 404 };
  return { message: 'Item removed from cart' };
}
/**
 * Create an order for a user from explicit line items: price lookup, stock
 * validation, stock deduction, inventory log, order + order items. Shared by
 * cart checkout, recurring subscriptions, and the internal service-order
 * endpoint (background re-orders).
 *
 * Runs inside a single DB transaction so a mid-way failure never leaves stock
 * decremented without a matching order. Rejects the whole order if any line
 * references a missing product or exceeds available stock (no overselling).
 *
 * Payment defaults to COD/PENDING — online providers set their own values
 * once a real gateway is wired in.
 */
export type CreateOrderOptions = {
  shippingAddress?: string | null;
  paymentMethod?: string;
  source?: string;
};

export async function createOrderForUser(userId: string, items: { productId: string; quantity: number }[], opts: CreateOrderOptions = {}){
  if (!items?.length) return { error: 'No items', status: 400 };

  try {
    return await db.transaction(async (tx) => {
      let total = 0; const orderItemsData: any[] = [];
      for (const item of items){
        const qty = Number(item.quantity || 0);
        if (qty <= 0) throw new OrderError('Invalid quantity for an item', 400);
        const rows = await tx.select().from(products).where(eq(products.id, item.productId));
        const prod = rows[0];
        if (!prod) throw new OrderError('One or more products are no longer available', 400);
        const available = Number(prod.stock || 0);
        if (available < qty) throw new OrderError(`Insufficient stock for ${prod.name}`, 409);
        const price = Number(prod.price); total += price * qty;
        orderItemsData.push({ productId: prod.id, productName: prod.name, quantity: qty, price: String(price) });
        await tx.update(products).set({ stock: available - qty }).where(eq(products.id, prod.id));
        await tx.insert(productInventoryLogs).values({ productId: prod.id, type: 'Sale', quantity: -qty, note: 'Stock deducted from order', actor: 'System' });
      }
      const order = await tx.insert(orders).values({
        userId,
        totalAmount: String(total),
        shippingAddress: opts.shippingAddress ?? null,
        paymentMethod: opts.paymentMethod ?? 'COD',
        source: opts.source ?? 'checkout',
      }).returning();
      for (const oi of orderItemsData) await tx.insert(orderItems).values({ orderId: order[0]!.id, ...oi });
      return { message: 'Order placed', order: order[0] };
    });
  } catch (e) {
    if (e instanceof OrderError) return { error: e.message, status: e.status };
    throw e;
  }
}

export async function checkout(userId: string, shippingAddress?: string, paymentMethod?: string){
  const items = await db.select().from(cartItems).where(eq(cartItems.userId, userId));
  if (!items.length) return { error: 'Cart is empty', status: 400 };
  const result = await createOrderForUser(userId, items.map((i) => ({ productId: i.productId, quantity: i.quantity })), { shippingAddress, paymentMethod, source: 'checkout' });
  if ((result as any).error) return result;
  await db.delete(cartItems).where(eq(cartItems.userId, userId));
  return result;
}
