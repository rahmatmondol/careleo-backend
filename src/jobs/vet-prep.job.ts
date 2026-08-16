/**
 * Vet Appointment Prep Job — runs hourly.
 *
 * Roughly a day before an appointment, send what the owner should bring and
 * do — including the things only this app knows: the medication adherence
 * figure, the symptoms reported since the booking, the current medication list.
 * Owners routinely arrive at the vet unable to answer "how often has she been
 * limping?"; this is the fix.
 *
 * One message per appointment.
 */

import { and, desc, eq, gte, isNull, lte } from 'drizzle-orm';
import { db } from '@/shared/db';
import { pets, symptomReports, vetAppointments } from '@/shared/db/schema';
import { CareInsights } from '@/modules/care/insights';
import { AiService } from '@/modules/ai/service';
import { sendProactive, sentWithin } from './shared/proactive';

/** How far ahead of the appointment to send the prep note. */
const LEAD_HOURS = 24;
/** Appointments further out than this are not our problem yet. */
const WINDOW_HOURS = 30;

const MAX_PER_RUN = 50;

export type VetPrepOptions = { onlyUserId?: string };

export async function runVetPrepJob(opts: VetPrepOptions = {}) {
  const now = new Date();
  const from = new Date(now.getTime() + (LEAD_HOURS - 1) * 60 * 60 * 1000);
  const to = new Date(now.getTime() + WINDOW_HOURS * 60 * 60 * 1000);

  // `appointment_at` is stored as text, so the range is compared as ISO strings
  // — which sorts correctly for ISO-8601 and avoids a cast on every row.
  let upcoming = await db
    .select({
      id: vetAppointments.id,
      userId: vetAppointments.userId,
      petId: vetAppointments.petId,
      type: vetAppointments.type,
      appointmentAt: vetAppointments.appointmentAt,
      reason: vetAppointments.reason,
    })
    .from(vetAppointments)
    .where(
      and(
        eq(vetAppointments.status, 'scheduled'),
        gte(vetAppointments.appointmentAt, from.toISOString()),
        lte(vetAppointments.appointmentAt, to.toISOString()),
      ),
    )
    .limit(MAX_PER_RUN);

  if (opts.onlyUserId) upcoming = upcoming.filter((a) => a.userId === opts.onlyUserId);
  if (!upcoming.length) return { prepared: 0, upcoming: 0 };

  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  let prepared = 0;
  for (const appointment of upcoming) {
    // The message type is shared, so the cap is per user per day — with one
    // appointment in the window that is exactly one prep note.
    if (await sentWithin(appointment.userId, `vet_prep:${appointment.id}`, dayAgo)) continue;

    const petName = await getPetName(appointment.petId);
    const facts = await gatherFacts(appointment.userId, appointment.petId, dayAgo);

    const when = formatWhen(appointment.appointmentAt);
    const fallback = [
      `${petName ?? 'তোমার পোষা প্রাণী'}-এর vet appointment ${when}.`,
      'সাথে নিও: vaccination card, এখন যেসব ওষুধ চলছে তার list, আর সাম্প্রতিক কোনো report.',
      facts.adherenceLine,
      facts.symptomLine,
    ]
      .filter(Boolean)
      .join(' ');

    const message = await AiService.generateProactiveMessage({
      userId: appointment.userId,
      petId: appointment.petId ?? undefined,
      feature: 'vet_prep',
      fallback,
      task: `The owner has a vet appointment ${when}${appointment.reason ? ` about: ${appointment.reason}` : ''}. Write ONE preparation message: what to bring (vaccination record, current medication list, recent reports) and what to be ready to tell the vet. Include these specifics if they are non-empty — ${facts.modelContext || 'none available'}. Three short lines at most.`,
    });

    await sendProactive({
      userId: appointment.userId,
      petId: appointment.petId,
      messageType: `vet_prep:${appointment.id}`,
      message,
      pushTitle: petName ? `${petName}'s vet visit ${when}` : `Vet visit ${when}`,
      pushBody: 'Tap for what to bring and what to mention',
      type: 'VET_APPOINTMENT',
      priority: 'normal',
      data: {
        event: 'vet_prep',
        appointmentId: appointment.id,
        ...(appointment.petId ? { petId: appointment.petId } : {}),
      },
    });

    prepared++;
  }

  return { prepared, upcoming: upcoming.length };
}

async function getPetName(petId: string | null): Promise<string | null> {
  if (!petId) return null;
  const [row] = await db.select({ name: pets.name }).from(pets).where(eq(pets.id, petId)).limit(1);
  return row?.name ?? null;
}

/** The things the owner would otherwise have to remember unaided. */
async function gatherFacts(userId: string, petId: string | null, since: Date) {
  let adherenceLine = '';
  let symptomLine = '';
  const modelBits: string[] = [];

  try {
    const adherence = await CareInsights.medicationAdherence(userId, { days: 30, petId: petId ?? undefined });
    const forPet = adherence.pets[0];
    if (forPet?.adherence !== null && forPet !== undefined) {
      adherenceLine = `গত ৩০ দিনে ওষুধ ঠিক সময়ে দেওয়া হয়েছে ${forPet.adherence}% (${forPet.doses} dose).`;
      modelBits.push(`medication adherence over the last 30 days: ${forPet.adherence}% of ${forPet.doses} doses on time`);
    }
  } catch {}

  try {
    const conditions = [gte(symptomReports.createdAt, since), isNull(symptomReports.resolvedAt)];
    if (petId) conditions.push(eq(symptomReports.petId, petId));
    const recent = await db
      .select({ symptoms: symptomReports.symptoms, urgency: symptomReports.urgency, createdAt: symptomReports.createdAt })
      .from(symptomReports)
      .where(and(...conditions))
      .orderBy(desc(symptomReports.createdAt))
      .limit(3);

    if (recent.length) {
      const list = recent.map((r) => r.symptoms).join('; ');
      symptomLine = `Vet-কে বলতে ভুলো না: ${list}.`;
      modelBits.push(`unresolved symptoms the owner reported recently: ${list}`);
    }
  } catch {}

  return { adherenceLine, symptomLine, modelContext: modelBits.join('; ') };
}

/** Appointments are stored as text; show something sensible whatever it holds. */
function formatWhen(appointmentAt: string): string {
  const date = new Date(appointmentAt);
  if (Number.isNaN(date.getTime())) return 'soon';
  return `on ${date.toDateString()}`;
}
