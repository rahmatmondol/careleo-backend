import { errorForStatus } from '@/shared/errors';
import * as service from '../../services/customer/cart.service';

/**
 * Turn a service failure into a thrown typed error.
 *
 * The merged shop services report failures as `{ error, status }` values. A
 * controller must not hand that back untouched: `onAfterHandle` in `app.ts`
 * wraps whatever is returned in `ok(...)`, so the client would receive
 * `{ success: true, data: { error: 'Cart is empty' } }` and only ever see a
 * bare "HTTP 400" instead of the message.
 */
const orFail = <T>(result: T): Exclude<T, { error: string }> => {
  const r = result as { error?: string; status?: number };
  if (r && typeof r.error === 'string') throw errorForStatus(r.status ?? 400, r.error);
  return result as Exclude<T, { error: string }>;
};

export async function listCartController(user: any){ return service.listCart(user.id); }
export async function addCartController(user: any, body: any){ return service.addCart(user.id, body); }
export async function updateCartController(user: any, params: any, body: any){ return orFail(await service.updateCartItem(user.id, params.itemId, body.quantity)); }
export async function removeCartController(user: any, params: any){ return orFail(await service.removeCartItem(user.id, params.itemId)); }
export async function quoteCartController(user: any, query: any){ return orFail(await service.quoteCart(user.id, query?.addressId ?? null)); }
export async function checkoutController(user: any, body: any){
  return orFail(await service.checkout(user.id, {
    addressId: body?.addressId,
    paymentMethod: body?.paymentMethod,
    shippingAddress: body?.shippingAddress,
    couponCode: body?.couponCode,
  }));
}
