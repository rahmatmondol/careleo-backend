import { SharesModel } from './model';

export const SharesService = {
  async share(postId: string, userId: string, platform?: string) {
    const share = await SharesModel.add(postId, userId, platform);
    return { data: { share } };
  },
  async list(postId: string) {
    return { data: { shares: await SharesModel.listByPost(postId) } };
  },
};
