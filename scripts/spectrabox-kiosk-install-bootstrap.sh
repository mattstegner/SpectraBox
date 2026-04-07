#!/usr/bin/env bash
# SpectraBox online bootstrap installer
#
# Purpose:
# - keep the one-line internet install flow
# - avoid piping the full installer directly into bash
# - validate the downloaded installer before executing it

set -e
set -u
set -o pipefail

INSTALL_URL="${SPECTRABOX_INSTALL_URL:-https://raw.githubusercontent.com/mattstegner/SpectraBox/main/scripts/spectrabox-kiosk-install-v2.sh}"
TMP_SCRIPT="$(mktemp /tmp/spectrabox-kiosk-install-v2.XXXXXX.sh)"

cleanup() {
  rm -f "$TMP_SCRIPT"
}

trap cleanup EXIT

download_installer() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 --connect-timeout 15 "$INSTALL_URL" -o "$TMP_SCRIPT"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -qO "$TMP_SCRIPT" "$INSTALL_URL"
    return
  fi

  echo "[ERR] curl or wget is required to download the installer." >&2
  exit 1
}

echo "[INFO] Downloading SpectraBox installer..."
download_installer

echo "[INFO] Validating downloaded installer..."
if ! bash -n "$TMP_SCRIPT"; then
  echo "[ERR] Downloaded installer failed syntax validation. Aborting." >&2
  exit 1
fi

chmod +x "$TMP_SCRIPT"

echo "[INFO] Launching SpectraBox installer..."
exec bash "$TMP_SCRIPT" "$@"
