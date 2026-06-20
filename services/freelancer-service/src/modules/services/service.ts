import { ServicesModel } from './model';
import { ProfilesModel } from '../profiles/model';

const SERVICE_TYPES = ['walking', 'sitting', 'grooming', 'training', 'poop_scooping', 'other'];
const BILLING_PERIODS = ['per_walk', 'hourly', 'daily', 'monthly'];

export const ServicesService = {
  async listMine(accountId: string) {
    const profile = await ProfilesModel.getByAccount(accountId);
    if (!profile) return { status: 404, error: 'Profile not found' };
    return { data: { services: await ServicesModel.listByProfile(profile.id) } };
  },

  async createMine(
    accountId: string,
    body: { serviceType?: string; title?: string; description?: string; price?: number; billingPeriod?: string },
  ) {
    const profile = await ProfilesModel.getByAccount(accountId);
    if (!profile) return { status: 404, error: 'Profile not found' };

    const serviceType = body.serviceType ?? '';
    const title = body.title?.trim();
    if (!SERVICE_TYPES.includes(serviceType)) return { status: 400, error: 'Invalid service type' };
    if (!title) return { status: 400, error: 'Title required' };
    if (body.price === undefined || body.price < 0) return { status: 400, error: 'Valid price required' };
    const billingPeriod = body.billingPeriod ?? 'per_walk';
    if (!BILLING_PERIODS.includes(billingPeriod)) return { status: 400, error: 'Invalid billing period' };

    // New gigs start `pending` — an admin approves before it shows in search.
    const service = await ServicesModel.insert({
      profileId: profile.id, serviceType, title, description: body.description,
      price: String(body.price), billingPeriod,
    });
    return { data: { service } };
  },

  async updateMine(
    accountId: string, serviceId: string,
    body: { title?: string; description?: string; price?: number; billingPeriod?: string; isActive?: boolean },
  ) {
    const profile = await ProfilesModel.getByAccount(accountId);
    if (!profile) return { status: 404, error: 'Profile not found' };
    const service = await ServicesModel.findById(serviceId);
    if (!service) return { status: 404, error: 'Service not found' };
    if (service.profileId !== profile.id) return { status: 403, error: 'Not authorized' };

    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.price !== undefined) updateData.price = String(body.price);
    if (body.billingPeriod !== undefined) {
      if (!BILLING_PERIODS.includes(body.billingPeriod)) return { status: 400, error: 'Invalid billing period' };
      updateData.billingPeriod = body.billingPeriod;
    }
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (Object.keys(updateData).length === 0) return { status: 400, error: 'Nothing to update' };

    const updated = await ServicesModel.update(serviceId, updateData);
    return { data: { service: updated } };
  },

  async removeMine(accountId: string, serviceId: string) {
    const profile = await ProfilesModel.getByAccount(accountId);
    if (!profile) return { status: 404, error: 'Profile not found' };
    const service = await ServicesModel.findById(serviceId);
    if (!service) return { status: 404, error: 'Service not found' };
    if (service.profileId !== profile.id) return { status: 403, error: 'Not authorized' };
    await ServicesModel.remove(serviceId);
    return { data: { message: 'Service deleted' } };
  },

  async search(opts: { serviceType?: string; location?: string; minRating?: number; page: number; limit: number }) {
    const offset = (opts.page - 1) * opts.limit;
    const services = await ServicesModel.search({
      serviceType: opts.serviceType, location: opts.location, minRating: opts.minRating,
      limit: opts.limit, offset,
    });
    return { data: { services, page: opts.page, limit: opts.limit } };
  },
};
