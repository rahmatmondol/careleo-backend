
# Microservices Migration / Canary / Rollback Playbook

## 1) Pre-flight
- Snapshot DB backup.
- Capture baseline metrics: error rate, p95 latency, throughput.
- Verify all service smoke tests:
  - `bun services/tests/adoption.smoke.test.ts`
  - `bun services/tests/vet-care.smoke.test.ts`
  - `bun services/tests/core-services.smoke.test.ts`

## 2) Canary Rollout
1. Start all services using `docker compose -f docker-compose.hybrid.yml up -d`.
2. Route 5% of traffic to microservice endpoints from gateway.
3. Observe for 30 minutes:
   - 5xx rate < 1%
   - p95 latency increase < 20%
4. Increase to 25%, then 50%, then 100%.

## 3) Rollback Trigger
Rollback immediately if one occurs:
- error rate >= 2%
- auth failures spike
- data mismatch on critical resources (orders/products/users)

## 4) Rollback Steps
1. Switch gateway routes back to monolith.
2. Keep microservices up for diagnostics only.
3. Run integrity checks and compare counts.
4. If DB migration already applied, run down migration scripts from `scripts/migrations/down`.

## 5) Post-rollout verification
- Health checks green on all services.
- Contract verification for `/api/v1` preserved.
- Admin pages load products/orders/users without regression.
