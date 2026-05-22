import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { env } from '@/config/env';
import { db } from '@/shared/db';
import {
  integrationSyncJobs,
  wooCustomersCache,
  wooOrderItemsCache,
  wooOrdersCache,
  wooProductsCache,
  wooWebhookEvents,
} from '@/shared/db/schema';

type JsonObj = Record<string, any>;

const buildWooUrl = (path: string, query: Record<string, string | number | undefined> = {}) => {
  const base = new URL(path, env.WOO_BASE_URL.endsWith('/') ? env.WOO_BASE_URL : `${env.WOO_BASE_URL}/`);
  base.searchParams.set('consumer_key', env.WOO_CONSUMER_KEY);
  base.searchParams.set('consumer_secret', env.WOO_CONSUMER_SECRET);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) base.searchParams.set(k, String(v));
  }
  return base.toString();
};

const fetchWoo = async (path: string, query: Record<string, string | number | undefined> = {}) => {
  const url = buildWooUrl(path, query);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!res.ok) {
    throw new Error(`Woo request failed: ${res.status} ${JSON.stringify(payload)}`);
  }

  return payload;
};

export const WooCommerceModel = {
  /** Validate remote Woo credentials by requesting system status. */
  async testConnection() {
    const payload = await fetchWoo('/wp-json/wc/v3/system_status');
    return {
      ok: true,
      environment: payload?.environment?.home_url ?? null,
      version: payload?.environment?.version ?? null,
      wcVersion: payload?.environment?.woocommerce_version ?? null,
    };
  },

  /** Pull products from Woo and upsert local cache. */
  async syncProducts(page = 1, perPage = 20) {
    const products: JsonObj[] = await fetchWoo('/wp-json/wc/v3/products', { page, per_page: perPage });

    for (const p of products) {
      await db
        .insert(wooProductsCache)
        .values({
          wooProductId: Number(p.id),
          name: String(p.name ?? ''),
          slug: p.slug ?? null,
          status: p.status ?? null,
          type: p.type ?? null,
          price: p.price ? String(p.price) : null,
          regularPrice: p.regular_price ? String(p.regular_price) : null,
          salePrice: p.sale_price ? String(p.sale_price) : null,
          stockStatus: p.stock_status ?? null,
          imageUrl: p.images?.[0]?.src ?? null,
          payload: p,
          syncedAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: wooProductsCache.wooProductId,
          set: {
            name: String(p.name ?? ''),
            slug: p.slug ?? null,
            status: p.status ?? null,
            type: p.type ?? null,
            price: p.price ? String(p.price) : null,
            regularPrice: p.regular_price ? String(p.regular_price) : null,
            salePrice: p.sale_price ? String(p.sale_price) : null,
            stockStatus: p.stock_status ?? null,
            imageUrl: p.images?.[0]?.src ?? null,
            payload: p,
            syncedAt: new Date(),
            updatedAt: new Date(),
          },
        });
    }

    return products;
  },

  /** Pull orders from Woo and upsert local cache + line items. */
  async syncOrders(page = 1, perPage = 20) {
    const orders: JsonObj[] = await fetchWoo('/wp-json/wc/v3/orders', { page, per_page: perPage });

    for (const o of orders) {
      await db
        .insert(wooOrdersCache)
        .values({
          wooOrderId: Number(o.id),
          orderKey: o.order_key ?? null,
          status: o.status ?? 'unknown',
          currency: o.currency ?? null,
          total: o.total ?? null,
          customerId: o.customer_id ? Number(o.customer_id) : null,
          billingEmail: o.billing?.email ?? null,
          payload: o,
          syncedAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: wooOrdersCache.wooOrderId,
          set: {
            orderKey: o.order_key ?? null,
            status: o.status ?? 'unknown',
            currency: o.currency ?? null,
            total: o.total ?? null,
            customerId: o.customer_id ? Number(o.customer_id) : null,
            billingEmail: o.billing?.email ?? null,
            payload: o,
            syncedAt: new Date(),
            updatedAt: new Date(),
          },
        });

      if (Array.isArray(o.line_items)) {
        for (const li of o.line_items) {
          await db
            .insert(wooOrderItemsCache)
            .values({
              wooOrderId: Number(o.id),
              wooLineItemId: Number(li.id),
              productId: li.product_id ? Number(li.product_id) : null,
              variationId: li.variation_id ? Number(li.variation_id) : null,
              name: String(li.name ?? ''),
              quantity: Number(li.quantity ?? 1),
              total: li.total ?? null,
              payload: li,
              syncedAt: new Date(),
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: wooOrderItemsCache.id,
              set: {
                productId: li.product_id ? Number(li.product_id) : null,
                variationId: li.variation_id ? Number(li.variation_id) : null,
                name: String(li.name ?? ''),
                quantity: Number(li.quantity ?? 1),
                total: li.total ?? null,
                payload: li,
                syncedAt: new Date(),
                updatedAt: new Date(),
              },
            });
        }
      }
    }

    return orders;
  },

  /** Pull customers from Woo and upsert local cache. */
  async syncCustomers(page = 1, perPage = 20) {
    const customers: JsonObj[] = await fetchWoo('/wp-json/wc/v3/customers', { page, per_page: perPage });

    for (const c of customers) {
      await db
        .insert(wooCustomersCache)
        .values({
          wooCustomerId: Number(c.id),
          email: c.email ?? null,
          firstName: c.first_name ?? null,
          lastName: c.last_name ?? null,
          role: c.role ?? null,
          payload: c,
          syncedAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: wooCustomersCache.wooCustomerId,
          set: {
            email: c.email ?? null,
            firstName: c.first_name ?? null,
            lastName: c.last_name ?? null,
            role: c.role ?? null,
            payload: c,
            syncedAt: new Date(),
            updatedAt: new Date(),
          },
        });
    }

    return customers;
  },

  /** Fetch single Woo order directly. */
  async getOrder(orderId: number) {
    return fetchWoo(`/wp-json/wc/v3/orders/${orderId}`);
  },

  /** Fetch single Woo product directly. */
  async getProduct(productId: number) {
    return fetchWoo(`/wp-json/wc/v3/products/${productId}`);
  },

  /** Verify webhook HMAC signature. */
  verifyWebhookSignature(rawBody: string, signature?: string) {
    if (!signature) return false;
    const digest = crypto.createHmac('sha256', env.WOO_WEBHOOK_SECRET).update(rawBody).digest('base64');
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  },

  /** Persist webhook event with dedupe guard by delivery id. */
  async storeWebhookEvent(input: {
    eventType: string;
    deliveryId: string;
    webhookId?: string;
    signature?: string;
    payload: JsonObj;
  }) {
    const existing = await db
      .select({ id: wooWebhookEvents.id })
      .from(wooWebhookEvents)
      .where(eq(wooWebhookEvents.deliveryId, input.deliveryId))
      .limit(1);

    if (existing[0]) return { duplicate: true, id: existing[0].id };

    const rows = await db
      .insert(wooWebhookEvents)
      .values({
        eventType: input.eventType,
        webhookId: input.webhookId ?? null,
        deliveryId: input.deliveryId,
        signature: input.signature ?? null,
        resourceId: Number(input.payload?.id ?? 0) || null,
        payload: input.payload,
      })
      .returning({ id: wooWebhookEvents.id });

    return { duplicate: false, id: rows[0]?.id ?? null };
  },

  /** Mark webhook event processed. */
  async markWebhookProcessed(deliveryId: string) {
    await db
      .update(wooWebhookEvents)
      .set({ processed: true, processedAt: new Date(), updatedAt: new Date() })
      .where(eq(wooWebhookEvents.deliveryId, deliveryId));
  },

  /** Save sync job status. */
  async createSyncJob(jobType: string, meta: JsonObj) {
    const rows = await db
      .insert(integrationSyncJobs)
      .values({ provider: 'woocommerce', jobType, status: 'running', meta, startedAt: new Date() })
      .returning({ id: integrationSyncJobs.id });
    return rows[0]?.id ?? null;
  },

  /** Complete sync job status. */
  async finishSyncJob(jobId: string, status: 'success' | 'failed', meta: JsonObj) {
    await db
      .update(integrationSyncJobs)
      .set({ status, meta, finishedAt: new Date(), updatedAt: new Date() })
      .where(eq(integrationSyncJobs.id, jobId));
  },

  /** Read cached orders list. */
  async listCachedOrders() {
    return db.select().from(wooOrdersCache);
  },

  /** Read cached products list. */
  async listCachedProducts() {
    return db.select().from(wooProductsCache);
  },
};