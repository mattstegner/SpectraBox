const os = require('os');
const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');

// Create module-specific logger
const platformLogger = logger.child('PlatformDetection');

/**
 * Platform detection utilities for cross-platform compatibility
 * Handles OS detection, platform-specific paths, and Raspberry Pi identification
 */
class PlatformDetection {
  /**
   * Get the current operating system platform
   * @returns {string} Platform identifier ('darwin', 'linux', 'win32', etc.)
   */
  static getCurrentPlatform() {
    return os.platform();
  }

  /**
   * Check if the current platform is macOS
   * @returns {boolean} True if running on macOS
   */
  static isMacOS() {
    return this.getCurrentPlatform() === 'darwin';
  }

  /**
   * Check if the current platform is Linux
   * @returns {boolean} True if running on Linux
   */
  static isLinux() {
    return this.getCurrentPlatform() === 'linux';
  }

  /**
   * Check if the current platform is Windows
   * @returns {boolean} True if running on Windows
   */
  static isWindows() {
    return this.getCurrentPlatform() === 'win32';
  }

  /**
   * Detect if running on a Raspberry Pi by checking /proc/cpuinfo
   * @returns {boolean} True if running on Raspberry Pi
   */
  static isRaspberryPi() {
    if (!this.isLinux()) {
      platformLogger.debug('Not running on Linux, cannot be a Raspberry Pi');
      return false;
    }

    try {
      platformLogger.debug('Checking /proc/cpuinfo for Raspberry Pi identifiers');
      const cpuInfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
      
      // Check for Raspberry Pi specific hardware identifiers
      const isRaspberryPi = cpuInfo.includes('Raspberry Pi') || 
                           cpuInfo.includes('BCM2') || 
                           cpuInfo.includes('ARM');
      
      platformLogger.debug(`Raspberry Pi detection result: ${isRaspberryPi}`);
      return isRaspberryPi;
    } catch (error) {
      // If we can't read /proc/cpuinfo, assume not a Raspberry Pi
      platformLogger.warn('Failed to read /proc/cpuinfo for Raspberry Pi detection', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get platform-specific configuration directory path
   * @returns {string} Configuration directory path
   */
  static getConfigPath() {
    const platform = this.getCurrentPlatform();
    const homeDir = os.homedir();

    switch (platform) {
    case 'darwin':
      return path.join(homeDir, 'Library', 'Application Support', 'spectrabox');
    case 'linux':
      return path.join(homeDir, '.config', 'spectrabox');
    case 'win32':
      return path.join(homeDir, 'AppData', 'Roaming', 'spectrabox');
    default:
      return path.join(homeDir, '.spectrabox');
    }
  }

  /**
   * Get platform-specific preferences file path
   * @returns {string} Full path to preferences file
   */
  static getPreferencesPath() {
    return path.join(this.getConfigPath(), 'preferences.json');
  }

  /**
   * Get platform-specific audio device strategy identifier
   * Used to determine which audio enumeration method to use
   * @returns {string} Strategy identifier ('macos', 'linux', 'windows', 'fallback')
   */
  static getAudioDeviceStrategy() {
    if (this.isMacOS()) {
      return 'macos';
    } else if (this.isLinux()) {
      return 'linux';
    } else if (this.isWindows()) {
      return 'windows';
    } else {
      return 'fallback';
    }
  }

  /**
   * Get system information summary
   * @returns {object} System information object
   */
  static getSystemInfo() {
    return {
      platform: this.getCurrentPlatform(),
      arch: os.arch(),
      release: os.release(),
      hostname: os.hostname(),
      isRaspberryPi: this.isRaspberryPi(),
      audioStrategy: this.getAudioDeviceStrategy(),
      configPath: this.getConfigPath(),
      nodeVersion: process.version
    };
  }

  /**
   * Ensure configuration directory exists
   * Creates the directory if it doesn't exist
   * @returns {boolean} True if directory exists or was created successfully
   */
  static ensureConfigDirectory() {
    try {
      const configPath = this.getConfigPath();
      platformLogger.debug(`Ensuring config directory exists: ${configPath}`);
      
      if (!fs.existsSync(configPath)) {
        platformLogger.info(`Creating config directory: ${configPath}`);
        fs.mkdirSync(configPath, { recursive: true });
      }
      
      return true;
    } catch (error) {
      platformLogger.error('Failed to create config directory', {
        path: this.getConfigPath(),
        error: error.message,
        code: error.code
      });
      
      // Create a custom error with more context
      const enhancedError = new Error(`Failed to create config directory: ${error.message}`);
      enhancedError.code = error.code || 'DIR_CREATE_ERROR';
      enhancedError.originalError = error;
      enhancedError.configPath = this.getConfigPath();
      
      throw enhancedError;
    }
  }
}

module.exports = PlatformDetection;