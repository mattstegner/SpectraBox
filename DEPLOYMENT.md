# Pi Audio Kiosk - Deployment Guide

This guide covers deploying the Pi Audio Kiosk application to a Raspberry Pi for production use.

## Prerequisites

- Raspberry Pi 3B+ or newer (recommended: Pi 4 with 2GB+ RAM)
- Raspberry Pi OS (32-bit or 64-bit)
- SD card with at least 16GB capacity
- Network connection (WiFi or Ethernet)
- Audio input device (USB microphone, audio interface, etc.)

## Quick Deployment

For a quick automated deployment, use the deployment script:

```bash
# Clone the repository
git clone https://github.com/mattstegner/SpectraBox.git /home/pi/pi-audio-kiosk
cd /home/pi/pi-audio-kiosk

# Run the deployment script
./scripts/deploy-pi.sh
```

This script will:
- Install Node.js and dependencies
- Set up the systemd service
- Configure SSL certificates
- Start the application

## Manual Deployment

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

Install audio dependencies:
```bash
sudo apt install -y alsa-utils pulseaudio pulseaudio-utils
```

### Step 2: Application Setup

Clone and set up the application:
```bash
git clone https://github.com/mattstegner/SpectraBox.git /home/pi/pi-audio-kiosk
cd /home/pi/pi-audio-kiosk
npm ci --only=production
```

Generate SSL certificates (recommended):
```bash
node generate-ssl.js
```

### Step 3: Service Configuration

Copy the systemd service file:
```bash
sudo cp pi-audio-kiosk.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable pi-audio-kiosk
```

Start the service:
```bash
sudo systemctl start pi-audio-kiosk
```

### Step 4: Kiosk Mode Setup (Optional)

For full kiosk mode with auto-starting browser:
```bash
./scripts/setup-kiosk.sh
```

## Configuration

### Environment Variables

The application supports these environment variables:

- `NODE_ENV`: Set to `production` for production deployment
- `PORT`: Server port (default: 3000)
- `HOST`: Server host (default: 0.0.0.0)
- `LOG_LEVEL`: Logging level (debug, info, warn, error)
- `NODE_OPTIONS`: Node.js options (default: --max-old-space-size=256)

### Systemd Service Configuration

The service file includes optimizations for Raspberry Pi:

- Memory limit: 512MB
- CPU quota: 80%
- Automatic restart on failure
- Proper signal handling for graceful shutdown

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
sudo systemctl status pi-audio-kiosk
```

View logs:
```bash
sudo journalctl -u pi-audio-kiosk -f
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

## Troubleshooting

### Common Issues

**Service won't start:**
```bash
# Check service status
sudo systemctl status pi-audio-kiosk

# Check logs
sudo journalctl -u pi-audio-kiosk -n 50
```

**High memory usage:**
- Monitor with: `http://your-pi-ip:3000/api/metrics`
- Adjust `NODE_OPTIONS` in service file if needed

**Audio devices not detected:**
```bash
# Test audio system
arecord -l
pactl list sources short

# Check permissions
groups $USER
```

**Browser won't start in kiosk mode:**
```bash
# Check if X11 is running
echo $DISPLAY

# Test browser manually
chromium-browser --version
```

### Log Locations

- **Application logs**: `sudo journalctl -u pi-audio-kiosk`
- **System logs**: `/var/log/syslog`
- **Browser logs**: Check systemd journal for display service

### Performance Issues

If experiencing performance issues:

1. Check memory usage: `free -h`
2. Check CPU temperature: `vcgencmd measure_temp`
3. Monitor disk usage: `df -h`
4. Review performance metrics: `http://your-pi-ip:3000/api/metrics`

## Security Considerations

### Network Security

- The application binds to `0.0.0.0` for network access
- Consider using a firewall to restrict access
- HTTPS is recommended for production use

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
- `/home/pi/pi-audio-kiosk/` (entire application directory)
- `/etc/systemd/system/pi-audio-kiosk.service`
- User preferences (stored in application directory)

### Recovery

To restore from backup:
1. Copy application files to `/home/pi/pi-audio-kiosk/`
2. Install dependencies: `npm ci --only=production`
3. Copy service file and reload systemd
4. Start the service

## Updates

### Application Updates

```bash
cd /home/pi/pi-audio-kiosk
git pull origin main
npm ci --only=production
sudo systemctl restart pi-audio-kiosk
```

### System Updates

```bash
sudo apt update && sudo apt upgrade -y
sudo reboot
```

## Support

For issues and support:

1. Check the logs: `sudo journalctl -u pi-audio-kiosk -f`
2. Verify system requirements
3. Test audio devices: `arecord -l`
4. Check network connectivity
5. Review performance metrics

## Performance Benchmarks

Typical performance on Raspberry Pi 4 (2GB):

- **Memory usage**: 50-100MB
- **CPU usage**: 5-15% idle, 20-40% active
- **Response time**: <100ms for API calls
- **Startup time**: 10-15 seconds

Lower-end Pi models may have reduced performance but should still function adequately for the intended use case.