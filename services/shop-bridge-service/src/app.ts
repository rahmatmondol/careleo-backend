
import { createServiceApp } from '../../_shared/create-service-app';
import { storebridgeController } from '../../../src/modules/store-bridge/index';
import { wooCommerceController } from '../../../src/modules/integrations/woocommerce/index';
import { syncController } from '../../../src/modules/sync/index';

export const app = createServiceApp([
  (api) => api.use(storebridgeController),
  (api) => api.use(wooCommerceController),
  (api) => api.use(syncController),
]);
