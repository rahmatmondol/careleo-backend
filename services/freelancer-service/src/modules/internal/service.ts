import { InternalModel } from './model';
import { JobsService } from '../jobs/service';

export const InternalService = {
  /**
   * Create a job letter on behalf of a customer — called by careleo-backend
   * AI tools (list_freelancers, send_job_letter).
   */
  async createJob(body: {
    customerId: string; customerEmail: string; petId: string; petName?: string;
    profileId: string; serviceId?: string; message?: string; proposedSchedule?: string;
  }) {
    if (!body.customerId || !body.customerEmail || !body.petId || !body.profileId) {
      return { status: 400, error: 'customerId, customerEmail, petId, profileId required' };
    }
    return JobsService.sendJobLetter(body.customerId, { ...body, mode: 'manual' });
  },

  /**
   * Premium auto-hire: find the best freelancer for a service type, create a
   * job, and immediately auto-accept it → booking created.
   */
  async autoHire(body: {
    customerId: string; customerEmail: string; petId: string; petName?: string; serviceType?: string;
  }) {
    const serviceType = body.serviceType?.toLowerCase();
    if (!serviceType) return { status: 400, error: 'serviceType required' };
    if (!body.customerId || !body.customerEmail || !body.petId) {
      return { status: 400, error: 'customerId, customerEmail, petId required' };
    }

    const best = await InternalModel.bestForServiceType(serviceType);
    if (!best) return { status: 404, error: `No available freelancer for service type: ${serviceType}` };

    const svc = await InternalModel.getServiceByProfile(best.profileId, serviceType);
    const acc = await InternalModel.getAccountById(best.accountId);

    const jobResult = await JobsService.sendJobLetter(body.customerId, {
      customerEmail: body.customerEmail,
      petId: body.petId,
      petName: body.petName,
      profileId: best.profileId,
      serviceId: svc?.id,
      message: `Auto-hire for ${serviceType}`,
      mode: 'auto',
    });
    if (jobResult.status) return jobResult;

    const job = jobResult.data!.job!;
    // Auto-accept on behalf of the freelancer.
    // We call the DB directly (not through the freelancer's service layer) to
    // bypass the role check that normally requires a freelancer token.
    const { JobsModel } = await import('../jobs/model');
    const updated = await JobsModel.setStatus(job.id, 'accepted', { respondedAt: new Date() });
    const booking = await JobsModel.createBooking({
      jobId: job.id, customerId: body.customerId, profileId: best.profileId, scheduleAt: null,
    });

    return { data: { job: updated, booking, freelancer: { profileId: best.profileId, displayName: acc?.displayName } } };
  },

  /**
   * List freelancers available for a service type — used by the AI
   * `list_freelancers` tool.
   */
  async listForServiceType(serviceType: string, location?: string) {
    const { ServicesModel } = await import('../services/model');
    const results = await ServicesModel.search({
      serviceType, location, limit: 10, offset: 0,
    });
    return { data: { freelancers: results } };
  },
};
