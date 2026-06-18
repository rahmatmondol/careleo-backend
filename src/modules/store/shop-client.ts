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

export type ShopProduct = {
  id: string;
  name: string;
  price: string | number | null;
  imageUrl: string | null;
  slug: string | null;
  description?: string | null;
  stock?: number | null;
};

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
