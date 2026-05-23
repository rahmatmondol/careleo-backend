import { NotFoundError, ValidationError } from '@/shared/errors';
import { AdoptionModel } from './model';

const asText = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  const v = String(value).trim();
  return v.length ? v : undefined;
};

const normalizeRecommendationFromAnswers = (answers: Record<string, unknown>) => {
  const homeType = String(answers.homeType ?? '').toLowerCase();
  const activity = String(answers.activityLevel ?? '').toLowerCase();

  if (activity.includes('high')) return 'dog';
  if (homeType.includes('apartment')) return 'cat';
  return 'dog';
};

export const AdoptionService = {
  /** Bootstraps adoption tables if not already present. */
  async ensureReady() {
    await AdoptionModel.ensureTables();
  },

  /** List public adoption pets. */
  async listPets(query: Record<string, unknown>) {
    await this.ensureReady();
    const type = asText(query.type);
    const pets = await AdoptionModel.listPets(type);
    return { pets };
  },

  /** Get one public adoption pet. */
  async getPet(petId: string) {
    await this.ensureReady();
    const pet = await AdoptionModel.getPetById(petId);
    if (!pet) throw new NotFoundError('Adoption pet not found');
    return { pet };
  },

  /** Submit adoption application for a pet. */
  async apply(userId: string, petId: string, payload: Record<string, unknown>) {
    await this.ensureReady();
    const pet = await AdoptionModel.getPetById(petId);
    if (!pet) throw new NotFoundError('Adoption pet not found');
    if (pet.status !== 'available') throw new ValidationError('Pet is not available for adoption');

    const message = asText(payload.message);
    const application = await AdoptionModel.createApplication(userId, petId, message);
    return { message: 'Application submitted successfully', application };
  },

  /** List current user applications. */
  async listApplications(userId: string) {
    await this.ensureReady();
    const applications = await AdoptionModel.listApplicationsByUser(userId);
    return { applications };
  },

  /** Get one current user application by id. */
  async getApplication(userId: string, applicationId: string) {
    await this.ensureReady();
    const application = await AdoptionModel.getApplicationById(userId, applicationId);
    if (!application) throw new NotFoundError('Application not found');
    return { application };
  },

  /** Submit compatibility quiz and return recommendation. */
  async submitCompatibilityQuiz(userId: string, payload: Record<string, unknown>) {
    await this.ensureReady();
    const answers = (payload.answers as Record<string, unknown>) ?? payload;
    const recommendedType = normalizeRecommendationFromAnswers(answers);
    const score = '80';

    const result = await AdoptionModel.createQuizResult(userId, answers, recommendedType, score);
    return {
      message: 'Compatibility quiz submitted',
      result: {
        id: result?.id,
        recommendedType,
        score,
        answers,
      },
    };
  },

  /** Return user-tailored adoption recommendations. */
  async getRecommendations(userId: string) {
    await this.ensureReady();
    const latestQuiz = await AdoptionModel.getLatestQuizResult(userId);
    const preferredType = latestQuiz?.recommendedType;
    const pets = await AdoptionModel.listPets(preferredType || undefined);
    return { preferredType: preferredType ?? null, pets };
  },

  /** List shelters directory. */
  async listShelters() {
    await this.ensureReady();
    const shelters = await AdoptionModel.listShelters();
    return { shelters };
  },

  /** Get one shelter profile by id. */
  async getShelter(shelterId: string) {
    await this.ensureReady();
    const shelter = await AdoptionModel.getShelterById(shelterId);
    if (!shelter) throw new NotFoundError('Shelter not found');
    return { shelter };
  },

  /** Admin: create shelter entry. */
  async adminCreateShelter(payload: Record<string, unknown>) {
    await this.ensureReady();
    const name = asText(payload.name);
    if (!name) throw new ValidationError('name is required');

    const shelter = await AdoptionModel.createShelter({
      name,
      city: asText(payload.city),
      state: asText(payload.state),
      country: asText(payload.country),
      address: asText(payload.address),
      phone: asText(payload.phone),
      email: asText(payload.email),
      description: asText(payload.description),
    });

    return { message: 'Shelter created successfully', shelter };
  },

  /** Admin: create adoption pet listing. */
  async adminCreatePet(payload: Record<string, unknown>) {
    await this.ensureReady();
    const name = asText(payload.name);
    const type = asText(payload.type);
    if (!name || !type) throw new ValidationError('name and type are required');

    const pet = await AdoptionModel.createAdoptionPet({
      shelterId: asText(payload.shelterId),
      name,
      type,
      breed: asText(payload.breed),
      gender: asText(payload.gender),
      age: asText(payload.age),
      size: asText(payload.size),
      color: asText(payload.color),
      description: asText(payload.description),
      photoUrl: asText(payload.photoUrl),
      status: asText(payload.status),
    });

    return { message: 'Adoption pet created successfully', pet };
  },

  /** Admin: list all applications. */
  async adminListApplications(query: Record<string, unknown>) {
    await this.ensureReady();
    const status = asText(query.status);
    const applications = await AdoptionModel.listAllApplications(status);
    return { applications };
  },

  /** Admin: update application status. */
  async adminUpdateApplicationStatus(applicationId: string, payload: Record<string, unknown>) {
    await this.ensureReady();
    const status = asText(payload.status);
    if (!status) throw new ValidationError('status is required');

    const application = await AdoptionModel.updateApplicationStatus(applicationId, status);
    if (!application) throw new NotFoundError('Application not found');
    return { message: 'Application status updated successfully', application };
  },
};
