# Raspberry Pi Performance Optimizations

This document outlines the performance optimizations implemented for running SpectraBox on Raspberry Pi hardware.

## Automatic Optimizations

When SpectraBox detects it's running on a Raspberry Pi, it automatically applies several optimizations:

### Server-Side Optimizations

1. **Memory Management**
   - Reduces Node.js heap size to 256MB
   - Forces garbage collection every 30 seconds
   - Monitors memory usage and warns at 200MB+

2. **Request Processing**
   - Reduces JSON payload limit to 256KB
   - Limits thread pool size to 2 threads
   - Faster connection cleanup (5s keep-alive timeout)

3. **Process Optimizations**
   - Sets higher process priority when possible
   - Reduces UV thread pool size
   - Enhanced error monitoring

### Client-Side Optimizations

1. **Frame Rate Limiting**
   - Reduces animation frame rate from 60fps to 30fps
   - Implements frame skipping for smoother performance

2. **Canvas Rendering**
   - Partial canvas clearing instead of full redraws
   - Simplified drawing operations
   - Reduced FFT size (2048 instead of 4096)

3. **UI Optimizations**
   - Disables expensive CSS animations
   - Reduces transition durations
   - Simplifies visual effects

4. **Audio Processing**
   - Slower meter updates (250ms instead of 150ms)
   - Optimized buffer sizes
   - Reduced computational complexity

## Manual Optimizations

### Starting with Pi Optimizations

Use the Pi-optimized startup script:

```bash
npm run start:pi
```

This starts the server with:
- Garbage collection exposed (`--expose-gc`)
- Memory limit set to 256MB (`--max-old-space-size=256`)

### System-Level Optimizations

1. **GPU Memory Split**
   ```bash
   sudo raspi-config
   # Advanced Options > Memory Split > Set to 64 or 128
   ```

2. **Disable Unnecessary Services**
   ```bash
   sudo systemctl disable bluetooth
   sudo systemctl disable wifi-powersave
   ```

3. **Increase Swap (if needed)**
   ```bash
   sudo dphys-swapfile swapoff
   sudo nano /etc/dphys-swapfile
   # Set CONF_SWAPSIZE=1024
   sudo dphys-swapfile setup
   sudo dphys-swapfile swapon
   ```

### Browser Optimizations

1. **Chromium Flags** (for kiosk mode)
   ```bash
   chromium-browser \
     --kiosk \
     --disable-features=VizDisplayCompositor \
     --disable-gpu-compositing \
     --disable-smooth-scrolling \
     --disable-background-timer-throttling \
     --disable-backgrounding-occluded-windows \
     --disable-renderer-backgrounding \
     --disable-features=TranslateUI \
     --disable-ipc-flooding-protection \
     --disable-background-networking \
     --disable-sync \
     --disable-default-apps \
     --no-first-run \
     --fast \
     --fast-start \
     --disable-infobars \
     --disable-session-crashed-bubble \
     --disable-translate \
     --no-default-browser-check \
     http://localhost:3000
   ```

## Performance Monitoring

### Check Pi Status

```bash
curl http://localhost:3000/api/pi-status
```

### Monitor Performance

```bash
curl http://localhost:3000/api/health
```

### Run Performance Tests

```bash
npm run test:performance
```

## Configuration

Pi-specific configuration is automatically loaded from `config/pi-config.json`. You can customize:

- Maximum frame rate
- FFT size
- Memory management settings
- UI optimization levels

## Troubleshooting

### High Memory Usage

If memory usage exceeds 200MB:

1. Check for memory leaks in logs
2. Restart the application
3. Consider reducing FFT size further
4. Disable additional features if needed

### Poor Performance

If the UI is still sluggish:

1. Reduce FFT size to 1024
2. Increase meter update interval to 500ms
3. Disable overlapping display mode
4. Use simplified rendering mode

### Audio Dropouts

If audio processing is interrupted:

1. Increase buffer size to 2048
2. Reduce sample rate to 22050 Hz
3. Use mono input instead of stereo
4. Check system load with `htop`

## Hardware Recommendations

For best performance on Raspberry Pi:

- **Minimum**: Raspberry Pi 3B+ with 1GB RAM
- **Recommended**: Raspberry Pi 4 with 4GB+ RAM
- **Storage**: Class 10 SD card or USB 3.0 drive
- **Audio**: USB audio interface for better quality
- **Cooling**: Heat sink or fan for sustained performance

## Monitoring Commands

```bash
# Check memory usage
free -h

# Check CPU usage
htop

# Check temperature
vcgencmd measure_temp

# Check GPU memory
vcgencmd get_mem gpu

# Monitor network
iftop
```