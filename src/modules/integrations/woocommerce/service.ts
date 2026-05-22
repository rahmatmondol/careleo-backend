import { ValidationError } from '@/shared/errors';
import { WooCommerceModel } from './model';

const toPositiveInt = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

export const WooCommerceService = {
  /** Check if Woo API credentials are valid and reachable. */
  async testConnection() {
    const info = await WooCommerceModel.testConnection();
    return { connected: true, info };
  },

  /** Sync products from Woo and return local cache count. */
  async syncProducts(query: Record<string, unknown>) {
    const page = toPositiveInt(query.page, 1);
    const perPage = toPositiveInt(query.perPage, 20);
    const jobId = await WooCommerceModel.createSyncJob('products.sync', { page, perPage });

    try {
      const rows = await WooCommerceModel.syncProducts(page, perPage);
      await WooCommerceModel.finishSyncJob(jobId!, 'success', { imported: rows.length });
      return { page, perPage, imported: rows.length };
    } catch (error: any) {
      if (jobId) await WooCommerceModel.finishSyncJob(jobId, 'failed', { error: String(error?.message ?? error) });
      throw error;
    }
  },

  /** Sync orders from Woo and return local cache count. */
  async syncOrders(query: Record<string, unknown>) {
    const page = toPositiveInt(query.page, 1);
    const perPage = toPositiveInt(query.perPage, 20);
    const jobId = await WooCommerceModel.createSyncJob('orders.sync', { page, perPage });

    try {
      const rows = await WooCommerceModel.syncOrders(page, perPage);
      await WooCommerceModel.finishSyncJob(jobId!, 'success', { imported: rows.length });
      return { page, perPage, imported: rows.length };
    } catch (error: any) {
      if (jobId) await WooCommerceModel.finishSyncJob(jobId, 'failed', { error: String(error?.message ?? error) });
      throw error;
    }
  },

  /** Sync customers from Woo and return local cache count. */
  async syncCustomers(query: Record<string, unknown>) {
    const page = toPositiveInt(query.page, 1);
    const perPage = toPositiveInt(query.perPage, 20);
    const jobId = await WooCommerceModel.createSyncJob('customers.sync', { page, perPage });

    try {
      const rows = await WooCommerceModel.syncCustomers(page, perPage);
      await WooCommerceModel.finishSyncJob(jobId!, 'success', { imported: rows.length });
      return { page, perPage, imported: rows.length };
    } catch (error: any) {
      if (jobId) await WooCommerceModel.finishSyncJob(jobId, 'failed', { error: String(error?.message ?? error) });
      throw error;
    }
  },

  /** Get orders from local cache. */
  async listCachedOrders() {
    return { orders: await WooCommerceModel.listCachedOrders() };
  },

  /** Get products from local cache. */
  async listCachedProducts() {
    return { products: await WooCommerceModel.listCachedProducts() };
  },

  /** Get one order directly from Woo API by numeric id. */
  async getOrderById(id: string) {
    const orderId = Number(id);
    if (!Number.isFinite(orderId) || orderId <= 0) throw new ValidationError('Invalid order id');
    return { order: await WooCommerceModel.getOrder(orderId) };
  },

  /** Get one product directly from Woo API by numeric id. */
  async getProductById(id: string) {
    const productId = Number(id);
    if (!Number.isFinite(productId) || productId <= 0) throw new ValidationError('Invalid product id');
    return { product: await WooCommerceModel.getProduct(productId) };
  },

  /** Process webhook with signature verification + idempotent store. */
  async handleWebhook(input: {
    eventType: string;
    deliveryId: string;
    webhookId?: string;
    signature?: string;
    rawBody: string;
    payload: Record<string, any>;
  }) {
    const validSignature = WooCommerceModel.verifyWebhookSignature(input.rawBody, input.signature);
    if (!validSignature) throw new ValidationError('Invalid Woo webhook signature');

    const saved = await WooCommerceModel.storeWebhookEvent({
      eventType: input.eventType,
      deliveryId: input.deliveryId,
      webhookId: input.webhookId,
      signature: input.signature,
      payload: input.payload,
    });

    if (!saved.duplicate) {
      if (input.eventType === 'product-updated') {
        await WooCommerceModel.syncProducts(1, 20);
      }
      if (input.eventType === 'order-updated' || input.eventType === 'order-created') {
        await WooCommerceModel.syncOrders(1, 20);
      }
      await WooCommerceModel.markWebhookProcessed(input.deliveryId);
    }

    return {
      accepted: true,
      duplicate: saved.duplicate,
      deliveryId: input.deliveryId,
    };
  },
};