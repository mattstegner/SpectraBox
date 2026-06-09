#!/usr/bin/env bash
# SpectraBox kiosk installer for Raspberry Pi OS 13 (Trixie) with Desktop.
# This installer intentionally supports only the default Wayland/labwc desktop.

set -Eeuo pipefail

SCRIPT_NAME="$(basename "$0")"
REPO_URL="https://github.com/mattstegner/SpectraBox.git"
SERVICE_NAME="spectrabox"
PORT="3000"

AUTO_YES=0
NO_REBOOT=0
TARGET_USER=""
PI_USER=""
PI_HOME=""
APP_DIR=""
NODE_BIN=""
CHROMIUM_BIN=""
CURRENT_STEP="startup"

APT_DPKG_OPTIONS=(
  -o Dpkg::Options::=--force-confdef
  -o Dpkg::Options::=--force-confold
)

banner() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m[OK]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[WARN]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[ERR]\033[0m %s\n' "$*" >&2; }
step() { printf '   - %s\n' "$*"; }

on_error() {
  local exit_code=$?
  err "Installation failed during: ${CURRENT_STEP} (exit ${exit_code})."
  exit "$exit_code"
}
trap on_error ERR

usage() {
  cat <<USAGE
Usage: sudo bash ${SCRIPT_NAME} [options]

Options:
  -y, --yes               Run without confirmation prompts
      --target-user USER  Configure the kiosk for USER (default: SUDO_USER)
      --no-reboot         Do not offer to reboot after installation
  -h, --help              Show this help

Supported platform:
  Raspberry Pi OS 13 (Trixie) with the default Wayland/labwc desktop.
USAGE
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -y|--yes)
        AUTO_YES=1
        ;;
      --target-user)
        shift
        if [[ $# -eq 0 || -z "${1:-}" ]]; then
          err "--target-user requires a username"
          exit 2
        fi
        TARGET_USER="$1"
        ;;
      --no-reboot)
        NO_REBOOT=1
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        err "Unknown option: $1"
        usage
        exit 2
        ;;
    esac
    shift
  done
}

confirm_install() {
  local answer
  if [[ "$AUTO_YES" -eq 1 ]]; then
    return 0
  fi

  printf '\nInstall SpectraBox for user %s in %s? [Y/n] ' "$PI_USER" "$APP_DIR"
  read -r answer </dev/tty || answer="Y"
  [[ -z "$answer" || "$answer" =~ ^[Yy]$ ]]
}

apt_get_safe() {
  apt-get "${APT_DPKG_OPTIONS[@]}" "$@"
}

run_as_user() {
  runuser -u "$PI_USER" -- env HOME="$PI_HOME" "$@"
}

require_root() {
  if [[ "$EUID" -ne 0 ]]; then
    err "Run this installer as root, for example: sudo bash ${SCRIPT_NAME}"
    exit 1
  fi
}

resolve_target_user() {
  if [[ -n "$TARGET_USER" ]]; then
    PI_USER="$TARGET_USER"
  elif [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
    PI_USER="$SUDO_USER"
  else
    err "Unable to determine a non-root kiosk user. Pass --target-user USER."
    exit 1
  fi

  if [[ "$PI_USER" == "root" ]]; then
    err "The kiosk user cannot be root. Pass --target-user with a normal desktop user."
    exit 1
  fi
  if ! id "$PI_USER" >/dev/null 2>&1; then
    err "Target user '${PI_USER}' does not exist."
    exit 1
  fi

  PI_HOME="$(getent passwd "$PI_USER" | cut -d: -f6)"
  if [[ -z "$PI_HOME" || ! -d "$PI_HOME" ]]; then
    err "Target user '${PI_USER}' does not have a usable home directory."
    exit 1
  fi
  APP_DIR="${PI_HOME}/spectrabox"
}

require_trixie_desktop() {
  local os_id="" os_version="" os_codename=""

  if [[ ! -r /etc/os-release ]]; then
    err "Cannot read /etc/os-release; Raspberry Pi OS Trixie is required."
    exit 1
  fi

  # shellcheck disable=SC1091
  source /etc/os-release
  os_id="${ID:-}"
  os_version="${VERSION_ID:-}"
  os_codename="${VERSION_CODENAME:-}"

  if [[ "$os_version" != "13" || "$os_codename" != "trixie" ]]; then
    err "Unsupported OS: ${PRETTY_NAME:-unknown}. Install a fresh Raspberry Pi OS 13 Trixie Desktop image."
    exit 1
  fi
  if [[ "$os_id" != "raspbian" && ! -e /etc/rpi-issue ]]; then
    err "This does not appear to be Raspberry Pi OS. Debian Trixie alone is not supported."
    exit 1
  fi
  if ! command -v raspi-config >/dev/null 2>&1; then
    err "raspi-config is missing. Use the official Raspberry Pi OS Trixie image."
    exit 1
  fi
  if ! command -v labwc >/dev/null 2>&1; then
    err "labwc is missing. Install Raspberry Pi OS Trixie with Desktop, not the Lite image."
    exit 1
  fi
  if [[ ! -f /usr/share/wayland-sessions/rpd-labwc.desktop ]]; then
    err "The Raspberry Pi labwc desktop session is missing. A Trixie Desktop image is required."
    exit 1
  fi
}

verify_existing_repository() {
  local origin dirty

  if [[ ! -d "$APP_DIR" ]]; then
    return 0
  fi
  if [[ ! -d "$APP_DIR/.git" ]]; then
    err "${APP_DIR} exists but is not a Git clone. Move it aside and rerun the installer."
    exit 1
  fi

  origin="$(run_as_user git -C "$APP_DIR" remote get-url origin 2>/dev/null || true)"
  case "$origin" in
    https://github.com/mattstegner/SpectraBox|https://github.com/mattstegner/SpectraBox.git|git@github.com:mattstegner/SpectraBox.git)
      ;;
    *)
      err "${APP_DIR} is not the SpectraBox repository (origin: ${origin:-missing})."
      exit 1
      ;;
  esac

  dirty="$(run_as_user git -C "$APP_DIR" status --porcelain --untracked-files=normal)"
  if [[ -n "$dirty" ]]; then
    err "${APP_DIR} has local changes or untracked files. Commit, move, or remove them before installing."
    exit 1
  fi
}

install_packages() {
  export DEBIAN_FRONTEND=noninteractive

  apt-get update
  apt_get_safe upgrade -y
  apt_get_safe install -y \
    ca-certificates \
    chromium \
    curl \
    git \
    jq \
    nodejs \
    npm \
    openssl \
    pipewire-audio \
    pipewire-pulse \
    wireplumber \
    libspa-0.2-bluetooth \
    alsa-utils \
    util-linux

  NODE_BIN="$(command -v node || true)"
  CHROMIUM_BIN="$(command -v chromium || true)"

  if [[ -z "$NODE_BIN" ]]; then
    err "The Trixie nodejs package did not install a node binary."
    exit 1
  fi
  if [[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt 20 ]]; then
    err "Node.js 20 or newer is required; found $(node --version)."
    exit 1
  fi
  if [[ -z "$CHROMIUM_BIN" ]]; then
    err "The Trixie chromium package did not install a chromium binary."
    exit 1
  fi

  usermod -aG audio,video "$PI_USER"
}

install_repository() {
  if [[ -d "$APP_DIR/.git" ]]; then
    run_as_user git -C "$APP_DIR" fetch --prune origin
    run_as_user git -C "$APP_DIR" pull --ff-only
  else
    run_as_user git clone "$REPO_URL" "$APP_DIR"
  fi

  if [[ ! -f "$APP_DIR/package-lock.json" ]]; then
    err "The SpectraBox clone is missing package-lock.json; refusing a non-reproducible install."
    exit 1
  fi
  run_as_user npm --prefix "$APP_DIR" ci --omit=dev
}

install_tls_certificate() {
  local ssl_dir="${APP_DIR}/ssl"
  install -d -m 700 -o "$PI_USER" -g "$PI_USER" "$ssl_dir"

  if [[ ! -s "$ssl_dir/key.pem" || ! -s "$ssl_dir/cert.pem" ]] && \
    [[ -f "$APP_DIR/generate-ssl.js" ]]; then
    run_as_user "$NODE_BIN" "$APP_DIR/generate-ssl.js"
  fi

  if [[ ! -s "$ssl_dir/key.pem" || ! -s "$ssl_dir/cert.pem" ]]; then
    openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
      -keyout "$ssl_dir/key.pem" \
      -out "$ssl_dir/cert.pem" \
      -subj "/C=US/O=SpectraBox/CN=localhost" \
      -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
  fi

  chown "$PI_USER:$PI_USER" "$ssl_dir/key.pem" "$ssl_dir/cert.pem"
  chmod 600 "$ssl_dir/key.pem"
  chmod 644 "$ssl_dir/cert.pem"
}

install_systemd_service() {
  local service_file="/etc/systemd/system/${SERVICE_NAME}.service"

  cat >"$service_file" <<SERVICE
[Unit]
Description=SpectraBox Node Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${PI_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=PORT=${PORT}
Environment=HOST=0.0.0.0
Environment=LOG_LEVEL=info
Environment=NODE_OPTIONS=--max-old-space-size=256
ExecStart=${NODE_BIN} ${APP_DIR}/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=false
MemoryMax=512M
CPUQuota=80%

[Install]
WantedBy=multi-user.target
SERVICE

  chmod 644 "$service_file"
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  systemctl restart "$SERVICE_NAME"
}

configure_desktop() {
  systemctl set-default graphical.target
  SUDO_USER="$PI_USER" raspi-config nonint do_wayland W2
  SUDO_USER="$PI_USER" raspi-config nonint do_boot_behaviour B4
  SUDO_USER="$PI_USER" raspi-config nonint do_blanking 1
}

install_chromium_policy() {
  local policy_dir="/etc/chromium/policies/managed"
  local policy_file="${policy_dir}/spectrabox-audio-capture.json"

  install -d -m 755 "$policy_dir"
  cat >"$policy_file" <<POLICY
{
  "AudioCaptureAllowedUrls": [
    "https://localhost:${PORT}"
  ]
}
POLICY
  chmod 644 "$policy_file"
}

install_kiosk_launchers() {
  local start_kiosk="${PI_HOME}/start-spectrabox-kiosk.sh"
  local exit_kiosk="${PI_HOME}/exit-spectrabox-kiosk.sh"
  local labwc_dir="${PI_HOME}/.config/labwc"
  local autostart_file="${labwc_dir}/autostart"
  local marker_start="# BEGIN SPECTRABOX KIOSK"
  local marker_end="# END SPECTRABOX KIOSK"
  local tmp_file

  cat >"$start_kiosk" <<LAUNCHER
#!/usr/bin/env bash
set -Eeuo pipefail

URL="https://localhost:${PORT}"
CHROMIUM_BIN="${CHROMIUM_BIN}"
LOCK_FILE="\${XDG_RUNTIME_DIR:-/tmp}/spectrabox-kiosk.lock"

if [[ "\${XDG_SESSION_TYPE:-}" != "wayland" ]]; then
  printf 'SpectraBox kiosk requires a Wayland session.\\n' >&2
  exit 1
fi

exec 9>"\$LOCK_FILE"
flock -n 9 || exit 0

if pgrep -u "\$(id -u)" -f "[c]hromium.*\${URL}" >/dev/null 2>&1; then
  exit 0
fi

for _ in \$(seq 1 30); do
  if wpctl status >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

for _ in \$(seq 1 90); do
  if curl --silent --show-error --insecure --max-time 2 "\${URL}/api/health" >/dev/null 2>&1; then
    exec "\$CHROMIUM_BIN" \
      --ozone-platform=wayland \
      --kiosk "\$URL" \
      --app="\$URL" \
      --noerrdialogs \
      --no-first-run \
      --disable-session-crashed-bubble \
      --password-store=basic \
      --autoplay-policy=no-user-gesture-required \
      --ignore-certificate-errors \
      --start-maximized \
      --hide-scrollbars
  fi
  sleep 1
done

printf 'SpectraBox did not become healthy at %s within 90 seconds.\\n' "\$URL" >&2
exit 1
LAUNCHER

  cat >"$exit_kiosk" <<'EXIT_SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail
pkill -u "$(id -u)" -f '[c]hromium.*https://localhost:3000' || true
EXIT_SCRIPT

  chmod 755 "$start_kiosk" "$exit_kiosk"
  chown "$PI_USER:$PI_USER" "$start_kiosk" "$exit_kiosk"

  install -d -m 755 -o "$PI_USER" -g "$PI_USER" "$labwc_dir"
  touch "$autostart_file"
  chown "$PI_USER:$PI_USER" "$autostart_file"

  tmp_file="$(mktemp)"
  awk -v start="$marker_start" -v end="$marker_end" '
    $0 == start { skipping = 1; next }
    $0 == end { skipping = 0; next }
    !skipping { print }
  ' "$autostart_file" >"$tmp_file"

  {
    cat "$tmp_file"
    printf '\n%s\n' "$marker_start"
    printf '%q &\n' "$start_kiosk"
    printf '%s\n' "$marker_end"
  } >"$autostart_file"
  rm -f "$tmp_file"
  chown "$PI_USER:$PI_USER" "$autostart_file"
  chmod 644 "$autostart_file"
}

verify_installation() {
  local policy_file="/etc/chromium/policies/managed/spectrabox-audio-capture.json"
  local autostart_file="${PI_HOME}/.config/labwc/autostart"
  local marker_count launcher_count

  if ! systemctl is-active --quiet "$SERVICE_NAME"; then
    systemctl --no-pager --full status "$SERVICE_NAME" || true
    err "${SERVICE_NAME}.service is not active."
    exit 1
  fi

  if ! curl --silent --show-error --fail --insecure --retry 15 --retry-delay 2 \
    --retry-all-errors \
    "https://localhost:${PORT}/api/health" >/dev/null; then
    journalctl -u "$SERVICE_NAME" --no-pager -n 50 || true
    err "SpectraBox did not pass its HTTPS health check."
    exit 1
  fi

  [[ -x "${PI_HOME}/start-spectrabox-kiosk.sh" ]] || {
    err "The kiosk start launcher is missing."
    exit 1
  }
  [[ -s "${APP_DIR}/ssl/key.pem" && -s "${APP_DIR}/ssl/cert.pem" ]] || {
    err "TLS key or certificate is missing."
    exit 1
  }
  jq -e \
    --arg url "https://localhost:${PORT}" \
    '.AudioCaptureAllowedUrls == [$url]' \
    "$policy_file" >/dev/null || {
      err "The Chromium audio capture policy is invalid."
      exit 1
    }

  marker_count="$(grep -c '^# BEGIN SPECTRABOX KIOSK$' "$autostart_file" || true)"
  launcher_count="$(grep -cF "${PI_HOME}/start-spectrabox-kiosk.sh" "$autostart_file" || true)"
  if [[ "$marker_count" -ne 1 || "$launcher_count" -ne 1 ]]; then
    err "labwc autostart must contain exactly one SpectraBox entry; found ${launcher_count}."
    exit 1
  fi
}

maybe_reboot() {
  local answer

  if [[ "$NO_REBOOT" -eq 1 ]]; then
    warn "Reboot skipped (--no-reboot). Reboot before testing kiosk autostart."
    return
  fi
  if [[ "$AUTO_YES" -eq 1 ]]; then
    warn "Installation is complete. Reboot the Pi to enter kiosk mode."
    return
  fi

  printf '\nReboot now to start SpectraBox kiosk mode? [Y/n] '
  read -r answer </dev/tty || answer="Y"
  if [[ -z "$answer" || "$answer" =~ ^[Yy]$ ]]; then
    reboot
  fi
}

main() {
  parse_args "$@"

  CURRENT_STEP="preflight checks"
  require_root
  resolve_target_user
  require_trixie_desktop
  verify_existing_repository

  banner "SpectraBox Trixie Kiosk Installer"
  step "Target user: ${PI_USER}"
  step "App path: ${APP_DIR}"
  step "Platform: Raspberry Pi OS 13 Trixie, Wayland/labwc"
  confirm_install || {
    warn "Installation cancelled."
    exit 0
  }

  CURRENT_STEP="Trixie package installation"
  banner "Installing Trixie packages"
  install_packages
  ok "Node.js $(node --version), Chromium, and PipeWire are installed"

  CURRENT_STEP="SpectraBox repository installation"
  banner "Installing SpectraBox"
  install_repository
  ok "SpectraBox repository and production dependencies are ready"

  CURRENT_STEP="TLS certificate generation"
  banner "Generating HTTPS certificate"
  install_tls_certificate
  ok "HTTPS assets are ready"

  CURRENT_STEP="systemd service installation"
  banner "Installing SpectraBox service"
  install_systemd_service
  ok "spectrabox.service is enabled and running"

  CURRENT_STEP="Trixie desktop configuration"
  banner "Configuring Wayland desktop"
  configure_desktop
  ok "labwc, desktop autologin, and display blanking are configured"

  CURRENT_STEP="Chromium policy installation"
  banner "Configuring Chromium microphone access"
  install_chromium_policy
  ok "Chromium microphone policy is installed"

  CURRENT_STEP="labwc kiosk configuration"
  banner "Installing kiosk launchers"
  install_kiosk_launchers
  ok "labwc kiosk autostart is configured"

  CURRENT_STEP="installation verification"
  banner "Verifying installation"
  verify_installation
  ok "Service, HTTPS, Chromium policy, and labwc autostart checks passed"

  banner "Installation complete"
  step "Local URL: https://localhost:${PORT}"
  step "Start kiosk: ${PI_HOME}/start-spectrabox-kiosk.sh"
  step "Exit kiosk: ${PI_HOME}/exit-spectrabox-kiosk.sh"
  maybe_reboot
}

main "$@"
