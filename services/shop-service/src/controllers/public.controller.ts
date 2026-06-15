import * as publicService from '../services/public.service';

export async function getCategoriesController() {
  return publicService.listCategories();
}

export async function getProductsController(query: any) {
  return publicService.listProducts(query);
}

export async function getProductByIdController(params: { id: string }) {
  const product = await publicService.getProductById(params.id);
  if (!product) return { error: 'Product not found' };
  return { product };
}
