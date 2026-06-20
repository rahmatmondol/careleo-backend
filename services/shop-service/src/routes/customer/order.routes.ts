import { Elysia } from 'elysia';
import { getOrderByIdController, listOrdersController } from '../../controllers/customer/order.controller';

export const orderRoutes = new Elysia()
  .get('/api/v1/shop/orders', ({ user }) => listOrdersController(user))
  .get('/api/v1/shop/orders/:id', ({ user, params }) => getOrderByIdController(user, params));
