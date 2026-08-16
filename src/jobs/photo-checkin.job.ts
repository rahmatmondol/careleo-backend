/**
 * Photo Check-in Job — runs hourly, asks once a fortnight per pet.
 *
 * Weight loss, a dull coat, a swelling, a limp — the things owners notice far
 * too late are all visible in a photo, and the app already has vision
 * (`analyzePetImage`). What it never had was a reason for the owner to take the
 * picture. So we ask, on a slow cadence, and the reply flows into the normal
 * chat where the vision path and the fact extractor pick it up.
 *
 * Deliberately gentle: fortnightly, silent channel, never twice in a row for
 * a pet whose owner ignored the last one within the same cycle.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/shared/db';
import { pets } from '@/shared/db/schema';
import { can } from '@/modules/subscriptions/entitlements';
import { AiService } from '@/modules/ai/service';
import { FALLBACK_TZ } from '@/modules/notifications/preferences';
import { hourInZone } from '@/shared/types/timezone';
import { users } from '@/shared/db/schema';
import { sendProactive, sentWithin } from './shared/proactive';

const CADENCE_DAYS = 14;
const ASK_HOUR = 18;
const MAX_PER_RUN = 50;

export type PhotoCheckinOptions = { onlyUserId?: string; ignoreSchedule?: boolean };

export async function runPhotoCheckinJob(opts: PhotoCheckinOptions = {}) {
  const now = new Date();
  const cadenceAgo = new Date(now.getTime() - CADENCE_DAYS * 24 * 60 * 60 * 1000);

  let owners = await db.selectDistinct({ userId: pets.userId }).from(pets);
  if (opts.onlyUserId) owners = owners.filter((o) => o.userId === opts.onlyUserId);

  let asked = 0;
  for (const { userId } of owners) {
    if (asked >= MAX_PER_RUN) break;
    if (!(await can(userId, 'ai_chat'))) continue;

    if (!opts.ignoreSchedule) {
      const [user] = await db.select({ tz: users.timezone }).from(users).where(eq(users.id, userId)).limit(1);
      if (hourInZone(user?.tz || FALLBACK_TZ, now) !== ASK_HOUR) continue;
    }

    if (await sentWithin(userId, 'photo_checkin', cadenceAgo)) continue;

    const [pet] = await db
      .select({ id: pets.id, name: pets.name })
      .from(pets)
      .where(eq(pets.userId, userId))
      .orderBy(pets.createdAt)
      .limit(1);
    if (!pet) continue;

    const fallback = `${pet.name}-এর একটা আজকের ছবি পাঠাবে? আমি দেখে ওজন, চামড়া আর কোট কেমন আছে বলে দিতে পারব — আর আগের ছবির সাথে মিলিয়েও দেখব।`;

    const message = await AiService.generateProactiveMessage({
      userId,
      petId: pet.id,
      feature: 'photo_checkin',
      fallback,
      task: `Ask the owner for a fresh photo of ${pet.name} so you can check their body condition, coat and any visible changes since last time. Explain the benefit in one clause — make it feel useful, not like a chore.`,
    });

    await sendProactive({
      userId,
      petId: pet.id,
      messageType: 'photo_checkin',
      message,
      pushTitle: `A photo of ${pet.name}?`,
      type: 'AI_ASSISTANT',
      priority: 'low',
      data: { event: 'photo_checkin', petId: pet.id },
    });

    asked++;
  }

  return { asked, owners: owners.length };
}
