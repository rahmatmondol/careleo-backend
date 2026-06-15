import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';

describe('API Gateway Core Logic', () => {
  it('Test 1: /health should return 200 OK and system status', async () => {
    const response = await app.handle(new Request('http://localhost:3000/health'));
    expect(response.status).toBe(200);
    
    const body: any = await response.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('api-gateway');
    expect(body.timestamp).toBeDefined();
  });

  it('Test 2: Unmatched routes should return standardized 404 JSON response', async () => {
    const response = await app.handle(new Request('http://localhost:3000/some-fake-route'));
    expect(response.status).toBe(404);
    
    const body: any = await response.json();
    expect(body.error).toBe('Not Found');
  });

  it('Test 3: CORS headers should be correctly applied', async () => {
    const response = await app.handle(new Request('http://localhost:3000/health', {
        method: 'OPTIONS',
        headers: {
            'Origin': 'http://localhost:8081',
            'Access-Control-Request-Method': 'GET'
        }
    }));
    // Elysia CORS plugin echoes the origin dynamically
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:8081');
  });

  it('Test 4: Proxy should correctly return 404 for unregistered services', async () => {
    const response = await app.handle(new Request('http://localhost:3000/api/v1/unknown-service/test'));
    expect(response.status).toBe(404);
    
    const body: any = await response.json();
    expect(body.error).toBe('Not Found');
    expect(body.message).toContain('is not registered');
  });

  it('Test 5: Proxy should correctly route to auth-service and return 502 if it is down', async () => {
    const response = await app.handle(new Request('http://localhost:3000/api/v1/auth/login', {
      method: 'POST'
    }));
    // Since the auth-service isn't running on port 3001 yet, the gateway should catch the fetch failure and return 502
    expect(response.status).toBe(502);
    
    const body: any = await response.json();
    expect(body.error).toBe('Bad Gateway');
    expect(body.message).toContain('is currently unreachable');
  });
});
