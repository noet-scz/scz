# SCZ build notes

## Arch Linux
- Install deps: `scripts/setup-arch.sh`
- Build desktop: `scripts/build-arch.sh`
- Build APK: `scripts/build-apk.sh`

## GitHub Actions
- Desktop + APK release workflow: `.github/workflows/release.yml`
- Existing CI checks: `.github/workflows/build.yml`

## Output locations
- Desktop bundles: `app/src-tauri/target/release/bundle/`
- Collected artifacts: `out/`
