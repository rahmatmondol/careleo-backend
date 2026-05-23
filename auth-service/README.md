# auth-service

Auth microservice entry.

## Run

```bash
bun install
bun run dev
```

## Config

- `AUTH_SERVICE_PORT` (default: `3001`)
- `AUTH_UPSTREAM_URL` (default: `http://localhost:3000/api/v1/auth`)

## Endpoints

- `GET /health`
- `ALL /auth`
- `ALL /auth/*`

Current stage: strangler proxy to monolith auth module.
