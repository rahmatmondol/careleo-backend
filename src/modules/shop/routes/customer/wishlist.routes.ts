import { t } from 'elysia';
import { shopBase } from '../../base';
import { addWishlistController, listWishlistController, moveWishlistToCartController, removeWishlistController } from '../../controllers/customer/wishlist.controller';

export const wishlistRoutes = shopBase()
  .get('/wishlist', ({ user }) => listWishlistController(user))
  .post('/wishlist', ({ body, user, set }) => addWishlistController(user, body, set), { body: t.Object({ productId: t.String() }) })
  .delete('/wishlist/:productId', ({ params, user, set }) => removeWishlistController(user, params.productId, set))
  .post('/wishlist/:productId/move-to-cart', ({ params, user, set }) => moveWishlistToCartController(user, params.productId, set));
