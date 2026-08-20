import { Elysia } from 'elysia';
import { requireAuth, requireRole } from '@/shared/auth/guards';
import { PetsService } from './service';

export const petsController = new Elysia({ name: 'pets-controller' }).group('/pets', (app) =>
  app
    /** List all pets across system for admin. */
    .get('/all', async (ctx: any) => {
      const { headers, jwt } = ctx;
      const authUser = await requireAuth(headers, jwt);
      requireRole(authUser, ['super_admin', 'admin', 'support']);
      return PetsService.listAllForAdmin();
    })
    /**
     * Get any pet by id for the admin panel.
     *
     * Separate from `GET /:id` because that one is owner-scoped: an admin
     * looking at a customer's pet is not its owner, so it 404s for them.
     * Declared before `/:id` so it is not swallowed by the wildcard.
     */
    .get('/admin/:id', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      const authUser = await requireAuth(headers, jwt);
      requireRole(authUser, ['super_admin', 'admin', 'support']);
      return PetsService.getForAdmin(String(params.id));
    })
    /** List all pets for authenticated user. */
    .get('', async (ctx: any) => {
      const { headers, jwt } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return PetsService.list(authUser.id);
    })
    /** Create a pet profile. */
    .post('', async (ctx: any) => {
      const { headers, jwt, body } = ctx;
      const authUser = await requireAuth(headers, jwt);
      const input = (body ?? {}) as Record<string, unknown>;
      const file = ((input as any)?.image || (input as any)?.file) as File | undefined;
      return PetsService.create(authUser.id, input, file);
    })
    /** Get pet by id. */
    .get('/:id', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return PetsService.get(authUser.id, String(params.id));
    })
    /** Update pet by id. */
    .put('/:id', async (ctx: any) => {
      const { headers, jwt, params, body } = ctx;
      const authUser = await requireAuth(headers, jwt);
      const input = (body ?? {}) as Record<string, unknown>;
      const file = ((input as any)?.image || (input as any)?.file) as File | undefined;
      return PetsService.update(authUser.id, String(params.id), input, file);
    })
    /** Upload pet image by id. */
    .post('/:id/image', async (ctx: any) => {
      const { headers, jwt, params, body } = ctx;
      const authUser = await requireAuth(headers, jwt);
      const file = ((body as any)?.image || (body as any)?.file) as File;
      return PetsService.uploadPetImage(authUser.id, String(params.id), file);
    })
    /** Phase-2 upload endpoint alias used by mobile upload pipeline doc. */
    .post('/:id/upload-image', async (ctx: any) => {
      const { headers, jwt, params, body } = ctx;
      const authUser = await requireAuth(headers, jwt);
      const file = ((body as any)?.image || (body as any)?.file) as File;
      return PetsService.uploadPetImage(authUser.id, String(params.id), file);
    })
    /** Delete pet by id. */
    .delete('/:id', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return PetsService.remove(authUser.id, String(params.id));
    })
    /** Add a medical record under pet id. */
    .post('/:id/medical-records', async (ctx: any) => {
      const { headers, jwt, params, body } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return PetsService.addMedicalRecord(authUser.id, String(params.id), body as Record<string, unknown>);
    })
    /** List medical records for pet id. */
    .get('/:id/medical-records', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return PetsService.listMedicalRecords(authUser.id, String(params.id));
    })
    /** Get preferences for pet id. */
    .get('/:id/preferences', async (ctx: any) => {
      const { headers, jwt, params } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return PetsService.getPreferences(authUser.id, String(params.id));
    })
    /** Update preferences for pet id. */
    .put('/:id/preferences', async (ctx: any) => {
      const { headers, jwt, params, body } = ctx;
      const authUser = await requireAuth(headers, jwt);
      return PetsService.updatePreferences(authUser.id, String(params.id), body as Record<string, unknown>);
    }),
);
