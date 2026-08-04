import { asc, eq } from 'drizzle-orm';
import { db } from '@/shared/db';
import { productAttributes, productAttributeValues } from '@/shared/db/schema';
import { toSlug } from '../../utils/common';

export async function listAttributes() {
  const rows = await db.select().from(productAttributes).orderBy(asc(productAttributes.name));
  const result = await Promise.all(rows.map(async (a) => {
    const values = await db
      .select()
      .from(productAttributeValues)
      .where(eq(productAttributeValues.attributeId, a.id))
      .orderBy(asc(productAttributeValues.sortOrder));
    return { ...a, values };
  }));
  return { attributes: result };
}

export async function getAttribute(id: string) {
  const rows = await db.select().from(productAttributes).where(eq(productAttributes.id, id));
  if (!rows.length) return { error: 'Attribute not found', status: 404 };
  const values = await db
    .select()
    .from(productAttributeValues)
    .where(eq(productAttributeValues.attributeId, id))
    .orderBy(asc(productAttributeValues.sortOrder));
  return { attribute: { ...rows[0], values } };
}

export async function createAttribute(b: any) {
  const name = String(b.name || '').trim();
  if (!name) return { error: 'Name is required', status: 400 };
  const slug = toSlug(name);
  const exists = await db.select().from(productAttributes).where(eq(productAttributes.slug, slug));
  if (exists.length) return { error: 'Attribute already exists', status: 409 };

  const row = await db.insert(productAttributes).values({
    name,
    slug,
    code: b.code || slug,
    description: b.description || null,
    inputType: b.inputType || 'select',
    isRequired: !!b.isRequired,
    isFilterable: !!b.isFilterable,
    isVisible: b.isVisible !== false,
    isVariant: !!b.isVariant,
    isActive: b.isActive !== false,
  }).returning();
  return { attribute: { ...row[0], values: [] }, status: 201 };
}

export async function updateAttribute(id: string, b: any) {
  const updates: any = { updatedAt: new Date() };
  if (b.name !== undefined) { updates.name = String(b.name).trim(); updates.slug = toSlug(String(b.name)); }
  if (b.code !== undefined) updates.code = b.code;
  if (b.description !== undefined) updates.description = b.description;
  if (b.inputType !== undefined) updates.inputType = b.inputType;
  if (b.isRequired !== undefined) updates.isRequired = !!b.isRequired;
  if (b.isFilterable !== undefined) updates.isFilterable = !!b.isFilterable;
  if (b.isVisible !== undefined) updates.isVisible = b.isVisible !== false;
  if (b.isVariant !== undefined) updates.isVariant = !!b.isVariant;
  if (b.isActive !== undefined) updates.isActive = b.isActive !== false;

  const row = await db.update(productAttributes).set(updates).where(eq(productAttributes.id, id)).returning();
  if (!row.length) return { error: 'Attribute not found', status: 404 };
  return { attribute: row[0] };
}

export async function deleteAttribute(id: string) {
  await db.delete(productAttributeValues).where(eq(productAttributeValues.attributeId, id));
  const row = await db.delete(productAttributes).where(eq(productAttributes.id, id)).returning();
  if (!row.length) return { error: 'Attribute not found', status: 404 };
  return { success: true };
}

export async function listValues(attributeId: string) {
  const values = await db
    .select()
    .from(productAttributeValues)
    .where(eq(productAttributeValues.attributeId, attributeId))
    .orderBy(asc(productAttributeValues.sortOrder));
  return { values };
}

export async function createValue(attributeId: string, b: any) {
  const value = String(b.value ?? b.name ?? '').trim();
  if (!value) return { error: 'Value is required', status: 400 };
  const row = await db.insert(productAttributeValues).values({
    attributeId,
    value,
    label: b.label ?? b.name ?? value,
    color: b.color || null,
    sortOrder: Number(b.sortOrder ?? 0),
  }).returning();
  return { value: row[0], status: 201 };
}

export async function updateValue(attributeId: string, valueId: string, b: any) {
  const updates: any = { updatedAt: new Date() };
  if (b.value !== undefined || b.name !== undefined) updates.value = String(b.value ?? b.name).trim();
  if (b.label !== undefined || b.name !== undefined) updates.label = b.label ?? b.name;
  if (b.color !== undefined) updates.color = b.color;
  if (b.sortOrder !== undefined) updates.sortOrder = Number(b.sortOrder);
  const row = await db.update(productAttributeValues).set(updates).where(eq(productAttributeValues.id, valueId)).returning();
  if (!row.length) return { error: 'Value not found', status: 404 };
  return { value: row[0] };
}

export async function deleteValue(attributeId: string, valueId: string) {
  const row = await db.delete(productAttributeValues).where(eq(productAttributeValues.id, valueId)).returning();
  if (!row.length) return { error: 'Value not found', status: 404 };
  return { success: true };
}
