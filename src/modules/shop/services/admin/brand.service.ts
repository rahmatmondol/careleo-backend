import { asc, eq } from 'drizzle-orm';
import { db } from '@/shared/db';
import { productBrands } from '@/shared/db/schema';
import { toSlug } from '../../utils/common';
import { deleteLinksByEntity } from '@/modules/media/handlers/media.manage';

export async function listBrands() {
  const rows = await db.select().from(productBrands).orderBy(asc(productBrands.name));
  return { brands: rows };
}

export async function createBrand(b: any) {
  const slug = toSlug(String(b.name));
  const exists = await db.select().from(productBrands).where(eq(productBrands.slug, slug));
  if (exists.length) return { error: 'Brand already exists', status: 409 };
  const row = await db.insert(productBrands).values({ name: b.name, slug, description: b.description, logo: b.logo, website: b.website, email: b.email, phone: b.phone, isFeatured: !!b.isFeatured, isActive: b.isActive !== false }).returning();
  return { brand: row[0], status: 201 };
}

export async function updateBrand(id: string, b: any) {
  const updates: any = { ...b, updatedAt: new Date() };
  if (b.name) updates.slug = toSlug(String(b.name));
  const row = await db.update(productBrands).set(updates).where(eq(productBrands.id, id)).returning();
  if (!row.length) return { error: 'Brand not found', status: 404 };
  return { brand: row[0] };
}

export async function deleteBrand(id: string) {
  const row = await db.delete(productBrands).where(eq(productBrands.id, id)).returning();
  if (!row.length) return { error: 'Brand not found', status: 404 };

  // Detach the brand's images. This was a DELETE to media-service authenticated
  // with `x-internal-key`; media is a module in this process now.
  try {
    await deleteLinksByEntity('brand', id);
  } catch (error) {
    console.error('Failed to cleanup media links for deleted brand:', error);
  }

  return { success: true };
}
