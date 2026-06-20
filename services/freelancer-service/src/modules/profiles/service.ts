import { ProfilesModel } from './model';

export const ProfilesService = {
  async getMine(accountId: string) {
    const profile = await ProfilesModel.getByAccount(accountId);
    if (!profile) return { status: 404, error: 'Profile not found' };
    return { data: { profile } };
  },

  async updateMine(
    accountId: string,
    body: { bio?: string; location?: string; serviceTypes?: string[]; avatarUrl?: string; isActive?: boolean },
  ) {
    const updateData: Record<string, unknown> = {};
    if (body.bio !== undefined) updateData.bio = body.bio;
    if (body.location !== undefined) updateData.location = body.location;
    if (body.serviceTypes !== undefined) updateData.serviceTypes = body.serviceTypes;
    if (body.avatarUrl !== undefined) updateData.avatarUrl = body.avatarUrl;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (Object.keys(updateData).length === 0) return { status: 400, error: 'Nothing to update' };

    const updated = await ProfilesModel.update(accountId, updateData);
    if (!updated) return { status: 404, error: 'Profile not found' };
    return { data: { profile: updated } };
  },

  async getPublic(profileId: string) {
    const profile = await ProfilesModel.getPublic(profileId);
    if (!profile) return { status: 404, error: 'Freelancer not found' };
    return { data: { profile } };
  },
};
