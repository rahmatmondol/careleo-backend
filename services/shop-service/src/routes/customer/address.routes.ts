import { Elysia, t } from 'elysia';
import { createAddressController, defaultAddressController, deleteAddressController, listAddressesController, updateAddressController } from '../../controllers/customer/address.controller';

const addressBody = t.Object({ label: t.Optional(t.String()), fullName: t.String(), phone: t.String(), line1: t.String(), line2: t.Optional(t.String()), city: t.String(), state: t.Optional(t.String()), postalCode: t.Optional(t.String()), country: t.Optional(t.String()), isDefault: t.Optional(t.Boolean()) });

export const addressRoutes = new Elysia()
  .get('/api/v1/shop/addresses', ({ user }) => listAddressesController(user))
  .post('/api/v1/shop/addresses', ({ body, user }) => createAddressController(user, body), { body: addressBody })
  .put('/api/v1/shop/addresses/:id', ({ params, body, user, set }) => updateAddressController(user, params, body, set), { body: addressBody })
  .delete('/api/v1/shop/addresses/:id', ({ params, user, set }) => deleteAddressController(user, params, set))
  .post('/api/v1/shop/addresses/:id/default', ({ params, user, set }) => defaultAddressController(user, params, set));
