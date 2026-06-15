import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { productSources, products } from '../../db/schema';
import { toSlug } from '../../utils/common';
import { mapSourceForAdmin } from '../../utils/mappers';

export async function listSources() {
  const rows = await db.select().from(productSources).orderBy(asc(productSources.name));
  const result = await Promise.all(rows.map(async (s) => {
    const countRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(eq(products.sourceId, s.id));
    return mapSourceForAdmin(s, { productsCount: Number(countRows[0]?.count ?? 0) });
  }));
  return { sources: result };
}

const buildValues = (b: any) => {
  const values: any = {};
  if (b.name !== undefined) values.name = String(b.name).trim();
  if (b.type !== undefined || b.sourceType !== undefined) values.sourceType = b.sourceType ?? b.type ?? 'supplier';
  if (b.contactPerson !== undefined || b.contactName !== undefined) values.contactName = b.contactName ?? b.contactPerson ?? null;
  if (b.email !== undefined) values.email = b.email || null;
  if (b.phone !== undefined || b.contactPhone !== undefined) values.contactPhone = b.contactPhone ?? b.phone ?? null;
  if (b.address !== undefined) values.address = b.address || null;
  if (b.website !== undefined) values.website = b.website || null;
  if (b.taxId !== undefined) values.taxId = b.taxId || null;
  if (b.notes !== undefined) values.notes = b.notes || null;
  if (b.isPreferred !== undefined) values.isPreferred = !!b.isPreferred;
  if (b.isActive !== undefined) values.isActive = b.isActive !== false;
  return values;
};

export async function createSource(b: any) {
  const name = String(b.name || '').trim();
  if (!name) return { error: 'Name is required', status: 400 };
  const slug = toSlug(name);
  const exists = await db.select().from(productSources).where(eq(productSources.slug, slug));
  if (exists.length) return { error: 'Source already exists', status: 409 };

  const values = buildValues(b);
  values.name = name;
  values.slug = slug;
  if (!values.sourceType) values.sourceType = 'supplier';

  const row = await db.insert(productSources).values(values).returning();
  return { source: mapSourceForAdmin(row[0]), status: 201 };
}

export async function updateSource(id: string, b: any) {
  const values = buildValues(b);
  values.updatedAt = new Date();
  if (b.name !== undefined) values.slug = toSlug(String(b.name));
  const row = await db.update(productSources).set(values).where(eq(productSources.id, id)).returning();
  if (!row.length) return { error: 'Source not found', status: 404 };
  return { source: mapSourceForAdmin(row[0]) };
}

export async function deleteSource(id: string) {
  const row = await db.delete(productSources).where(eq(productSources.id, id)).returning();
  if (!row.length) return { error: 'Source not found', status: 404 };
  return { success: true };
}
