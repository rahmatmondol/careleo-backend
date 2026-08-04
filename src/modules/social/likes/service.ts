import { LikesModel } from './model';
import { NotificationsModel } from '../notifications/model';

export const LikesService = {
  /** Toggle a like on a post. */
  async toggle(postId: string, userId: string) {
    const existing = await LikesModel.find(postId, userId);
    if (existing) {
      await LikesModel.remove(existing.id, postId);
      return { data: { liked: false, message: 'Unliked' } };
    }
    await LikesModel.add(postId, userId);

    const ownerId = await LikesModel.postOwner(postId);
    if (ownerId && ownerId !== userId) {
      await NotificationsModel.create({ userId: ownerId, actorId: userId, type: 'like', message: 'Someone liked your post', postId });
    }
    return { data: { liked: true, message: 'Liked' } };
  },

  async list(postId: string) {
    const rows = await LikesModel.listByPost(postId);
    return { data: { likes: rows, count: rows.length } };
  },
};
