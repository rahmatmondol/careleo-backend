
import { createServiceApp } from '../../_shared/create-service-app';
import { adoptionController, adminAdoptionController } from '../../../src/modules/adoption/index';

export const app = createServiceApp([
  (api) => api.use(adoptionController),
  (api) => api.use(adminAdoptionController),
]);
