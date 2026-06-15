import * as service from '../../services/customer/cart.service';
export async function listCartController(user: any){ return service.listCart(user.id); }
export async function addCartController(user: any, body: any){ return service.addCart(user.id, body); }
export async function updateCartController(params: any, body: any){ return service.updateCartItem(params.itemId, body.quantity); }
export async function removeCartController(params: any){ return service.removeCartItem(params.itemId); }
export async function checkoutController(user: any){ return service.checkout(user.id); }
