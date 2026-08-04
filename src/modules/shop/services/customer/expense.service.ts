import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/shared/db';
import { expenses } from '@/shared/db/schema';

export async function listExpenses(userId: string, q: any){ const conditions = [eq(expenses.userId, userId)] as any[]; if (q.petId) conditions.push(eq(expenses.petId, q.petId)); if (q.category) conditions.push(eq(expenses.category, q.category)); const result = await db.select().from(expenses).where(and(...conditions)).orderBy(desc(expenses.date)); return { expenses: result }; }
export async function createExpense(userId: string, b: any){ const result = await db.insert(expenses).values({ userId, petId: b.petId, amount: b.amount, category: b.category, date: b.date, description: b.description }).returning(); return { message: 'Expense recorded', expense: result[0] }; }
export async function deleteExpense(userId: string, id: string){ const result = await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.userId, userId))).returning(); if (!result.length) return { error: 'Expense not found', status: 404 }; return { message: 'Expense deleted' }; }
