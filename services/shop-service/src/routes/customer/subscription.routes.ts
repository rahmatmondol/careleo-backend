import { Elysia, t } from 'elysia';
import { createSubscriptionController, deleteSubscriptionController, listSubscriptionsController, updateSubscriptionController } from '../../controllers/customer/subscription.controller';

export const subscriptionRoutes = new Elysia()
  .post('/api/v1/shop/subscriptions', ({ body, user }) => createSubscriptionController(user, body), { body: t.Object({ productId: t.String(), frequencyDays: t.Number(), quantity: t.Optional(t.Number()) }) })
  .get('/api/v1/shop/subscriptions', ({ user }) => listSubscriptionsController(user))
  .put('/api/v1/shop/subscriptions/:id', ({ user, params, body }) => updateSubscriptionController(user, params, body), { body: t.Object({ frequencyDays: t.Optional(t.Number()), isActive: t.Optional(t.Boolean()) }) })
  .delete('/api/v1/shop/subscriptions/:id', ({ user, params }) => deleteSubscriptionController(user, params));
