import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import { categories, products } from '@/shared/db/schema';
import { normaliseMediaUrl } from '@/shared/http/media-url';

/**
 * Rewrite a product's image URLs onto the current origin.
 *
 * These are the *public* catalogue reads — the storefront and the mobile app
 * both land here — and they return raw DB rows, so without this every image
 * stored against the retired :8090 / :3017 origins renders as a broken tile.
 * See `shared/http/media-url.ts`.
 */
const withImages = <T extends { imageUrl?: string | null; galleryImages?: unknown }>(row: T): T => {
  if (!row) return row;
  const out: any = { ...row };
  out.imageUrl = normaliseMediaUrl(out.imageUrl);
  if (typeof out.galleryImages === 'string') {
    try {
      const parsed = JSON.parse(out.galleryImages);
      if (Array.isArray(parsed)) {
        out.galleryImages = JSON.stringify(
          parsed.map((g: any) => normaliseMediaUrl(typeof g === 'string' ? g : g?.url)).filter(Boolean),
        );
      }
    } catch {
      // Leave a non-JSON value exactly as stored.
    }
  }
  return out;
};

export async function listCategories() {
  const result = await db.select().from(categories).orderBy(categories.name);
  // Category tiles carry images too, and from the same retired origins.
  return {
    categories: result.map((c) => ({ ...c, imageUrl: normaliseMediaUrl(c.imageUrl) })),
  };
}

export async function listProducts(query: any) {
  const conditions = [eq(products.isActive, true)] as any[];
  if (query.categoryId) conditions.push(eq(products.categoryId, query.categoryId));
  if (query.search) conditions.push(ilike(products.name, `%${query.search}%`));

  // `deals` only makes sense for products that actually carry a strike-through price.
  if (query.sort === 'deals') conditions.push(sql`${products.compareAtPrice} is not null`);

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const offset = (page - 1) * limit;

  const orderBy = (() => {
    switch (query.sort) {
      case 'price-asc':
        return asc(products.price);
      case 'price-desc':
        return desc(products.price);
      case 'deals':
        // Biggest absolute saving first.
        return desc(sql`${products.compareAtPrice} - ${products.price}`);
      case 'newest':
      default:
        // No sales-volume column exists yet, so `best-selling` falls back to newest.
        return desc(products.createdAt);
    }
  })();

  const result = await db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  const total = (await db.select({ count: sql<number>`count(*)` }).from(products).where(and(...conditions)))[0].count;

  return { products: result.map(withImages), total, page, limit };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a product by UUID *or* by its clean slug, so the storefront can use
 * shareable URLs (/product/probiotics-dogs-cats) instead of raw ids or names.
 * Passing a non-UUID string to eq(products.id, ...) would blow up in Postgres,
 * so the id predicate is only added when the value really is a UUID.
 */
export async function getProductByIdOrSlug(idOrSlug: string) {
  const key = (idOrSlug || '').trim();
  if (!key) return null;

  const matchers = [eq(products.slug, key), eq(products.seoSlug, key)];
  if (UUID_RE.test(key)) matchers.push(eq(products.id, key));

  const result = await db
    .select()
    .from(products)
    .where(and(or(...matchers), eq(products.isActive, true)))
    .limit(1);

  return result[0] ? withImages(result[0]) : null;
}

/** @deprecated use getProductByIdOrSlug */
export const getProductById = getProductByIdOrSlug;
