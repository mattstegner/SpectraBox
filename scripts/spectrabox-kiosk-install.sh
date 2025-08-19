#!/usr/bin/env bash
# SpectraBox Kiosk Installer (Debian + Raspberry Pi OS)
# - Interactive step-by-step with Y/n prompts and synopses
# - Installs Node.js
# - Installs browser (Chromium/Chromium-browser; Firefox ESR fallback)
# - Uses PipeWire audio (no PulseAudio conflict)
# - Clones SpectraBox
# - Generates SSL certs in ~/spectrabox/ssl (key.pem/cert.pem) with legacy fallback
# - Creates systemd service
# - Adds Chromium mic-allow policy
# - Configures kiosk autostart (XDG + LXDE fallback)
# - Adapts automatically on Raspberry Pi OS vs Debian
#
# Non-interactive mode: pass -y or set AUTO_YES=1

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
NODE_MAJOR="18"
MEM_MAX="512M"
CPU_QUOTA="80%"
INSTALL_LOG="/var/log/spectrabox-install.log"
# ---------------------------

# Args
INTERACTIVE=1
if [ "${AUTO_YES:-0}" = "1" ]; then INTERACTIVE=0; fi
if [ "${1:-}" = "-y" ] || [ "${1:-}" = "--yes" ]; then INTERACTIVE=0; fi

# Root + shell checks
if [ -z "${BASH_VERSION:-}" ]; then
  echo "Please run with bash (not sh). Example: sudo bash $0"
  exit 1
fi
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root: sudo bash $0"
  exit 1
fi

# Logging
mkdir -p "$(dirname "$INSTALL_LOG")"
touch "$INSTALL_LOG" || true
exec > >(tee -a "$INSTALL_LOG") 2>&1

# Step helpers
CURRENT_STEP="(none)"
say() { echo -e "$*"; }
hr()  { echo "------------------------------------------------------------"; }

confirm_step() {
  # $1 = step number, $2 = title, $3 = synopsis (single line is best)
  local NUM="$1"; local TITLE="$2"; local SYN="$3"
  echo; hr
  echo "==> Step ${NUM}: ${TITLE}"
  echo "    ${SYN}"
  hr
  if [ "$INTERACTIVE" -eq 0 ]; then
    echo "AUTO-YES: proceeding..."
    return 0
  fi
  # Read from TTY (works even when piped via curl | bash)
  local ans
  read -r -p "Proceed? [Y/n] " ans </dev/tty || ans="Y"
  if [[ -z "$ans" || "$ans" =~ ^[Yy]$ ]]; then
    return 0
  else
    echo "SKIPPED: ${TITLE}"
    return 1
  fi
}

fail_trap() {
  echo
  echo "✖ Install failed during: ${CURRENT_STEP}"
  echo "   See log: ${INSTALL_LOG}"
}
trap fail_trap ERR

say ""
say "==> SpectraBox Kiosk Installer (interactive)"
say "    Target user: $PI_USER"
say "    Home dir   : $PI_HOME"
say "    App dir    : $APP_DIR"
hr

# ---------------------------------------------------------
CURRENT_STEP="System update & base packages"
if confirm_step "1" "System update & base packages" "apt update/upgrade and core libs for Chromium + audio (safe to skip for debugging)"; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get upgrade -y
  apt-get install -y --no-install-recommends \
    ca-certificates curl wget git jq xdg-utils \
    xdotool unclutter \
    libnss3 libatk1.0-0 libxss1 libasound2 alsa-utils openssl \
    libgtk-3-0 libgdk-pixbuf2.0-0 libxcomposite1 libxcursor1 libxdamage1 \
    libxrandr2 libgbm1 libxkbcommon0 libatspi2.0-0
  echo "✔ Base packages installed"
fi

# ---------------------------------------------------------
CURRENT_STEP="Audio stack (PipeWire) setup"
if confirm_step "2" "Audio stack: PipeWire (avoid PulseAudio conflicts)" "Install/enable PipeWire + WirePlumber; remove PulseAudio; add user to audio/video"; then
  apt-get install -y --no-install-recommends pipewire-audio wireplumber libspa-0.2-bluetooth
  apt-get purge -y pulseaudio pulseaudio-utils || true
  usermod -aG audio,video "$PI_USER" || true
  loginctl enable-linger "$PI_USER" || true
  sudo -u "$PI_USER" systemctl --user enable pipewire pipewire-pulse wireplumber || true
  echo "✔ PipeWire configured"
fi

# ---------------------------------------------------------
CURRENT_STEP="Node.js installation"
if confirm_step "3" "Install Node.js ${NODE_MAJOR}.x" "Install Node via NodeSource if not already on v${NODE_MAJOR}"; then
  if ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE "^v${NODE_MAJOR}\."; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y nodejs
  fi
  echo "• Node: $(node -v 2>/dev/null || echo 'not found')"
  echo "• npm : $(npm -v 2>/dev/null || echo 'not found')"
  echo "✔ Node ready"
fi

# ---------------------------------------------------------
CURRENT_STEP="Browser installation"
if confirm_step "4" "Choose and install browser" "Install chromium/chromium-browser or fallback to firefox-esr; resolve binary for kiosk"; then
  BROWSER_PKG=""
  if apt-cache show chromium >/dev/null 2>&1; then
    BROWSER_PKG="chromium"
  elif apt-cache show chromium-browser >/dev/null 2>&1; then
    BROWSER_PKG="chromium-browser"
  elif apt-cache show firefox-esr >/dev/null 2>&1; then
    BROWSER_PKG="firefox-esr"
  else
    echo "✖ No supported browser package found (chromium/chromium-browser/firefox-esr)"; exit 1
  fi
  apt-get install -y "$BROWSER_PKG"

  BROWSER_BIN="$(command -v chromium || true)"
  [ -z "$BROWSER_BIN" ] && BROWSER_BIN="$(command -v chromium-browser || true)"
  [ -z "$BROWSER_BIN" ] && BROWSER_BIN="$(command -v firefox-esr || true)"
  if [ -z "$BROWSER_BIN" ]; then echo "✖ Browser binary not found after install"; exit 1; fi
  echo "• Package: $BROWSER_PKG"
  echo "• Binary : $BROWSER_BIN"
  echo "✔ Browser installed"
fi

# ---------------------------------------------------------
CURRENT_STEP="Clone or update repo"
if confirm_step "5" "Clone/Update SpectraBox repository" "Clone repo to ~/spectrabox (or git pull if already present)"; then
  if [ -d "$APP_DIR/.git" ]; then
    sudo -u "$PI_USER" git -C "$APP_DIR" pull --ff-only
  else
    sudo -u "$PI_USER" git clone "$REPO_URL" "$APP_DIR"
  fi
  echo "✔ Repository ready at $APP_DIR"
fi

# ---------------------------------------------------------
CURRENT_STEP="Install app dependencies"
if confirm_step "6" "Install Node dependencies" "Run npm ci/install in production mode"; then
  cd "$APP_DIR"
  if [ -f package-lock.json ]; then
    sudo -u "$PI_USER" npm ci --only=production
  else
    sudo -u "$PI_USER" npm install --only=production
  fi
  echo "✔ Dependencies installed"
fi

# ---------------------------------------------------------
CURRENT_STEP="Generate SSL certificates"
if confirm_step "7" "Generate SSL certs (localhost)" "Create ~/spectrabox/ssl/key.pem & ssl/cert.pem (fallback to legacy certs if present)"; then
  SSL_DIR="$APP_DIR/ssl"
  LEGACY_CERT_DIR="$APP_DIR/certs"
  mkdir -p "$SSL_DIR"
  chown -R "$PI_USER:$PI_USER" "$SSL_DIR"

  if [ -f "$APP_DIR/generate-ssl.js" ]; then
    sudo -u "$PI_USER" node "$APP_DIR/generate-ssl.js" || echo "! generate-ssl.js failed; using openssl fallback"
  fi

  if [ ! -f "$SSL_DIR/key.pem" ] || [ ! -f "$SSL_DIR/cert.pem" ]; then
    openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
      -keyout "$SSL_DIR/key.pem" \
      -out "$SSL_DIR/cert.pem" \
      -subj "/CN=localhost"
    chown "$PI_USER:$PI_USER" "$SSL_DIR/key.pem" "$SSL_DIR/cert.pem"
  fi

  if [ -f "$LEGACY_CERT_DIR/server.key" ] && [ -f "$LEGACY_CERT_DIR/server.crt" ] && [ ! -f "$SSL_DIR/key.pem" ]; then
    cp "$LEGACY_CERT_DIR/server.key" "$SSL_DIR/key.pem"
    cp "$LEGACY_CERT_DIR/server.crt" "$SSL_DIR/cert.pem"
    chown "$PI_USER:$PI_USER" "$SSL_DIR/key.pem" "$SSL_DIR/cert.pem"
  fi
  echo "✔ SSL ready at $SSL_DIR"
fi

# ---------------------------------------------------------
CURRENT_STEP="Create systemd service"
if confirm_step "8" "Create systemd service (spectrabox)" "Run app at boot via systemd (npm start or server.js)"; then
  cd "$APP_DIR"
  if [ -f package.json ] && jq -e '.scripts.start' package.json >/dev/null 2>&1; then
    EXEC_START="/usr/bin/npm start --silent"
  elif [ -f server.js ]; then
    EXEC_START="/usr/bin/node ${APP_DIR}/server.js"
  else
    echo "✖ No start script or server.js found in repo."; exit 1
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
  echo "✔ Service enabled & started"
fi

# ---------------------------------------------------------
CURRENT_STEP="Desktop autologin / GUI boot"
if confirm_step "9" "Configure GUI autologin (Pi OS only)" "Use raspi-config if available; otherwise set graphical.target on Debian"; then
  if command -v raspi-config >/dev/null 2>&1; then
    raspi-config nonint do_boot_behaviour B4 || true
    echo "✔ raspi-config set to Desktop (autologin)"
  else
    echo "! raspi-config not present; ensuring graphical target (if a DE exists)"
    systemctl set-default graphical.target || true
  fi
fi

# ---------------------------------------------------------
CURRENT_STEP="Chromium policy for mic"
if confirm_step "10" "Install Chromium policy (allow mic for localhost)" "Write managed policy JSON to whitelist mic for http/https localhost"; then
  mkdir -p /etc/chromium/policies/managed \
           /etc/chromium-browser/policies/managed \
           /etc/opt/chrome/policies/managed

  cat > /etc/chromium/policies/managed/kiosk-mic.json <<JSON
{
  "AudioCaptureAllowed": true,
  "AudioCaptureAllowedUrls": [
    "https://localhost:${PORT}",
    "http://localhost:${PORT}",
    "https://localhost:3000",
    "http://localhost:3000"
  ],
  "DefaultMediaStreamSetting": 1,
  "MediaStreamMicrophoneAllowedUrls": [
    "https://localhost:${PORT}",
    "http://localhost:${PORT}",
    "https://localhost:3000",
    "http://localhost:3000"
  ],
  "AutoSelectCertificateForUrls": [
    { "pattern": "https://localhost:${PORT}", "filter": {} }
  ]
}
JSON
  cp /etc/chromium/policies/managed/kiosk-mic.json /etc/chromium-browser/policies/managed/kiosk-mic.json 2>/dev/null || true
  cp /etc/chromium/policies/managed/kiosk-mic.json /etc/opt/chrome/policies/managed/kiosk-mic.json 2>/dev/null || true
  echo "✔ Mic policy installed"
fi

# ---------------------------------------------------------
CURRENT_STEP="Kiosk launcher + autostart"
if confirm_step "11" "Create kiosk launcher and autostart" "Write start-kiosk.sh, autostart .desktop, Openbox exit hotkey, LXDE fallback"; then
  START_KIOSK="$PI_HOME/start-kiosk.sh"
  EXIT_KIOSK="$PI_HOME/exit-kiosk.sh"
  AUTOSTART_DIR="$PI_HOME/.config/autostart"
  OPENBOX_DIR="$PI_HOME/.config/openbox"
  LXDE_DIR="$PI_HOME/.config/lxsession/LXDE-pi"
  CHROME_DATA_DIR="$PI_HOME/.config/spectrabox-chrome"

  URL="http://localhost:${PORT}"
  SSL_DIR="$APP_DIR/ssl"
  LEGACY_CERT_DIR="$APP_DIR/certs"
  if [ -f "$SSL_DIR/cert.pem" ] && [ -f "$SSL_DIR/key.pem" ]; then
    URL="https://localhost:${PORT}"
  elif [ -f "$LEGACY_CERT_DIR/server.crt" ] && [ -f "$LEGACY_CERT_DIR/server.key" ]; then
    URL="https://localhost:${PORT}"
  fi

  mkdir -p "$AUTOSTART_DIR" "$OPENBOX_DIR" "$CHROME_DATA_DIR"
  chown -R "$PI_USER:$PI_USER" "$CHROME_DATA_DIR"

  cat > "$START_KIOSK" <<EOS
#!/usr/bin/env bash
set -e
set -u
set -o pipefail
export DISPLAY=\${DISPLAY:-:0}

xset s off || true
xset -dpms || true
xset s noblank || true
unclutter -idle 0.5 -root >/dev/null 2>&1 &

URL="${URL}"
BROWSER_BIN="${BROWSER_BIN:-$(command -v chromium || command -v chromium-browser || command -v firefox-esr)}"
CHROME_DATA_DIR="${CHROME_DATA_DIR}"

# Wait for audio server (PipeWire or Pulse shim)
for i in {1..20}; do
  if command -v wpctl >/dev/null 2>&1; then
    if wpctl status >/dev/null 2>&1; then break; fi
  elif command -v pactl >/dev/null 2>&1; then
    if pactl info >/dev/null 2>&1; then break; fi
  fi
  sleep 1
done

# Wait for SpectraBox to respond (up to 60s)
for i in {1..60}; do
  if command -v curl >/dev/null 2>&1 && curl -sk --max-time 1 "\${URL}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if [[ "\${BROWSER_BIN}" == *"chromium"* ]]; then
  EXTRA_HTTP_FLAG=""
  if [[ "\${URL}" =~ ^http:// ]]; then
    EXTRA_HTTP_FLAG="--unsafely-treat-insecure-origin-as-secure=\${URL}"
  fi
  exec "\${BROWSER_BIN}" \
    --kiosk "\${URL}" \
    --app="\${URL}" \
    --noerrdialogs \
    --disable-session-crashed-bubble \
    --disable-infobars \
    --disable-translate \
    --autoplay-policy=no-user-gesture-required \
    --ignore-certificate-errors \
    --ignore-ssl-errors \
    --start-maximized \
    --user-data-dir="\${CHROME_DATA_DIR}" \
    --allow-running-insecure-content \
    --use-fake-device-for-media-stream=false \
    --no-sandbox \
    --disable-dev-shm-usage \
    --disable-gpu-sandbox \
    \${EXTRA_HTTP_FLAG}
else
  exec "\${BROWSER_BIN}" --kiosk "\${URL}"
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

  cat > "$AUTOSTART_DIR/kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=SpectraBox Kiosk
Exec=${START_KIOSK}
X-GNOME-Autostart-enabled=true
EOF
  chown -R "$PI_USER:$PI_USER" "$AUTOSTART_DIR"

  if [ -d "$LXDE_DIR" ]; then
    AUTOSTART_FILE="$LXDE_DIR/autostart"
    mkdir -p "$LXDE_DIR"
    if [ ! -f "$AUTOSTART_FILE" ] || ! grep -q "start-kiosk.sh" "$AUTOSTART_FILE"; then
      echo "@/bin/bash -lc \"$START_KIOSK\"" >> "$AUTOSTART_FILE"
    fi
    chown -R "$PI_USER:$PI_USER" "$LXDE_DIR"
    echo "✔ LXDE autostart fallback configured"
  fi

  OPENBOX_RC="$OPENBOX_DIR/lxde-pi-rc.xml"
  if [ ! -f "$OPENBOX_RC" ]; then
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
  echo "✔ Kiosk launcher & autostart written"
fi

# ---------------------------------------------------------
CURRENT_STEP="Permissions & logs"
if confirm_step "12" "Permissions & logs" "Ensure ownership of app dir; create /var/log/spectrabox"; then
  mkdir -p /var/log/spectrabox
  chown "$PI_USER:$PI_USER" /var/log/spectrabox
  chown -R "$PI_USER:$PI_USER" "$APP_DIR"
  echo "✔ Ownership & log dir applied"
fi

# ---------------------------------------------------------
CURRENT_STEP="Health check"
if confirm_step "13" "Health check" "Query /api/health over http/https localhost"; then
  if command -v curl >/dev/null 2>&1 && \
     (curl -sk "http://localhost:${PORT}/api/health" >/dev/null 2>&1 || \
      curl -sk "https://localhost:${PORT}/api/health" >/dev/null 2>&1); then
    echo "✔ Server responded to /api/health"
  else
    echo "! Server not responding yet—systemd may still be starting (or endpoint not present)."
  fi
fi

# ---------------------------------------------------------
CURRENT_STEP="Finish"
if confirm_step "14" "Finish & reboot" "Show summary; optionally reboot into kiosk"; then
  echo
  echo "Summary:"
  echo "  • Service : ${SERVICE_NAME} — sudo systemctl status ${SERVICE_NAME}"
  echo "  • App Dir : ${APP_DIR}"
  echo "  • URL     : http(s)://localhost:${PORT}"
  echo "  • Kiosk   : Autostarts at login; emergency exit Ctrl+Alt+X"
  echo "  • Start/Stop kiosk: ${PI_HOME}/start-kiosk.sh / ${PI_HOME}/exit-kiosk.sh"
  echo "  • Install log: ${INSTALL_LOG}"
  echo
  read -r -p "Reboot now to enter kiosk mode? [Y/n] " ans </dev/tty || ans="Y"
  if [[ -z "$ans" || "$ans" =~ ^[Yy]$ ]]; then
    reboot
  else
    echo "Skipping reboot. You can reboot later with: sudo reboot"
  fi
else
  echo "Done. Skipped final reboot."
fi
