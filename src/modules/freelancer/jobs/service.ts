import { JobsModel } from './model';
import { ProfilesModel } from '../profiles/model';
import { ServicesModel } from '../services/model';

export const JobsService = {
  /** Customer sends a job letter to a specific freelancer. */
  async sendJobLetter(
    customerId: string,
    body: {
      customerEmail: string; petId: string; petName?: string;
      profileId?: string; serviceId?: string; message?: string;
      proposedSchedule?: string; mode?: string;
    },
  ) {
    const profileId = body.profileId;
    if (!profileId) return { status: 400, error: 'profileId required' };
    if (!body.petId) return { status: 400, error: 'petId required' };
    if (!body.customerEmail) return { status: 400, error: 'customerEmail required' };

    const profile = await ProfilesModel.getById(profileId);
    if (!profile) return { status: 404, error: 'Freelancer not found' };
    if (!profile.isActive) return { status: 422, error: 'Freelancer is not currently active' };

    // Resolve agreed price from the chosen service listing.
    let agreedPrice: string | undefined;
    if (body.serviceId) {
      const svc = await ServicesModel.findById(body.serviceId);
      if (!svc || svc.profileId !== profileId) return { status: 404, error: 'Service not found for this freelancer' };
      agreedPrice = svc.price;
    }

    const job = await JobsModel.insert({
      customerId,
      customerEmail: body.customerEmail,
      petId: body.petId,
      petName: body.petName,
      profileId,
      serviceId: body.serviceId,
      message: body.message,
      proposedSchedule: body.proposedSchedule,
      agreedPrice,
      mode: body.mode ?? 'manual',
    });
    return { data: { job } };
  },

  async listCustomerJobs(customerId: string) {
    return { data: { jobs: await JobsModel.listByCustomer(customerId) } };
  },

  async getCustomerJob(customerId: string, jobId: string) {
    const job = await JobsModel.findById(jobId);
    if (!job) return { status: 404, error: 'Job not found' };
    if (job.customerId !== customerId) return { status: 403, error: 'Not authorized' };
    return { data: { job } };
  },

  async listFreelancerJobs(accountId: string, status?: string) {
    const profile = await ProfilesModel.getByAccount(accountId);
    if (!profile) return { status: 404, error: 'Profile not found' };
    return { data: { jobs: await JobsModel.listByProfile(profile.id, status) } };
  },

  /** Freelancer accepts or declines a job. Accept → booking created. */
  async respond(accountId: string, jobId: string, action: 'accepted' | 'declined') {
    const profile = await ProfilesModel.getByAccount(accountId);
    if (!profile) return { status: 404, error: 'Profile not found' };

    const job = await JobsModel.findById(jobId);
    if (!job) return { status: 404, error: 'Job not found' };
    if (job.profileId !== profile.id) return { status: 403, error: 'Not authorized' };
    if (job.status !== 'sent') return { status: 422, error: `Job is already ${job.status}` };

    const updated = await JobsModel.setStatus(jobId, action, { respondedAt: new Date() });
    let booking = null;
    if (action === 'accepted') {
      booking = await JobsModel.createBooking({
        jobId: job.id,
        customerId: job.customerId,
        profileId: profile.id,
        scheduleAt: null,
      });
    }
    return { data: { job: updated, booking } };
  },
};
