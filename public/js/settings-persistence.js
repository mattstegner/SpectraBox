/**
 * Settings Persistence Manager
 * 
 * Handles client-side settings persistence for the pi-audio-kiosk application.
 * Provides automatic saving, loading, and validation of UI settings.
 */

class SettingsManager {
  constructor() {
    this.debounceTimeout = null;
    this.debounceDelay = 500; // 500ms debounce delay
    this.isInitialized = false;
    this.currentSettings = null;
    this.lastLoadedPreferences = null; // Cache complete preferences from server
    this.isSaving = false;
    this.saveRetryCount = 0;
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second initial retry delay
    this.changedSettings = new Set(); // Track which settings have changed
    
    // Enhanced error handling state
    this.isOnline = navigator.onLine;
    this.serverAvailable = true;
    this.lastServerCheck = null;
    this.serverCheckInterval = 30000; // Check server every 30 seconds when offline
    this.pendingSettings = null; // Store settings when server is unavailable
    this.operationQueue = []; // Queue operations when offline
    this.isLoading = false;
    
    // UI control mappings for each settings category
    this.controlMappings = {
      general: {
        minFrequency: { element: 'minFreqSlider', type: 'number', display: 'minFreqValue', formatter: (v) => `${v} Hz` },
        maxFrequency: { element: 'maxFreqSlider', type: 'number', display: 'maxFreqValue', formatter: (v) => `${(v/1000).toFixed(1)} kHz` },
        inputGain: { element: 'gainSlider', type: 'number', display: 'gainValue', formatter: (v) => `${v} dB` },
        holdMode: { element: 'holdModeSelect', type: 'string' }
      },
      spectrogramInterface: {
        clickInfoSize: { element: 'clickInfoSizeSelect', type: 'string' },
        responsiveness: { element: 'smoothingSlider', type: 'number', display: 'smoothingValue' },
        amplitudeOffset: { element: 'calibrationSlider', type: 'number', display: 'calibrationValue', formatter: (v) => `${v} dB` },
        overlappingDisplay: { element: 'overlappingToggle', type: 'boolean' },
        overlapTolerance: { element: 'overlapToleranceSlider', type: 'number', display: 'overlapToleranceValue', formatter: (v) => `${v} dB` },
        spectrogramRange: { element: 'spectrogramRangeSlider', type: 'number', display: 'spectrogramRangeValue', formatter: (v) => `${v} dB to 0 dB` }
      },
      spectrogramDrawing: {
        fftSize: { element: 'fftSizeSelect', type: 'number' },
        pixelAveraging: { element: 'pixelAveragingToggle', type: 'boolean' },
        multiPixelSmoothing: { element: 'multiPixelSmoothingSlider', type: 'number', display: 'multiPixelSmoothingValue' },
        frequencyDependentSmoothing: { element: 'frequencyDependentSmoothingToggle', type: 'boolean' },
        noiseFloorSubtraction: { element: 'noiseFloorSubtractionSlider', type: 'number', display: 'noiseFloorSubtractionValue', formatter: (v) => `${v} dB` },
        peakEnvelope: { element: 'peakEnvelopeToggle', type: 'boolean' }
      },
      meters: {
        meterSpeed: { element: 'meterSpeedSelect', type: 'string' },
        holdTime: { element: 'holdTimeSlider', type: 'number', display: 'holdTimeValue', formatter: (v) => `${v}s` },
        decibelsSpeed: { element: 'decibelsSpeedSlider', type: 'number', display: 'decibelsSpeedValue', formatter: (v) => `${v}ms` },
        rmsWeighting: { element: 'rmsWeightingSelect', type: 'string' }
      }
    };

    // Validation schema (matches server-side schema)
    this.validationSchema = {
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
      }
    };
  }

  /**
   * Initialize the settings manager
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // Set up network monitoring
      this.setupNetworkMonitoring();
      
      // Load settings from server
      await this.loadSettings();
      
      // Attach event listeners to all settings controls
      this.attachSettingsListeners();
      
      this.isInitialized = true;
      console.log('SettingsManager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize SettingsManager:', error);
      
      // Enhanced error handling for initialization
      if (this.isNetworkError(error)) {
        this.showSettingsFeedback('Settings could not be loaded due to network issues. Using default values.', 'warning');
        this.serverAvailable = false;
        this.startOfflineMode();
      } else {
        this.showSettingsFeedback('Settings initialization failed. Using default values.', 'error');
      }
      
      // Continue with default settings if loading fails
      this.isInitialized = true;
    }
  }

  /**
   * Load settings from server and apply to UI
   * @returns {Promise<object>} Loaded settings
   */
  async loadSettings() {
    this.isLoading = true;
    this.showLoadingIndicator(true, 'Loading settings...');
    
    try {
      // Check if server is available before attempting load
      if (!this.serverAvailable && !this.isOnline) {
        throw new Error('Server unavailable and offline');
      }

      const response = await this.fetchWithTimeout('/api/preferences', {}, 10000);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to load settings: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const settings = data.preferences?.uiSettings;
      
      if (settings) {
        this.currentSettings = settings;
        this.lastLoadedPreferences = data.preferences; // Cache complete preferences
        this.applySettingsToUI(settings);
        this.serverAvailable = true; // Mark server as available
        console.log('Settings loaded and applied to UI');
        this.showSettingsFeedback('Settings loaded successfully', 'success');
        return settings;
      } else {
        console.warn('No UI settings found in server response, using current UI values');
        this.showSettingsFeedback('No saved settings found, using defaults', 'info');
        return null;
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      
      // Enhanced error handling with specific error types
      if (this.isNetworkError(error)) {
        this.serverAvailable = false;
        this.showSettingsFeedback('Network error loading settings. Using cached or default values.', 'warning');
        this.startOfflineMode();
      } else if (error.message.includes('timeout')) {
        this.showSettingsFeedback('Settings load timed out. Using cached or default values.', 'warning');
      } else if (error.message.includes('500')) {
        this.showSettingsFeedback('Server error loading settings. Using cached or default values.', 'error');
      } else if (error.message.includes('404')) {
        this.showSettingsFeedback('Settings file not found. Using default values.', 'info');
      } else {
        this.showSettingsFeedback('Failed to load settings. Using default values.', 'error');
      }
      
      // Graceful degradation - continue with current UI state
      this.currentSettings = this.collectCurrentSettings();
      throw error;
    } finally {
      this.isLoading = false;
      this.showLoadingIndicator(false);
    }
  }

  /**
   * Save settings to server with retry mechanism
   * @param {object} settings - Settings object to save
   * @param {number} retryCount - Current retry attempt
   * @returns {Promise<boolean>} True if saved successfully
   */
  async saveSettings(settings, retryCount = 0) {
    if (this.isSaving && retryCount === 0) {
      // Already saving, skip this request
      return false;
    }

    // Check if we're offline or server is unavailable
    if (!this.isOnline || !this.serverAvailable) {
      this.pendingSettings = settings;
      this.showSettingsFeedback('Offline - settings will be saved when connection is restored', 'warning');
      this.startOfflineMode();
      return false;
    }

    this.isSaving = true;
    
    // Only show saving indicator on first attempt
    if (retryCount === 0) {
      this.showSavingIndicator(true);
    }

    try {
      // Validate settings before sending
      const validation = this.validateSettings(settings);
      if (!validation.success) {
        console.error('Settings validation failed:', validation.errors);
        this.showDetailedValidationError(validation.errors);
        this.isSaving = false;
        this.showSavingIndicator(false);
        return false;
      }

      // Use cached current settings to build complete preferences object
      // This avoids the need for an additional GET request
      let basePreferences;
      if (this.currentSettings && this.lastLoadedPreferences) {
        // Use the last loaded complete preferences as base
        basePreferences = this.lastLoadedPreferences;
      } else {
        // Fallback: create minimal valid preferences structure
        basePreferences = {
          selectedAudioDevice: null,
          audioSettings: {
            sampleRate: 44100,
            bufferSize: 1024,
            gain: 1
          },
          uiSettings: {},
          systemSettings: {
            port: 3000,
            host: '0.0.0.0'
          }
        };
      }

      // Update only the UI settings while preserving other settings
      const updatedPreferences = {
        ...basePreferences,
        uiSettings: settings,
        lastUpdated: new Date().toISOString()
      };

      const response = await this.fetchWithTimeout('/api/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          preferences: updatedPreferences
        })
      }, 15000); // 15 second timeout for saves

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Save failed: ${response.status} ${response.statusText}`);
      }

      // Success
      this.currentSettings = settings;
      this.saveRetryCount = 0;
      this.changedSettings.clear(); // Clear changed settings tracker
      this.isSaving = false;
      this.showSavingIndicator(false);
      this.serverAvailable = true; // Mark server as available
      
      // Clear any pending settings since we successfully saved
      this.pendingSettings = null;
      
      // Only show success message on first attempt (not retries)
      if (retryCount === 0) {
        this.showSettingsFeedback('Settings saved', 'success');
      } else {
        this.showSettingsFeedback('Settings saved after retry', 'success');
      }
      
      console.log(`Settings saved successfully${retryCount > 0 ? ` after ${retryCount} retries` : ''}`);
      return true;

    } catch (error) {
      console.error(`Error saving settings (attempt ${retryCount + 1}):`, error);
      
      // Enhanced error categorization
      const errorType = this.categorizeError(error);
      
      // Handle different error types
      if (errorType === 'network') {
        this.serverAvailable = false;
        this.pendingSettings = settings;
        this.startOfflineMode();
        
        if (retryCount === 0) {
          this.showSettingsFeedback('Network error - settings will be saved when connection is restored', 'warning');
        }
        
        this.isSaving = false;
        this.showSavingIndicator(false);
        return false;
      }
      
      // Retry logic with exponential backoff for non-network errors
      if (retryCount < this.maxRetries && errorType !== 'validation') {
        const delay = this.retryDelay * Math.pow(2, retryCount); // Exponential backoff
        console.log(`Retrying save in ${delay}ms (attempt ${retryCount + 1}/${this.maxRetries})`);
        
        // Show retry feedback with more specific messaging
        const retryMessage = this.getRetryMessage(errorType, retryCount + 1, this.maxRetries, delay);
        this.showSettingsFeedback(retryMessage, 'warning');
        
        // Schedule retry
        setTimeout(async () => {
          await this.saveSettings(settings, retryCount + 1);
        }, delay);
        
        return false;
      } else {
        // Max retries reached or validation error - final failure
        this.isSaving = false;
        this.showSavingIndicator(false);
        
        // Provide detailed error message based on error type
        const errorMessage = this.getDetailedErrorMessage(errorType, error, retryCount);
        this.showSettingsFeedback(errorMessage, 'error');
        
        // For non-network errors, still store as pending for later retry
        if (errorType !== 'validation') {
          this.pendingSettings = settings;
        }
        
        return false;
      }
    }
  }

  /**
   * Reset all settings to defaults
   * @returns {Promise<boolean>} True if reset successfully
   */
  async resetSettings() {
    // Check if server is available
    if (!this.isOnline || !this.serverAvailable) {
      this.showSettingsFeedback('Cannot reset settings while offline. Please check your connection.', 'error');
      return false;
    }

    this.showLoadingIndicator(true, 'Resetting settings...');

    try {
      const response = await this.fetchWithTimeout('/api/preferences', {
        method: 'DELETE'
      }, 10000);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Reset failed: ${response.status} ${response.statusText}`);
      }

      // Reload settings from server to get defaults
      await this.loadSettings();
      
      // Clear any pending changes and settings
      this.changedSettings.clear();
      this.pendingSettings = null;
      
      this.showSettingsFeedback('Settings reset to defaults successfully', 'success');
      console.log('Settings reset to defaults successfully');
      return true;
    } catch (error) {
      console.error('Error resetting settings:', error);
      
      // Enhanced error handling with specific error types
      const errorType = this.categorizeError(error);
      let errorMessage;
      
      switch (errorType) {
      case 'network':
        this.serverAvailable = false;
        this.startOfflineMode();
        errorMessage = 'Network error - check your connection and try again';
        break;
      case 'timeout':
        errorMessage = 'Reset operation timed out - please try again';
        break;
      case 'server':
        errorMessage = 'Server error - please try again later';
        break;
      case 'permission':
        errorMessage = 'Permission denied - unable to reset settings file';
        break;
      case 'notfound':
        errorMessage = 'Settings file not found - may already be reset';
        break;
      default:
        errorMessage = 'Failed to reset settings - please try again';
      }
      
      this.showSettingsFeedback(errorMessage, 'error');
      return false;
    } finally {
      this.showLoadingIndicator(false);
    }
  }

  /**
   * Attach event listeners to all settings controls
   * Works cooperatively with existing spectrogram.js event handlers
   */
  attachSettingsListeners() {
    let attachedCount = 0;
    let missingCount = 0;

    for (const [category, controls] of Object.entries(this.controlMappings)) {
      for (const [settingKey, config] of Object.entries(controls)) {
        const element = document.getElementById(config.element);
        if (!element) {
          console.warn(`Settings control not found: ${config.element} for ${category}.${settingKey}`);
          missingCount++;
          continue;
        }

        // Determine the appropriate event types based on element type
        let eventTypes = [];
        
        if (element.type === 'range') {
          // For sliders, listen to both 'input' (real-time) and 'change' (final)
          // Use 'input' for immediate feedback, but debounce the saves
          eventTypes = ['input'];
        } else if (element.type === 'checkbox') {
          // For checkboxes/toggles
          eventTypes = ['change'];
        } else if (element.tagName === 'SELECT') {
          // For select dropdowns
          eventTypes = ['change'];
        } else {
          // Default fallback
          eventTypes = ['change'];
        }

        // Attach event listeners with cooperative approach
        // These listeners work alongside existing spectrogram.js listeners
        eventTypes.forEach(eventType => {
          element.addEventListener(eventType, (event) => {
            // Use setTimeout to ensure this runs after other event handlers
            // This allows spectrogram.js to update first, then we save the settings
            setTimeout(() => {
              this.handleSettingChange(category, settingKey, element, event);
            }, 0);
          });
        });

        attachedCount++;
      }
    }

    // Attach reset settings button listener
    const resetButton = document.getElementById('resetSettingsBtn');
    if (resetButton) {
      resetButton.addEventListener('click', async (event) => {
        event.preventDefault();
        await this.resetSettings();
      });
      attachedCount++;
      console.log('Reset Settings button listener attached');
    } else {
      console.warn('Reset Settings button not found in DOM');
      missingCount++;
    }

    console.log(`Settings event listeners attached: ${attachedCount} controls, ${missingCount} missing`);
    
    // Warn if many controls are missing
    if (missingCount > 0) {
      console.warn(`${missingCount} settings controls were not found in the DOM. Settings persistence may be incomplete.`);
    }
  }

  /**
   * Handle individual setting changes
   * @param {string} category - Settings category
   * @param {string} settingKey - Setting key
   * @param {HTMLElement} element - DOM element that changed
   * @param {Event} _event - The change event (unused)
   */
  handleSettingChange(category, settingKey, element, _event) {
    const config = this.controlMappings[category][settingKey];
    const value = this.getElementValue(element, config.type);
    
    // Validate the new value
    const validation = this.validateSettingValue(category, settingKey, value);
    if (!validation.success) {
      console.warn(`Invalid setting value for ${category}.${settingKey}:`, validation.error);
      // Don't save invalid values, but still update display if needed
      if (config.display) {
        this.updateDisplayValue(config.display, value, config.formatter);
      }
      return;
    }
    
    // Update display value if configured (though spectrogram.js usually handles this)
    if (config.display) {
      this.updateDisplayValue(config.display, value, config.formatter);
    }

    // Check if this is actually a change from current saved value
    const currentSavedValue = this.currentSettings?.[category]?.[settingKey];
    if (currentSavedValue !== undefined && currentSavedValue === value) {
      // Value hasn't actually changed from saved state, don't trigger save
      this.changedSettings.delete(`${category}.${settingKey}`);
      return;
    }

    // Track which setting changed for optimization
    this.changedSettings.add(`${category}.${settingKey}`);
    
    // Log the change for debugging
    console.log(`Setting changed: ${category}.${settingKey} = ${value} (was: ${currentSavedValue})`);

    // Trigger debounced save
    this.debounceSettingsSave();
  }

  /**
   * Get value from DOM element based on type
   * @param {HTMLElement} element - DOM element
   * @param {string} type - Value type ('number', 'string', 'boolean')
   * @returns {*} Converted value
   */
  getElementValue(element, type) {
    switch (type) {
    case 'number':
      if (element.tagName === 'SELECT') {
        return parseInt(element.value, 10);
      }
      return parseFloat(element.value);
    case 'boolean':
      return element.checked;
    case 'string':
    default:
      return element.value;
    }
  }

  /**
   * Update display value for a setting
   * @param {string} displayElementId - ID of display element
   * @param {*} value - Value to display
   * @param {Function} formatter - Optional formatter function
   */
  updateDisplayValue(displayElementId, value, formatter) {
    const displayElement = document.getElementById(displayElementId);
    if (displayElement) {
      displayElement.textContent = formatter ? formatter(value) : value;
    }
  }

  /**
   * Collect current settings from all UI controls
   * @returns {object} Current settings object
   */
  collectCurrentSettings() {
    const settings = {};

    for (const [category, controls] of Object.entries(this.controlMappings)) {
      settings[category] = {};
      
      for (const [settingKey, config] of Object.entries(controls)) {
        const element = document.getElementById(config.element);
        if (element) {
          settings[category][settingKey] = this.getElementValue(element, config.type);
        }
      }
    }

    return settings;
  }

  /**
   * Apply settings to UI controls
   * @param {object} settings - Settings object to apply
   */
  applySettingsToUI(settings) {
    for (const [category, categorySettings] of Object.entries(settings)) {
      if (!this.controlMappings[category]) {
        continue;
      }

      for (const [settingKey, value] of Object.entries(categorySettings)) {
        const config = this.controlMappings[category][settingKey];
        if (!config) {
          continue;
        }

        const element = document.getElementById(config.element);
        if (!element) {
          continue;
        }

        // Set element value based on type
        this.setElementValue(element, value, config.type);
        
        // Update display value if configured
        if (config.display) {
          this.updateDisplayValue(config.display, value, config.formatter);
        }

        // Trigger the appropriate event to notify the application of the change
        // This ensures that the spectrum analyzer and other components respond to the reset
        this.triggerElementEvent(element, config.type);
      }
    }

    console.log('Settings applied to UI controls');
  }

  /**
   * Set value on DOM element based on type
   * @param {HTMLElement} element - DOM element
   * @param {*} value - Value to set
   * @param {string} type - Value type
   */
  setElementValue(element, value, type) {
    switch (type) {
    case 'boolean':
      element.checked = value;
      break;
    case 'number':
    case 'string':
    default:
      element.value = value;
      break;
    }
  }

  /**
   * Trigger the appropriate event on an element to notify listeners of value changes
   * @param {HTMLElement} element - DOM element
   * @param {string} type - Value type
   */
  triggerElementEvent(element, type) {
    let eventType;
    
    // Determine the appropriate event type based on element type
    if (element.type === 'range') {
      // For sliders, trigger 'input' event for immediate response
      eventType = 'input';
    } else if (element.type === 'checkbox') {
      // For checkboxes/toggles, trigger 'change' event
      eventType = 'change';
    } else if (element.tagName === 'SELECT') {
      // For select dropdowns, trigger 'change' event
      eventType = 'change';
    } else {
      // Default fallback
      eventType = 'change';
    }

    // Create and dispatch the event
    const event = new Event(eventType, { bubbles: true });
    element.dispatchEvent(event);
  }

  /**
   * Debounced settings save to prevent excessive server requests
   */
  debounceSettingsSave() {
    // Clear existing timeout
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    // Set new timeout
    this.debounceTimeout = setTimeout(async () => {
      // Only save if there are actual changes
      if (this.changedSettings.size > 0) {
        const currentSettings = this.collectCurrentSettings();
        
        // Check if settings actually changed from last saved state
        if (this.hasSettingsChanged(currentSettings)) {
          console.log(`Saving settings due to changes in: ${Array.from(this.changedSettings).join(', ')}`);
          await this.saveSettings(currentSettings);
        } else {
          console.log('Settings save skipped - no actual changes detected');
          this.changedSettings.clear();
        }
      }
    }, this.debounceDelay);
  }

  /**
   * Check if current settings differ from last saved settings
   * @param {object} currentSettings - Current settings to compare
   * @returns {boolean} True if settings have changed
   */
  hasSettingsChanged(currentSettings) {
    if (!this.currentSettings) {
      return true; // No previous settings, so this is a change
    }

    // Deep comparison of settings objects
    return !this.deepEqual(currentSettings, this.currentSettings);
  }

  /**
   * Deep equality comparison for objects
   * @param {*} obj1 - First object
   * @param {*} obj2 - Second object
   * @returns {boolean} True if objects are deeply equal
   */
  deepEqual(obj1, obj2) {
    if (obj1 === obj2) {
      return true;
    }

    if (obj1 == null || obj2 == null) {
      return obj1 === obj2;
    }

    if (typeof obj1 !== typeof obj2) {
      return false;
    }

    if (typeof obj1 !== 'object') {
      return obj1 === obj2;
    }

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) {
      return false;
    }

    for (const key of keys1) {
      if (!keys2.includes(key)) {
        return false;
      }
      if (!this.deepEqual(obj1[key], obj2[key])) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate settings object
   * @param {object} settings - Settings to validate
   * @returns {object} Validation result with success flag and errors
   */
  validateSettings(settings) {
    const errors = {};
    let hasErrors = false;

    for (const [category, categorySettings] of Object.entries(settings)) {
      if (!this.validationSchema[category]) {
        errors[category] = `Unknown settings category: ${category}`;
        hasErrors = true;
        continue;
      }

      for (const [key, value] of Object.entries(categorySettings)) {
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
   * Validate a single setting value
   * @param {string} category - Setting category
   * @param {string} key - Setting key
   * @param {*} value - Value to validate
   * @returns {object} Validation result
   */
  validateSettingValue(category, key, value) {
    const schema = this.validationSchema[category];
    if (!schema || !schema[key]) {
      return { success: false, error: `Unknown setting: ${category}.${key}` };
    }

    const rule = schema[key];

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
   * Show visual saving indicator
   * @param {boolean} show - Whether to show or hide the indicator
   */
  showSavingIndicator(show) {
    let indicator = document.getElementById('settingsSavingIndicator');
    
    if (show) {
      if (!indicator) {
        // Create the saving indicator if it doesn't exist
        indicator = document.createElement('div');
        indicator.id = 'settingsSavingIndicator';
        indicator.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background-color: rgba(0, 170, 0, 0.95);
          color: white;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          z-index: 1002;
          display: flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          transition: all 0.3s ease;
          backdrop-filter: blur(4px);
          border: 1px solid rgba(255, 255, 255, 0.2);
        `;
        indicator.innerHTML = `
        <div style="
          width: 12px;
          height: 12px;
          border: 2px solid transparent;
          border-top: 2px solid white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        "></div>
        <span>Saving settings...</span>
      `;
        
        // Add CSS animation for spinner
        if (!document.getElementById('settingsSpinnerStyle')) {
          const style = document.createElement('style');
          style.id = 'settingsSpinnerStyle';
          style.textContent = `
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `;
          document.head.appendChild(style);
        }
        
        document.body.appendChild(indicator);
      }
      indicator.style.display = 'flex';
      indicator.style.opacity = '1';
      indicator.style.transform = 'translateY(0)';
    } else {
      if (indicator) {
        indicator.style.opacity = '0';
        indicator.style.transform = 'translateY(-10px)';
        setTimeout(() => {
          if (indicator && indicator.style.opacity === '0') {
            indicator.style.display = 'none';
          }
        }, 300);
      }
    }
  }

  /**
   * Show user feedback for settings operations
   * @param {string} message - Message to show
   * @param {string} type - Message type ('success', 'error', 'warning', 'info')
   */
  showSettingsFeedback(message, type = 'info') {
    // Log to console
    const logMethod = type === 'error' ? 'error' : type === 'success' ? 'info' : 'log';
    console[logMethod](`Settings: ${message}`);
    
    // Show visual feedback
    this.showToastNotification(message, type);
  }

  /**
   * Show confirmation dialog
   * @param {string} title - Dialog title
   * @param {string} message - Dialog message
   * @param {string} confirmText - Confirm button text
   * @param {string} cancelText - Cancel button text
   * @returns {Promise<boolean>} True if user confirmed
   */
  showConfirmationDialog(title, message, confirmText = 'OK', cancelText = 'Cancel') {
    return new Promise((resolve) => {
      // Remove any existing dialog
      const existingDialog = document.getElementById('settingsConfirmDialog');
      if (existingDialog) {
        existingDialog.remove();
      }

      // Create dialog overlay
      const overlay = document.createElement('div');
      overlay.id = 'settingsConfirmDialog';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1004;
        backdrop-filter: blur(4px);
      `;

      // Create dialog box
      const dialog = document.createElement('div');
      dialog.style.cssText = `
        background-color: #333;
        border: 1px solid #555;
        border-radius: 8px;
        padding: 0;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        color: #fff;
        font-family: Arial, sans-serif;
      `;

      // Create dialog header
      const header = document.createElement('div');
      header.style.cssText = `
        background-color: #444;
        padding: 16px 20px;
        border-bottom: 1px solid #555;
        border-radius: 8px 8px 0 0;
        font-weight: bold;
        font-size: 16px;
      `;
      header.textContent = title;

      // Create dialog body
      const body = document.createElement('div');
      body.style.cssText = `
        padding: 20px;
        line-height: 1.5;
        font-size: 14px;
        color: #ccc;
      `;
      body.textContent = message;

      // Create dialog footer
      const footer = document.createElement('div');
      footer.style.cssText = `
        padding: 16px 20px;
        border-top: 1px solid #555;
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        border-radius: 0 0 8px 8px;
        background-color: #2a2a2a;
      `;

      // Create cancel button
      const cancelButton = document.createElement('button');
      cancelButton.textContent = cancelText;
      cancelButton.style.cssText = `
        background-color: #555;
        color: #fff;
        border: 1px solid #666;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        min-width: 80px;
      `;
      cancelButton.addEventListener('mouseover', () => {
        cancelButton.style.backgroundColor = '#666';
      });
      cancelButton.addEventListener('mouseout', () => {
        cancelButton.style.backgroundColor = '#555';
      });

      // Create confirm button
      const confirmButton = document.createElement('button');
      confirmButton.textContent = confirmText;
      confirmButton.style.cssText = `
        background-color: #cc4400;
        color: #fff;
        border: 1px solid #ff5500;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        min-width: 80px;
      `;
      confirmButton.addEventListener('mouseover', () => {
        confirmButton.style.backgroundColor = '#ff5500';
      });
      confirmButton.addEventListener('mouseout', () => {
        confirmButton.style.backgroundColor = '#cc4400';
      });

      // Handle button clicks
      const cleanup = () => {
        if (overlay.parentNode) {
          overlay.remove();
        }
      };

      cancelButton.addEventListener('click', () => {
        cleanup();
        resolve(false);
      });

      confirmButton.addEventListener('click', () => {
        cleanup();
        resolve(true);
      });

      // Handle escape key
      const handleKeydown = (event) => {
        if (event.key === 'Escape') {
          cleanup();
          document.removeEventListener('keydown', handleKeydown);
          resolve(false);
        }
      };
      document.addEventListener('keydown', handleKeydown);

      // Handle overlay click
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          cleanup();
          resolve(false);
        }
      });

      // Assemble dialog
      footer.appendChild(cancelButton);
      footer.appendChild(confirmButton);
      dialog.appendChild(header);
      dialog.appendChild(body);
      dialog.appendChild(footer);
      overlay.appendChild(dialog);

      // Add to DOM and focus confirm button
      document.body.appendChild(overlay);
      confirmButton.focus();
    });
  }

  /**
   * Set up network monitoring for online/offline detection
   */
  setupNetworkMonitoring() {
    // Monitor online/offline status
    window.addEventListener('online', () => {
      console.log('Network connection restored');
      this.isOnline = true;
      this.checkServerAvailability();
    });

    window.addEventListener('offline', () => {
      console.log('Network connection lost');
      this.isOnline = false;
      this.serverAvailable = false;
      this.showSettingsFeedback('Connection lost - settings will be saved when reconnected', 'warning');
    });

    // Initial online status
    this.isOnline = navigator.onLine;
  }

  /**
   * Start offline mode - periodically check for server availability
   */
  startOfflineMode() {
    if (this.serverCheckInterval) {
      return; // Already in offline mode
    }

    console.log('Starting offline mode - will check server availability periodically');
    
    const checkServer = async () => {
      if (this.isOnline) {
        const available = await this.checkServerAvailability();
        if (available && this.pendingSettings) {
          console.log('Server available again, saving pending settings');
          this.showSettingsFeedback('Connection restored - saving pending settings...', 'info');
          await this.saveSettings(this.pendingSettings);
        }
      }
    };

    this.serverCheckTimer = setInterval(checkServer, this.serverCheckInterval);
  }

  /**
   * Check if server is available
   * @returns {Promise<boolean>} True if server is available
   */
  async checkServerAvailability() {
    try {
      const response = await this.fetchWithTimeout('/api/preferences', {
        method: 'HEAD'
      }, 5000);
      
      const available = response.ok;
      if (available && !this.serverAvailable) {
        this.serverAvailable = true;
        console.log('Server is available again');
        if (this.serverCheckTimer) {
          clearInterval(this.serverCheckTimer);
          this.serverCheckTimer = null;
        }
      }
      return available;
    } catch (error) {
      this.serverAvailable = false;
      return false;
    }
  }

  /**
   * Fetch with timeout support
   * @param {string} url - URL to fetch
   * @param {object} options - Fetch options
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Response>} Fetch response
   */
  async fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  /**
   * Determine if an error is network-related
   * @param {Error} error - Error to check
   * @returns {boolean} True if network error
   */
  isNetworkError(error) {
    return error.message.includes('NetworkError') ||
           error.message.includes('fetch') ||
           error.message.includes('Failed to fetch') ||
           error.name === 'TypeError' && error.message.includes('fetch') ||
           error.message.includes('ERR_NETWORK') ||
           error.message.includes('ERR_INTERNET_DISCONNECTED');
  }

  /**
   * Categorize error types for better handling
   * @param {Error} error - Error to categorize
   * @returns {string} Error category
   */
  categorizeError(error) {
    const message = error.message.toLowerCase();
    
    if (this.isNetworkError(error)) {
      return 'network';
    } else if (message.includes('timeout')) {
      return 'timeout';
    } else if (message.includes('500') || message.includes('internal server error')) {
      return 'server';
    } else if (message.includes('400') || message.includes('bad request')) {
      return 'validation';
    } else if (message.includes('403') || message.includes('forbidden')) {
      return 'permission';
    } else if (message.includes('404') || message.includes('not found')) {
      return 'notfound';
    } else if (message.includes('429') || message.includes('too many requests')) {
      return 'ratelimit';
    } else {
      return 'unknown';
    }
  }

  /**
   * Get retry message based on error type
   * @param {string} errorType - Type of error
   * @param {number} attempt - Current attempt number
   * @param {number} maxAttempts - Maximum attempts
   * @param {number} delay - Delay until next retry
   * @returns {string} Retry message
   */
  getRetryMessage(errorType, attempt, maxAttempts, delay) {
    const seconds = Math.round(delay / 1000);
    const attemptText = `(${attempt}/${maxAttempts})`;
    
    switch (errorType) {
    case 'server':
      return `Server error - retrying in ${seconds}s... ${attemptText}`;
    case 'timeout':
      return `Request timed out - retrying in ${seconds}s... ${attemptText}`;
    case 'ratelimit':
      return `Rate limited - retrying in ${seconds}s... ${attemptText}`;
    default:
      return `Save failed - retrying in ${seconds}s... ${attemptText}`;
    }
  }

  /**
   * Get detailed error message based on error type
   * @param {string} errorType - Type of error
   * @param {Error} error - Original error
   * @param {number} retryCount - Number of retries attempted
   * @returns {string} Detailed error message
   */
  getDetailedErrorMessage(errorType, error, retryCount) {
    const retriesText = retryCount > 0 ? ` after ${retryCount} retries` : '';
    
    switch (errorType) {
    case 'network':
      return `Network error${retriesText}. Settings will be saved when connection is restored.`;
    case 'server':
      return `Server error${retriesText}. Please try again later or contact support.`;
    case 'timeout':
      return `Request timed out${retriesText}. Check your connection and try again.`;
    case 'validation':
      return 'Invalid settings data. Please refresh the page and try again.';
    case 'permission':
      return 'Permission denied. Unable to save settings file.';
    case 'ratelimit':
      return `Too many requests${retriesText}. Please wait before trying again.`;
    default:
      return `Failed to save settings${retriesText}. Please try again.`;
    }
  }

  /**
   * Show detailed validation error messages
   * @param {object} errors - Validation errors object
   */
  showDetailedValidationError(errors) {
    const errorMessages = [];
    
    for (const [field, message] of Object.entries(errors)) {
      errorMessages.push(`${field}: ${message}`);
    }
    
    const fullMessage = `Settings validation failed:\n${errorMessages.join('\n')}`;
    console.error(fullMessage);
    
    // Show user-friendly message
    this.showSettingsFeedback('Some settings have invalid values. Please check your inputs.', 'error');
  }

  /**
   * Show loading indicator for various operations
   * @param {boolean} show - Whether to show or hide the indicator
   * @param {string} message - Loading message to display
   */
  showLoadingIndicator(show, message = 'Loading...') {
    let indicator = document.getElementById('settingsLoadingIndicator');
    
    if (show) {
      if (!indicator) {
        // Create the loading indicator if it doesn't exist
        indicator = document.createElement('div');
        indicator.id = 'settingsLoadingIndicator';
        indicator.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background-color: rgba(0, 100, 200, 0.95);
          color: white;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          z-index: 1002;
          display: flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          transition: all 0.3s ease;
          backdrop-filter: blur(4px);
          border: 1px solid rgba(255, 255, 255, 0.2);
        `;
        
        document.body.appendChild(indicator);
      }
      
      indicator.innerHTML = `
        <div style="
          width: 12px;
          height: 12px;
          border: 2px solid transparent;
          border-top: 2px solid white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        "></div>
        <span>${message}</span>
      `;
      
      indicator.style.display = 'flex';
      indicator.style.opacity = '1';
      indicator.style.transform = 'translateY(0)';
    } else {
      if (indicator) {
        indicator.style.opacity = '0';
        indicator.style.transform = 'translateY(-10px)';
        setTimeout(() => {
          if (indicator && indicator.style.opacity === '0') {
            indicator.style.display = 'none';
          }
        }, 300);
      }
    }
  }

  /**
   * Show toast notification for user feedback
   * @param {string} message - Message to show
   * @param {string} type - Message type ('success', 'error', 'warning', 'info')
   */
  showToastNotification(message, type) {
    // Remove any existing toast
    const existingToast = document.getElementById('settingsToast');
    if (existingToast) {
      existingToast.remove();
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.id = 'settingsToast';
    
    // Set colors based on type
    let backgroundColor, borderColor;
    switch (type) {
    case 'success':
      backgroundColor = 'rgba(0, 170, 0, 0.9)';
      borderColor = '#00aa00';
      break;
    case 'error':
      backgroundColor = 'rgba(204, 0, 0, 0.9)';
      borderColor = '#cc0000';
      break;
    case 'warning':
      backgroundColor = 'rgba(255, 140, 0, 0.9)';
      borderColor = '#ff8c00';
      break;
    default:
      backgroundColor = 'rgba(0, 100, 200, 0.9)';
      borderColor = '#0064c8';
    }
    
    toast.style.cssText = `
      position: fixed;
      top: 70px;
      right: 20px;
      background-color: ${backgroundColor};
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      border-left: 4px solid ${borderColor};
      font-size: 14px;
      z-index: 1003;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      max-width: 350px;
      min-width: 200px;
      word-wrap: break-word;
      line-height: 1.4;
      opacity: 0;
      transform: translateX(100%);
      transition: all 0.3s ease;
      backdrop-filter: blur(4px);
      border: 1px solid rgba(255, 255, 255, 0.2);
    `;
    
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0)';
    }, 10);
    
    // Auto-remove after delay - longer for errors and warnings
    let duration;
    switch (type) {
    case 'error':
      duration = 7000; // Errors stay longer
      break;
    case 'warning':
      duration = 5000; // Warnings stay moderately long
      break;
    case 'success':
      duration = 3000; // Success messages are brief
      break;
    default:
      duration = 4000; // Info messages stay moderate time
    }
    
    // Add click to dismiss functionality
    toast.addEventListener('click', () => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
          if (toast.parentNode) {
            toast.remove();
          }
        }, 300);
      }
    });
    
    // Add hover to pause auto-dismiss
    let timeoutId;
    const startTimeout = () => {
      timeoutId = setTimeout(() => {
        if (toast.parentNode) {
          toast.style.opacity = '0';
          toast.style.transform = 'translateX(100%)';
          setTimeout(() => {
            if (toast.parentNode) {
              toast.remove();
            }
          }, 300);
        }
      }, duration);
    };
    
    toast.addEventListener('mouseenter', () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    });
    
    toast.addEventListener('mouseleave', startTimeout);
    
    // Start initial timeout
    startTimeout();
  }

  /**
   * Clean up resources and event listeners
   */
  cleanup() {
    // Clear timers
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = null;
    }
    
    if (this.serverCheckTimer) {
      clearInterval(this.serverCheckTimer);
      this.serverCheckTimer = null;
    }
    
    // Remove indicators
    const savingIndicator = document.getElementById('settingsSavingIndicator');
    if (savingIndicator) {
      savingIndicator.remove();
    }
    
    const loadingIndicator = document.getElementById('settingsLoadingIndicator');
    if (loadingIndicator) {
      loadingIndicator.remove();
    }
    
    const toast = document.getElementById('settingsToast');
    if (toast) {
      toast.remove();
    }
    
    const dialog = document.getElementById('settingsConfirmDialog');
    if (dialog) {
      dialog.remove();
    }
    
    console.log('SettingsManager cleaned up');
  }
}

// Create global instance
window.settingsManager = new SettingsManager();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.settingsManager.initialize();
  });
} else {
  // DOM is already ready
  window.settingsManager.initialize();
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (window.settingsManager) {
    window.settingsManager.cleanup();
  }
});