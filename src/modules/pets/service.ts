import { ValidationError } from '@/shared/errors';
import { PetsModel } from './model';

const normalizeNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const normalizeText = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length ? text : undefined;
};

export const PetsService = {
  /** Create a pet. */
  async create(userId: string, payload: Record<string, unknown>) {
    const name = normalizeText(payload.name);
    const type = normalizeText(payload.type);
    if (!name || !type) throw new ValidationError('name and type are required');

    const created = await PetsModel.createPet({
      userId,
      name,
      type,
      breed: normalizeText(payload.breed),
      gender: normalizeText(payload.gender),
      dob: normalizeText(payload.dob),
      weight: normalizeNumber(payload.weight),
      photoUrl: normalizeText(payload.photoUrl),
      color: normalizeText(payload.color),
      microchipId: normalizeText(payload.microchipId),
      description: normalizeText(payload.description),
    });

    if (!created) throw new ValidationError('Failed to create pet');
    return { message: 'Pet created successfully', pet: created };
  },

  /** List authenticated user pets. */
  async list(userId: string) {
    const rows = await PetsModel.listByUser(userId);
    return { pets: rows };
  },

  /** Get single pet. */
  async get(userId: string, petId: string) {
    const row = await PetsModel.getById(userId, petId);
    if (!row) throw new ValidationError('Pet not found');
    return { pet: row };
  },

  /** Update pet. */
  async update(userId: string, petId: string, payload: Record<string, unknown>) {
    const updated = await PetsModel.updateById(userId, petId, {
      ...(payload.name !== undefined ? { name: normalizeText(payload.name) } : {}),
      ...(payload.type !== undefined ? { type: normalizeText(payload.type) } : {}),
      ...(payload.breed !== undefined ? { breed: normalizeText(payload.breed) } : {}),
      ...(payload.gender !== undefined ? { gender: normalizeText(payload.gender) } : {}),
      ...(payload.dob !== undefined ? { dob: normalizeText(payload.dob) } : {}),
      ...(payload.weight !== undefined ? { weight: normalizeNumber(payload.weight) } : {}),
      ...(payload.photoUrl !== undefined ? { photoUrl: normalizeText(payload.photoUrl) } : {}),
      ...(payload.color !== undefined ? { color: normalizeText(payload.color) } : {}),
      ...(payload.microchipId !== undefined ? { microchipId: normalizeText(payload.microchipId) } : {}),
      ...(payload.description !== undefined ? { description: normalizeText(payload.description) } : {}),
    });

    if (!updated) throw new ValidationError('Pet not found');
    return { message: 'Pet updated successfully', pet: updated };
  },

  /** Delete pet. */
  async remove(userId: string, petId: string) {
    const deleted = await PetsModel.deleteById(userId, petId);
    if (!deleted) throw new ValidationError('Pet not found');
    return { message: 'Pet deleted successfully' };
  },

  /** Add medical record for pet. */
  async addMedicalRecord(userId: string, petId: string, payload: Record<string, unknown>) {
    const title = normalizeText(payload.title);
    const date = normalizeText(payload.date);
    if (!title || !date) throw new ValidationError('title and date are required');

    const attachments = Array.isArray(payload.attachments)
      ? payload.attachments.map((item) => String(item)).filter(Boolean)
      : undefined;

    const created = await PetsModel.addMedicalRecord(userId, petId, {
      title,
      date,
      description: normalizeText(payload.description),
      vetName: normalizeText(payload.vetName),
      attachments,
    });

    if (!created) throw new ValidationError('Pet not found');
    return { message: 'Medical record added', record: created };
  },

  /** List pet medical records. */
  async listMedicalRecords(userId: string, petId: string) {
    const records = await PetsModel.listMedicalRecords(userId, petId);
    if (records === null) throw new ValidationError('Pet not found');
    return { records };
  },

  /** Get pet preferences. */
  async getPreferences(userId: string, petId: string) {
    const pet = await PetsModel.getById(userId, petId);
    if (!pet) throw new ValidationError('Pet not found');

    const preferences = await PetsModel.getPreferences(userId, petId);
    return { preferences: preferences ?? {} };
  },

  /** Create/update pet preferences. */
  async updatePreferences(userId: string, petId: string, payload: Record<string, unknown>) {
    const preferences = await PetsModel.upsertPreferences(userId, petId, {
      ...(payload.dietType !== undefined ? { dietType: normalizeText(payload.dietType) } : {}),
      ...(payload.activityLevel !== undefined ? { activityLevel: normalizeText(payload.activityLevel) } : {}),
      ...(payload.healthConditions !== undefined ? { healthConditions: normalizeText(payload.healthConditions) } : {}),
    });

    if (!preferences) throw new ValidationError('Pet not found');
    return { message: 'Preferences updated successfully', preferences };
  },
};
