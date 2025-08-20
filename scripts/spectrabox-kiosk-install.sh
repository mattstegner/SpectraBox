#!/usr/bin/env bash
# SpectraBox Kiosk Installer (Debian + Raspberry Pi OS)
# - Installs Node.js
# - Installs browser (Chromium/Chromium-browser; Firefox ESR fallback)
# - Sets up PipeWire audio (no PulseAudio conflict)
# - Clones SpectraBox
# - Generates HTTPS certs (for persistent mic permissions)
# - Creates systemd service
# - Adds Chromium mic-allow policy for localhost
# - Configures kiosk autostart
# - Adapts automatically on Debian vs Raspberry Pi OS
#
# Interactive: asks for confirmation before each section (with a short synopsis)
# Non-interactive: pass -y or set AUTO_YES=1 to skip confirmations

# ---- Strict mode (split to avoid copy/paste wrapping issues) ----
set -e
set -u
set -o pipefail

# ---------- Config ----------
PI_USER="${SUDO_USER:-${USER}}"
PI_HOME="$(getent passwd "$PI_USER" | cut -d: -f6)"
APP_DIR="$PI_HOME/spectrabox"
REPO_URL="https://github.com/mattstegner/SpectraBox.git"
SERVICE_NAME="spectrabox"
PORT="3000"
NODE_MAJOR="18"     # Node LTS track to install if missing
MEM_MAX="512M"
CPU_QUOTA="80%"
# ---------------------------

# ---------- Interactive flags ----------
INTERACTIVE=1
if [[ "${AUTO_YES:-0}" == "1" ]]; then INTERACTIVE=0; fi
if [[ "${1:-}" == "-y" || "${1:-}" == "--yes" ]]; then INTERACTIVE=0; fi

# ---------- UI helpers ----------
banner() { echo -e "\n\033[1;36m==> $*\033[0m"; }
ok()     { echo -e "\033[1;32m✔ $*\033[0m"; }
warn()   { echo -e "\033[1;33m! $*\033[0m"; }
err()    { echo -e "\033[1;31m✖ $*\033[0m"; }
step()   { echo -e "   - $*"; }
hr()     { echo "------------------------------------------------------------"; }

confirm_step() {
  # $1 = step number, $2 = title, $3 = 1-line synopsis
  local NUM="$1" TITLE="$2" SYN="$3" ans
  echo; hr
  echo "Step ${NUM}: ${TITLE}"
  echo "  ${SYN}"
  hr
  if [[ $INTERACTIVE -eq 0 ]]; then
    echo "AUTO-YES: proceeding..."
    return 0
  fi
  # read from TTY so this still works when piped via curl | bash
  read -r -p "Proceed? [Y/n] " ans </dev/tty || ans="Y"
  [[ -z "$ans" || "$ans" =~ ^[Yy]$ ]]
}

require_root() {
  if [[ "$EUID" -ne 0 ]]; then
    err "Please run as root: sudo bash $0"
    exit 1
  fi
}

CURRENT_STEP="startup"
trap 'err "Install failed during: ${CURRENT_STEP}. Check the logs above.";' ERR
require_root

banner "SpectraBox Kiosk Installer"
step "Target user: $PI_USER"
step "Home dir   : $PI_HOME"
step "App dir    : $APP_DIR"

# ---------------------------------------------------------
CURRENT_STEP="system update"
if confirm_step "1" "System update & base packages" "Update/upgrade APT and install core tools + libs needed by Chromium and audio"; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get upgrade -y
  apt-get install -y --no-install-recommends \
    ca-certificates curl wget git jq xdg-utils \
    xdotool unclutter \
    libnss3 libatk1.0-0 libxss1 libasound2 \
    alsa-utils openssl
  ok "System packages installed/updated"
else
  warn "Skipped base package install"
fi

# ---------------------------------------------------------
CURRENT_STEP="audio stack"
if confirm_step "2" "Audio stack: PipeWire (avoid Pulse conflicts)" "Install PipeWire/WirePlumber, remove PulseAudio, add user to audio/video, enable user services"; then
  apt-get install -y --no-install-recommends \
    pipewire-audio wireplumber libspa-0.2-bluetooth
  apt-get purge -y pulseaudio pulseaudio-utils || true

  usermod -aG audio,video "$PI_USER" || true
  loginctl enable-linger "$PI_USER" || true
  sudo -u "$PI_USER" systemctl --user enable pipewire pipewire-pulse wireplumber || true
  ok "PipeWire configured (Pulse removed if found)"
else
  warn "Skipped audio configuration (kiosk may not access mic)"
fi

# ---------------------------------------------------------
CURRENT_STEP="node install"
if confirm_step "3" "Install Node.js ${NODE_MAJOR}.x (NodeSource if needed)" "Install or update Node to v${NODE_MAJOR}.x so the server can run"; then
  if ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE "^v${NODE_MAJOR}\."; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y nodejs
  fi
  step "Node: $(node -v 2>/dev/null || echo 'not found')"
  step "npm : $(npm -v 2>/dev/null || echo 'not found')"
  ok "Node.js ready"
else
  warn "Skipped Node install (using existing Node)"
fi

# ---------------------------------------------------------
CURRENT_STEP="browser install"
if confirm_step "4" "Choose and install browser (Chromium/Firefox fallback)" "Detect correct package (chromium / chromium-browser / firefox-esr) and install it"; then
  # package detection (chromium vs chromium-browser; firefox-esr fallback)
  pkg_exists() { apt-cache show "$1" 2>/dev/null | grep -q '^Package:'; }

  BROWSER_PKG=""
  if pkg_exists chromium; then
    BROWSER_PKG="chromium"
  elif pkg_exists chromium-browser; then
    BROWSER_PKG="chromium-browser"
  elif pkg_exists firefox-esr; then
    BROWSER_PKG="firefox-esr"
  else
    err "No supported browser package found in APT (chromium/chromium-browser/firefox-esr)."
  fi
  apt-get install -y "$BROWSER_PKG"

  # Resolve the runtime binary
  BROWSER_BIN="$(command -v chromium || true)"
  BROWSER_BIN="${BROWSER_BIN:-$(command -v chromium-browser || true)}"
  BROWSER_BIN="${BROWSER_BIN:-$(command -v firefox-esr || true)}"
  [[ -n "$BROWSER_BIN" ]] || err "Unable to locate browser binary after install."
  step "Browser package: ${BROWSER_PKG}"
  step "Browser binary : ${BROWSER_BIN}"
  ok "Browser installed"
else
  warn "Skipped browser install (must exist already)"
  # Try resolve anyway so kiosk script can embed something sane
  BROWSER_BIN="$(command -v chromium || true)"
  BROWSER_BIN="${BROWSER_BIN:-$(command -v chromium-browser || true)}"
  BROWSER_BIN="${BROWSER_BIN:-$(command -v firefox-esr || true)}"
fi

# ---------------------------------------------------------
CURRENT_STEP="clone repo"
if confirm_step "5" "Clone or update SpectraBox repo" "Clone fresh to ~/spectrabox or git pull if it already exists"; then
  if [[ -d "$APP_DIR/.git" ]]; then
    step "Repo exists, pulling latest..."
    sudo -u "$PI_USER" git -C "$APP_DIR" pull --ff-only
  else
    step "Cloning fresh repo to $APP_DIR"
    sudo -u "$PI_USER" git clone "$REPO_URL" "$APP_DIR"
  fi
  ok "Repository ready"
else
  warn "Skipped repo clone/update"
fi

# ---------------------------------------------------------
CURRENT_STEP="npm install"
if confirm_step "6" "Install app dependencies (production)" "Run npm ci/install with production deps only"; then
  cd "$APP_DIR"
  if [[ -f package-lock.json ]]; then
    sudo -u "$PI_USER" npm ci --only=production
  else
    sudo -u "$PI_USER" npm install --only=production
  fi
  ok "Node dependencies installed"
else
  warn "Skipped npm install"
fi

# ---------------------------------------------------------
CURRENT_STEP="TLS certs"
if confirm_step "7" "Generate HTTPS certs (for mic permission persistence)" "Use repo generator if present, otherwise make a self-signed localhost cert"; then
  CERT_DIR="$APP_DIR/certs"
  mkdir -p "$CERT_DIR"
  chown -R "$PI_USER:$PI_USER" "$CERT_DIR"

  # Prefer repo generator; fallback to openssl self-signed
  if [[ -f "$APP_DIR/generate-ssl.js" ]]; then
    step "Found generate-ssl.js; using it"
    sudo -u "$PI_USER" node "$APP_DIR/generate-ssl.js" || warn "generate-ssl.js failed; using openssl fallback"
  fi
  if [[ ! -f "$CERT_DIR/server.key" || ! -f "$CERT_DIR/server.crt" ]]; then
    step "Creating self-signed cert (CN=localhost)"
    openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
      -keyout "$CERT_DIR/server.key" \
      -out "$CERT_DIR/server.crt" \
      -subj "/CN=localhost"
    chown "$PI_USER:$PI_USER" "$CERT_DIR/server.key" "$CERT_DIR/server.crt"
  fi
  ok "TLS certificates ready"
else
  warn "Skipped cert generation (ensure your app has certs if you use HTTPS)"
fi

# ---------------------------------------------------------
CURRENT_STEP="systemd service"
if confirm_step "8" "Create systemd service for SpectraBox" "Create/enable spectrabox.service to run the app on boot"; then
  # Prefer npm start if defined; fallback to server.js
  EXEC_START=""
  if [[ -f "$APP_DIR/package.json" ]] && jq -e '.scripts.start' "$APP_DIR/package.json" >/dev/null 2>&1; then
    EXEC_START="/usr/bin/npm start --silent"
  elif [[ -f "$APP_DIR/server.js" ]]; then
    EXEC_START="/usr/bin/node ${APP_DIR}/server.js"
  else
    err "No start script or server.js found in repo."
  fi

  SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
  cat > "$SERVICE_FILE" <<EOF
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
EOF

  systemctl daemon-reload
  systemctl enable "${SERVICE_NAME}"
  systemctl restart "${SERVICE_NAME}"
  sleep 2 || true
  systemctl --no-pager --full status "${SERVICE_NAME}" || true
  ok "Systemd service enabled & started"
else
  warn "Skipped systemd service creation"
fi

# ---------------------------------------------------------
CURRENT_STEP="desktop boot"
if confirm_step "9" "Configure Desktop autologin / GUI boot (Pi OS only)" "Use raspi-config when available; otherwise set graphical.target on Debian"; then
  if command -v raspi-config >/dev/null 2>&1; then
    raspi-config nonint do_boot_behaviour B4 || true   # Desktop autologin
    ok "raspi-config set to Desktop (autologin)"
  else
    warn "raspi-config not present (likely Debian). Skipping Pi-specific boot settings."
    systemctl set-default graphical.target || true
  fi
else
  warn "Skipped desktop boot configuration"
fi

# ---------------------------------------------------------
CURRENT_STEP="browser policy"
if confirm_step "10" "Chromium mic policy for localhost" "Install managed policy so Chromium auto-allows microphone for http/https localhost"; then
  install -d /etc/chromium/policies/managed /etc/opt/chrome/policies/managed
  cat >/etc/chromium/policies/managed/kiosk-mic.json <<'JSON'
{
  "AudioCaptureAllowed": true,
  "AudioCaptureAllowedUrls": [
    "https://localhost:3000",
    "http://localhost:3000"
  ]
}
JSON
  # Copy to Chrome path too (harmless if missing)
  cp /etc/chromium/policies/managed/kiosk-mic.json /etc/opt/chrome/policies/managed/kiosk-mic.json 2>/dev/null || true
  ok "Chromium policy installed"
else
  warn "Skipped Chromium mic policy"
fi

# ---------------------------------------------------------
CURRENT_STEP="kiosk launcher"
if confirm_step "11" "Create kiosk launcher & autostart entry" "Write start/exit scripts, autostart .desktop, Openbox hotkey (Ctrl+Alt+X)"; then
  START_KIOSK="$PI_HOME/start-kiosk.sh"
  EXIT_KIOSK="$PI_HOME/exit-kiosk.sh"
  AUTOSTART_DIR="$PI_HOME/.config/autostart"
  OPENBOX_DIR="$PI_HOME/.config/openbox"
  KIOSK_DESKTOP="$AUTOSTART_DIR/kiosk.desktop"
  OPENBOX_RC="$OPENBOX_DIR/lxde-pi-rc.xml"

  # Prefer HTTPS if certs exist
  URL="http://localhost:${PORT}"
  if [[ -f "$APP_DIR/certs/server.crt" && -f "$APP_DIR/certs/server.key" ]]; then
    URL="https://localhost:${PORT}"
  fi

  install -d -m 755 "$AUTOSTART_DIR" "$OPENBOX_DIR"

  # Use the detected browser binary; wait for audio + server
  cat > "$START_KIOSK" <<EOS
#!/usr/bin/env bash
set -e
set -u
set -o pipefail
export DISPLAY=\${DISPLAY:-:0}

# Disable blanking / power management
xset s off || true
xset -dpms || true
xset s noblank || true

# Hide mouse after idle
unclutter -idle 0.5 -root >/dev/null 2>&1 &

URL="${URL}"
BROWSER_BIN="${BROWSER_BIN}"

# ---- Wait for audio server (PipeWire or Pulse shim) ----
for i in {1..20}; do
  if command -v wpctl >/dev/null 2>&1; then
    if wpctl status >/dev/null 2>&1; then break; fi
  elif command -v pactl >/dev/null 2>&1; then
    if pactl info >/dev/null 2>&1; then break; fi
  fi
  sleep 1
done

# ---- Wait for SpectraBox to respond (up to 60s) ----
for i in {1..60}; do
  if command -v curl >/dev/null 2>&1 && curl -sk --max-time 1 "\${URL}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Chromium vs Firefox flags
if [[ "\${BROWSER_BIN}" == *"chromium"* ]]; then
  EXTRA_HTTP_FLAG=""
  if [[ "\${URL}" =~ ^http:// ]]; then
    EXTRA_HTTP_FLAG="--unsafely-treat-insecure-origin-as-secure=\${URL}"
  fi
  exec "\${BROWSER_BIN}" \\
    --kiosk "\${URL}" \\
    --app="\${URL}" \\
    --noerrdialogs \\
    --disable-session-crashed-bubble \\
    --autoplay-policy=no-user-gesture-required \\
    --ignore-certificate-errors \\
    --start-maximized \\
    --incognito \\
    --allow-running-insecure-content \\
    --disable-web-security \\
    --use-fake-ui-for-media-stream \\
    --enable-features=HardwareMediaKeyHandling \\
    --hide-scrollbars \\
    --force-device-scale-factor=1 \\
    --disable-pinch \\
    --overscroll-history-navigation=0 \\
    --disable-features=VizDisplayCompositor \\
    \${EXTRA_HTTP_FLAG}
else
  # Firefox ESR fallback
  exec "\${BROWSER_BIN}" \\
    --kiosk "\${URL}"
fi
EOS
  chmod +x "$START_KIOSK"
  chown "$PI_USER:$PI_USER" "$START_KIOSK"

  cat > "$EXIT_KIOSK" <<'EOS'
#!/usr/bin/env bash
pkill -f chromium || true
pkill -f chromium-browser || true
pkill -f firefox-esr || true
EOS
  chmod +x "$EXIT_KIOSK"
  chown "$PI_USER:$PI_USER" "$EXIT_KIOSK"

  cat > "$KIOSK_DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=SpectraBox Kiosk
Exec=${START_KIOSK}
X-GNOME-Autostart-enabled=true
EOF
  chown -R "$PI_USER:$PI_USER" "$AUTOSTART_DIR"

  # Emergency exit keybinding (Ctrl+Alt+X) for Openbox/LXDE (created if not present)
  if [[ ! -f "$OPENBOX_RC" ]]; then
    cat > "$OPENBOX_RC" <<'EOF'
<openbox_config>
  <keyboard>
    <keybind key="C-A-x">
      <action name="Execute"><command>/bin/bash -lc "$HOME/exit-kiosk.sh"</command></action>
    </keybind>
  </keyboard>
</openbox_config>
EOF
    chown -R "$PI_USER:$PI_USER" "$OPENBOX_DIR"
  fi
  ok "Kiosk autostart configured"
else
  warn "Skipped kiosk launcher creation"
fi

# ---------------------------------------------------------
CURRENT_STEP="permissions"
if confirm_step "12" "Permissions & logs" "Fix ownership of app dir, create /var/log/spectrabox"; then
  mkdir -p /var/log/spectrabox
  chown "$PI_USER:$PI_USER" /var/log/spectrabox
  chown -R "$PI_USER:$PI_USER" "$APP_DIR"
  ok "Ownership & log dir applied"
else
  warn "Skipped permission fix"
fi

# ---------------------------------------------------------
CURRENT_STEP="health check"
if confirm_step "13" "Quick health check" "Try /api/health over http/https localhost (ignore if endpoint not present)"; then
  if command -v curl >/dev/null 2>&1 && \
     (curl -sk "http://localhost:${PORT}/api/health" >/dev/null 2>&1 || \
      curl -sk "https://localhost:${PORT}/api/health" >/dev/null 2>&1); then
    ok "Server responded to /api/health"
  else
    warn "Server not responding yet—systemd may still be starting it (or endpoint not present)."
  fi
else
  warn "Skipped health check"
fi

# ---------------------------------------------------------
CURRENT_STEP="finish"
if confirm_step "14" "Final notes & optional reboot" "Print where things were installed and offer to reboot into kiosk"; then
  echo "  • Service : ${SERVICE_NAME} — status with: sudo systemctl status ${SERVICE_NAME}"
  echo "  • App Dir : ${APP_DIR}"
  echo "  • Kiosk   : Autostarts at login; emergency exit Ctrl+Alt+X"
  echo "  • Start/Stop kiosk manually: '${PI_HOME}/start-kiosk.sh' / '${PI_HOME}/exit-kiosk.sh'"
  echo "  • URL     : http(s)://localhost:${PORT}"
  ok "Install complete. Reboot recommended."
  read -r -p "Reboot now to enter kiosk mode? [Y/n] " ans </dev/tty || ans="Y"
  if [[ -z "${ans}" || "${ans}" =~ ^[Yy]$ ]]; then
    reboot
  fi
else
  warn "Skipped final reboot step"
fi
