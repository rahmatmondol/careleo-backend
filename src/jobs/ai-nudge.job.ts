/**
 * AI Nudge Job — runs every 2 hours.
 *
 * Picks up the tasks `task-checker` handed off (open long after the push ladder
 * finished) and continues them in chat instead of on the lock screen: one
 * message, once, per task. The user can reply — "he wouldn't eat", "I did it
 * already" — which is a conversation a push notification can never have.
 *
 * The accompanying push is a single AI-category notification that respects the
 * user's quiet hours; without it the chat message sat unseen until the next
 * time they happened to open the app.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/shared/db';
import { pets, tasks } from '@/shared/db/schema';
import { aiProactiveMessages } from '@/shared/db/schema/ai.schema';
import { AiService } from '@/modules/ai/service';
import { sendProactive } from './shared/proactive';

const MAX_PER_RUN = 50;

export async function runAiNudgeJob() {
  const now = new Date();

  const pendingNudges = await db
    .select({
      id: aiProactiveMessages.id,
      userId: aiProactiveMessages.userId,
      petId: aiProactiveMessages.petId,
      taskId: aiProactiveMessages.taskId,
    })
    .from(aiProactiveMessages)
    .where(
      and(
        eq(aiProactiveMessages.messageType, 'task_overdue'),
        isNull(aiProactiveMessages.chatSentAt),
        isNull(aiProactiveMessages.actionTakenAt),
      ),
    )
    .limit(MAX_PER_RUN);

  if (pendingNudges.length === 0) return { nudged: 0 };

  let nudged = 0;
  for (const nudge of pendingNudges) {
    if (!nudge.taskId) continue;

    const [task] = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        petId: tasks.petId,
        isCompleted: tasks.isCompleted,
        skippedAt: tasks.skippedAt,
      })
      .from(tasks)
      .where(eq(tasks.id, nudge.taskId))
      .limit(1);

    if (!task || task.isCompleted || task.skippedAt) {
      // Done, skipped on purpose, or deleted in the meantime — close the loop
      // and say nothing.
      await db
        .update(aiProactiveMessages)
        .set({ actionTakenAt: now })
        .where(eq(aiProactiveMessages.id, nudge.id));
      continue;
    }

    const petName = await getPetName(task.petId ?? nudge.petId);
    const petId = task.petId ?? nudge.petId;

    // AI-written, so it can draw on what it knows — the diet, the condition,
    // the fact that this owner works nights — instead of a rotating template.
    const message = await AiService.generateProactiveMessage({
      userId: nudge.userId,
      petId: petId ?? undefined,
      feature: 'task_nudge',
      fallback: buildNudgeMessage(task.title, petName),
      task: `The owner has not completed the task "${task.title}" long after it was due, and the reminder notifications have already stopped. Write ONE message that asks — without scolding — whether it got done or whether something got in the way, and offer to reschedule it. If the task matters medically for this pet, say why in a clause.`,
    });

    await db
      .update(aiProactiveMessages)
      .set({ chatSentAt: now, pushSentAt: now })
      .where(eq(aiProactiveMessages.id, nudge.id));

    await sendProactive({
      userId: nudge.userId,
      petId,
      messageType: 'task_nudge',
      message,
      type: 'AI_ASSISTANT',
      priority: 'low',
      data: { event: 'ai_nudge', taskId: task.id },
    });

    nudged++;
  }

  return { nudged };
}

async function getPetName(petId: string | null): Promise<string | null> {
  if (!petId) return null;
  const [row] = await db.select({ name: pets.name }).from(pets).where(eq(pets.id, petId)).limit(1);
  return row?.name ?? null;
}

function buildNudgeMessage(taskTitle: string, petName: string | null): string {
  const who = petName ? `${petName}-এর ` : '';
  const templates = [
    `${who}"${taskTitle}" task টা এখনো complete হয়নি দেখলাম। সব ঠিক আছে তো? করা হয়ে গেলে আমাকে বললেই mark করে দেব।`,
    `${who}"${taskTitle}" এখনো pending। কোনো সমস্যা হচ্ছে, নাকি সময় পাওনি? চাইলে আমি সময়টা বদলে দিতে পারি।`,
    `${who}"${taskTitle}" নিয়ে একটু জানতে চাচ্ছিলাম — হয়েছে কি? না হলে কবে করবে বলো, আমি সেই মতো reminder সাজিয়ে দিই।`,
  ];
  return templates[Math.floor(Math.random() * templates.length)]!;
}
