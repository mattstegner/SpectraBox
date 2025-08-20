#!/usr/bin/env bash

# SpectraBox Quick Install Script
# This script downloads and runs the main installation script

echo "SpectraBox Quick Installer"
echo "=========================="
echo ""

# Check if running as root
if [[ "$EUID" -ne 0 ]]; then
    echo "❌ Please run as root: sudo bash $0"
    exit 1
fi

echo "📥 Downloading installation script..."
if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o spectrabox-kiosk-install.sh https://raw.githubusercontent.com/mattstegner/SpectraBox/main/scripts/spectrabox-kiosk-install.sh
elif command -v wget >/dev/null 2>&1; then
    wget -O spectrabox-kiosk-install.sh https://raw.githubusercontent.com/mattstegner/SpectraBox/main/scripts/spectrabox-kiosk-install.sh
else
    echo "❌ Error: Neither curl nor wget is available"
    exit 1
fi

if [[ ! -f "spectrabox-kiosk-install.sh" ]]; then
    echo "❌ Failed to download installation script"
    exit 1
fi

echo "✅ Script downloaded successfully"
echo "🔧 Making script executable..."
chmod +x spectrabox-kiosk-install.sh

echo "🚀 Starting installation..."
echo ""

# Run the installation script
./spectrabox-kiosk-install.sh

# Clean up
echo ""
echo "🧹 Cleaning up..."
rm -f spectrabox-kiosk-install.sh

echo "✅ Quick installation complete!"
