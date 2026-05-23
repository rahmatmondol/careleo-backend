import { Elysia } from 'elysia';
import { requireAuth } from '@/shared/auth/guards';
import { PetsService } from './service';

export const petsController = new Elysia({ name: 'pets-controller' }).group('/pets', (app) =>
  app
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
      return PetsService.create(authUser.id, body as Record<string, unknown>);
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
      return PetsService.update(authUser.id, String(params.id), body as Record<string, unknown>);
    })
    /** Upload pet image by id. */
    .post('/:id/image', async (ctx: any) => {
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
