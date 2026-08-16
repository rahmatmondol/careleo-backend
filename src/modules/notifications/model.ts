import { and, desc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import {
  adminNotificationReads,
  deviceTokens,
  notificationLogs,
  orders,
  products,
  reports,
  subscriptionPlans,
  supportTickets,
  userNotifications,
  userSubscriptions,
  users,
  vetAppointments,
} from '@/shared/db/schema';

export const NotificationsModel = {
  async upsertDeviceToken(payload: { userId: string; fcmToken: string; platform: string; appVersion?: string }) {
    const existing = await db
      .select({ id: deviceTokens.id })
      .from(deviceTokens)
      .where(eq(deviceTokens.fcmToken, payload.fcmToken))
      .limit(1);

    if (existing[0]) {
      const updated = await db
        .update(deviceTokens)
        .set({
          userId: payload.userId,
          platform: payload.platform,
          appVersion: payload.appVersion,
          isActive: true,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(deviceTokens.id, existing[0].id))
        .returning();
      return updated[0] ?? null;
    }

    const inserted = await db
      .insert(deviceTokens)
      .values({
        userId: payload.userId,
        fcmToken: payload.fcmToken,
        platform: payload.platform,
        appVersion: payload.appVersion,
        isActive: true,
      })
      .returning();

    return inserted[0] ?? null;
  },

  async deactivateDeviceToken(userId: string, fcmToken: string) {
    await db
      .update(deviceTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.fcmToken, fcmToken)));
  },

  async deactivateTokens(tokens: string[]) {
    if (!tokens.length) return;
    await db
      .update(deviceTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(inArray(deviceTokens.fcmToken, tokens));
  },

  async getActiveTokensByUserIds(userIds: string[]) {
    if (!userIds.length) return [] as Array<{ userId: string; fcmToken: string; platform: string | null }>;
    // `platform` matters at send time: Android is sent data-only so the app can
    // draw the notification with action buttons, iOS is not.
    return db
      .select({ userId: deviceTokens.userId, fcmToken: deviceTokens.fcmToken, platform: deviceTokens.platform })
      .from(deviceTokens)
      .where(and(inArray(deviceTokens.userId, userIds), eq(deviceTokens.isActive, true)));
  },

  async getAllActiveTokens() {
    return db
      .select({ userId: deviceTokens.userId, fcmToken: deviceTokens.fcmToken })
      .from(deviceTokens)
      .where(eq(deviceTokens.isActive, true));
  },

  async listAllUserIds() {
    return db.select({ id: users.id }).from(users);
  },

  async createLog(payload: {
    type: string;
    title: string;
    body: string;
    dataJson?: string;
    targetMode: string;
    targetUserIds?: string;
    status?: string;
    successCount?: number;
    failureCount?: number;
    createdBy?: string;
  }) {
    const row = await db
      .insert(notificationLogs)
      .values({
        type: payload.type,
        title: payload.title,
        body: payload.body,
        dataJson: payload.dataJson,
        targetMode: payload.targetMode,
        targetUserIds: payload.targetUserIds,
        status: payload.status ?? 'queued',
        successCount: payload.successCount ?? 0,
        failureCount: payload.failureCount ?? 0,
        createdBy: payload.createdBy,
      })
      .returning();
    return row[0] ?? null;
  },

  async listLogs(limit = 50) {
    return db.select().from(notificationLogs).orderBy(desc(notificationLogs.createdAt)).limit(limit);
  },

  // ── User-facing notifications ─────────────────────────────────

  async insertUserNotification(payload: {
    userId: string;
    type: string;
    title: string;
    body: string;
    dataJson?: string;
  }) {
    const row = await db
      .insert(userNotifications)
      .values({
        userId: payload.userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        dataJson: payload.dataJson,
      })
      .returning();
    return row[0] ?? null;
  },

  async listUserNotifications(userId: string, limit = 50, cursor?: string) {
    const conditions = [eq(userNotifications.userId, userId)];
    if (cursor) {
      conditions.push(lt(userNotifications.createdAt, new Date(cursor)));
    }
    const rows = await db
      .select()
      .from(userNotifications)
      .where(and(...conditions))
      .orderBy(desc(userNotifications.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = items.length ? String(items[items.length - 1].createdAt) : null;

    return { notifications: items, hasMore, nextCursor };
  },

  async countUnreadNotifications(userId: string) {
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(userNotifications)
      .where(and(eq(userNotifications.userId, userId), eq(userNotifications.isRead, false)));
    return Number(rows[0]?.count ?? 0);
  },

  async markNotificationRead(id: string, userId: string) {
    const row = await db
      .update(userNotifications)
      .set({ isRead: true, readAt: new Date() })
      .where(and(eq(userNotifications.id, id), eq(userNotifications.userId, userId)))
      .returning();
    return row[0] ?? null;
  },

  async markAllNotificationsRead(userId: string) {
    await db
      .update(userNotifications)
      .set({ isRead: true, readAt: new Date() })
      .where(and(eq(userNotifications.userId, userId), eq(userNotifications.isRead, false)));
  },

  async deleteNotification(id: string, userId: string) {
    const row = await db
      .delete(userNotifications)
      .where(and(eq(userNotifications.id, id), eq(userNotifications.userId, userId)))
      .returning({ id: userNotifications.id });
    return row[0] ?? null;
  },

  /** `readOnly` clears the history but leaves anything still unseen in place. */
  async deleteAllNotifications(userId: string, readOnly = false) {
    const conditions = [eq(userNotifications.userId, userId)];
    if (readOnly) conditions.push(eq(userNotifications.isRead, true));

    const rows = await db
      .delete(userNotifications)
      .where(and(...conditions))
      .returning({ id: userNotifications.id });
    return rows.length;
  },
};

// ── Admin notification feed ────────────────────────────────────────────────
//
// The admin bell is not backed by a notifications table: it is derived from
// the rows that already record the events an admin cares about. That way it is
// correct the moment it ships — no backfill, no event bus to keep in sync, and
// nothing to write on the hot path of checkout/report/signup. Only read state
// is persisted (`admin_notification_reads`).

export type AdminFeedEventType =
  | 'ORDER'
  | 'REPORT'
  | 'USER'
  | 'APPOINTMENT'
  | 'TICKET'
  | 'SUBSCRIPTION'
  | 'STOCK';

export type AdminFeedEvent = {
  key: string;
  type: AdminFeedEventType;
  title: string;
  body: string;
  href: string;
  severity: 'info' | 'warning';
  createdAt: Date;
};

/** How far back a derived event stays in the feed. */
const FEED_WINDOW_DAYS = 30;
/** Rows pulled per source before the merged list is trimmed to `limit`. */
const PER_SOURCE_LIMIT = 20;
/** A product at or below this stock count raises a low-stock event. */
const LOW_STOCK_THRESHOLD = 5;
/** Read markers older than this are pruned — the events are long gone. */
const READ_RETENTION_DAYS = 90;

const displayName = (firstName?: string | null, lastName?: string | null, email?: string | null) =>
  `${firstName ?? ''} ${lastName ?? ''}`.trim() || String(email ?? 'Unknown');

const money = (value: unknown) => `$${Number(value ?? 0).toFixed(2)}`;

const shortId = (id: string) => String(id).slice(0, 8);

export const AdminNotificationsModel = {
  /**
   * Build the merged feed of real events, newest first.
   *
   * Every source is bounded (window + per-source limit) so this stays a fixed
   * cost regardless of how large the tables get.
   */
  async listFeedEvents(limit = PER_SOURCE_LIMIT * 7): Promise<AdminFeedEvent[]> {
    const windowStart = new Date(Date.now() - FEED_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [
      recentOrders,
      pendingReports,
      newUsers,
      newAppointments,
      openTickets,
      newSubscriptions,
      lowStock,
    ] = await Promise.all([
      db
        .select({
          id: orders.id,
          amount: orders.totalAmount,
          status: orders.status,
          source: orders.source,
          createdAt: orders.createdAt,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        })
        .from(orders)
        .innerJoin(users, eq(orders.userId, users.id))
        .where(gte(orders.createdAt, windowStart))
        .orderBy(desc(orders.createdAt))
        .limit(PER_SOURCE_LIMIT),

      db
        .select({
          id: reports.id,
          reason: reports.reason,
          postId: reports.postId,
          createdAt: reports.createdAt,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        })
        .from(reports)
        .innerJoin(users, eq(reports.reporterId, users.id))
        .where(and(eq(reports.status, 'pending'), gte(reports.createdAt, windowStart)))
        .orderBy(desc(reports.createdAt))
        .limit(PER_SOURCE_LIMIT),

      // Staff accounts are created from the admin panel itself; they are not
      // "a new customer signed up".
      db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(
          and(
            gte(users.createdAt, windowStart),
            sql`NOT EXISTS (
              SELECT 1 FROM user_roles ur
              JOIN roles r ON r.id = ur.role_id
              WHERE ur.user_id = ${users.id} AND r.code <> 'customer'
            )`,
          ),
        )
        .orderBy(desc(users.createdAt))
        .limit(PER_SOURCE_LIMIT),

      db
        .select({
          id: vetAppointments.id,
          type: vetAppointments.type,
          status: vetAppointments.status,
          appointmentAt: vetAppointments.appointmentAt,
          createdAt: vetAppointments.createdAt,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        })
        .from(vetAppointments)
        .innerJoin(users, eq(vetAppointments.userId, users.id))
        .where(
          and(
            inArray(vetAppointments.status, ['scheduled', 'pending', 'confirmed']),
            gte(vetAppointments.createdAt, windowStart),
          ),
        )
        .orderBy(desc(vetAppointments.createdAt))
        .limit(PER_SOURCE_LIMIT),

      db
        .select({
          id: supportTickets.id,
          subject: supportTickets.subject,
          category: supportTickets.category,
          priority: supportTickets.priority,
          raiserRole: supportTickets.raiserRole,
          createdAt: supportTickets.createdAt,
        })
        .from(supportTickets)
        .where(and(eq(supportTickets.status, 'open'), gte(supportTickets.createdAt, windowStart)))
        .orderBy(desc(supportTickets.createdAt))
        .limit(PER_SOURCE_LIMIT),

      db
        .select({
          id: userSubscriptions.id,
          status: userSubscriptions.status,
          createdAt: userSubscriptions.createdAt,
          planName: subscriptionPlans.name,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        })
        .from(userSubscriptions)
        .innerJoin(users, eq(userSubscriptions.userId, users.id))
        .innerJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
        .where(gte(userSubscriptions.createdAt, windowStart))
        .orderBy(desc(userSubscriptions.createdAt))
        .limit(PER_SOURCE_LIMIT),

      // Low stock is a *state*, not an event, so it has no timestamp of its
      // own. The last inventory movement is when it became true; fall back to
      // the product row for stock that was never logged.
      db
        .select({
          id: products.id,
          name: products.name,
          stock: products.stock,
          changedAt: sql<Date>`COALESCE(
            (SELECT MAX(l.created_at) FROM product_inventory_logs l WHERE l.product_id = ${products.id}),
            ${products.createdAt}
          )`,
        })
        .from(products)
        .where(and(eq(products.isActive, true), lte(products.stock, LOW_STOCK_THRESHOLD)))
        .orderBy(products.stock)
        .limit(PER_SOURCE_LIMIT),
    ]);

    const events: AdminFeedEvent[] = [
      ...recentOrders.map((o): AdminFeedEvent => ({
        key: `order:${o.id}`,
        type: 'ORDER',
        title: o.source === 'auto_reorder' ? 'Auto re-order placed' : 'New order received',
        body: `#${shortId(o.id)} · ${money(o.amount)} · ${displayName(o.firstName, o.lastName, o.email)}`,
        href: `/dashboard/orders/${o.id}`,
        severity: 'info',
        createdAt: o.createdAt,
      })),

      ...pendingReports.map((r): AdminFeedEvent => ({
        key: `report:${r.id}`,
        type: 'REPORT',
        title: 'Post reported',
        body: `${String(r.reason).slice(0, 120)} · by ${displayName(r.firstName, r.lastName, r.email)}`,
        href: '/dashboard/social/reports',
        severity: 'warning',
        createdAt: r.createdAt,
      })),

      ...newUsers.map((u): AdminFeedEvent => ({
        key: `user:${u.id}`,
        type: 'USER',
        title: 'New user registered',
        body: `${displayName(u.firstName, u.lastName, u.email)} · ${u.email}`,
        href: `/dashboard/users/${u.id}`,
        severity: 'info',
        createdAt: u.createdAt,
      })),

      ...newAppointments.map((a): AdminFeedEvent => ({
        key: `appointment:${a.id}`,
        type: 'APPOINTMENT',
        title: `New ${String(a.type ?? '').toLowerCase() || 'vet'} appointment`,
        body: `${displayName(a.firstName, a.lastName, a.email)} · ${a.appointmentAt}`,
        href: `/dashboard/appointments/${a.id}`,
        severity: 'info',
        createdAt: a.createdAt,
      })),

      ...openTickets.map((t): AdminFeedEvent => ({
        key: `ticket:${t.id}`,
        type: 'TICKET',
        title: 'Support ticket opened',
        body: `${t.subject} · ${t.category} · ${t.priority} priority`,
        href: `/dashboard/freelancers/support/${t.id}`,
        severity: t.priority === 'high' ? 'warning' : 'info',
        createdAt: t.createdAt,
      })),

      ...newSubscriptions.map((s): AdminFeedEvent => ({
        key: `subscription:${s.id}`,
        type: 'SUBSCRIPTION',
        title: 'New subscription',
        body: `${displayName(s.firstName, s.lastName, s.email)} · ${s.planName}`,
        href: `/dashboard/subscriptions/${s.id}`,
        severity: 'info',
        createdAt: s.createdAt,
      })),

      // The stock count is part of the key on purpose: once an admin dismisses
      // "3 left", a further drop to "1 left" is a new, unread event.
      ...lowStock.map((p): AdminFeedEvent => ({
        key: `stock:${p.id}:${p.stock ?? 0}`,
        type: 'STOCK',
        title: (p.stock ?? 0) <= 0 ? 'Out of stock' : 'Low stock',
        body: `${p.name} · ${p.stock ?? 0} left`,
        href: `/dashboard/products/${p.id}`,
        severity: 'warning',
        createdAt: new Date(p.changedAt as unknown as string),
      })),
    ];

    return events
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  },

  async listReadKeys(adminId: string): Promise<Set<string>> {
    const rows = await db
      .select({ eventKey: adminNotificationReads.eventKey })
      .from(adminNotificationReads)
      .where(eq(adminNotificationReads.adminId, adminId));
    return new Set(rows.map((r) => r.eventKey));
  },

  async markRead(adminId: string, eventKeys: string[]) {
    if (!eventKeys.length) return 0;
    const values = [...new Set(eventKeys)].map((eventKey) => ({ adminId, eventKey }));
    await db.insert(adminNotificationReads).values(values).onConflictDoNothing();
    return values.length;
  },

  async pruneReadMarkers(adminId: string) {
    const cutoff = new Date(Date.now() - READ_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await db
      .delete(adminNotificationReads)
      .where(and(eq(adminNotificationReads.adminId, adminId), lt(adminNotificationReads.readAt, cutoff)));
  },
};
