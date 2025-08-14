#!/bin/bash

# SpectraBox - Complete Deployment Script for Raspberry Pi
# This script handles the complete setup from source code to running kiosk
# 
# Usage: curl -fsSL https://raw.githubusercontent.com/mattstegner/SpectraBox/main/scripts/complete-pi-deployment.sh | bash
# Or: wget -O - https://raw.githubusercontent.com/mattstegner/SpectraBox/main/scripts/complete-pi-deployment.sh | bash

set -e  # Exit on any error

echo "🚀 SpectraBox - Complete Deployment Script"
echo "=========================================="
echo "This script will set up the complete SpectraBox system"
echo ""

# Configuration
REPO_URL="https://github.com/mattstegner/SpectraBox.git"
APP_NAME="spectrabox"
APP_USER="pi"
APP_DIR="/home/pi/spectrabox"
SERVICE_FILE="spectrabox.service"
NODE_VERSION="18"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    log_error "Please do not run this script as root. Run as the pi user."
    log_info "Usage: curl -fsSL https://raw.githubusercontent.com/mattstegner/SpectraBox/main/scripts/complete-pi-deployment.sh | bash"
    exit 1
fi

# Check if running as pi user
if [ "$USER" != "pi" ]; then
    log_warn "This script is designed to run as the 'pi' user. Current user: $USER"
    log_info "Continuing anyway, but some features may not work correctly."
fi

# Check if running on Raspberry Pi
if ! grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null; then
    log_warn "This script is designed for Raspberry Pi. Continuing anyway..."
fi

# Confirm installation
echo "This script will:"
echo "  1. Update system packages"
echo "  2. Install Node.js $NODE_VERSION"
echo "  3. Install audio system dependencies"
echo "  4. Clone the SpectraBox repository"
echo "  5. Install application dependencies"
echo "  6. Generate SSL certificates"
echo "  7. Set up systemd service"
echo "  8. Configure kiosk mode"
echo "  9. Start the application"
echo ""
read -p "Do you want to continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Installation cancelled."
    exit 0
fi

log_info "Starting complete deployment process..."

# =============================================================================
# STEP 1: System Update and Dependencies
# =============================================================================
log_step "1. Updating system packages..."
sudo apt update
sudo apt upgrade -y

# =============================================================================
# STEP 2: Install Node.js
# =============================================================================
log_step "2. Installing Node.js..."
if ! command -v node &> /dev/null; then
    log_info "Installing Node.js ${NODE_VERSION}..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    CURRENT_NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$CURRENT_NODE_VERSION" -lt "$NODE_VERSION" ]; then
        log_info "Upgrading Node.js from v$CURRENT_NODE_VERSION to v${NODE_VERSION}..."
        curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        log_info "Node.js is already installed: $(node --version)"
    fi
fi

# Verify Node.js installation
if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
    log_error "Node.js installation failed"
    exit 1
fi

log_info "Node.js version: $(node --version)"
log_info "npm version: $(npm --version)"

# =============================================================================
# STEP 3: Install Audio Dependencies
# =============================================================================
log_step "3. Installing audio system dependencies..."
sudo apt install -y alsa-utils pulseaudio pulseaudio-utils

# =============================================================================
# STEP 4: Install Kiosk Dependencies
# =============================================================================
log_step "4. Installing kiosk mode dependencies..."
sudo apt install -y chromium-browser unclutter xdotool

# =============================================================================
# STEP 5: Clone Repository
# =============================================================================
log_step "5. Cloning SpectraBox repository..."

# Remove existing directory if it exists
if [ -d "$APP_DIR" ]; then
    log_warn "Existing installation found at $APP_DIR"
    read -p "Do you want to remove it and start fresh? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Removing existing installation..."
        rm -rf "$APP_DIR"
    else
        log_info "Keeping existing installation. Pulling latest changes..."
        cd "$APP_DIR"
        git pull origin main || {
            log_error "Failed to update existing repository"
            exit 1
        }
    fi
fi

# Clone repository if directory doesn't exist
if [ ! -d "$APP_DIR" ]; then
    log_info "Cloning repository from $REPO_URL..."
    git clone "$REPO_URL" "$APP_DIR" || {
        log_error "Failed to clone repository"
        exit 1
    }
fi

cd "$APP_DIR"

# =============================================================================
# STEP 6: Install Application Dependencies
# =============================================================================
log_step "6. Installing application dependencies..."
log_info "Installing Node.js dependencies (this may take a few minutes)..."
npm ci --only=production || {
    log_error "Failed to install Node.js dependencies"
    exit 1
}

# =============================================================================
# STEP 7: Generate SSL Certificates
# =============================================================================
log_step "7. Generating SSL certificates..."
if [ ! -f "$APP_DIR/ssl/cert.pem" ]; then
    log_info "Generating SSL certificates for HTTPS support..."
    mkdir -p "$APP_DIR/ssl"
    node generate-ssl.js || {
        log_warn "Failed to generate SSL certificates. HTTPS may not work."
    }
else
    log_info "SSL certificates already exist"
fi

# =============================================================================
# STEP 8: Set Up Systemd Service
# =============================================================================
log_step "8. Setting up systemd service..."

# Set proper permissions
log_info "Setting file permissions..."
chown -R $APP_USER:$APP_USER "$APP_DIR"
chmod +x "$APP_DIR/scripts/"*.sh 2>/dev/null || true
chmod +x "$APP_DIR/start-kiosk.js" 2>/dev/null || true

# Install systemd service
log_info "Installing systemd service..."
sudo cp "$SERVICE_FILE" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable "$APP_NAME"

# Create log directory
log_info "Creating log directory..."
sudo mkdir -p /var/log/spectrabox
sudo chown $APP_USER:$APP_USER /var/log/spectrabox

# =============================================================================
# STEP 9: Configure Kiosk Mode
# =============================================================================
log_step "9. Configuring kiosk mode..."

# Create kiosk startup script
log_info "Creating kiosk startup script..."
cat > /home/pi/start-kiosk.sh << 'EOF'
#!/bin/bash

# SpectraBox - Kiosk Mode Startup Script

# Wait for the desktop to load
sleep 10

# Hide mouse cursor
unclutter -idle 0.5 -root &

# Disable screen blanking
xset s noblank
xset s off
xset -dpms

# Start Chromium in kiosk mode
chromium-browser \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-component-extensions-with-background-pages \
  --disable-background-networking \
  --disable-background-timer-throttling \
  --disable-renderer-backgrounding \
  --disable-backgrounding-occluded-windows \
  --disable-client-side-phishing-detection \
  --disable-default-apps \
  --disable-dev-shm-usage \
  --disable-extensions \
  --disable-features=TranslateUI \
  --disable-hang-monitor \
  --disable-ipc-flooding-protection \
  --disable-popup-blocking \
  --disable-prompt-on-repost \
  --disable-sync \
  --disable-translate \
  --disable-web-security \
  --metrics-recording-only \
  --no-first-run \
  --no-default-browser-check \
  --password-store=basic \
  --use-mock-keychain \
  --kiosk \
  --autoplay-policy=no-user-gesture-required \
  --allow-running-insecure-content \
  --disable-features=VizDisplayCompositor \
  --start-fullscreen \
  --ignore-certificate-errors \
  --ignore-ssl-errors \
  --ignore-certificate-errors-spki-list \
  http://localhost:3000
EOF

chmod +x /home/pi/start-kiosk.sh

# Configure autostart
log_info "Configuring autostart..."
mkdir -p /home/pi/.config/autostart

cat > /home/pi/.config/autostart/kiosk.desktop << 'EOF'
[Desktop Entry]
Type=Application
Name=SpectraBox
Comment=Start SpectraBox in kiosk mode
Icon=chromium-browser
Exec=/home/pi/start-kiosk.sh
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
EOF

# Configure boot to desktop
log_info "Configuring boot to desktop..."
sudo raspi-config nonint do_boot_behaviour B4

# Disable screen saver in LXDE
log_info "Disabling screen saver..."
mkdir -p /home/pi/.config/lxsession/LXDE-pi
cat > /home/pi/.config/lxsession/LXDE-pi/autostart << 'EOF'
@lxpanel --profile LXDE-pi
@pcmanfm --desktop --profile LXDE-pi
@xscreensaver -no-splash
@point-rpi
@/home/pi/start-kiosk.sh
EOF

# Create recovery script
log_info "Creating recovery script..."
cat > /home/pi/exit-kiosk.sh << 'EOF'
#!/bin/bash

# SpectraBox - Exit Kiosk Mode Script
# Use this script to exit kiosk mode and return to desktop

echo "Exiting kiosk mode..."

# Kill Chromium
pkill -f chromium-browser

# Kill unclutter
pkill -f unclutter

# Re-enable screen blanking
xset s blank
xset s on
xset +dpms

echo "Kiosk mode exited. You can now use the desktop normally."
echo "To restart kiosk mode, run: /home/pi/start-kiosk.sh"
EOF

chmod +x /home/pi/exit-kiosk.sh

# Set up keyboard shortcut for emergency exit
log_info "Setting up emergency exit shortcut (Ctrl+Alt+X)..."
mkdir -p /home/pi/.config/openbox
cat > /home/pi/.config/openbox/lxde-pi-rc.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<openbox_config xmlns="http://openbox.org/3.4/rc" xmlns:xi="http://www.w3.org/2001/XInclude">
  <keyboard>
    <keybind key="C-A-x">
      <action name="Execute">
        <command>/home/pi/exit-kiosk.sh</command>
      </action>
    </keybind>
  </keyboard>
</openbox_config>
EOF

# =============================================================================
# STEP 10: Test Application
# =============================================================================
log_step "10. Testing application..."
log_info "Testing application startup..."

# Test the application briefly
timeout 10s node server.js &
TEST_PID=$!
sleep 5

if kill -0 $TEST_PID 2>/dev/null; then
    log_info "✓ Application test successful"
    kill $TEST_PID
    wait $TEST_PID 2>/dev/null || true
else
    log_error "✗ Application failed to start during test"
    exit 1
fi

# =============================================================================
# STEP 11: Start Services
# =============================================================================
log_step "11. Starting services..."
log_info "Starting the SpectraBox service..."
sudo systemctl start "$APP_NAME"

# Wait a moment for service to start
sleep 3

# Check service status
if sudo systemctl is-active --quiet "$APP_NAME"; then
    log_info "✓ Service started successfully"
else
    log_error "✗ Service failed to start"
    log_info "Checking service status..."
    sudo systemctl status "$APP_NAME" --no-pager
    exit 1
fi

# =============================================================================
# STEP 12: Final Configuration and Information
# =============================================================================
log_step "12. Final setup..."

# Get IP address
LOCAL_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "🎉 SpectraBox deployment completed successfully!"
echo "=================================================="
echo ""
echo "✅ Installation Summary:"
echo "  • Repository cloned to: $APP_DIR"
echo "  • Node.js version: $(node --version)"
echo "  • Service: $APP_NAME (enabled and running)"
echo "  • SSL certificates: $([ -f "$APP_DIR/ssl/cert.pem" ] && echo "Generated" || echo "Not available")"
echo "  • Kiosk mode: Configured for auto-start"
echo ""
echo "🌐 Access Information:"
echo "  • Local HTTP:  http://localhost:3000"
echo "  • Local HTTPS: https://localhost:3000"
if [ -n "$LOCAL_IP" ]; then
echo "  • Network HTTP:  http://$LOCAL_IP:3000"
echo "  • Network HTTPS: https://$LOCAL_IP:3000"
fi
echo ""
echo "🖥️  Kiosk Mode:"
echo "  • Auto-start: Enabled (will start on next boot)"
echo "  • Manual start: /home/pi/start-kiosk.sh"
echo "  • Exit kiosk: /home/pi/exit-kiosk.sh"
echo "  • Emergency exit: Ctrl+Alt+X"
echo ""
echo "🔧 Service Management:"
echo "  • Check status: sudo systemctl status $APP_NAME"
echo "  • View logs: sudo journalctl -u $APP_NAME -f"
echo "  • Restart: sudo systemctl restart $APP_NAME"
echo "  • Stop: sudo systemctl stop $APP_NAME"
echo ""
echo "📋 Next Steps:"
echo "  1. Test the web interface: http://localhost:3000"
if [ -n "$LOCAL_IP" ]; then
echo "  2. Test network access: http://$LOCAL_IP:3000"
fi
echo "  3. Reboot to test kiosk mode: sudo reboot"
echo "  4. Configure audio devices through the web interface"
echo ""
echo "🔍 Troubleshooting:"
echo "  • Service logs: sudo journalctl -u $APP_NAME -f"
echo "  • Test network: $APP_DIR/scripts/test-network-access.sh"
echo "  • Audio devices: arecord -l"
echo ""

# Offer to reboot
echo "The system is ready to use. Kiosk mode will start automatically after reboot."
read -p "Would you like to reboot now to test kiosk mode? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Rebooting system..."
    sudo reboot
else
    log_info "You can reboot later with: sudo reboot"
    log_info "Or test the application now at: http://localhost:3000"
fi

log_info "Deployment complete! 🚀"