import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/shared/db';
import { orders, orderItems, products, users } from '@/shared/db/schema';
import { releaseUsage } from '@/modules/subscriptions/coverage';
import { safeJsonParse } from '../../utils/common';

const ALLOWED_STATUSES = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80';

/**
 * Resolve the customer behind each order.
 *
 * Before the merge this opened a *second* connection pool to the main careleo
 * database on every admin order listing — `orders` lived in `careleo_shop` and
 * `users` in `careleo`, so there was no way to join them. That pool was created
 * and torn down per request, and any failure was swallowed into an empty map,
 * which is why the caller still has a placeholder-name fallback.
 *
 * Both tables are in the same database now, so this is an ordinary query on the
 * shared pool. The shape of the returned map is unchanged.
 */
async function getUsersMap(userIds: string[]) {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return {};

  const rows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phone: users.phone,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(inArray(users.id, uniqueIds));

  const map: Record<string, any> = {};
  for (const u of rows) {
    const fullName =
      [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email || 'Registered Customer';
    map[u.id] = {
      id: u.id,
      name: fullName,
      email: u.email || '',
      phone: u.phone || '+8801700000000',
      avatar: u.avatarUrl || DEFAULT_AVATAR,
    };
  }
  return map;
}

const mapOrder = (
  o: any,
  items: any[] = [],
  productsMap: Record<string, any> = {},
  userMap: Record<string, any> = {}
) => {
  const userInfo = userMap[o.userId] || {
    id: o.userId || 'u1',
    name: o.shippingAddress
      ? o.shippingAddress.split('|')[0]?.trim() || 'Registered Customer'
      : 'Registered Customer',
    email: o.userId ? `${o.userId.substring(0, 8)}@careleo.com` : 'customer@careleo.com',
    phone: '+8801700000000',
    avatar:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  };

  const statusRaw = String(o.status || 'Pending').toUpperCase();
  let normalizedStatus = 'Pending';
  if (statusRaw === 'PROCESSING') normalizedStatus = 'Processing';
  else if (statusRaw === 'SHIPPED') normalizedStatus = 'Shipped';
  else if (statusRaw === 'DELIVERED') normalizedStatus = 'Delivered';
  else if (statusRaw === 'CANCELLED') normalizedStatus = 'Cancelled';
  else if (statusRaw === 'REFUNDED') normalizedStatus = 'Refunded';

  return {
    id: o.id,
    userId: o.userId,
    customer: {
      id: userInfo.id || o.userId,
      name: userInfo.name || 'Registered Customer',
      email: userInfo.email || 'customer@careleo.com',
      phone: userInfo.phone || '+8801700000000',
      avatar:
        userInfo.avatar ||
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      hasSubscription: Boolean(userInfo.hasSubscription),
    },
    source: o.source || 'checkout',
    totalAmount: Number(o.totalAmount || 0),
    total: Number(o.totalAmount || 0),
    // Money split. Orders placed before subscription coverage existed have
    // zeroes here, so fall back to the total being entirely payable.
    subtotal: Number(o.subtotal || o.totalAmount || 0),
    coveredAmount: Number(o.coveredAmount || 0),
    payableAmount: Number(o.coveredAmount) > 0 ? Number(o.payableAmount || 0) : Number(o.totalAmount || 0),
    status: normalizedStatus,
    paymentMethod: o.paymentMethod || 'Cash on Delivery',
    paymentStatus: o.paymentStatus || 'Unpaid',
    shippingAddress: o.shippingAddress || '123 Pet Lane, San Francisco, CA',
    orderDate: o.createdAt || new Date().toISOString(),
    createdAt: o.createdAt || new Date().toISOString(),
    items: items.map((it) => ({
      id: it.id,
      productId: it.productId,
      name: it.productName,
      productName: it.productName,
      quantity: Number(it.quantity || 1),
      unitPrice: Number(it.price || 0),
      price: Number(it.price || 0),
      coveredQuantity: Number(it.coveredQuantity || 0),
      coveredAmount: Number(it.coveredAmount || 0),
      imageUrl: productsMap[it.productId]?.imageUrl || null,
      sku: productsMap[it.productId]?.sku || null,
    })),
  };
};

export async function listOrders(query: any = {}) {
  const conditions = query.status ? eq(orders.status, String(query.status).toUpperCase()) : undefined;
  const rows = await db.select().from(orders).where(conditions).orderBy(desc(orders.createdAt));

  const userIds = rows.map((o) => o.userId);
  const userMap = await getUsersMap(userIds);

  const orderIds = rows.map((o) => o.id);
  let itemsMap: Record<string, any[]> = {};
  if (orderIds.length > 0) {
    const allItems = await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds));
    for (const it of allItems) {
      if (!itemsMap[it.orderId]) itemsMap[it.orderId] = [];
      itemsMap[it.orderId].push(it);
    }
  }

  return { orders: rows.map((o) => mapOrder(o, itemsMap[o.id] || [], {}, userMap)) };
}

export async function getOrderById(id: string) {
  const rows = await db.select().from(orders).where(eq(orders.id, id));
  if (!rows.length) return { error: 'Order not found', status: 404 };
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));

  const productsMap: Record<string, any> = {};
  if (items.length > 0) {
    const productIds = items.map((it) => it.productId);
    const prods = await db
      .select({ id: products.id, sku: products.sku, imageUrl: products.imageUrl })
      .from(products)
      .where(inArray(products.id, productIds));
    for (const p of prods) {
      productsMap[p.id] = p;
    }
  }

  const userMap = await getUsersMap([rows[0].userId]);

  return { order: mapOrder(rows[0], items, productsMap, userMap) };
}

export async function updateOrderStatus(id: string, status: string) {
  const normalized = String(status || '').toUpperCase();
  if (!ALLOWED_STATUSES.includes(normalized)) return { error: 'Invalid status', status: 400 };

  const row = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
    if (!current) return [];

    const updated = await tx
      .update(orders)
      .set({ status: normalized })
      .where(eq(orders.id, id))
      .returning();

    /**
     * Cancelling an order that a subscription paid for gives the benefit back.
     * Credited to the period the order actually drew from — by the time a
     * cancellation arrives the user may already be in a later period, and
     * crediting that one would hand out budget that was never spent.
     *
     * Guarded on the *previous* status so re-saving CANCELLED, or moving
     * CANCELLED → REFUNDED, cannot refund the same budget twice.
     */
    const isNowCancelled = normalized === 'CANCELLED' || normalized === 'REFUNDED';
    const wasCancelled = current.status === 'CANCELLED' || current.status === 'REFUNDED';
    const covered = Number(current.coveredAmount ?? 0);

    if (isNowCancelled && !wasCancelled && covered > 0 && current.benefitPeriodStart) {
      await releaseUsage(
        tx,
        current.userId,
        current.benefitPeriodStart,
        covered,
        safeJsonParse<Record<string, number>>(current.coverageMetaJson, {}),
      );
    }

    return updated;
  });

  if (!row.length) return { error: 'Order not found', status: 404 };
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));

  const productsMap: Record<string, any> = {};
  if (items.length > 0) {
    const productIds = items.map((it) => it.productId);
    const prods = await db
      .select({ id: products.id, sku: products.sku, imageUrl: products.imageUrl })
      .from(products)
      .where(inArray(products.id, productIds));
    for (const p of prods) {
      productsMap[p.id] = p;
    }
  }

  const userMap = await getUsersMap([row[0].userId]);

  return { order: mapOrder(row[0], items, productsMap, userMap) };
}
