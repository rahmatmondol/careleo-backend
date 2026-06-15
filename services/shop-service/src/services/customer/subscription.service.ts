import { desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { productSubscriptions } from '../../db/schema';

export async function createSubscription(userId: string, b: any){ const nextDate = new Date(); nextDate.setDate(nextDate.getDate() + b.frequencyDays); const result = await db.insert(productSubscriptions).values({ userId, productId: b.productId, frequencyDays: b.frequencyDays, nextOrderDate: nextDate.toISOString().split('T')[0] }).returning(); return { message: 'Subscription created', subscription: result[0] }; }
export async function listSubscriptions(userId: string){ const result = await db.select().from(productSubscriptions).where(eq(productSubscriptions.userId, userId)).orderBy(desc(productSubscriptions.createdAt)); return { subscriptions: result }; }
export async function updateSubscription(id: string, b: any){ const updateData: any = {}; if (b.frequencyDays) updateData.frequencyDays = b.frequencyDays; if (b.isActive !== undefined) updateData.isActive = b.isActive; const result = await db.update(productSubscriptions).set(updateData).where(eq(productSubscriptions.id, id)).returning(); return { message: 'Subscription updated', subscription: result[0] }; }
export async function deleteSubscription(id: string){ await db.delete(productSubscriptions).where(eq(productSubscriptions.id, id)); return { message: 'Subscription cancelled' }; }
