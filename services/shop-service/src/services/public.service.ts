import { and, desc, eq, like, sql } from 'drizzle-orm';
import { db } from '../db';
import { categories, products } from '../db/schema';

export async function listCategories() {
  const result = await db.select().from(categories).orderBy(categories.name);
  return { categories: result };
}

export async function listProducts(query: any) {
  const conditions = [eq(products.isActive, true)] as any[];
  if (query.categoryId) conditions.push(eq(products.categoryId, query.categoryId));
  if (query.search) conditions.push(like(products.name, `%${query.search}%`));

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const offset = (page - 1) * limit;

  const result = await db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(desc(products.createdAt))
    .limit(limit)
    .offset(offset);

  const total = (await db.select({ count: sql<number>`count(*)` }).from(products).where(and(...conditions)))[0].count;

  return { products: result, total, page, limit };
}

export async function getProductById(id: string) {
  const result = await db.select().from(products).where(eq(products.id, id));
  return result[0] || null;
}
