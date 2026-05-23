
import { createServiceApp } from '../../_shared/create-service-app';
import { authController } from '../../../src/modules/auth/index';

export const app = createServiceApp([(api) => api.use(authController)]);
