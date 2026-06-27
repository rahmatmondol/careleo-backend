import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';

/**
 * These tests exercise the parts of social-service that don't require a live
 * Postgres: the health check, JWT-derived auth guards, and request validation.
 * DB-backed flows (create post, toggle like, feed ordering) are covered by
 * integration tests run against the hybrid docker stack — see TODO.md.
 */

const req = (path: string, init?: RequestInit) =>
  app.handle(new Request(`http://localhost:3008${path}`, init));

describe('Social Service — health', () => {
  it('GET /health returns 200 and service metadata', async () => {
    const res = await req('/health');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('social-service');
    expect(body.timestamp).toBeDefined();
  });
});

describe('Social Service — auth guards', () => {
  // Every write/private route is wrapped in `.guard({ beforeHandle: requireUser })`.
  // Without a Bearer token the derived `user` is null and the guard must 401.
  // Routes with a required body schema get a valid-shaped body so Elysia's body
  // validation (which runs before the guard) doesn't short-circuit with a 422.
  const ID = '00000000-0000-0000-0000-000000000000';
  const protectedRoutes: Array<[string, string, unknown?]> = [
    ['POST', '/api/v1/social/posts', { content: 'hi' }],
    ['PUT', `/api/v1/social/posts/${ID}`, { content: 'hi' }],
    ['DELETE', `/api/v1/social/posts/${ID}`],
    ['POST', `/api/v1/social/posts/${ID}/like`],
    ['POST', `/api/v1/social/posts/${ID}/comments`, { content: 'hi' }],
    ['POST', `/api/v1/social/posts/${ID}/share`],
    ['POST', `/api/v1/social/posts/${ID}/bookmark`],
    ['POST', `/api/v1/social/comments/${ID}/like`],
    ['POST', `/api/v1/social/users/${ID}/follow`],
    ['GET', '/api/v1/social/feed/following'],
    ['GET', '/api/v1/social/notifications'],
    ['GET', '/api/v1/social/bookmarks'],
    ['POST', '/api/v1/social/stories', { imageUrl: 'https://x/y.jpg' }],
    ['POST', `/api/v1/social/posts/${ID}/report`, { reason: 'spam' }],
  ];

  for (const [method, path, body] of protectedRoutes) {
    it(`${method} ${path} returns 401 without a token`, async () => {
      const res = await req(path, {
        method,
        ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      expect(res.status).toBe(401);
    });
  }
});

describe('Social Service — admin guard', () => {
  // /api/v1/social/admin/* is wrapped in requireAdmin. No token -> 401.
  const ID = '00000000-0000-0000-0000-000000000000';
  const adminRoutes: Array<[string, string, unknown?]> = [
    ['GET', '/api/v1/social/admin/posts'],
    ['GET', `/api/v1/social/admin/posts/${ID}`],
    ['PATCH', `/api/v1/social/admin/posts/${ID}`, { status: 'hidden' }],
    ['DELETE', `/api/v1/social/admin/posts/${ID}`],
    ['GET', '/api/v1/social/admin/reports'],
    ['PATCH', `/api/v1/social/admin/reports/${ID}`, { status: 'resolved' }],
    ['GET', '/api/v1/social/admin/analytics'],
  ];

  for (const [method, path, body] of adminRoutes) {
    it(`${method} ${path} returns 401 without a token`, async () => {
      const res = await req(path, {
        method,
        ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      expect(res.status).toBe(401);
    });
  }
});

describe('Social Service — CORS', () => {
  it('applies CORS headers to preflight requests', async () => {
    const res = await req('/health', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:8081', 'Access-Control-Request-Method': 'GET' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:8081');
  });
});
