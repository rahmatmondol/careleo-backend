import { PostsModel } from '../posts/model';
import { ReportsModel } from '../reports/model';
import { ReportsService } from '../reports/service';

const VALID_STATUS = ['active', 'hidden'];

export const AdminService = {
  /** All posts for moderation, with optional status / reported filters. */
  async listPosts(opts: { status?: string; reported?: boolean; page?: number; limit?: number }) {
    const page = opts.page || 1;
    const limit = opts.limit || 20;
    const offset = (page - 1) * limit;
    const [posts, total] = await Promise.all([
      PostsModel.listAllForAdmin({ status: opts.status, reported: opts.reported, limit, offset }),
      PostsModel.countAll(),
    ]);
    return { data: { posts, total, page, limit } };
  },

  async getPost(postId: string) {
    const post = await PostsModel.findById(postId);
    if (!post) return { status: 404, error: 'Post not found' };
    return { data: { post } };
  },

  /** Hide or unhide a post. */
  async setPostStatus(postId: string, status: string) {
    if (!VALID_STATUS.includes(status)) {
      return { status: 400, error: `status must be one of: ${VALID_STATUS.join(', ')}` };
    }
    const post = await PostsModel.findById(postId);
    if (!post) return { status: 404, error: 'Post not found' };
    const updated = await PostsModel.setStatus(postId, status);
    return { data: { post: updated } };
  },

  /** Admin hard-delete — no owner check. */
  async deletePost(postId: string) {
    const post = await PostsModel.findById(postId);
    if (!post) return { status: 404, error: 'Post not found' };
    await PostsModel.remove(postId);
    return { data: { message: 'Post deleted' } };
  },

  // Reports queue delegates to ReportsService/Model.
  listReports(status: string | undefined, page?: number, limit?: number) {
    return ReportsService.list(status, page, limit);
  },

  resolveReport(reportId: string, reviewerId: string, status: string) {
    return ReportsService.resolve(reportId, reviewerId, status);
  },

  /** Dashboard metrics: totals, pending reports, 7-day engagement trend. */
  async analytics() {
    const [stats, pendingReports, engagementTrend] = await Promise.all([
      PostsModel.stats(),
      ReportsModel.countPending(),
      PostsModel.dailyCounts(7),
    ]);
    return { data: { ...stats, pendingReports, engagementTrend } };
  },
};
