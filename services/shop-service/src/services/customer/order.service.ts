import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { orders, orderItems } from '../../db/schema';

export async function listOrders(userId: string) {
  const result = await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
  return { orders: result };
}

export async function getOrderById(userId: string, id: string) {
  const order = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.userId, userId)));
  if (!order.length) return { error: 'Order not found', status: 404 };
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order[0]!.id));
  return { order: order[0], items };
}
