import { t } from 'elysia';
import { shopBase } from '../../base';
import { createSubscriptionController, deleteSubscriptionController, listSubscriptionsController, updateSubscriptionController } from '../../controllers/customer/subscription.controller';

export const subscriptionRoutes = shopBase()
  .post('/subscriptions', ({ body, user }) => createSubscriptionController(user, body), { body: t.Object({ productId: t.String(), frequencyDays: t.Number(), quantity: t.Optional(t.Number()) }) })
  .get('/subscriptions', ({ user }) => listSubscriptionsController(user))
  .put('/subscriptions/:id', ({ user, params, body }) => updateSubscriptionController(user, params, body), { body: t.Object({ frequencyDays: t.Optional(t.Number()), isActive: t.Optional(t.Boolean()) }) })
  .delete('/subscriptions/:id', ({ user, params }) => deleteSubscriptionController(user, params));
