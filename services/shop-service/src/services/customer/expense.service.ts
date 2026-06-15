import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { expenses } from '../../db/schema';

export async function listExpenses(userId: string, q: any){ const conditions = [eq(expenses.userId, userId)] as any[]; if (q.petId) conditions.push(eq(expenses.petId, q.petId)); if (q.category) conditions.push(eq(expenses.category, q.category)); const result = await db.select().from(expenses).where(and(...conditions)).orderBy(desc(expenses.date)); return { expenses: result }; }
export async function createExpense(userId: string, b: any){ const result = await db.insert(expenses).values({ userId, petId: b.petId, amount: b.amount, category: b.category, date: b.date, description: b.description }).returning(); return { message: 'Expense recorded', expense: result[0] }; }
export async function deleteExpense(id: string){ await db.delete(expenses).where(eq(expenses.id, id)); return { message: 'Expense deleted' }; }
