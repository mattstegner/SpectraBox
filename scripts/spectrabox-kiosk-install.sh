#!/usr/bin/env bash
set -euo pipefail

# ========== CONFIG ==========
PI_USER="${SUDO_USER:-${USER}}"
PI_HOME="$(getent passwd "$PI_USER" | cut -d: -f6)"
APP_DIR="$PI_HOME/spectrabox"
REPO_URL="https://github.com/mattstegner/SpectraBox.git"
SERVICE_NAME="spectrabox"
PORT="3000"
NODE_MAJOR="18"
# ============================

banner() { echo -e "\n\033[1;36m==> $*\033[0m"; }
ok()     { echo -e "\033[1;32m✔ $*\033[0m"; }
warn()   { echo -e "\033[1;33m! $*\033[0m"; }
err()    { echo -e "\033[1;31m✖ $*\033[0m"; }
step()   { echo -e "   - $*"; }

require_root() {
  if [[ "$EUID" -ne 0 ]]; then
    err "Please run as root: sudo bash $0"
    exit 1
  fi
}

trap 'err "Install failed. Check the logs above."' ERR

require_root

banner "SpectraBox Kiosk Installer (Raspberry Pi OS)"
step  "Target user: $PI_USER"
step  "Home dir   : $PI_HOME"
step  "App dir    : $APP_DIR"

# -------------------------------------------------------------------
banner "1) System update & base packages"
apt-get update -y
apt-get upgrade -y
apt-get install -y --no-install-recommends \
  ca-certificates curl wget git xdg-utils \
  alsa-utils pulseaudio pulseaudio-utils \
  chromium-browser xdotool unclutter \
  jq libnss3 libatk1.0-0 libxss1 libasound2 \
  raspi-config

ok "System packages installed/updated"

# -------------------------------------------------------------------
banner "2) Install Node.js ${NODE_MAJOR}.x (NodeSource)"
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q "v${NODE_MAJOR}"; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v && npm -v
ok "Node.js installed"

# -------------------------------------------------------------------
banner "3) Clone or update SpectraBox repo"
if [[ -d "$APP_DIR/.git" ]]; then
  step "Repo exists, pulling latest..."
  sudo -u "$PI_USER" git -C "$APP_DIR" pull --ff-only
else
  step "Cloning fresh repo to $APP_DIR"
  sudo -u "$PI_USER" git clone "$REPO_URL" "$APP_DIR"
fi
ok "Repository ready"

# -------------------------------------------------------------------
banner "4) Install app dependencies (production)"
cd "$APP_DIR"
if [[ -f package-lock.json ]]; then
  sudo -u "$PI_USER" npm ci --only=production
else
  sudo -u "$PI_USER" npm install --only=production
fi
ok "Node dependencies installed"

# -------------------------------------------------------------------
banner "5) Generate SSL certs for HTTPS (persistent mic perms)"
# HTTPS allows Chromium to store mic permissions across sessions. :contentReference[oaicite:2]{index=2}
if [[ -f "$APP_DIR/generate-ssl.js" ]]; then
  sudo -u "$PI_USER" node "$APP_DIR/generate-ssl.js"
  ok "SSL certificates generated"
else
  warn "generate-ssl.js not found; proceeding without HTTPS. Mic prompts may reappear on reboot."
fi

# -------------------------------------------------------------------
banner "6) Create systemd service for SpectraBox"
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
ExecStart=/usr/bin/node ${APP_DIR}/server.js
Restart=always
RestartSec=3

# Security hardening (matches your docs’ intent)
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=false
MemoryMax=512M
CPUQuota=80%

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"
sleep 2
systemctl --no-pager --full status "${SERVICE_NAME}" || true
ok "Systemd service enabled & started"

# -------------------------------------------------------------------
banner "7) Configure Desktop autologin & GUI boot"
# Ensure Pi boots to desktop with autologin so kiosk can launch.
if raspi-config nonint get_boot_cli | grep -q 0; then
  step "raspi-config not found or changed; continuing"
fi
# B4 = Desktop Autologin (Legacy raspi-config). We try both methods below.
if raspi-config nonint do_boot_behaviour B4; then
  ok "Boot set to Desktop (autologin)"
else
  warn "raspi-config desktop autologin setting may have changed on this OS; ensuring graphical target"
  systemctl set-default graphical.target || true
fi

# -------------------------------------------------------------------
banner "8) Create kiosk scripts & autostart entry"
START_KIOSK="$PI_HOME/start-kiosk.sh"
EXIT_KIOSK="$PI_HOME/exit-kiosk.sh"
AUTOSTART_DIR="$PI_HOME/.config/autostart"
OPENBOX_DIR="$PI_HOME/.config/openbox"
KIOSK_DESKTOP="$AUTOSTART_DIR/kiosk.desktop"
OPENBOX_RC="$OPENBOX_DIR/lxde-pi-rc.xml"

# Decide URL: prefer HTTPS if certs exist
URL="http://localhost:${PORT}"
if [[ -d "$APP_DIR/certs" ]] || grep -q "https" <<< "$(sed -n '1,80p' server.js 2>/dev/null || true)"; then
  URL="https://localhost:${PORT}"
fi

install -d -m 755 "$AUTOSTART_DIR" "$OPENBOX_DIR"

cat > "$START_KIOSK" <<'EOS'
#!/usr/bin/env bash
set -euo pipefail
# Disable screen blanking / power management
xset s off
xset -dpms
xset s noblank
# Hide mouse after idle
unclutter -idle 0.5 -root &

# Wait for SpectraBox to respond
URL="${1:-https://localhost:3000}"
for i in {1..60}; do
  if curl -sk --max-time 1 "${URL}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Launch Chromium in kiosk with mic-friendly flags
chromium-browser \
  --kiosk "${URL}" \
  --app="${URL}" \
  --noerrdialogs \
  --disable-session-crashed-bubble \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  --allow-running-insecure-content \
  --ignore-certificate-errors \
  --disable-web-security \
  --use-fake-ui-for-media-stream \
  --auto-accept-camera-and-microphone-capture \
  --enable-features=HardwareMediaKeyHandling \
  --start-maximized \
  --incognito
EOS
chmod +x "$START_KIOSK"
chown "$PI_USER:$PI_USER" "$START_KIOSK"

cat > "$EXIT_KIOSK" <<'EOS'
#!/usr/bin/env bash
pkill -f chromium-browser || true
EOS
chmod +x "$EXIT_KIOSK"
chown "$PI_USER:$PI_USER" "$EXIT_KIOSK"

cat > "$KIOSK_DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=SpectraBox Kiosk
Exec=${START_KIOSK} "${URL}"
X-GNOME-Autostart-enabled=true
EOF
chown -R "$PI_USER:$PI_USER" "$AUTOSTART_DIR"

# Emergency exit keybinding (Ctrl+Alt+X)
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

ok "Kiosk scripts & autostart configured"

# -------------------------------------------------------------------
banner "9) Permissions & log directory"
mkdir -p /var/log/spectrabox
chown "$PI_USER:$PI_USER" /var/log/spectrabox
chown -R "$PI_USER:$PI_USER" "$APP_DIR"
ok "Ownership & logs set"

# -------------------------------------------------------------------
banner "10) Quick health check"
if curl -sk "http://localhost:${PORT}/api/health" >/dev/null 2>&1 || \
   curl -sk "https://localhost:${PORT}/api/health" >/dev/null 2>&1; then
  ok "Server responded to /api/health"
else
  warn "Server not responding yet—systemd may still be starting it"
fi

# -------------------------------------------------------------------
banner "11) Summary"
echo "  • Service  : ${SERVICE_NAME} (systemd) — 'sudo systemctl status ${SERVICE_NAME}'"
echo "  • App Dir  : ${APP_DIR}"
echo "  • URL      : ${URL}"
echo "  • Kiosk    : Autostarts at login; emergency exit: Ctrl+Alt+X"
echo "  • Start/Stop kiosk manually: '${START_KIOSK} \"${URL}\"' / '${EXIT_KIOSK}'"

ok "Install complete. Reboot recommended."
echo
read -r -p "Reboot now to enter kiosk mode? [Y/n] " ans
if [[ "${ans:-Y}" =~ ^[Yy]$ ]]; then
  reboot
fi
