import { Elysia, t } from 'elysia';
import {
  listAttributesController,
  getAttributeController,
  createAttributeController,
  updateAttributeController,
  deleteAttributeController,
  listValuesController,
  createValueController,
  updateValueController,
  deleteValueController,
} from '../../controllers/admin/attribute.controller';

const attributeBody = t.Object({
  name: t.Optional(t.String()),
  code: t.Optional(t.String()),
  description: t.Optional(t.Union([t.String(), t.Null()])),
  inputType: t.Optional(t.String()),
  isRequired: t.Optional(t.Boolean()),
  isFilterable: t.Optional(t.Boolean()),
  isVisible: t.Optional(t.Boolean()),
  isVariant: t.Optional(t.Boolean()),
  isActive: t.Optional(t.Boolean()),
});

const valueBody = t.Object({
  value: t.Optional(t.String()),
  name: t.Optional(t.String()),
  label: t.Optional(t.Union([t.String(), t.Null()])),
  color: t.Optional(t.Union([t.String(), t.Null()])),
  sortOrder: t.Optional(t.Numeric()),
});

export const adminAttributeRoutes = new Elysia()
  .get('/api/v1/shop/admin/attributes', () => listAttributesController())
  .get('/api/v1/shop/admin/attributes/:id', ({ params, set }) => getAttributeController(params, set))
  .post('/api/v1/shop/admin/attributes', ({ body, set }) => createAttributeController(body, set), { body: attributeBody })
  .put('/api/v1/shop/admin/attributes/:id', ({ params, body, set }) => updateAttributeController(params, body, set), { body: attributeBody })
  .delete('/api/v1/shop/admin/attributes/:id', ({ params, set }) => deleteAttributeController(params, set))
  .get('/api/v1/shop/admin/attributes/:id/values', ({ params }) => listValuesController(params))
  .post('/api/v1/shop/admin/attributes/:id/values', ({ params, body, set }) => createValueController(params, body, set), { body: valueBody })
  .put('/api/v1/shop/admin/attributes/:id/values/:valueId', ({ params, body, set }) => updateValueController(params, body, set), { body: valueBody })
  .delete('/api/v1/shop/admin/attributes/:id/values/:valueId', ({ params, set }) => deleteValueController(params, set));
