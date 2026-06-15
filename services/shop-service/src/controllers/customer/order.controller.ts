import * as service from '../../services/customer/order.service';

export async function listOrdersController(user: any) { return service.listOrders(user.id); }
export async function getOrderByIdController(params: any) { return service.getOrderById(params.id); }
