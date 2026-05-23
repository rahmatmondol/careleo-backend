
import { createServiceApp } from '../../_shared/create-service-app';
import { vetsController } from '../../../src/modules/vets/index';

export const app = createServiceApp([
  (api) => api.use(vetsController),
]);
