import { eq } from 'drizzle-orm';
import { db } from '@/shared/db';
import { users } from '@/shared/db/schema';
import { isIanaZone } from '@/shared/types/timezone';

/** A finite number inside ±`limit` — anything else is not a coordinate. */
const isCoordinate = (value: unknown, limit: number): boolean => {
  if (value === undefined || value === null || value === '') return false;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= limit;
};

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
        // Only accept a plausible IANA zone ("Area/Location"); the value is
        // interpolated into `AT TIME ZONE` by the scheduling job.
        ...(payload.timezone !== undefined && isIanaZone(payload.timezone)
          ? { timezone: String(payload.timezone) }
          : {}),
        // Home coordinates for weather-based care advice. Written only as a
        // pair, and only when both are in range — a half-set or nonsense
        // location would just make the advisory job fetch someone else's sky.
        ...(isCoordinate(payload.latitude, 90) && isCoordinate(payload.longitude, 180)
          ? {
              latitude: String(Number(payload.latitude).toFixed(6)),
              longitude: String(Number(payload.longitude).toFixed(6)),
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return this.getMe(userId);
  },
};
