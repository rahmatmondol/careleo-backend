import { eq } from 'drizzle-orm';
import { db } from '@/shared/db';
import { users } from '@/shared/db/schema';

export const UserModel = {
  /** Get current user profile by user id. */
  async getMe(userId: string) {
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return rows[0] ?? null;
  },

  /** Update current user profile fields by user id. */
  async updateMe(userId: string, payload: Record<string, unknown>) {
    await db
      .update(users)
      .set({
        ...(payload.firstName !== undefined ? { firstName: String(payload.firstName) } : {}),
        ...(payload.lastName !== undefined ? { lastName: String(payload.lastName) } : {}),
        ...(payload.phone !== undefined ? { phone: payload.phone ? String(payload.phone) : null } : {}),
        ...(payload.address !== undefined ? { address: payload.address ? String(payload.address) : null } : {}),
        ...(payload.city !== undefined ? { city: payload.city ? String(payload.city) : null } : {}),
        ...(payload.state !== undefined ? { state: payload.state ? String(payload.state) : null } : {}),
        ...(payload.country !== undefined ? { country: payload.country ? String(payload.country) : null } : {}),
        ...(payload.postalCode !== undefined ? { postalCode: payload.postalCode ? String(payload.postalCode) : null } : {}),
        ...(payload.avatarUrl !== undefined ? { avatarUrl: payload.avatarUrl ? String(payload.avatarUrl) : null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return this.getMe(userId);
  },
};
