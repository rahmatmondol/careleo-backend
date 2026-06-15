import { db } from '../db';
import { videoSessions } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';

export async function getSessions(userId: string, query?: { status?: string }) {
  const conditions: any[] = [eq(videoSessions.userId, userId)];
  if (query?.status) conditions.push(eq(videoSessions.status, query.status));

  const sessions = await db
    .select()
    .from(videoSessions)
    .where(and(...conditions))
    .orderBy(desc(videoSessions.startedAt))
    .limit(100);
  return sessions;
}

export async function getSession(userId: string, id: string) {
  const [session] = await db
    .select()
    .from(videoSessions)
    .where(and(eq(videoSessions.id, id), eq(videoSessions.userId, userId)))
    .limit(1);
  return session || null;
}

export async function endSession(userId: string, id: string) {
  const [session] = await db
    .select()
    .from(videoSessions)
    .where(and(eq(videoSessions.id, id), eq(videoSessions.userId, userId)))
    .limit(1);
  if (!session) return null;

  const [updated] = await db
    .update(videoSessions)
    .set({
      status: 'ENDED',
      endedAt: new Date(),
    })
    .where(eq(videoSessions.id, id))
    .returning();
  return updated;
}
