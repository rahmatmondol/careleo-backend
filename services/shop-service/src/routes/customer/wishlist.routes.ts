import { Elysia, t } from 'elysia';
import { addWishlistController, listWishlistController, moveWishlistToCartController, removeWishlistController } from '../../controllers/customer/wishlist.controller';

export const wishlistRoutes = new Elysia()
  .get('/api/v1/shop/wishlist', ({ user }) => listWishlistController(user))
  .post('/api/v1/shop/wishlist', ({ body, user, set }) => addWishlistController(user, body, set), { body: t.Object({ productId: t.String() }) })
  .delete('/api/v1/shop/wishlist/:productId', ({ params, user, set }) => removeWishlistController(user, params.productId, set))
  .post('/api/v1/shop/wishlist/:productId/move-to-cart', ({ params, user, set }) => moveWishlistToCartController(user, params.productId, set));
