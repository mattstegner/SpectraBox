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
  
  # Ensure audio group exists
  if ! getent group audio >/dev/null 2>&1; then
    groupadd audio || true
  fi
  
  # Add user to audio and video groups
  usermod -aG audio,video "$PI_USER" || true
  
  # Enable user linger for PipeWire
  loginctl enable-linger "$PI_USER" || true
  
  # Enable PipeWire services for the user
  sudo -u "$PI_USER" systemctl --user enable pipewire pipewire-pulse wireplumber || true
  
  # Start PipeWire services for the user
  sudo -u "$PI_USER" systemctl --user start pipewire pipewire-pulse wireplumber || true
  
  # Wait for PipeWire to be ready
  echo "Waiting for PipeWire to initialize..."
  for i in {1..10}; do
    if sudo -u "$PI_USER" wpctl status >/dev/null 2>&1; then
      echo "PipeWire is ready"
      break
    fi
    sleep 1
  done
  
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
CURRENT_STEP="User permissions & groups"
if confirm_step "7.5" "User permissions & groups" "Ensure user is in audio/video groups and has proper permissions"; then
  # Add user to audio and video groups
  usermod -aG audio,video "$PI_USER" || true
  
  # Ensure audio group exists and has proper permissions
  if ! getent group audio >/dev/null 2>&1; then
    groupadd audio || true
  fi
  
  # Set proper permissions for audio devices
  if [ -d /dev/snd ]; then
    chmod 660 /dev/snd/* 2>/dev/null || true
    chown root:audio /dev/snd/* 2>/dev/null || true
  fi
  
  # Ensure user can access audio devices
  if [ -e /dev/snd/controlC0 ]; then
    chmod 666 /dev/snd/controlC0 2>/dev/null || true
  fi
  
  echo "✔ User permissions configured"
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
  
  # Ensure working directory has proper permissions for the service user
  echo "Setting proper permissions for working directory..."
  chown -R "${PI_USER}:audio" "$APP_DIR"
  chmod 755 "$APP_DIR"
  find "$APP_DIR" -type f -exec chmod 644 {} \;
  find "$APP_DIR" -type d -exec chmod 755 {} \;
  chmod +x "$APP_DIR/server.js" 2>/dev/null || true
  
  # Verify permissions
  echo "Verifying working directory permissions..."
  echo "Directory: $APP_DIR"
  echo "Owner: $(ls -ld "$APP_DIR" | awk '{print $3}')"
  echo "Group: $(ls -ld "$APP_DIR" | awk '{print $4}')"
  echo "Permissions: $(ls -ld "$APP_DIR" | awk '{print $1}')"
  
  if [ "$(stat -c %U "$APP_DIR")" != "$PI_USER" ]; then
    echo "✖ Working directory ownership is incorrect"
    exit 1
  fi
  
  if [ ! -r "$APP_DIR/server.js" ]; then
    echo "✖ server.js is not readable in working directory"
    exit 1
  fi
  
  echo "✔ Working directory permissions verified"
  
  # Test if the service user can access the working directory
  echo "Testing service user access to working directory..."
  if ! sudo -u "$PI_USER" test -r "$APP_DIR/server.js"; then
    echo "✖ Service user cannot read server.js"
    exit 1
  fi
  
  if ! sudo -u "$PI_USER" test -x "$APP_DIR"; then
    echo "✖ Service user cannot access working directory"
    exit 1
  fi
  
  echo "✔ Service user access verified"
  
  # Create log directory and set permissions
  echo "Creating log directory..."
  mkdir -p /var/log/spectrabox
  chown "${PI_USER}:${PI_USER}" /var/log/spectrabox
  chmod 755 /var/log/spectrabox
  
  # Create log file and set permissions
  touch /var/log/spectrabox/app.log
  chown "${PI_USER}:${PI_USER}" /var/log/spectrabox/app.log
  chmod 644 /var/log/spectrabox/app.log
  
  echo "✔ Log directory and file created at /var/log/spectrabox/app.log"
  
  # Use the working service configuration from the existing spectrabox.service
  SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=SpectraBox - Web-based Audio Device Management
Documentation=https://github.com/mattstegner/SpectraBox
After=network.target sound.target
Wants=network.target

[Service]
Type=simple
User=${PI_USER}
Group=audio
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=PORT=${PORT}
Environment=HOST=0.0.0.0
Environment=LOG_LEVEL=info
Environment=NODE_OPTIONS=--max-old-space-size=256
ExecStart=/usr/bin/node ${APP_DIR}/server.js
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=10
StandardOutput=append:/var/log/spectrabox/app.log
StandardError=append:/var/log/spectrabox/app.log
SyslogIdentifier=spectrabox

# Security settings - adjusted for working directory access
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=false
ProtectHome=false
ReadWritePaths=${APP_DIR} /var/log/spectrabox
CapabilityBoundingSet=CAP_NET_BIND_SERVICE

# Resource limits for Raspberry Pi
LimitNOFILE=1024
LimitNPROC=512
MemoryMax=${MEM_MAX}
CPUQuota=${CPU_QUOTA}

# Graceful shutdown
TimeoutStopSec=30
KillMode=mixed
KillSignal=SIGTERM

[Install]
WantedBy=multi-user.target
EOF

  echo "✔ Service file created at $SERVICE_FILE"
fi

# ---------------------------------------------------------
CURRENT_STEP="Create user-level kiosk service"
if confirm_step "8.5" "Create user-level kiosk service" "Create systemd user service for reliable browser launch"; then
  # Create user systemd directory
  USER_SYSTEMD_DIR="$PI_HOME/.config/systemd/user"
  mkdir -p "$USER_SYSTEMD_DIR"
  chown -R "$PI_USER:$PI_USER" "$USER_SYSTEMD_DIR"
  
  # Create user-level kiosk service
  USER_KIOSK_SERVICE="$USER_SYSTEMD_DIR/spectrabox-kiosk.service"
  cat > "$USER_KIOSK_SERVICE" <<EOF
[Unit]
Description=SpectraBox Kiosk Browser
After=graphical-session.target
Wants=graphical-session.target

[Service]
Type=simple
Environment=DISPLAY=:0
ExecStart=%h/start-kiosk.sh
Restart=always
RestartSec=5

[Install]
WantedBy=graphical-session.target
EOF

  chown "$PI_USER:$PI_USER" "$USER_KIOSK_SERVICE"
  chmod 644 "$USER_KIOSK_SERVICE"
  
  echo "✔ User-level kiosk service created at $USER_KIOSK_SERVICE"
fi

# ---------------------------------------------------------
CURRENT_STEP="Enable user-level kiosk service"
if confirm_step "8.6" "Enable user-level kiosk service" "Enable user linger and user-level kiosk service"; then
  # Enable user linger for persistent user services
  loginctl enable-linger "$PI_USER" || true
  
  # Reload user systemd and enable kiosk service
  sudo -u "$PI_USER" systemctl --user daemon-reload || true
  sudo -u "$PI_USER" systemctl --user enable spectrabox-kiosk.service || true
  
  # Verify the service is enabled
  if sudo -u "$PI_USER" systemctl --user is-enabled --quiet spectrabox-kiosk.service; then
    echo "✔ User-level kiosk service enabled"
  else
    echo "! User-level kiosk service may not be enabled (this is normal on first run)"
  fi
  
  echo "✔ User linger and kiosk service configured"
fi

# ---------------------------------------------------------
CURRENT_STEP="Verify service configuration"
if confirm_step "8.5" "Verify service configuration" "Check service file, reload systemd, and verify startup"; then
  # Verify the service file was created correctly
  if [ ! -f "/etc/systemd/system/${SERVICE_NAME}.service" ]; then
    echo "✖ Service file not found at /etc/systemd/system/${SERVICE_NAME}.service"
    exit 1
  fi
  
  # Check service file syntax
  if ! systemd-analyze verify "/etc/systemd/system/${SERVICE_NAME}.service" 2>/dev/null; then
    echo "! Service file has syntax issues, but continuing..."
  fi
  
  # Reload systemd and enable service
  systemctl daemon-reload
  systemctl enable "${SERVICE_NAME}"
  
  # Check if service can start without errors
  if ! systemctl start "${SERVICE_NAME}" 2>/dev/null; then
    echo "✖ Service failed to start. Checking status:"
    systemctl --no-pager --full status "${SERVICE_NAME}" || true
    echo "Checking logs:"
    journalctl -u "${SERVICE_NAME}" --no-pager -n 20 || true
    exit 1
  fi
  
  # Wait for service to be fully active
  echo "Waiting for service to be fully active..."
  for i in {1..15}; do
    if systemctl is-active --quiet "${SERVICE_NAME}"; then
      echo "✔ Service is active"
      break
    fi
    echo "Waiting for service to start... (attempt $i/15)"
    sleep 2
  done
  
  # Final status check
  if systemctl is-active --quiet "${SERVICE_NAME}"; then
    echo "✔ Service is running successfully"
    systemctl --no-pager --full status "${SERVICE_NAME}" || true
  else
    echo "✖ Service failed to become active"
    systemctl --no-pager --full status "${SERVICE_NAME}" || true
    echo "Recent logs:"
    journalctl -u "${SERVICE_NAME}" --no-pager -n 30 || true
    echo "App log:"
    tail -n 20 /var/log/spectrabox/app.log 2>/dev/null || echo "App log not available yet"
    exit 1
  fi
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
echo "Waiting for audio server..."
for i in {1..20}; do
  if command -v wpctl >/dev/null 2>&1; then
    if wpctl status >/dev/null 2>&1; then 
      echo "PipeWire audio server ready"
      break
    fi
  elif command -v pactl >/dev/null 2>&1; then
    if pactl info >/dev/null 2>&1; then 
      echo "PulseAudio server ready"
      break
    fi
  fi
  sleep 1
done

# Wait for SpectraBox to respond (up to 90s with better feedback)
echo "Waiting for SpectraBox server..."
for i in {1..90}; do
  if command -v curl >/dev/null 2>&1; then
    if curl -sk --max-time 2 "\${URL}/api/health" >/dev/null 2>&1; then
      echo "SpectraBox server is ready"
      break
    fi
  fi
  
  if [ \$i -eq 1 ]; then
    echo "Server not responding yet, waiting..."
  elif [ \$((i % 10)) -eq 0 ]; then
    echo "Still waiting for server... (attempt \$i/90)"
  fi
  
  sleep 1
done

# Final check before launching browser
if ! curl -sk --max-time 5 "\${URL}/api/health" >/dev/null 2>&1; then
  echo "ERROR: SpectraBox server is not responding after 90 seconds"
  echo "Check service status: sudo systemctl status spectrabox"
  echo "Check logs: sudo journalctl -u spectrabox -f"
  exit 1
fi

echo "Launching browser in kiosk mode..."
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
CURRENT_STEP="Test service functionality"
if confirm_step "12.5" "Test service functionality" "Test the service can start, stop, and restart properly"; then
  echo "Testing service functionality..."
  
  # Test service restart
  if systemctl restart "${SERVICE_NAME}"; then
    echo "✔ Service restart successful"
  else
    echo "✖ Service restart failed"
    systemctl --no-pager --full status "${SERVICE_NAME}" || true
    exit 1
  fi
  
  # Wait for service to be active again
  sleep 3
  if systemctl is-active --quiet "${SERVICE_NAME}"; then
    echo "✔ Service is active after restart"
  else
    echo "✖ Service failed to become active after restart"
    systemctl --no-pager --full status "${SERVICE_NAME}" || true
    exit 1
  fi
  
  # Test service reload (if supported)
  if systemctl reload "${SERVICE_NAME}" 2>/dev/null; then
    echo "✔ Service reload successful"
  else
    echo "! Service reload not supported (this is normal)"
  fi
  
  echo "✔ Service functionality test passed"
fi

# ---------------------------------------------------------
CURRENT_STEP="Health check"
if confirm_step "13" "Health check" "Query /api/health over http/https localhost"; then
  echo "Performing health check..."
  
  # Wait a bit more for the service to be fully ready
  sleep 2
  
  # Try multiple health check attempts
  HEALTH_CHECK_PASSED=false
  for attempt in {1..5}; do
    echo "Health check attempt $attempt/5..."
    
    if command -v curl >/dev/null 2>&1; then
      # Try HTTP first
      if curl -sk --max-time 5 "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
        echo "✔ HTTP health check passed"
        HEALTH_CHECK_PASSED=true
        break
      fi
      
      # Try HTTPS if HTTP failed
      if curl -sk --max-time 5 "https://localhost:${PORT}/api/health" >/dev/null 2>&1; then
        echo "✔ HTTPS health check passed"
        HEALTH_CHECK_PASSED=true
        break
      fi
    fi
    
    if [ $attempt -lt 5 ]; then
      echo "Health check failed, waiting 3 seconds before retry..."
      sleep 3
    fi
  done
  
  if [ "$HEALTH_CHECK_PASSED" = true ]; then
    echo "✔ Server responded to /api/health"
  else
    echo "! Server not responding to health checks"
    echo "Checking service status:"
    systemctl --no-pager --full status "${SERVICE_NAME}" || true
    echo "Recent service logs:"
    journalctl -u "${SERVICE_NAME}" --no-pager -n 20 || true
    echo "Note: Service may still be starting up. You can check manually with:"
    echo "  sudo systemctl status spectrabox"
    echo "  sudo journalctl -u spectrabox -f"
  fi
fi

# ---------------------------------------------------------
CURRENT_STEP="Enable service on boot"
if confirm_step "13.5" "Enable service on boot" "Ensure the service starts automatically on system boot"; then
  echo "Enabling service to start on boot..."
  
  if systemctl enable "${SERVICE_NAME}"; then
    echo "✔ Service enabled for boot"
  else
    echo "✖ Failed to enable service for boot"
    exit 1
  fi
  
  # Verify the service is enabled
  if systemctl is-enabled --quiet "${SERVICE_NAME}"; then
    echo "✔ Service is confirmed enabled for boot"
  else
    echo "✖ Service is not enabled for boot"
    exit 1
  fi
  
  echo "✔ Boot autostart configured"
fi

# ---------------------------------------------------------
CURRENT_STEP="Finish"
if confirm_step "14" "Finish & reboot" "Show summary; optionally reboot into kiosk"; then
  echo
  echo "============================================================"
  echo "🎉 SpectraBox Kiosk Installation Complete!"
  echo "============================================================"
  echo
  echo "📋 Installation Summary:"
  echo "  • Service     : ${SERVICE_NAME}"
  echo "  • Status      : $(systemctl is-active --quiet "${SERVICE_NAME}" && echo "✅ Running" || echo "❌ Not running")"
  echo "  • Boot Status : $(systemctl is-enabled --quiet "${SERVICE_NAME}" && echo "✅ Enabled" || echo "❌ Not enabled")"
  echo "  • App Dir     : ${APP_DIR}"
  echo "  • URL         : http(s)://localhost:${PORT}"
  echo "  • Kiosk       : Autostarts at login; emergency exit Ctrl+Alt+X"
  echo
  echo "🔧 Service Management:"
  echo "  • Check status: sudo systemctl status ${SERVICE_NAME}"
  echo "  • View logs   : sudo journalctl -u ${SERVICE_NAME} -f"
  echo "  • Start       : sudo systemctl start ${SERVICE_NAME}"
  echo "  • Stop        : sudo systemctl stop ${SERVICE_NAME}"
  echo "  • Restart     : sudo systemctl restart ${SERVICE_NAME}"
  echo
  echo "🌐 Kiosk Management:"
  echo "  • Start kiosk : ${PI_HOME}/start-kiosk.sh"
  echo "  • Exit kiosk  : ${PI_HOME}/exit-kiosk.sh"
  echo "  • Manual test : sudo -u ${PI_USER} ${PI_HOME}/start-kiosk.sh"
  echo
  echo "📁 Files & Logs:"
  echo "  • Install log : ${INSTALL_LOG}"
  echo "  • Service log : /var/log/spectrabox/"
  echo "  • SSL certs   : ${APP_DIR}/ssl/"
  echo
  echo "🚨 Troubleshooting:"
  echo "  • If service fails: sudo journalctl -u ${SERVICE_NAME} -n 50"
  echo "  • If browser won't start: check DISPLAY variable and X11"
  echo "  • If audio issues: ensure user is in audio group"
  echo "  • If port conflicts: check with 'sudo netstat -tlnp | grep :${PORT}'"
  echo
  echo "🔍 Next Steps - Verification Commands:"
  echo "  • Check Node server status:"
  echo "    sudo systemctl status spectrabox --no-pager -l"
  echo "    sudo tail -n 50 /var/log/spectrabox/app.log"
  echo "    curl -sk https://localhost:${PORT}/api/health || curl -s http://localhost:${PORT}/api/health"
  echo "  • Check kiosk service status:"
  echo "    sudo -u ${PI_USER} systemctl --user status spectrabox-kiosk --no-pager -l"
  echo "    sudo -u ${PI_USER} journalctl --user -u spectrabox-kiosk -e --no-pager"
  echo "  • Manual service management:"
  echo "    sudo systemctl daemon-reload && sudo systemctl restart spectrabox"
  echo "    sudo -u ${PI_USER} systemctl --user daemon-reload && sudo -u ${PI_USER} systemctl --user restart spectrabox-kiosk"
  echo
  read -r -p "Reboot now to enter kiosk mode? [Y/n] " ans </dev/tty || ans="Y"
  if [[ -z "$ans" || "$ans" =~ ^[Yy]$ ]]; then
    echo "Rebooting in 5 seconds... (Ctrl+C to cancel)"
    sleep 5
    reboot
  else
    echo "Skipping reboot. You can reboot later with: sudo reboot"
    echo "To test kiosk mode now, run: sudo -u ${PI_USER} ${PI_HOME}/start-kiosk.sh"
  fi
else
  echo "Done. Skipped final reboot."
fi
