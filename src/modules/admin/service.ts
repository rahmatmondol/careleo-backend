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

  async getSubscription(id: string) {
    return AdminModel.getSubscription(id);
  },

  async updateSubscription(id: string, body: Record<string, unknown>) {
    return AdminModel.updateSubscription(id, {
      status: body.status !== undefined ? String(body.status) : undefined,
      cancelAtPeriodEnd:
        body.cancelAtPeriodEnd !== undefined ? Boolean(body.cancelAtPeriodEnd) : undefined,
      planId: body.planId !== undefined ? String(body.planId) : undefined,
    });
  },

  async getSubscriptionAnalytics() {
    return AdminModel.getSubscriptionAnalytics();
  },

  async listAdmins() {
    return AdminModel.listAdmins();
  },

  async listRoles() {
    return AdminModel.listRoles();
  },

  async createAdmin(body: Record<string, unknown>) {
    return AdminModel.createAdmin({
      firstName: String(body.firstName ?? ''),
      lastName: String(body.lastName ?? ''),
      email: String(body.email ?? ''),
      password: String(body.password ?? ''),
      roleId: String(body.roleId ?? ''),
      status: body.status !== undefined ? String(body.status) : undefined,
    });
  },

  async updateAdmin(id: string, body: Record<string, unknown>) {
    return AdminModel.updateAdmin(id, {
      firstName: body.firstName !== undefined ? String(body.firstName) : undefined,
      lastName: body.lastName !== undefined ? String(body.lastName) : undefined,
      email: body.email !== undefined ? String(body.email) : undefined,
      status: body.status !== undefined ? String(body.status) : undefined,
      roleId: body.roleId !== undefined ? String(body.roleId) : undefined,
    });
  },

  async revokeAdmin(id: string) {
    return AdminModel.revokeAdmin(id);
  },
};
