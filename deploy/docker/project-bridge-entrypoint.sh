#!/bin/sh
set -eu

project_root="${AFRODITE_PROJECT_ROOT:-/workspace/project}"
install_mode="${AFRODITE_TARGET_INSTALL:-auto}"
stamp_file="$project_root/node_modules/.afrodite-container-deps"

if [ ! -d "$project_root" ]; then
  echo "[afrodite-project-bridge] target project directory does not exist: $project_root" >&2
  exit 1
fi

install_target_dependencies() {
  if [ ! -f "$project_root/package.json" ]; then
    echo "[afrodite-project-bridge] no package.json in target project; skipping dependency bootstrap"
    return
  fi

  package_manager=""
  lock_file=""
  install_command=""
  if [ -f "$project_root/pnpm-lock.yaml" ]; then
    package_manager="pnpm"
    lock_file="$project_root/pnpm-lock.yaml"
    install_command="pnpm install --frozen-lockfile"
  elif [ -f "$project_root/package-lock.json" ]; then
    package_manager="npm"
    lock_file="$project_root/package-lock.json"
    install_command="npm ci"
  elif [ -f "$project_root/yarn.lock" ]; then
    package_manager="yarn"
    lock_file="$project_root/yarn.lock"
    install_command="yarn install --immutable"
  else
    echo "[afrodite-project-bridge] no supported lockfile; skipping automatic dependency bootstrap"
    return
  fi

  fingerprint="$({ sha256sum "$project_root/package.json"; sha256sum "$lock_file"; } | sha256sum | cut -d' ' -f1)"
  if [ -f "$stamp_file" ] && [ "$(cat "$stamp_file")" = "$fingerprint" ]; then
    echo "[afrodite-project-bridge] target dependencies already match $package_manager lockfile"
    return
  fi

  echo "[afrodite-project-bridge] installing target dependencies with $package_manager"
  mkdir -p "$project_root/node_modules"
  (
    cd "$project_root"
    case "$package_manager" in
      pnpm)
        corepack enable
        pnpm install --frozen-lockfile
        ;;
      npm)
        npm ci
        ;;
      yarn)
        corepack enable
        yarn install --immutable
        ;;
    esac
  )
  printf '%s' "$fingerprint" > "$stamp_file"
}

case "$install_mode" in
  1|true|yes|on|auto)
    install_target_dependencies
    ;;
  0|false|no|off)
    echo "[afrodite-project-bridge] target dependency bootstrap disabled"
    ;;
  *)
    echo "[afrodite-project-bridge] invalid AFRODITE_TARGET_INSTALL=$install_mode" >&2
    exit 1
    ;;
esac

exec pnpm --dir /app --filter @afrodite/project-bridge exec tsx src/cli.ts
