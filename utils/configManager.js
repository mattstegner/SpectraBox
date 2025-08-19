const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');

/**
 * Configuration Manager
 * 
 * Handles loading and validating configuration for the SpectraBox application
 */
class ConfigManager {
  constructor() {
    this.configPath = path.join(__dirname, '..', 'config', 'update-config.json');
    this.config = null;
    this.lastLoadTime = null;
    this.cacheTimeout = 60000; // Cache config for 1 minute
  }

  /**
   * Load configuration from file with validation
   * @returns {Promise<object>} Configuration object
   */
  async loadConfig() {
    try {
      // Check if we have a valid cached config
      if (this.config && this.lastLoadTime && 
          (Date.now() - this.lastLoadTime) < this.cacheTimeout) {
        return this.config;
      }

      // Check if config file exists
      if (!fs.existsSync(this.configPath)) {
        logger.warn('Configuration file not found, using defaults', { 
          path: this.configPath 
        });
        return this.getDefaultConfig();
      }

      // Read and parse config file
      const configData = await fs.promises.readFile(this.configPath, 'utf8');
      const parsedConfig = JSON.parse(configData);

      // Validate configuration
      const validatedConfig = this.validateConfig(parsedConfig);
      
      // Cache the config
      this.config = validatedConfig;
      this.lastLoadTime = Date.now();

      logger.debug('Configuration loaded successfully', { 
        path: this.configPath,
        github: {
          owner: validatedConfig.github.owner,
          repository: validatedConfig.github.repository
        },
        updateEnabled: validatedConfig.update.enabled
      });

      return validatedConfig;
    } catch (error) {
      logger.error('Error loading configuration, using defaults', { 
        error: error.message,
        path: this.configPath 
      });
      return this.getDefaultConfig();
    }
  }

  /**
   * Get default configuration
   * @returns {object} Default configuration object
   */
  getDefaultConfig() {
    return {
      github: {
        owner: 'mattstegner',
        repository: 'SpectraBox',
        apiUrl: 'https://api.github.com',
        rateLimitCacheTimeout: 300000
      },
      update: {
        enabled: true,
        checkInterval: 3600000,
        autoUpdate: false,
        updateScript: './scripts/spectrabox-kiosk-install.sh',
        backupBeforeUpdate: true,
        maxUpdateAttempts: 3,
        updateTimeout: 600000
      },
      version: {
        filePath: './Version.txt',
        format: 'semantic',
        fallbackValue: 'unknown'
      },
      security: {
        validateVersionStrings: true,
        maxVersionLength: 50,
        allowedVersionPatterns: [
          '^\\d+\\.\\d+\\.\\d+(-[a-zA-Z0-9.-]+)?$',
          '^v?\\d+\\.\\d+(\\.\\d+)?$',
          '^[a-f0-9]{7,40}$',
          '^\\d{4}\\.\\d{2}\\.\\d{2}$',
          '^[a-zA-Z0-9.-]+$'
        ]
      }
    };
  }

  /**
   * Validate configuration object
   * @param {object} config - Configuration to validate
   * @returns {object} Validated configuration with defaults filled in
   */
  validateConfig(config) {
    const defaultConfig = this.getDefaultConfig();
    const validatedConfig = JSON.parse(JSON.stringify(defaultConfig)); // Deep clone

    try {
      // Validate GitHub configuration
      if (config.github && typeof config.github === 'object') {
        if (typeof config.github.owner === 'string' && config.github.owner.trim()) {
          validatedConfig.github.owner = config.github.owner.trim();
        }
        if (typeof config.github.repository === 'string' && config.github.repository.trim()) {
          validatedConfig.github.repository = config.github.repository.trim();
        }
        if (typeof config.github.apiUrl === 'string' && this.isValidUrl(config.github.apiUrl)) {
          validatedConfig.github.apiUrl = config.github.apiUrl;
        }
        if (typeof config.github.rateLimitCacheTimeout === 'number' && 
            config.github.rateLimitCacheTimeout > 0) {
          validatedConfig.github.rateLimitCacheTimeout = config.github.rateLimitCacheTimeout;
        }
      }

      // Validate update configuration
      if (config.update && typeof config.update === 'object') {
        if (typeof config.update.enabled === 'boolean') {
          validatedConfig.update.enabled = config.update.enabled;
        }
        if (typeof config.update.checkInterval === 'number' && 
            config.update.checkInterval >= 60000) { // Minimum 1 minute
          validatedConfig.update.checkInterval = config.update.checkInterval;
        }
        if (typeof config.update.autoUpdate === 'boolean') {
          validatedConfig.update.autoUpdate = config.update.autoUpdate;
        }
        if (typeof config.update.updateScript === 'string' && config.update.updateScript.trim()) {
          validatedConfig.update.updateScript = config.update.updateScript.trim();
        }
        if (typeof config.update.backupBeforeUpdate === 'boolean') {
          validatedConfig.update.backupBeforeUpdate = config.update.backupBeforeUpdate;
        }
        if (typeof config.update.maxUpdateAttempts === 'number' && 
            config.update.maxUpdateAttempts > 0 && config.update.maxUpdateAttempts <= 10) {
          validatedConfig.update.maxUpdateAttempts = config.update.maxUpdateAttempts;
        }
        if (typeof config.update.updateTimeout === 'number' && 
            config.update.updateTimeout >= 60000) { // Minimum 1 minute
          validatedConfig.update.updateTimeout = config.update.updateTimeout;
        }
      }

      // Validate version configuration
      if (config.version && typeof config.version === 'object') {
        if (typeof config.version.filePath === 'string' && config.version.filePath.trim()) {
          validatedConfig.version.filePath = config.version.filePath.trim();
        }
        if (typeof config.version.format === 'string' && 
            ['semantic', 'commit', 'date', 'custom'].includes(config.version.format)) {
          validatedConfig.version.format = config.version.format;
        }
        if (typeof config.version.fallbackValue === 'string') {
          validatedConfig.version.fallbackValue = config.version.fallbackValue;
        }
      }

      // Validate security configuration
      if (config.security && typeof config.security === 'object') {
        if (typeof config.security.validateVersionStrings === 'boolean') {
          validatedConfig.security.validateVersionStrings = config.security.validateVersionStrings;
        }
        if (typeof config.security.maxVersionLength === 'number' && 
            config.security.maxVersionLength > 0 && config.security.maxVersionLength <= 100) {
          validatedConfig.security.maxVersionLength = config.security.maxVersionLength;
        }
        if (Array.isArray(config.security.allowedVersionPatterns)) {
          const validPatterns = config.security.allowedVersionPatterns.filter(pattern => {
            try {
              new RegExp(pattern);
              return typeof pattern === 'string' && pattern.length > 0;
            } catch (error) {
              logger.warn('Invalid regex pattern in configuration', { pattern });
              return false;
            }
          });
          if (validPatterns.length > 0) {
            validatedConfig.security.allowedVersionPatterns = validPatterns;
          }
        }
      }

      return validatedConfig;
    } catch (error) {
      logger.error('Error validating configuration, using defaults', { error: error.message });
      return defaultConfig;
    }
  }

  /**
   * Validate URL format
   * @param {string} url - URL to validate
   * @returns {boolean} True if valid URL
   */
  isValidUrl(url) {
    try {
      const urlObj = new URL(url);
      return ['http:', 'https:'].includes(urlObj.protocol);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get specific configuration section
   * @param {string} section - Configuration section name
   * @returns {Promise<object>} Configuration section
   */
  async getConfig(section) {
    const config = await this.loadConfig();
    return section ? config[section] : config;
  }

  /**
   * Update configuration file
   * @param {object} newConfig - New configuration to save
   * @returns {Promise<boolean>} True if successful
   */
  async updateConfig(newConfig) {
    try {
      // Validate the new configuration
      const validatedConfig = this.validateConfig(newConfig);
      
      // Ensure config directory exists
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        await fs.promises.mkdir(configDir, { recursive: true });
      }

      // Write configuration to file
      await fs.promises.writeFile(
        this.configPath, 
        JSON.stringify(validatedConfig, null, 2), 
        'utf8'
      );

      // Update cache
      this.config = validatedConfig;
      this.lastLoadTime = Date.now();

      logger.info('Configuration updated successfully', { path: this.configPath });
      return true;
    } catch (error) {
      logger.error('Error updating configuration', { 
        error: error.message,
        path: this.configPath 
      });
      return false;
    }
  }

  /**
   * Clear configuration cache
   */
  clearCache() {
    this.config = null;
    this.lastLoadTime = null;
    logger.debug('Configuration cache cleared');
  }

  /**
   * Get configuration file path
   * @returns {string} Path to configuration file
   */
  getConfigPath() {
    return this.configPath;
  }
}

module.exports = ConfigManager;