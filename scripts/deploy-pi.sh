#!/bin/bash

# SpectraBox Deployment Script for Raspberry Pi
# This script sets up the application for production deployment

set -e  # Exit on any error

echo "🚀 SpectraBox Deployment Script"
echo "=================================="

# Configuration
APP_NAME="spectrabox"
APP_USER="pi"
APP_DIR="/home/pi/spectrabox"
SERVICE_FILE="spectrabox.service"
NODE_VERSION="18"

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

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    log_error "Please do not run this script as root. Run as the pi user."
    exit 1
fi

# Check if running on Raspberry Pi
if ! grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null; then
    log_warn "This script is designed for Raspberry Pi. Continuing anyway..."
fi

log_info "Starting deployment process..."

# Step 1: Update system packages
log_info "Updating system packages..."
sudo apt update
sudo apt upgrade -y

# Step 2: Install Node.js if not present
if ! command -v node &> /dev/null; then
    log_info "Installing Node.js ${NODE_VERSION}..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    log_info "Node.js is already installed: $(node --version)"
fi

# Step 3: Install audio dependencies
log_info "Installing audio system dependencies..."
sudo apt install -y alsa-utils pulseaudio pulseaudio-utils

# Step 4: Create application directory if it doesn't exist
if [ ! -d "$APP_DIR" ]; then
    log_info "Creating application directory: $APP_DIR"
    mkdir -p "$APP_DIR"
fi

# Step 5: Copy application files (assuming we're in the project directory)
log_info "Copying application files..."
cp -r . "$APP_DIR/"
cd "$APP_DIR"

# Step 6: Install Node.js dependencies
log_info "Installing Node.js dependencies..."
npm ci --only=production

# Step 7: Set up systemd service
log_info "Setting up systemd service..."
sudo cp "$SERVICE_FILE" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable "$APP_NAME"

# Step 8: Create log directory
log_info "Creating log directory..."
sudo mkdir -p /var/log/spectrabox
sudo chown $APP_USER:$APP_USER /var/log/spectrabox

# Step 9: Set proper permissions
log_info "Setting file permissions..."
chown -R $APP_USER:$APP_USER "$APP_DIR"
chmod +x "$APP_DIR/scripts/"*.sh

# Step 10: Generate SSL certificates if they don't exist
if [ ! -f "$APP_DIR/ssl/cert.pem" ]; then
    log_info "Generating SSL certificates..."
    mkdir -p "$APP_DIR/ssl"
    node generate-ssl.js
fi

# Step 11: Test the application
log_info "Testing application startup..."
timeout 10s node server.js &
TEST_PID=$!
sleep 5

if kill -0 $TEST_PID 2>/dev/null; then
    log_info "Application test successful"
    kill $TEST_PID
else
    log_error "Application failed to start during test"
    exit 1
fi

# Step 12: Start the service
log_info "Starting the service..."
sudo systemctl start "$APP_NAME"
sudo systemctl status "$APP_NAME" --no-pager

# Step 13: Display final information
echo ""
log_info "Deployment completed successfully! 🎉"
echo ""
echo "Service Status:"
echo "  • Service: $APP_NAME"
echo "  • Status: $(sudo systemctl is-active $APP_NAME)"
echo "  • Enabled: $(sudo systemctl is-enabled $APP_NAME)"
echo ""
echo "Access Information:"
echo "  • HTTP:  http://$(hostname -I | awk '{print $1}'):3000"
echo "  • HTTPS: https://$(hostname -I | awk '{print $1}'):3000"
echo ""
echo "Useful Commands:"
echo "  • Check status: sudo systemctl status $APP_NAME"
echo "  • View logs: sudo journalctl -u $APP_NAME -f"
echo "  • Restart: sudo systemctl restart $APP_NAME"
echo "  • Stop: sudo systemctl stop $APP_NAME"
echo ""
log_info "Setup complete! The service will start automatically on boot."