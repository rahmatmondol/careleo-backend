import { WooCommerceService } from '@/modules/integrations/woocommerce/service';

export const StoreBridgeService = {
  /** Return cached Woo categories via products projection (category summary). */
  async getCategories() {
    const { products } = await WooCommerceService.listCachedProducts();
    const map = new Map<string, { id: number; name: string; slug: string }>();

    for (const row of products as any[]) {
      const cats = row?.payload?.categories ?? [];
      for (const c of cats) {
        if (c?.id && !map.has(String(c.id))) {
          map.set(String(c.id), { id: Number(c.id), name: String(c.name ?? ''), slug: String(c.slug ?? '') });
        }
      }
    }

    return { categories: Array.from(map.values()) };
  },

  /** Return cached Woo products for storefront bridge. */
  async getProducts() {
    return WooCommerceService.listCachedProducts();
  },

  /** Return cached Woo orders for admin/mobile bridge. */
  async getOrders() {
    return WooCommerceService.listCachedOrders();
  },
};