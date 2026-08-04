import { t } from 'elysia';
import { shopBase } from '../../base';
import { createAddressController, defaultAddressController, deleteAddressController, listAddressesController, updateAddressController } from '../../controllers/customer/address.controller';

const addressBody = t.Object({ label: t.Optional(t.String()), fullName: t.String(), phone: t.String(), line1: t.String(), line2: t.Optional(t.String()), city: t.String(), state: t.Optional(t.String()), postalCode: t.Optional(t.String()), country: t.Optional(t.String()), isDefault: t.Optional(t.Boolean()) });

export const addressRoutes = shopBase()
  .get('/addresses', ({ user }) => listAddressesController(user))
  .post('/addresses', ({ body, user }) => createAddressController(user, body), { body: addressBody })
  .put('/addresses/:id', ({ params, body, user, set }) => updateAddressController(user, params, body, set), { body: addressBody })
  .delete('/addresses/:id', ({ params, user, set }) => deleteAddressController(user, params, set))
  .post('/addresses/:id/default', ({ params, user, set }) => defaultAddressController(user, params, set));
