import { AdminModel } from './model';

export const AdminService = {
  async ping() {
    return { success: true, data: await AdminModel.ping(), error: null };
  },

  /** Real numbers for the admin dashboard — see AdminModel for what's counted. */
  async getDashboardSummary() {
    return AdminModel.getDashboardSummary();
  },

  async listUsers(query: Record<string, unknown> = {}) {
    return AdminModel.listUsers({
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      search: query.search ? String(query.search) : undefined,
      status: query.status ? String(query.status) : undefined,
    });
  },

  async getUser(id: string) {
    return AdminModel.getUser(id);
  },

  async listSubscriptions(query: Record<string, unknown> = {}) {
    return AdminModel.listSubscriptions({
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      status: query.status ? String(query.status) : undefined,
      search: query.search ? String(query.search) : undefined,
    });
  },

  async getSubscriptionAnalytics() {
    return AdminModel.getSubscriptionAnalytics();
  },
};
