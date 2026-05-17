#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if command -v pyenv >/dev/null 2>&1; then
  export PYENV_VERSION="${PYENV_VERSION:-3.10.14}"
fi

echo "Starting Sentinel API on :8000 (Python 3.10+)..."
(cd "$ROOT/backend" && python3 -m uvicorn main:app --reload --port 8000) &
API_PID=$!

echo "Starting Sentinel UI on :3000..."
(cd "$ROOT/frontend" && npm run dev -- --port 3000 --host 127.0.0.1) &
WEB_PID=$!

trap 'kill $API_PID $WEB_PID 2>/dev/null' EXIT

echo ""
echo "  API:  http://127.0.0.1:8000/health"
echo "  App:  http://127.0.0.1:3000/sessions"
echo ""
wait
