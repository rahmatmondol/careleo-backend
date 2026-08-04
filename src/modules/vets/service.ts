import { NotFoundError, ValidationError } from '@/shared/errors';
import { VetsModel } from './model';

const asText = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  const v = String(value).trim();
  return v.length ? v : undefined;
};

/** Indexed by `Date#getDay()`, matched against `vet_availability.day_of_week`. */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const SLOT_MINUTES = 30;

/** "10:30" -> 630. Returns null for anything that is not HH:MM. */
const toMinutes = (hhmm?: string | null) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? '').trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
};

/** 630 -> "10:30". */
const toHHMM = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Shape a vet row for customers.
 *
 * `qualificationsJson` is a storage detail, and `status` is a roster field the
 * app has no use for — it only ever sees active vets. Contact details stay:
 * a directory listing is what they are for.
 */
const publicVet = (vet: any) => {
  const { qualificationsJson, status, ...rest } = vet;
  let qualifications: string[] = [];
  try {
    const parsed = qualificationsJson ? JSON.parse(qualificationsJson) : [];
    if (Array.isArray(parsed)) qualifications = parsed.map(String);
  } catch {
    qualifications = [];
  }
  return { ...rest, qualifications };
};

export const VetsService = {
  /**
   * List/search the vets directory.
   *
   * Only `active` vets — the admin roster holds `inactive` and `on_leave` ones
   * too, and offering those to customers would produce bookings nobody is going
   * to take.
   */
  async listVets(query: Record<string, unknown>) {
    const vets = await VetsModel.listVets({
      search: asText(query.search),
      location: asText(query.location),
      specialty: asText(query.specialty),
      status: 'active',
    });
    return { vets: vets.map(publicVet) };
  },

  /**
   * Get single vet profile.
   *
   * Deliberately not filtered by status: a customer with an existing appointment
   * needs to see the vet's profile even after the admin marks them on leave.
   */
  async getVet(vetId: string) {
    const vet = await VetsModel.getVetById(vetId);
    if (!vet) throw new NotFoundError('Vet not found');
    return { vet: publicVet(vet) };
  },

  /** Get vet reviews, each with the reviewer's display name. */
  async getVetReviews(vetId: string) {
    const vet = await VetsModel.getVetById(vetId);
    if (!vet) throw new NotFoundError('Vet not found');
    const rows = await VetsModel.listVetReviews(vetId);

    const reviews = rows.map(({ authorFirstName, authorLastName, authorAvatarUrl, ...rest }) => ({
      ...rest,
      authorName: [authorFirstName, authorLastName].filter(Boolean).join(' ').trim() || 'CareLeo user',
      authorAvatarUrl,
    }));

    return { reviews };
  },

  /** Get vet services. */
  async getVetServices(vetId: string) {
    const vet = await VetsModel.getVetById(vetId);
    if (!vet) throw new NotFoundError('Vet not found');
    const services = await VetsModel.listVetServices(vetId);
    return { services };
  },

  /** Get vet availability. */
  async getVetAvailability(vetId: string) {
    const vet = await VetsModel.getVetById(vetId);
    if (!vet) throw new NotFoundError('Vet not found');
    const availability = await VetsModel.listVetAvailability(vetId);
    return { availability };
  },

  /**
   * Bookable 30-minute slots for a vet on one date.
   *
   * Derived from the vet's own `vet_availability` rows for that weekday, minus
   * anything already booked, minus times that have already passed today. The
   * removed video module hard-coded 08:00–17:00 for every vet and ignored
   * availability entirely, so it happily offered slots vets did not work.
   */
  async getVetSlots(vetId: string, date?: string, mode?: 'video' | 'visit') {
    const vet = await VetsModel.getVetById(vetId);
    if (!vet) throw new NotFoundError('Vet not found');

    const day = asText(date) || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new ValidationError('date must be YYYY-MM-DD');

    // Parse as local midnight — `new Date('2026-08-06')` is parsed as UTC and
    // can land on the previous weekday west of Greenwich.
    const [y, m, d] = day.split('-').map(Number);
    const target = new Date(y, m - 1, d);
    if (Number.isNaN(target.getTime())) throw new ValidationError('Invalid date');

    const weekday = DAY_NAMES[target.getDay()];
    const windows = (await VetsModel.listVetAvailability(vetId)).filter((row) => {
      if (row.dayOfWeek?.toLowerCase() !== weekday.toLowerCase()) return false;
      if (!mode) return true;
      const rowMode = (row.mode ?? 'both').toLowerCase();
      return rowMode === 'both' || rowMode === mode;
    });

    const booked = new Set(
      (await VetsModel.bookedAppointmentTimes(vetId, day)).map((iso) => iso.slice(11, 16)),
    );

    const now = new Date();
    const isToday = target.toDateString() === now.toDateString();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const availableSlots: string[] = [];
    for (const window of windows) {
      const start = toMinutes(window.startTime);
      const end = toMinutes(window.endTime);
      if (start === null || end === null) continue;
      for (let t = start; t + SLOT_MINUTES <= end; t += SLOT_MINUTES) {
        const label = toHHMM(t);
        if (booked.has(label)) continue;
        if (isToday && t <= nowMinutes) continue;
        if (!availableSlots.includes(label)) availableSlots.push(label);
      }
    }
    availableSlots.sort();

    return { vetId, date: day, availableSlots };
  },

  /** Book appointment (video or visit). */
  async bookAppointment(userId: string, vetId: string, type: 'video' | 'visit', payload: Record<string, unknown>) {
    const vet = await VetsModel.getVetById(vetId);
    if (!vet) throw new NotFoundError('Vet not found');

    const appointmentAt = asText(payload.appointmentAt) || asText(payload.dateTime);
    if (!appointmentAt) throw new ValidationError('appointmentAt is required');

    const appointment = await VetsModel.createAppointment({
      userId,
      vetId,
      type,
      appointmentAt,
      petId: asText(payload.petId),
      reason: asText(payload.reason),
      notes: asText(payload.notes),
    });

    return { message: 'Appointment booked successfully', appointment };
  },

  /** List current user's appointments. */
  async listAppointments(userId: string) {
    const appointments = await VetsModel.listAppointmentsByUser(userId);
    return { appointments };
  },

  /** Get one appointment by id for current user. */
  async getAppointment(userId: string, appointmentId: string) {
    const appointment = await VetsModel.getAppointmentById(userId, appointmentId);
    if (!appointment) throw new NotFoundError('Appointment not found');
    return { appointment };
  },

  /** Update appointment details. */
  async updateAppointment(userId: string, appointmentId: string, payload: Record<string, unknown>) {
    const appointment = await VetsModel.updateAppointmentById(userId, appointmentId, {
      appointmentAt: asText(payload.appointmentAt),
      reason: asText(payload.reason),
      notes: asText(payload.notes),
      status: asText(payload.status),
    });
    if (!appointment) throw new NotFoundError('Appointment not found');
    return { message: 'Appointment updated successfully', appointment };
  },

  /** Delete appointment. */
  async deleteAppointment(userId: string, appointmentId: string) {
    const current = await VetsModel.getAppointmentById(userId, appointmentId);
    if (!current) throw new NotFoundError('Appointment not found');
    await VetsModel.deleteAppointmentById(userId, appointmentId);
    return { message: 'Appointment deleted successfully' };
  },

  /** Reschedule appointment. */
  async rescheduleAppointment(userId: string, appointmentId: string, payload: Record<string, unknown>) {
    const appointmentAt = asText(payload.appointmentAt) || asText(payload.dateTime);
    if (!appointmentAt) throw new ValidationError('appointmentAt is required');
    return this.updateAppointment(userId, appointmentId, { appointmentAt, status: 'rescheduled' });
  },

  /** Cancel appointment. */
  async cancelAppointment(userId: string, appointmentId: string) {
    return this.updateAppointment(userId, appointmentId, { status: 'cancelled' });
  },

  /** Start video call and issue temporary token. */
  async startCall(userId: string, appointmentId: string) {
    const token = `call_${appointmentId}_${Date.now()}`;
    const appointment = await VetsModel.updateAppointmentById(userId, appointmentId, { status: 'in_call', callToken: token });
    if (!appointment) throw new NotFoundError('Appointment not found');
    return { message: 'Call started', appointment, token };
  },

  /** Retrieve call token for appointment. */
  async getCallToken(userId: string, appointmentId: string) {
    const appointment = await VetsModel.getAppointmentById(userId, appointmentId);
    if (!appointment) throw new NotFoundError('Appointment not found');
    return { token: appointment.callToken ?? null };
  },

  /** List prescriptions for current user. */
  async listPrescriptions(userId: string) {
    const prescriptions = await VetsModel.listPrescriptionsByUser(userId);
    return { prescriptions };
  },

  /** Get a single prescription. */
  async getPrescription(userId: string, prescriptionId: string) {
    const prescription = await VetsModel.getPrescriptionById(userId, prescriptionId);
    if (!prescription) throw new NotFoundError('Prescription not found');
    return { prescription };
  },

  /** Request prescription refill. */
  async refillPrescription(userId: string, prescriptionId: string) {
    const prescription = await VetsModel.refillPrescription(userId, prescriptionId);
    if (!prescription) throw new NotFoundError('Prescription not found');
    return { message: 'Refill requested successfully', prescription };
  },

  /** Create a review for vet. */
  async createReview(userId: string, vetId: string, payload: Record<string, unknown>) {
    const vet = await VetsModel.getVetById(vetId);
    if (!vet) throw new NotFoundError('Vet not found');

    const rating = asText(payload.rating);
    if (!rating) throw new ValidationError('rating is required');

    const review = await VetsModel.createReview(userId, vetId, rating, asText(payload.comment));
    return { message: 'Review created successfully', review };
  },

  /** Update review by current user. */
  async updateReview(userId: string, reviewId: string, payload: Record<string, unknown>) {
    const review = await VetsModel.updateReview(userId, reviewId, asText(payload.rating), asText(payload.comment));
    if (!review) throw new NotFoundError('Review not found');
    return { message: 'Review updated successfully', review };
  },

  /** Delete review by current user. */
  async deleteReview(userId: string, reviewId: string) {
    await VetsModel.deleteReview(userId, reviewId);
    return { message: 'Review deleted successfully' };
  },
};
