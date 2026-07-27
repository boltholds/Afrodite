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
  frozen="true"
  if [ -f "$project_root/pnpm-lock.yaml" ]; then
    package_manager="pnpm"
    lock_file="$project_root/pnpm-lock.yaml"
  elif [ -f "$project_root/package-lock.json" ]; then
    package_manager="npm"
    lock_file="$project_root/package-lock.json"
  elif [ -f "$project_root/yarn.lock" ]; then
    package_manager="yarn"
    lock_file="$project_root/yarn.lock"
  else
    frozen="false"
    declared_manager="$(node -e 'const p=require(process.argv[1]); process.stdout.write(String(p.packageManager || ""))' "$project_root/package.json")"
    case "$declared_manager" in
      pnpm@*) package_manager="pnpm" ;;
      yarn@*) package_manager="yarn" ;;
      npm@*) package_manager="npm" ;;
      *)
        if [ -f "$project_root/pnpm-workspace.yaml" ]; then
          package_manager="pnpm"
        else
          package_manager="npm"
        fi
        ;;
    esac
    lock_file="$project_root/package.json"
    echo "[afrodite-project-bridge] no lockfile; installing without creating or updating one"
  fi

  fingerprint="$({ sha256sum "$project_root/package.json"; sha256sum "$lock_file"; } | sha256sum | cut -d' ' -f1)"
  if [ -f "$stamp_file" ] && [ "$(cat "$stamp_file")" = "$fingerprint" ]; then
    echo "[afrodite-project-bridge] target dependencies already match $package_manager inputs"
    return
  fi

  echo "[afrodite-project-bridge] installing target dependencies with $package_manager"
  mkdir -p "$project_root/node_modules"
  (
    cd "$project_root"
    case "$package_manager:$frozen" in
      pnpm:true)
        corepack enable
        pnpm install --frozen-lockfile
        ;;
      pnpm:false)
        corepack enable
        pnpm install --no-frozen-lockfile --lockfile=false
        ;;
      npm:true)
        npm ci
        ;;
      npm:false)
        npm install --package-lock=false
        ;;
      yarn:true)
        corepack enable
        yarn install --immutable
        ;;
      yarn:false)
        corepack enable
        yarn install --no-immutable --mode=skip-build
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
