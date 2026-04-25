# BIZGITAL Marketing Report

Foundation scaffold for the approved BIZGITAL Marketing Report blueprint.

This session intentionally covers only the platform baseline:

- monorepo repo structure
- NestJS backend foundation
- Next.js frontend foundation
- Tailwind + shadcn/ui interface foundation
- MySQL service for local development
- Docker Compose baseline
- environment example files
- local run and reverse-proxy notes
- reporting core skeleton for monthly periods and version workflow
- import upload skeleton attached to the active draft
- mapping skeleton backed by profiled CSV source columns

Not included yet:

- business modules
- real authentication logic
- production schema or migrations
- import workflow
- dashboard implementation
- KPI feature implementation

## CI status

[![Competitor E2E Workflow](https://img.shields.io/badge/Competitor%20E2E-workflow%20configured-16a34a)](.github/workflows/competitor-e2e.yml)
[![API E2E](https://img.shields.io/badge/API%20E2E-monitoring%20workflow-0284c7)](apps/backend/scripts/e2e-competitor-workflow.ts)
[![UI E2E](https://img.shields.io/badge/UI%20E2E-Playwright-7c3aed)](apps/frontend/e2e/competitor-workflow.spec.ts)

Competitor quality gates run from `.github/workflows/competitor-e2e.yml`:

- `api-e2e`: backend API workflow checks for setup + monitoring + readiness
- `ui-e2e`: Playwright checks for admin setup and competitor checklist UX

## Production preflight

Before release, run backend preflight checks:

```powershell
npm --workspace @bizgital-marketing-report/backend run qa:production-preflight
```

Optional API guard smoke checks (requires running backend):

```powershell
npm --workspace @bizgital-marketing-report/backend run qa:production-smoke
```

Expected smoke result:
- anonymous calls to `/media/presign-upload`, `/media/presign-read`, and `/media/delete-object` return `401`

## Workspace layout

```text
.
|-- apps/
|   |-- backend/
|   `-- frontend/
|-- deploy/
|-- docs/
|-- docker-compose.yml
|-- docker-compose.local.yml
|-- LICENSE
`-- README.md
```

## Local development (Docker only)

This repository is standardized for Docker-only runtime.

1. Copy the root env template:

```powershell
Copy-Item .env.example .env
```

2. Start the local stack:

```powershell
docker compose -f docker-compose.local.yml up --build
```

3. Initialize database (first run only):

```powershell
docker compose run --rm backend npm --workspace @bizgital-marketing-report/backend run db:generate
docker compose run --rm backend npm --workspace @bizgital-marketing-report/backend run db:push
docker compose run --rm backend npm --workspace @bizgital-marketing-report/backend run db:seed
```

Notes:
- `db:seed` is for local demo data only.
- `db:seed` will fail intentionally when `NODE_ENV=production`.

4. Open the services:

- frontend: `http://localhost:3200`
- backend health: `http://localhost:3003/api/health`
- mysql: `localhost:3306`
- minio api: `http://localhost:9000`
- minio console: `http://localhost:9001`

Super Admin first-time setup mode:

- set `SUPER_ADMIN_SETUP_MODE=force` in root `.env` when you want to require the setup UI
- complete setup from `/setup/super-admin`
- then switch back to `SUPER_ADMIN_SETUP_MODE=auto` (or `disabled`) and restart the stack
- quick status check: `curl http://localhost:3003/api/users/bootstrap/status`
- Super Admin can be created even when there are no brands yet; create brands after setup

Microsoft sign-in callback URLs:

- Local redirect URI (for Microsoft Entra app registration):
  - `http://localhost:3200/api/auth/microsoft/callback`
- Production redirect URI:
  - `https://report.bizgital.com/api/auth/microsoft/callback`

Important:
- Keep `APP_ORIGIN` aligned with the frontend domain for each environment.
- Example:
  - Local: `APP_ORIGIN=http://localhost:3200`
  - Production: `APP_ORIGIN=https://report.bizgital.com`

Seed notes:

- the seed creates `demo-brand`
- it also creates baseline `admin`, `content`, and `approver` memberships for local testing
- it also sets baseline local password logins:
  - `admin@demo-brand.local` / `admin1234`
  - `content@demo-brand.local` / `content1234`
  - `approver@demo-brand.local` / `approver1234`
- the reports shell at `/app/demo-brand/reports` is intended to work against this seeded brand

Import notes:

- uploaded source files are stored under `storage/imports` by default
- import jobs attach to the active draft version for a period
- current import scope is upload registration only; parsing and mapping are still pending

Mapping notes:

- CSV uploads now profile header columns automatically for the mapping step
- the mapping screen saves source-column to target-field choices for the active draft
- XLS and XLSX files are accepted for upload, but automatic profiling for them is still pending

Media upload notes (S3-compatible):

- UI no longer uploads image bytes through the main backend API
- frontend requests a presigned upload URL from `POST /api/media/presign-upload`
- browser uploads directly to object storage (MinIO / Spaces)
- database stores only the final object URL
- frontend serves stored media through `/api/media/proxy` (session required)
- backend media APIs (`presign-upload`, `presign-read`, `delete-object`) require authenticated session cookies
- manual `cleanup-orphans` endpoint requires an admin session
- when user removes/replaces an image in the same editing session, UI calls `POST /api/media/delete-object` to delete the old uploaded object immediately
- backend also runs an automatic orphan cleanup job (daily by default) to delete storage objects not referenced by DB

## Media storage setup (MinIO in local, Spaces in production)

### Local MinIO (dev)

1. Start MinIO:

```powershell
docker compose -f docker-compose.local.yml up -d minio
```

2. Open MinIO console: `http://localhost:9001`  
   Login with `MEDIA_S3_ACCESS_KEY` / `MEDIA_S3_SECRET_KEY` (default `minioadmin` / `minioadmin`).

3. Create bucket `report-media` (or your configured `MEDIA_S3_BUCKET`).

4. Keep bucket private (recommended for production safety):
- Do not enable anonymous download on the bucket.
- Media is delivered through signed read URLs + `/api/media/proxy` instead.

5. Set CORS for browser upload.

Important note:
- Some MinIO builds do not support bucket-level `put-bucket-cors` and return `NotImplemented`.
- In that case, use server-level CORS through MinIO admin config (works for local development).

Set server-level CORS:

```powershell
docker run --rm -e MC_HOST_local="http://minioadmin:minioadmin@host.docker.internal:9000" minio/mc admin config set local api cors_allow_origin="http://localhost:3200"
docker restart bizgital-marketing-report-minio
```

6. Ensure env values are set in root `.env`:

```env
AUTH_SESSION_SECRET=change-this-in-production
MEDIA_S3_ENDPOINT=http://localhost:9000
MEDIA_S3_REGION=us-east-1
MEDIA_S3_BUCKET=report-media
MEDIA_S3_ACCESS_KEY=minioadmin
MEDIA_S3_SECRET_KEY=minioadmin
MEDIA_S3_FORCE_PATH_STYLE=true
MEDIA_S3_PUBLIC_BASE_URL=http://localhost:9000/report-media
MEDIA_UPLOAD_MAX_BYTES=10485760
MEDIA_PRESIGN_EXPIRES_SECONDS=900
MEDIA_READ_PRESIGN_EXPIRES_SECONDS=120
MEDIA_ORPHAN_CLEANUP_ENABLED=true
MEDIA_ORPHAN_CLEANUP_INTERVAL_HOURS=24
MEDIA_ORPHAN_CLEANUP_INITIAL_DELAY_MINUTES=5
MEDIA_ORPHAN_CLEANUP_MAX_DELETE_PER_RUN=500
```

Important:
- `AUTH_SESSION_SECRET` must use the same value in both frontend and backend environments.
- Production must use a long random secret (do not keep the development fallback value).

7. Restart local app services after env changes:

```powershell
docker compose -f docker-compose.local.yml restart backend frontend
```

8. Quick verification:

```powershell
docker run --rm -e MC_HOST_local="http://minioadmin:minioadmin@host.docker.internal:9000" minio/mc admin config get local api
```

Expected checks:
- bucket does not allow anonymous download
- API config shows `cors_allow_origin=http://localhost:3200`

Manual orphan cleanup trigger (optional):

```powershell
curl -X POST http://localhost:3003/api/media/cleanup-orphans -H "Content-Type: application/json" -d "{\"dryRun\":true}"
curl -X POST http://localhost:3003/api/media/cleanup-orphans -H "Content-Type: application/json" -d "{\"dryRun\":false,\"maxDelete\":200}"
```

### Production (DigitalOcean Spaces)

Keep the same code and switch only env:

- `MEDIA_S3_ENDPOINT=https://<region>.digitaloceanspaces.com`
- `MEDIA_S3_REGION=<region>` (example `sgp1`)
- `MEDIA_S3_BUCKET=<your-space-name>`
- `MEDIA_S3_ACCESS_KEY=<spaces-access-key>`
- `MEDIA_S3_SECRET_KEY=<spaces-secret-key>`
- `MEDIA_S3_FORCE_PATH_STYLE=false`
- `MEDIA_S3_PUBLIC_BASE_URL=https://<cdn-or-space-domain>`
- `MEDIA_READ_PRESIGN_EXPIRES_SECONDS=120`
- `AUTH_SESSION_SECRET=<long-random-shared-secret-for-frontend-and-backend>`

Security note:
- Keep the storage bucket private (no anonymous read) so copied raw object URLs cannot be opened without authenticated proxy/signing flow.

With this shape, local MinIO and production Spaces share one upload flow and one API contract.

## Current foundation assumptions

- phase 1 is monthly-first
- quarterly and yearly remain future-ready, but are not implemented
- workflow is `draft -> submitted -> approved / rejected`
- approved and rejected versions are immutable
- post-decision edits happen through new draft revisions
- dashboard reads must use the latest approved version only
- top content highlights are monthly evidence, not KPI targets
- confirmed metric alias intent includes `Impressions -> Views` and `Reach -> Viewers`

## Caddy reverse-proxy assumptions

The application containers are designed to live behind Caddy in production.

- Caddy terminates TLS and owns public HTTP(S)
- Next.js handles browser-facing HTML behind Caddy
- NestJS handles most `/api/*` traffic behind Caddy (except frontend-owned auth/media proxy routes)
- app containers should not manage public TLS themselves
- forwarded headers from Caddy should be preserved
- `APP_ORIGIN` and `NEXT_PUBLIC_API_BASE_URL` should point to the public domain in production

Recommended deployment shape (Caddy runs on host machine):

1. Copy and set production env values:

```powershell
Copy-Item .env.example .env
```

Update at least these keys in `.env`:
- `APP_ORIGIN=https://report.example.com`
- `NEXT_PUBLIC_API_BASE_URL=https://report.example.com/api`
- `AUTH_SESSION_SECRET=<long-random-secret>`
- `INTERNAL_API_AUTH_SECRET=<different-long-random-secret>`
- database and media storage keys (`MYSQL_*`, `MEDIA_*`)

Important:
- avoid `$` in secrets unless properly escaped; safest is hex/base64url-style random strings
- `AUTH_SESSION_SECRET` and `INTERNAL_API_AUTH_SECRET` must be different values
2. Start production compose (loopback-only service ports):

```powershell
docker compose up -d --build
```

3. Initialize database schema (first deploy):

```powershell
docker compose run --rm backend npm --workspace @bizgital-marketing-report/backend run db:generate
docker compose run --rm backend npm --workspace @bizgital-marketing-report/backend run db:push
```

Do not run this in production:

```powershell
docker compose run --rm backend npm --workspace @bizgital-marketing-report/backend run db:seed
```

4. Enable first-time Super Admin setup:

- set `SUPER_ADMIN_SETUP_MODE=force` in `.env`
- apply env and restart:

```powershell
docker compose up -d --build
```

- open `https://report.example.com/setup/super-admin`
- after setup is complete, set `SUPER_ADMIN_SETUP_MODE=auto` (or `disabled`) and run:

```powershell
docker compose up -d --build
```
5. Install Caddy route on host (example file: `deploy/Caddyfile.example`):

```caddyfile
report.example.com {
  encode zstd gzip

  @frontend_api path /api/auth/* /api/local-media /api/local-media/* /api/media/proxy /api/media/proxy/*
  handle @frontend_api {
    reverse_proxy 127.0.0.1:3200
  }

  @api path /api/*
  handle @api {
    reverse_proxy 127.0.0.1:3003
  }

  handle {
    reverse_proxy 127.0.0.1:3200
  }
}
```

6. Reload Caddy and verify:
- `https://report.example.com/api/health` returns OK
- `https://report.example.com/api/auth/microsoft/start?next=%2Fapp` redirects to Microsoft (not backend 404)
- app login works
- media endpoints block anonymous requests (run `qa:production-smoke`)

Troubleshooting (`/setup/super-admin` shows "unable to load setup status"):
- check backend health: `curl https://report.example.com/api/health`
- check bootstrap status API: `curl https://report.example.com/api/users/bootstrap/status`
- verify frontend secret env: `docker compose exec frontend printenv INTERNAL_API_AUTH_SECRET`
- verify backend secret env: `docker compose exec backend printenv INTERNAL_API_AUTH_SECRET`
- verify backend setup mode env: `docker compose exec backend printenv SUPER_ADMIN_SETUP_MODE`

That keeps Caddy as the only public entrypoint while app containers stay private behind loopback bindings.
