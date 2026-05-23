
import { createServiceApp } from '../../_shared/create-service-app';
import { walkersController } from '../../../src/modules/walkers/index';

export const app = createServiceApp([
  (api) => api.use(walkersController),
]);
