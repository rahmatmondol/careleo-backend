import { NotFoundError, ValidationError } from '@/shared/errors';
import { VetsModel } from './model';

/**
 * Admin-side vet management.
 *
 * Split from `service.ts` because the two have different rules: everything
 * there is scoped to the signed-in customer, everything here is guarded by the
 * `vets.read` / `vets.write` permissions instead and can touch any row.
 *
 * Vets are a directory, not accounts — there is no `vet` role and no login for
 * them, so this is the only way a vet's profile, availability or appointment
 * status ever changes.
 */

const VET_STATUSES = ['active', 'inactive', 'on_leave'] as const;
type VetStatus = (typeof VET_STATUSES)[number];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const AVAILABILITY_MODES = ['both', 'video', 'visit'];

const asText = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  const v = String(value).trim();
  return v.length ? v : undefined;
};

/** Accepts "Active", "on leave", "ON_LEAVE" — the admin UI has used all three. */
const asStatus = (value: unknown): VetStatus | undefined => {
  const v = asText(value)?.toLowerCase().replace(/[\s-]+/g, '_');
  if (!v) return undefined;
  if (!(VET_STATUSES as readonly string[]).includes(v)) {
    throw new ValidationError(`status must be one of: ${VET_STATUSES.join(', ')}`);
  }
  return v as VetStatus;
};

const asBool = (value: unknown) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const v = String(value).toLowerCase();
  return v === 'true' || v === '1';
};

const asInt = (value: unknown) => {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new ValidationError('experienceYears must be a non-negative number');
  return Math.floor(n);
};

/** Stored as a JSON array string; accepts either an array or "DVM, MS Surgery". */
const asQualifications = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  const list = Array.isArray(value)
    ? value.map((v) => String(v).trim())
    : String(value).split(',').map((v) => v.trim());
  return JSON.stringify(list.filter(Boolean));
};

const asTime = (value: unknown, field: string) => {
  const v = asText(value);
  if (!v) return undefined;
  if (!/^\d{1,2}:\d{2}$/.test(v)) throw new ValidationError(`${field} must be HH:MM (24-hour)`);
  const [h, m] = v.split(':').map(Number);
  if (h > 23 || m > 59) throw new ValidationError(`${field} is not a valid time`);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const asDayOfWeek = (value: unknown) => {
  const v = asText(value);
  if (!v) return undefined;
  const match = DAY_NAMES.find((d) => d.toLowerCase() === v.toLowerCase());
  if (!match) throw new ValidationError(`dayOfWeek must be one of: ${DAY_NAMES.join(', ')}`);
  return match;
};

const asMode = (value: unknown) => {
  const v = asText(value)?.toLowerCase();
  if (!v) return undefined;
  if (!AVAILABILITY_MODES.includes(v)) {
    throw new ValidationError(`mode must be one of: ${AVAILABILITY_MODES.join(', ')}`);
  }
  return v;
};

const clampLimit = (value: unknown, fallback = 20) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), 100);
};

/** `qualificationsJson` is storage detail; callers get a real array. */
const present = (vet: any) => {
  if (!vet) return vet;
  const { qualificationsJson, ...rest } = vet;
  let qualifications: string[] = [];
  try {
    const parsed = qualificationsJson ? JSON.parse(qualificationsJson) : [];
    if (Array.isArray(parsed)) qualifications = parsed.map(String);
  } catch {
    qualifications = [];
  }
  return { ...rest, qualifications };
};

export const VetsAdminService = {
  // ─── Vets ──────────────────────────────────────────────────────────────────

  async listVets(query: Record<string, unknown>) {
    const limit = clampLimit(query.limit);
    const page = Math.max(1, Number(query.page) || 1);

    const { rows, total } = await VetsModel.adminListVets({
      search: asText(query.search),
      status: asStatus(query.status),
      specialty: asText(query.specialty),
      limit,
      offset: (page - 1) * limit,
    });

    return { vets: rows.map(present), total, page, limit };
  },

  /** Vet profile plus everything the admin detail page renders in one call. */
  async getVet(vetId: string) {
    const vet = await VetsModel.getVetById(vetId);
    if (!vet) throw new NotFoundError('Vet not found');

    const [services, availability, stats] = await Promise.all([
      VetsModel.listVetServices(vetId),
      VetsModel.listVetAvailability(vetId),
      VetsModel.adminVetStats(vetId),
    ]);

    return { vet: present(vet), services, availability, stats };
  },

  async createVet(payload: Record<string, unknown>) {
    const fullName = asText(payload.fullName) ?? asText(payload.name);
    if (!fullName) throw new ValidationError('fullName is required');

    const vet = await VetsModel.createVet({
      fullName,
      bio: asText(payload.bio) ?? asText(payload.about),
      specialty: asText(payload.specialty) ?? asText(payload.specialization),
      location: asText(payload.location),
      consultationFee: asText(payload.consultationFee),
      avatarUrl: asText(payload.avatarUrl) ?? asText(payload.avatar),
      email: asText(payload.email),
      phone: asText(payload.phone),
      status: asStatus(payload.status) ?? 'active',
      experienceYears: asInt(payload.experienceYears) ?? asInt(payload.experience) ?? 0,
      qualificationsJson: asQualifications(payload.qualifications) ?? '[]',
      isAvailable: asBool(payload.isAvailable) ?? true,
    });

    if (!vet) throw new ValidationError('Could not create vet');
    return { message: 'Vet created successfully', vet: present(vet) };
  },

  async updateVet(vetId: string, payload: Record<string, unknown>) {
    const existing = await VetsModel.getVetById(vetId);
    if (!existing) throw new NotFoundError('Vet not found');

    // Only assign what was actually sent — a PATCH with one field must not null
    // out the rest of the profile.
    const values: Record<string, unknown> = {};
    const set = (key: string, value: unknown) => {
      if (value !== undefined) values[key] = value;
    };

    set('fullName', asText(payload.fullName) ?? asText(payload.name));
    set('bio', asText(payload.bio) ?? asText(payload.about));
    set('specialty', asText(payload.specialty) ?? asText(payload.specialization));
    set('location', asText(payload.location));
    set('consultationFee', asText(payload.consultationFee));
    set('avatarUrl', asText(payload.avatarUrl) ?? asText(payload.avatar));
    set('email', asText(payload.email));
    set('phone', asText(payload.phone));
    set('status', asStatus(payload.status));
    set('experienceYears', asInt(payload.experienceYears) ?? asInt(payload.experience));
    set('qualificationsJson', asQualifications(payload.qualifications));
    set('isAvailable', asBool(payload.isAvailable));

    if (!Object.keys(values).length) return { message: 'Nothing to update', vet: present(existing) };

    const vet = await VetsModel.updateVet(vetId, values);
    return { message: 'Vet updated successfully', vet: present(vet) };
  },

  async deleteVet(vetId: string) {
    const existing = await VetsModel.getVetById(vetId);
    if (!existing) throw new NotFoundError('Vet not found');
    await VetsModel.deleteVet(vetId);
    return { message: 'Vet deleted successfully' };
  },

  // ─── Availability ──────────────────────────────────────────────────────────

  async listAvailability(vetId: string) {
    const vet = await VetsModel.getVetById(vetId);
    if (!vet) throw new NotFoundError('Vet not found');
    return { availability: await VetsModel.listVetAvailability(vetId) };
  },

  async createAvailability(vetId: string, payload: Record<string, unknown>) {
    const vet = await VetsModel.getVetById(vetId);
    if (!vet) throw new NotFoundError('Vet not found');

    const dayOfWeek = asDayOfWeek(payload.dayOfWeek);
    const startTime = asTime(payload.startTime, 'startTime');
    const endTime = asTime(payload.endTime, 'endTime');

    if (!dayOfWeek) throw new ValidationError('dayOfWeek is required');
    if (!startTime) throw new ValidationError('startTime is required');
    if (!endTime) throw new ValidationError('endTime is required');
    // A window that ends before it starts silently produces zero slots, which
    // looks like "this vet has no availability" rather than a bad input.
    if (startTime >= endTime) throw new ValidationError('endTime must be after startTime');

    const availability = await VetsModel.createAvailability({
      vetId,
      dayOfWeek,
      startTime,
      endTime,
      mode: asMode(payload.mode) ?? 'both',
    });

    return { message: 'Availability added', availability };
  },

  async updateAvailability(availabilityId: string, payload: Record<string, unknown>) {
    const existing = await VetsModel.getAvailabilityById(availabilityId);
    if (!existing) throw new NotFoundError('Availability not found');

    const values: Record<string, unknown> = {};
    const dayOfWeek = asDayOfWeek(payload.dayOfWeek);
    const startTime = asTime(payload.startTime, 'startTime');
    const endTime = asTime(payload.endTime, 'endTime');
    const mode = asMode(payload.mode);

    if (dayOfWeek !== undefined) values.dayOfWeek = dayOfWeek;
    if (startTime !== undefined) values.startTime = startTime;
    if (endTime !== undefined) values.endTime = endTime;
    if (mode !== undefined) values.mode = mode;

    if (!Object.keys(values).length) return { message: 'Nothing to update', availability: existing };

    // Validate against the merged result, not just what was sent — a PATCH of
    // only `startTime` can still invert the window.
    const nextStart = (values.startTime as string) ?? existing.startTime;
    const nextEnd = (values.endTime as string) ?? existing.endTime;
    if (nextStart >= nextEnd) throw new ValidationError('endTime must be after startTime');

    const availability = await VetsModel.updateAvailability(availabilityId, values);
    return { message: 'Availability updated', availability };
  },

  async deleteAvailability(availabilityId: string) {
    const existing = await VetsModel.getAvailabilityById(availabilityId);
    if (!existing) throw new NotFoundError('Availability not found');
    await VetsModel.deleteAvailability(availabilityId);
    return { message: 'Availability removed' };
  },

  // ─── Services ──────────────────────────────────────────────────────────────

  async listServices(vetId: string) {
    const vet = await VetsModel.getVetById(vetId);
    if (!vet) throw new NotFoundError('Vet not found');
    return { services: await VetsModel.listVetServices(vetId) };
  },

  async createService(vetId: string, payload: Record<string, unknown>) {
    const vet = await VetsModel.getVetById(vetId);
    if (!vet) throw new NotFoundError('Vet not found');

    const name = asText(payload.name);
    if (!name) throw new ValidationError('name is required');

    const service = await VetsModel.createService({
      vetId,
      name,
      description: asText(payload.description),
      fee: asText(payload.fee),
    });

    return { message: 'Service added', service };
  },

  async updateService(serviceId: string, payload: Record<string, unknown>) {
    const existing = await VetsModel.getServiceById(serviceId);
    if (!existing) throw new NotFoundError('Service not found');

    const values: Record<string, unknown> = {};
    if (asText(payload.name) !== undefined) values.name = asText(payload.name);
    if (asText(payload.description) !== undefined) values.description = asText(payload.description);
    if (asText(payload.fee) !== undefined) values.fee = asText(payload.fee);

    if (!Object.keys(values).length) return { message: 'Nothing to update', service: existing };

    const service = await VetsModel.updateService(serviceId, values);
    return { message: 'Service updated', service };
  },

  async deleteService(serviceId: string) {
    const existing = await VetsModel.getServiceById(serviceId);
    if (!existing) throw new NotFoundError('Service not found');
    await VetsModel.deleteService(serviceId);
    return { message: 'Service removed' };
  },

  // ─── Appointments ──────────────────────────────────────────────────────────

  async listAppointments(query: Record<string, unknown>) {
    const limit = clampLimit(query.limit);
    const page = Math.max(1, Number(query.page) || 1);

    const { rows, total } = await VetsModel.adminListAppointments({
      vetId: asText(query.vetId),
      userId: asText(query.userId),
      status: asText(query.status),
      type: asText(query.type),
      limit,
      offset: (page - 1) * limit,
    });

    // Collapse the joined owner columns into one name the table can print.
    const appointments = rows.map(({ ownerFirstName, ownerLastName, ...rest }) => ({
      ...rest,
      ownerName: [ownerFirstName, ownerLastName].filter(Boolean).join(' ').trim() || null,
    }));

    return { appointments, total, page, limit };
  },

  /** Status override + note from the admin side; the customer path is owner-scoped. */
  async updateAppointment(appointmentId: string, payload: Record<string, unknown>) {
    const values: Record<string, unknown> = {};
    if (asText(payload.status) !== undefined) values.status = asText(payload.status);
    if (asText(payload.notes) !== undefined) values.notes = asText(payload.notes);
    if (asText(payload.appointmentAt) !== undefined) values.appointmentAt = asText(payload.appointmentAt);
    if (asText(payload.followUpAt) !== undefined) values.followUpAt = asText(payload.followUpAt);

    if (!Object.keys(values).length) throw new ValidationError('Nothing to update');

    const appointment = await VetsModel.adminUpdateAppointment(appointmentId, values);
    if (!appointment) throw new NotFoundError('Appointment not found');
    return { message: 'Appointment updated successfully', appointment };
  },
};
