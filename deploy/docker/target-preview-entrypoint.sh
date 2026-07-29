#!/bin/sh
set -eu

project_root="${AFRODITE_PROJECT_ROOT:-/workspace/project}"
package_dir_relative="${AFRODITE_TARGET_PACKAGE_DIR:-.}"
preview_script="${AFRODITE_TARGET_PREVIEW_SCRIPT:-dev}"
preview_host="${AFRODITE_TARGET_PREVIEW_HOST:-0.0.0.0}"
preview_port="${AFRODITE_TARGET_PREVIEW_PORT:-3000}"
package_dir="$project_root/$package_dir_relative"

case "$package_dir" in
  "$project_root"|"$project_root"/*) ;;
  *)
    echo "[afrodite-target-preview] package directory escapes project root: $package_dir_relative" >&2
    exit 1
    ;;
esac

if [ ! -f "$package_dir/package.json" ]; then
  echo "[afrodite-target-preview] package.json was not found in $package_dir" >&2
  exit 1
fi

if ! node -e 'const p=require(process.argv[1]); const s=process.argv[2]; if (!p.scripts || typeof p.scripts[s] !== "string") process.exit(1)' "$package_dir/package.json" "$preview_script"; then
  echo "[afrodite-target-preview] package script '$preview_script' was not found in $package_dir/package.json" >&2
  exit 1
fi

echo "[afrodite-target-preview] starting '$preview_script' from $package_dir on $preview_host:$preview_port"

if [ -f "$package_dir/pnpm-lock.yaml" ]; then
  corepack enable
  exec pnpm --dir "$package_dir" run "$preview_script" -- --hostname "$preview_host" --port "$preview_port"
elif [ -f "$package_dir/yarn.lock" ]; then
  corepack enable
  cd "$package_dir"
  exec yarn "$preview_script" --hostname "$preview_host" --port "$preview_port"
else
  exec npm --prefix "$package_dir" run "$preview_script" -- --hostname "$preview_host" --port "$preview_port"
fi
