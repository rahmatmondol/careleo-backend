
import { createServiceApp } from '../../_shared/create-service-app';
import { userController, uploadsController } from '../../../src/modules/user/index';
import { usersController } from '../../../src/modules/users/index';

export const app = createServiceApp([
  (api) => api.use(userController),
  (api) => api.use(uploadsController),
  (api) => api.use(usersController),
]);
