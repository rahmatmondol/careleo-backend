import { asc, eq } from 'drizzle-orm';
import { db } from '@/shared/db';
import { categories } from '@/shared/db/schema';
import { toSlug } from '../../utils/common';
import { mapCategoryForAdmin } from '../../utils/mappers';
import { deleteLinksByEntity } from '@/modules/media/handlers/media.manage';

export async function listCategories() {
  const rows = await db.select().from(categories).orderBy(asc(categories.name));
  const byId = new Map(rows.map((row) => [row.id, row]));
  return { categories: rows.map((row) => mapCategoryForAdmin(row, row.parentId ? byId.get(row.parentId) : null)) };
}

export async function createCategory(b: any) {
  const categoryName = String(b.name || '').trim();
  if (!categoryName) return { error: 'Name is required', status: 400 };

  const slug = toSlug(categoryName);
  const exists = await db.select().from(categories).where(eq(categories.slug, slug));
  if (exists.length) return { error: 'Category already exists', status: 409 };

  const isActive = b.status ? String(b.status).toLowerCase() === 'active' : b.isActive !== false;
  const row = await db.insert(categories).values({
    name: categoryName,
    slug,
    description: b.description,
    imageUrl: b.imageUrl ?? b.image ?? null,
    parentId: b.parentId ?? b.parent ?? null,
    isActive,
    sortOrder: Number(b.order ?? b.sortOrder ?? 0),
  }).returning();

  const created = row[0];
  let parent = null as any;
  if (created?.parentId) {
    const p = await db.select().from(categories).where(eq(categories.id, created.parentId));
    parent = p[0] || null;
  }

  return { category: mapCategoryForAdmin(created, parent), status: 201 };
}

export async function updateCategory(id: string, b: any) {
  const updates: any = {
    description: b.description,
    imageUrl: b.imageUrl ?? b.image,
    parentId: b.parentId ?? b.parent ?? null,
    sortOrder: Number(b.order ?? b.sortOrder ?? 0),
    updatedAt: new Date(),
  };

  if (b.name !== undefined) {
    updates.name = String(b.name).trim();
    updates.slug = toSlug(String(b.name));
  }

  if (b.status !== undefined) updates.isActive = String(b.status).toLowerCase() === 'active';
  else if (b.isActive !== undefined) updates.isActive = b.isActive !== false;

  const row = await db.update(categories).set(updates).where(eq(categories.id, id)).returning();
  if (!row.length) return { error: 'Category not found', status: 404 };

  const updated = row[0];
  let parent = null as any;
  if (updated?.parentId) {
    const p = await db.select().from(categories).where(eq(categories.id, updated.parentId));
    parent = p[0] || null;
  }

  return { category: mapCategoryForAdmin(updated, parent) };
}

export async function deleteCategory(id: string) {
  const row = await db.delete(categories).where(eq(categories.id, id)).returning();
  if (!row.length) return { error: 'Category not found', status: 404 };

  // Detach the category's images. This was a DELETE to media-service
  // authenticated with `x-internal-key`; media is a module in this process now.
  try {
    await deleteLinksByEntity('category', id);
  } catch (error) {
    console.error('Failed to cleanup media links for deleted category:', error);
  }

  return { success: true };
}
