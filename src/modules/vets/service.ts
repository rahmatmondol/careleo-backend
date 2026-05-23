import { NotFoundError, ValidationError } from '@/shared/errors';
import { VetsModel } from './model';

const asText = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  const v = String(value).trim();
  return v.length ? v : undefined;
};

export const VetsService = {
  /** Bootstraps vets module tables and seed data. */
  async ensureReady() {
    await VetsModel.ensureTables();
    await VetsModel.ensureSeedData();
  },

  /** List/search vets directory. */
  async listVets(query: Record<string, unknown>) {
    await this.ensureReady();
    const vets = await VetsModel.listVets({
      search: asText(query.search),
      location: asText(query.location),
      specialty: asText(query.specialty),
    });
    return { vets };
  },

  /** Get single vet profile. */
  async getVet(vetId: string) {
    await this.ensureReady();
    const vet = await VetsModel.getVetById(vetId);
    if (!vet) throw new NotFoundError('Vet not found');
    return { vet };
  },

  /** Get vet reviews. */
  async getVetReviews(vetId: string) {
    await this.ensureReady();
    const vet = await VetsModel.getVetById(vetId);
    if (!vet) throw new NotFoundError('Vet not found');
    const reviews = await VetsModel.listVetReviews(vetId);
    return { reviews };
  },

  /** Get vet services. */
  async getVetServices(vetId: string) {
    await this.ensureReady();
    const vet = await VetsModel.getVetById(vetId);
    if (!vet) throw new NotFoundError('Vet not found');
    const services = await VetsModel.listVetServices(vetId);
    return { services };
  },

  /** Get vet availability. */
  async getVetAvailability(vetId: string) {
    await this.ensureReady();
    const vet = await VetsModel.getVetById(vetId);
    if (!vet) throw new NotFoundError('Vet not found');
    const availability = await VetsModel.listVetAvailability(vetId);
    return { availability };
  },

  /** Book appointment (video or visit). */
  async bookAppointment(userId: string, vetId: string, type: 'video' | 'visit', payload: Record<string, unknown>) {
    await this.ensureReady();
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
    await this.ensureReady();
    const appointments = await VetsModel.listAppointmentsByUser(userId);
    return { appointments };
  },

  /** Get one appointment by id for current user. */
  async getAppointment(userId: string, appointmentId: string) {
    await this.ensureReady();
    const appointment = await VetsModel.getAppointmentById(userId, appointmentId);
    if (!appointment) throw new NotFoundError('Appointment not found');
    return { appointment };
  },

  /** Update appointment details. */
  async updateAppointment(userId: string, appointmentId: string, payload: Record<string, unknown>) {
    await this.ensureReady();
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
    await this.ensureReady();
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
    await this.ensureReady();
    const token = `call_${appointmentId}_${Date.now()}`;
    const appointment = await VetsModel.updateAppointmentById(userId, appointmentId, { status: 'in_call', callToken: token });
    if (!appointment) throw new NotFoundError('Appointment not found');
    return { message: 'Call started', appointment, token };
  },

  /** Retrieve call token for appointment. */
  async getCallToken(userId: string, appointmentId: string) {
    await this.ensureReady();
    const appointment = await VetsModel.getAppointmentById(userId, appointmentId);
    if (!appointment) throw new NotFoundError('Appointment not found');
    return { token: appointment.callToken ?? null };
  },

  /** List prescriptions for current user. */
  async listPrescriptions(userId: string) {
    await this.ensureReady();
    const prescriptions = await VetsModel.listPrescriptionsByUser(userId);
    return { prescriptions };
  },

  /** Get a single prescription. */
  async getPrescription(userId: string, prescriptionId: string) {
    await this.ensureReady();
    const prescription = await VetsModel.getPrescriptionById(userId, prescriptionId);
    if (!prescription) throw new NotFoundError('Prescription not found');
    return { prescription };
  },

  /** Request prescription refill. */
  async refillPrescription(userId: string, prescriptionId: string) {
    await this.ensureReady();
    const prescription = await VetsModel.refillPrescription(userId, prescriptionId);
    if (!prescription) throw new NotFoundError('Prescription not found');
    return { message: 'Refill requested successfully', prescription };
  },

  /** Create a review for vet. */
  async createReview(userId: string, vetId: string, payload: Record<string, unknown>) {
    await this.ensureReady();
    const vet = await VetsModel.getVetById(vetId);
    if (!vet) throw new NotFoundError('Vet not found');

    const rating = asText(payload.rating);
    if (!rating) throw new ValidationError('rating is required');

    const review = await VetsModel.createReview(userId, vetId, rating, asText(payload.comment));
    return { message: 'Review created successfully', review };
  },

  /** Update review by current user. */
  async updateReview(userId: string, reviewId: string, payload: Record<string, unknown>) {
    await this.ensureReady();
    const review = await VetsModel.updateReview(userId, reviewId, asText(payload.rating), asText(payload.comment));
    if (!review) throw new NotFoundError('Review not found');
    return { message: 'Review updated successfully', review };
  },

  /** Delete review by current user. */
  async deleteReview(userId: string, reviewId: string) {
    await this.ensureReady();
    await VetsModel.deleteReview(userId, reviewId);
    return { message: 'Review deleted successfully' };
  },
};
