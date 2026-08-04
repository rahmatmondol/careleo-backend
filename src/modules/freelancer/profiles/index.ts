import { Elysia, t } from 'elysia';
import { ProfilesService } from './service';
import { fwd } from '@/shared/http/service-result';
import { requireFreelancer } from '@/shared/auth/domain-auth';

const profileBody = t.Object({
  bio: t.Optional(t.String()),
  location: t.Optional(t.String()),
  serviceTypes: t.Optional(t.Array(t.String())),
  avatarUrl: t.Optional(t.String()),
  isActive: t.Optional(t.Boolean()),
});

export const profilesController = new Elysia({ name: 'freelancer-profiles-controller' }).group('/freelancer', (app) =>
  app
    // ─── Public ─────────────────────────────────────────────
    .get('/freelancers/:id', async ({ params, set }: any) =>
      fwd(await ProfilesService.getPublic((params as any).id), set))

    // ─── Freelancer self-service ────────────────────────────
    .guard({ beforeHandle: requireFreelancer }, (g) =>
      g
        .get('/me/profile', async ({ user, set }: any) =>
          fwd(await ProfilesService.getMine(user!.id), set))
        .put('/me/profile', async ({ user, body, set }: any) =>
          fwd(await ProfilesService.updateMine(user!.id, body as any), set), { body: profileBody })
    )
);
