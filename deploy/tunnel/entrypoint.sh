#!/bin/sh
set -eu

: "${TUNNEL_ID:?TUNNEL_ID is required}"
: "${CONTROL_PLANE_API_KEY:?CONTROL_PLANE_API_KEY is required}"

profile="${TUNNEL_PROFILE:-afrodite-mcp}"
profile_dir="${TUNNEL_PROFILE_DIR:-/data/tunnel-client}"
mcp_url="${MCP_SERVER_URL:-http://agent-gateway:8770/mcp}"
health_addr="${TUNNEL_HEALTH_LISTEN_ADDR:-0.0.0.0:8080}"

mkdir -p "$profile_dir"

tunnel-client init --force \
  --profile "$profile" \
  --profile-dir "$profile_dir" \
  --tunnel-id "$TUNNEL_ID" \
  --mcp-server-url "$mcp_url" \
  --health-listen-addr "$health_addr"

exec tunnel-client run --profile "$profile" --profile-dir "$profile_dir"
