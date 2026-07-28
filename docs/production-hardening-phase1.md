# Production hardening phase 1

Production API startup requires `NODE_ENV=production`, `DEPLOYMENT_ENV`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `WEB_ORIGIN`, `TRUST_PROXY`, and `LOG_LEVEL`. Secret values must be injected by the platform and must not be stored in this repository.

Cloud Run supplies `PORT`; the API listens on `PORT` before the local `API_PORT` fallback. The Web container uses `PORT` and an `API_UPSTREAM` URL at container startup. Local Compose retains `/api` routing to `http://api:3000`.

`READINESS_DB_TIMEOUT_MS` defaults to 3000 ms and is limited to 100-10000 ms. Authentication rate limiting uses a bounded in-process store in phase 1. Keep the staging API at one maximum instance until a shared store is introduced; Cloud Run restarts still reset counters. Confirm `TRUST_PROXY` against the deployed route: direct Cloud Run and an external Application Load Balancer have different proxy chains. Do not expose a shorter alternate route, and replace incoming `X-Forwarded-For` at the load balancer when it is used.

The Web proxy accepts only an HTTP(S) origin in `API_UPSTREAM`. HTTPS upstreams use SNI and the upstream host header. A private Cloud Run API additionally requires Google-signed identity-token authentication; Nginx does not generate that token, so use an external Application Load Balancer/serverless NEG or an authenticated proxy component instead of pointing this Nginx directly at a private `run.app` URL.

## Health checks

- `GET /api/health`: liveness only; does not access PostgreSQL.
- `GET /api/ready`: read-only PostgreSQL readiness check; returns 503 without connection details when unavailable.

## Migrations

Migrations never run from the production API entrypoint and never invoke seed.

```sh
npm run db:migrate:status
npm run db:migrate:dry-run
npm run db:migrate:deploy
```

Set `DEPLOYMENT_ENV`, `DATABASE_TARGET_ID`, `CONFIRM_DEPLOYMENT_ENV`, and `CONFIRM_DATABASE_TARGET_ID`. Production also requires `ALLOW_PRODUCTION_MIGRATION=true`. Dry-run is limited to `prisma migrate status` because Prisma does not provide a SQL dry-run for `migrate deploy`.

## Initial administrator

Run `npm run admin:bootstrap` from a one-off job. Supply the password through `INITIAL_ADMIN_PASSWORD`, never a command-line argument. Select an existing tenant with `INITIAL_ADMIN_TENANT_ID`, or create one with `INITIAL_TENANT_NAME` and `INITIAL_TENANT_CODE`. Production requires `ALLOW_PRODUCTION_ADMIN_BOOTSTRAP=true`. The command refuses a duplicate active administrator and does not print credentials.

The command permits exactly one initial administrator per tenant. Forced password change and password-reset delivery are not implemented in phase 1 and remain release prerequisites.

Demo seed exits with a non-zero status whenever `NODE_ENV=production` or `DEPLOYMENT_ENV=production`.
