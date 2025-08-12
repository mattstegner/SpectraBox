# Pi Audio Kiosk

A spectrum analyzer and audio visualization application designed to run on Raspberry Pi and other platforms.

## Avoiding Microphone Permission Dialogs

The browser's microphone permission dialog is a security feature that appears when a website requests access to the microphone. There are several ways to avoid or minimize these prompts:

### Option 1: Use HTTPS with SSL Certificates (Recommended)

The most effective approach is to serve your application over HTTPS. Browsers can store permissions persistently for HTTPS sites but typically reset permissions for HTTP sites when the browser is closed.

1. Generate SSL certificates:

```bash
node generate-ssl.js
```

2. Start the server normally:

```bash
node server.js
```

The server will automatically detect the SSL certificates and use HTTPS.

### Option 2: Browser Command Line Flags

For development or kiosk environments, you can start Chrome/Chromium with special flags:

#### Chrome/Chromium:

```bash
# For macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --auto-accept-camera-and-microphone-capture

# For Linux
chromium-browser --auto-accept-camera-and-microphone-capture

# For Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --auto-accept-camera-and-microphone-capture
```

#### For Raspberry Pi Kiosk Mode:

Add these flags to your kiosk startup script:

```bash
chromium-browser --kiosk --auto-accept-camera-and-microphone-capture http://localhost:3000
```

### Option 3: Electron Application

For a completely standalone application without permission dialogs, consider packaging the application with Electron, which can be configured to bypass permission prompts.

## Running the Application

1. Install dependencies:

```bash
npm install
```

2. Generate SSL certificates (optional but recommended):

```bash
node generate-ssl.js
```

3. Start the server:

```bash
node server.js
```

4. Open in your browser:
   - HTTPS mode: https://localhost:3000
   - HTTP mode: http://localhost:3000

## Features

- Real-time stereo spectrum analysis
- Peak and RMS level meters
- Phase correlation meter
- Adjustable frequency range and display settings
- Multiple audio input device support
- Persistent user preferences
- Network accessibility for remote access
- Kiosk mode support for dedicated displays
- Comprehensive settings interface with tabbed organization

## Network Access

The Pi Audio Kiosk supports network accessibility, allowing you to access the spectrum analyzer from other devices on your local network.

### Network Tab

The application includes a dedicated **Network** tab in the settings panel that provides:

- **Network Status**: Shows whether the server is accessible from the network or local-only
- **Server Configuration**: Displays current host, port, and binding settings
- **Access Information**: Provides URLs for local and network access
- **Kiosk Mode Status**: Indicates if kiosk mode is enabled

### Configuration

By default, the server binds to `0.0.0.0:3000`, making it accessible from any device on your network:

- **Local access**: `http://localhost:3000`
- **Network access**: `http://<your-ip>:3000`

To find your device's IP address:

- **Linux/Raspberry Pi**: `hostname -I`
- **macOS**: `ifconfig | grep "inet "`
- **Windows**: `ipconfig`

### Security Considerations

When network access is enabled, any device on your local network can access the spectrum analyzer. For security:

- The server only accepts connections from your local network
- No authentication is required for local network access
- Consider firewall settings if needed
