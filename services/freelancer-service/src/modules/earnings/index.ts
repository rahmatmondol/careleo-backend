import { Elysia } from 'elysia';
import { EarningsService } from './service';
import { fwd } from '../../shared/http';
import { requireFreelancer } from '../../middleware/auth';

export const earningsController = new Elysia({ name: 'earnings-controller' }).group('/api/v1/freelancer', (app) =>
  app.guard({ beforeHandle: requireFreelancer }, (g) =>
    g.get('/me/earnings', async ({ user, set }: any) =>
      fwd(await EarningsService.listMine(user!.id), set))
  )
);
