import { Elysia, t } from 'elysia';
import { addCartController, checkoutController, listCartController, removeCartController, updateCartController } from '../../controllers/customer/cart.controller';

export const cartRoutes = new Elysia()
  .get('/api/v1/shop/cart', ({ user }) => listCartController(user))
  .post('/api/v1/shop/cart', ({ body, user }) => addCartController(user, body), { body: t.Object({ productId: t.String(), quantity: t.Optional(t.Number()) }) })
  .put('/api/v1/shop/cart/:itemId', ({ params, body }) => updateCartController(params, body), { body: t.Object({ quantity: t.Number({ minimum: 0 }) }) })
  .delete('/api/v1/shop/cart/:itemId', ({ params }) => removeCartController(params))
  .post('/api/v1/shop/cart/checkout', ({ user }) => checkoutController(user));
