import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { jwt } from '@elysiajs/jwt';

import { healthRoutes } from './shared/http/health.routes';
import { ok } from './shared/http/response';
import { handleApiError } from './shared/http/error-handler';
import { authController } from './modules/auth/index';
import { uploadsController, userController } from './modules/user/index';
import { usersController } from './modules/users/index';
import { petsController } from './modules/pets/index';
import { tasksController } from './modules/tasks/index';
import { remindersController } from './modules/reminders/index';
import { aiController } from './modules/ai/index';
import { storebridgeController } from './modules/store-bridge/index';
import { adminController } from './modules/admin/index';
import { auditController } from './modules/audit/index';
import { syncController } from './modules/sync/index';
import { notificationsController } from './modules/notifications/index';
import { wooCommerceController } from './modules/integrations/woocommerce/index';
import { adoptionController, adminAdoptionController } from './modules/adoption/index';
import { vetsController } from './modules/vets/index';
import { walkersController } from './modules/walkers/index';

const prefix = process.env.API_PREFIX || '/api/v1';

export const app = new Elysia()
  .use(cors())
  .use(
    // Register JWT plugin globally so modules can sign/verify access tokens.
    jwt({
      name: 'jwt',
      secret: process.env.JWT_ACCESS_SECRET || 'dev_jwt_secret_change_me',
    })
  )
  .use(swagger())
  .onAfterHandle(({ response }) => {
    // Pass through raw Response objects (file/stream responses).
    if (response instanceof Response) return response;

    // Normalize all successful JSON responses into a single envelope format.
    if (
      response &&
      typeof response === 'object' &&
      'success' in (response as Record<string, unknown>)
    ) {
      return response;
    }
    return ok(response);
  })
  .onError(({ error, set, code, path, request }) => {
    // Normalize all thrown errors into the centralized error envelope.
    return handleApiError(error, set, {
      code: String(code),
      path,
      method: request.method,
    });
  })
  .group(prefix, (api) =>
    api
      .use(healthRoutes)
      .use(authController)
      .use(userController)
      .use(uploadsController)
      .use(usersController)
      .use(petsController)
      .use(tasksController)
      .use(remindersController)
      .use(aiController)
      .use(storebridgeController)
      .use(adminController)
      .use(auditController)
      .use(syncController)
      .use(notificationsController)
      .use(wooCommerceController)
      .use(adoptionController)
      .use(adminAdoptionController)
      .use(vetsController)
      .use(walkersController)
  );
