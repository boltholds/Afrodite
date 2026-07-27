# Docker Compose and OpenAI tunnel deployment

This deployment packages Afrodite as five local containers:

```text
studio
preview-host
project-bridge
agent-gateway
tunnel-client
```

The tunnel is outbound-only. No public inbound port is opened on the workstation. `tunnel-client` forwards MCP traffic to the internal Docker URL:

```text
http://agent-gateway:8770/mcp
```

The HTTP gateway exposes the same policy-controlled nine read/plan/review-request tools as the stdio gateway. It exposes no filesystem, shell, source write, apply, execution, approval-decision, commit, or merge tools.

## Ports

The defaults were selected to avoid the containers already running on the development workstation.

| Host port | Service | Purpose |
|---:|---|---|
| `4173` | `studio` | Afrodite Studio UI |
| `4174` | `preview-host` | isolated component and motion runtime |
| `4175` | `project-bridge` | authenticated local project bridge |
| `8770` | `agent-gateway` | local Streamable HTTP MCP/debug endpoint |
| `8083` | `tunnel-client` | tunnel health, metrics, and operator UI |

All published ports bind to `127.0.0.1` only.

## Prepare `.env`

```powershell
Copy-Item .env.example .env
```

Set the target project path using forward slashes, for example:

```dotenv
AFRODITE_TARGET_PROJECT=C:/Users/bolthold/Documents/Code/Afrodite
```

Generate a local bridge token:

```powershell
[Convert]::ToBase64String(
  [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
)
```

Put the generated value into:

```dotenv
AFRODITE_BRIDGE_TOKEN=...
```

Also set the tunnel values created in the OpenAI platform:

```dotenv
TUNNEL_ID=tunnel_...
CONTROL_PLANE_API_KEY=sk-proj-...
```

Do not commit `.env`.

## Validate and start

```powershell
docker compose config
docker compose up --build -d
```

Equivalent package scripts:

```powershell
pnpm docker:config
pnpm docker:up
```

The first bridge start may install Linux dependencies for the target project into a named Docker volume. It detects:

```text
pnpm-lock.yaml   -> pnpm install --frozen-lockfile
package-lock.json -> npm ci
yarn.lock         -> yarn install --immutable
```

The target project's Windows `node_modules` is masked by the persistent Linux volume `afrodite-target-node-modules`.

Set this to disable automatic target dependency installation:

```dotenv
AFRODITE_TARGET_INSTALL=off
```

## Connect Studio

Open:

```text
http://localhost:4173
```

Do not open `4174` as the main application. `4174` is the isolated preview host and may display:

```text
Waiting for a validated UI IR render request.
```

In **Project session**, connect to:

```text
http://localhost:4175
```

Paste the same value used for `AFRODITE_BRIDGE_TOKEN`.

After Studio publishes its live session, the MCP readiness endpoint changes from `503` to `200`.

## Health checks

PowerShell examples:

```powershell
curl.exe http://127.0.0.1:4173/healthz
curl.exe http://127.0.0.1:4174/healthz
curl.exe http://127.0.0.1:8770/healthz
curl.exe http://127.0.0.1:8770/readyz
curl.exe http://127.0.0.1:8083/readyz
```

Project bridge health requires its bearer token:

```powershell
curl.exe `
  -H "Authorization: Bearer $env:AFRODITE_BRIDGE_TOKEN" `
  http://127.0.0.1:4175/api/health
```

Expected behavior:

- `8770/healthz` confirms the HTTP MCP process is running;
- `8770/readyz` confirms Studio has published a valid live document;
- `8083/readyz` confirms tunnel-client is connected and ready;
- the tunnel may be healthy before Studio readiness, but semantic tools need a published live session.

## Logs

```powershell
docker compose ps
docker compose logs -f project-bridge agent-gateway tunnel-client
```

The HTTP gateway logs one line when a stateful MCP session is initialized. Plan provenance remains isolated inside that MCP session.

## Shutdown and persistence

Use:

```powershell
docker compose down
```

Do not use:

```powershell
docker compose down -v
```

Removing volumes destroys:

- tunnel profile/state;
- cached Linux dependencies for the target project.

To force only target dependency reinstallation, stop the stack and remove the specific target dependency volume rather than every compose volume:

```powershell
docker compose down
docker volume rm afrodite_afrodite-target-node-modules
docker compose up --build -d
```

## Security boundary

```text
ChatGPT connector
  -> OpenAI tunnel control plane
  -> outbound tunnel-client connection
  -> internal agent-gateway:8770/mcp
  -> authenticated project-bridge:4175
  -> live Studio document and reviewed source plans
```

The bridge token stays inside project-bridge, agent-gateway, and the human-controlled Studio browser session. It is not passed to tunnel-client or the preview iframe.

The gateway remains unable to:

```text
approve or reject reviews
apply source patches or transactions
execute reviewed changes
read arbitrary files
run shell commands
commit or merge Git changes
```

Human approval and execution continue to occur in Studio.

## Updating tunnel-client

The Dockerfile pins stable `tunnel-client` `v0.0.10` and verifies architecture-specific SHA-256 checksums. Update the version and checksums together; never change the version without changing the verified hashes.

## Current limitations

- Docker image builds are intentionally development-oriented and include the monorepo workspace plus target verification toolchain;
- the target project must be bind-mountable by Docker Desktop;
- native target dependencies may require additional system packages in the project-bridge image;
- target source writes happen inside the mounted project and therefore affect the host files;
- the local HTTP MCP transport has automated protocol tests, but a real connector/tunnel end-to-end run must still be performed on the workstation with valid tunnel credentials.
