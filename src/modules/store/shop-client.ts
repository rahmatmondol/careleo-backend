/**
 * Shop access for the AI tools and the food-inventory re-order flow.
 *
 * This was an HTTP client. shop-service owned its own database (`careleo_shop`),
 * so the monolith could not query products or place an order directly — every
 * call went out over the network to `SHOP_SERVICE_URL`, carrying either the
 * user's bearer token or the shared `INTERNAL_SERVICE_SECRET`.
 *
 * The shop is a module in this process now, so these are ordinary function
 * calls: no network hop, no token forwarding, no `x-internal-secret`, and a
 * checkout that is one database transaction instead of three HTTP requests that
 * could each fail halfway.
 *
 * The file is kept (rather than having callers import the shop services
 * directly) because it is a genuine seam: `modules/ai` and
 * `modules/food-inventory` depend on a *small, stable* view of the shop — search
 * a product, add to cart, check out — and not on the shop's internals.
 *
 * The best-effort contract is unchanged. Callers get `[]` / `null` / `false`
 * instead of an exception, so a shop failure degrades an AI reply or a re-order
 * rather than breaking the request around it.
 */

import * as publicService from '@/modules/shop/services/public.service';
import * as cartService from '@/modules/shop/services/customer/cart.service';

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
    const result = await publicService.listProducts({ search: query, limit });
    return (result?.products ?? []) as unknown as ShopProduct[];
  } catch (e: any) {
    console.warn('[shop] searchShopProducts failed:', e?.message ?? e);
    return [];
  }
};

const asOrder = (result: any): ShopOrder | null => {
  const order = result?.order ?? result ?? null;
  return order && order.id ? (order as ShopOrder) : null;
};

// ── Assisted re-order path (user confirmed it in the app) ───────────────────

/**
 * Add a product to the user's cart. Returns true on success.
 *
 * Took a bearer token when this was an HTTP call; it takes the `userId` the
 * caller already holds now, because there is no longer a request to authenticate.
 */
export const addToShopCart = async (
  userId: string,
  productId: string,
  quantity = 1,
): Promise<boolean> => {
  try {
    const result: any = await cartService.addCart(userId, { productId, quantity });
    return !result?.error;
  } catch (e: any) {
    console.warn('[shop] addToShopCart failed:', e?.message ?? e);
    return false;
  }
};

/** Check out the user's cart into an order. Returns the order or null. */
export const shopCheckout = async (userId: string): Promise<ShopOrder | null> => {
  try {
    const result: any = await cartService.checkout(userId);
    if (result?.error) {
      console.warn('[shop] shopCheckout rejected:', result.error);
      return null;
    }
    return asOrder(result);
  } catch (e: any) {
    console.warn('[shop] shopCheckout failed:', e?.message ?? e);
    return null;
  }
};

// ── Auto re-order path (background job; user offline) ───────────────────────

/**
 * Place an order on a user's behalf.
 *
 * This used to POST to `/shop/internal/orders` with `x-internal-secret`, an
 * endpoint that existed purely so one service could act as another. The
 * underlying function is directly callable now.
 */
export const placeInternalOrder = async (
  userId: string,
  items: { productId: string; quantity: number }[],
): Promise<ShopOrder | null> => {
  try {
    const result: any = await cartService.createOrderForUser(userId, items, {
      source: 'auto_reorder',
    });
    if (result?.error) {
      console.warn('[shop] placeInternalOrder rejected:', result.error);
      return null;
    }
    return asOrder(result);
  } catch (e: any) {
    console.warn('[shop] placeInternalOrder failed:', e?.message ?? e);
    return null;
  }
};
