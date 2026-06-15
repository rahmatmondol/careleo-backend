import { desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { orders, orderItems } from '../../db/schema';

export async function listOrders(userId: string) {
  const result = await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
  return { orders: result };
}

export async function getOrderById(id: string) {
  const order = await db.select().from(orders).where(eq(orders.id, id));
  if (!order.length) return { error: 'Order not found' };
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  return { order: order[0], items };
}
