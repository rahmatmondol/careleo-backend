import * as service from '../../services/customer/cart.service';
export async function listCartController(user: any){ return service.listCart(user.id); }
export async function addCartController(user: any, body: any){ return service.addCart(user.id, body); }
export async function updateCartController(user: any, params: any, body: any){ return service.updateCartItem(user.id, params.itemId, body.quantity); }
export async function removeCartController(user: any, params: any){ return service.removeCartItem(user.id, params.itemId); }
export async function checkoutController(user: any, body: any){ return service.checkout(user.id, body?.shippingAddress, body?.paymentMethod); }
