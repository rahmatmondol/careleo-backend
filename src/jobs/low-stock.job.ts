/**
 * Low-Stock Alert Job — runs hourly.
 *
 * Finds users whose pet food inventory is running low (within its threshold).
 * For Premium users with auto_reorder, places the re-order automatically and
 * sends an FYI. For others with food_inventory tracking, sends a proactive
 * "running low — want me to re-order?" message. 1/day cap per user via the
 * reorder_reminder proactive row.
 */

import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/shared/db';
import { aiChatSessions, aiChatMessages, aiProactiveMessages } from '@/shared/db/schema/ai.schema';
import { can } from '@/modules/subscriptions/entitlements';
import { FoodInventoryService, daysRemaining } from '@/modules/food-inventory/service';
import { FoodInventoryModel } from '@/modules/food-inventory/model';
import { deliverToUser } from '@/modules/notifications/deliver';

const MAX_PER_RUN = 100;

export type LowStockOptions = { onlyUserId?: string };

export async function runLowStockJob(opts: LowStockOptions = {}) {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // All low-stock items, grouped by user.
  const lowItems = await FoodInventoryModel.findLowStock(opts.onlyUserId);
  const byUser = new Map<string, typeof lowItems>();
  for (const it of lowItems) {
    if (!byUser.has(it.userId)) byUser.set(it.userId, []);
    byUser.get(it.userId)!.push(it);
  }

  let alerted = 0;
  let autoOrdered = 0;

  for (const [userId, items] of byUser) {
    if (alerted + autoOrdered >= MAX_PER_RUN) break;

    // Must have food_inventory tracking on their plan.
    if (!(await can(userId, 'food_inventory'))) continue;

    // 1/day cap.
    const [recent] = await db
      .select({ id: aiProactiveMessages.id })
      .from(aiProactiveMessages)
      .where(
        and(
          eq(aiProactiveMessages.userId, userId),
          eq(aiProactiveMessages.messageType, 'reorder_reminder'),
          gte(aiProactiveMessages.createdAt, dayAgo),
        ),
      )
      .limit(1);
    if (recent) continue;

    const auto = await can(userId, 'auto_reorder');
    const item = items[0]!; // alert on the most pressing item
    const days = Math.max(0, Math.round(daysRemaining(item)));
    const product = item.productName ?? 'food';
    let message: string;

    if (auto && item.productId) {
      // Premium: place the re-order automatically, then inform the user.
      try {
        const reorder = await FoodInventoryService.requestReorder(userId, item.id, 1);
        if (reorder.status === 'auto_placed') {
          autoOrdered++;
          message = `${product} ফুরিয়ে আসছিল (~${days} দিন বাকি), তাই আমি অটো রি-অর্ডার করে দিয়েছি। ✅`;
        } else {
          message = `${product} প্রায় শেষ (~${days} দিন বাকি)। রি-অর্ডার করতে চেষ্টা করেছি — একটু পরে আবার দেখব।`;
        }
      } catch {
        message = `${product} প্রায় শেষ (~${days} দিন বাকি)। রি-অর্ডার করতে চাও?`;
      }
    } else {
      message = `${product} প্রায় শেষ (~${days} দিন বাকি)। আমি কি আগের মতো আবার অর্ডার করে দেব?`;
      alerted++;
    }

    const session = await getOrCreateSession(userId, item.petId);
    await db.insert(aiChatMessages).values({
      sessionId: session.id,
      role: 'assistant',
      content: message,
      isProactive: true,
    });
    await db.update(aiChatSessions).set({ updatedAt: now }).where(eq(aiChatSessions.id, session.id));
    await db.insert(aiProactiveMessages).values({
      userId,
      petId: item.petId,
      messageType: 'reorder_reminder',
      chatSentAt: now,
      pushSentAt: now,
    });

    try {
      await deliverToUser(userId, {
        title: 'Careleo',
        body: message,
        type: 'LOW_STOCK',
        priority: 'low',
        data: { event: 'low_stock' },
      });
    } catch (e: any) {
      console.warn('[low-stock] push failed for user', userId, e?.message ?? e);
    }
  }

  return { alerted, autoOrdered, lowUsers: byUser.size };
}

async function getOrCreateSession(userId: string, petId: string) {
  const existing = await db
    .select({ id: aiChatSessions.id })
    .from(aiChatSessions)
    .where(and(eq(aiChatSessions.userId, userId), eq(aiChatSessions.isAdminSession, false)))
    .limit(1);
  if (existing[0]) return existing[0];
  const rows = await db
    .insert(aiChatSessions)
    .values({ userId, petId, title: 'Careleo AI', isAdminSession: false })
    .returning({ id: aiChatSessions.id });
  return rows[0]!;
}
