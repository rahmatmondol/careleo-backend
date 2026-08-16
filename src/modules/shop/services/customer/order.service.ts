import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/shared/db';
import { orders, orderItems, products } from '@/shared/db/schema';

/** Thumbnails carried on a list row — enough to render a card, not the order. */
const PREVIEW_LIMIT = 3;

/**
 * The customer's orders, newest first, each with a small item preview.
 *
 * The list used to return bare order rows, so the history screen had nothing
 * to show per order and rendered the same placeholder image for every one. The
 * items are fetched in a single extra query and grouped in memory rather than
 * per-order (which would be N+1 on a long history).
 */
export async function listOrders(userId: string) {
  const rows = await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
  if (!rows.length) return { orders: [] };

  const items = await db
    .select({
      orderId: orderItems.orderId,
      productName: orderItems.productName,
      quantity: orderItems.quantity,
      coveredQuantity: orderItems.coveredQuantity,
      imageUrl: products.imageUrl,
    })
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(inArray(orderItems.orderId, rows.map((o) => o.id)));

  const byOrder = new Map<string, typeof items>();
  for (const item of items) {
    const list = byOrder.get(item.orderId) ?? [];
    list.push(item);
    byOrder.set(item.orderId, list);
  }

  return {
    orders: rows.map((order) => {
      const lines = byOrder.get(order.id) ?? [];
      return {
        ...order,
        /** Distinct products on the order — what "+N more" counts. */
        lineCount: lines.length,
        /** Total units across those lines. */
        itemCount: lines.reduce((sum, l) => sum + Number(l.quantity || 0), 0),
        previewImages: lines.map((l) => l.imageUrl).filter(Boolean).slice(0, PREVIEW_LIMIT),
        previewNames: lines.map((l) => l.productName).slice(0, PREVIEW_LIMIT),
        hasCoveredItems: lines.some((l) => Number(l.coveredQuantity || 0) > 0),
      };
    }),
  };
}

export async function getOrderById(userId: string, id: string) {
  const order = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.userId, userId)));
  if (!order.length) return { error: 'Order not found', status: 404 };

  /**
   * Left join for the thumbnail: `order_items.product_id` is deliberately not a
   * foreign key (the line is a point-in-time snapshot and must survive the
   * product being deleted), so the catalogue row may be gone. Name and price
   * still come from the snapshot columns — only the image is looked up live.
   */
  const items = await db
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      productId: orderItems.productId,
      productName: orderItems.productName,
      quantity: orderItems.quantity,
      price: orderItems.price,
      coveredQuantity: orderItems.coveredQuantity,
      coveredAmount: orderItems.coveredAmount,
      imageUrl: products.imageUrl,
    })
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, order[0]!.id));

  return { order: order[0], items };
}
