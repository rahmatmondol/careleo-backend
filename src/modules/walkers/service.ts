import { NotFoundError, ValidationError } from '@/shared/errors';
import { WalkersModel } from './model';

const asText = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  const v = String(value).trim();
  return v.length ? v : undefined;
};

export const WalkersService = {
  /** Bootstraps walkers/sitters tables and seed data. */
  async ensureReady() {
    await WalkersModel.ensureTables();
    await WalkersModel.ensureSeedData();
  },

  /** List walkers with optional location filter. */
  async listWalkers(query: Record<string, unknown>) {
    await this.ensureReady();
    const walkers = await WalkersModel.listWalkers(asText(query.location));
    return { walkers };
  },

  /** Get single walker profile. */
  async getWalker(id: string) {
    await this.ensureReady();
    const walker = await WalkersModel.getWalkerById(id);
    if (!walker) throw new NotFoundError('Walker not found');
    return { walker };
  },

  /** Nearby walkers alias endpoint. */
  async listNearbyWalkers(query: Record<string, unknown>) {
    return this.listWalkers(query);
  },

  /** List sitters with optional location filter. */
  async listSitters(query: Record<string, unknown>) {
    await this.ensureReady();
    const sitters = await WalkersModel.listSitters(asText(query.location));
    return { sitters };
  },

  /** Get single sitter profile. */
  async getSitter(id: string) {
    await this.ensureReady();
    const sitter = await WalkersModel.getSitterById(id);
    if (!sitter) throw new NotFoundError('Sitter not found');
    return { sitter };
  },

  /** Nearby sitters alias endpoint. */
  async listNearbySitters(query: Record<string, unknown>) {
    return this.listSitters(query);
  },

  /** Create booking for walker/sitter. */
  async book(userId: string, providerType: 'walker' | 'sitter', providerId: string, payload: Record<string, unknown>) {
    await this.ensureReady();

    if (providerType === 'walker') {
      const walker = await WalkersModel.getWalkerById(providerId);
      if (!walker) throw new NotFoundError('Walker not found');
    } else {
      const sitter = await WalkersModel.getSitterById(providerId);
      if (!sitter) throw new NotFoundError('Sitter not found');
    }

    const scheduleAt = asText(payload.scheduleAt) || asText(payload.dateTime);
    if (!scheduleAt) throw new ValidationError('scheduleAt is required');

    const booking = await WalkersModel.createBooking({
      userId,
      providerType,
      providerId,
      petId: asText(payload.petId),
      scheduleAt,
      notes: asText(payload.notes),
    });

    return { message: 'Booking created successfully', booking };
  },

  /** List current user bookings. */
  async listBookings(userId: string) {
    await this.ensureReady();
    const bookings = await WalkersModel.listBookingsByUser(userId);
    return { bookings };
  },

  /** Get one current user booking. */
  async getBooking(userId: string, bookingId: string) {
    await this.ensureReady();
    const booking = await WalkersModel.getBookingById(userId, bookingId);
    if (!booking) throw new NotFoundError('Booking not found');
    return { booking };
  },

  /** Update current user booking. */
  async updateBooking(userId: string, bookingId: string, payload: Record<string, unknown>) {
    await this.ensureReady();
    const booking = await WalkersModel.updateBookingById(userId, bookingId, {
      scheduleAt: asText(payload.scheduleAt),
      notes: asText(payload.notes),
      status: asText(payload.status),
    });
    if (!booking) throw new NotFoundError('Booking not found');
    return { message: 'Booking updated successfully', booking };
  },

  /** Delete current user booking. */
  async deleteBooking(userId: string, bookingId: string) {
    await this.ensureReady();
    const current = await WalkersModel.getBookingById(userId, bookingId);
    if (!current) throw new NotFoundError('Booking not found');
    await WalkersModel.deleteBookingById(userId, bookingId);
    return { message: 'Booking deleted successfully' };
  },

  /** Cancel booking for current user. */
  async cancelBooking(userId: string, bookingId: string) {
    return this.updateBooking(userId, bookingId, { status: 'cancelled' });
  },

  /** Mark booking as completed. */
  async completeBooking(userId: string, bookingId: string) {
    return this.updateBooking(userId, bookingId, { status: 'completed' });
  },

  /** Attach review to a completed booking. */
  async reviewBooking(userId: string, bookingId: string, payload: Record<string, unknown>) {
    await this.ensureReady();
    const booking = await WalkersModel.getBookingById(userId, bookingId);
    if (!booking) throw new NotFoundError('Booking not found');

    const rating = asText(payload.rating);
    if (!rating) throw new ValidationError('rating is required');

    const review = await WalkersModel.createBookingReview(userId, bookingId, rating, asText(payload.comment));
    return { message: 'Review submitted successfully', review };
  },
};
