#!/usr/bin/env bash
# SpectraBox Kiosk Installer v2 (Raspberry Pi OS Bookworm + Trixie)
#
# Canonical goals:
# - Bookworm + Trixie compatible install flow
# - Canonical TLS paths: <app>/ssl/key.pem + <app>/ssl/cert.pem
# - Session-native kiosk autostart (XDG / labwc / wayfire)
# - PipeWire + WirePlumber + pipewire-pulse audio baseline
# - Node.js >= 20 runtime policy

set -e
set -u
set -o pipefail

SCRIPT_NAME="$(basename "$0")"

# ---------------------------
# Defaults / tunables
# ---------------------------
INTERACTIVE=1
if [[ "${AUTO_YES:-0}" == "1" ]]; then
  INTERACTIVE=0
fi

SKIP_AUDIO=0
SKIP_DESKTOP=0
SKIP_KIOSK=0

TARGET_USER=""
PI_USER=""
PI_HOME=""
APP_DIR=""

REPO_URL="https://github.com/mattstegner/SpectraBox.git"
SERVICE_NAME="spectrabox"
PORT="3000"
MIN_NODE_MAJOR="20"
NODE_FALLBACK_MAJOR="20"
MEM_MAX="512M"
CPU_QUOTA="80%"
NODE_BIN=""
NPM_BIN=""

OS_ID="unknown"
OS_CODENAME="unknown"
OS_VERSION_ID="unknown"
IS_PI_OS=0

DISPLAY_MODE="x11"
SESSION_NAME=""
SESSION_TYPE="x11"
SESSION_FLAVOR="x11"

CURRENT_STEP="startup"

# ---------------------------
# UI helpers
# ---------------------------
banner() { echo -e "\n\033[1;36m==> $*\033[0m"; }
ok()     { echo -e "\033[1;32m[OK]\033[0m $*"; }
warn()   { echo -e "\033[1;33m[WARN]\033[0m $*"; }
err()    { echo -e "\033[1;31m[ERR]\033[0m $*"; }
step()   { echo -e "   - $*"; }
hr()     { echo "------------------------------------------------------------"; }

usage() {
  cat <<USAGE
Usage: sudo bash ${SCRIPT_NAME} [options]

Options:
  -y, --yes                 Non-interactive mode (auto-confirm steps)
      --interactive         Force interactive mode
      --target-user USER    Install/configure for this user (default: SUDO_USER)
      --skip-audio          Skip PipeWire/WirePlumber setup
      --skip-desktop        Skip desktop/autologin configuration steps
      --skip-kiosk          Skip kiosk launcher and browser policy setup
  -h, --help                Show this help

Examples:
  sudo bash ${SCRIPT_NAME}
  sudo bash ${SCRIPT_NAME} --yes --target-user pi
  sudo bash ${SCRIPT_NAME} --skip-kiosk
USAGE
}

confirm_step() {
  # $1 = step number, $2 = title, $3 = synopsis
  local num="$1" title="$2" syn="$3" ans
  echo
  hr
  echo "Step ${num}: ${title}"
  echo "  ${syn}"
  hr

  if [[ "$INTERACTIVE" -eq 0 ]]; then
    echo "AUTO-YES: proceeding..."
    return 0
  fi

  read -r -p "Proceed? [Y/n] " ans </dev/tty || ans="Y"
  [[ -z "$ans" || "$ans" =~ ^[Yy]$ ]]
}

require_root() {
  if [[ "$EUID" -ne 0 ]]; then
    err "Please run as root: sudo bash $0"
    exit 1
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -y|--yes)
        INTERACTIVE=0
        ;;
      --interactive)
        INTERACTIVE=1
        ;;
      --target-user)
        shift
        if [[ $# -eq 0 || -z "${1:-}" ]]; then
          err "--target-user requires a username"
          exit 1
        fi
        TARGET_USER="$1"
        ;;
      --skip-audio)
        SKIP_AUDIO=1
        ;;
      --skip-desktop)
        SKIP_DESKTOP=1
        ;;
      --skip-kiosk)
        SKIP_KIOSK=1
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        err "Unknown option: $1"
        usage
        exit 1
        ;;
    esac
    shift
  done
}

resolve_user() {
  if [[ -n "$TARGET_USER" ]]; then
    PI_USER="$TARGET_USER"
  else
    PI_USER="${SUDO_USER:-${USER}}"
  fi

  if ! id "$PI_USER" >/dev/null 2>&1; then
    err "Target user '$PI_USER' does not exist"
    exit 1
  fi

  PI_HOME="$(getent passwd "$PI_USER" | cut -d: -f6)"
  if [[ -z "$PI_HOME" || ! -d "$PI_HOME" ]]; then
    err "Could not determine home directory for '$PI_USER'"
    exit 1
  fi

  APP_DIR="$PI_HOME/spectrabox"
}

load_os_release() {
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    source /etc/os-release
    OS_ID="${ID:-unknown}"
    OS_CODENAME="${VERSION_CODENAME:-unknown}"
    OS_VERSION_ID="${VERSION_ID:-unknown}"
  fi

  if [[ "$OS_ID" == "raspbian" ]] || command -v raspi-config >/dev/null 2>&1; then
    IS_PI_OS=1
  fi
}

node_major_from_bin() {
  if command -v node >/dev/null 2>&1; then
    node -p "parseInt(process.versions.node.split('.')[0], 10)" 2>/dev/null || echo 0
  else
    echo 0
  fi
}

node_major_from_apt_candidate() {
  local candidate major
  candidate="$(apt-cache policy nodejs 2>/dev/null | awk '/Candidate:/ {print $2; exit}')"

  if [[ -z "$candidate" || "$candidate" == "(none)" ]]; then
    echo 0
    return
  fi

  major="$(echo "$candidate" | sed -E 's/^[^0-9]*([0-9]+).*/\1/')"
  if [[ -z "$major" ]]; then
    echo 0
  else
    echo "$major"
  fi
}

resolve_node_binaries() {
  NODE_BIN="$(command -v node || true)"
  NPM_BIN="$(command -v npm || true)"

  if [[ -z "$NODE_BIN" ]]; then
    for candidate in /usr/bin/node /usr/local/bin/node; do
      if [[ -x "$candidate" ]]; then
        NODE_BIN="$candidate"
        break
      fi
    done
  fi

  if [[ -z "$NPM_BIN" ]]; then
    for candidate in /usr/bin/npm /usr/local/bin/npm; do
      if [[ -x "$candidate" ]]; then
        NPM_BIN="$candidate"
        break
      fi
    done
  fi
}

detect_display_mode() {
  local wayland_state
  DISPLAY_MODE=""

  # Primary signal: raspi-config wayland state (when available)
  if command -v raspi-config >/dev/null 2>&1; then
    wayland_state="$(raspi-config nonint get_wayland 2>/dev/null || true)"
    case "$wayland_state" in
      *[Ww]1*|*wayland*|*Wayland*|*labwc*)
        DISPLAY_MODE="wayland"
        ;;
      *[Ww]0*|*x11*|*X11*)
        DISPLAY_MODE="x11"
        ;;
      *)
        ;;
    esac
  fi

  # Fallback: session files
  if [[ -z "$DISPLAY_MODE" ]]; then
    if ls /usr/share/wayland-sessions/*.desktop >/dev/null 2>&1; then
      DISPLAY_MODE="wayland"
    else
      DISPLAY_MODE="x11"
    fi
  fi
}

pick_session() {
  local f
  SESSION_NAME=""
  SESSION_TYPE="$DISPLAY_MODE"
  SESSION_FLAVOR="$DISPLAY_MODE"

  shopt -s nullglob

  if [[ "$DISPLAY_MODE" == "wayland" ]]; then
    for f in /usr/share/wayland-sessions/rpd-labwc.desktop \
             /usr/share/wayland-sessions/LXDE-pi-*.desktop \
             /usr/share/wayland-sessions/rpd-*.desktop \
             /usr/share/wayland-sessions/*.desktop; do
      if [[ -f "$f" ]]; then
        SESSION_NAME="$(basename "$f" .desktop)"
        break
      fi
    done

    if [[ "$SESSION_NAME" == *"labwc"* ]]; then
      SESSION_FLAVOR="labwc"
    elif [[ "$SESSION_NAME" == *"wayfire"* ]]; then
      SESSION_FLAVOR="wayfire"
    else
      if [[ -f /usr/share/wayland-sessions/rpd-labwc.desktop ]]; then
        SESSION_FLAVOR="labwc"
      fi
    fi
  else
    for f in /usr/share/xsessions/rpd-*.desktop \
             /usr/share/xsessions/LXDE-pi*.desktop \
             /usr/share/xsessions/*.desktop; do
      if [[ -f "$f" ]] && [[ "$f" != *"lightdm-xsession"* ]]; then
        SESSION_NAME="$(basename "$f" .desktop)"
        break
      fi
    done
  fi

  shopt -u nullglob

  if [[ -z "$SESSION_NAME" ]]; then
    if [[ "$DISPLAY_MODE" == "wayland" ]]; then
      if [[ -f /usr/share/wayland-sessions/labwc.desktop ]]; then
        SESSION_NAME="labwc"
        SESSION_FLAVOR="labwc"
      elif [[ -f /usr/share/wayland-sessions/wayfire.desktop ]]; then
        SESSION_NAME="wayfire"
        SESSION_FLAVOR="wayfire"
      else
        SESSION_NAME="default"
      fi
    else
      SESSION_NAME="LXDE-pi"
    fi
  fi
}

session_name_exists() {
  local session_name="$1"

  if [[ -z "$session_name" ]]; then
    return 1
  fi

  if [[ -f "/usr/share/wayland-sessions/${session_name}.desktop" ]]; then
    return 0
  fi

  if [[ -f "/usr/share/xsessions/${session_name}.desktop" ]]; then
    return 0
  fi

  return 1
}

verify_boot_desktop_autologin() {
  local default_target autologin_ok configured_session
  default_target="$(systemctl get-default 2>/dev/null || true)"
  autologin_ok=0

  if [[ "$default_target" != "graphical.target" ]]; then
    return 1
  fi

  if [[ -d /etc/lightdm ]]; then
    if grep -Rqs "^autologin-user=${PI_USER}$" /etc/lightdm 2>/dev/null; then
      autologin_ok=1
    fi

    configured_session="$(
      grep -Rhs '^[[:space:]]*autologin-session=' /etc/lightdm 2>/dev/null | tail -n 1 | cut -d= -f2-
    )"
    if [[ -n "$configured_session" ]] && ! session_name_exists "$configured_session"; then
      return 1
    fi
  else
    autologin_ok=1
  fi

  if [[ "$autologin_ok" -eq 1 ]]; then
    return 0
  fi

  return 1
}

trap 'err "Install failed during: ${CURRENT_STEP}. Check logs above."' ERR

parse_args "$@"
require_root
resolve_user
load_os_release
detect_display_mode
pick_session

banner "SpectraBox Kiosk Installer v2"
step "Target user    : $PI_USER"
step "Home dir       : $PI_HOME"
step "App dir        : $APP_DIR"
step "OS             : ${OS_ID} (${OS_CODENAME}, ${OS_VERSION_ID})"
step "Pi OS detected : $([[ "$IS_PI_OS" -eq 1 ]] && echo yes || echo no)"
step "Display mode   : ${DISPLAY_MODE}"
step "Session        : ${SESSION_NAME} (${SESSION_FLAVOR})"

# ---------------------------------------------------------
CURRENT_STEP="system update"
if confirm_step "1" "System update + base packages" "Update APT and install core packages"; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get upgrade -y

  apt-get install -y --no-install-recommends \
    ca-certificates curl wget git jq xdg-utils \
    libnss3 libatk1.0-0 libxss1 libasound2 \
    alsa-utils openssl

  if [[ "$DISPLAY_MODE" == "x11" ]]; then
    apt-get install -y --no-install-recommends xdotool unclutter
    step "Installed X11 helpers (xdotool, unclutter)"
  else
    apt-get install -y --no-install-recommends wtype || true
    step "Installed Wayland helper (wtype, best effort)"
  fi

  ok "Base packages installed"
else
  warn "Skipped system update step"
fi

# ---------------------------------------------------------
CURRENT_STEP="desktop environment"
if [[ "$SKIP_DESKTOP" -eq 1 ]]; then
  warn "Skipped desktop environment check (--skip-desktop)"
elif confirm_step "2" "Desktop environment (Pi OS)" "Ensure Raspberry Pi desktop packages are present"; then
  if [[ "$IS_PI_OS" -eq 1 ]]; then
    if ! dpkg -l | grep -q '^ii[[:space:]].*raspberrypi-ui-mods'; then
      if dpkg -l | grep -q '^ii[[:space:]].*pi-greeter'; then
        warn "pi-greeter is already installed; skipping raspberrypi-ui-mods to avoid package conflict"
      else
        step "Installing raspberrypi-ui-mods (best effort)"
        if ! apt-get install -y raspberrypi-ui-mods; then
          warn "raspberrypi-ui-mods installation failed; continuing because this package is optional for kiosk setup"
        fi
      fi
    else
      step "raspberrypi-ui-mods already installed"
    fi
  else
    step "Non-Pi OS detected; skipping Pi desktop package"
  fi
  ok "Desktop environment step complete"
else
  warn "Skipped desktop environment step"
fi

# ---------------------------------------------------------
CURRENT_STEP="audio stack"
if [[ "$SKIP_AUDIO" -eq 1 ]]; then
  warn "Skipped audio setup (--skip-audio)"
elif confirm_step "3" "Audio stack" "Install PipeWire/WirePlumber with PulseAudio compatibility"; then
  apt-get install -y --no-install-recommends \
    pipewire-audio wireplumber libspa-0.2-bluetooth pipewire-pulse

  usermod -aG audio,video "$PI_USER" || true

  step "PipeWire stack installed; PulseAudio packages not purged"
  step "User services are intentionally not force-enabled at install time"
  ok "Audio stack configured"
else
  warn "Skipped audio stack step"
fi

# ---------------------------------------------------------
CURRENT_STEP="node runtime"
if confirm_step "4" "Node.js runtime" "Ensure Node.js >= ${MIN_NODE_MAJOR} (prefer distro, fallback NodeSource)"; then
  current_major="$(node_major_from_bin)"
  resolve_node_binaries

  need_node_install=0
  if [[ "$current_major" -lt "$MIN_NODE_MAJOR" ]]; then
    need_node_install=1
  fi

  if [[ "$need_node_install" -eq 0 ]]; then
    step "Existing Node.js is sufficient: v$(node -v | sed 's/^v//')"
  else
    candidate_major="$(node_major_from_apt_candidate)"
    step "Current Node major: ${current_major}; apt candidate major: ${candidate_major}"

    if [[ "$candidate_major" -ge "$MIN_NODE_MAJOR" ]]; then
      step "Installing Node.js from distro repositories"
      apt-get install -y nodejs
    else
      step "Installing Node.js ${NODE_FALLBACK_MAJOR}.x from NodeSource"
      curl -fsSL "https://deb.nodesource.com/setup_${NODE_FALLBACK_MAJOR}.x" | bash -
      apt-get install -y nodejs
    fi

    current_major="$(node_major_from_bin)"
    if [[ "$current_major" -lt "$MIN_NODE_MAJOR" ]]; then
      err "Node.js >= ${MIN_NODE_MAJOR} required; found $(node -v 2>/dev/null || echo 'not installed')"
      exit 1
    fi
  fi

  resolve_node_binaries
  if [[ -z "$NPM_BIN" ]]; then
    step "npm not found; attempting to install npm package"
    if apt-cache show npm >/dev/null 2>&1; then
      apt-get install -y npm || true
    fi
    resolve_node_binaries
  fi

  if [[ -z "$NPM_BIN" ]]; then
    step "npm still missing; reinstalling Node.js ${NODE_FALLBACK_MAJOR}.x from NodeSource"
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_FALLBACK_MAJOR}.x" | bash -
    apt-get install -y nodejs
    resolve_node_binaries
  fi

  if [[ -z "$NODE_BIN" || -z "$NPM_BIN" ]]; then
    err "Unable to resolve absolute node/npm paths after installation"
    exit 1
  fi

  step "Node: $(node -v 2>/dev/null || echo 'not found')"
  step "npm : $(npm -v 2>/dev/null || echo 'not found')"
  step "node bin: ${NODE_BIN}"
  step "npm bin : ${NPM_BIN}"
  ok "Node.js runtime ready"
else
  warn "Skipped Node.js setup"
fi

# ---------------------------------------------------------
CURRENT_STEP="browser install"
if confirm_step "5" "Browser install" "Install chromium/chromium-browser or firefox-esr fallback"; then
  pkg_exists() { apt-cache show "$1" 2>/dev/null | grep -q '^Package:'; }

  BROWSER_PKG=""
  if pkg_exists chromium; then
    BROWSER_PKG="chromium"
  elif pkg_exists chromium-browser; then
    BROWSER_PKG="chromium-browser"
  elif pkg_exists firefox-esr; then
    BROWSER_PKG="firefox-esr"
  else
    err "No supported browser package found (chromium/chromium-browser/firefox-esr)."
    exit 1
  fi

  apt-get install -y "$BROWSER_PKG"

  BROWSER_BIN="$(command -v chromium || true)"
  BROWSER_BIN="${BROWSER_BIN:-$(command -v chromium-browser || true)}"
  BROWSER_BIN="${BROWSER_BIN:-$(command -v firefox-esr || true)}"

  if [[ -z "$BROWSER_BIN" ]]; then
    err "Browser binary not found after install"
    exit 1
  fi

  step "Browser package: ${BROWSER_PKG}"
  step "Browser binary : ${BROWSER_BIN}"
  ok "Browser ready"
else
  warn "Skipped browser install; resolving existing browser"
  BROWSER_BIN="$(command -v chromium || true)"
  BROWSER_BIN="${BROWSER_BIN:-$(command -v chromium-browser || true)}"
  BROWSER_BIN="${BROWSER_BIN:-$(command -v firefox-esr || true)}"
  if [[ -z "$BROWSER_BIN" ]]; then
    err "No browser found. Install chromium/chromium-browser/firefox-esr first."
    exit 1
  fi
fi

# ---------------------------------------------------------
CURRENT_STEP="clone repo"
if confirm_step "6" "Clone/update SpectraBox" "Clone to ~/spectrabox or pull latest changes"; then
  if [[ -d "$APP_DIR/.git" ]]; then
    step "Repository exists; pulling latest changes"
    sudo -u "$PI_USER" git -C "$APP_DIR" pull --ff-only
  else
    step "Cloning repository to $APP_DIR"
    sudo -u "$PI_USER" git clone "$REPO_URL" "$APP_DIR"
  fi
  ok "Repository ready"
else
  warn "Skipped repository step"
fi

# ---------------------------------------------------------
CURRENT_STEP="npm install"
if confirm_step "7" "Install app dependencies" "Run npm ci/install with production dependencies"; then
  cd "$APP_DIR"
  resolve_node_binaries
  if [[ -z "$NPM_BIN" ]]; then
    err "npm binary not found in PATH"
    exit 1
  fi
  if [[ -f package-lock.json ]]; then
    sudo -u "$PI_USER" "$NPM_BIN" ci --omit=dev
  else
    sudo -u "$PI_USER" "$NPM_BIN" install --omit=dev
  fi
  ok "App dependencies installed"
else
  warn "Skipped npm install"
fi

# ---------------------------------------------------------
CURRENT_STEP="tls certs"
if confirm_step "8" "Generate HTTPS certs" "Use repo generator or OpenSSL fallback in <app>/ssl"; then
  SSL_DIR="$APP_DIR/ssl"
  mkdir -p "$SSL_DIR"
  chown -R "$PI_USER:$PI_USER" "$SSL_DIR"

  if [[ -f "$APP_DIR/generate-ssl.js" ]]; then
    step "Running generate-ssl.js"
    resolve_node_binaries
    if [[ -z "$NODE_BIN" ]]; then
      warn "node binary not found; skipping generate-ssl.js and using OpenSSL fallback"
    else
      sudo -u "$PI_USER" "$NODE_BIN" "$APP_DIR/generate-ssl.js" || warn "generate-ssl.js failed; using OpenSSL fallback"
    fi
  fi

  if [[ ! -f "$SSL_DIR/key.pem" || ! -f "$SSL_DIR/cert.pem" ]]; then
    step "Creating self-signed certs in ${SSL_DIR}"
    openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
      -keyout "$SSL_DIR/key.pem" \
      -out "$SSL_DIR/cert.pem" \
      -subj "/C=US/ST=Local/L=Local/O=SpectraBox/CN=localhost"
    chown "$PI_USER:$PI_USER" "$SSL_DIR/key.pem" "$SSL_DIR/cert.pem"
  fi

  if [[ -f "$SSL_DIR/key.pem" && -f "$SSL_DIR/cert.pem" ]]; then
    ok "TLS assets ready: ${SSL_DIR}/key.pem + cert.pem"
  else
    warn "TLS assets not present; app may run in HTTP mode"
  fi
else
  warn "Skipped TLS certificate setup"
fi

# ---------------------------------------------------------
CURRENT_STEP="systemd service"
if confirm_step "9" "Create systemd service" "Create/enable spectrabox service"; then
  resolve_node_binaries
  EXEC_START=""
  if [[ -f "$APP_DIR/package.json" ]] && jq -e '.scripts.start' "$APP_DIR/package.json" >/dev/null 2>&1; then
    if [[ -z "$NPM_BIN" ]]; then
      err "npm binary not found; cannot create npm-based service"
      exit 1
    fi
    EXEC_START="${NPM_BIN} start --silent"
  elif [[ -f "$APP_DIR/server.js" ]]; then
    if [[ -z "$NODE_BIN" ]]; then
      err "node binary not found; cannot create node-based service"
      exit 1
    fi
    EXEC_START="${NODE_BIN} ${APP_DIR}/server.js"
  else
    err "No start script or server.js found"
    exit 1
  fi

  SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
  cat > "$SERVICE_FILE" <<SERVICE_EOF
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
ExecStart=${EXEC_START}
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=false
MemoryMax=${MEM_MAX}
CPUQuota=${CPU_QUOTA}

[Install]
WantedBy=multi-user.target
SERVICE_EOF

  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  systemctl restart "$SERVICE_NAME"
  sleep 2 || true
  systemctl --no-pager --full status "$SERVICE_NAME" || true
  ok "Systemd service configured"
else
  warn "Skipped systemd service step"
fi

# ---------------------------------------------------------
CURRENT_STEP="desktop boot"
if [[ "$SKIP_DESKTOP" -eq 1 ]]; then
  warn "Skipped desktop boot/autologin (--skip-desktop)"
elif confirm_step "10" "Desktop boot + autologin" "Use raspi-config first, verify, then LightDM fallback"; then
  systemctl set-default graphical.target 2>/dev/null || true

  if command -v raspi-config >/dev/null 2>&1; then
    step "Applying raspi-config desktop autologin (B4)"
    raspi-config nonint do_boot_behaviour B4 2>/dev/null || true
  else
    step "raspi-config unavailable; using LightDM fallback only"
  fi

  if verify_boot_desktop_autologin; then
    ok "Desktop boot/autologin verified"
  else
    warn "Primary boot config verification failed; applying LightDM fallback"

    install -d /etc/lightdm/lightdm.conf.d
    cat > /etc/lightdm/lightdm.conf.d/99-spectrabox-autologin.conf <<LIGHTDM_EOF
[Seat:*]
autologin-user=${PI_USER}
autologin-user-timeout=0
user-session=${SESSION_NAME}
autologin-session=${SESSION_NAME}
LIGHTDM_EOF

    if verify_boot_desktop_autologin; then
      ok "Autologin verified after LightDM fallback"
    else
      warn "Autologin could not be fully verified; manual check may be required"
    fi
  fi
else
  warn "Skipped desktop boot/autologin step"
fi

# ---------------------------------------------------------
CURRENT_STEP="browser policy"
if [[ "$SKIP_KIOSK" -eq 1 ]]; then
  warn "Skipped browser policy (--skip-kiosk)"
elif confirm_step "11" "Chromium mic policy" "Allow localhost:${PORT} microphone capture via managed policy"; then
  install -d /etc/chromium/policies/managed /etc/opt/chrome/policies/managed
  cat > /etc/chromium/policies/managed/kiosk-mic.json <<POLICY_EOF
{
  "AudioCaptureAllowed": true,
  "AudioCaptureAllowedUrls": [
    "https://localhost:${PORT}",
    "http://localhost:${PORT}"
  ]
}
POLICY_EOF

  cp /etc/chromium/policies/managed/kiosk-mic.json /etc/opt/chrome/policies/managed/kiosk-mic.json 2>/dev/null || true
  ok "Browser policy installed"
else
  warn "Skipped browser policy step"
fi

# ---------------------------------------------------------
CURRENT_STEP="kiosk launcher"
if [[ "$SKIP_KIOSK" -eq 1 ]]; then
  warn "Skipped kiosk launcher (--skip-kiosk)"
elif confirm_step "12" "Create kiosk launcher" "Create start/exit scripts and session-native autostart"; then
  START_KIOSK="$PI_HOME/start-kiosk.sh"
  EXIT_KIOSK="$PI_HOME/exit-kiosk.sh"
  AUTOSTART_DIR="$PI_HOME/.config/autostart"
  OPENBOX_DIR="$PI_HOME/.config/openbox"
  OPENBOX_RC="$OPENBOX_DIR/lxde-pi-rc.xml"
  KIOSK_DESKTOP="$AUTOSTART_DIR/kiosk.desktop"

  URL="http://localhost:${PORT}"
  if [[ -f "$APP_DIR/ssl/key.pem" && -f "$APP_DIR/ssl/cert.pem" ]]; then
    URL="https://localhost:${PORT}"
  fi

  # Install-time assert requested by plan
  if [[ -f "$APP_DIR/ssl/key.pem" && -f "$APP_DIR/ssl/cert.pem" && "$URL" != https://* ]]; then
    err "HTTPS certs exist but kiosk URL is not HTTPS"
    exit 1
  fi

  install -d -m 755 "$AUTOSTART_DIR" "$OPENBOX_DIR"

  cat > "$START_KIOSK" <<'START_EOF'
#!/usr/bin/env bash
set -e
set -u
set -o pipefail

URL="URL_PLACEHOLDER"
BROWSER_BIN="BROWSER_BIN_PLACEHOLDER"
DEFAULT_SESSION_TYPE="SESSION_TYPE_PLACEHOLDER"

SESSION_TYPE="${XDG_SESSION_TYPE:-$DEFAULT_SESSION_TYPE}"
LOCK_FILE="/tmp/spectrabox-kiosk.lock"
BROWSER_BASENAME="$(basename "$BROWSER_BIN")"

if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  flock -n 9 || exit 0
fi

if pgrep -f "${BROWSER_BASENAME}.*${URL}" >/dev/null 2>&1; then
  exit 0
fi

if [[ "$SESSION_TYPE" == "x11" ]]; then
  export DISPLAY="${DISPLAY:-:0}"
  xset s off 2>/dev/null || true
  xset -dpms 2>/dev/null || true
  xset s noblank 2>/dev/null || true

  if command -v unclutter >/dev/null 2>&1; then
    unclutter -idle 0.5 -root >/dev/null 2>&1 &
  fi
fi

for _ in $(seq 1 20); do
  if command -v wpctl >/dev/null 2>&1 && wpctl status >/dev/null 2>&1; then
    break
  fi
  if command -v pactl >/dev/null 2>&1 && pactl info >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

for _ in $(seq 1 60); do
  if command -v curl >/dev/null 2>&1 && curl -sk --max-time 1 "${URL}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if [[ "$BROWSER_BIN" == *"chromium"* ]]; then
  WAYLAND_FLAG=""
  if [[ "$SESSION_TYPE" == "wayland" ]]; then
    WAYLAND_FLAG="--ozone-platform=wayland"
  fi

  EXTRA_HTTP_FLAG=""
  if [[ "$URL" =~ ^http:// ]]; then
    EXTRA_HTTP_FLAG="--unsafely-treat-insecure-origin-as-secure=${URL}"
  fi

  exec "$BROWSER_BIN" \
    --kiosk "$URL" \
    --app="$URL" \
    --password-store=basic \
    --noerrdialogs \
    --disable-session-crashed-bubble \
    --autoplay-policy=no-user-gesture-required \
    --ignore-certificate-errors \
    --start-maximized \
    --incognito \
    --allow-running-insecure-content \
    --disable-web-security \
    --enable-features=HardwareMediaKeyHandling \
    --hide-scrollbars \
    --disable-scroll-bounce \
    --disable-features=OverscrollHistoryNavigation \
    --overscroll-history-navigation=0 \
    --disable-pinch \
    --disable-smooth-scrolling \
    --force-device-scale-factor=1 \
    ${WAYLAND_FLAG} \
    ${EXTRA_HTTP_FLAG}
else
  exec "$BROWSER_BIN" --kiosk "$URL"
fi
START_EOF

  sed -i "s|URL_PLACEHOLDER|${URL}|g" "$START_KIOSK"
  sed -i "s|BROWSER_BIN_PLACEHOLDER|${BROWSER_BIN}|g" "$START_KIOSK"
  sed -i "s|SESSION_TYPE_PLACEHOLDER|${SESSION_TYPE}|g" "$START_KIOSK"
  chmod +x "$START_KIOSK"
  chown "$PI_USER:$PI_USER" "$START_KIOSK"

  cat > "$EXIT_KIOSK" <<'EXIT_EOF'
#!/usr/bin/env bash
pkill -f chromium || true
pkill -f chromium-browser || true
pkill -f firefox-esr || true
EXIT_EOF
  chmod +x "$EXIT_KIOSK"
  chown "$PI_USER:$PI_USER" "$EXIT_KIOSK"

  # XDG autostart (kept for both X11 and Wayland compatibility)
  cat > "$KIOSK_DESKTOP" <<DESKTOP_EOF
[Desktop Entry]
Type=Application
Name=SpectraBox Kiosk
Exec=${START_KIOSK}
X-GNOME-Autostart-enabled=true
DESKTOP_EOF
  chown -R "$PI_USER:$PI_USER" "$AUTOSTART_DIR"

  # X11 emergency exit binding
  if [[ "$DISPLAY_MODE" == "x11" ]] && [[ ! -f "$OPENBOX_RC" ]]; then
    cat > "$OPENBOX_RC" <<'OPENBOX_EOF'
<openbox_config>
  <keyboard>
    <keybind key="C-A-x">
      <action name="Execute"><command>/bin/bash -lc "$HOME/exit-kiosk.sh"</command></action>
    </keybind>
  </keyboard>
</openbox_config>
OPENBOX_EOF
    chown -R "$PI_USER:$PI_USER" "$OPENBOX_DIR"
  fi

  # Wayland primary: labwc autostart
  if [[ "$DISPLAY_MODE" == "wayland" && "$SESSION_FLAVOR" == "labwc" ]]; then
    LABWC_DIR="$PI_HOME/.config/labwc"
    LABWC_AUTOSTART="$LABWC_DIR/autostart"
    install -d -m 755 "$LABWC_DIR"
    touch "$LABWC_AUTOSTART"

    if ! grep -qF "$START_KIOSK" "$LABWC_AUTOSTART"; then
      printf "bash -lc '%s'\n" "$START_KIOSK" >> "$LABWC_AUTOSTART"
    fi
    chown -R "$PI_USER:$PI_USER" "$LABWC_DIR"
    step "Configured labwc autostart"
  fi

  # Wayland secondary: touch wayfire.ini only when active flavor is wayfire
  if [[ "$DISPLAY_MODE" == "wayland" && "$SESSION_FLAVOR" == "wayfire" ]]; then
    WAYFIRE_INI="$PI_HOME/.config/wayfire.ini"
    install -d -m 755 "$PI_HOME/.config"
    touch "$WAYFIRE_INI"

    if ! grep -q '^\[autostart\]' "$WAYFIRE_INI"; then
      printf "[autostart]\n" >> "$WAYFIRE_INI"
    fi
    if ! grep -q '^kiosk[[:space:]]*=' "$WAYFIRE_INI"; then
      printf "kiosk = bash -lc \"%q\"\n" "$START_KIOSK" >> "$WAYFIRE_INI"
    fi
    chown "$PI_USER:$PI_USER" "$WAYFIRE_INI"
    step "Configured wayfire autostart"
  fi

  # Optional fallback user service (non-primary)
  USER_SYSTEMD_DIR="$PI_HOME/.config/systemd/user"
  USER_SERVICE_FILE="$USER_SYSTEMD_DIR/spectrabox-kiosk.service"
  install -d -m 755 "$USER_SYSTEMD_DIR"
  cat > "$USER_SERVICE_FILE" <<USER_SERVICE_EOF
[Unit]
Description=SpectraBox kiosk browser launcher fallback
After=graphical-session.target
Wants=graphical-session.target

[Service]
Type=simple
ExecStart=${START_KIOSK}
Restart=on-failure

[Install]
WantedBy=default.target
USER_SERVICE_EOF
  chown -R "$PI_USER:$PI_USER" "$USER_SYSTEMD_DIR"

  step "Session-native autostart configured (primary); user service created as fallback"
  ok "Kiosk launcher configured"
else
  warn "Skipped kiosk launcher step"
fi

# ---------------------------------------------------------
CURRENT_STEP="permissions"
if confirm_step "13" "Permissions + logs" "Fix ownership and create /var/log/spectrabox"; then
  mkdir -p /var/log/spectrabox
  chown "$PI_USER:$PI_USER" /var/log/spectrabox
  chown -R "$PI_USER:$PI_USER" "$APP_DIR"
  ok "Ownership and logs configured"
else
  warn "Skipped permissions step"
fi

# ---------------------------------------------------------
CURRENT_STEP="health check"
if confirm_step "14" "Quick health check" "Check /api/health over HTTPS then HTTP"; then
  if command -v curl >/dev/null 2>&1 && \
     (curl -sk "https://localhost:${PORT}/api/health" >/dev/null 2>&1 || \
      curl -sk "http://localhost:${PORT}/api/health" >/dev/null 2>&1); then
    ok "Server responded to /api/health"
  else
    warn "Health check did not pass yet; service may still be starting"
  fi
else
  warn "Skipped health check"
fi

# ---------------------------------------------------------
CURRENT_STEP="finish"
if confirm_step "15" "Final notes + reboot" "Print summary and optionally reboot"; then
  echo "  - Service : ${SERVICE_NAME} (sudo systemctl status ${SERVICE_NAME})"
  echo "  - App Dir : ${APP_DIR}"
  echo "  - OS      : ${OS_ID}/${OS_CODENAME}"
  echo "  - Display : ${DISPLAY_MODE} (${SESSION_NAME})"
  echo "  - Kiosk   : ${PI_HOME}/start-kiosk.sh (exit: ${PI_HOME}/exit-kiosk.sh)"
  echo "  - TLS     : ${APP_DIR}/ssl/key.pem + cert.pem"
  echo "  - URL     : https://localhost:${PORT} (if certs present)"
  ok "Install complete. Reboot recommended."

  if [[ "$INTERACTIVE" -eq 1 ]]; then
    read -r -p "Reboot now? [Y/n] " ans </dev/tty || ans="Y"
    if [[ -z "$ans" || "$ans" =~ ^[Yy]$ ]]; then
      reboot
    fi
  fi
else
  warn "Skipped final reboot prompt"
fi
