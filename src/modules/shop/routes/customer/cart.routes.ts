import { t } from 'elysia';
import { shopBase } from '../../base';
import { addCartController, checkoutController, listCartController, removeCartController, updateCartController } from '../../controllers/customer/cart.controller';

export const cartRoutes = shopBase()
  .get('/cart', ({ user }) => listCartController(user))
  .post('/cart', ({ body, user }) => addCartController(user, body), { body: t.Object({ productId: t.String(), quantity: t.Optional(t.Number()) }) })
  .put('/cart/:itemId', ({ user, params, body }) => updateCartController(user, params, body), { body: t.Object({ quantity: t.Number({ minimum: 0 }) }) })
  .delete('/cart/:itemId', ({ user, params }) => removeCartController(user, params))
  .post('/cart/checkout', ({ user, body }) => checkoutController(user, body), { body: t.Optional(t.Object({ shippingAddress: t.Optional(t.String()), paymentMethod: t.Optional(t.String()) })) });
