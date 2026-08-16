/**
 * Vaccine-Due Alert Job — runs daily-ish (hourly tick).
 *
 * Finds vaccinations whose dueAt has arrived (status 'due') for users entitled
 * to vaccination_mgmt, and sends a proactive "vaccine due — book a vet?" message
 * + push. Per-vaccination 1/day cap via lastRemindedAt.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/shared/db';
import { pets } from '@/shared/db/schema';
import { aiChatSessions, aiChatMessages, aiProactiveMessages } from '@/shared/db/schema/ai.schema';
import { can } from '@/modules/subscriptions/entitlements';
import { VaccinationsModel } from '@/modules/vaccinations/model';
import { deliverToUser } from '@/modules/notifications/deliver';

const MAX_PER_RUN = 100;

export type VaccineDueOptions = { onlyUserId?: string; nowIso?: string };

export async function runVaccineDueJob(opts: VaccineDueOptions = {}) {
  const now = new Date();
  const cutoffIso = opts.nowIso ?? now.toISOString();
  const dayAgoMs = now.getTime() - 24 * 60 * 60 * 1000;

  let due = await VaccinationsModel.findDue(cutoffIso);
  if (opts.onlyUserId) due = due.filter((v) => v.userId === opts.onlyUserId);

  let reminded = 0;
  for (const vac of due) {
    if (reminded >= MAX_PER_RUN) break;

    // Per-vaccination 1/day cap.
    if (vac.lastRemindedAt && new Date(vac.lastRemindedAt).getTime() > dayAgoMs) continue;

    // Entitlement.
    if (!(await can(vac.userId, 'vaccination_mgmt'))) continue;

    const [pet] = await db.select({ id: pets.id, name: pets.name }).from(pets).where(eq(pets.id, vac.petId)).limit(1);
    const petName = pet?.name ?? 'your pet';
    const message = `${petName}-এর ${vac.vaccineName} ভ্যাকসিন due হয়ে গেছে। চাইলে আমি একজন vet-এর appointment book করে দিতে পারি।`;

    const session = await getOrCreateSession(vac.userId, vac.petId);
    await db.insert(aiChatMessages).values({ sessionId: session.id, role: 'assistant', content: message, isProactive: true });
    await db.update(aiChatSessions).set({ updatedAt: now }).where(eq(aiChatSessions.id, session.id));
    await db.insert(aiProactiveMessages).values({
      userId: vac.userId,
      petId: vac.petId,
      messageType: 'health_alert',
      chatSentAt: now,
      pushSentAt: now,
    });
    await VaccinationsModel.update(vac.id, { lastRemindedAt: now });

    try {
      await deliverToUser(vac.userId, {
        title: 'Careleo',
        body: message,
        type: 'VACCINE_DUE',
        data: { event: 'vaccine_due', petId: vac.petId, vaccinationId: vac.id },
      });
    } catch (e: any) {
      console.warn('[vaccine-due] push failed for user', vac.userId, e?.message ?? e);
    }
    reminded++;
  }

  return { reminded, due: due.length };
}

async function getOrCreateSession(userId: string, petId: string) {
  const existing = await db
    .select({ id: aiChatSessions.id })
    .from(aiChatSessions)
    .where(eq(aiChatSessions.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0];
  const rows = await db
    .insert(aiChatSessions)
    .values({ userId, petId, title: 'Careleo AI', isAdminSession: false })
    .returning({ id: aiChatSessions.id });
  return rows[0]!;
}
