#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
  echo "Run without sudo. The script will ask sudo only for pacman." >&2
  exit 1
fi

sudo pacman -Syu --needed \
  base-devel \
  curl \
  wget \
  file \
  openssl \
  webkit2gtk-4.1 \
  gtk3 \
  libayatana-appindicator \
  librsvg \
  patchelf \
  nodejs \
  npm \
  rustup \
  android-tools \
  jdk17-openjdk

if ! rustup toolchain list | grep -q '^stable'; then
  rustup toolchain install stable
fi
rustup default stable

rustup target add \
  aarch64-linux-android \
  armv7-linux-androideabi \
  i686-linux-android \
  x86_64-linux-android

cat <<'MSG'
Arch build deps are installed.

For desktop/AppImage:
  scripts/build-arch.sh

For Android APK you also need Android SDK + NDK paths, for example from Android Studio or sdkmanager:
  export ANDROID_HOME="$HOME/Android/Sdk"
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
  export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/26.1.10909125"
  export NDK_HOME="$ANDROID_NDK_HOME"
  scripts/build-apk.sh
MSG
