#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/app"
OUT="$ROOT/out"

mkdir -p "$OUT"
cd "$APP"

npm install
npx tauri android init
npx tauri android build --apk --debug

find src-tauri/gen/android -name '*.apk' -exec cp -t "$OUT" {} + || true

echo "APK copied to $OUT"
