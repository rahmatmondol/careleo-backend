import { and, desc, eq, inArray, like, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import { products, categories, productInventoryLogs } from '@/shared/db/schema';
import { toSlug } from '../../utils/common';
import { mapProductForAdmin } from '../../utils/mappers';
import { deleteLinksByEntity } from '@/modules/media/handlers/media.manage';

const stringifyMaybe = (value: any): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return undefined; }
};

const decorateProduct = async (p: any) => {
  let categoryName = '';
  if (p.categoryId) {
    const c = await db.select().from(categories).where(eq(categories.id, p.categoryId));
    categoryName = c[0]?.name || '';
  }
  return mapProductForAdmin({ ...p, categoryName });
};

export async function listProducts(query: any) {
  const conditions: any[] = [];
  if (query.categoryId) conditions.push(eq(products.categoryId, query.categoryId));
  if (query.brandId) conditions.push(eq(products.brandId, query.brandId));
  if (query.search) conditions.push(like(products.name, `%${query.search}%`));

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 50;
  const offset = (page - 1) * limit;

  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(products)
    .where(where)
    .orderBy(desc(products.createdAt))
    .limit(limit)
    .offset(offset);

  const totalRows = await db.select({ count: sql<number>`count(*)` }).from(products).where(where);
  const total = Number(totalRows[0]?.count ?? 0);

  const mapped = await Promise.all(rows.map(decorateProduct));
  return { products: mapped, total, page, limit };
}

export async function getProductById(id: string) {
  const rows = await db.select().from(products).where(eq(products.id, id));
  if (!rows.length) return { error: 'Product not found', status: 404 };

  /**
   * Stock movements for this product, newest first.
   *
   * `cart.service` inserts a row here on every checkout, and nothing has ever
   * read them — the admin product page rendered a placeholder instead. Capped
   * at 50 because the detail view shows a recent-activity list, not an audit
   * export.
   */
  const inventoryLogs = await db
    .select()
    .from(productInventoryLogs)
    .where(eq(productInventoryLogs.productId, id))
    .orderBy(desc(productInventoryLogs.createdAt))
    .limit(50);

  return { product: await decorateProduct({ ...rows[0], inventoryLogs }) };
}

const buildValues = (b: any) => {
  const values: any = {};
  if (b.name !== undefined) values.name = String(b.name).trim();
  if (b.sku !== undefined) values.sku = b.sku || null;
  // category_id is NOT NULL — only overwrite it when we actually got one,
  // otherwise a partial update would fail the constraint.
  if (b.categoryId) values.categoryId = b.categoryId;
  if (b.brandId !== undefined) values.brandId = b.brandId || null;
  if (b.sourceId !== undefined) values.sourceId = b.sourceId || null;
  if (b.brand !== undefined) values.brand = b.brand || null;
  if (b.description !== undefined) values.description = b.description || null;
  if (b.shortDescription !== undefined) values.shortDescription = b.shortDescription || null;
  if (b.subCategory !== undefined) values.subCategory = b.subCategory || null;
  if (b.productType !== undefined) values.productType = b.productType || 'Simple';
  if (b.status !== undefined) values.status = b.status || 'Draft';
  if (b.supplier !== undefined) values.supplier = b.supplier || null;
  if (b.source !== undefined) values.source = b.source || null;
  if (b.excludeFromSubscription !== undefined) values.excludeFromSubscription = !!b.excludeFromSubscription;
  if (b.tags !== undefined) values.tags = stringifyMaybe(b.tags);
  if (b.attributes !== undefined) values.attributes = stringifyMaybe(b.attributes);
  if (b.variations !== undefined) values.variations = stringifyMaybe(b.variations);
  if (b.galleryImages !== undefined) values.galleryImages = stringifyMaybe(b.galleryImages);
  if (b.seoSlug !== undefined) values.seoSlug = b.seoSlug || null;
  if (b.metaTitle !== undefined) values.metaTitle = b.metaTitle || null;
  if (b.metaDescription !== undefined) values.metaDescription = b.metaDescription || null;
  if (b.metaKeywords !== undefined) values.metaKeywords = b.metaKeywords || null;
  if (b.price !== undefined) values.price = String(b.price);
  if (b.costPrice !== undefined) values.costPrice = String(b.costPrice ?? 0);
  if (b.compareAtPrice !== undefined) values.compareAtPrice = b.compareAtPrice == null ? null : String(b.compareAtPrice);
  if (b.imageUrl !== undefined) values.imageUrl = b.imageUrl || null;
  if (b.stock !== undefined) values.stock = Number(b.stock) || 0;
  if (b.isActive !== undefined) values.isActive = b.isActive !== false;
  return values;
};

export async function createProduct(b: any) {
  const name = String(b.name || '').trim();
  if (!name) return { error: 'Name is required', status: 400 };
  if (!b.categoryId) return { error: 'Category is required', status: 400 };
  if (b.price === undefined || b.price === null) return { error: 'Price is required', status: 400 };

  const baseSlug = toSlug(b.seoSlug || name);
  let slug = baseSlug;
  const exists = await db.select().from(products).where(eq(products.slug, slug));
  if (exists.length) slug = `${baseSlug}-${Date.now().toString(36)}`;

  const values = buildValues(b);
  values.name = name;
  values.slug = slug;
  if (values.price === undefined) values.price = '0';
  if (values.costPrice === undefined) values.costPrice = '0';

  const row = await db.insert(products).values(values).returning();
  return { product: await decorateProduct(row[0]), status: 201 };
}

export async function updateProduct(id: string, b: any) {
  const values = buildValues(b);
  if (b.name !== undefined) values.slug = toSlug(b.seoSlug || String(b.name));
  if (!Object.keys(values).length) {
    const current = await db.select().from(products).where(eq(products.id, id));
    if (!current.length) return { error: 'Product not found', status: 404 };
    return { product: await decorateProduct(current[0]) };
  }

  const row = await db.update(products).set(values).where(eq(products.id, id)).returning();
  if (!row.length) return { error: 'Product not found', status: 404 };
  return { product: await decorateProduct(row[0]) };
}

export async function deleteProduct(id: string) {
  const row = await db.delete(products).where(eq(products.id, id)).returning();
  if (!row.length) return { error: 'Product not found', status: 404 };

  // Detach the product's images. This was a DELETE to media-service
  // authenticated with `x-internal-key`; media is a module in this process now.
  try {
    await deleteLinksByEntity('product', id);
  } catch (error) {
    console.error('Failed to cleanup media links for deleted product:', error);
  }

  return { success: true };
}

/**
 * Apply one action to many products in a single round trip.
 *
 * The list page lets an admin tick 30 rows and archive them at once. Doing that
 * as 30 sequential PUTs is slow, partially-applied if one fails, and 30 audit
 * entries. This is one statement.
 *
 * Media links are cleaned up per product on delete, matching `deleteProduct`.
 */
export async function bulkUpdateProducts(
  ids: string[],
  action: 'publish' | 'draft' | 'archive' | 'delete',
  extra?: { categoryId?: string },
) {
  const unique = [...new Set((ids ?? []).filter(Boolean))];
  if (unique.length === 0) return { error: 'No products selected', status: 400 };
  if (unique.length > 200) return { error: 'Select at most 200 products at a time', status: 400 };

  if (action === 'delete') {
    const removed = await db.delete(products).where(inArray(products.id, unique)).returning({ id: products.id });
    await Promise.all(
      removed.map((r) =>
        deleteLinksByEntity('product', r.id).catch((e) =>
          console.error('Failed to cleanup media links for deleted product:', e),
        ),
      ),
    );
    return { affected: removed.length, action };
  }


  const values =
    action === 'publish'
      ? { status: 'Published', isActive: true }
      : action === 'draft'
        ? { status: 'Draft', isActive: false }
        : { status: 'Archived', isActive: false };

  const updated = await db
    .update(products)
    .set(extra?.categoryId ? { ...values, categoryId: extra.categoryId } : values)
    .where(inArray(products.id, unique))
    .returning({ id: products.id });

  return { affected: updated.length, action };
}

/** Move many products into one category. */
export async function bulkRecategoriseProducts(ids: string[], categoryId: string) {
  const unique = [...new Set((ids ?? []).filter(Boolean))];
  if (unique.length === 0) return { error: 'No products selected', status: 400 };
  if (!categoryId) return { error: 'categoryId is required', status: 400 };

  const updated = await db
    .update(products)
    .set({ categoryId })
    .where(inArray(products.id, unique))
    .returning({ id: products.id });

  return { affected: updated.length, action: 'categorise' };
}
