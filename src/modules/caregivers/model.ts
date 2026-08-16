import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { db } from '@/shared/db';
import { petCaregivers, pets, users } from '@/shared/db/schema';

export const CaregiversModel = {
  async petOwnedBy(petId: string, userId: string) {
    const [row] = await db
      .select({ id: pets.id, name: pets.name })
      .from(pets)
      .where(and(eq(pets.id, petId), eq(pets.userId, userId)))
      .limit(1);
    return row ?? null;
  },

  async getById(id: string) {
    const [row] = await db.select().from(petCaregivers).where(eq(petCaregivers.id, id)).limit(1);
    return row ?? null;
  },

  /** Everyone invited to help with a pet, joined to their account when they have one. */
  async listForPet(petId: string) {
    return db
      .select({
        id: petCaregivers.id,
        petId: petCaregivers.petId,
        userId: petCaregivers.userId,
        invitedEmail: petCaregivers.invitedEmail,
        relation: petCaregivers.relation,
        status: petCaregivers.status,
        alertsEnabled: petCaregivers.alertsEnabled,
        acceptedAt: petCaregivers.acceptedAt,
        createdAt: petCaregivers.createdAt,
        firstName: users.firstName,
        lastName: users.lastName,
        avatarUrl: users.avatarUrl,
      })
      .from(petCaregivers)
      .leftJoin(users, eq(petCaregivers.userId, users.id))
      .where(and(eq(petCaregivers.petId, petId), ne(petCaregivers.status, 'revoked')));
  },

  async findForPetAndEmail(petId: string, email: string) {
    const [row] = await db
      .select()
      .from(petCaregivers)
      .where(and(eq(petCaregivers.petId, petId), eq(petCaregivers.invitedEmail, email)))
      .limit(1);
    return row ?? null;
  },

  async invite(payload: {
    petId: string;
    invitedEmail: string;
    invitedBy: string;
    relation: string;
    alertsEnabled: boolean;
  }) {
    // Re-inviting somebody who was revoked (or who declined) reopens the same
    // row — the unique index is on (pet, email).
    const rows = await db
      .insert(petCaregivers)
      .values({ ...payload, status: 'pending' })
      .onConflictDoUpdate({
        target: [petCaregivers.petId, petCaregivers.invitedEmail],
        set: {
          status: 'pending',
          relation: payload.relation,
          alertsEnabled: payload.alertsEnabled,
          invitedBy: payload.invitedBy,
          acceptedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return rows[0] ?? null;
  },

  async update(id: string, patch: Partial<{ relation: string; alertsEnabled: boolean; status: string; userId: string; acceptedAt: Date | null }>) {
    const rows = await db
      .update(petCaregivers)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(petCaregivers.id, id))
      .returning();
    return rows[0] ?? null;
  },

  /** Pending invites addressed to this email, with pet + inviter for display. */
  async listInvitesForEmail(email: string) {
    return db
      .select({
        id: petCaregivers.id,
        petId: petCaregivers.petId,
        relation: petCaregivers.relation,
        status: petCaregivers.status,
        createdAt: petCaregivers.createdAt,
        petName: pets.name,
        petPhotoUrl: pets.photoUrl,
        ownerFirstName: users.firstName,
        ownerLastName: users.lastName,
      })
      .from(petCaregivers)
      .innerJoin(pets, eq(petCaregivers.petId, pets.id))
      .innerJoin(users, eq(petCaregivers.invitedBy, users.id))
      .where(and(eq(petCaregivers.invitedEmail, email), eq(petCaregivers.status, 'pending')));
  },

  /** Pets somebody helps with (accepted invites only). */
  async listPetsForCaregiver(userId: string) {
    return db
      .select({
        id: pets.id,
        name: pets.name,
        type: pets.type,
        breed: pets.breed,
        photoUrl: pets.photoUrl,
        relation: petCaregivers.relation,
        ownerId: pets.userId,
      })
      .from(petCaregivers)
      .innerJoin(pets, eq(petCaregivers.petId, pets.id))
      .where(and(eq(petCaregivers.userId, userId), eq(petCaregivers.status, 'accepted')));
  },

  /**
   * Who should get the backup alert when the owner misses something critical:
   * accepted caregivers, with alerts on, who have an account to push to.
   */
  async alertRecipients(petId: string): Promise<string[]> {
    const rows = await db
      .select({ userId: petCaregivers.userId })
      .from(petCaregivers)
      .where(
        and(
          eq(petCaregivers.petId, petId),
          eq(petCaregivers.status, 'accepted'),
          eq(petCaregivers.alertsEnabled, true),
          isNotNull(petCaregivers.userId),
        ),
      );
    return rows.map((r) => String(r.userId)).filter(Boolean);
  },

  /** Same, for several pets at once. */
  async alertRecipientsForPets(petIds: string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (!petIds.length) return out;

    const rows = await db
      .select({ petId: petCaregivers.petId, userId: petCaregivers.userId })
      .from(petCaregivers)
      .where(
        and(
          inArray(petCaregivers.petId, petIds),
          eq(petCaregivers.status, 'accepted'),
          eq(petCaregivers.alertsEnabled, true),
          isNotNull(petCaregivers.userId),
        ),
      );

    for (const row of rows) {
      const list = out.get(row.petId) ?? [];
      list.push(String(row.userId));
      out.set(row.petId, list);
    }
    return out;
  },

  /**
   * Attach a newly registered account to invites that were addressed to its
   * email. Called on accept, so an invite sent before signup still works.
   */
  async claimInvites(userId: string, email: string) {
    await db
      .update(petCaregivers)
      .set({ userId, updatedAt: new Date() })
      .where(and(eq(petCaregivers.invitedEmail, email), eq(petCaregivers.status, 'pending')));
  },
};
