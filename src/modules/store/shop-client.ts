/**
 * Internal HTTP client for the shop-service (products/orders microservice).
 *
 * The shop-service owns its own database (careleo_shop), so the monolith reaches
 * it over HTTP rather than via Drizzle. Base URL comes from SHOP_SERVICE_URL
 * (docker network host in prod, localhost in dev). All calls are best-effort:
 * callers get an empty result on failure rather than a thrown error, so a shop
 * outage never breaks an AI reply or a user flow.
 */

const SHOP_BASE = (process.env.SHOP_SERVICE_URL ?? 'http://shop-service:3004').replace(/\/$/, '');
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? '';

export type ShopProduct = {
  id: string;
  name: string;
  price: string | number | null;
  imageUrl: string | null;
  slug: string | null;
  description?: string | null;
  stock?: number | null;
};

export type ShopOrder = { id: string; userId: string; totalAmount: string; status: string };

/** Search active products by name. Returns at most `limit` items, [] on error. */
export const searchShopProducts = async (query: string, limit = 5): Promise<ShopProduct[]> => {
  try {
    const url = new URL(`${SHOP_BASE}/api/v1/shop/products`);
    if (query) url.searchParams.set('search', query);
    url.searchParams.set('limit', String(limit));

    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const body: any = await res.json().catch(() => null);
    // shop-service returns { products, total, page, limit } (optionally wrapped).
    const products = body?.products ?? body?.data?.products ?? [];
    return Array.isArray(products) ? (products as ShopProduct[]) : [];
  } catch (e: any) {
    console.warn('[shop-client] searchShopProducts failed:', e?.message ?? e);
    return [];
  }
};

const extractOrder = (body: any): ShopOrder | null => {
  const order = body?.order ?? body?.data?.order ?? null;
  return order && order.id ? (order as ShopOrder) : null;
};

// ── Assisted re-order path (user present; forward their bearer token) ────────

/** Add a product to the user's shop cart. Returns true on success. */
export const addToShopCart = async (authToken: string, productId: string, quantity = 1): Promise<boolean> => {
  try {
    const res = await fetch(`${SHOP_BASE}/api/v1/shop/cart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ productId, quantity }),
    });
    return res.ok;
  } catch (e: any) {
    console.warn('[shop-client] addToShopCart failed:', e?.message ?? e);
    return false;
  }
};

/** Check out the user's shop cart into an order. Returns the order or null. */
export const shopCheckout = async (authToken: string): Promise<ShopOrder | null> => {
  try {
    const res = await fetch(`${SHOP_BASE}/api/v1/shop/cart/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) return null;
    return extractOrder(await res.json().catch(() => null));
  } catch (e: any) {
    console.warn('[shop-client] shopCheckout failed:', e?.message ?? e);
    return null;
  }
};

// ── Auto re-order path (background; user offline; service secret) ────────────

/** Place an order for a user via the internal service endpoint. Returns order or null. */
export const placeInternalOrder = async (
  userId: string,
  items: { productId: string; quantity: number }[],
): Promise<ShopOrder | null> => {
  try {
    const res = await fetch(`${SHOP_BASE}/api/v1/shop/internal/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify({ userId, items }),
    });
    if (!res.ok) return null;
    return extractOrder(await res.json().catch(() => null));
  } catch (e: any) {
    console.warn('[shop-client] placeInternalOrder failed:', e?.message ?? e);
    return null;
  }
};
