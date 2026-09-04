#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANAGE_PY="$REPO_ROOT/BackEnd/API/manage.py"
FUNNEL_HOSTNAME="${1:-}"

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

if ! command -v python >/dev/null 2>&1; then
  echo "Error: python was not found. Activate your project venv first, then rerun this script." >&2
  exit 1
fi

if [ ! -f "$MANAGE_PY" ]; then
  echo "Error: Django manage.py was not found at $MANAGE_PY" >&2
  exit 1
fi

FUNNEL_HOSTNAME="$(normalize_host "$FUNNEL_HOSTNAME")"

export DJANGO_SETTINGS_MODULE="API.team_room_settings"
if [ -n "$FUNNEL_HOSTNAME" ]; then
  export DJANGO_ALLOWED_HOSTS="localhost,127.0.0.1,$FUNNEL_HOSTNAME"
else
  export DJANGO_ALLOWED_HOSTS="localhost,127.0.0.1"
fi
export PYTHONPATH="$REPO_ROOT:$REPO_ROOT/BackEnd/src"

cd "$REPO_ROOT"
python "$MANAGE_PY" runserver 127.0.0.1:8100
