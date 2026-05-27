#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d ".venv" ]; then
  echo "Error: .venv not found. Run ./install.sh first."
  exit 1
fi

if [ -f ".venv/bin/activate" ]; then
  # macOS/Linux venv
  # shellcheck disable=SC1091
  source ".venv/bin/activate"
elif [ -f ".venv/Scripts/activate" ]; then
  # Windows venv (Git Bash)
  # shellcheck disable=SC1091
  source ".venv/Scripts/activate"
else
  echo "Error: venv activate script not found in .venv"
  exit 1
fi

APP_FILE="${APP_FILE:-server.py}"
PORT="${PORT:-8000}"

echo "Starting FastAPI: $APP_FILE on port $PORT"
python -m fastapi run "$APP_FILE" --port "$PORT"
