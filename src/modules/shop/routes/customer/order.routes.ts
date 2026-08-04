import { shopBase } from '../../base';
import { getOrderByIdController, listOrdersController } from '../../controllers/customer/order.controller';

export const orderRoutes = shopBase()
  .get('/orders', ({ user }) => listOrdersController(user))
  .get('/orders/:id', ({ user, params }) => getOrderByIdController(user, params));
