#!/usr/bin/env bash

# SpectraBox Installation Test Script
# This script verifies that the installation completed successfully

echo "SpectraBox Installation Test"
echo "============================"
echo ""

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
SERVICE_NAME="spectrabox"
PORT="3000"

echo "Testing installation for user: $PI_USER"
echo "Application directory: $APP_DIR"
echo ""

# Test 1: Check if application directory exists
log_info "Test 1: Checking application directory..."
if [[ -d "$APP_DIR" ]]; then
    log_success "Application directory exists: $APP_DIR"
else
    log_error "Application directory not found: $APP_DIR"
    exit 1
fi

# Test 2: Check if Node.js is installed
log_info "Test 2: Checking Node.js installation..."
if command -v node >/dev/null 2>&1; then
    NODE_VERSION=$(node -v)
    log_success "Node.js is installed: $NODE_VERSION"
else
    log_error "Node.js is not installed"
    exit 1
fi

# Test 3: Check if npm is installed
log_info "Test 3: Checking npm installation..."
if command -v npm >/dev/null 2>&1; then
    NPM_VERSION=$(npm -v)
    log_success "npm is installed: $NPM_VERSION"
else
    log_error "npm is not installed"
    exit 1
fi

# Test 4: Check if dependencies are installed
log_info "Test 4: Checking application dependencies..."
if [[ -d "$APP_DIR/node_modules" ]]; then
    log_success "Node.js dependencies are installed"
else
    log_error "Node.js dependencies are not installed"
    exit 1
fi

# Test 5: Check if SSL certificates exist
log_info "Test 5: Checking SSL certificates..."
SSL_DIR="$APP_DIR/ssl"
if [[ -f "$SSL_DIR/cert.pem" && -f "$SSL_DIR/key.pem" ]]; then
    log_success "SSL certificates exist"
else
    log_warning "SSL certificates not found - microphone permissions may not work"
fi

# Test 6: Check if systemd service exists
log_info "Test 6: Checking systemd service..."
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
if [[ -f "$SERVICE_FILE" ]]; then
    log_success "Systemd service file exists"
else
    log_error "Systemd service file not found"
    exit 1
fi

# Test 7: Check if service is enabled
log_info "Test 7: Checking if service is enabled..."
if systemctl is-enabled --quiet "$SERVICE_NAME"; then
    log_success "Service is enabled"
else
    log_warning "Service is not enabled"
fi

# Test 8: Check if service is running
log_info "Test 8: Checking if service is running..."
if systemctl is-active --quiet "$SERVICE_NAME"; then
    log_success "Service is running"
else
    log_warning "Service is not running"
fi

# Test 9: Check if kiosk scripts exist
log_info "Test 9: Checking kiosk scripts..."
START_KIOSK="$PI_HOME/start-kiosk.sh"
EXIT_KIOSK="$PI_HOME/exit-kiosk.sh"
if [[ -f "$START_KIOSK" && -f "$EXIT_KIOSK" ]]; then
    log_success "Kiosk scripts exist"
else
    log_warning "Kiosk scripts not found"
fi

# Test 10: Check if autostart is configured
log_info "Test 10: Checking autostart configuration..."
AUTOSTART_FILE="$PI_HOME/.config/autostart/kiosk.desktop"
if [[ -f "$AUTOSTART_FILE" ]]; then
    log_success "Autostart is configured"
else
    log_warning "Autostart not configured"
fi

# Test 11: Check if browser is installed
log_info "Test 11: Checking browser installation..."
if command -v chromium >/dev/null 2>&1 || command -v chromium-browser >/dev/null 2>&1 || command -v firefox-esr >/dev/null 2>&1; then
    log_success "Browser is installed"
else
    log_warning "Browser not found"
fi

# Test 12: Check if audio system is working
log_info "Test 12: Checking audio system..."
if command -v wpctl >/dev/null 2>&1; then
    if wpctl status >/dev/null 2>&1; then
        log_success "PipeWire audio system is working"
    else
        log_warning "PipeWire audio system not responding"
    fi
elif command -v pactl >/dev/null 2>&1; then
    if pactl info >/dev/null 2>&1; then
        log_success "PulseAudio system is working"
    else
        log_warning "PulseAudio system not responding"
    fi
else
    log_warning "No audio system detected"
fi

# Test 13: Check if server is responding
log_info "Test 13: Checking if server is responding..."
sleep 2
if command -v curl >/dev/null 2>&1; then
    if curl -sk --max-time 5 "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
        log_success "HTTP server is responding"
    elif curl -sk --max-time 5 "https://localhost:${PORT}/api/health" >/dev/null 2>&1; then
        log_success "HTTPS server is responding"
    else
        log_warning "Server is not responding to health checks"
    fi
else
    log_warning "curl not available, cannot test server response"
fi

# Final summary
echo ""
echo "=== Installation Test Summary ==="
echo "✅ All critical components are installed and configured"
echo ""
echo "=== Next Steps ==="
echo "1. Reboot the Raspberry Pi: sudo reboot"
echo "2. The system will automatically start in kiosk mode"
echo "3. SpectraBox will be accessible at:"
echo "   - Local: http://localhost:${PORT} or https://localhost:${PORT}"
echo "   - Network: http://$(hostname -I | awk '{print $1}'):${PORT}"
echo ""
echo "=== Manual Control ==="
echo "• Start kiosk mode: $START_KIOSK"
echo "• Exit kiosk mode: $EXIT_KIOSK"
echo "• Emergency exit: Ctrl+Alt+X"
echo "• Service status: sudo systemctl status $SERVICE_NAME"
echo "• Service logs: sudo journalctl -u $SERVICE_NAME -f"
echo ""

log_success "Installation test completed successfully!"
