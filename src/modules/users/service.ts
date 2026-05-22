import { ValidationError } from '@/shared/errors';
import { UsersModel } from './model';

export const UsersService = {
  /** Return authenticated user's profile. */
  async getMyProfile(userId: string) {
    const profile = await UsersModel.getProfileById(userId);
    if (!profile) throw new ValidationError('User not found');
    return profile;
  },

  /** Update authenticated user's profile fields. */
  async updateMyProfile(userId: string, payload: Record<string, unknown>) {
    const firstName = payload.firstName !== undefined ? String(payload.firstName).trim() : undefined;
    const lastName = payload.lastName !== undefined ? String(payload.lastName).trim() : undefined;
    const phone = payload.phone !== undefined ? String(payload.phone).trim() : undefined;
    const avatarUrl = payload.avatarUrl !== undefined ? String(payload.avatarUrl).trim() : undefined;
    const address = payload.address !== undefined ? String(payload.address).trim() : undefined;
    const city = payload.city !== undefined ? String(payload.city).trim() : undefined;
    const state = payload.state !== undefined ? String(payload.state).trim() : undefined;
    const country = payload.country !== undefined ? String(payload.country).trim() : undefined;
    const postalCode = payload.postalCode !== undefined ? String(payload.postalCode).trim() : undefined;

    const updated = await UsersModel.updateProfile(userId, {
      ...(firstName !== undefined ? { firstName } : {}),
      ...(lastName !== undefined ? { lastName } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      ...(address !== undefined ? { address } : {}),
      ...(city !== undefined ? { city } : {}),
      ...(state !== undefined ? { state } : {}),
      ...(country !== undefined ? { country } : {}),
      ...(postalCode !== undefined ? { postalCode } : {}),
    });

    if (!updated) throw new ValidationError('User not found');
    return updated;
  },
};