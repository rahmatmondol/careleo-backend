import { t } from 'elysia';
import { shopBase } from '../../base';
import { createBrandController, deleteBrandController, listBrandsController, updateBrandController } from '../../controllers/admin/brand.controller';

export const adminBrandRoutes = shopBase()
  .get('/admin/brands', () => listBrandsController())
  .post('/admin/brands', ({ body, set }) => createBrandController(body, set), { body: t.Object({ name: t.String(), description: t.Optional(t.String()), logo: t.Optional(t.String()), website: t.Optional(t.String()), email: t.Optional(t.String()), phone: t.Optional(t.String()), isFeatured: t.Optional(t.Boolean()), isActive: t.Optional(t.Boolean()) }) })
  .put('/admin/brands/:id', ({ params, body, set }) => updateBrandController(params, body, set))
  .delete('/admin/brands/:id', ({ params, set }) => deleteBrandController(params, set));
