import * as service from '../../services/admin/order.service';

const unwrap = (r: any, set: any) => {
  if (r?.status) set.status = r.status;
  if (r?.status && r?.error) return { error: r.error };
  if (r?.status) { const { status, ...rest } = r; return rest; }
  return r;
};

export async function listOrdersController(query: any) { return service.listOrders(query); }

export async function getOrderController(params: any, set: any) {
  return unwrap(await service.getOrderById(params.id), set);
}

export async function updateOrderStatusController(params: any, body: any, set: any) {
  return unwrap(await service.updateOrderStatus(params.id, body?.status), set);
}
