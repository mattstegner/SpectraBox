#!/usr/bin/env node

/**
 * Configuration Initialization Script
 *
 * Creates default configuration files if they don't exist
 */

const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'update-config.json');

const DEFAULT_CONFIG = {
  github: {
    owner: 'mattstegner',
    repository: 'SpectraBox',
    apiUrl: 'https://api.github.com',
    rateLimitCacheTimeout: 300000,
  },
  update: {
    enabled: true,
    checkInterval: 3600000,
    autoUpdate: false,
    updateScript: './scripts/spectrabox-kiosk-install.sh',
    backupBeforeUpdate: true,
    maxUpdateAttempts: 3,
    updateTimeout: 600000,
  },
  version: {
    filePath: './Version.txt',
    format: 'semantic',
    fallbackValue: 'unknown',
  },
  security: {
    validateVersionStrings: true,
    maxVersionLength: 50,
    allowedVersionPatterns: [
      '^\\d+\\.\\d+\\.\\d+(-[a-zA-Z0-9.-]+)?$',
      '^v?\\d+\\.\\d+(\\.\\d+)?$',
      '^[a-f0-9]{7,40}$',
      '^\\d{4}\\.\\d{2}\\.\\d{2}$',
      '^[a-zA-Z0-9.-]+$',
    ],
  },
};

function initializeConfig(configDir = CONFIG_DIR, configFile = CONFIG_FILE) {
  try {
    // Create config directory if it doesn't exist
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
      console.log(`Created config directory: ${configDir}`);
    }

    // Create config file if it doesn't exist
    if (!fs.existsSync(configFile)) {
      fs.writeFileSync(configFile, JSON.stringify(DEFAULT_CONFIG, null, 2));
      console.log(`Created configuration file: ${configFile}`);
    } else {
      console.log(`Configuration file already exists: ${configFile}`);

      // Validate existing config and merge with defaults if needed
      try {
        const existingConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        const mergedConfig = mergeWithDefaults(existingConfig, DEFAULT_CONFIG);

        // Only update if there are new fields
        if (JSON.stringify(existingConfig) !== JSON.stringify(mergedConfig)) {
          fs.writeFileSync(configFile, JSON.stringify(mergedConfig, null, 2));
          console.log('Updated configuration with new default values');
        }
      } catch (error) {
        console.error(
          'Error reading existing config, creating backup and using defaults'
        );
        fs.copyFileSync(configFile, `${configFile}.backup`);
        fs.writeFileSync(configFile, JSON.stringify(DEFAULT_CONFIG, null, 2));
      }
    }

    console.log('Configuration initialization complete');
    return true;
  } catch (error) {
    console.error('Error initializing configuration:', error.message);
    return false;
  }
}

function mergeWithDefaults(existing, defaults) {
  const merged = JSON.parse(JSON.stringify(defaults)); // Deep clone defaults

  function mergeObject(target, source) {
    for (const key in source) {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key])
      ) {
        if (!target[key] || typeof target[key] !== 'object') {
          target[key] = {};
        }
        mergeObject(target[key], source[key]);
      } else if (source[key] !== undefined) {
        target[key] = source[key];
      }
    }
  }

  mergeObject(merged, existing);
  return merged;
}

// Run if called directly
if (require.main === module) {
  const success = initializeConfig();
  process.exit(success ? 0 : 1);
}

module.exports = { initializeConfig, DEFAULT_CONFIG };
