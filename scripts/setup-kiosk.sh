#!/bin/bash

# SpectraBox - Kiosk Mode Setup Script
# This script configures the Raspberry Pi for kiosk mode operation

set -e  # Exit on any error

echo "🖥️  SpectraBox - Kiosk Mode Setup"
echo "===================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Check if running as pi user
if [ "$USER" != "pi" ]; then
    log_error "Please run this script as the pi user"
    exit 1
fi

log_info "Setting up kiosk mode for SpectraBox..."

# Step 1: Install required packages
log_info "Installing kiosk mode dependencies..."
sudo apt update
sudo apt install -y chromium-browser unclutter xdotool

# Step 2: Create kiosk startup script
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
  --disable-features=TranslateUI,VizDisplayCompositor \
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
  --start-fullscreen \
  --hide-scrollbars \
  --force-device-scale-factor=1 \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  http://localhost:3000
EOF

chmod +x /home/pi/start-kiosk.sh

# Step 3: Configure autostart
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

# Step 4: Configure boot to desktop
log_info "Configuring boot to desktop..."
sudo raspi-config nonint do_boot_behaviour B4

# Step 5: Disable screen saver in LXDE
log_info "Disabling screen saver..."
mkdir -p /home/pi/.config/lxsession/LXDE-pi
cat > /home/pi/.config/lxsession/LXDE-pi/autostart << 'EOF'
@lxpanel --profile LXDE-pi
@pcmanfm --desktop --profile LXDE-pi
@xscreensaver -no-splash
@point-rpi
@/home/pi/start-kiosk.sh
EOF

# Step 6: Create recovery script
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

# Step 7: Set up keyboard shortcut for emergency exit
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

# Step 8: Create systemd service for kiosk mode (alternative to autostart)
log_info "Creating kiosk systemd service..."
sudo tee /etc/systemd/system/spectrabox-display.service > /dev/null << 'EOF'
[Unit]
Description=SpectraBox Display
After=graphical-session.target
Wants=graphical-session.target

[Service]
Type=simple
User=pi
Group=pi
Environment=DISPLAY=:0
ExecStart=/home/pi/start-kiosk.sh
Restart=always
RestartSec=10

[Install]
WantedBy=graphical-session.target
EOF

# Don't enable the systemd service by default (use autostart instead)
# sudo systemctl enable spectrabox-display

echo ""
log_info "Kiosk mode setup completed! 🎉"
echo ""
echo "Configuration Summary:"
echo "  • Chromium will start in kiosk mode on boot"
echo "  • Screen saver and blanking disabled"
echo "  • Mouse cursor hidden after 0.5 seconds"
echo "  • Emergency exit: Ctrl+Alt+X"
echo ""
echo "Files Created:"
echo "  • /home/pi/start-kiosk.sh - Start kiosk mode"
echo "  • /home/pi/exit-kiosk.sh - Exit kiosk mode"
echo "  • ~/.config/autostart/kiosk.desktop - Autostart configuration"
echo ""
echo "Next Steps:"
echo "  1. Reboot the Raspberry Pi: sudo reboot"
echo "  2. The kiosk will start automatically after boot"
echo "  3. Use Ctrl+Alt+X to exit kiosk mode if needed"
echo ""
echo "Network Access:"
echo "  • The server is configured to accept connections from the network (0.0.0.0)"
echo "  • Access from other devices: http://<raspberry-pi-ip>:3000"
echo "  • Find Pi IP with: hostname -I"
echo ""
log_warn "Note: Make sure the SpectraBox service is running before rebooting!"
EOF