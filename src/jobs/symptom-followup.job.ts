/**
 * Symptom Follow-up Job — runs hourly.
 *
 * The AI triages symptoms well and then, until now, forgot about them. This
 * closes the loop: a day or two after "she's been limping", it asks whether the
 * limp got better. That single question is what turns triage into care — it
 * catches the cases that quietly worsened, and it is the natural moment to
 * offer a vet booking.
 *
 * One follow-up per report. If the owner never answers, we do not ask twice.
 */

import { and, eq, isNull, lte } from 'drizzle-orm';
import { db } from '@/shared/db';
import { pets, symptomReports } from '@/shared/db/schema';
import { can } from '@/modules/subscriptions/entitlements';
import { AiService } from '@/modules/ai/service';
import { sendProactive } from './shared/proactive';

const MAX_PER_RUN = 50;

export type SymptomFollowupOptions = { onlyUserId?: string; nowIso?: string };

export async function runSymptomFollowupJob(opts: SymptomFollowupOptions = {}) {
  const now = opts.nowIso ? new Date(opts.nowIso) : new Date();

  let due = await db
    .select({
      id: symptomReports.id,
      userId: symptomReports.userId,
      petId: symptomReports.petId,
      symptoms: symptomReports.symptoms,
      urgency: symptomReports.urgency,
      shouldSeeVet: symptomReports.shouldSeeVet,
    })
    .from(symptomReports)
    .where(
      and(
        isNull(symptomReports.followedUpAt),
        isNull(symptomReports.resolvedAt),
        lte(symptomReports.followUpAt, now),
      ),
    )
    .limit(MAX_PER_RUN);

  if (opts.onlyUserId) due = due.filter((r) => r.userId === opts.onlyUserId);
  if (!due.length) return { followedUp: 0, due: 0 };

  let followedUp = 0;
  for (const report of due) {
    // Mark first: a crash mid-send must not produce a second ask on the next
    // tick. A missed follow-up is a smaller failure than a nagging one.
    await db
      .update(symptomReports)
      .set({ followedUpAt: new Date() })
      .where(eq(symptomReports.id, report.id));

    if (!(await can(report.userId, 'ai_chat'))) continue;

    const petName = await getPetName(report.petId);
    const who = petName ?? 'তোমার পোষা প্রাণী';
    const urgent = report.urgency === 'high' || report.urgency === 'emergency';

    const fallback = urgent
      ? `${who}-এর "${report.symptoms}" নিয়ে কথা হয়েছিল। এখন অবস্থা কেমন? খারাপ হলে বলো, আমি এখনই vet-এর appointment দেখে দিচ্ছি।`
      : `${who}-এর "${report.symptoms}" নিয়ে জিজ্ঞেস করেছিলে। এখন কি একটু ভালো, নাকি একই রকম আছে?`;

    const message = await AiService.generateProactiveMessage({
      userId: report.userId,
      petId: report.petId ?? undefined,
      feature: 'symptom_followup',
      fallback,
      task: `Earlier the owner reported these symptoms: "${report.symptoms}" (assessed urgency: ${report.urgency}${report.shouldSeeVet ? ', a vet visit was advised' : ''}). Write ONE follow-up message asking how the pet is doing now — better, the same, or worse. ${urgent ? 'Make clear you can book a vet appointment right away if it has not improved.' : 'Offer to help if it has not improved.'}`,
    });

    await sendProactive({
      userId: report.userId,
      petId: report.petId,
      messageType: 'health_alert',
      message,
      pushTitle: petName ? `How is ${petName}?` : 'How is your pet?',
      type: 'HEALTH_ALERT',
      priority: urgent ? 'critical' : 'normal',
      data: { event: 'symptom_followup', symptomReportId: report.id, ...(report.petId ? { petId: report.petId } : {}) },
    });

    followedUp++;
  }

  return { followedUp, due: due.length };
}

async function getPetName(petId: string | null): Promise<string | null> {
  if (!petId) return null;
  const [row] = await db.select({ name: pets.name }).from(pets).where(eq(pets.id, petId)).limit(1);
  return row?.name ?? null;
}
