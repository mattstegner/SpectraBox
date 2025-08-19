const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');
const ConfigManager = require('./configManager');

/**
 * Version Manager Utility
 * 
 * Handles reading and managing application version information
 */
class VersionManager {
  constructor() {
    this.configManager = new ConfigManager();
    this.versionFilePath = path.join(__dirname, '..', 'Version.txt');
    this.cachedVersion = null;
    this.lastReadTime = null;
    this.cacheTimeout = 60000; // Cache for 1 minute
    this.configLoaded = false;
  }

  /**
   * Load configuration and update version manager settings
   */
  async loadConfiguration() {
    try {
      const config = await this.configManager.loadConfig();
      
      // Update version file path from configuration
      if (config.version && config.version.filePath) {
        // Resolve relative paths from application root
        if (config.version.filePath.startsWith('./')) {
          this.versionFilePath = path.join(__dirname, '..', config.version.filePath.substring(2));
        } else if (!path.isAbsolute(config.version.filePath)) {
          this.versionFilePath = path.join(__dirname, '..', config.version.filePath);
        } else {
          this.versionFilePath = config.version.filePath;
        }
      }
      
      this.configLoaded = true;
      logger.debug('Version manager configuration loaded', {
        versionFilePath: this.versionFilePath
      });
    } catch (error) {
      logger.error('Error loading version manager configuration', { error: error.message });
      // Continue with defaults
      this.configLoaded = true;
    }
  }

  /**
   * Ensure configuration is loaded before operations
   */
  async ensureConfigLoaded() {
    if (!this.configLoaded) {
      await this.loadConfiguration();
    }
  }

  /**
   * Read the current version from Version.txt file with enhanced security validation
   * @returns {Promise<string>} Version string or 'unknown' if file missing/corrupted
   */
  async getCurrentVersion() {
    try {
      await this.ensureConfigLoaded();
      
      // Check if we have a valid cached version
      if (this.cachedVersion && this.lastReadTime && 
          (Date.now() - this.lastReadTime) < this.cacheTimeout) {
        return this.cachedVersion;
      }

      // Security: Validate file path to prevent path traversal (skip in test environment)
      if (process.env.NODE_ENV !== 'test') {
        const resolvedPath = path.resolve(this.versionFilePath);
        const expectedPath = path.resolve(path.join(__dirname, '..', 'Version.txt'));
        
        if (resolvedPath !== expectedPath) {
          logger.error('Version file path validation failed', { 
            resolved: resolvedPath,
            expected: expectedPath 
          });
          return 'unknown';
        }
      }

      // Security: Check file size before reading
      const stats = await fs.promises.stat(this.versionFilePath);
      const maxFileSize = 1024; // 1KB max for version file
      
      if (stats.size > maxFileSize) {
        logger.warn('Version file is too large', { 
          size: stats.size,
          maxSize: maxFileSize 
        });
        return 'unknown';
      }
      
      if (stats.size === 0) {
        logger.warn('Version file is empty');
        return 'unknown';
      }

      // Read version from file
      const versionData = await fs.promises.readFile(this.versionFilePath, 'utf8');
      const version = versionData.trim();

      // Enhanced validation
      const validation = this.validateVersionString(version);
      if (!validation.valid) {
        logger.warn('Version file contains invalid version string', { 
          version: version.substring(0, 50), // Limit logged version length
          error: validation.error 
        });
        return 'unknown';
      }

      // Cache the version
      this.cachedVersion = version;
      this.lastReadTime = Date.now();

      logger.debug(`Version read from file: ${version}`);
      return version;
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn('Version.txt file not found', { path: this.versionFilePath });
        return 'unknown';
      } else if (error.code === 'EACCES') {
        logger.error('Permission denied reading Version.txt', { 
          path: this.versionFilePath,
          error: error.message 
        });
        return 'unknown';
      } else {
        logger.error('Error reading version file', { 
          path: this.versionFilePath,
          error: error.message 
        });
        return 'unknown';
      }
    }
  }

  /**
   * Update the version file with a new version with enhanced security validation
   * @param {string} newVersion - New version string to write
   * @returns {Promise<boolean>} True if successful, false otherwise
   */
  async updateVersion(newVersion) {
    try {
      await this.ensureConfigLoaded();
      
      // Enhanced input validation
      const validation = await this.validateVersionString(newVersion);
      if (!validation.valid) {
        logger.error('Invalid version string provided for update', { 
          newVersion: newVersion?.substring(0, 50), // Limit logged version length
          error: validation.error 
        });
        return false;
      }

      const cleanVersion = validation.version;
      
      // Security: Validate file path before writing (skip in test environment)
      if (process.env.NODE_ENV !== 'test') {
        const resolvedPath = path.resolve(this.versionFilePath);
        const expectedPath = path.resolve(path.join(__dirname, '..', 'Version.txt'));
        
        if (resolvedPath !== expectedPath) {
          logger.error('Version file path validation failed during update', { 
            resolved: resolvedPath,
            expected: expectedPath 
          });
          return false;
        }
      }
      
      // Security: Create backup of existing version file
      let backupCreated = false;
      try {
        if (await this.isVersionFileAvailable()) {
          const currentVersion = await fs.promises.readFile(this.versionFilePath, 'utf8');
          const backupPath = `${this.versionFilePath}.backup`;
          await fs.promises.writeFile(backupPath, currentVersion, 'utf8');
          backupCreated = true;
          logger.debug('Created version file backup', { backupPath });
        }
      } catch (backupError) {
        logger.warn('Could not create version file backup', { error: backupError.message });
      }
      
      // Write to file with atomic operation
      const tempPath = `${this.versionFilePath}.tmp`;
      await fs.promises.writeFile(tempPath, cleanVersion, 'utf8');
      await fs.promises.rename(tempPath, this.versionFilePath);
      
      // Update cache
      this.cachedVersion = cleanVersion;
      this.lastReadTime = Date.now();
      
      logger.info(`Version updated to: ${cleanVersion}`, { backupCreated });
      return true;
    } catch (error) {
      logger.error('Error updating version file', { 
        path: this.versionFilePath,
        newVersion: newVersion?.substring(0, 50), // Limit logged version length
        error: error.message 
      });
      return false;
    }
  }

  /**
   * Check if version file exists and is readable
   * @returns {Promise<boolean>} True if file exists and is readable
   */
  async isVersionFileAvailable() {
    try {
      await fs.promises.access(this.versionFilePath, fs.constants.R_OK);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get version file path
   * @returns {string} Path to version file
   */
  getVersionFilePath() {
    return this.versionFilePath;
  }

  /**
   * Clear version cache (useful for testing)
   */
  clearCache() {
    this.cachedVersion = null;
    this.lastReadTime = null;
  }

  /**
   * Validate version string format with enhanced security checks
   * @param {string} version - Version string to validate
   * @returns {Promise<object>} Validation result with valid flag, cleaned version, and error message
   */
  async validateVersionString(version) {
    await this.ensureConfigLoaded();
    
    if (!version || typeof version !== 'string') {
      return { valid: false, error: 'Version must be a non-empty string' };
    }

    const trimmed = version.trim();
    
    // Get security configuration
    const config = await this.configManager.loadConfig();
    const securityConfig = config.security || {};
    const maxLength = securityConfig.maxVersionLength || 50;
    const validateStrings = securityConfig.validateVersionStrings !== false;
    
    // Check length
    if (trimmed.length === 0 || trimmed.length > maxLength) {
      return { valid: false, error: `Version string length must be between 1 and ${maxLength} characters` };
    }
    
    // Skip validation if disabled in configuration
    if (!validateStrings) {
      return { valid: true, version: trimmed };
    }
    
    // Security: Check for dangerous characters
    const dangerousChars = /[<>"'&;|`$(){}[\]\\]/;
    if (dangerousChars.test(trimmed)) {
      return { valid: false, error: 'Version string contains invalid characters' };
    }
    
    // Security: Check for path traversal attempts
    if (trimmed.includes('..') || trimmed.includes('/')) {
      return { valid: false, error: 'Version string contains path traversal characters' };
    }
    
    // Security: Check for control characters
    const controlChars = /[\x00-\x1f\x7f-\x9f]/;
    if (controlChars.test(trimmed)) {
      return { valid: false, error: 'Version string contains control characters' };
    }
    
    // Use configured patterns or defaults
    const versionPatterns = securityConfig.allowedVersionPatterns || [
      '^\\d+\\.\\d+\\.\\d+(-[a-zA-Z0-9.-]+)?$', // Semantic versioning
      '^v?\\d+\\.\\d+(\\.\\d+)?$', // Simple version numbers
      '^[a-f0-9]{7,40}$', // Git commit hashes
      '^\\d{4}\\.\\d{2}\\.\\d{2}$', // Date-based versions
      '^[a-zA-Z0-9.-]+$' // Generic alphanumeric with dots and dashes
    ];

    const isValidFormat = versionPatterns.some(pattern => {
      try {
        const regex = new RegExp(pattern);
        return regex.test(trimmed);
      } catch (error) {
        logger.warn('Invalid regex pattern in configuration', { pattern });
        return false;
      }
    });
    
    if (!isValidFormat) {
      return { valid: false, error: 'Version string format is not recognized' };
    }
    
    return { valid: true, version: trimmed };
  }

  /**
   * Legacy method for backward compatibility
   * @param {string} version - Version string to validate
   * @returns {Promise<boolean>} True if version format is valid
   */
  async isValidVersionFormat(version) {
    const validation = await this.validateVersionString(version);
    return validation.valid;
  }
}

module.exports = VersionManager;