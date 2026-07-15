#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
PUBLIC_DIR=/tmp/2026-world-cup-public
REMOTE_URL=${REMOTE_URL:-git@github-worldcup:TonyTCFu/2026-world-cup-dashboard-codex.git}

rm -rf "$PUBLIC_DIR"
mkdir -p "$PUBLIC_DIR/.github/workflows" "$PUBLIC_DIR/assets" "$PUBLIC_DIR/data" "$PUBLIC_DIR/scripts"

cp "$ROOT_DIR/index.html" "$PUBLIC_DIR/"
cp "$ROOT_DIR/README.md" "$PUBLIC_DIR/"
cp "$ROOT_DIR/package.json" "$PUBLIC_DIR/"
cp "$ROOT_DIR/.gitignore" "$PUBLIC_DIR/"
cp "$ROOT_DIR/.nojekyll" "$PUBLIC_DIR/"
cp "$ROOT_DIR/site.webmanifest" "$PUBLIC_DIR/"
cp "$ROOT_DIR/.github/workflows/daily-update.yml" "$PUBLIC_DIR/.github/workflows/"
cp "$ROOT_DIR/assets/app.js" "$PUBLIC_DIR/assets/"
cp "$ROOT_DIR/assets/styles.css" "$PUBLIC_DIR/assets/"
cp "$ROOT_DIR/assets/favicon.svg" "$PUBLIC_DIR/assets/"
cp "$ROOT_DIR/assets/favicon-64.png" "$PUBLIC_DIR/assets/"
cp "$ROOT_DIR/assets/favicon-64-v2.png" "$PUBLIC_DIR/assets/"
cp "$ROOT_DIR/assets/icon-192.png" "$PUBLIC_DIR/assets/"
cp "$ROOT_DIR/assets/icon-192-v2.png" "$PUBLIC_DIR/assets/"
cp "$ROOT_DIR/assets/icon-512.png" "$PUBLIC_DIR/assets/"
cp "$ROOT_DIR/assets/icon-512-v2.png" "$PUBLIC_DIR/assets/"
cp "$ROOT_DIR/assets/apple-touch-icon.png" "$PUBLIC_DIR/assets/"
cp "$ROOT_DIR/assets/apple-touch-icon-v2.png" "$PUBLIC_DIR/assets/"
cp "$ROOT_DIR/data/latest.json" "$PUBLIC_DIR/data/"
cp "$ROOT_DIR/scripts/build-data.mjs" "$PUBLIC_DIR/scripts/"
cp "$ROOT_DIR/scripts/publish-public.sh" "$PUBLIC_DIR/scripts/"

cd "$PUBLIC_DIR"
git init -b main >/dev/null 2>&1
git config user.name "Tony Fu"
git config user.email "tony.tc.fu@gmail.com"
git add .
git commit -m "docs: refresh world cup dashboard public site" >/dev/null 2>&1 || true
git remote add origin "$REMOTE_URL"
git push -f origin main
