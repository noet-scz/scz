#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/app"
OUT="$ROOT/out"

mkdir -p "$OUT"
cd "$APP"

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo is required" >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required" >&2
  exit 1
fi

npm install
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml

CONF="src-tauri/tauri.conf.json"
BACKUP="$(mktemp)"
cp "$CONF" "$BACKUP"
restore_conf() { cp "$BACKUP" "$CONF"; rm -f "$BACKUP"; }
trap restore_conf EXIT

# Local test builds do not need updater signatures. GitHub release keeps artifacts enabled.
if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  python - <<'PY'
import json
from pathlib import Path
p = Path('src-tauri/tauri.conf.json')
data = json.loads(p.read_text())
data.setdefault('bundle', {})['createUpdaterArtifacts'] = False
p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
PY
fi

set +e
npx tauri build --bundles appimage,deb,rpm
rc=$?
set -e
if [[ $rc -ne 0 ]]; then
  echo "Full Linux bundle failed. Retrying deb/rpm so you still get installable artifacts." >&2
  npx tauri build --bundles deb,rpm
fi

find src-tauri/target/release/bundle -type f \
  \( -name '*.AppImage' -o -name '*.deb' -o -name '*.rpm' \) \
  -exec cp -t "$OUT" {} + || true
(cd "$OUT" && for f in *; do [ -e "$f" ] || continue; nf=$(echo "$f" | sed 's/^SCZ/noet/; s/^scz/noet/'); [ "$f" = "$nf" ] || mv "$f" "$nf"; done)

echo "Desktop bundles copied to $OUT"
