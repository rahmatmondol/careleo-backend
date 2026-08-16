import { t } from 'elysia';
import { shopBase } from '../../base';
import { addCartController, checkoutController, listCartController, quoteCartController, removeCartController, updateCartController } from '../../controllers/customer/cart.controller';

/**
 * Cart and checkout — open to every signed-in customer.
 *
 * The store is deliberately NOT gated on `store_access`. The subscription
 * changes what an order *costs*, not who may place one: a plan-covered product
 * is deducted from the benefit budget, and anything else is paid for normally
 * (COD or advance). Gating purchase behind a tier turned an ordinary shop into
 * a paywall and, because the Free tier carries no `store_access`, blocked
 * essentially everyone.
 */
export const cartRoutes = shopBase()
  .get('/cart', ({ user }) => listCartController(user))
  .post('/cart', ({ body, user }) => addCartController(user, body), { body: t.Object({ productId: t.String(), quantity: t.Optional(t.Number()) }) })
  .put('/cart/:itemId', ({ user, params, body }) => updateCartController(user, params, body), { body: t.Object({ quantity: t.Number({ minimum: 0 }) }) })
  .delete('/cart/:itemId', ({ user, params }) => removeCartController(user, params))
  /**
   * Priced preview of the cart: per-line subscription coverage, what is
   * covered, what is payable, and whether payment is needed at all. The app
   * renders this rather than computing coverage itself.
   */
  .get('/cart/quote', ({ user, query }) => quoteCartController(user, query), { query: t.Optional(t.Object({ addressId: t.Optional(t.String()) })) })
  .post('/cart/checkout', ({ user, body }) => checkoutController(user, body), { body: t.Optional(t.Object({ addressId: t.Optional(t.String()), paymentMethod: t.Optional(t.String()), shippingAddress: t.Optional(t.String()) })) });
