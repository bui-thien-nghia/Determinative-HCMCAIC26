#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANAGE_PY="$REPO_ROOT/BackEnd/API/manage.py"

if ! command -v python >/dev/null 2>&1; then
  echo "Error: python was not found. Activate your project venv first, then rerun this script." >&2
  exit 1
fi

if [ ! -f "$MANAGE_PY" ]; then
  echo "Error: Django manage.py was not found at $MANAGE_PY" >&2
  exit 1
fi

export DJANGO_SETTINGS_MODULE="API.team_room_settings"
export PYTHONPATH="$REPO_ROOT:$REPO_ROOT/BackEnd/src"

cd "$REPO_ROOT"
python "$MANAGE_PY" runserver 127.0.0.1:8100
