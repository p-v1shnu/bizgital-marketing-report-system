#!/bin/sh
set -u

stamp_file="/tmp/bizgital-backend-dev-docker-watch.stamp"
app_pid=""

cleanup() {
  if [ -n "$app_pid" ]; then
    kill "$app_pid" 2>/dev/null || true
    wait "$app_pid" 2>/dev/null || true
  fi
}

start_app() {
  node dist/main.js &
  app_pid="$!"
}

rebuild() {
  tsc -p tsconfig.build.json
  touch "$stamp_file"
}

trap cleanup EXIT INT TERM

rebuild || exit 1
start_app

while true; do
  if find src -type f -name '*.ts' -newer "$stamp_file" | grep -q .; then
    echo "[dev:docker] Source change detected. Rebuilding backend..."
    if rebuild; then
      echo "[dev:docker] Rebuild succeeded. Restarting backend..."
      kill "$app_pid" 2>/dev/null || true
      wait "$app_pid" 2>/dev/null || true
      start_app
    else
      echo "[dev:docker] Rebuild failed. Keeping existing backend process running."
    fi
  fi

  sleep 1
done
