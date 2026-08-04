import { Elysia } from 'elysia';
import { requireAuth, requirePermission } from '@/shared/auth/guards';
import { VetsAdminService } from './admin-service';

/**
 * `/api/v1/vets/admin/*` — vet roster management for the admin panel.
 *
 * Registered as its own controller ahead of `vetsController` so that
 * `/vets/admin/...` is matched before the public `/vets/:id` catches `admin` as
 * an id.
 *
 * Reads need `vets.read` (support has it), writes need `vets.write` (admin and
 * super_admin only).
 */

const readGuard = async (ctx: any) => {
  const user = await requireAuth(ctx.headers, ctx.jwt);
  requirePermission(user, 'vets.read');
  return user;
};

const writeGuard = async (ctx: any) => {
  const user = await requireAuth(ctx.headers, ctx.jwt);
  requirePermission(user, 'vets.write');
  return user;
};

const body = (ctx: any) => (ctx.body ?? {}) as Record<string, unknown>;
const query = (ctx: any) => (ctx.query ?? {}) as Record<string, unknown>;

export const vetsAdminController = new Elysia({ name: 'vets-admin-controller' }).group('/vets/admin', (app) =>
  app
    // ─── Appointments ────────────────────────────────────────────────────────
    // Declared before `/:id` so the literal segment wins.
    .get('/appointments', async (ctx: any) => {
      await readGuard(ctx);
      return VetsAdminService.listAppointments(query(ctx));
    })
    .patch('/appointments/:appointmentId', async (ctx: any) => {
      await writeGuard(ctx);
      return VetsAdminService.updateAppointment(String(ctx.params.appointmentId), body(ctx));
    })

    // ─── Availability & services by their own id ─────────────────────────────
    .patch('/availability/:availabilityId', async (ctx: any) => {
      await writeGuard(ctx);
      return VetsAdminService.updateAvailability(String(ctx.params.availabilityId), body(ctx));
    })
    .delete('/availability/:availabilityId', async (ctx: any) => {
      await writeGuard(ctx);
      return VetsAdminService.deleteAvailability(String(ctx.params.availabilityId));
    })
    .patch('/services/:serviceId', async (ctx: any) => {
      await writeGuard(ctx);
      return VetsAdminService.updateService(String(ctx.params.serviceId), body(ctx));
    })
    .delete('/services/:serviceId', async (ctx: any) => {
      await writeGuard(ctx);
      return VetsAdminService.deleteService(String(ctx.params.serviceId));
    })

    // ─── Vets ────────────────────────────────────────────────────────────────
    .get('', async (ctx: any) => {
      await readGuard(ctx);
      return VetsAdminService.listVets(query(ctx));
    })
    .post('', async (ctx: any) => {
      await writeGuard(ctx);
      return VetsAdminService.createVet(body(ctx));
    })
    .get('/:id', async (ctx: any) => {
      await readGuard(ctx);
      return VetsAdminService.getVet(String(ctx.params.id));
    })
    .patch('/:id', async (ctx: any) => {
      await writeGuard(ctx);
      return VetsAdminService.updateVet(String(ctx.params.id), body(ctx));
    })
    .delete('/:id', async (ctx: any) => {
      await writeGuard(ctx);
      return VetsAdminService.deleteVet(String(ctx.params.id));
    })

    // ─── Per-vet sub-resources ───────────────────────────────────────────────
    .get('/:id/availability', async (ctx: any) => {
      await readGuard(ctx);
      return VetsAdminService.listAvailability(String(ctx.params.id));
    })
    .post('/:id/availability', async (ctx: any) => {
      await writeGuard(ctx);
      return VetsAdminService.createAvailability(String(ctx.params.id), body(ctx));
    })
    .get('/:id/services', async (ctx: any) => {
      await readGuard(ctx);
      return VetsAdminService.listServices(String(ctx.params.id));
    })
    .post('/:id/services', async (ctx: any) => {
      await writeGuard(ctx);
      return VetsAdminService.createService(String(ctx.params.id), body(ctx));
    })
    .get('/:id/appointments', async (ctx: any) => {
      await readGuard(ctx);
      return VetsAdminService.listAppointments({ ...query(ctx), vetId: String(ctx.params.id) });
    }),
);
