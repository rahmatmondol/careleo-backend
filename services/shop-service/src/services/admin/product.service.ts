import { and, desc, eq, like, sql } from 'drizzle-orm';
import { db } from '../../db';
import { products, categories } from '../../db/schema';
import { toSlug } from '../../utils/common';
import { mapProductForAdmin } from '../../utils/mappers';

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
  return { product: await decorateProduct(rows[0]) };
}

const buildValues = (b: any) => {
  const values: any = {};
  if (b.name !== undefined) values.name = String(b.name).trim();
  if (b.sku !== undefined) values.sku = b.sku || null;
  if (b.categoryId !== undefined) values.categoryId = b.categoryId || null;
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

  try {
    const mediaServiceUrl = (Bun.env.MEDIA_SERVICE_URL || 'http://media-service:3017').replace(/\/$/, '');
    await fetch(`${mediaServiceUrl}/api/v1/media/links/entity/product/${id}`, {
      method: 'DELETE',
      headers: { 'x-internal-key': Bun.env.INTERNAL_SERVICE_KEY || 'pawly-internal' },
    });
  } catch (error) {
    console.error('Failed to cleanup media links for deleted product:', error);
  }

  return { success: true };
}
