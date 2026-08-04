import * as service from '../../services/admin/product.service';

const unwrap = (r: any, set: any) => {
  if (r?.status) set.status = r.status;
  if (r?.status && r?.error) return { error: r.error };
  if (r?.status) { const { status, ...rest } = r; return rest; }
  return r;
};

export async function listProductsController(query: any) { return service.listProducts(query); }

export async function getProductController(params: any, set: any) {
  return unwrap(await service.getProductById(params.id), set);
}

export async function createProductController(body: any, set: any) {
  return unwrap(await service.createProduct(body), set);
}

export async function updateProductController(params: any, body: any, set: any) {
  return unwrap(await service.updateProduct(params.id, body), set);
}

export async function deleteProductController(params: any, set: any) {
  return unwrap(await service.deleteProduct(params.id), set);
}

/**
 * Bulk actions from the products list. `ids` comes from the row selection.
 */
export async function bulkProductsController(body: any, set: any) {
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
  const action = String(body?.action || '');

  if (action === 'categorise') {
    return unwrap(await service.bulkRecategoriseProducts(ids, String(body?.categoryId || '')), set);
  }
  if (!['publish', 'draft', 'archive', 'delete'].includes(action)) {
    set.status = 400;
    return { error: `Unknown action: ${action || '(none)'}` };
  }
  return unwrap(await service.bulkUpdateProducts(ids, action as any), set);
}
