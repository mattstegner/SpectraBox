#!/usr/bin/env node

/**
 * SpectraBox - Startup Script
 * This script handles the startup sequence for the kiosk application
 */

const { spawn } = require('child_process');
const { logger } = require('./utils/logger');
const PlatformDetection = require('./utils/platformDetection');
const { PreferencesService } = require('./services/preferencesService');

// Configuration
const config = {
  server: {
    script: 'server.js',
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0'
  },
  browser: {
    url: `https://localhost:${process.env.PORT || 3000}`, // Use HTTPS for microphone permissions
    chromiumArgs: [
      '--kiosk',
      '--password-store=basic',  // Prevent keyring dialogs on Linux
      '--no-first-run',
      '--disable-infobars',
      '--disable-session-crashed-bubble',
      '--disable-translate',
      '--disable-features=TranslateUI',
      '--autoplay-policy=no-user-gesture-required',
      '--allow-running-insecure-content',
      '--user-data-dir=' + (process.env.HOME || '/home/pi') + '/.config/spectrabox-chrome',
      '--start-fullscreen',
      '--no-default-browser-check',
      '--disable-default-apps',
      '--disable-extensions',
      '--ignore-certificate-errors', // For self-signed certificates
      '--ignore-ssl-errors',
      '--ignore-certificate-errors-spki-list',
      '--use-fake-device-for-media-stream=false', // Enable real microphone access
      '--enable-features=HardwareMediaKeyHandling',
      '--no-sandbox', // Required for some Pi configurations
      '--disable-dev-shm-usage', // Overcome limited resource problems
      '--disable-gpu-sandbox', // GPU sandbox can cause issues on Pi
      '--hide-scrollbars', // Hide all scroll bars
      '--disable-scroll-bounce', // Disable scroll bounce effects
      '--disable-features=OverscrollHistoryNavigation', // Disable overscroll navigation
      '--overscroll-history-navigation=0', // Disable overscroll history navigation
      '--disable-pinch', // Disable pinch zoom which can cause scroll bars
      '--disable-smooth-scrolling', // Disable smooth scrolling
      '--force-device-scale-factor=1' // Force scale factor to prevent zoom-related scroll bars
    ]
  },
  delays: {
    serverStart: 5000, // Wait 5 seconds for server to start
    browserStart: 2000 // Wait 2 seconds before starting browser
  }
};

class KioskLauncher {
  constructor() {
    this.serverProcess = null;
    this.browserProcess = null;
    this.isShuttingDown = false;
    this.preferencesService = new PreferencesService();
    this.serverConfig = null;
  }

  /**
   * Start the kiosk application
   */
  async start() {
    try {
      logger.info('🚀 Starting SpectraBox...');
      logger.info(`Platform: ${PlatformDetection.getCurrentPlatform()}`);
      logger.info(`Raspberry Pi: ${PlatformDetection.isRaspberryPi()}`);

      // Load server configuration from preferences
      await this.loadServerConfiguration();

      // Set up signal handlers for graceful shutdown
      this.setupSignalHandlers();

      // Start the server
      await this.startServer();

      // Wait for server to be ready
      await this.waitForServer();

      // Start the browser in kiosk mode
      const shouldStartBrowser = PlatformDetection.isRaspberryPi() || 
                                process.env.NODE_ENV === 'development' || 
                                process.env.KIOSK_BROWSER === 'true';
      
      if (shouldStartBrowser && (process.env.DISPLAY || process.platform === 'darwin')) {
        await this.startBrowser();
      } else {
        logger.info('Browser kiosk mode skipped (not on Raspberry Pi or no display)');
        logger.info(`Local access: http://localhost:${config.server.port}`);
        if (this.serverConfig.networkAccessible) {
          logger.info(`Network access: http://<your-ip>:${config.server.port}`);
          logger.info('Server is accessible from other devices on the network');
        }
      }

      logger.info('✅ SpectraBox started successfully');

    } catch (error) {
      logger.error('❌ Failed to start SpectraBox', error);
      await this.shutdown();
      process.exit(1);
    }
  }

  /**
   * Load server configuration from preferences
   */
  async loadServerConfiguration() {
    try {
      const preferences = await this.preferencesService.getPreferences();
      
      // Update config with preferences
      if (preferences.systemSettings) {
        config.server.port = preferences.systemSettings.port || config.server.port;
        config.server.host = preferences.systemSettings.host || config.server.host;
      }
      
      // Update browser URL with configured port
      config.browser.url = `https://localhost:${config.server.port}`;
      
      this.serverConfig = {
        host: config.server.host,
        port: config.server.port,
        networkAccessible: config.server.host === '0.0.0.0'
      };
      
      logger.info('Server configuration loaded from preferences', this.serverConfig);
      
    } catch (error) {
      logger.warn('Could not load preferences for server configuration, using defaults', {
        error: error.message,
        defaultHost: config.server.host,
        defaultPort: config.server.port
      });
      
      this.serverConfig = {
        host: config.server.host,
        port: config.server.port,
        networkAccessible: config.server.host === '0.0.0.0'
      };
    }
  }

  /**
   * Start the Node.js server
   */
  async startServer() {
    return new Promise((resolve, reject) => {
      logger.info('Starting server...');

      this.serverProcess = spawn('node', [config.server.script], {
        stdio: ['inherit', 'inherit', 'inherit'],
        env: {
          ...process.env,
          // Don't override NODE_ENV if it's already set
          NODE_ENV: process.env.NODE_ENV || 'production',
          PORT: config.server.port,
          HOST: config.server.host
        }
      });

      this.serverProcess.on('error', (error) => {
        logger.error('Server process error', error);
        reject(error);
      });

      this.serverProcess.on('exit', (code, signal) => {
        if (!this.isShuttingDown) {
          logger.error('Server process exited unexpectedly', { code, signal });
          this.shutdown();
        }
      });

      // Give the server time to start
      setTimeout(() => {
        if (this.serverProcess && !this.serverProcess.killed) {
          logger.info('Server started successfully');
          resolve();
        } else {
          reject(new Error('Server failed to start'));
        }
      }, config.delays.serverStart);
    });
  }

  /**
   * Wait for server to be ready by checking health endpoint
   */
  async waitForServer() {
    const maxAttempts = 10;
    const delay = 1000;
    const https = require('https');
    const http = require('http');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Try HTTPS first, then fall back to HTTP
        const healthCheckResult = await this.checkHealth();
        if (healthCheckResult) {
          logger.info('Server health check passed');
          return;
        }
      } catch (error) {
        logger.debug(`Health check attempt ${attempt} failed:`, error.message);
      }

      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('Server failed health check after maximum attempts');
  }

  /**
   * Check server health using native HTTP modules
   */
  async checkHealth() {
    const https = require('https');
    const http = require('http');

    // Try HTTPS first
    try {
      const result = await this.makeHealthRequest(https, `https://localhost:${config.server.port}/api/health`);
      if (result) return true;
    } catch (httpsError) {
      logger.debug('HTTPS health check failed, trying HTTP');
    }

    // Fall back to HTTP
    try {
      const result = await this.makeHealthRequest(http, `http://localhost:${config.server.port}/api/health`);
      return result;
    } catch (httpError) {
      logger.debug('HTTP health check failed');
      return false;
    }
  }

  /**
   * Make health check request
   */
  async makeHealthRequest(httpModule, url) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'GET',
        timeout: 2000,
        rejectUnauthorized: false // Accept self-signed certificates
      };

      const req = httpModule.request(options, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          reject(new Error(`Health check returned status ${res.statusCode}`));
        }
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Health check timeout'));
      });

      req.end();
    });
  }

  /**
   * Start the browser in kiosk mode
   */
  async startBrowser() {
    return new Promise((resolve, reject) => {
      logger.info('Starting browser in kiosk mode...');

      // Wait a bit before starting browser
      setTimeout(() => {
        const browserCommand = this.getBrowserCommand();
        
        // Try HTTPS first, fall back to HTTP
        let browserUrl = `https://localhost:${config.server.port}`;
        
        // If we know HTTPS isn't available, use HTTP directly
        if (process.env.FORCE_HTTP === 'true') {
          browserUrl = `http://localhost:${config.server.port}`;
        }
        
        const browserArgs = [...config.browser.chromiumArgs, browserUrl];

        this.browserProcess = spawn(browserCommand, browserArgs, {
          stdio: ['ignore', 'ignore', 'inherit'],
          env: {
            ...process.env,
            DISPLAY: process.env.DISPLAY || ':0'
          }
        });

        this.browserProcess.on('error', (error) => {
          logger.error('Browser process error', error);
          // Don't reject - browser is optional
          resolve();
        });

        this.browserProcess.on('exit', (code, signal) => {
          if (!this.isShuttingDown) {
            logger.warn('Browser process exited', { code, signal });
            // Restart browser after delay
            setTimeout(() => {
              if (!this.isShuttingDown) {
                this.startBrowser();
              }
            }, 5000);
          }
        });

        logger.info('Browser started in kiosk mode');
        resolve();

      }, config.delays.browserStart);
    });
  }

  /**
   * Get the appropriate browser command for the platform
   */
  getBrowserCommand() {
    // Platform-specific browser commands
    const platformCommands = {
      darwin: [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        'google-chrome',
        'chromium'
      ],
      linux: [
        'chromium-browser',
        'chromium',
        'google-chrome',
        'google-chrome-stable'
      ],
      win32: [
        'chrome',
        'chromium'
      ]
    };

    const commands = platformCommands[process.platform] || platformCommands.linux;

    // Try to find an available browser command
    for (const cmd of commands) {
      try {
        if (cmd.startsWith('/')) {
          // Absolute path - check if file exists
          require('fs').accessSync(cmd, require('fs').constants.F_OK);
          return cmd;
        } else {
          // Command in PATH - check with which/where
          const checkCmd = process.platform === 'win32' ? 'where' : 'which';
          require('child_process').execSync(`${checkCmd} ${cmd}`, { stdio: 'ignore' });
          return cmd;
        }
      } catch (error) {
        // Command not found, try next
      }
    }

    // Default fallback based on platform
    if (process.platform === 'darwin') {
      return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    }
    return 'chromium-browser';
  }

  /**
   * Set up signal handlers for graceful shutdown
   */
  setupSignalHandlers() {
    const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'];

    signals.forEach(signal => {
      process.on(signal, () => {
        logger.info(`${signal} received, shutting down gracefully...`);
        this.shutdown();
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', error);
      this.shutdown();
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection', { reason });
      this.shutdown();
    });
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logger.info('Shutting down SpectraBox...');

    // Close browser first
    if (this.browserProcess && !this.browserProcess.killed) {
      logger.info('Closing browser...');
      this.browserProcess.kill('SIGTERM');
      
      // Force kill after timeout
      setTimeout(() => {
        if (!this.browserProcess.killed) {
          this.browserProcess.kill('SIGKILL');
        }
      }, 5000);
    }

    // Close server
    if (this.serverProcess && !this.serverProcess.killed) {
      logger.info('Stopping server...');
      this.serverProcess.kill('SIGTERM');
      
      // Force kill after timeout
      setTimeout(() => {
        if (!this.serverProcess.killed) {
          this.serverProcess.kill('SIGKILL');
        }
      }, 10000);
    }

    // Wait a bit for processes to close
    setTimeout(() => {
      logger.info('Shutdown complete');
      process.exit(0);
    }, 2000);
  }
}

// Start the kiosk if this script is run directly
if (require.main === module) {
  const launcher = new KioskLauncher();
  launcher.start().catch((error) => {
    logger.error('Failed to start kiosk', error);
    process.exit(1);
  });
}

module.exports = KioskLauncher;