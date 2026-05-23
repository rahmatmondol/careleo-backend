
import { createServiceApp } from '../../_shared/create-service-app';
import { tasksController } from '../../../src/modules/tasks/index';
import { remindersController } from '../../../src/modules/reminders/index';

export const app = createServiceApp([
  (api) => api.use(tasksController),
  (api) => api.use(remindersController),
]);
