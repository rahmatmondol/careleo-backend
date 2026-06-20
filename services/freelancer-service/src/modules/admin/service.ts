import { AdminModel } from './model';

const num = (v: any, d: number) => Number(v) || d;

export const AdminService = {
  async listFreelancers(opts: { page: number; limit: number }) {
    const [freelancers, total] = await Promise.all([
      AdminModel.listFreelancers(opts),
      AdminModel.countFreelancers(),
    ]);
    return { data: { freelancers, total, page: opts.page, limit: opts.limit } };
  },

  async getFreelancer(profileId: string) {
    const rows = await AdminModel.getFreelancerDetail(profileId);
    const detail = rows[0] ?? null;
    if (!detail) return { status: 404, error: 'Freelancer not found' };
    return { data: { freelancer: detail } };
  },

  async verifyFreelancer(profileId: string, isVerified: boolean) {
    const updated = await AdminModel.setFreelancerVerified(profileId, isVerified);
    if (!updated) return { status: 404, error: 'Profile not found' };
    return { data: { profile: updated } };
  },

  async setFreelancerStatus(accountId: string, status: string) {
    const VALID = ['active', 'suspended', 'pending'];
    if (!VALID.includes(status)) return { status: 400, error: 'Invalid status' };
    const updated = await AdminModel.setFreelancerAccountStatus(accountId, status);
    if (!updated) return { status: 404, error: 'Account not found' };
    return { data: { account: updated } };
  },

  async getFreelancerPerformance(profileId: string) {
    const perf = await AdminModel.getFreelancerPerformance(profileId);
    return { data: { performance: perf } };
  },

  async listServices(opts: { status?: string; page: number; limit: number }) {
    return { data: { services: await AdminModel.listServices(opts), page: opts.page, limit: opts.limit } };
  },

  async setServiceModeration(serviceId: string, moderationStatus: string) {
    const VALID = ['pending', 'approved', 'hidden'];
    if (!VALID.includes(moderationStatus)) return { status: 400, error: 'Invalid moderation status' };
    const updated = await AdminModel.setServiceModeration(serviceId, moderationStatus);
    if (!updated) return { status: 404, error: 'Service not found' };
    return { data: { service: updated } };
  },

  async listEarnings(opts: { payoutStatus?: string; page: number; limit: number }) {
    return { data: { earnings: await AdminModel.listEarnings(opts), page: opts.page, limit: opts.limit } };
  },

  async setEarningPayout(earningId: string, body: { payoutStatus: string; payoutRef?: string }) {
    const VALID = ['pending', 'paid', 'failed', 'on_hold'];
    if (!VALID.includes(body.payoutStatus)) return { status: 400, error: 'Invalid payout status' };
    const updated = await AdminModel.setEarningPayout(earningId, body.payoutStatus, body.payoutRef);
    if (!updated) return { status: 404, error: 'Earning record not found' };
    return { data: { earning: updated } };
  },

  async summary() {
    return { data: await AdminModel.marketplaceSummary() };
  },

  async listSupportTickets(opts: { status?: string; page: number; limit: number }) {
    return { data: { tickets: await AdminModel.listSupportTickets(opts), page: opts.page, limit: opts.limit } };
  },

  async getSupportTicket(id: string) {
    const result = await AdminModel.getSupportTicket(id);
    if (!result) return { status: 404, error: 'Ticket not found' };
    return { data: result };
  },

  async updateSupportTicket(id: string, data: { status?: string; assignedTo?: string; priority?: string }) {
    const updated = await AdminModel.updateTicket(id, data);
    if (!updated) return { status: 404, error: 'Ticket not found' };
    return { data: { ticket: updated } };
  },

  async addTicketMessage(ticketId: string, adminId: string, body: string) {
    if (!body?.trim()) return { status: 400, error: 'Message required' };
    const msg = await AdminModel.addAdminTicketMessage(ticketId, adminId, body.trim());
    return { data: { message: msg } };
  },

  async moderateReview(reviewId: string, status: string) {
    const VALID = ['active', 'hidden'];
    if (!VALID.includes(status)) return { status: 400, error: 'Invalid status' };
    const updated = await AdminModel.setReviewStatus(reviewId, status);
    if (!updated) return { status: 404, error: 'Review not found' };
    return { data: { review: updated } };
  },
};
