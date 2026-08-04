import { shopBase } from '../base';
import {
  getCategoriesController,
  getProductsController,
  getProductByIdController,
} from '../controllers/public.controller';

export const publicRoutes = shopBase()
  .get('/categories', () => getCategoriesController())
  .get('/products', ({ query }) => getProductsController(query))
  .get('/products/:id', ({ params, set }) => getProductByIdController(params, set));
