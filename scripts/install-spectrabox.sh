#!/usr/bin/env bash

# SpectraBox Complete Installation Script for Raspberry Pi
# This script performs a complete installation including:
# 1. Node.js and dependencies
# 2. SSL certificates for microphone permissions
# 3. Kiosk mode with auto-start
# 4. Audio libraries and system configuration

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions for colored output
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
PI_USER="${SUDO_USER:-${USER}}"
PI_HOME="$(getent passwd "$PI_USER" | cut -d: -f6)"
APP_DIR="$PI_HOME/spectrabox"
REPO_URL="https://github.com/mattstegner/SpectraBox.git"
SERVICE_NAME="spectrabox"
PORT="3000"
NODE_VERSION="18"

# Check if running as root
if [[ "$EUID" -ne 0 ]]; then
    log_error "Please run as root: sudo bash $0"
    exit 1
fi

# Check if pi user exists
if [[ -z "$PI_USER" ]]; then
    log_error "Could not determine user. Please run as: sudo -u pi bash $0"
    exit 1
fi

log_info "Starting SpectraBox installation for user: $PI_USER"
log_info "Home directory: $PI_HOME"
log_info "Application directory: $APP_DIR"

# Function to handle errors
error_handler() {
    log_error "Installation failed at line $1"
    log_error "Check the logs above for details"
    exit 1
}

trap 'error_handler $LINENO' ERR

# Step 1: System Update and Base Packages
log_info "Step 1: Updating system and installing base packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    wget \
    git \
    jq \
    xdg-utils \
    xdotool \
    unclutter \
    libnss3 \
    libatk1.0-0 \
    libxss1 \
    libasound2 \
    libgtk-3-0 \
    libgdk-pixbuf2.0-0 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxkbcommon0 \
    libatspi2.0-0 \
    alsa-utils \
    openssl \
    pulseaudio \
    pulseaudio-utils

log_success "Base packages installed"

# Step 2: Install Node.js
log_info "Step 2: Installing Node.js $NODE_VERSION.x..."
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE "^v${NODE_VERSION}\."; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
    apt-get install -y nodejs
fi

log_info "Node.js version: $(node -v)"
log_info "npm version: $(npm -v)"
log_success "Node.js installed"

# Step 3: Install Audio Dependencies
log_info "Step 3: Installing audio dependencies..."
apt-get install -y --no-install-recommends \
    pipewire-audio \
    wireplumber \
    libspa-0.2-bluetooth

# Add user to audio and video groups
usermod -aG audio,video "$PI_USER" || true

# Enable user services for PipeWire
loginctl enable-linger "$PI_USER" || true
sudo -u "$PI_USER" systemctl --user enable pipewire pipewire-pulse wireplumber || true

log_success "Audio dependencies installed"

# Step 4: Install Browser
log_info "Step 4: Installing browser..."
BROWSER_PKG=""
if apt-cache show chromium >/dev/null 2>&1; then
    BROWSER_PKG="chromium"
elif apt-cache show chromium-browser >/dev/null 2>&1; then
    BROWSER_PKG="chromium-browser"
elif apt-cache show firefox-esr >/dev/null 2>&1; then
    BROWSER_PKG="firefox-esr"
else
    log_error "No supported browser package found"
    exit 1
fi

apt-get install -y "$BROWSER_PKG"

# Find browser binary
BROWSER_BIN=""
if command -v chromium >/dev/null 2>&1; then
    BROWSER_BIN="chromium"
elif command -v chromium-browser >/dev/null 2>&1; then
    BROWSER_BIN="chromium-browser"
elif command -v firefox-esr >/dev/null 2>&1; then
    BROWSER_BIN="firefox-esr"
fi

if [[ -z "$BROWSER_BIN" ]]; then
    log_error "Could not find browser binary after installation"
    exit 1
fi

log_info "Browser package: $BROWSER_PKG"
log_info "Browser binary: $BROWSER_BIN"
log_success "Browser installed"

# Step 5: Clone SpectraBox Repository
log_info "Step 5: Setting up SpectraBox application..."
if [[ -d "$APP_DIR/.git" ]]; then
    log_info "Repository exists, updating..."
    sudo -u "$PI_USER" git -C "$APP_DIR" pull --ff-only
else
    log_info "Cloning repository to $APP_DIR"
    sudo -u "$PI_USER" git clone "$REPO_URL" "$APP_DIR"
fi

log_success "Repository ready"

# Step 6: Install Application Dependencies
log_info "Step 6: Installing application dependencies..."
cd "$APP_DIR"
if [[ -f package-lock.json ]]; then
    sudo -u "$PI_USER" npm ci --only=production
else
    sudo -u "$PI_USER" npm install --only=production
fi

# Initialize configuration if script exists
if [[ -f "$APP_DIR/scripts/init-config.js" ]]; then
    log_info "Initializing configuration files..."
    sudo -u "$PI_USER" node "$APP_DIR/scripts/init-config.js"
fi

log_success "Dependencies installed"

# Step 7: Create Version.txt
log_info "Step 7: Setting up version file..."
VERSION_FILE="$APP_DIR/Version.txt"
if [[ ! -f "$VERSION_FILE" ]]; then
    VERSION="1.0.0"
    if [[ -f "$APP_DIR/package.json" ]] && command -v jq >/dev/null 2>&1; then
        VERSION=$(jq -r '.version // "1.0.0"' "$APP_DIR/package.json")
    fi
    echo "$VERSION" > "$VERSION_FILE"
    chown "$PI_USER:$PI_USER" "$VERSION_FILE"
    log_info "Version.txt created with version: $VERSION"
fi

log_success "Version file ready"

# Step 8: Generate SSL Certificates
log_info "Step 8: Generating SSL certificates for microphone permissions..."
SSL_DIR="$APP_DIR/ssl"
mkdir -p "$SSL_DIR"
chown -R "$PI_USER:$PI_USER" "$SSL_DIR"

# Use the generate-ssl.js script if it exists
if [[ -f "$APP_DIR/generate-ssl.js" ]]; then
    log_info "Using generate-ssl.js script..."
    cd "$APP_DIR"
    sudo -u "$PI_USER" node generate-ssl.js
else
    log_info "Creating self-signed certificates manually..."
    cd "$SSL_DIR"
    openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
        -keyout key.pem \
        -out cert.pem \
        -subj "/CN=localhost"
    chown "$PI_USER:$PI_USER" key.pem cert.pem
fi

log_success "SSL certificates generated"

# Step 9: Create Systemd Service
log_info "Step 9: Creating systemd service..."
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
systemctl start "${SERVICE_NAME}"

# Wait for service to start
sleep 5
if systemctl is-active --quiet "${SERVICE_NAME}"; then
    log_success "Systemd service started"
else
    log_warning "Service may not be running yet, checking status..."
    systemctl status "${SERVICE_NAME}" || true
fi

# Step 10: Configure Desktop Autologin
log_info "Step 10: Configuring desktop autologin..."
if command -v raspi-config >/dev/null 2>&1; then
    raspi-config nonint do_boot_behaviour B4 || true
    log_success "Desktop autologin configured"
else
    systemctl set-default graphical.target || true
    log_info "Set default target to graphical"
fi

# Step 11: Configure Browser Policies
log_info "Step 11: Configuring browser policies for microphone access..."
mkdir -p /etc/chromium/policies/managed /etc/opt/chrome/policies/managed

cat > /etc/chromium/policies/managed/kiosk-mic.json <<JSON
{
  "AudioCaptureAllowed": true,
  "AudioCaptureAllowedUrls": [
    "https://localhost:${PORT}",
    "http://localhost:${PORT}"
  ],
  "DefaultMediaStreamSetting": 1,
  "MediaStreamMicrophoneAllowedUrls": [
    "https://localhost:${PORT}",
    "http://localhost:${PORT}"
  ],
  "AutoSelectCertificateForUrls": [
    {
      "pattern": "https://localhost:${PORT}",
      "filter": {}
    }
  ]
}
JSON

# Copy to Chrome path too
cp /etc/chromium/policies/managed/kiosk-mic.json /etc/opt/chrome/policies/managed/kiosk-mic.json 2>/dev/null || true

log_success "Browser policies configured"

# Step 12: Create Kiosk Scripts
log_info "Step 12: Creating kiosk mode scripts..."
START_KIOSK="$PI_HOME/start-kiosk.sh"
EXIT_KIOSK="$PI_HOME/exit-kiosk.sh"
AUTOSTART_DIR="$PI_HOME/.config/autostart"
OPENBOX_DIR="$PI_HOME/.config/openbox"
CHROME_DATA_DIR="$PI_HOME/.config/spectrabox-chrome"

# Determine URL (prefer HTTPS if certs exist)
URL="http://localhost:${PORT}"
if [[ -f "$SSL_DIR/cert.pem" && -f "$SSL_DIR/key.pem" ]]; then
    URL="https://localhost:${PORT}"
fi

mkdir -p "$AUTOSTART_DIR" "$OPENBOX_DIR" "$CHROME_DATA_DIR"
chown -R "$PI_USER:$PI_USER" "$CHROME_DATA_DIR"

# Create start-kiosk script
cat > "$START_KIOSK" <<EOS
#!/usr/bin/env bash
set -e
export DISPLAY=\${DISPLAY:-:0}

# Disable screen blanking
xset s off || true
xset -dpms || true
xset s noblank || true

# Hide mouse cursor
unclutter -idle 0.5 -root >/dev/null 2>&1 &

# Wait for audio system
for i in {1..20}; do
    if command -v wpctl >/dev/null 2>&1; then
        if wpctl status >/dev/null 2>&1; then break; fi
    elif command -v pactl >/dev/null 2>&1; then
        if pactl info >/dev/null 2>&1; then break; fi
    fi
    sleep 1
done

# Wait for SpectraBox server
for i in {1..60}; do
    if command -v curl >/dev/null 2>&1 && curl -sk --max-time 1 "${URL}/api/health" >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

# Launch browser in kiosk mode
if [[ "${BROWSER_BIN}" == *"chromium"* ]]; then
    exec "${BROWSER_BIN}" \\
        --kiosk "${URL}" \\
        --noerrdialogs \\
        --disable-session-crashed-bubble \\
        --disable-infobars \\
        --disable-translate \\
        --autoplay-policy=no-user-gesture-required \\
        --ignore-certificate-errors \\
        --ignore-ssl-errors \\
        --start-maximized \\
        --user-data-dir="${CHROME_DATA_DIR}" \\
        --allow-running-insecure-content \\
        --use-fake-device-for-media-stream=false \\
        --no-sandbox \\
        --disable-dev-shm-usage \\
        --disable-gpu-sandbox
else
    exec "${BROWSER_BIN}" --kiosk "${URL}"
fi
EOS

chmod +x "$START_KIOSK"
chown "$PI_USER:$PI_USER" "$START_KIOSK"

# Create exit-kiosk script
cat > "$EXIT_KIOSK" <<'EOS'
#!/usr/bin/env bash
pkill -f chromium || true
pkill -f chromium-browser || true
pkill -f firefox-esr || true
EOS

chmod +x "$EXIT_KIOSK"
chown "$PI_USER:$PI_USER" "$EXIT_KIOSK"

# Create autostart entry
cat > "$AUTOSTART_DIR/kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=SpectraBox Kiosk
Exec=${START_KIOSK}
X-GNOME-Autostart-enabled=true
EOF

chown -R "$PI_USER:$PI_USER" "$AUTOSTART_DIR"

# Create emergency exit keybinding
cat > "$OPENBOX_DIR/lxde-pi-rc.xml" <<'EOF'
<openbox_config>
  <keyboard>
    <keybind key="C-A-x">
      <action name="Execute"><command>/bin/bash -lc "$HOME/exit-kiosk.sh"</command></action>
    </keybind>
  </keyboard>
</openbox_config>
EOF

chown -R "$PI_USER:$PI_USER" "$OPENBOX_DIR"

log_success "Kiosk mode configured"

# Step 13: Set Permissions and Create Log Directory
log_info "Step 13: Setting permissions and creating log directory..."
mkdir -p /var/log/spectrabox
chown "$PI_USER:$PI_USER" /var/log/spectrabox
chown -R "$PI_USER:$PI_USER" "$APP_DIR"

log_success "Permissions set"

# Step 14: Health Check
log_info "Step 14: Performing health check..."
sleep 3
if command -v curl >/dev/null 2>&1; then
    if curl -sk --max-time 5 "http://localhost:${PORT}/api/health" >/dev/null 2>&1 || \
       curl -sk --max-time 5 "https://localhost:${PORT}/api/health" >/dev/null 2>&1; then
        log_success "Server is responding to health checks"
    else
        log_warning "Server not responding yet - may still be starting"
    fi
fi

# Final Summary
log_success "SpectraBox installation completed successfully!"
echo ""
echo "=== Installation Summary ==="
echo "• Service: $SERVICE_NAME (status: sudo systemctl status $SERVICE_NAME)"
echo "• Application: $APP_DIR"
echo "• URL: $URL"
echo "• Kiosk: Autostarts at login, emergency exit: Ctrl+Alt+X"
echo "• Manual kiosk control: $START_KIOSK / $EXIT_KIOSK"
echo ""
echo "=== Next Steps ==="
echo "1. Reboot the Raspberry Pi to enter kiosk mode"
echo "2. The browser will automatically launch and display SpectraBox"
echo "3. Microphone permissions should work without prompts (HTTPS enabled)"
echo "4. Access from other devices on your network: $URL"
echo ""

read -r -p "Reboot now to enter kiosk mode? [Y/n] " ans
if [[ "${ans:-Y}" =~ ^[Yy]$ ]]; then
    log_info "Rebooting in 5 seconds..."
    sleep 5
    reboot
else
    log_info "Please reboot manually when ready: sudo reboot"
fi