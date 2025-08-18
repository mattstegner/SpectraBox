const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');

/**
 * Version Manager Utility
 * 
 * Handles reading and managing application version information
 */
class VersionManager {
  constructor() {
    this.versionFilePath = path.join(__dirname, '..', 'Version.txt');
    this.cachedVersion = null;
    this.lastReadTime = null;
    this.cacheTimeout = 60000; // Cache for 1 minute
  }

  /**
   * Read the current version from Version.txt file
   * @returns {Promise<string>} Version string or 'unknown' if file missing/corrupted
   */
  async getCurrentVersion() {
    try {
      // Check if we have a valid cached version
      if (this.cachedVersion && this.lastReadTime && 
          (Date.now() - this.lastReadTime) < this.cacheTimeout) {
        return this.cachedVersion;
      }

      // Read version from file
      const versionData = await fs.promises.readFile(this.versionFilePath, 'utf8');
      const version = versionData.trim();

      // Validate version format (basic validation)
      if (!version || version.length === 0) {
        logger.warn('Version.txt file is empty');
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
   * Update the version file with a new version
   * @param {string} newVersion - New version string to write
   * @returns {Promise<boolean>} True if successful, false otherwise
   */
  async updateVersion(newVersion) {
    try {
      // Validate input
      if (!newVersion || typeof newVersion !== 'string' || newVersion.trim().length === 0) {
        logger.error('Invalid version string provided for update', { newVersion });
        return false;
      }

      const cleanVersion = newVersion.trim();
      
      // Write to file
      await fs.promises.writeFile(this.versionFilePath, cleanVersion, 'utf8');
      
      // Update cache
      this.cachedVersion = cleanVersion;
      this.lastReadTime = Date.now();
      
      logger.info(`Version updated to: ${cleanVersion}`);
      return true;
    } catch (error) {
      logger.error('Error updating version file', { 
        path: this.versionFilePath,
        newVersion,
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
   * Validate version string format
   * @param {string} version - Version string to validate
   * @returns {boolean} True if version format is valid
   */
  isValidVersionFormat(version) {
    if (!version || typeof version !== 'string') {
      return false;
    }

    const trimmed = version.trim();
    
    // Allow various version formats:
    // - Semantic versioning (1.0.0, 1.2.3-beta)
    // - Git commit hashes (7-40 characters)
    // - Simple version numbers (1.0, v1.0)
    // - Date-based versions (2024.01.15)
    const versionPatterns = [
      /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/, // Semantic versioning
      /^v?\d+\.\d+(\.\d+)?$/, // Simple version numbers
      /^[a-f0-9]{7,40}$/, // Git commit hashes
      /^\d{4}\.\d{2}\.\d{2}$/, // Date-based versions
      /^[a-zA-Z0-9.-]+$/ // Generic alphanumeric with dots and dashes
    ];

    return versionPatterns.some(pattern => pattern.test(trimmed)) && trimmed.length <= 50;
  }
}

module.exports = VersionManager;