import { FollowsModel } from './model';
import { NotificationsModel } from '../notifications/model';

export const FollowsService = {
  async follow(followerId: string, followingId: string) {
    if (followerId === followingId) return { status: 400, error: 'Cannot follow yourself' };
    if (await FollowsModel.find(followerId, followingId)) return { status: 409, error: 'Already following' };

    await FollowsModel.add(followerId, followingId);
    await NotificationsModel.create({ userId: followingId, actorId: followerId, type: 'follow', message: 'Someone started following you' });
    return { data: { following: true, message: 'Followed' } };
  },

  async unfollow(followerId: string, followingId: string) {
    const existing = await FollowsModel.find(followerId, followingId);
    if (!existing) return { status: 404, error: 'Not following' };
    await FollowsModel.remove(existing.id);
    return { data: { following: false, message: 'Unfollowed' } };
  },

  async followers(userId: string) {
    const rows = await FollowsModel.followers(userId);
    return { data: { followers: rows, count: rows.length } };
  },

  async following(userId: string) {
    const rows = await FollowsModel.following(userId);
    return { data: { following: rows, count: rows.length } };
  },
};
