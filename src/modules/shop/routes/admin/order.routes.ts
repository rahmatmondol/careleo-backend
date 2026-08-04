import { t } from 'elysia';
import { shopBase } from '../../base';
import {
  listOrdersController,
  getOrderController,
  updateOrderStatusController,
} from '../../controllers/admin/order.controller';

export const adminOrderRoutes = shopBase()
  .get('/admin/orders', ({ query }) => listOrdersController(query))
  .get('/admin/orders/:id', ({ params, set }) => getOrderController(params, set))
  .put('/admin/orders/:id/status', ({ params, body, set }) => updateOrderStatusController(params, body, set), {
    body: t.Object({ status: t.String() }),
  });
