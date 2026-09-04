#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$REPO_ROOT/FrontEnd"

error() {
  echo "Error: $*" >&2
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    error "$command_name was not found. Install or activate it, then retry."
    exit 1
  fi
}

normalize_url() {
  python - "$1" <<'PY'
import sys
from urllib.parse import urlparse

value = sys.argv[1].strip()
if not value:
    print("")
    raise SystemExit

parsed = urlparse(value if "://" in value else f"https://{value}")
if parsed.scheme and parsed.scheme != "https":
    print("INVALID_SCHEME")
    raise SystemExit
host = parsed.netloc or parsed.path.split("/", 1)[0]
if "@" in host:
    host = host.rsplit("@", 1)[1]
if ":" in host and not host.startswith("["):
    host = host.split(":", 1)[0]
host = host.strip().strip("/").rstrip(".").lower()
print(f"https://{host}" if host else "")
PY
}

http_status() {
  curl -sS -o /dev/null -w "%{http_code}" --max-time 5 "$1" || true
}

is_port_open() {
  nc -z "$1" "$2" >/dev/null 2>&1
}

check_qdrant() {
  echo "Checking local Qdrant..."
  if [ "$(http_status "http://127.0.0.1:6333/collections")" = "200" ]; then
    if is_port_open 127.0.0.1 6334; then
      echo "Qdrant is available on 6333 and 6334."
      return 0
    fi
  fi

  if ! command -v docker >/dev/null 2>&1; then
    error "Qdrant is not responding and docker was not found. Start your local Qdrant container and retry."
    exit 1
  fi

  local container
  container="$(docker ps -a --filter "name=^/aic-qdrant$" --format "{{.Names}}" 2>/dev/null || true)"
  if [ "$container" != "aic-qdrant" ]; then
    error "Qdrant is not available. Start your local Qdrant container and retry."
    exit 1
  fi

  local running
  running="$(docker inspect -f "{{.State.Running}}" aic-qdrant 2>/dev/null || true)"
  if [ "$running" != "true" ]; then
    echo "Starting existing aic-qdrant container..."
    docker start aic-qdrant >/dev/null
  fi

  for _ in $(seq 1 20); do
    if [ "$(http_status "http://127.0.0.1:6333/collections")" = "200" ] && is_port_open 127.0.0.1 6334; then
      echo "Qdrant is available on 6333 and 6334."
      return 0
    fi
    sleep 1
  done

  error "Qdrant did not become available on 6333 and 6334. Start your local Qdrant container and retry."
  exit 1
}

ensure_frontend_dependencies() {
  echo "Checking frontend dependencies..."
  require_command npm
  if [ ! -x "$FRONTEND_DIR/node_modules/.bin/concurrently" ]; then
    echo "Frontend dependencies are missing. Running npm install..."
    (cd "$FRONTEND_DIR" && npm install)
  fi
  if [ ! -x "$FRONTEND_DIR/node_modules/.bin/concurrently" ]; then
    error "concurrently is still unavailable after npm install."
    exit 1
  fi
  echo "Frontend dependencies are ready."
}

set_frontend_team_room_url() {
  local url="$1"
  local env_file="$FRONTEND_DIR/.env.local"
  local tmp_file
  tmp_file="$(mktemp)"

  if [ -f "$env_file" ]; then
    awk -v value="$url" '
      BEGIN { found = 0 }
      /^VITE_TEAM_ROOM_BACKEND_URL=/ {
        if (!found) {
          print "VITE_TEAM_ROOM_BACKEND_URL=" value
          found = 1
        }
        next
      }
      { print }
      END {
        if (!found) {
          print "VITE_TEAM_ROOM_BACKEND_URL=" value
        }
      }
    ' "$env_file" > "$tmp_file"
  else
    printf "VITE_TEAM_ROOM_BACKEND_URL=%s\n" "$url" > "$tmp_file"
  fi

  mv "$tmp_file" "$env_file"
}

if [ "$#" -ne 1 ]; then
  echo "Usage: ./scripts/start_client.sh https://xxxxx.ts.net" >&2
  exit 1
fi

require_command python
require_command npm
require_command curl
require_command nc

FUNNEL_URL="$(normalize_url "$1")"
if [ "$FUNNEL_URL" = "INVALID_SCHEME" ] || [ -z "$FUNNEL_URL" ]; then
  error "Competition Team Room URL must use HTTPS, for example https://xxxxx.ts.net."
  exit 1
fi

HEALTH_STATUS="$(http_status "$FUNNEL_URL/api/team-room/health/")"
if [ "$HEALTH_STATUS" = "200" ]; then
  echo "Team Room ONLINE."
else
  echo "Warning: Team Room health returned HTTP $HEALTH_STATUS. Local retrieval can still start, but shared Team Room may be unavailable." >&2
fi

check_qdrant
ensure_frontend_dependencies
set_frontend_team_room_url "$FUNNEL_URL"
echo "Updated FrontEnd/.env.local with VITE_TEAM_ROOM_BACKEND_URL."

cat <<READY
========================================
AIC2026 CLIENT READY

Frontend:
http://localhost:5173

Local Retrieval:
http://127.0.0.1:8000

Local Qdrant:
http://127.0.0.1:6333

Shared Team Room:
$FUNNEL_URL
========================================
READY

cd "$FRONTEND_DIR"
npm run start:all
