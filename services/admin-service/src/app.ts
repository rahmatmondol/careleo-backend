
import { createServiceApp } from '../../_shared/create-service-app';
import { adminController } from '../../../src/modules/admin/index';
import { auditController } from '../../../src/modules/audit/index';
import { aiController } from '../../../src/modules/ai/index';

export const app = createServiceApp([
  (api) => api.use(adminController),
  (api) => api.use(auditController),
  (api) => api.use(aiController),
]);
