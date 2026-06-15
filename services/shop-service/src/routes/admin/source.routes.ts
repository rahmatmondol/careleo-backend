import { Elysia, t } from 'elysia';
import {
  listSourcesController,
  createSourceController,
  updateSourceController,
  deleteSourceController,
} from '../../controllers/admin/source.controller';

const sourceBody = t.Object({
  name: t.Optional(t.String()),
  type: t.Optional(t.String()),
  sourceType: t.Optional(t.String()),
  contactPerson: t.Optional(t.Union([t.String(), t.Null()])),
  contactName: t.Optional(t.Union([t.String(), t.Null()])),
  email: t.Optional(t.Union([t.String(), t.Null()])),
  phone: t.Optional(t.Union([t.String(), t.Null()])),
  contactPhone: t.Optional(t.Union([t.String(), t.Null()])),
  address: t.Optional(t.Union([t.String(), t.Null()])),
  website: t.Optional(t.Union([t.String(), t.Null()])),
  taxId: t.Optional(t.Union([t.String(), t.Null()])),
  notes: t.Optional(t.Union([t.String(), t.Null()])),
  isPreferred: t.Optional(t.Boolean()),
  isActive: t.Optional(t.Boolean()),
});

export const adminSourceRoutes = new Elysia()
  .get('/api/v1/shop/admin/sources', () => listSourcesController())
  .post('/api/v1/shop/admin/sources', ({ body, set }) => createSourceController(body, set), { body: sourceBody })
  .put('/api/v1/shop/admin/sources/:id', ({ params, body, set }) => updateSourceController(params, body, set), { body: sourceBody })
  .delete('/api/v1/shop/admin/sources/:id', ({ params, set }) => deleteSourceController(params, set));
