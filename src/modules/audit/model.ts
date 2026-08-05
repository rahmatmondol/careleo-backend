import { and, desc, eq, gte, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import { auditLogsTable } from '@/shared/db/schema/careleo.schema';
import { users } from '@/shared/db/schema';

export type AuditLogFilters = {
  page?: number;
  limit?: number;
  entityType?: string;
  action?: string;
  userId?: string;
  search?: string;
  since?: Date;
};

const actorColumns = {
  actorFirstName: users.firstName,
  actorLastName: users.lastName,
  actorEmail: users.email,
};

const logColumns = {
  id: auditLogsTable.id,
  userId: auditLogsTable.userId,
  entityType: auditLogsTable.entityType,
  entityId: auditLogsTable.entityId,
  action: auditLogsTable.action,
  changes: auditLogsTable.changes,
  ipAddress: auditLogsTable.ipAddress,
  userAgent: auditLogsTable.userAgent,
  createdAt: auditLogsTable.createdAt,
};

/** A log line saying "someone deleted a pet" is not an audit trail. */
const actorName = (row: { actorFirstName: string | null; actorLastName: string | null; actorEmail: string | null }) =>
  `${row.actorFirstName ?? ''} ${row.actorLastName ?? ''}`.trim() || row.actorEmail || 'System';

export const AuditModel = {
  async ping() { return { module: 'audit', ok: true }; },

  /** Filtered, paginated audit log listing for the admin panel. */
  async list(filters: AuditLogFilters = {}) {
    const page = Math.max(1, Number(filters.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(filters.limit ?? 25)));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (filters.entityType) conditions.push(eq(auditLogsTable.entityType, filters.entityType));
    if (filters.action) conditions.push(eq(auditLogsTable.action, filters.action));
    if (filters.userId) conditions.push(eq(auditLogsTable.userId, filters.userId));
    if (filters.since) conditions.push(gte(auditLogsTable.createdAt, filters.since));
    if (filters.search) {
      const term = `%${filters.search}%`;
      const match = or(
        ilike(auditLogsTable.entityType, term),
        ilike(auditLogsTable.action, term),
        ilike(users.email, term),
        ilike(users.firstName, term),
        ilike(users.lastName, term),
      );
      if (match) conditions.push(match);
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db
      .select({ ...logColumns, ...actorColumns })
      .from(auditLogsTable)
      .leftJoin(users, eq(auditLogsTable.userId, users.id))
      .where(where)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const totals = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(auditLogsTable)
      .leftJoin(users, eq(auditLogsTable.userId, users.id))
      .where(where);

    const total = totals[0]?.count ?? 0;

    return {
      logs: rows.map(({ actorFirstName, actorLastName, actorEmail, ...log }) => ({
        ...log,
        actor: actorName({ actorFirstName, actorLastName, actorEmail }),
        actorEmail,
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  async getById(id: string) {
    const rows = await db
      .select({ ...logColumns, ...actorColumns })
      .from(auditLogsTable)
      .leftJoin(users, eq(auditLogsTable.userId, users.id))
      .where(eq(auditLogsTable.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    const { actorFirstName, actorLastName, actorEmail, ...log } = row;
    return { ...log, actor: actorName({ actorFirstName, actorLastName, actorEmail }), actorEmail };
  },
};
