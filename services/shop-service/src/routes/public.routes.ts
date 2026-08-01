import { Elysia } from 'elysia';
import {
  getCategoriesController,
  getProductsController,
  getProductByIdController,
} from '../controllers/public.controller';

export const publicRoutes = new Elysia()
  .get('/api/v1/shop/categories', () => getCategoriesController())
  .get('/api/v1/shop/products', ({ query }) => getProductsController(query))
  .get('/api/v1/shop/products/:id', ({ params, set }) => getProductByIdController(params, set));
