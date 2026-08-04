import { t } from 'elysia';
import { shopBase } from '../../base';
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

export const adminSourceRoutes = shopBase()
  .get('/admin/sources', () => listSourcesController())
  .post('/admin/sources', ({ body, set }) => createSourceController(body, set), { body: sourceBody })
  .put('/admin/sources/:id', ({ params, body, set }) => updateSourceController(params, body, set), { body: sourceBody })
  .delete('/admin/sources/:id', ({ params, set }) => deleteSourceController(params, set));
