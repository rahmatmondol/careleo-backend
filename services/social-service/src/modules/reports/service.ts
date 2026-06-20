import { ReportsModel } from './model';
import { PostsModel } from '../posts/model';

const VALID_RESOLUTIONS = ['resolved', 'dismissed'];

export const ReportsService = {
  /** A user reports a post. Idempotent per (user, post) while a report is still pending. */
  async report(postId: string, reporterId: string, reason: string) {
    const text = reason?.trim();
    if (!text) return { status: 400, error: 'A reason is required' };

    const post = await PostsModel.findById(postId);
    if (!post) return { status: 404, error: 'Post not found' };

    const existing = await ReportsModel.findPending(postId, reporterId);
    if (existing) return { data: { report: existing, message: 'Already reported' } };

    const report = await ReportsModel.create({ postId, reporterId, reason: text });
    return { data: { report, message: 'Report submitted' } };
  },

  /** Admin: list the moderation queue. */
  async list(status: string | undefined, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const reports = await ReportsModel.listAll(status, limit, offset);
    return { data: { reports } };
  },

  /** Admin: resolve or dismiss a report. */
  async resolve(reportId: string, reviewerId: string, status: string) {
    if (!VALID_RESOLUTIONS.includes(status)) {
      return { status: 400, error: `status must be one of: ${VALID_RESOLUTIONS.join(', ')}` };
    }
    const report = await ReportsModel.findById(reportId);
    if (!report) return { status: 404, error: 'Report not found' };

    const updated = await ReportsModel.updateStatus(reportId, status, reviewerId);
    return { data: { report: updated } };
  },
};
