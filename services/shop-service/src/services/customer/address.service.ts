import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { addresses } from '../../db/schema';

export async function listAddresses(userId: string){
  const result = await db.select().from(addresses).where(eq(addresses.userId, userId)).orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
  return { addresses: result };
}

export async function createAddress(userId: string, b: any){
  const existing = await db.select({ count: sql<number>`count(*)` }).from(addresses).where(eq(addresses.userId, userId));
  const shouldBeDefault = b.isDefault === true || Number(existing[0]?.count || 0) === 0;
  if (shouldBeDefault) await db.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, userId));
  const result = await db.insert(addresses).values({ userId, label:b.label, fullName:b.fullName, phone:b.phone, line1:b.line1, line2:b.line2, city:b.city, state:b.state, postalCode:b.postalCode, country:b.country || 'Bangladesh', isDefault: shouldBeDefault }).returning();
  return { message: 'Address created', address: result[0] };
}

export async function updateAddress(userId: string, id: string, b: any){
  const existingAddress = await db.select().from(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, userId)));
  if (!existingAddress.length) return { error: 'Address not found', status: 404 };
  if (b.isDefault === true) await db.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, userId));
  const updateData: any = { label:b.label, fullName:b.fullName, phone:b.phone, line1:b.line1, line2:b.line2, city:b.city, state:b.state, postalCode:b.postalCode, country:b.country };
  if (b.isDefault !== undefined) updateData.isDefault = b.isDefault;
  const result = await db.update(addresses).set(updateData).where(and(eq(addresses.id, id), eq(addresses.userId, userId))).returning();
  return { message: 'Address updated', address: result[0] };
}

export async function deleteAddress(userId: string, id: string){
  const existingAddress = await db.select().from(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, userId)));
  if (!existingAddress.length) return { error: 'Address not found', status: 404 };
  const wasDefault = existingAddress[0].isDefault === true;
  await db.delete(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, userId)));
  if (wasDefault) {
    const remaining = await db.select().from(addresses).where(eq(addresses.userId, userId)).orderBy(desc(addresses.createdAt));
    if (remaining.length) await db.update(addresses).set({ isDefault: true }).where(eq(addresses.id, remaining[0].id));
  }
  return { message: 'Address deleted' };
}

export async function setDefaultAddress(userId: string, id: string){
  const existingAddress = await db.select().from(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, userId)));
  if (!existingAddress.length) return { error: 'Address not found', status: 404 };
  await db.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, userId));
  const result = await db.update(addresses).set({ isDefault: true }).where(and(eq(addresses.id, id), eq(addresses.userId, userId))).returning();
  return { message: 'Default address updated', address: result[0] };
}
