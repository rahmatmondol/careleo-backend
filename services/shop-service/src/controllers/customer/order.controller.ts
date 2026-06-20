import * as service from '../../services/customer/order.service';

export async function listOrdersController(user: any) { return service.listOrders(user.id); }
export async function getOrderByIdController(user: any, params: any) { return service.getOrderById(user.id, params.id); }
