import { db } from '../db';
import { videoConsultations } from '../db/schema';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import type { CreateConsultationInput } from '../types';

export async function getConsultations(userId: string, query?: { status?: string; vetId?: string }) {
  const conditions: any[] = [eq(videoConsultations.userId, userId)];
  if (query?.status) conditions.push(eq(videoConsultations.status, query.status));
  if (query?.vetId) conditions.push(eq(videoConsultations.vetId, query.vetId));

  const consultations = await db
    .select()
    .from(videoConsultations)
    .where(and(...conditions))
    .orderBy(desc(videoConsultations.scheduledAt))
    .limit(100);
  return consultations;
}

export async function getConsultation(userId: string, id: string) {
  const [consultation] = await db
    .select()
    .from(videoConsultations)
    .where(and(eq(videoConsultations.id, id), eq(videoConsultations.userId, userId)))
    .limit(1);
  return consultation || null;
}

export async function createConsultation(userId: string, input: CreateConsultationInput) {
  const [consultation] = await db
    .insert(videoConsultations)
    .values({
      userId,
      vetId: input.vetId,
      petId: input.petId || null,
      scheduledAt: new Date(input.scheduledAt),
      notes: input.notes || null,
      status: 'SCHEDULED',
    })
    .returning();
  return consultation;
}

export async function startConsultation(userId: string, id: string) {
  const [consultation] = await db
    .select()
    .from(videoConsultations)
    .where(and(eq(videoConsultations.id, id), eq(videoConsultations.userId, userId)))
    .limit(1);
  if (!consultation) return null;

  const roomId = `room-${id}-${Date.now()}`;
  const [updated] = await db
    .update(videoConsultations)
    .set({
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      roomId,
    })
    .where(eq(videoConsultations.id, id))
    .returning();
  return updated;
}

export async function endConsultation(userId: string, id: string) {
  const [consultation] = await db
    .select()
    .from(videoConsultations)
    .where(and(eq(videoConsultations.id, id), eq(videoConsultations.userId, userId)))
    .limit(1);
  if (!consultation) return null;

  const [updated] = await db
    .update(videoConsultations)
    .set({
      status: 'COMPLETED',
      endedAt: new Date(),
    })
    .where(eq(videoConsultations.id, id))
    .returning();
  return updated;
}

export async function cancelConsultation(userId: string, id: string) {
  const [consultation] = await db
    .select()
    .from(videoConsultations)
    .where(and(eq(videoConsultations.id, id), eq(videoConsultations.userId, userId)))
    .limit(1);
  if (!consultation) return null;

  const [updated] = await db
    .update(videoConsultations)
    .set({
      status: 'CANCELLED',
      endedAt: new Date(),
    })
    .where(eq(videoConsultations.id, id))
    .returning();
  return updated;
}

export async function getVetSlots(_userId: string, vetId: string, date?: string) {
  // Return available time slots for a vet on a given date
  // Query existing consultations for the vet to determine booked slots
  const queryDate = date ? new Date(date) : new Date();
  const startOfDay = new Date(queryDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(queryDate);
  endOfDay.setHours(23, 59, 59, 999);

  const bookedSlots = await db
    .select({ scheduledAt: videoConsultations.scheduledAt })
    .from(videoConsultations)
    .where(
      and(
        eq(videoConsultations.vetId, vetId),
        gte(videoConsultations.scheduledAt, startOfDay),
        lte(videoConsultations.scheduledAt, endOfDay),
        eq(videoConsultations.status, 'SCHEDULED')
      )
    );

  // Generate all possible 30-min slots from 8:00 to 17:00
  const allSlots: string[] = [];
  for (let h = 8; h < 17; h++) {
    allSlots.push(`${String(h).padStart(2, '0')}:00`);
    allSlots.push(`${String(h).padStart(2, '0')}:30`);
  }

  const bookedTimes = new Set(
    bookedSlots.map((s) => {
      const d = new Date(s.scheduledAt);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    })
  );

  const availableSlots = allSlots.filter((slot) => !bookedTimes.has(slot));
  return { vetId, date: queryDate.toISOString().split('T')[0], availableSlots };
}
