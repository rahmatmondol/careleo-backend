import { Elysia, t } from 'elysia';
import {
  listOrdersController,
  getOrderController,
  updateOrderStatusController,
} from '../../controllers/admin/order.controller';

export const adminOrderRoutes = new Elysia()
  .get('/api/v1/shop/admin/orders', ({ query }) => listOrdersController(query))
  .get('/api/v1/shop/admin/orders/:id', ({ params, set }) => getOrderController(params, set))
  .put('/api/v1/shop/admin/orders/:id/status', ({ params, body, set }) => updateOrderStatusController(params, body, set), {
    body: t.Object({ status: t.String() }),
  });
