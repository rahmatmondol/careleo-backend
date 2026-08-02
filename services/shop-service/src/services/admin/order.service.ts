import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db';
import { orders, orderItems, products } from '../../db/schema';

const ALLOWED_STATUSES = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];

const mapOrder = (o: any, items: any[] = [], productsMap: Record<string, any> = {}) => ({
  id: o.id,
  userId: o.userId,
  totalAmount: Number(o.totalAmount || 0),
  status: o.status,
  shippingAddress: o.shippingAddress || '',
  createdAt: o.createdAt,
  items: items.map((it) => ({
    id: it.id,
    productId: it.productId,
    productName: it.productName,
    quantity: it.quantity,
    price: Number(it.price || 0),
    imageUrl: productsMap[it.productId]?.imageUrl || null,
    sku: productsMap[it.productId]?.sku || null,
  })),
});

export async function listOrders(query: any = {}) {
  const conditions = query.status ? eq(orders.status, String(query.status).toUpperCase()) : undefined;
  const rows = await db.select().from(orders).where(conditions).orderBy(desc(orders.createdAt));
  // Note: listOrders does not currently return items for each order in the original code (items=[]).
  // If it needs to, we'd need a big join or multiple queries. Keeping it as is.
  return { orders: rows.map((o) => mapOrder(o)) };
}

export async function getOrderById(id: string) {
  const rows = await db.select().from(orders).where(eq(orders.id, id));
  if (!rows.length) return { error: 'Order not found', status: 404 };
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  
  const productsMap: Record<string, any> = {};
  if (items.length > 0) {
    const productIds = items.map(it => it.productId);
    const prods = await db.select({ id: products.id, sku: products.sku, imageUrl: products.imageUrl }).from(products).where(inArray(products.id, productIds));
    for (const p of prods) {
      productsMap[p.id] = p;
    }
  }

  return { order: mapOrder(rows[0], items, productsMap) };
}

export async function updateOrderStatus(id: string, status: string) {
  const normalized = String(status || '').toUpperCase();
  if (!ALLOWED_STATUSES.includes(normalized)) return { error: 'Invalid status', status: 400 };
  const row = await db.update(orders).set({ status: normalized }).where(eq(orders.id, id)).returning();
  if (!row.length) return { error: 'Order not found', status: 404 };
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));

  const productsMap: Record<string, any> = {};
  if (items.length > 0) {
    const productIds = items.map(it => it.productId);
    const prods = await db.select({ id: products.id, sku: products.sku, imageUrl: products.imageUrl }).from(products).where(inArray(products.id, productIds));
    for (const p of prods) {
      productsMap[p.id] = p;
    }
  }

  return { order: mapOrder(row[0], items, productsMap) };
}
