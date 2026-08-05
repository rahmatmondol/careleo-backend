import { AuditModel, type AuditLogFilters } from './model';

export const AuditService = {
  async ping() {
    return { success: true, data: await AuditModel.ping(), error: null };
  },

  /** Filtered audit log listing. Query values arrive as strings. */
  async list(query: Record<string, unknown> = {}) {
    const since = query.since ? new Date(String(query.since)) : undefined;
    const filters: AuditLogFilters = {
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      entityType: query.entityType ? String(query.entityType) : undefined,
      action: query.action ? String(query.action) : undefined,
      userId: query.userId ? String(query.userId) : undefined,
      search: query.search ? String(query.search) : undefined,
      since: since && !Number.isNaN(since.getTime()) ? since : undefined,
    };
    return AuditModel.list(filters);
  },

  async get(id: string) {
    return AuditModel.getById(id);
  },
};
