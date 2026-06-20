import { NotFoundError, UnauthorizedError, ValidationError } from '@/shared/errors';
import { PetsModel } from '@/modules/pets/model';
import { can } from '@/modules/subscriptions/entitlements';
import { RemindersService } from '@/modules/reminders/service';
import { VaccinationsModel, type VaccinationRow } from './model';

const assertOwnership = async (userId: string, petId: string) => {
  const pet = await PetsModel.getById(userId, petId);
  if (!pet) throw new NotFoundError('Pet not found');
  return pet;
};

export const VaccinationsService = {
  list: async (userId: string, petId: string): Promise<VaccinationRow[]> => {
    await assertOwnership(userId, petId);
    return VaccinationsModel.listForPet(petId);
  },

  /**
   * Add a vaccination record. Gated by vaccination_mgmt. If a dueAt is given,
   * also set a one-off reminder so the owner is nudged when it's due.
   */
  add: async (userId: string, petId: string, body: Record<string, unknown>): Promise<VaccinationRow> => {
    await assertOwnership(userId, petId);
    if (!(await can(userId, 'vaccination_mgmt'))) {
      throw new UnauthorizedError('Vaccination management is not included in your plan');
    }
    const vaccineName = String(body.vaccineName ?? '').trim();
    if (!vaccineName) throw new ValidationError('vaccineName is required');

    const givenAt = body.givenAt != null ? String(body.givenAt) : null;
    const dueAt = body.dueAt != null ? String(body.dueAt) : null;
    const status = givenAt && !dueAt ? 'completed' : 'due';

    const row = await VaccinationsModel.create({
      petId,
      userId,
      vaccineName,
      givenAt,
      dueAt,
      status,
      notes: body.notes != null ? String(body.notes) : null,
    });

    // Best-effort reminder when there's a due date.
    if (dueAt) {
      try {
        await RemindersService.create(userId, {
          petId,
          title: `${vaccineName} vaccine due`,
          reminderType: 'vaccination',
          frequency: 'Once',
          reminderDate: dueAt,
          notes: 'Vaccination due — consider booking a vet.',
        });
      } catch {
        // Reminder is a convenience; never fail the vaccination create on it.
      }
    }
    return row;
  },
};
