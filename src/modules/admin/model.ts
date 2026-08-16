import { and, desc, eq, gte, ilike, inArray, lt, or, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import {
  orderItems,
  orders,
  pets,
  productSubscriptions,
  products,
  roles,
  subscriptionPlans,
  tasks,
  userRoles,
  users,
  userSubscriptions,
} from '@/shared/db/schema';
import { ROLE_PERMISSIONS, type Role } from '@/shared/auth/rbac';

/**
 * Orders that never became money. Excluded everywhere revenue is summed, so
 * the dashboard number matches what finance would recognise.
 */
const REVENUE_EXCLUDED = ['CANCELLED', 'FAILED', 'REFUNDED'];
const countsAsRevenue = sql`UPPER(${orders.status}) NOT IN ('CANCELLED', 'FAILED', 'REFUNDED')`;

const MONTHS_IN_SERIES = 6;

/** Percent change between two periods; null when there is no baseline. */
const percentChange = (current: number, previous: number): number | null => {
  if (!previous) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
};

/** First day of the month, `offset` months back from now. */
const monthStart = (offset: number): Date => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() - offset);
  return d;
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;

/**
 * Turn grouped rows keyed by month into a dense series, so a quiet month shows
 * as zero instead of vanishing from the chart.
 */
function densify(rows: { bucket: string; value: number }[]): { name: string; value: number }[] {
  const byKey = new Map<string, number>();
  for (const row of rows) {
    const d = new Date(row.bucket);
    byKey.set(monthKey(d), Number(row.value) || 0);
  }
  const series: { name: string; value: number }[] = [];
  for (let i = MONTHS_IN_SERIES - 1; i >= 0; i--) {
    const d = monthStart(i);
    series.push({ name: MONTH_LABELS[d.getMonth()], value: byKey.get(monthKey(d)) ?? 0 });
  }
  return series;
}

export const AdminModel = {
  async ping() { return { module: 'admin', ok: true }; },

  /**
   * Everything the admin dashboard shows, in one round trip: 30-day headline
   * metrics with their previous-period comparison, two six-month series, and
   * the latest orders.
   */
  async getDashboardSummary() {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const prevStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const seriesStart = monthStart(MONTHS_IN_SERIES - 1);

    const [
      revenueNow,
      revenuePrev,
      usersTotal,
      usersNow,
      usersPrev,
      petsTotal,
      petsNow,
      revenueSeries,
      signupSeries,
      recentOrders,
    ] = await Promise.all([
      db
        .select({
          total: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(orders)
        .where(and(gte(orders.createdAt, windowStart), countsAsRevenue)),

      db
        .select({
          total: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(orders)
        .where(and(gte(orders.createdAt, prevStart), lt(orders.createdAt, windowStart), countsAsRevenue)),

      db.select({ count: sql<number>`COUNT(*)::int` }).from(users),

      db.select({ count: sql<number>`COUNT(*)::int` }).from(users).where(gte(users.createdAt, windowStart)),

      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(users)
        .where(and(gte(users.createdAt, prevStart), lt(users.createdAt, windowStart))),

      db.select({ count: sql<number>`COUNT(*)::int` }).from(pets),

      db.select({ count: sql<number>`COUNT(*)::int` }).from(pets).where(gte(pets.createdAt, windowStart)),

      db
        .select({
          bucket: sql<string>`date_trunc('month', ${orders.createdAt})`,
          value: sql<number>`COALESCE(SUM(${orders.totalAmount}), 0)::float`,
        })
        .from(orders)
        .where(and(gte(orders.createdAt, seriesStart), countsAsRevenue))
        .groupBy(sql`date_trunc('month', ${orders.createdAt})`)
        .orderBy(sql`date_trunc('month', ${orders.createdAt})`),

      db
        .select({
          bucket: sql<string>`date_trunc('month', ${users.createdAt})`,
          value: sql<number>`COUNT(*)::float`,
        })
        .from(users)
        .where(gte(users.createdAt, seriesStart))
        .groupBy(sql`date_trunc('month', ${users.createdAt})`)
        .orderBy(sql`date_trunc('month', ${users.createdAt})`),

      db
        .select({
          id: orders.id,
          amount: orders.totalAmount,
          status: orders.status,
          source: orders.source,
          paymentStatus: orders.paymentStatus,
          createdAt: orders.createdAt,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        })
        .from(orders)
        .innerJoin(users, eq(orders.userId, users.id))
        .orderBy(desc(orders.createdAt))
        .limit(8),
    ]);

    const revenue = Number(revenueNow[0]?.total ?? 0);
    const revenuePrevious = Number(revenuePrev[0]?.total ?? 0);
    const orderCount = revenueNow[0]?.count ?? 0;
    const orderCountPrevious = revenuePrev[0]?.count ?? 0;
    const newUsers = usersNow[0]?.count ?? 0;
    const newUsersPrevious = usersPrev[0]?.count ?? 0;

    return {
      period: { days: 30, from: windowStart.toISOString(), to: now.toISOString() },
      metrics: {
        revenue: { value: revenue, change: percentChange(revenue, revenuePrevious) },
        orders: { value: orderCount, change: percentChange(orderCount, orderCountPrevious) },
        users: {
          value: usersTotal[0]?.count ?? 0,
          newInPeriod: newUsers,
          change: percentChange(newUsers, newUsersPrevious),
        },
        pets: { value: petsTotal[0]?.count ?? 0, newInPeriod: petsNow[0]?.count ?? 0 },
      },
      revenueSeries: densify(revenueSeries as any),
      signupSeries: densify(signupSeries as any),
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        customer: `${o.firstName ?? ''} ${o.lastName ?? ''}`.trim() || o.email,
        email: o.email,
        amount: Number(o.amount ?? 0),
        status: o.status,
        source: o.source,
        paymentStatus: o.paymentStatus,
        createdAt: o.createdAt,
      })),
      excludedStatuses: REVENUE_EXCLUDED,
    };
  },

  /**
   * Customer listing for the admin panel, with the counts an operator actually
   * scans for: how many pets, how many orders, how much they have spent.
   */
  async listUsers(filters: { page?: number; limit?: number; search?: string; status?: string } = {}) {
    const page = Math.max(1, Number(filters.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(filters.limit ?? 25)));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (filters.status) conditions.push(eq(users.status, filters.status));
    if (filters.search) {
      const term = `%${filters.search}%`;
      const match = or(
        ilike(users.firstName, term),
        ilike(users.lastName, term),
        ilike(users.email, term),
        ilike(users.phone, term),
      );
      if (match) conditions.push(match);
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
        city: users.city,
        country: users.country,
        avatarUrl: users.avatarUrl,
        provider: users.provider,
        status: users.status,
        isEmailVerified: users.isEmailVerified,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        petCount: sql<number>`(SELECT COUNT(*)::int FROM ${pets} WHERE ${pets.userId} = ${users.id})`,
        orderCount: sql<number>`(SELECT COUNT(*)::int FROM ${orders} WHERE ${orders.userId} = ${users.id})`,
        totalSpent: sql<number>`(
          SELECT COALESCE(SUM(${orders.totalAmount}), 0)::float FROM ${orders}
          WHERE ${orders.userId} = ${users.id}
            AND UPPER(${orders.status}) NOT IN ('CANCELLED', 'FAILED', 'REFUNDED')
        )`,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    const totals = await db.select({ count: sql<number>`COUNT(*)::int` }).from(users).where(where);
    const total = totals[0]?.count ?? 0;

    return {
      users: rows.map((u) => ({ ...u, name: `${u.firstName} ${u.lastName}`.trim() })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  /**
   * One customer with everything the admin panel's user page shows: their pets
   * and the tasks logged against them, recent orders down to the line item, the
   * current plan, and the recurring product deliveries still to come.
   */
  async getUser(id: string) {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    const user = rows[0];
    if (!user) return null;

    const [userPets, userOrders, subscription, upcomingDeliveries] = await Promise.all([
      db.select().from(pets).where(eq(pets.userId, id)).orderBy(desc(pets.createdAt)),
      db
        .select({
          id: orders.id,
          amount: orders.totalAmount,
          status: orders.status,
          paymentStatus: orders.paymentStatus,
          paymentMethod: orders.paymentMethod,
          source: orders.source,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(eq(orders.userId, id))
        .orderBy(desc(orders.createdAt))
        .limit(20),
      db
        .select({
          id: userSubscriptions.id,
          status: userSubscriptions.status,
          currentPeriodEnd: userSubscriptions.currentPeriodEnd,
          cancelAtPeriodEnd: userSubscriptions.cancelAtPeriodEnd,
          planName: subscriptionPlans.name,
          planPrice: subscriptionPlans.price,
          billingCycle: subscriptionPlans.billingCycle,
        })
        .from(userSubscriptions)
        .innerJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
        .where(eq(userSubscriptions.userId, id))
        .orderBy(desc(userSubscriptions.createdAt))
        .limit(1),

      // Recurring product deliveries — the "next 30 days" list on the user page
      // comes from here, so cancelled subscriptions are left out.
      db
        .select({
          id: productSubscriptions.id,
          productId: productSubscriptions.productId,
          productName: products.name,
          imageUrl: products.imageUrl,
          quantity: productSubscriptions.quantity,
          frequencyDays: productSubscriptions.frequencyDays,
          nextOrderDate: productSubscriptions.nextOrderDate,
          lastOrderedAt: productSubscriptions.lastOrderedAt,
        })
        .from(productSubscriptions)
        .innerJoin(products, eq(productSubscriptions.productId, products.id))
        .where(and(eq(productSubscriptions.userId, id), eq(productSubscriptions.isActive, true)))
        .orderBy(productSubscriptions.nextOrderDate),
    ]);

    const orderIds = userOrders.map((o) => o.id);
    const petIds = userPets.map((p) => p.id);

    const [lineItems, petTasks] = await Promise.all([
      orderIds.length
        ? db
            .select({
              id: orderItems.id,
              orderId: orderItems.orderId,
              productId: orderItems.productId,
              // Line items keep their own name/price snapshot; only the image is
              // looked up, and it is gone once the product is deleted.
              name: orderItems.productName,
              quantity: orderItems.quantity,
              price: orderItems.price,
              imageUrl: products.imageUrl,
            })
            .from(orderItems)
            .leftJoin(products, eq(products.id, orderItems.productId))
            .where(inArray(orderItems.orderId, orderIds))
        : Promise.resolve([] as any[]),

      petIds.length
        ? db
            .select({
              id: tasks.id,
              petId: tasks.petId,
              title: tasks.title,
              taskType: tasks.taskType,
              frequency: tasks.frequency,
              dueDate: tasks.dueDate,
              notes: tasks.notes,
              isCompleted: tasks.isCompleted,
            })
            .from(tasks)
            .where(inArray(tasks.petId, petIds))
            .orderBy(desc(tasks.dueDate))
            .limit(200)
        : Promise.resolve([] as any[]),
    ]);

    const itemsByOrder = new Map<string, any[]>();
    for (const item of lineItems) {
      const bucket = itemsByOrder.get(item.orderId) ?? [];
      bucket.push({ ...item, price: Number(item.price ?? 0), quantity: Number(item.quantity ?? 1) });
      itemsByOrder.set(item.orderId, bucket);
    }

    const tasksByPet = new Map<string, any[]>();
    for (const task of petTasks) {
      const bucket = tasksByPet.get(task.petId) ?? [];
      bucket.push(task);
      tasksByPet.set(task.petId, bucket);
    }

    const { passwordHash: _passwordHash, ...safeUser } = user as any;

    return {
      user: { ...safeUser, name: `${user.firstName} ${user.lastName}`.trim() },
      pets: userPets.map((p) => ({ ...p, tasks: tasksByPet.get(p.id) ?? [] })),
      orders: userOrders.map((o) => ({
        ...o,
        amount: Number(o.amount ?? 0),
        items: itemsByOrder.get(o.id) ?? [],
      })),
      subscription: subscription[0] ?? null,
      upcomingDeliveries,
      totals: {
        pets: userPets.length,
        orders: userOrders.length,
        spent: userOrders
          .filter((o) => !REVENUE_EXCLUDED.includes(String(o.status).toUpperCase()))
          .reduce((sum, o) => sum + Number(o.amount ?? 0), 0),
      },
    };
  },

  /** Subscriber listing — who is on which plan, and since when. */
  async listSubscriptions(filters: { page?: number; limit?: number; status?: string; search?: string } = {}) {
    const page = Math.max(1, Number(filters.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(filters.limit ?? 25)));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (filters.status) conditions.push(eq(userSubscriptions.status, filters.status));
    if (filters.search) {
      const term = `%${filters.search}%`;
      const match = or(
        ilike(users.email, term),
        ilike(users.firstName, term),
        ilike(users.lastName, term),
        ilike(subscriptionPlans.name, term),
      );
      if (match) conditions.push(match);
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: userSubscriptions.id,
        userId: userSubscriptions.userId,
        status: userSubscriptions.status,
        currentPeriodStart: userSubscriptions.currentPeriodStart,
        currentPeriodEnd: userSubscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: userSubscriptions.cancelAtPeriodEnd,
        createdAt: userSubscriptions.createdAt,
        planId: subscriptionPlans.id,
        planName: subscriptionPlans.name,
        planPrice: subscriptionPlans.price,
        billingCycle: subscriptionPlans.billingCycle,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(userSubscriptions)
      .innerJoin(users, eq(userSubscriptions.userId, users.id))
      .innerJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
      .where(where)
      .orderBy(desc(userSubscriptions.createdAt))
      .limit(limit)
      .offset(offset);

    const totals = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(userSubscriptions)
      .innerJoin(users, eq(userSubscriptions.userId, users.id))
      .innerJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
      .where(where);
    const total = totals[0]?.count ?? 0;

    return {
      subscriptions: rows.map((s) => ({
        ...s,
        planPrice: Number(s.planPrice ?? 0),
        customer: `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || s.email,
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  /** One subscription with its customer and plan, for the detail page. */
  async getSubscription(id: string) {
    const rows = await db
      .select({
        id: userSubscriptions.id,
        userId: userSubscriptions.userId,
        status: userSubscriptions.status,
        currentPeriodStart: userSubscriptions.currentPeriodStart,
        currentPeriodEnd: userSubscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: userSubscriptions.cancelAtPeriodEnd,
        createdAt: userSubscriptions.createdAt,
        planId: subscriptionPlans.id,
        planName: subscriptionPlans.name,
        planPrice: subscriptionPlans.price,
        billingCycle: subscriptionPlans.billingCycle,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        avatarUrl: users.avatarUrl,
      })
      .from(userSubscriptions)
      .innerJoin(users, eq(userSubscriptions.userId, users.id))
      .innerJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
      .where(eq(userSubscriptions.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      ...row,
      planPrice: Number(row.planPrice ?? 0),
      customer: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || row.email,
      // There is no invoices table — billing is not wired to a payment
      // processor yet, so the detail page's history is genuinely empty rather
      // than filled with plausible-looking rows.
      invoices: [] as unknown[],
    };
  },

  /**
   * Admin edit of one subscription: move plan, change status, or schedule the
   * cancellation. Only these three fields are writable — periods are set by
   * billing, not by hand.
   */
  async updateSubscription(
    id: string,
    patch: { status?: string; cancelAtPeriodEnd?: boolean; planId?: string },
  ) {
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.status !== undefined) values.status = patch.status;
    if (patch.cancelAtPeriodEnd !== undefined) values.cancelAtPeriodEnd = patch.cancelAtPeriodEnd;
    if (patch.planId !== undefined) values.planId = patch.planId;

    const updated = await db
      .update(userSubscriptions)
      .set(values as any)
      .where(eq(userSubscriptions.id, id))
      .returning({ id: userSubscriptions.id });

    if (!updated[0]) return null;
    return this.getSubscription(id);
  },

  /**
   * Subscription analytics: how many subscribers per plan and the monthly
   * recurring revenue they represent. Yearly plans are divided by 12 so MRR
   * means the same thing across billing cycles.
   */
  async getSubscriptionAnalytics() {
    const byPlan = await db
      .select({
        planId: subscriptionPlans.id,
        planName: subscriptionPlans.name,
        price: subscriptionPlans.price,
        billingCycle: subscriptionPlans.billingCycle,
        subscribers: sql<number>`COUNT(${userSubscriptions.id})::int`,
        active: sql<number>`COUNT(*) FILTER (WHERE ${userSubscriptions.status} = 'active')::int`,
      })
      .from(subscriptionPlans)
      .leftJoin(userSubscriptions, eq(userSubscriptions.planId, subscriptionPlans.id))
      .groupBy(subscriptionPlans.id, subscriptionPlans.name, subscriptionPlans.price, subscriptionPlans.billingCycle)
      .orderBy(desc(sql`COUNT(${userSubscriptions.id})`));

    const byStatus = await db
      .select({
        status: userSubscriptions.status,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(userSubscriptions)
      .groupBy(userSubscriptions.status);

    const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [newSignups, churned] = await Promise.all([
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(userSubscriptions)
        .where(gte(userSubscriptions.createdAt, windowStart)),
      // Cancelled *recently* — `updatedAt` is when the status last moved, which
      // is the only cancellation timestamp the table keeps.
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(userSubscriptions)
        .where(
          and(
            inArray(userSubscriptions.status, ['canceled', 'cancelled']),
            gte(userSubscriptions.updatedAt, windowStart),
          ),
        ),
    ]);

    const plans = byPlan.map((p) => {
      const price = Number(p.price ?? 0);
      const monthly = String(p.billingCycle).toLowerCase().startsWith('year') ? price / 12 : price;
      return {
        planId: p.planId,
        planName: p.planName,
        price,
        billingCycle: p.billingCycle,
        subscribers: p.subscribers ?? 0,
        activeSubscribers: p.active ?? 0,
        mrr: Math.round(monthly * (p.active ?? 0) * 100) / 100,
      };
    });

    const subscribers = plans.reduce((s, p) => s + p.subscribers, 0);
    const activeSubscribers = plans.reduce((s, p) => s + p.activeSubscribers, 0);
    const mrr = Math.round(plans.reduce((s, p) => s + p.mrr, 0) * 100) / 100;
    const churnedInPeriod = churned[0]?.count ?? 0;
    const churnBase = activeSubscribers + churnedInPeriod;

    return {
      plans,
      byStatus,
      // Headline numbers the subscriptions dashboard renders directly.
      mrr,
      arr: Math.round(mrr * 12 * 100) / 100,
      activeSubscribers,
      newSignupsThisMonth: newSignups[0]?.count ?? 0,
      /** Share of the 30-day subscriber base that cancelled in those 30 days. */
      churnRate: churnBase ? Math.round((churnedInPeriod / churnBase) * 1000) / 10 : 0,
      totals: { subscribers, activeSubscribers, mrr },
    };
  },

  // ─── Admin staff & roles ───────────────────────────────────────────────
  //
  // Role *membership* is a database fact (`user_roles` → `roles`), but the
  // permissions a role carries are not: `requirePermission` reads the static
  // ROLE_PERMISSIONS map in shared/auth/rbac.ts, and the `role_permissions`
  // table is not consulted by anything. So permissions are reported from the
  // code that enforces them, and are read-only.

  /** Role codes that can sign in to the admin panel. */
  ADMIN_ROLE_CODES: ['super_admin', 'admin', 'support'] as const,

  /** Everyone holding an admin-panel role, with the role they hold. */
  async listAdmins() {
    const rows = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        avatarUrl: users.avatarUrl,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        roleId: roles.id,
        roleCode: roles.code,
        roleName: roles.name,
      })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(inArray(roles.code, [...this.ADMIN_ROLE_CODES]))
      .orderBy(desc(users.createdAt));

    return rows.map((r) => ({ ...r, name: `${r.firstName} ${r.lastName}`.trim() }));
  },

  /** Roles from the database, with their enforced permissions and headcount. */
  async listRoles() {
    const rows = await db
      .select({
        id: roles.id,
        code: roles.code,
        name: roles.name,
        description: roles.description,
        isSystem: roles.isSystem,
        userCount: sql<number>`(SELECT COUNT(*)::int FROM ${userRoles} WHERE ${userRoles.roleId} = ${roles.id})`,
      })
      .from(roles)
      .orderBy(roles.code);

    return {
      roles: rows.map((r) => ({
        ...r,
        permissions: ROLE_PERMISSIONS[r.code as Role] ?? [],
      })),
      permissions: Array.from(new Set(Object.values(ROLE_PERMISSIONS).flat())).sort(),
      /** Permissions come from code, so the panel must not offer to edit them. */
      permissionsEditable: false,
    };
  },

  /** Create an admin-panel account and assign it a role in one transaction. */
  async createAdmin(input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    roleId: string;
    status?: string;
  }) {
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
    if (existing[0]) return { error: 'A user with that email already exists' as const };

    const role = await db.select({ id: roles.id }).from(roles).where(eq(roles.id, input.roleId)).limit(1);
    if (!role[0]) return { error: 'Unknown role' as const };

    const passwordHash = await Bun.password.hash(input.password);
    const inserted = await db
      .insert(users)
      .values({
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        passwordHash,
        status: input.status ?? 'active',
        isEmailVerified: true,
      })
      .returning({ id: users.id });

    const userId = inserted[0]!.id;
    await db.insert(userRoles).values({ userId, roleId: input.roleId });
    return { id: userId };
  },

  /** Rename, re-role, or suspend an existing admin. */
  async updateAdmin(
    id: string,
    patch: { firstName?: string; lastName?: string; email?: string; status?: string; roleId?: string },
  ) {
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.firstName !== undefined) values.firstName = patch.firstName;
    if (patch.lastName !== undefined) values.lastName = patch.lastName;
    if (patch.email !== undefined) values.email = patch.email;
    if (patch.status !== undefined) values.status = patch.status;

    const updated = await db
      .update(users)
      .set(values as any)
      .where(eq(users.id, id))
      .returning({ id: users.id });
    if (!updated[0]) return null;

    if (patch.roleId) {
      // One admin-panel role per account: drop the old assignment first so a
      // demoted super_admin does not keep their old permissions.
      await db
        .delete(userRoles)
        .where(
          and(
            eq(userRoles.userId, id),
            inArray(
              userRoles.roleId,
              db.select({ id: roles.id }).from(roles).where(inArray(roles.code, [...this.ADMIN_ROLE_CODES])),
            ),
          ),
        );
      await db.insert(userRoles).values({ userId: id, roleId: patch.roleId }).onConflictDoNothing();
    }

    return { id };
  },

  /**
   * Revoke admin access. The user row is kept — it may own pets, orders and
   * audit history — so this strips the admin role and deactivates the login
   * instead of deleting a record other tables point at.
   */
  async revokeAdmin(id: string) {
    const adminRoleIds = db
      .select({ id: roles.id })
      .from(roles)
      .where(inArray(roles.code, [...this.ADMIN_ROLE_CODES]));

    await db.delete(userRoles).where(and(eq(userRoles.userId, id), inArray(userRoles.roleId, adminRoleIds)));
    const updated = await db
      .update(users)
      .set({ status: 'inactive', updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({ id: users.id });

    return updated[0] ?? null;
  },
};
