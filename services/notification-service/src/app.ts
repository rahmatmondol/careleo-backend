
import { createServiceApp } from '../../_shared/create-service-app';
import { notificationsController } from '../../../src/modules/notifications/index';

export const app = createServiceApp([(api) => api.use(notificationsController)]);
