# api-gateway

API Gateway for Careleo microservices.

## Run

```bash
bun install
bun run dev
```

Default port: `8088`

## Route Map

- `/api/v1/auth/*` -> `AUTH_SERVICE_URL` (default `http://localhost:3001`)
- `/api/v1/users/*` -> `USER_SERVICE_URL` (default `http://localhost:3002`)
- `/api/v1/pets/*` -> `PET_SERVICE_URL` (default `http://localhost:3003`)
- `/api/v1/adoption/*` -> `ADOPTION_SERVICE_URL` (default `http://localhost:3004`)
- `/api/v1/admin/adoption/*` -> `ADOPTION_SERVICE_URL` (default `http://localhost:3004`)
- `/api/v1/vets/*` -> `VET_SERVICE_URL` (default `http://localhost:3005`)
- `/api/v1/walkers/*` -> `CARE_SERVICE_URL` (default `http://localhost:3006`)
- `/api/v1/sitters/*` -> `CARE_SERVICE_URL` (default `http://localhost:3006`)
- `/api/v1/bookings/*` -> `CARE_SERVICE_URL` (default `http://localhost:3006`)
- `/api/v1/social/*` -> `SOCIAL_SERVICE_URL` (default `http://localhost:3007`)
- `/api/v1/integrations/woo/*` -> `SHOP_BRIDGE_SERVICE_URL` (default `http://localhost:3008`)
- `/api/v1/store/*` -> `SHOP_BRIDGE_SERVICE_URL` (default `http://localhost:3008`)
- `/api/v1/notifications/*` -> `NOTIFICATION_SERVICE_URL` (default `http://localhost:3009`)
- `/api/v1/admin/*` -> `ADMIN_SERVICE_URL` (default `http://localhost:3010`)

## Health

- `GET /health`
