import * as service from '../../services/customer/wishlist.service';

export async function listWishlistController(user: any) { return service.listWishlist(user.id); }
export async function addWishlistController(user: any, body: any, set: any) {
  const r = await service.addWishlist(user.id, body.productId);
  if ((r as any).error) set.status = (r as any).status;
  return r;
}
export async function removeWishlistController(user: any, productId: string, set: any) {
  const r = await service.removeWishlist(user.id, productId);
  if ((r as any).error) set.status = (r as any).status;
  return r;
}
export async function moveWishlistToCartController(user: any, productId: string, set: any) {
  const r = await service.moveWishlistToCart(user.id, productId);
  if ((r as any).error) set.status = (r as any).status;
  return r;
}
