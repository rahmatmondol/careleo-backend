
import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { jwt } from '@elysiajs/jwt';
import { healthRoutes } from '../../src/shared/http/health.routes';
import { ok } from '../../src/shared/http/response';
import { handleApiError } from '../../src/shared/http/error-handler';
import { attachCorrelationId } from '../../src/shared/http/correlation-id';

export const createServiceApp = (plugins: ((app: Elysia) => Elysia)[]) => {
  const prefix = process.env.API_PREFIX || '/api/v1';

  return new Elysia()
    .use(attachCorrelationId)
    .use(cors())
    .use(
      jwt({
        name: 'jwt',
        secret: process.env.JWT_ACCESS_SECRET || 'dev_jwt_secret_change_me',
      }),
    )
    .use(swagger({ path: '/swagger' }))
    .onAfterHandle(({ response }) => {
      if (response instanceof Response) return response;
      if (response && typeof response === 'object' && 'success' in (response as Record<string, unknown>)) {
        return response;
      }
      return ok(response);
    })
    .onError(({ error, set, code, path, request }) => {
      return handleApiError(error, set, {
        code: String(code),
        path,
        method: request.method,
      });
    })
    .group(prefix, (api) => {
      let grouped = api.use(healthRoutes);
      for (const plugin of plugins) grouped = plugin(grouped);
      return grouped;
    });
};
