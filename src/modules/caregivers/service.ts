/**
 * Shared care: the people besides the owner who look after a pet.
 *
 * The point of this module is the backup alert. One person can miss a dose —
 * a household usually doesn't. When a critical task outlives the owner's whole
 * reminder ladder, the caregivers with alerts enabled get told, once.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/shared/db';
import { users } from '@/shared/db/schema';
import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import { CaregiversModel } from './model';

const RELATIONS = new Set(['family', 'co_owner', 'sitter', 'vet']);

const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();

const emailOf = async (userId: string): Promise<string> => {
  const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return normalizeEmail(row?.email);
};

const requireOwnership = async (petId: string, userId: string) => {
  const pet = await CaregiversModel.petOwnedBy(petId, userId);
  if (!pet) throw new NotFoundError('Pet not found');
  return pet;
};

export const CaregiversService = {
  async listForPet(userId: string, petId: string) {
    await requireOwnership(petId, userId);
    return { caregivers: await CaregiversModel.listForPet(petId) };
  },

  async invite(userId: string, petId: string, payload: Record<string, unknown>) {
    const pet = await requireOwnership(petId, userId);

    const invitedEmail = normalizeEmail(payload.email);
    if (!invitedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitedEmail)) {
      throw new ValidationError('A valid email is required');
    }
    if (invitedEmail === (await emailOf(userId))) {
      throw new ValidationError('You already own this pet');
    }

    const relation = String(payload.relation ?? 'family').trim().toLowerCase();
    if (!RELATIONS.has(relation)) {
      throw new ValidationError(`relation must be one of ${[...RELATIONS].join(', ')}`);
    }

    // If that email already has an account, link it now so alerts work the
    // moment the invite is accepted.
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, invitedEmail))
      .limit(1);

    const row = await CaregiversModel.invite({
      petId,
      invitedEmail,
      invitedBy: userId,
      relation,
      alertsEnabled: payload.alertsEnabled === undefined ? true : Boolean(payload.alertsEnabled),
    });

    if (row && existingUser) await CaregiversModel.update(row.id, { userId: existingUser.id });

    return {
      message: `Invite sent to ${invitedEmail}`,
      caregiver: row,
      petName: pet.name,
      hasAccount: Boolean(existingUser),
    };
  },

  async update(userId: string, caregiverId: string, payload: Record<string, unknown>) {
    const row = await CaregiversModel.getById(caregiverId);
    if (!row) throw new NotFoundError('Caregiver not found');
    await requireOwnership(row.petId, userId);

    const patch: Record<string, unknown> = {};
    if (payload.alertsEnabled !== undefined) patch.alertsEnabled = Boolean(payload.alertsEnabled);
    if (payload.relation !== undefined) {
      const relation = String(payload.relation).trim().toLowerCase();
      if (!RELATIONS.has(relation)) throw new ValidationError('Invalid relation');
      patch.relation = relation;
    }
    if (!Object.keys(patch).length) return { caregiver: row };

    return { caregiver: await CaregiversModel.update(caregiverId, patch) };
  },

  async remove(userId: string, caregiverId: string) {
    const row = await CaregiversModel.getById(caregiverId);
    if (!row) throw new NotFoundError('Caregiver not found');
    await requireOwnership(row.petId, userId);

    // Revoked rather than deleted so the same person can be re-invited without
    // tripping the unique index, and so the history survives.
    await CaregiversModel.update(caregiverId, { status: 'revoked', alertsEnabled: false });
    return { message: 'Caregiver removed' };
  },

  /** Invites addressed to the signed-in user, plus the pets they already help with. */
  async myInvites(userId: string) {
    const email = await emailOf(userId);
    if (!email) return { invites: [], pets: [] };

    await CaregiversModel.claimInvites(userId, email);

    return {
      invites: await CaregiversModel.listInvitesForEmail(email),
      pets: await CaregiversModel.listPetsForCaregiver(userId),
    };
  },

  async respond(userId: string, caregiverId: string, accept: boolean) {
    const row = await CaregiversModel.getById(caregiverId);
    if (!row) throw new NotFoundError('Invite not found');

    const email = await emailOf(userId);
    if (normalizeEmail(row.invitedEmail) !== email) throw new ForbiddenError('This invite is not yours');
    if (row.status !== 'pending') throw new ValidationError('This invite has already been answered');

    const updated = await CaregiversModel.update(caregiverId, {
      userId,
      status: accept ? 'accepted' : 'declined',
      acceptedAt: accept ? new Date() : null,
    });

    return { message: accept ? 'Invite accepted' : 'Invite declined', caregiver: updated };
  },
};
