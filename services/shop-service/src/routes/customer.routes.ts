import { Elysia } from 'elysia';
import { requireAuth } from '../middleware/auth';
import { wishlistRoutes } from './customer/wishlist.routes';
import { addressRoutes } from './customer/address.routes';
import { cartRoutes } from './customer/cart.routes';
import { orderRoutes } from './customer/order.routes';
import { subscriptionRoutes } from './customer/subscription.routes';
import { expenseRoutes } from './customer/expense.routes';

export const customerRoutes = new Elysia().guard({ beforeHandle: requireAuth }, (app) =>
  app
    .use(wishlistRoutes)
    .use(addressRoutes)
    .use(cartRoutes)
    .use(orderRoutes)
    .use(subscriptionRoutes)
    .use(expenseRoutes)
);
