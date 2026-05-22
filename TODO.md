# Careleo Backend — TODO (A to Z)

> Architecture baseline: **Modular Monolith (ElysiaJS + Bun + PostgreSQL + Redis + Queue)**
> 
> Commerce source of truth: **WordPress/WooCommerce** (products/orders/customers)
> 
> Backend role: app/admin API gateway + domain logic + Woo sync/cache + custom admin workflows

---

## 0) Project Setup & Governance
- [ ] Finalize backend scope doc (what stays in backend vs Woo)
- [ ] Define module boundaries (auth, users, pets, tasks, reminders, ai, store-bridge, admin, sync, audit)
- [ ] Create repo structure and coding conventions doc
- [ ] Add branch strategy (main/dev/feature/*)
- [ ] Add commit convention (feat/fix/chore/docs/refactor/test)
- [ ] Add PR template + issue template
- [ ] Add CODEOWNERS (optional)
- [ ] Add architecture decision records (ADR) folder

---

## 1) Repository Bootstrap
- [ ] Initialize Bun + Elysia app
- [ ] Setup TypeScript strict mode
- [ ] Setup path aliases
- [ ] Add `.env.example` with all required env vars
- [ ] Add Dockerfile (backend)
- [ ] Add docker-compose for local stack (postgres, redis, backend, optional queue-ui)
- [ ] Add health endpoint (`/health`)
- [ ] Add readiness endpoint (`/ready`)

---

## 2) Folder Structure (Clean Architecture)
- [ ] Create `src/modules/*` domain modules
- [ ] Per module create: `routes.ts`, `controller.ts`, `service.ts`, `repository.ts`, `schema.ts`, `types.ts`
- [ ] Create shared layer: `src/shared/{db,cache,queue,logger,errors,utils,constants}`
- [ ] Create `src/plugins` (auth, validation, rate-limit)
- [ ] Create `src/config` (env/config loader)
- [ ] Create `src/jobs` (cron/sync workers)

---

## 3) Configuration & Secrets
- [ ] Implement env validation (zod)
- [ ] Add required envs:
  - [ ] `DATABASE_URL`
  - [ ] `REDIS_URL`
  - [ ] `JWT_ACCESS_SECRET`
  - [ ] `JWT_REFRESH_SECRET`
  - [ ] `WOO_BASE_URL`
  - [ ] `WOO_CONSUMER_KEY`
  - [ ] `WOO_CONSUMER_SECRET`
  - [ ] `WOO_WEBHOOK_SECRET`
  - [ ] `OPENAI_API_KEY` (or provider key)
- [ ] Add config presets for dev/staging/prod
- [ ] Add secret rotation playbook

---

## 4) Database Foundation
- [ ] Choose ORM/query layer (Drizzle recommended)
- [ ] Create DB schema files
- [ ] Create migrations workflow (`generate`, `migrate`, `rollback`)
- [ ] Add seed scripts for initial data
- [ ] Add DB indexes and constraints
- [ ] Add DB backup/restore strategy doc

### Core Tables
- [ ] `users`
- [ ] `sessions`
- [ ] `pets`
- [ ] `pet_preferences`
- [ ] `medical_records`
- [ ] `tasks`
- [ ] `reminders`
- [ ] `ai_chat_sessions`
- [ ] `ai_chat_messages`
- [ ] `woo_products`
- [ ] `woo_product_variations`
- [ ] `woo_customers`
- [ ] `woo_orders`
- [ ] `woo_webhook_events`
- [ ] `user_carts` (optional cache)
- [ ] `audit_logs`
- [ ] `job_runs`

---

## 5) Auth & RBAC Module
- [ ] Implement signup
- [ ] Implement login
- [ ] Implement access/refresh token flow
- [ ] Implement logout/token revoke
- [ ] Implement forgot/reset password
- [ ] Implement verify email flow
- [ ] Implement `GET /auth/me`
- [ ] Implement role model: `super_admin`, `admin`, `support`, `user`
- [ ] Implement route guards + permission middleware
- [ ] Add brute-force protection / login rate limit

---

## 6) User Profile Module
- [ ] `GET /users/me`
- [ ] `PUT /users/me` (profile update)
- [ ] Avatar upload flow (or media service link)
- [ ] Basic preferences (locale, notifications)

---

## 7) Pets Module
- [ ] `GET /pets`
- [ ] `POST /pets`
- [ ] `GET /pets/:id`
- [ ] `PUT /pets/:id`
- [ ] `DELETE /pets/:id`
- [ ] Pet ownership guard (user only own pets)
- [ ] Validation for type/breed/gender/date/weight

---

## 8) Pet Preferences & Medical Module
- [ ] `GET /pets/:id/preferences`
- [ ] `PUT /pets/:id/preferences`
- [ ] `GET /pets/:id/medical-records`
- [ ] `POST /pets/:id/medical-records`
- [ ] `PUT /pets/:id/medical-records/:recordId`
- [ ] `DELETE /pets/:id/medical-records/:recordId`
- [ ] Attachment handling strategy (link/file metadata)

---

## 9) Tasks & Reminders Module
- [ ] `GET /tasks` with filters
- [ ] `POST /tasks`
- [ ] `GET /tasks/:id`
- [ ] `PUT /tasks/:id`
- [ ] `DELETE /tasks/:id`
- [ ] `GET /reminders`
- [ ] `POST /reminders`
- [ ] `PUT /reminders/:id`
- [ ] `DELETE /reminders/:id`
- [ ] Reminder scheduler/dispatcher job

---

## 10) AI Module
- [ ] Chat session create/list/delete
- [ ] Chat messages list/send
- [ ] Token usage logging
- [ ] Safety + abuse guardrails
- [ ] Breed detection endpoint (image URL input)
- [ ] Add fallback strategy for provider failures

---

## 11) Store Bridge Module (Woo-backed)
- [ ] `GET /store/categories`
- [ ] `GET /store/products`
- [ ] `GET /store/products/:id`
- [ ] `GET /store/products/:id/variations`
- [ ] `GET /store/cart`
- [ ] `POST /store/cart/items`
- [ ] `PUT /store/cart/items/:itemId`
- [ ] `DELETE /store/cart/items/:itemId`
- [ ] `POST /store/checkout`
- [ ] `GET /store/orders`
- [ ] `GET /store/orders/:id`
- [ ] Price/stock consistency checks against Woo
- [ ] Idempotency for checkout

---

## 12) Woo Sync Module
- [ ] Webhook endpoint with signature verify
- [ ] Handle product created/updated/deleted events
- [ ] Handle order created/updated events
- [ ] Handle customer created/updated events
- [ ] Queue-based event processor
- [ ] Retry + dead-letter strategy
- [ ] Manual sync trigger endpoints
- [ ] Incremental sync job (scheduled)
- [ ] Full backfill job (onboarding)

---

## 13) Admin API Module
- [ ] Dashboard summary endpoint
- [ ] Sales/orders chart endpoint
- [ ] Sync status + failed events endpoint
- [ ] Sync retry endpoint
- [ ] Orders list/details/status update
- [ ] Custom order create endpoint
- [ ] Customers list/details
- [ ] Product read endpoints
- [ ] Users + roles + permissions endpoints
- [ ] Audit log endpoints
- [ ] Export job endpoints

---

## 14) Validation, Error Handling, API Contracts
- [ ] Request schema validation for all routes
- [ ] Response envelope standardization (`success/data/error/meta`)
- [ ] Domain error classes + global error mapper
- [ ] HTTP status code policy doc
- [ ] Pagination/filter/sort conventions
- [ ] API versioning policy (`/api/v1`)

---

## 15) Performance & Scalability
- [ ] Add Redis caching strategy (read-heavy endpoints)
- [ ] Cache invalidation rules
- [ ] Add DB query optimization pass
- [ ] Add pagination to all lists
- [ ] Add background queues for heavy tasks
- [ ] Add connection pooling config
- [ ] Add rate limiting (public + auth)

---

## 16) Security Hardening
- [ ] CORS policy per environment
- [ ] Helmet/security headers
- [ ] Input sanitization strategy
- [ ] SQL injection/XSS review
- [ ] JWT secret strength checks
- [ ] Webhook signature checks
- [ ] Audit sensitive actions
- [ ] PII handling & masking in logs

---

## 17) Observability & Reliability
- [ ] Structured logging (request ID, user ID, latency)
- [ ] Error tracking integration
- [ ] Metrics endpoint (Prometheus-friendly)
- [ ] Distributed tracing (optional)
- [ ] Uptime checks
- [ ] Alert rules (error rate/latency/queue backlog)

---

## 18) Testing Strategy
- [ ] Unit test setup
- [ ] Integration test setup (DB + API)
- [ ] Contract tests for Woo sync payloads
- [ ] Auth/RBAC tests
- [ ] Critical path tests (checkout/sync)
- [ ] Load test baseline (k6/autocannon)
- [ ] CI test pipeline with coverage threshold

---

## 19) Documentation
- [ ] OpenAPI/Swagger spec generation
- [ ] Postman/Insomnia collection
- [ ] Module-level README files
- [ ] Runbook: local setup
- [ ] Runbook: production deploy
- [ ] Runbook: incident response
- [ ] Runbook: sync failures and reprocessing

---

## 20) CI/CD & Deployment
- [ ] CI workflow (lint, typecheck, test, build)
- [ ] CD workflow (staging/prod)
- [ ] Zero-downtime migration strategy
- [ ] Environment promotion checklist
- [ ] Rollback checklist
- [ ] Release tagging/changelog automation

---

## 21) Dev Experience
- [ ] Prettier + ESLint + commit hooks
- [ ] Conventional commits hook
- [ ] Dev scripts (`dev`, `test`, `migrate`, `seed`, `worker`)
- [ ] Makefile or task runner shortcuts
- [ ] Local mock mode for Woo API

---

## 22) Future Modules (Post-MVP)
- [ ] Vets module
- [ ] Social feed module
- [ ] Emergency module
- [ ] Adoption module
- [ ] Marketplace/hiring module
- [ ] Notification center (email/push/in-app)

---

## 23) MVP Definition (Go-live criteria)
- [ ] Auth + RBAC stable
- [ ] Pets/tasks/reminders stable
- [ ] Woo product/order/customer sync stable
- [ ] Store browsing/cart/checkout stable
- [ ] Admin order/customer/sync visibility ready
- [ ] Monitoring + alerts active
- [ ] Backups + rollback tested
- [ ] Security review passed

---

## 24) Suggested Milestones
### Milestone 1 (Week 1)
- [ ] Bootstrap + DB + Auth + Users

### Milestone 2 (Week 2)
- [ ] Pets + Tasks + Reminders + Medical

### Milestone 3 (Week 3)
- [ ] Woo sync + Store bridge APIs

### Milestone 4 (Week 4)
- [ ] Admin APIs + observability + hardening

### Milestone 5 (Week 5)
- [ ] Testing, perf pass, docs, staging release

---

## 25) Immediate Next 10 Actions
- [ ] Initialize repo in `careleo-backend`
- [ ] Add Bun + Elysia base app
- [ ] Add env schema + `.env.example`
- [ ] Add PostgreSQL + Redis docker-compose
- [ ] Setup migrations + create core tables
- [ ] Implement auth module (login/signup/refresh)
- [ ] Implement pets CRUD
- [ ] Implement tasks/reminders CRUD
- [ ] Implement Woo webhook receiver + queue
- [ ] Implement `/store/products` + `/admin/dashboard/summary`
