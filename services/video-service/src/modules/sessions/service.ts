import { SessionsModel } from './model';

/** Business logic for video sessions. Returns `{ data }` on success or `{ status, error }` on failure. */
export const SessionsService = {
  async list(userId: string, query: { status?: string }) {
    return { data: { sessions: await SessionsModel.listByUser(userId, query) } };
  },

  async get(userId: string, id: string) {
    const session = await SessionsModel.findById(userId, id);
    if (!session) return { status: 404, error: 'Session not found' };
    return { data: { session } };
  },

  async end(userId: string, id: string) {
    const session = await SessionsModel.findById(userId, id);
    if (!session) return { status: 404, error: 'Session not found' };
    const updated = await SessionsModel.update(id, { status: 'ENDED', endedAt: new Date() });
    return { data: { session: updated } };
  },
};
