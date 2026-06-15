import { Elysia, t } from 'elysia';
import { createCategoryController, deleteCategoryController, listCategoriesController, updateCategoryController } from '../../controllers/admin/category.controller';

const categoryBody = t.Object({
  name: t.Optional(t.String()),
  description: t.Optional(t.String()),
  imageUrl: t.Optional(t.Union([t.String(), t.Null()])),
  image: t.Optional(t.Union([t.String(), t.Null()])),
  parentId: t.Optional(t.Union([t.String(), t.Null()])),
  parent: t.Optional(t.Union([t.String(), t.Null()])),
  isActive: t.Optional(t.Boolean()),
  status: t.Optional(t.String()),
  order: t.Optional(t.Numeric()),
  sortOrder: t.Optional(t.Numeric()),
});

export const adminCategoryRoutes = new Elysia()
  .get('/api/v1/shop/admin/categories', () => listCategoriesController())
  .post('/api/v1/shop/admin/categories', ({ body, set }) => createCategoryController(body, set), { body: categoryBody })
  .put('/api/v1/shop/admin/categories/:id', ({ params, body, set }) => updateCategoryController(params, body, set), { body: categoryBody })
  .delete('/api/v1/shop/admin/categories/:id', ({ params, set }) => deleteCategoryController(params, set));
