import { NotificationsModel } from './model';

export const NotificationsService = {
  async list(userId: string) {
    return { data: { notifications: await NotificationsModel.listForUser(userId) } };
  },
  async markRead(notifId: string, userId: string) {
    await NotificationsModel.markRead(notifId, userId);
    return { data: { message: 'Marked read' } };
  },
};
