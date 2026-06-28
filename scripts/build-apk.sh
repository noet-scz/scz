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

apk=$(find src-tauri/gen/android -name '*.apk' | head -1 || true)
if [[ -n "$apk" ]]; then
  cp "$apk" "$OUT/noet-0.1.0-universal-debug.apk"
fi

echo "APK copied to $OUT"
