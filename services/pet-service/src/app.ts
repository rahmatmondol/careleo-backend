
import { createServiceApp } from '../../_shared/create-service-app';
import { petsController } from '../../../src/modules/pets/index';

export const app = createServiceApp([(api) => api.use(petsController)]);
