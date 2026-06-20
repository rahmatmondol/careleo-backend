import { Elysia, t } from 'elysia';
import { SupportService } from './service';
import { fwd, requireUser } from '../../shared/http';

const ticketBody = t.Object({
  subject: t.String(),
  category: t.Optional(t.String()),
  relatedJobId: t.Optional(t.String()),
  priority: t.Optional(t.String()),
  message: t.Optional(t.String()),
});

export const supportController = new Elysia({ name: 'support-controller' }).group('/api/v1/freelancer', (app) =>
  app.guard({ beforeHandle: requireUser }, (g) =>
    g
      .post('/support/tickets', async ({ user, body, set }: any) => {
        // Determine raiserRole from token role field (customer/freelancer).
        const role = String(user!.role || '').toLowerCase() === 'freelancer' ? 'freelancer' : 'customer';
        return fwd(await SupportService.createTicket(user!.id, role, body as any), set);
      }, { body: ticketBody })
      .get('/support/tickets', async ({ user, set }: any) =>
        fwd(await SupportService.listTickets(user!.id), set))
      .get('/support/tickets/:id', async ({ user, params, set }: any) =>
        fwd(await SupportService.getTicket(user!.id, (params as any).id), set))
      .post('/support/tickets/:id/messages', async ({ user, body, params, set }: any) => {
        const role = String(user!.role || '').toLowerCase() === 'freelancer' ? 'freelancer' : 'customer';
        return fwd(await SupportService.sendMessage(user!.id, role, (params as any).id, (body as any).body), set);
      }, { body: t.Object({ body: t.String() }) })
  )
);
