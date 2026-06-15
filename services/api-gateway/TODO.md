# API Gateway - Development Plan & TODO

## 🎯 Overview
The API Gateway is the front door to the Pawly backend. It handles routing, CORS, global rate limiting, and forwards requests to the internal microservices. It does NOT connect to a database.

## 🛣️ Endpoints (Gateway Specific)
- `GET /health` : System health check
- `GET /docs` : Aggregated Swagger/OpenAPI documentation
- `/*` : Wildcard proxy router to internal services

## 🧪 Test Cases to Write (`gateway.test.ts`)
- [x] **Test 1:** `GET /health` should return 200 OK and system status.
- [x] **Test 2:** Unmatched routes should return standardized 404 JSON response.
- [x] **Test 3:** Rate limiter should return 429 Too Many Requests after limit exceeded. *(Implemented via plugin)*
- [x] **Test 4:** Proxy should correctly rewrite and forward `/api/v1/auth/*` to the `auth-service`.
- [x] **Test 5:** CORS headers should be correctly applied to responses.

## 📋 Task Execution Tracker (TDD Workflow)

### Phase 1: Setup & Infrastructure
- [x] Initialize Bun project (`bun init`)
- [x] Install dependencies (`elysia`, `@elysiajs/cors`, `elysia-rate-limit`, `@elysiajs/swagger`)
- [x] Create `tsconfig.json` for strict TypeScript
- [x] Create `Dockerfile` for deployment

### Phase 2: Core Gateway Logic
- [x] Create `tests/gateway.test.ts` and write initial failing tests (TDD Phase 1)
- [x] Implement `src/index.ts` with base Elysia server
- [x] Implement CORS plugin
- [x] Implement Global Error Handler (standardized JSON errors)
- [x] Implement Rate Limiting plugin
- [x] Implement `/health` endpoint
- [x] Run `bun test` and ensure Phase 2 tests pass (TDD Phase 2)

### Phase 3: Proxy Routing Engine
- [x] Write tests for proxy routing logic
- [x] Implement routing dictionary mapping paths to service ports:
  - `/api/v1/auth` ➔ `http://auth-service:3001`
  - `/api/v1/users` ➔ `http://auth-service:3001`
  - `/api/v1/pets` ➔ `http://pet-service:3002`
  - `/api/v1/ai` ➔ `http://ai-service:3003`
  - `/api/v1/shop` ➔ `http://shop-service:3004`
  - `/api/v1/vets` ➔ `http://vet-service:3005`
  - `/api/v1/marketplace` ➔ `http://marketplace-service:3006`
  - `/api/v1/social` ➔ `http://social-service:3007`
  - `/api/v1/adoption` ➔ `http://adoption-service:3008`
  - `/api/v1/notifications` ➔ `http://notification-service:3009`
  - `/api/v1/payments` ➔ `http://payment-service:3010`
  - `/api/v1/wearables` ➔ `http://wearables-service:3011`
  - `/api/v1/tasks` ➔ `http://task-service:3012`
- [x] Run `bun test` and ensure all proxy tests pass
