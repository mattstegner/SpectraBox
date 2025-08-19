# SpectraBox

A real-time spectrum analyzer and audio visualization application designed to run on Raspberry Pi and other platforms. SpectraBox provides professional-grade audio analysis tools through a modern web interface, perfect for audio engineers, musicians, and enthusiasts.

## Features

- **Real-time stereo spectrum analysis** with customizable frequency ranges
- **Peak and RMS level meters** for accurate audio monitoring
- **Phase correlation meter** for stereo field analysis
- **Multiple audio input device support** with automatic device detection
- **Persistent user preferences** that save automatically
- **Network accessibility** for remote access from any device
- **Kiosk mode support** for dedicated displays and installations
- **Comprehensive settings interface** with tabbed organization
- **Professional-grade visualization** with smooth, responsive displays
- **Real-time server update monitoring** with WebSocket-based status updates

## Quick Installation

### For Raspberry Pi (Recommended)

The easiest way to get SpectraBox running on a Raspberry Pi is using our automated deployment script:

**Method 1: Direct Installation (fastest)**
```bash
curl -fsSL https://raw.githubusercontent.com/mattstegner/SpectraBox/main/scripts/install.sh | sudo bash
```

**Method 2: Alternative Installation (if you encounter download issues)**
```bash
wget https://raw.githubusercontent.com/mattstegner/SpectraBox/main/scripts/install.sh
chmod +x install.sh
./install.sh
```

**Method 3: Manual Installation (for advanced users)**
```bash
wget https://raw.githubusercontent.com/mattstegner/SpectraBox/main/scripts/install-spectrabox.sh
chmod +x install-spectrabox.sh
./install-spectrabox.sh
```

Both methods will:
- Install all required dependencies (Node.js, audio libraries, browser)
- Set up the SpectraBox application
- Configure automatic startup and kiosk mode
- Generate SSL certificates for secure access
- Start the service and make it available on your network

**Requirements:**
- Raspberry Pi 4 or newer (Pi 4 with 2GB+ RAM recommended)
- Raspberry Pi OS (32-bit or 64-bit)
- Internet connection
- Run as the `pi` user (not root)

**Troubleshooting Installation Issues:**
If you encounter errors like "cho: command not found" or "curl: (23) Failure writing output to destination", use Method 2 above, which downloads the script locally first to avoid piping issues.

After installation, access SpectraBox at:
- **Local**: `https://localhost:3000`
- **Network**: `https://your-pi-ip:3000`

### For Development or Other Platforms

For development or installation on other platforms:

1. **Clone the repository:**
```bash
git clone https://github.com/mattstegner/SpectraBox.git
cd SpectraBox
```

2. **Install dependencies:**
```bash
npm install
```

**Dependencies:**
- `express` - Web server framework
- `cors` - Cross-origin resource sharing middleware
- `ws` - WebSocket library for real-time update status communication

3. **Generate SSL certificates (recommended):**
```bash
node generate-ssl.js
```

4. **Start the server:**
```bash
node server.js
```

5. **Open in your browser:**
   - HTTPS: `https://localhost:3000`
   - HTTP: `http://localhost:3000`

## Complete Installation Guide

For detailed installation instructions, configuration options, troubleshooting, and advanced setup, see the **[DEPLOYMENT.md](DEPLOYMENT.md)** file.

The deployment guide includes:
- **Step-by-step manual installation** for custom setups
- **Configuration options** for different environments
- **Kiosk mode setup** for dedicated displays
- **Network configuration** for remote access
- **Troubleshooting guide** for common issues
- **Security considerations** and SSL setup
- **Performance optimization** for Raspberry Pi
- **Backup and recovery** procedures
- **Microphone permission management** for browsers

## Network Access

SpectraBox is designed for network accessibility, allowing you to:

- **Access from any device** on your local network
- **Use tablets or phones** as remote displays
- **Monitor audio** from a different room
- **Share analysis** with multiple users simultaneously

### Network Configuration

By default, SpectraBox binds to `0.0.0.0:3000`, making it accessible from any device on your network:

- **Local access**: `https://localhost:3000`
- **Network access**: `https://your-device-ip:3000`

Find your device's IP address:
- **Raspberry Pi/Linux**: `hostname -I`
- **macOS**: `ifconfig | grep "inet "`
- **Windows**: `ipconfig`

### Network Tab

The application includes a dedicated **Network** tab in the settings that shows:
- Current network status and accessibility
- Server configuration details
- Access URLs for local and network connections
- Kiosk mode status

### Server Tab

The application includes a **Server** tab for server management:
- Current version information
- Update availability checking
- Real-time update progress monitoring via WebSocket
- Server update execution with progress tracking

## Audio Input Support

SpectraBox supports a wide range of audio input devices:

- **USB microphones** and audio interfaces
- **Built-in microphones** on supported devices
- **Professional audio interfaces** with multiple channels
- **Bluetooth audio devices** (with proper system configuration)

The application automatically detects available audio devices and allows you to select the preferred input source through the settings interface.

## Browser Compatibility

SpectraBox works with modern web browsers that support the Web Audio API:

- **Chrome/Chromium** (recommended)
- **Firefox**
- **Safari** (macOS/iOS)
- **Edge** (Windows)

For the best experience, especially on Raspberry Pi, Chrome/Chromium is recommended due to optimized performance and full feature support.

## Use Cases

SpectraBox is perfect for:

- **Live sound monitoring** during performances or recordings
- **Room acoustics analysis** for audio setup optimization
- **Audio equipment testing** and calibration
- **Educational demonstrations** of audio concepts
- **Broadcast monitoring** for radio and streaming
- **Home studio monitoring** for music production
- **Audio troubleshooting** and system diagnostics

## System Requirements

### Minimum Requirements
- **CPU**: ARM Cortex-A53 (Raspberry Pi 3B+) or equivalent x86/x64
- **RAM**: 1GB (2GB+ recommended)
- **Storage**: 2GB free space
- **Network**: WiFi or Ethernet connection
- **Audio**: USB microphone or audio interface

### Recommended Setup
- **Raspberry Pi 4** with 2GB+ RAM
- **Class 10 SD card** or USB 3.0 storage
- **Quality USB audio interface** for professional use
- **Dedicated display** for kiosk mode installations
- **Reliable network connection** for remote access

## Documentation

- **[Installation Guide](DEPLOYMENT.md)** - Complete setup and deployment instructions
- **[Version Management](docs/VERSION_MANAGEMENT.md)** - Understanding the update system
- **[Release Management](docs/RELEASE_MANAGEMENT.md)** - Guide for developers creating updates
- **Troubleshooting** - Check the deployment guide for common issues and solutions
- **GitHub Issues**: Report bugs or request features on the GitHub repository
- **Network Testing**: Use the included network test script for connectivity verification

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit pull requests, report bugs, or suggest new features through the GitHub repository.

---

**Ready to get started?** Run the quick installation command above, or check out the [DEPLOYMENT.md](DEPLOYMENT.md) file for detailed setup instructions.