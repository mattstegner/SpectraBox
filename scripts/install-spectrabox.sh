#!/bin/bash

# SpectraBox - Simple Installation Script
# This is a simplified version that avoids common piping issues
# 
# Usage: 
#   wget https://raw.githubusercontent.com/mattstegner/SpectraBox/main/scripts/install-spectrabox.sh
#   chmod +x install-spectrabox.sh
#   ./install-spectrabox.sh

echo "SpectraBox - Simple Installation Script"
echo "======================================"

# Download the main deployment script
echo "Downloading deployment script..."
if command -v wget >/dev/null 2>&1; then
    wget -O complete-pi-deployment.sh https://raw.githubusercontent.com/mattstegner/SpectraBox/main/scripts/complete-pi-deployment.sh
elif command -v curl >/dev/null 2>&1; then
    curl -fsSL -o complete-pi-deployment.sh https://raw.githubusercontent.com/mattstegner/SpectraBox/main/scripts/complete-pi-deployment.sh
else
    echo "Error: Neither wget nor curl is available"
    exit 1
fi

# Make it executable
chmod +x complete-pi-deployment.sh

# Run it
echo "Running deployment script..."
./complete-pi-deployment.sh

# Clean up
rm -f complete-pi-deployment.sh

echo "Installation complete!"