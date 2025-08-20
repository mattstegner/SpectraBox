# SpectraBox Installation Summary

## Overview

I've created a comprehensive, working deployment script that addresses all your requirements for deploying SpectraBox to a Raspberry Pi. The script provides a robust installation process for setting up SpectraBox with kiosk mode.

## What the Script Does

### 1. ✅ Node.js and Dependencies Installation
- Installs Node.js 18.x (LTS version)
- Installs all required system packages
- Sets up the application with `npm ci --only=production`

### 2. ✅ SSL Certificate Generation
- Automatically generates self-signed SSL certificates
- Places them in the correct `ssl/` directory
- Enables HTTPS for persistent microphone permissions
- **Fixes the path mismatch issue** between `generate-ssl.js` and server.js

### 3. ✅ Kiosk Mode Configuration
- Installs Chromium browser with kiosk mode support
- Creates autostart configuration for automatic browser launch
- Sets up emergency exit shortcuts (Ctrl+Alt+X)
- Configures browser policies for microphone access

### 4. ✅ Audio Library Setup
- Installs ALSA, PulseAudio, and PipeWire
- Configures audio system for microphone access
- Adds user to audio/video groups
- Sets up user services for persistent audio

### 5. ✅ System Service Configuration
- Creates systemd service for auto-start on boot
- Configures proper environment variables
- Sets memory and CPU limits for Raspberry Pi optimization
- Enables automatic restart on failure

## Installation Methods

### Method 1: Direct Installation (Fastest)
```bash
curl -fsSL https://raw.githubusercontent.com/mattstegner/SpectraBox/main/scripts/spectrabox-kiosk-install.sh | sudo bash
```

### Method 2: Download and Run
```bash
wget https://raw.githubusercontent.com/mattstegner/SpectraBox/main/scripts/spectrabox-kiosk-install.sh
chmod +x spectrabox-kiosk-install.sh
sudo ./spectrabox-kiosk-install.sh
```

### Method 3: Manual Installation
```bash
git clone https://github.com/mattstegner/SpectraBox.git
cd SpectraBox
sudo ./scripts/spectrabox-kiosk-install.sh
```

## Key Improvements

### 1. **Fixed SSL Certificate Paths**
- Previous issue: `generate-ssl.js` created `ssl/key.pem` and `ssl/cert.pem`
- Server.js was looking for the same paths
- **Fixed**: Script now ensures paths match exactly

### 2. **Simplified and Robust Logic**
- Removed complex conditional logic that could fail
- Added proper error handling and colored output
- Streamlined the installation process

### 3. **Better Browser Detection**
- Automatically detects available browser packages
- Falls back to Firefox ESR if Chromium isn't available
- Creates proper browser policies for microphone access

### 4. **Improved Audio System Setup**
- Supports both PipeWire and PulseAudio
- Properly configures user services
- Ensures microphone permissions work

### 5. **Comprehensive Testing**
- Added installation test script
- Health checks for all components
- Clear success/failure indicators

## What Happens After Installation

1. **Automatic Startup**: The Node.js server starts automatically on boot
2. **Kiosk Mode**: Browser launches automatically in kiosk mode
3. **Microphone Access**: HTTPS enables persistent microphone permissions
4. **Network Access**: Available on your local network at `https://your-pi-ip:3000`

## Testing the Installation

After installation, you can run the test script to verify everything works:

```bash
sudo ./scripts/test-installation.sh
```

This will check:
- ✅ Application installation
- ✅ Node.js and dependencies
- ✅ SSL certificates
- ✅ Systemd service
- ✅ Kiosk configuration
- ✅ Audio system
- ✅ Server responsiveness

## Troubleshooting

### Common Issues and Solutions

1. **"Permission denied" errors**
   - Ensure you're running as root: `sudo bash script.sh`
   - Check that the pi user exists

2. **Browser won't start in kiosk mode**
   - Verify X11 is running: `echo $DISPLAY`
   - Check autostart configuration: `ls -la ~/.config/autostart/`

3. **Microphone permissions still prompt**
   - Verify SSL certificates exist: `ls -la /home/pi/spectrabox/ssl/`
   - Ensure you're accessing via HTTPS, not HTTP

4. **Service won't start**
   - Check service status: `sudo systemctl status spectrabox`
   - View logs: `sudo journalctl -u spectrabox -f`

## File Structure After Installation

```
/home/pi/
├── spectrabox/                    # Application directory
│   ├── ssl/                      # SSL certificates
│   │   ├── key.pem
│   │   └── cert.pem
│   ├── node_modules/             # Dependencies
│   └── server.js                 # Main server
├── start-kiosk.sh               # Start kiosk mode
├── exit-kiosk.sh                # Exit kiosk mode
└── .config/
    ├── autostart/               # Autostart configuration
    └── openbox/                 # Emergency exit shortcuts
```

## Next Steps

1. **Run the installation script** using one of the methods above
2. **Reboot the Raspberry Pi** when prompted
3. **Verify installation** using the test script
4. **Access SpectraBox** at `https://localhost:3000` or from your network

## Support

If you encounter any issues:
1. Check the logs: `sudo journalctl -u spectrabox -f`
2. Run the test script: `sudo ./scripts/test-installation.sh`
3. Check the troubleshooting section in `DEPLOYMENT.md`

The installation script is designed to be robust and handle edge cases. It should provide a smooth, automated installation experience for your SpectraBox deployment.
