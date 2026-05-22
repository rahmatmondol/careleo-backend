import { eq } from 'drizzle-orm';
import { db } from '@/shared/db';
import { users } from '@/shared/db/schema';

export const UsersModel = {
  /** Get user profile by id from DB. */
  async getProfileById(userId: string) {
    const rows = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
        avatarUrl: users.avatarUrl,
        address: users.address,
        city: users.city,
        state: users.state,
        country: users.country,
        postalCode: users.postalCode,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return rows[0] ?? null;
  },

  /** Update editable user profile fields. */
  async updateProfile(
    userId: string,
    payload: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      avatarUrl?: string;
      address?: string;
      city?: string;
      state?: string;
      country?: string;
      postalCode?: string;
    },
  ) {
    await db
      .update(users)
      .set({
        ...payload,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return this.getProfileById(userId);
  },
};