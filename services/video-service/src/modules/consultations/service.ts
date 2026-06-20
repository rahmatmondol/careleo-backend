import { ConsultationsModel } from './model';
import type { CreateConsultationInput } from '../../types';

/** Business logic for video consultations. Returns `{ data }` on success or `{ status, error }` on failure. */
export const ConsultationsService = {
  async list(userId: string, query: { status?: string; vetId?: string }) {
    return { data: { consultations: await ConsultationsModel.listByUser(userId, query) } };
  },

  async get(userId: string, id: string) {
    const consultation = await ConsultationsModel.findById(userId, id);
    if (!consultation) return { status: 404, error: 'Consultation not found' };
    return { data: { consultation } };
  },

  async create(userId: string, input: CreateConsultationInput) {
    if (!input.vetId) return { status: 400, error: 'vetId is required' };
    if (!input.scheduledAt) return { status: 400, error: 'scheduledAt is required' };
    const consultation = await ConsultationsModel.insert({
      userId,
      vetId: input.vetId,
      petId: input.petId,
      scheduledAt: new Date(input.scheduledAt),
      notes: input.notes,
    });
    if (!consultation) return { status: 500, error: 'Failed to create consultation' };
    return { data: { consultation } };
  },

  async start(userId: string, id: string) {
    const consultation = await ConsultationsModel.findById(userId, id);
    if (!consultation) return { status: 404, error: 'Consultation not found' };
    const roomId = `room-${id}-${Date.now()}`;
    const updated = await ConsultationsModel.update(id, { status: 'IN_PROGRESS', startedAt: new Date(), roomId });
    return { data: { consultation: updated } };
  },

  async end(userId: string, id: string) {
    const consultation = await ConsultationsModel.findById(userId, id);
    if (!consultation) return { status: 404, error: 'Consultation not found' };
    const updated = await ConsultationsModel.update(id, { status: 'COMPLETED', endedAt: new Date() });
    return { data: { consultation: updated } };
  },

  async cancel(userId: string, id: string) {
    const consultation = await ConsultationsModel.findById(userId, id);
    if (!consultation) return { status: 404, error: 'Consultation not found' };
    const updated = await ConsultationsModel.update(id, { status: 'CANCELLED', endedAt: new Date() });
    return { data: { consultation: updated } };
  },

  /** Available 30-min slots (08:00–17:00) for a vet on a given date. */
  async vetSlots(vetId: string, date?: string) {
    const queryDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(queryDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(queryDate);
    endOfDay.setHours(23, 59, 59, 999);

    const booked = await ConsultationsModel.bookedSlots(vetId, startOfDay, endOfDay);

    const allSlots: string[] = [];
    for (let h = 8; h < 17; h++) {
      allSlots.push(`${String(h).padStart(2, '0')}:00`);
      allSlots.push(`${String(h).padStart(2, '0')}:30`);
    }

    const bookedTimes = new Set(
      booked.map((s) => {
        const d = new Date(s.scheduledAt);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }),
    );

    const availableSlots = allSlots.filter((slot) => !bookedTimes.has(slot));
    return { data: { vetId, date: queryDate.toISOString().split('T')[0], availableSlots } };
  },
};
