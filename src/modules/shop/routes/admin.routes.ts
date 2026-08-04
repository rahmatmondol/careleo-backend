import { shopBase } from '../base';
import { requirePermission } from '../guards';
import { adminCategoryRoutes } from './admin/category.routes';
import { adminBrandRoutes } from './admin/brand.routes';
import { adminProductRoutes } from './admin/product.routes';
import { adminSourceRoutes } from './admin/source.routes';
import { adminAttributeRoutes } from './admin/attribute.routes';
import { adminOrderRoutes } from './admin/order.routes';

export const adminRoutes = shopBase()
  .guard({ beforeHandle: requirePermission('products.manage') }, (app) =>
    app
      .use(adminCategoryRoutes)
      .use(adminBrandRoutes)
      .use(adminProductRoutes)
      .use(adminSourceRoutes)
      .use(adminAttributeRoutes)
  )
  .guard({ beforeHandle: requirePermission('orders.read') }, (app) =>
    app.use(adminOrderRoutes)
  );
