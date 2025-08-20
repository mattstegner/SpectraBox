const fs = require('fs').promises;
const path = require('path');
const PlatformDetection = require('../utils/platformDetection');
const { logger } = require('../utils/logger');

// Create service-specific logger
const serviceLogger = logger.child('PreferencesService');

/**
 * PreferencesService handles loading, saving, and validating user preferences
 * with JSON file persistence and error recovery capabilities.
 */
class PreferencesService {
  constructor() {
    this.preferencesPath = this.getPreferencesPath();
    this.preferences = null;
    this.isSaving = false;
    this.saveQueue = [];
  }

  /**
   * Get the platform-specific path for preferences file
   * @returns {string} Full path to preferences.json file
   */
  getPreferencesPath() {
    const configDir = PlatformDetection.getConfigPath();
    return path.join(configDir, 'preferences.json');
  }

  /**
   * Get default preferences schema
   * @returns {object} Default preferences object
   */
  getDefaultPreferences() {
    return {
      selectedAudioDevice: null,
      audioSettings: {
        sampleRate: 44100,
        bufferSize: 1024,
        gain: 1.0
      },
      uiSettings: {
        theme: 'dark',
        autoStart: true,
        fullscreen: false,
        // General tab settings
        general: {
          minFrequency: 20,
          maxFrequency: 20000,
          inputGain: 0.0,
          holdMode: 'latch'
        },
        // Spectrogram Interface tab settings
        spectrogramInterface: {
          clickInfoSize: 'large',
          responsiveness: 90,
          amplitudeOffset: 0.0,
          overlappingDisplay: true,
          overlapTolerance: 1.0,
          spectrogramRange: -100
        },
        // Spectrogram Drawing tab settings
        spectrogramDrawing: {
          fftSize: 4096,
          pixelAveraging: true,
          multiPixelSmoothing: 3,
          frequencyDependentSmoothing: true,
          noiseFloorSubtraction: 0,
          peakEnvelope: true
        },
        // Meters tab settings
        meters: {
          meterSpeed: 'medium',
          holdTime: 0.5,
          decibelsSpeed: 150,
          rmsWeighting: 'Z'
        },
        // Performance tab settings
        performance: {
          refreshRate: 30,  // FPS - optimized for Raspberry Pi (30), desktop can use higher values like 60
          enableVSync: false
        }
      },
      systemSettings: {
        port: 3000,
        host: '0.0.0.0'
      },
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Get UI settings validation schema
   * @returns {object} UI settings validation schema
   */
  getUISettingsSchema() {
    return {
      general: {
        minFrequency: { type: 'number', min: 20, max: 500 },
        maxFrequency: { type: 'number', min: 6000, max: 20000 },
        inputGain: { type: 'number', min: -30, max: 12 },
        holdMode: { type: 'string', enum: ['latch', 'temporary'] }
      },
      spectrogramInterface: {
        clickInfoSize: { type: 'string', enum: ['small', 'large'] },
        responsiveness: { type: 'number', min: 1, max: 100 },
        amplitudeOffset: { type: 'number', min: -15, max: 15 },
        overlappingDisplay: { type: 'boolean' },
        overlapTolerance: { type: 'number', min: 0.1, max: 2.0 },
        spectrogramRange: { type: 'number', min: -100, max: -50 }
      },
      spectrogramDrawing: {
        fftSize: { type: 'number', enum: [512, 1024, 2048, 4096, 8192, 16384, 32768] },
        pixelAveraging: { type: 'boolean' },
        multiPixelSmoothing: { type: 'number', min: 1, max: 5 },
        frequencyDependentSmoothing: { type: 'boolean' },
        noiseFloorSubtraction: { type: 'number', min: 0, max: 20 },
        peakEnvelope: { type: 'boolean' }
      },
      meters: {
        meterSpeed: { type: 'string', enum: ['slow', 'medium', 'fast'] },
        holdTime: { type: 'number', min: 0.5, max: 2.0 },
        decibelsSpeed: { type: 'number', min: 10, max: 250 },
        rmsWeighting: { type: 'string', enum: ['Z', 'A', 'C'] }
      },
      performance: {
        refreshRate: { type: 'number', min: 15, max: 60 },
        enableVSync: { type: 'boolean' }
      }
    };
  }

  /**
   * Validate a single setting value against its schema
   * @param {string} category - Setting category (general, spectrogramInterface, etc.)
   * @param {string} key - Setting key
   * @param {*} value - Value to validate
   * @returns {object} Validation result with success flag and error message
   */
  validateSettingValue(category, key, value) {
    const schema = this.getUISettingsSchema();
    
    if (!schema[category]) {
      return { success: false, error: `Unknown settings category: ${category}` };
    }
    
    if (!schema[category][key]) {
      return { success: false, error: `Unknown setting: ${category}.${key}` };
    }
    
    const rule = schema[category][key];
    
    // Type validation
    if (rule.type === 'number' && typeof value !== 'number') {
      return { success: false, error: `${category}.${key} must be a number` };
    }
    
    if (rule.type === 'string' && typeof value !== 'string') {
      return { success: false, error: `${category}.${key} must be a string` };
    }
    
    if (rule.type === 'boolean' && typeof value !== 'boolean') {
      return { success: false, error: `${category}.${key} must be a boolean` };
    }
    
    // Range validation for numbers
    if (rule.type === 'number') {
      if (rule.min !== undefined && value < rule.min) {
        return { success: false, error: `${category}.${key} must be at least ${rule.min}` };
      }
      
      if (rule.max !== undefined && value > rule.max) {
        return { success: false, error: `${category}.${key} must be at most ${rule.max}` };
      }
    }
    
    // Enum validation
    if (rule.enum && !rule.enum.includes(value)) {
      return { success: false, error: `${category}.${key} must be one of: ${rule.enum.join(', ')}` };
    }
    
    return { success: true };
  }

  /**
   * Validate UI settings structure and values
   * @param {object} uiSettings - UI settings object to validate
   * @returns {object} Validation result with success flag and detailed errors
   */
  validateUISettings(uiSettings) {
    if (!uiSettings || typeof uiSettings !== 'object') {
      return { success: false, errors: { general: 'UI settings must be an object' } };
    }

    const schema = this.getUISettingsSchema();
    const errors = {};
    let hasErrors = false;

    // Only validate categories that are present in the uiSettings
    for (const [category, categorySettings] of Object.entries(uiSettings)) {
      // Skip basic UI properties that aren't in the schema
      if (!schema[category]) {
        continue;
      }

      if (typeof categorySettings !== 'object') {
        errors[category] = `${category} settings must be an object`;
        hasErrors = true;
        continue;
      }

      const categorySchema = schema[category];

      // Validate each setting in the category that's present
      for (const [key, value] of Object.entries(categorySettings)) {
        if (!categorySchema[key]) {
          errors[`${category}.${key}`] = `Unknown setting: ${category}.${key}`;
          hasErrors = true;
          continue;
        }

        const validation = this.validateSettingValue(category, key, value);
        if (!validation.success) {
          errors[`${category}.${key}`] = validation.error;
          hasErrors = true;
        }
      }
    }

    return { success: !hasErrors, errors: hasErrors ? errors : null };
  }

  /**
   * Validate preferences data structure and values
   * @param {object} preferences - Preferences object to validate
   * @returns {boolean} True if valid, false otherwise
   */
  validatePreferences(preferences) {
    if (!preferences || typeof preferences !== 'object') {
      return false;
    }

    // Check required top-level properties
    const requiredProps = ['audioSettings', 'uiSettings', 'systemSettings'];
    for (const prop of requiredProps) {
      if (!preferences[prop] || typeof preferences[prop] !== 'object') {
        return false;
      }
    }

    // Validate audioSettings
    const { audioSettings } = preferences;
    if (typeof audioSettings.sampleRate !== 'number' || 
        audioSettings.sampleRate <= 0 ||
        typeof audioSettings.bufferSize !== 'number' || 
        audioSettings.bufferSize <= 0 ||
        typeof audioSettings.gain !== 'number' || 
        audioSettings.gain < 0) {
      return false;
    }

    // Validate basic uiSettings structure (allow missing basic properties)
    const { uiSettings } = preferences;
    if (uiSettings.theme !== undefined && typeof uiSettings.theme !== 'string') {
      return false;
    }
    if (uiSettings.autoStart !== undefined && typeof uiSettings.autoStart !== 'boolean') {
      return false;
    }
    if (uiSettings.fullscreen !== undefined && typeof uiSettings.fullscreen !== 'boolean') {
      return false;
    }

    // Validate detailed UI settings using the new validation method
    const uiValidation = this.validateUISettings(uiSettings);
    if (!uiValidation.success) {
      serviceLogger.warn('UI settings validation failed', { errors: uiValidation.errors });
      return false;
    }

    // Validate systemSettings
    const { systemSettings } = preferences;
    if (typeof systemSettings.port !== 'number' || 
        systemSettings.port < 1 || 
        systemSettings.port > 65535 ||
        typeof systemSettings.host !== 'string') {
      return false;
    }

    return true;
  }

  /**
   * Load preferences from JSON file
   * @returns {Promise<object>} Loaded preferences object
   */
  async loadPreferences() {
    serviceLogger.debug(`Loading preferences from ${this.preferencesPath}`);
    
    // Wait for any pending saves to complete before reading
    if (this.isSaving) {
      serviceLogger.debug('Waiting for pending save to complete before loading');
      await this.waitForSaveCompletion();
    }
    
    try {
      // Check if file exists
      await fs.access(this.preferencesPath);
      
      // Read and parse JSON file
      const data = await fs.readFile(this.preferencesPath, 'utf8');
      
      let preferences;
      try {
        preferences = JSON.parse(data);
      } catch (parseError) {
        serviceLogger.error('Failed to parse preferences JSON', { 
          error: parseError.message,
          filePath: this.preferencesPath,
          dataSample: data.substring(0, 100) + '...'
        });
        
        // Create a custom error with more context
        const enhancedError = new SyntaxError(`Failed to parse preferences JSON: ${parseError.message}`);
        enhancedError.code = 'INVALID_JSON';
        enhancedError.originalError = parseError;
        enhancedError.filePath = this.preferencesPath;
        
        // Backup corrupted file before throwing
        await this.backupCorruptedFile();
        throw enhancedError;
      }

      // Validate loaded preferences
      if (!this.validatePreferences(preferences)) {
        serviceLogger.warn('Invalid preferences data structure, using defaults', {
          filePath: this.preferencesPath,
          invalidData: JSON.stringify(preferences).substring(0, 200) + '...'
        });
        
        // Backup invalid file
        await this.backupCorruptedFile();
        return await this.createDefaultPreferences();
      }

      serviceLogger.info('Preferences loaded successfully');
      serviceLogger.debug('Loaded preferences', { preferences });
      
      this.preferences = preferences;
      return preferences;

    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create default
        serviceLogger.info('Preferences file not found, creating default', {
          filePath: this.preferencesPath
        });
        return await this.createDefaultPreferences();
      } else if (error instanceof SyntaxError) {
        // JSON parsing error, backup and create new
        serviceLogger.warn('Corrupted preferences file, backing up and creating new', {
          filePath: this.preferencesPath,
          error: error.message
        });
        
        // If we already tried to backup in the parse block, don't do it again
        if (!error.code || error.code !== 'INVALID_JSON') {
          await this.backupCorruptedFile();
        }
        
        return await this.createDefaultPreferences();
      } else if (error.code === 'EACCES') {
        // Permission error
        serviceLogger.error('Permission denied accessing preferences file', {
          filePath: this.preferencesPath,
          error: error.message
        });
        
        // Create a custom error with more context
        const enhancedError = new Error('Permission denied accessing preferences file');
        enhancedError.code = 'PERMISSION_DENIED';
        enhancedError.originalError = error;
        enhancedError.filePath = this.preferencesPath;
        
        // Use in-memory defaults but propagate the error
        this.preferences = this.getDefaultPreferences();
        throw enhancedError;
      } else {
        // Other errors
        serviceLogger.error('Error loading preferences', {
          filePath: this.preferencesPath,
          errorCode: error.code,
          errorMessage: error.message
        });
        
        // Create a custom error with more context
        const enhancedError = new Error(`Failed to load preferences: ${error.message}`);
        enhancedError.code = error.code || 'LOAD_ERROR';
        enhancedError.originalError = error;
        enhancedError.filePath = this.preferencesPath;
        
        // Use in-memory defaults but propagate the error
        this.preferences = this.getDefaultPreferences();
        throw enhancedError;
      }
    }
  }

  /**
   * Wait for any pending save operations to complete
   * @returns {Promise<void>}
   */
  async waitForSaveCompletion() {
    while (this.isSaving) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  /**
   * Save preferences to JSON file with retry mechanism
   * @param {object} preferences - Preferences object to save
   * @param {number} retryCount - Current retry attempt (internal use)
   * @returns {Promise<boolean>} True if saved successfully, false otherwise
   */
  async savePreferences(preferences, retryCount = 0) {
    serviceLogger.debug('Saving preferences', { retryCount });
    
    // Set saving flag to prevent concurrent saves and reads
    this.isSaving = true;
    
    try {
      // Ensure we have a complete preferences object by merging with defaults if needed
      let completePreferences = preferences;
      if (!this.validatePreferences(preferences)) {
        serviceLogger.debug('Incomplete preferences received, merging with defaults');
        const defaults = this.getDefaultPreferences();
        completePreferences = this.mergePreferences(defaults, preferences);
        
        // Validate the merged preferences
        if (!this.validatePreferences(completePreferences)) {
          serviceLogger.warn('Invalid preferences data structure after merge, save rejected', {
            invalidData: JSON.stringify(preferences).substring(0, 200) + '...',
            hasAudioSettings: !!preferences.audioSettings,
            hasUISettings: !!preferences.uiSettings,
            hasSystemSettings: !!preferences.systemSettings,
            uiSettingsKeys: preferences.uiSettings ? Object.keys(preferences.uiSettings) : 'none'
          });
          
          this.isSaving = false;
          return false;
        }
      }

      // Update timestamp
      completePreferences.lastUpdated = new Date().toISOString();

      // Ensure directory exists
      const dir = path.dirname(this.preferencesPath);
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (mkdirError) {
        serviceLogger.error('Failed to create preferences directory', {
          directory: dir,
          error: mkdirError.message
        });
        
        // Create a custom error with more context
        const enhancedError = new Error(`Failed to create preferences directory: ${mkdirError.message}`);
        enhancedError.code = mkdirError.code || 'DIR_CREATE_ERROR';
        enhancedError.originalError = mkdirError;
        enhancedError.directory = dir;
        throw enhancedError;
      }

      // Write to file with pretty formatting
      const data = JSON.stringify(completePreferences, null, 2);
      
      // Use atomic write pattern with temporary file
      const tempPath = `${this.preferencesPath}.tmp`;
      
      try {
        // Write to temporary file first
        await fs.writeFile(tempPath, data, 'utf8');
        
        // Then rename to actual file (atomic operation)
        await fs.rename(tempPath, this.preferencesPath);
      } catch (writeError) {
        // Clean up temp file if it exists
        try {
          await fs.unlink(tempPath).catch(() => {});
        } catch (unlinkError) {
          // Ignore cleanup errors
        }
        
        throw writeError;
      }

      serviceLogger.info('Preferences saved successfully', {
        filePath: this.preferencesPath
      });
      
      // Log settings file location to application logs for user reference
      try {
        serviceLogger.debug('Settings file location', { 
          filePath: this.preferencesPath,
          platform: PlatformDetection.getCurrentPlatform ? PlatformDetection.getCurrentPlatform() : 'unknown'
        });
      } catch (error) {
        // Fallback logging if platform detection fails (e.g., in tests)
        serviceLogger.debug('Settings file location', { 
          filePath: this.preferencesPath,
          platform: 'unknown'
        });
      }
      
      this.preferences = completePreferences;
      this.isSaving = false;
      return true;

    } catch (error) {
      // Implement retry logic with short pause
      if (retryCount < 1) { // Only retry once
        serviceLogger.warn('Save attempt failed, retrying after short pause', {
          retryCount: retryCount + 1,
          error: error.message
        });
        
        // Wait 100ms before retry
        await new Promise(resolve => setTimeout(resolve, 100));
        return await this.savePreferences(completePreferences, retryCount + 1);
      }

      // Clear saving flag on final failure
      this.isSaving = false;

      if (error.code === 'EACCES') {
        serviceLogger.error('Permission denied writing preferences file', {
          filePath: this.preferencesPath,
          error: error.message
        });
      } else if (error.code === 'ENOSPC') {
        serviceLogger.error('No space left on device', {
          filePath: this.preferencesPath,
          error: error.message
        });
      } else {
        serviceLogger.error('Error saving preferences', {
          filePath: this.preferencesPath,
          errorCode: error.code,
          errorMessage: error.message
        });
      }
      
      // Create a custom error with more context if not already enhanced
      if (!error.code || (error.code !== 'INVALID_DATA' && !error.originalError)) {
        const enhancedError = new Error(`Failed to save preferences: ${error.message}`);
        enhancedError.code = error.code || 'SAVE_ERROR';
        enhancedError.originalError = error;
        enhancedError.filePath = this.preferencesPath;
        throw enhancedError;
      } else {
        throw error;
      }
    }
  }

  /**
   * Create default preferences file
   * @returns {Promise<object>} Default preferences object
   * @private
   */
  async createDefaultPreferences() {
    serviceLogger.info('Creating default preferences');
    const defaults = this.getDefaultPreferences();
    
    try {
      await this.savePreferences(defaults);
      serviceLogger.info('Default preferences saved successfully');
      
      // Log settings file location when file is created for user reference
      try {
        serviceLogger.info('Settings file created', { 
          filePath: this.preferencesPath,
          platform: PlatformDetection.getCurrentPlatform ? PlatformDetection.getCurrentPlatform() : 'unknown'
        });
      } catch (error) {
        // Fallback logging if platform detection fails (e.g., in tests)
        serviceLogger.info('Settings file created', { 
          filePath: this.preferencesPath,
          platform: 'unknown'
        });
      }
      
      // Also log to console for user visibility when file is first created
      console.log(`Settings file created: ${this.preferencesPath}`);
    } catch (error) {
      // If we can't save, at least return defaults for in-memory use
      serviceLogger.warn('Could not save default preferences, using in-memory defaults', {
        error: error.message
      });
      this.preferences = defaults;
    }
    
    return defaults;
  }

  /**
   * Backup corrupted preferences file
   * @returns {Promise<void>}
   * @private
   */
  async backupCorruptedFile() {
    try {
      const backupPath = `${this.preferencesPath}.backup.${Date.now()}`;
      await fs.copyFile(this.preferencesPath, backupPath);
      serviceLogger.info('Corrupted preferences backed up', {
        originalPath: this.preferencesPath,
        backupPath: backupPath
      });
      return backupPath;
    } catch (error) {
      serviceLogger.warn('Could not backup corrupted preferences file', {
        originalPath: this.preferencesPath,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Get current preferences (load if not already loaded)
   * @returns {Promise<object>} Current preferences object
   */
  async getPreferences() {
    if (!this.preferences) {
      return await this.loadPreferences();
    }
    return this.preferences;
  }

  /**
   * Update specific preference values
   * @param {object} updates - Partial preferences object with updates
   * @returns {Promise<boolean>} True if updated successfully
   */
  async updatePreferences(updates) {
    const current = await this.getPreferences();
    const updated = this.mergePreferences(current, updates);
    return await this.savePreferences(updated);
  }

  /**
   * Deep merge preferences objects
   * @param {object} current - Current preferences
   * @param {object} updates - Updates to apply
   * @returns {object} Merged preferences object
   * @private
   */
  mergePreferences(current, updates) {
    const merged = JSON.parse(JSON.stringify(current)); // Deep clone
    
    for (const [key, value] of Object.entries(updates)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        merged[key] = { ...merged[key], ...value };
      } else {
        merged[key] = value;
      }
    }
    
    return merged;
  }

  /**
   * Flush current preferences to disk during shutdown
   * This method is designed for use during server shutdown to ensure
   * current settings are preserved even if they haven't been explicitly saved
   * @param {number} timeout - Maximum time to wait for save operation (ms)
   * @returns {Promise<boolean>} True if flushed successfully, false otherwise
   */
  async flush(timeout = 5000) {
    serviceLogger.info('Flushing preferences during shutdown');
    
    try {
      // If we don't have current preferences loaded, there's nothing to flush
      if (!this.preferences) {
        serviceLogger.debug('No preferences loaded, nothing to flush');
        return true;
      }

      // Create a promise that will timeout if save takes too long
      const savePromise = this.savePreferences(this.preferences);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Preferences flush timed out after ${timeout}ms`));
        }, timeout);
      });

      // Race between save and timeout
      await Promise.race([savePromise, timeoutPromise]);
      
      serviceLogger.info('Preferences flushed successfully during shutdown');
      return true;

    } catch (error) {
      if (error.message.includes('timed out')) {
        serviceLogger.warn('Preferences flush timed out during shutdown', {
          timeout: timeout,
          error: error.message
        });
      } else {
        serviceLogger.error('Error flushing preferences during shutdown', {
          error: error.message,
          errorCode: error.code
        });
      }
      
      // Don't throw during shutdown - just log and return false
      return false;
    }
  }
}

module.exports = { PreferencesService };