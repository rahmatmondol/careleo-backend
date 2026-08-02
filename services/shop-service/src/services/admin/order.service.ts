import { desc, eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { db } from '../../db';
import { orders, orderItems, products } from '../../db/schema';

const ALLOWED_STATUSES = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];

const MAIN_DB_URL =
  process.env.MAIN_DATABASE_URL || 'postgres://careleo:careleo_dev_password@localhost:5433/careleo';

async function getUsersMap(userIds: string[]) {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return {};
  const mainPool = new Pool({ connectionString: MAIN_DB_URL });
  try {
    const res = await mainPool.query(
      `SELECT id, first_name, last_name, email, phone, avatar_url FROM users WHERE id = ANY($1)`,
      [uniqueIds]
    );
    const map: Record<string, any> = {};
    for (const u of res.rows) {
      const fullName =
        [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.email || 'Registered Customer';
      map[u.id] = {
        id: u.id,
        name: fullName,
        email: u.email || '',
        phone: u.phone || '+8801700000000',
        avatar:
          u.avatar_url ||
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      };
    }
    await mainPool.end();
    return map;
  } catch (err) {
    console.warn('[getUsersMap] Failed to fetch user details:', err);
    await mainPool.end().catch(() => {});
    return {};
  }
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
    },
    totalAmount: Number(o.totalAmount || 0),
    total: Number(o.totalAmount || 0),
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
  const row = await db.update(orders).set({ status: normalized }).where(eq(orders.id, id)).returning();
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
