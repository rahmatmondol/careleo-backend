import { Elysia, t } from 'elysia';
import { addCartController, checkoutController, listCartController, removeCartController, updateCartController } from '../../controllers/customer/cart.controller';

export const cartRoutes = new Elysia()
  .get('/api/v1/shop/cart', ({ user }) => listCartController(user))
  .post('/api/v1/shop/cart', ({ body, user }) => addCartController(user, body), { body: t.Object({ productId: t.String(), quantity: t.Optional(t.Number()) }) })
  .put('/api/v1/shop/cart/:itemId', ({ user, params, body }) => updateCartController(user, params, body), { body: t.Object({ quantity: t.Number({ minimum: 0 }) }) })
  .delete('/api/v1/shop/cart/:itemId', ({ user, params }) => removeCartController(user, params))
  .post('/api/v1/shop/cart/checkout', ({ user, body }) => checkoutController(user, body), { body: t.Optional(t.Object({ shippingAddress: t.Optional(t.String()), paymentMethod: t.Optional(t.String()) })) });
