import { t } from 'elysia';
import { shopBase } from '../../base';
import {
  listProductsController,
  getProductController,
  createProductController,
  updateProductController,
  deleteProductController,
  bulkProductsController,
} from '../../controllers/admin/product.controller';

const productBody = t.Object({
  name: t.Optional(t.String()),
  sku: t.Optional(t.Union([t.String(), t.Null()])),
  categoryId: t.Optional(t.Union([t.String(), t.Null()])),
  brandId: t.Optional(t.Union([t.String(), t.Null()])),
  sourceId: t.Optional(t.Union([t.String(), t.Null()])),
  brand: t.Optional(t.Union([t.String(), t.Null()])),
  description: t.Optional(t.Union([t.String(), t.Null()])),
  shortDescription: t.Optional(t.Union([t.String(), t.Null()])),
  subCategory: t.Optional(t.Union([t.String(), t.Null()])),
  productType: t.Optional(t.String()),
  status: t.Optional(t.String()),
  supplier: t.Optional(t.Union([t.String(), t.Null()])),
  source: t.Optional(t.Union([t.String(), t.Null()])),
  excludeFromSubscription: t.Optional(t.Boolean()),
  tags: t.Optional(t.Any()),
  attributes: t.Optional(t.Any()),
  variations: t.Optional(t.Any()),
  galleryImages: t.Optional(t.Any()),
  seoSlug: t.Optional(t.Union([t.String(), t.Null()])),
  metaTitle: t.Optional(t.Union([t.String(), t.Null()])),
  metaDescription: t.Optional(t.Union([t.String(), t.Null()])),
  metaKeywords: t.Optional(t.Union([t.String(), t.Null()])),
  price: t.Optional(t.Union([t.Number(), t.String()])),
  costPrice: t.Optional(t.Union([t.Number(), t.String()])),
  compareAtPrice: t.Optional(t.Union([t.Number(), t.String(), t.Null()])),
  imageUrl: t.Optional(t.Union([t.String(), t.Null()])),
  stock: t.Optional(t.Union([t.Number(), t.String()])),
  isActive: t.Optional(t.Boolean()),
});

export const adminProductRoutes = shopBase()
  .get('/admin/products', ({ query }) => listProductsController(query))
  .get('/admin/products/:id', ({ params, set }) => getProductController(params, set))
  .post('/admin/products', ({ body, set }) => createProductController(body, set), { body: productBody })
  .put('/admin/products/:id', ({ params, body, set }) => updateProductController(params, body, set), { body: productBody })
  .delete('/admin/products/:id', ({ params, set }) => deleteProductController(params, set))
  /**
   * Bulk publish / draft / archive / delete / categorise from the list page.
   * POST rather than PATCH because it carries a body of ids and is not a
   * partial update of one addressable resource.
   */
  .post('/admin/products/bulk', ({ body, set }) => bulkProductsController(body, set), {
    body: t.Object({
      ids: t.Array(t.String()),
      action: t.String(),
      categoryId: t.Optional(t.String()),
    }),
  });
