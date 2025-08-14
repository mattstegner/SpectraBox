# SpectraBox - Deployment Guide

This guide covers deploying the SpectraBox application to a Raspberry Pi for production use.

## Prerequisites

- Raspberry Pi 4 or newer (recommended: Pi 4 with 2GB+ RAM)
- Raspberry Pi OS (32-bit or 64-bit)
- SD card with at least 16GB capacity
- Network connection (WiFi or Ethernet)
- Audio input device (USB microphone, audio interface, etc.)

## Quick Deployment (Recommended)

### Complete Automated Deployment

The easiest way to deploy SpectraBox is using the complete deployment script that handles everything from system setup to kiosk configuration:

**Option 1: Direct deployment (recommended)**
```bash
curl -fsSL https://raw.githubusercontent.com/mattstegner/SpectraBox/main/scripts/complete-pi-deployment.sh | bash
```

**Option 2: Download and inspect first**
```bash
wget https://raw.githubusercontent.com/mattstegner/SpectraBox/main/scripts/complete-pi-deployment.sh
chmod +x complete-pi-deployment.sh
./complete-pi-deployment.sh
```

This complete deployment script will:
- Update system packages
- Install Node.js 18 and dependencies
- Install audio system dependencies (ALSA, PulseAudio)
- Install kiosk mode dependencies (Chromium, unclutter, xdotool)
- Clone the SpectraBox repository to `/home/pi/spectrabox`
- Install application dependencies
- Generate SSL certificates for HTTPS
- Set up systemd service for auto-start
- Configure complete kiosk mode with auto-start
- Create recovery scripts and emergency exit shortcuts
- Test the application and start services

**Requirements:**
- Run as the `pi` user (not root)
- Internet connection for downloading packages and repository

### Basic Deployment (Application Only)

If you only want to install the application without kiosk mode:

```bash
# Clone the repository
git clone https://github.com/mattstegner/SpectraBox.git /home/pi/spectrabox
cd /home/pi/spectrabox

# Run the basic deployment script
./scripts/deploy-pi.sh
```

This basic script will:
- Install Node.js and dependencies
- Set up the systemd service
- Configure SSL certificates
- Start the application

## Step-by-Step Instructions

If you prefer to install manually or need to customize the installation, follow these detailed steps:

### Step 1: System Preparation

Update your Raspberry Pi:
```bash
sudo apt update && sudo apt upgrade -y
```

Install Node.js 18:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Verify Node.js installation:
```bash
node --version  # Should show v18.x.x
npm --version   # Should show npm version
```

Install audio dependencies:
```bash
sudo apt install -y alsa-utils pulseaudio pulseaudio-utils
```

Install kiosk mode dependencies (optional):
```bash
sudo apt install -y chromium-browser unclutter xdotool
```

### Step 2: Application Setup

Clone and set up the application:
```bash
git clone https://github.com/mattstegner/SpectraBox.git /home/pi/spectrabox
cd /home/pi/spectrabox
npm ci --only=production
```

Generate SSL certificates (recommended for HTTPS and microphone permissions):
```bash
node generate-ssl.js
```

Set proper file permissions:
```bash
chown -R pi:pi /home/pi/spectrabox
chmod +x /home/pi/spectrabox/scripts/*.sh
```

### Step 3: Service Configuration

Copy the systemd service file:
```bash
sudo cp spectrabox.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable spectrabox
```

Create log directory:
```bash
sudo mkdir -p /var/log/spectrabox
sudo chown pi:pi /var/log/spectrabox
```

Start the service:
```bash
sudo systemctl start spectrabox
```

Verify the service is running:
```bash
sudo systemctl status spectrabox
```

### Step 4: Kiosk Mode Setup (Optional)

For full kiosk mode with auto-starting browser:
```bash
./scripts/setup-kiosk.sh
```

This will configure:
- Chromium browser in kiosk mode
- Auto-start on boot
- Screen saver disabled
- Mouse cursor hidden
- Emergency exit shortcut (Ctrl+Alt+X)

### Step 5: Testing

Test the application:
```bash
# Check if the server is responding
curl http://localhost:3000/api/health

# Get your Pi's IP address
hostname -I

# Test from another device (replace with your Pi's IP)
curl http://YOUR_PI_IP:3000/api/health
```

## Configuration

### Environment Variables

The application supports these environment variables (configured in the systemd service):

- `NODE_ENV`: Set to `production` for production deployment
- `PORT`: Server port (default: 3000)
- `HOST`: Server host (default: 0.0.0.0 for network access)
- `LOG_LEVEL`: Logging level (debug, info, warn, error)
- `NODE_OPTIONS`: Node.js options (default: --max-old-space-size=256)

### Systemd Service Configuration

The service file includes optimizations for Raspberry Pi:

- Memory limit: 512MB
- CPU quota: 80%
- Automatic restart on failure
- Proper signal handling for graceful shutdown
- Security restrictions (no new privileges, protected directories)

### Performance Tuning

For optimal performance on Raspberry Pi:

1. **Memory Management**: The application is configured to use maximum 256MB heap
2. **CPU Throttling**: Limited to 80% CPU usage to prevent overheating
3. **Static File Caching**: Enabled in production mode
4. **Request Monitoring**: Performance metrics logged every 5 minutes

## Monitoring

### Service Status

Check service status:
```bash
sudo systemctl status spectrabox
```

View logs:
```bash
sudo journalctl -u spectrabox -f
```

View recent logs:
```bash
sudo journalctl -u spectrabox -n 50
```

### Performance Monitoring

The application includes built-in performance monitoring:

- Memory usage tracking
- Request/error rate monitoring
- Uptime statistics
- CPU usage approximation

Access metrics at: `http://your-pi-ip:3000/api/metrics`

### Health Checks

Health check endpoint: `http://your-pi-ip:3000/api/health`

Returns:
- Service status
- Basic performance metrics
- Uptime information

## Network Access

The application is configured to accept connections from the local network:

- **HTTP**: `http://your-pi-ip:3000`
- **HTTPS**: `https://your-pi-ip:3000` (if SSL certificates are configured)

### Finding Your Pi's IP Address

```bash
hostname -I
```

### Firewall Configuration (Optional)

If you want to restrict access, configure the firewall:
```bash
# Allow only local network access (example for 192.168.1.x network)
sudo ufw allow from 192.168.1.0/24 to any port 3000
sudo ufw enable
```

## Kiosk Mode

### Automatic Kiosk Mode

The `setup-kiosk.sh` script configures:

- Chromium browser in kiosk mode
- Auto-start on boot
- Screen saver disabled
- Mouse cursor hidden
- Emergency exit (Ctrl+Alt+X)

### Manual Kiosk Mode

Start kiosk mode manually:
```bash
/home/pi/start-kiosk.sh
```

Exit kiosk mode:
```bash
/home/pi/exit-kiosk.sh
```

Or use the emergency shortcut: **Ctrl+Alt+X**

### Kiosk Mode Files

The kiosk setup creates these files:
- `/home/pi/start-kiosk.sh` - Start kiosk mode
- `/home/pi/exit-kiosk.sh` - Exit kiosk mode
- `~/.config/autostart/kiosk.desktop` - Autostart configuration
- `~/.config/openbox/lxde-pi-rc.xml` - Emergency exit shortcut

## Troubleshooting

### Common Issues

**Service won't start:**
```bash
# Check service status
sudo systemctl status spectrabox

# Check logs
sudo journalctl -u spectrabox -n 50

# Check if port is in use
sudo netstat -tlnp | grep :3000
```

**High memory usage:**
- Monitor with: `http://your-pi-ip:3000/api/metrics`
- Adjust `NODE_OPTIONS` in service file if needed
- Check for memory leaks in logs

**Audio devices not detected:**
```bash
# Test audio system
arecord -l
pactl list sources short

# Check permissions
groups $USER

# Restart audio services
sudo systemctl restart pulseaudio
```

**Browser won't start in kiosk mode:**
```bash
# Check if X11 is running
echo $DISPLAY

# Test browser manually
chromium-browser --version

# Check autostart configuration
ls -la ~/.config/autostart/
```

**Network access issues:**
```bash
# Test local access
curl http://localhost:3000/api/health

# Test network binding
sudo netstat -tlnp | grep :3000

# Check firewall
sudo ufw status
```

### Log Locations

- **Application logs**: `sudo journalctl -u spectrabox`
- **System logs**: `/var/log/syslog`
- **Browser logs**: Check systemd journal for display service

### Performance Issues

If experiencing performance issues:

1. Check memory usage: `free -h`
2. Check CPU temperature: `vcgencmd measure_temp`
3. Monitor disk usage: `df -h`
4. Review performance metrics: `http://your-pi-ip:3000/api/metrics`
5. Check for swap usage: `swapon --show`

### Recovery Commands

If the system becomes unresponsive:
```bash
# Restart the service
sudo systemctl restart spectrabox

# Exit kiosk mode
/home/pi/exit-kiosk.sh

# Emergency reboot
sudo reboot
```

## Security Considerations

### Network Security

- The application binds to `0.0.0.0` for network access
- Consider using a firewall to restrict access to local network only
- HTTPS is recommended for production use
- Change default ports if needed for additional security

### File Permissions

The service runs as the `pi` user with restricted permissions:
- No new privileges allowed
- Private temporary directory
- Protected system directories
- Limited capability set

### SSL/TLS

Generate and use SSL certificates:
```bash
node generate-ssl.js
```

This enables HTTPS and allows microphone permissions to be remembered by browsers.

## Backup and Recovery

### Configuration Backup

Important files to backup:
- `/home/pi/spectrabox/` (entire application directory)
- `/etc/systemd/system/spectrabox.service`
- User preferences (stored in application directory)
- Kiosk configuration files in `~/.config/`

### Creating a Backup

```bash
# Create backup directory
mkdir -p ~/backups/spectrabox-$(date +%Y%m%d)

# Backup application
cp -r /home/pi/spectrabox ~/backups/spectrabox-$(date +%Y%m%d)/

# Backup service file
sudo cp /etc/systemd/system/spectrabox.service ~/backups/spectrabox-$(date +%Y%m%d)/

# Backup kiosk configuration
cp -r ~/.config/autostart ~/backups/spectrabox-$(date +%Y%m%d)/config/
```

### Recovery

To restore from backup:
1. Copy application files to `/home/pi/spectrabox/`
2. Install dependencies: `npm ci --only=production`
3. Copy service file and reload systemd
4. Restore kiosk configuration
5. Start the service

```bash
# Restore application
cp -r ~/backups/spectrabox-YYYYMMDD/spectrabox /home/pi/

# Restore service
sudo cp ~/backups/spectrabox-YYYYMMDD/spectrabox.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable spectrabox

# Install dependencies
cd /home/pi/spectrabox
npm ci --only=production

# Start service
sudo systemctl start spectrabox
```

## Updates

### Application Updates

```bash
cd /home/pi/spectrabox
git pull origin main
npm ci --only=production
sudo systemctl restart spectrabox
```

### System Updates

```bash
sudo apt update && sudo apt upgrade -y
sudo reboot
```

### Automated Updates (Optional)

Create a simple update script:
```bash
#!/bin/bash
# Save as /home/pi/update-spectrabox.sh

cd /home/pi/spectrabox
git pull origin main
npm ci --only=production
sudo systemctl restart spectrabox
echo "SpectraBox updated successfully"
```

## Support

For issues and support:

1. Check the logs: `sudo journalctl -u spectrabox -f`
2. Verify system requirements
3. Test audio devices: `arecord -l`
4. Check network connectivity
5. Review performance metrics: `http://your-pi-ip:3000/api/metrics`
6. Test network access: `./scripts/test-network-access.sh`

### Getting Help

- Check the GitHub repository for issues and documentation
- Review the troubleshooting section above
- Ensure all prerequisites are met
- Verify the installation steps were followed correctly

## Performance Benchmarks

Typical performance on Raspberry Pi 4 (2GB):

- **Memory usage**: 50-100MB
- **CPU usage**: 5-15% idle, 20-40% active
- **Response time**: <100ms for API calls
- **Startup time**: 10-15 seconds

Lower-end Pi models may have reduced performance but should still function adequately for the intended use case.

### Performance Tips

- Use a fast SD card (Class 10 or better)
- Ensure adequate cooling for sustained performance
- Monitor CPU temperature to prevent throttling
- Consider using a USB 3.0 drive for better I/O performance
- Disable unnecessary services to free up resources
## 
Microphone Permission Management

The browser's microphone permission dialog is a security feature that appears when a website requests access to the microphone. This section provides several approaches to avoid or minimize these prompts for a better user experience.

### Option 1: HTTPS with SSL Certificates (Recommended)

The most effective approach is to serve your application over HTTPS. Browsers can store permissions persistently for HTTPS sites but typically reset permissions for HTTP sites when the browser is closed.

**Implementation:**
1. SSL certificates are automatically generated during deployment
2. The server detects SSL certificates and uses HTTPS automatically
3. Users grant microphone permission once, and it persists across sessions

**Manual SSL Certificate Generation:**
```bash
cd /home/pi/spectrabox
node generate-ssl.js
```

The server will automatically use HTTPS when certificates are present.

### Option 2: Browser Command Line Flags

For development or kiosk environments, you can start Chrome/Chromium with special flags to automatically accept microphone permissions.

**Chrome/Chromium on Different Platforms:**

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --auto-accept-camera-and-microphone-capture http://localhost:3000
```

**Linux:**
```bash
chromium-browser --auto-accept-camera-and-microphone-capture http://localhost:3000
```

**Windows:**
```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --auto-accept-camera-and-microphone-capture http://localhost:3000
```

**Raspberry Pi Kiosk Mode:**
The kiosk setup script automatically includes these flags. If you need to modify them, edit `/home/pi/start-kiosk.sh` and add:
```bash
chromium-browser --kiosk --auto-accept-camera-and-microphone-capture http://localhost:3000
```

### Option 3: Electron Application (Advanced)

For a completely standalone application without permission dialogs, consider packaging the application with Electron. This approach:

- Eliminates browser permission prompts entirely
- Provides a native application experience
- Allows for custom window management and system integration
- Requires additional development and packaging setup

**Note:** Electron packaging is not included in the standard deployment but can be implemented for specialized use cases.

### Option 4: Kiosk Mode Integration

The complete deployment script automatically configures kiosk mode with appropriate browser flags to minimize permission prompts:

- Uses HTTPS when SSL certificates are available
- Includes microphone permission flags in the browser startup
- Configures persistent browser settings
- Provides emergency exit options

**Kiosk Mode Browser Configuration:**
The kiosk mode includes these microphone-friendly flags:
- `--autoplay-policy=no-user-gesture-required`
- `--allow-running-insecure-content`
- `--disable-web-security` (with isolated user data directory)
- `--ignore-certificate-errors` (for self-signed certificates)

### Recommendation

For most users, **Option 1 (HTTPS with SSL certificates)** combined with **Option 4 (Kiosk Mode)** provides the best experience:

1. Run the complete deployment script (includes SSL certificate generation)
2. The system automatically configures HTTPS and kiosk mode
3. Users get persistent microphone permissions with minimal prompts
4. The system works reliably across reboots and browser sessions

### Testing Microphone Permissions

After deployment, test microphone access:

1. Open the application: `https://your-pi-ip:3000`
2. Grant microphone permission when prompted (should only happen once with HTTPS)
3. Verify audio input is working in the spectrum analyzer
4. Reboot the system and confirm permissions persist

If permissions are not persisting, check:
- SSL certificates are properly generated and loaded
- Browser is accessing via HTTPS (not HTTP)
- Kiosk mode is properly configured with the correct flags