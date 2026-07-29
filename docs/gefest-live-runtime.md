# Gefest live runtime

The base `docker-compose.yml` starts Afrodite and the bind-mounted Gefest frontend. The Gefest frontend calls a browser-visible API URL, which defaults to `http://localhost:8000`. Use the Gefest overlay to start that API and its local dependencies in the same Compose project.

## Environment

```dotenv
AFRODITE_TARGET_PROJECT=C:/Users/bolthold/Documents/Code/Gefest-CAD
AFRODITE_TARGET_PACKAGE_DIR=frontend
AFRODITE_TARGET_PREVIEW_SCRIPT=dev
AFRODITE_TARGET_PREVIEW_PORT=3000
GEFEST_API_PORT=8000
GEFEST_SOLVER_PORT=8010
```

Keep the existing bridge and tunnel secrets in `.env`.

## Start

```powershell
pnpm docker:up:gefest
```

Equivalent command:

```powershell
docker compose -f docker-compose.yml -f docker-compose.gefest.yml up -d --build
```

This starts Afrodite Studio, preview host, Project Bridge, MCP gateway, tunnel client, Gefest frontend, Gefest API, solver, PostgreSQL, Redis, and MinIO. The browser-facing endpoints are:

```text
Afrodite Studio  http://localhost:4173
Gefest frontend  http://localhost:3000
Gefest API       http://localhost:8000
Gefest solver    http://localhost:8010
```

## Verify

```powershell
curl.exe http://127.0.0.1:8000/health
curl.exe http://127.0.0.1:8000/projects/demo-parametric-bracket/workspace/scene
curl.exe http://127.0.0.1:3000
```

The health response must identify `Gefest CAD API`. The workspace scene endpoint must return JSON before the live iframe can show an online API state.

## Logs and shutdown

```powershell
pnpm docker:logs:gefest
pnpm docker:down:gefest
```

Do not run the standalone Gefest `frontend` service at the same time as Afrodite `target-preview`, because both publish port `3000`.
