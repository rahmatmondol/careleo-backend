import { ok } from '../../packages/shared-http/src/index';
import { AuthModel } from './model';

const upstreamBase = process.env.AUTH_UPSTREAM_URL ?? 'http://localhost:3000/api/v1/auth';

export const AuthService = {
  /** Return service health payload. */
  health() {
    return ok({ status: 'ok', service: 'auth-service', upstreamBase });
  },

  /** Forward auth request to current upstream monolith auth module. */
  async forwardAuthRequest(request: Request, path: string) {
    const incomingUrl = new URL(request.url);
    const forwardUrl = AuthModel.buildForwardUrl(upstreamBase, incomingUrl, path);

    const method = request.method.toUpperCase();
    const headers = AuthModel.buildUpstreamHeaders(request);
    const body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();

    const upstream = await fetch(forwardUrl, { method, headers, body });
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set('x-proxied-by', 'auth-service');

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  },
};
