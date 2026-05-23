import { Elysia } from 'elysia';
import { requireAuth, requirePermission } from '@/shared/auth/guards';
import { AdoptionService } from './service';

export const adoptionController = new Elysia({ name: 'adoption-controller' }).group('/adoption', (app) =>
  app
    /** Browse adoption pets. */
    .get('/pets', async ({ query }) => AdoptionService.listPets((query ?? {}) as Record<string, unknown>))
    /** Get adoption pet details. */
    .get('/pets/:id', async ({ params }) => AdoptionService.getPet(String((params as any).id)))
    /** Submit adoption application for selected pet. */
    .post('/pets/:id/apply', async (ctx: any) => {
      const { headers, jwt, params, body } = ctx;
      const user = await requireAuth(headers, jwt);
      return AdoptionService.apply(user.id, String(params.id), (body ?? {}) as Record<string, unknown>);
    })
    /** List current user's adoption applications. */
    .get('/applications', async ({ headers, jwt }: any) => {
      const user = await requireAuth(headers, jwt);
      return AdoptionService.listApplications(user.id);
    })
    /** Get one current user's adoption application. */
    .get('/applications/:id', async ({ headers, jwt, params }: any) => {
      const user = await requireAuth(headers, jwt);
      return AdoptionService.getApplication(user.id, String(params.id));
    })
    /** Submit compatibility quiz answers. */
    .post('/compatibility-quiz', async ({ headers, jwt, body }: any) => {
      const user = await requireAuth(headers, jwt);
      return AdoptionService.submitCompatibilityQuiz(user.id, (body ?? {}) as Record<string, unknown>);
    })
    /** Get personalized pet recommendations. */
    .get('/recommendations', async ({ headers, jwt }: any) => {
      const user = await requireAuth(headers, jwt);
      return AdoptionService.getRecommendations(user.id);
    })
    /** Browse shelters. */
    .get('/shelters', async () => AdoptionService.listShelters())
    /** Get shelter details. */
    .get('/shelters/:id', async ({ params }) => AdoptionService.getShelter(String((params as any).id))),
);

export const adminAdoptionController = new Elysia({ name: 'admin-adoption-controller' }).group('/admin/adoption', (app) =>
  app
    /** Admin: create shelter. */
    .post('/shelters', async ({ headers, jwt, body }: any) => {
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.write');
      return AdoptionService.adminCreateShelter((body ?? {}) as Record<string, unknown>);
    })
    /** Admin: create adoption pet listing. */
    .post('/pets', async ({ headers, jwt, body }: any) => {
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.write');
      return AdoptionService.adminCreatePet((body ?? {}) as Record<string, unknown>);
    })
    /** Admin: list all applications. */
    .get('/applications', async ({ headers, jwt, query }: any) => {
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.read');
      return AdoptionService.adminListApplications((query ?? {}) as Record<string, unknown>);
    })
    /** Admin: change application status. */
    .put('/applications/:id/status', async ({ headers, jwt, params, body }: any) => {
      const user = await requireAuth(headers, jwt);
      requirePermission(user, 'orders.write');
      return AdoptionService.adminUpdateApplicationStatus(String(params.id), (body ?? {}) as Record<string, unknown>);
    }),
);
