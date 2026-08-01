import * as publicService from '../services/public.service';

export async function getCategoriesController() {
  return publicService.listCategories();
}

export async function getProductsController(query: any) {
  return publicService.listProducts(query);
}

export async function getProductByIdController(params: { id: string }, set?: { status?: number }) {
  const product = await publicService.getProductByIdOrSlug(params.id);
  if (!product) {
    if (set) set.status = 404;
    return { error: 'Product not found' };
  }
  return { product };
}
