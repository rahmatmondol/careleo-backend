import { EarningsModel } from './model';
import { ProfilesModel } from '../profiles/model';

export const EarningsService = {
  async listMine(accountId: string) {
    const profile = await ProfilesModel.getByAccount(accountId);
    if (!profile) return { status: 404, error: 'Profile not found' };
    return { data: { earnings: await EarningsModel.listByProfile(profile.id) } };
  },
};
