import * as publicService from '../services/public.service';

export async function getCategoriesController() {
  return publicService.listCategories();
}

export async function getProductsController(query: any) {
  return publicService.listProducts(query);
}

/**
 * The `set` parameter is unused now — `normaliseErrorReturns` in the module's
 * `index.ts` reads the `status` off the returned payload and throws the right
 * typed error. It is kept in the signature (and ignored) so the route files and
 * any direct caller do not have to change.
 */
export async function getProductByIdController(params: { id: string }, _set?: unknown) {
  const product = await publicService.getProductByIdOrSlug(params.id);
  if (!product) {
    return { error: 'Product not found', status: 404 };
  }
  return { product };
}
