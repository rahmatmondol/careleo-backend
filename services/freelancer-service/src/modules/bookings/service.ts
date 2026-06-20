import { BookingsModel } from './model';
import { ProfilesModel } from '../profiles/model';
import { EarningsModel } from '../earnings/model';
import { JobsModel } from '../jobs/model';

export const BookingsService = {
  async listMineCustomer(customerId: string) {
    return { data: { bookings: await BookingsModel.listByCustomer(customerId) } };
  },

  async listMineFreelancer(accountId: string) {
    const profile = await ProfilesModel.getByAccount(accountId);
    if (!profile) return { status: 404, error: 'Profile not found' };
    return { data: { bookings: await BookingsModel.listByProfile(profile.id) } };
  },

  /** Freelancer marks booking as complete → earnings record created. */
  async complete(accountId: string, bookingId: string) {
    const profile = await ProfilesModel.getByAccount(accountId);
    if (!profile) return { status: 404, error: 'Profile not found' };

    const booking = await BookingsModel.findById(bookingId);
    if (!booking) return { status: 404, error: 'Booking not found' };
    if (booking.profileId !== profile.id) return { status: 403, error: 'Not authorized' };
    if (booking.status === 'completed') return { status: 422, error: 'Booking already completed' };
    if (booking.status === 'cancelled') return { status: 422, error: 'Booking is cancelled' };

    // Resolve amount from the job's agreed price.
    const job = await JobsModel.findById(booking.jobId);
    const amount = Number(job?.agreedPrice ?? 0);
    const feePct = 10;
    const platformFee = +(amount * feePct / 100).toFixed(2);
    const netAmount = +(amount - platformFee).toFixed(2);

    const [updated] = await Promise.all([
      BookingsModel.setStatus(bookingId, 'completed'),
      EarningsModel.insert({
        profileId: profile.id,
        jobId: booking.jobId,
        amount: String(amount),
        platformFeePct: String(feePct),
        platformFee: String(platformFee),
        netAmount: String(netAmount),
      }),
      JobsModel.setStatus(booking.jobId, 'completed', { completedAt: new Date() }),
    ]);
    return { data: { booking: updated } };
  },

  async leaveReview(
    customerId: string,
    bookingId: string,
    body: { rating?: number; comment?: string },
  ) {
    const booking = await BookingsModel.findById(bookingId);
    if (!booking) return { status: 404, error: 'Booking not found' };
    if (booking.customerId !== customerId) return { status: 403, error: 'Not authorized' };
    if (booking.status !== 'completed') return { status: 422, error: 'Can only review completed bookings' };
    if (await BookingsModel.findReviewByBooking(bookingId)) return { status: 409, error: 'Review already submitted' };

    const rating = Number(body.rating);
    if (!rating || rating < 1 || rating > 5) return { status: 400, error: 'Rating must be 1-5' };

    const review = await BookingsModel.insertReview({
      bookingId, customerId, profileId: booking.profileId, rating, comment: body.comment,
    });
    return { data: { review } };
  },
};
