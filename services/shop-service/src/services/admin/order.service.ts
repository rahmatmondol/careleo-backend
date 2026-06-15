import { desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { orders, orderItems } from '../../db/schema';

const ALLOWED_STATUSES = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];

const mapOrder = (o: any, items: any[] = []) => ({
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
  })),
});

export async function listOrders(query: any = {}) {
  const conditions = query.status ? eq(orders.status, String(query.status).toUpperCase()) : undefined;
  const rows = await db.select().from(orders).where(conditions).orderBy(desc(orders.createdAt));
  return { orders: rows.map((o) => mapOrder(o)) };
}

export async function getOrderById(id: string) {
  const rows = await db.select().from(orders).where(eq(orders.id, id));
  if (!rows.length) return { error: 'Order not found', status: 404 };
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  return { order: mapOrder(rows[0], items) };
}

export async function updateOrderStatus(id: string, status: string) {
  const normalized = String(status || '').toUpperCase();
  if (!ALLOWED_STATUSES.includes(normalized)) return { error: 'Invalid status', status: 400 };
  const row = await db.update(orders).set({ status: normalized }).where(eq(orders.id, id)).returning();
  if (!row.length) return { error: 'Order not found', status: 404 };
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  return { order: mapOrder(row[0], items) };
}
