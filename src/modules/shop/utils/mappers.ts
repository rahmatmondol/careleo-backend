import { safeJsonParse } from './common';
import { normaliseMediaUrl, normaliseMediaUrls } from '@/shared/http/media-url';

/** Below this (and above 0) a product is reported as "Low Stock". */
export const LOW_STOCK_THRESHOLD = 10;

/**
 * Inventory availability, derived from `stock`.
 * Kept separate from `status`, which is the *publish* state (Draft/Published/...)
 * stored on the row and edited from the product form.
 */
export const deriveStockStatus = (stock: any): 'In Stock' | 'Low Stock' | 'Out of Stock' => {
  const qty = Number(stock || 0);
  if (qty <= 0) return 'Out of Stock';
  if (qty <= LOW_STOCK_THRESHOLD) return 'Low Stock';
  return 'In Stock';
};

export const mapProductForAdmin = (p: any) => ({
  id: p.id,
  name: p.name,
  sku: p.sku || '',
  category: p.categoryName || '',
  categoryId: p.categoryId || null,
  subCategory: p.subCategory || undefined,
  price: Number(p.price || 0),
  costPrice: Number((p as any).costPrice || 0),
  stock: Number(p.stock || 0),
  status: p.status || 'Draft',
  stockStatus: deriveStockStatus(p.stock),
  // Rewritten off the retired :8090 / :3017 origins — see shared/http/media-url.ts
  imageUrl: normaliseMediaUrl(p.imageUrl),
  brand: p.brand || undefined,
  brandId: p.brandId || null,
  shortDescription: p.shortDescription || '',
  description: p.description || '',
  supplier: p.supplier || p.source || 'N/A',
  source: p.source || '',
  sourceId: p.sourceId || null,
  productType: p.productType || 'Simple',
  subscriptionIncluded: !!p.subscriptionIncluded,
  /** @deprecated kept so older admin builds keep hydrating their form. */
  excludeFromSubscription: !!p.excludeFromSubscription,
  tags: safeJsonParse<string[]>(p.tags, []),
  attributes: safeJsonParse<{ name: string; values: string[] }[]>(p.attributes, []),
  variations: safeJsonParse<{ attribute: string; value: string; price: number; sku: string; stock: number }[]>(p.variations, []),
  galleryImages: normaliseMediaUrls(
    safeJsonParse<string[]>(p.galleryImages, p.imageUrl ? [p.imageUrl] : []),
  ),
  // Nested for the detail view, flat for the edit form — the form hydrates from
  // the flat keys and would otherwise regenerate the slug from the name on save.
  slug: p.slug || '',
  seoSlug: p.seoSlug || p.slug || '',
  metaTitle: p.metaTitle || '',
  metaDescription: p.metaDescription || '',
  metaKeywords: p.metaKeywords || '',
  seo: {
    slug: p.seoSlug || p.slug,
    metaTitle: p.metaTitle || p.name,
    metaDescription: p.metaDescription || '',
    keywords: p.metaKeywords || '',
  },
  /**
   * Populated by `getProductById`, which passes the rows in. Every other caller
   * (the list, for instance) leaves them empty rather than paying for a join it
   * will not render.
   *
   * These were hard-coded to `[]` while `product_inventory_logs` was being
   * written on every checkout — the stock history existed the whole time and
   * nothing ever read it back.
   */
  inventoryLogs: p.inventoryLogs ?? [],
  purchaseLogs: p.purchaseLogs ?? [],
});

export const mapCategoryForAdmin = (c: any, parent: any = null) => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  description: c.description || '',
  parentId: c.parentId || null,
  parent: parent ? { id: parent.id, name: parent.name, slug: parent.slug } : null,
  isActive: !!c.isActive,
  status: c.isActive ? 'active' : 'inactive',
  order: Number(c.sortOrder || 0),
  sortOrder: Number(c.sortOrder || 0),
  image: normaliseMediaUrl(c.imageUrl) || null,
  imageUrl: normaliseMediaUrl(c.imageUrl) || null,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

export const mapSourceForAdmin = (s: any, counts?: { productsCount?: number; ordersCount?: number }) => {
  const extra = safeJsonParse<Record<string, any>>(s.extra, {});
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    type: s.sourceType || 'supplier',
    sourceType: s.sourceType || 'supplier',
    contactPerson: s.contactName || '',
    contactName: s.contactName || '',
    email: s.email || '',
    phone: s.contactPhone || '',
    contactPhone: s.contactPhone || '',
    address: s.address || '',
    website: s.website || '',
    taxId: s.taxId || '',
    notes: s.notes || '',
    isPreferred: !!s.isPreferred,
    isActive: !!s.isActive,
    productsCount: Number(counts?.productsCount || 0),
    ordersCount: Number(counts?.ordersCount || 0),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    ...extra,
  };
};
