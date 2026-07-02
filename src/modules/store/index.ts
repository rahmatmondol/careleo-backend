/**
 * Store controller — proxies /api/v1/shop/* to shop-service.
 *
 * The shop-service owns its own database (careleo_shop). The frontend hits the
 * monolith at /api/v1/shop/* and the monolith forwards every request as-is to
 * shop-service, preserving method, headers, query string, and body.
 *
 * Elysia wildcard `*` matches a single path segment, so we register a few
 * patterns to cover all realistic shop routes (up to 3 levels deep).
 */

import { Elysia } from 'elysia';

const SHOP_BASE = (process.env.SHOP_SERVICE_URL ?? 'http://localhost:3004').replace(/\/$/, '');

const proxy = async ({ request, set }: { request: Request; set: any }) => {
  const url = new URL(request.url);
  // /api/v1/shop/something → extract the shop-relative path
  const shopPath = url.pathname.replace(/^\/api\/v1\/shop\/?/, '') || '';
  const targetUrl = `${SHOP_BASE}/api/v1/shop/${shopPath}${url.search}`;

  try {
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      if (['host', 'connection', 'transfer-encoding'].includes(key.toLowerCase())) return;
      headers[key] = value;
    });

    const body = ['GET', 'HEAD'].includes(request.method)
      ? undefined
      : await request.text().catch(() => undefined);

    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers: { ...headers, host: new URL(SHOP_BASE).host },
      body,
    });

    set.status = upstream.status;
    upstream.headers.forEach((value, key) => {
      if (['transfer-encoding', 'content-encoding'].includes(key.toLowerCase())) return;
      set.headers[key] = value;
    });

    const contentType = upstream.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) return await upstream.json();
    return await upstream.text();
  } catch (err: any) {
    console.warn('[store-proxy] upstream error:', err?.message ?? err);
    set.status = 502;
    return { success: false, message: 'Shop service unavailable' };
  }
};

export const storeController = new Elysia()
  .all('/shop', proxy)          // /api/v1/shop
  .all('/shop/*', proxy)        // /api/v1/shop/products, /shop/categories, /shop/cart
  .all('/shop/*/*', proxy)      // /api/v1/shop/products/:id, /shop/cart/checkout, /shop/orders/:id
  .all('/shop/*/*/*', proxy);   // /api/v1/shop/cart/items/:id/... etc
