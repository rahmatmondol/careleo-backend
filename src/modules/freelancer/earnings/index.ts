import { Elysia } from 'elysia';
import { EarningsService } from './service';
import { fwd } from '@/shared/http/service-result';
import { requireFreelancer } from '@/shared/auth/domain-auth';

export const earningsController = new Elysia({ name: 'freelancer-earnings-controller' }).group('/freelancer', (app) =>
  app.guard({ beforeHandle: requireFreelancer }, (g) =>
    g.get('/me/earnings', async ({ user, set }: any) =>
      fwd(await EarningsService.listMine(user!.id), set))
  )
);
