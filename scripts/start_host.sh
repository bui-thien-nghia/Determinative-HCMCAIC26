#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$REPO_ROOT/FrontEnd"
TEAM_ROOM_PID=""
FUNNEL_STARTED=0
FUNNEL_URL=""

cleanup() {
  local exit_code=$?
  if [ "$FUNNEL_STARTED" -eq 1 ]; then
    stop_funnel >/dev/null 2>&1 || true
  fi
  if [ -n "$TEAM_ROOM_PID" ] && kill -0 "$TEAM_ROOM_PID" >/dev/null 2>&1; then
    kill "$TEAM_ROOM_PID" >/dev/null 2>&1 || true
    wait "$TEAM_ROOM_PID" >/dev/null 2>&1 || true
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

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

normalize_host() {
  python - "$1" <<'PY'
import sys
from urllib.parse import urlparse

value = sys.argv[1].strip()
if not value:
    print("")
    raise SystemExit

parsed = urlparse(value if "://" in value else f"//{value}")
host = parsed.netloc or parsed.path.split("/", 1)[0]
if "@" in host:
    host = host.rsplit("@", 1)[1]
if ":" in host and not host.startswith("["):
    host = host.split(":", 1)[0]
print(host.strip().strip("/").rstrip(".").lower())
PY
}

normalize_https_url() {
  local host
  host="$(normalize_host "$1")"
  if [ -z "$host" ]; then
    echo ""
  else
    echo "https://$host"
  fi
}

http_status() {
  local url="$1"
  local host_header="${2:-}"
  if [ -n "$host_header" ]; then
    curl -sS -o /dev/null -w "%{http_code}" --max-time 5 -H "Host: $host_header" "$url" || true
  else
    curl -sS -o /dev/null -w "%{http_code}" --max-time 5 "$url" || true
  fi
}

wait_for_status() {
  local url="$1"
  local expected="$2"
  local seconds="$3"
  local host_header="${4:-}"
  local status
  for _ in $(seq 1 "$seconds"); do
    status="$(http_status "$url" "$host_header")"
    if [ "$status" = "$expected" ]; then
      return 0
    fi
    sleep 1
  done
  return 1
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

get_tailscale_hostname() {
  local status_json
  status_json="$(tailscale status --json 2>/dev/null || true)"
  TAILSCALE_STATUS_JSON="$status_json" python - <<'PY'
import json
import os

try:
    status = json.loads(os.environ.get("TAILSCALE_STATUS_JSON", ""))
except json.JSONDecodeError:
    status = {}

dns_name = ((status.get("Self") or {}).get("DNSName") or "").strip()
print(dns_name.rstrip(".").lower())
PY
}

prompt_for_tailscale_hostname() {
  local hostname
  read -r -p "Enter your Tailscale .ts.net hostname: " hostname
  normalize_host "$hostname"
}

parse_funnel_url() {
  local hostname="$1"
  local status_output
  status_output="$(tailscale funnel status 2>/dev/null || true)"
  FUNNEL_STATUS_OUTPUT="$status_output" python - "$hostname" <<'PY'
import os
import re
import sys

fallback_host = sys.argv[1].strip().rstrip(".").lower()
text = os.environ.get("FUNNEL_STATUS_OUTPUT", "")
match = re.search(r"https://[A-Za-z0-9.-]+(?::443)?/?", text)
if match:
    url = match.group(0).rstrip("/")
    url = url.replace(":443", "")
else:
    url = f"https://{fallback_host}"
print(url)
PY
}

stop_funnel() {
  local help_text
  help_text="$(tailscale funnel --help 2>&1 || true)"
  if printf "%s" "$help_text" | grep -q -- "--https"; then
    tailscale funnel --https=443 off >/dev/null 2>&1 || tailscale funnel off >/dev/null 2>&1 || true
  else
    tailscale funnel off >/dev/null 2>&1 || tailscale funnel --https=443 off >/dev/null 2>&1 || true
  fi
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

require_command python
require_command npm
require_command tailscale
require_command curl

cd "$REPO_ROOT"

echo "Checking Tailscale..."
if ! tailscale status >/dev/null 2>&1; then
  error "Tailscale is not logged in or connected. Connect Tailscale, then retry."
  exit 1
fi

TAILSCALE_HOSTNAME="$(get_tailscale_hostname)"
if [ -z "$TAILSCALE_HOSTNAME" ]; then
  TAILSCALE_HOSTNAME="$(prompt_for_tailscale_hostname)"
fi
if [ -z "$TAILSCALE_HOSTNAME" ]; then
  error "No Tailscale hostname was provided. DJANGO_ALLOWED_HOSTS will not use a wildcard."
  exit 1
fi

echo "Tailscale hostname: $TAILSCALE_HOSTNAME"
echo "DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,$TAILSCALE_HOSTNAME"

echo "Starting Team Room on 127.0.0.1:8100..."
"$SCRIPT_DIR/start_team_room.sh" "$TAILSCALE_HOSTNAME" &
TEAM_ROOM_PID=$!

if ! wait_for_status "http://127.0.0.1:8100/api/team-room/health/" "200" 60; then
  error "Team Room did not become healthy on 127.0.0.1:8100."
  exit 1
fi
echo "Team Room health: 200"

SEARCH_STATUS="$(http_status "http://127.0.0.1:8100/api/search/")"
FILTER_STATUS="$(http_status "http://127.0.0.1:8100/api/filter/")"
if [ "$SEARCH_STATUS" != "404" ] || [ "$FILTER_STATUS" != "404" ]; then
  echo "Team Room isolation failed. Funnel was NOT started." >&2
  exit 1
fi
echo "Team Room isolation: /api/search/ 404, /api/filter/ 404"

HOST_HEADER_STATUS="$(http_status "http://127.0.0.1:8100/api/team-room/health/" "$TAILSCALE_HOSTNAME")"
if [ "$HOST_HEADER_STATUS" != "200" ]; then
  error "Host-header health check failed for $TAILSCALE_HOSTNAME with HTTP $HOST_HEADER_STATUS. Funnel was NOT started."
  exit 1
fi
echo "Host-header health: 200"

echo "Starting Tailscale Funnel for port 8100..."
tailscale funnel --bg 8100
FUNNEL_STARTED=1
FUNNEL_URL="$(parse_funnel_url "$TAILSCALE_HOSTNAME")"
FUNNEL_URL="$(normalize_https_url "$FUNNEL_URL")"
echo "Funnel URL: $FUNNEL_URL"

if ! wait_for_status "$FUNNEL_URL/api/team-room/health/" "200" 60; then
  error "Public Team Room health failed at $FUNNEL_URL/api/team-room/health/."
  exit 1
fi
echo "Public Team Room health: 200"

PUBLIC_SEARCH_STATUS="$(http_status "$FUNNEL_URL/api/search/")"
if [ "$PUBLIC_SEARCH_STATUS" != "404" ]; then
  echo "SECURITY CHECK FAILED." >&2
  echo "Public /api/search/ returned HTTP $PUBLIC_SEARCH_STATUS, expected 404. Disabling Funnel." >&2
  stop_funnel
  FUNNEL_STARTED=0
  exit 1
fi
echo "Public Team Room isolation: /api/search/ 404"

set_frontend_team_room_url "$FUNNEL_URL"
echo "Updated FrontEnd/.env.local with VITE_TEAM_ROOM_BACKEND_URL."

ensure_frontend_dependencies

cat <<READY
========================================
AIC2026 HOST READY

Frontend:
http://localhost:5173

Team Room:
http://127.0.0.1:8100

Shared Team Room:
$FUNNEL_URL

SEND THIS URL TO TEAMMATES:
$FUNNEL_URL
========================================
READY

cd "$FRONTEND_DIR"
npm run start:retrieve
