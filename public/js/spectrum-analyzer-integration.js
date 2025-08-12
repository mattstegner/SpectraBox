/**
 * Spectrum Analyzer Integration with Node.js Server
 * 
 * This file provides integration between the spectrum analyzer frontend
 * and the Node.js backend server.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Check server health on page load
  checkServerHealth();
    
  // Load audio devices on page load
  loadAudioDevices();
  
  // Settings are now handled by SettingsManager in settings-persistence.js
  // await loadAndApplyUISettings();
    
  // Add event listener for device selection
  const deviceSelect = document.getElementById('audioDeviceSelect');
  if (deviceSelect) {
    deviceSelect.addEventListener('change', handleDeviceChange);
  }
    
  // Add event listener for refresh devices button
  const refreshBtn = document.getElementById('refreshDevicesBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadAudioDevices);
  }
  
  // Add event listener for refresh network info button
  const refreshNetworkBtn = document.getElementById('refreshNetworkBtn');
  if (refreshNetworkBtn) {
    refreshNetworkBtn.addEventListener('click', displayNetworkInfo);
  }
  
  // Add event listener for settings tabs to load network info when Network tab is clicked
  const settingsTabs = document.querySelectorAll('.settings-tab');
  settingsTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      const tabName = e.target.getAttribute('data-tab');
      if (tabName === 'network') {
        // Load network info when Network tab is opened
        setTimeout(displayNetworkInfo, 100); // Small delay to ensure tab is visible
      }
    });
  });
});

/**
 * Check if the server is running and healthy
 */
function checkServerHealth() {
  fetch('/api/health')
    .then(response => {
      if (!response.ok) {
        throw new Error('Server health check failed');
      }
      return response.json();
    })
    .then(data => {
      console.log('Server health check:', data);
      // Update status message if needed
      // document.getElementById('serverStatus').textContent = 'Server connected';
    })
    .catch(error => {
      console.error('Server health check error:', error);
      // Update status message if needed
      // document.getElementById('serverStatus').textContent = 'Server connection failed';
    });
}

/**
 * Load and populate the audio device selector
 */
function loadAudioDevices() {
  const deviceSelect = document.getElementById('audioDeviceSelect');
  const defaultIndicator = document.getElementById('defaultDeviceIndicator');
    
  // Show loading state
  deviceSelect.innerHTML = '<option value="">Loading devices...</option>';
  defaultIndicator.textContent = 'Loading device information...';
    
  fetchAudioDevices()
    .then(devices => {
      populateDeviceSelector(devices);
    })
    .catch(error => {
      console.error('Failed to load audio devices:', error);
      deviceSelect.innerHTML = '<option value="default">Default Device (Error loading devices)</option>';
      defaultIndicator.textContent = 'Error loading device information';
    });
}

/**
 * Populate the device selector with available devices
 * @param {Array} devices - Array of audio device objects
 */
function populateDeviceSelector(devices) {
  const deviceSelect = document.getElementById('audioDeviceSelect');
  const defaultIndicator = document.getElementById('defaultDeviceIndicator');
    
  // Clear existing options
  deviceSelect.innerHTML = '';
    
  // Add default option
  const defaultOption = document.createElement('option');
  defaultOption.value = 'default';
  defaultOption.textContent = 'Default Device';
  deviceSelect.appendChild(defaultOption);
    
  // Add each device as an option
  devices.forEach(device => {
    const option = document.createElement('option');
    option.value = device.deviceId || device.id;
    option.textContent = device.label || device.name || `Device ${device.deviceId}`;
        
    // Mark default device in the option text
    if (device.isDefault) {
      option.textContent += ' (Default)';
    }
        
    deviceSelect.appendChild(option);
  });
    
  // Update default device indicator
  const defaultDevice = devices.find(device => device.isDefault);
  if (defaultDevice) {
    defaultIndicator.textContent = `Default: ${defaultDevice.label || defaultDevice.name || 'Unknown Device'}`;
  } else {
    defaultIndicator.textContent = 'Default device: System default';
  }
    
  console.log(`Loaded ${devices.length} audio devices`);
}

/**
 * Handle device selection change
 * @param {Event} event - Change event from the device selector
 */
function handleDeviceChange(event) {
  const selectedDeviceId = event.target.value;
  console.log('Selected audio device:', selectedDeviceId);
    
  // Store the selected device for use when starting the analyzer
  window.selectedAudioDeviceId = selectedDeviceId;
    
  // If the analyzer is currently running, we might want to restart it with the new device
  // This would require modifications to the spectrum analyzer code
  if (window.analyzer && window.analyzer.isRunning) {
    console.log('Note: Device change will take effect when analyzer is restarted');
    // TODO: Implement device switching for running analyzer
  }
}

/**
 * Fetch available audio devices from the server
 */
function fetchAudioDevices() {
  return fetch('/api/audio-devices')
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to fetch audio devices');
      }
      return response.json();
    })
    .then(data => {
      console.log('Available audio devices:', data);
      return data.devices || [];
    })
    .catch(error => {
      console.error('Error fetching audio devices:', error);
      return [];
    });
}

/**
 * Load user preferences from the server
 * This will be used later when we implement preferences saving
 */
function loadPreferences() {
  return fetch('/api/preferences')
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to load preferences');
      }
      return response.json();
    })
    .then(data => {
      console.log('Loaded preferences:', data);
      return data.preferences;
    })
    .catch(error => {
      console.error('Error loading preferences:', error);
      return null;
    });
}

/**
 * Save user preferences to the server
 * This will be used later when we implement preferences saving
 * 
 * @param {Object} preferences - User preferences to save
 */
function savePreferences(preferences) {
  return fetch('/api/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ preferences })
  })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to save preferences');
      }
      return response.json();
    })
    .then(data => {
      console.log('Preferences saved:', data);
      return true;
    })
    .catch(error => {
      console.error('Error saving preferences:', error);
      return false;
    });
}

/**
 * Get system information from the server
 * This can be used to adapt the UI based on the platform
 */
function getSystemInfo() {
  return fetch('/api/system-info')
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to get system info');
      }
      return response.json();
    })
    .then(data => {
      console.log('System info:', data);
      return data.systemInfo;
    })
    .catch(error => {
      console.error('Error getting system info:', error);
      return null;
    });
}

/**
 * Get server configuration including network accessibility info
 */
function getServerConfig() {
  return fetch('/api/server-config')
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to get server config');
      }
      return response.json();
    })
    .then(data => {
      console.log('Server config:', data);
      return data.config;
    })
    .catch(error => {
      console.error('Error getting server config:', error);
      return null;
    });
}

/**
 * Display network accessibility information in the Network tab
 */
function displayNetworkInfo() {
  Promise.all([getServerConfig(), getSystemInfo()]).then(([config, systemInfo]) => {
    updateNetworkStatus(config);
    updateServerConfig(config);
    updateAccessInfo(config, systemInfo);
  }).catch(error => {
    console.error('Error loading network information:', error);
    showNetworkError();
  });
}

/**
 * Update the network status display
 */
function updateNetworkStatus(config) {
  const statusDisplay = document.getElementById('networkStatusDisplay');
  if (!statusDisplay) return;
  
  let content = '<div class="network-status-display">';
  
  if (config && config.networkAccessible) {
    content += '<div class="network-status-item">';
    content += '<span class="status-indicator">🌐</span>';
    content += '<span class="status-text">Network Accessible</span>';
    content += '</div>';
    content += '<div class="network-hint">Server accepts connections from other devices on the network</div>';
  } else if (config) {
    content += '<div class="network-status-item">';
    content += '<span class="status-indicator">🏠</span>';
    content += '<span class="status-text">Local Access Only</span>';
    content += '</div>';
    content += '<div class="network-hint">Server only accepts connections from this device</div>';
  } else {
    content += '<div class="network-status-item">';
    content += '<span class="status-indicator">❌</span>';
    content += '<span class="status-text">Unable to determine network status</span>';
    content += '</div>';
  }
  
  if (config && config.kioskMode && config.kioskMode.enabled) {
    content += '<div class="kiosk-indicator">🖥️ Kiosk mode is enabled</div>';
  }
  
  content += '</div>';
  statusDisplay.innerHTML = content;
}

/**
 * Update the server configuration display
 */
function updateServerConfig(config) {
  const configDisplay = document.getElementById('serverConfigDisplay');
  if (!configDisplay) return;
  
  let content = '<div class="server-config-display">';
  
  if (config) {
    content += '<div class="config-item">';
    content += '<span class="config-label">Host:</span>';
    content += '<span class="config-value">' + config.host + '</span>';
    content += '</div>';
    
    content += '<div class="config-item">';
    content += '<span class="config-label">Port:</span>';
    content += '<span class="config-value">' + config.port + '</span>';
    content += '</div>';
    
    content += '<div class="config-item">';
    content += '<span class="config-label">Network Binding:</span>';
    content += '<span class="config-value">' + (config.networkAccessible ? 'All Interfaces (0.0.0.0)' : 'Local Only') + '</span>';
    content += '</div>';
    
    if (config.kioskMode) {
      content += '<div class="config-item">';
      content += '<span class="config-label">Kiosk Mode:</span>';
      content += '<span class="config-value">' + (config.kioskMode.enabled ? 'Enabled' : 'Disabled') + '</span>';
      content += '</div>';
      
      if (config.kioskMode.enabled) {
        content += '<div class="config-item">';
        content += '<span class="config-label">Fullscreen:</span>';
        content += '<span class="config-value">' + (config.kioskMode.fullscreen ? 'Yes' : 'No') + '</span>';
        content += '</div>';
      }
    }
  } else {
    content += '<div class="config-item">Unable to load server configuration</div>';
  }
  
  content += '</div>';
  configDisplay.innerHTML = content;
}

/**
 * Update the access information display
 */
function updateAccessInfo(config, systemInfo) {
  const accessDisplay = document.getElementById('accessInfoDisplay');
  if (!accessDisplay) return;
  
  let content = '<div class="access-info-display">';
  
  if (config) {
    // Local access URL
    content += '<div class="config-item">';
    content += '<span class="config-label">Local URL:</span>';
    content += '<span class="config-value">http://localhost:' + config.port + '</span>';
    content += '</div>';
    
    // Network access information
    if (config.networkAccessible) {
      if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        content += '<div class="config-item">';
        content += '<span class="config-label">Current URL:</span>';
        content += '<span class="config-value">http://' + window.location.hostname + ':' + config.port + '</span>';
        content += '</div>';
      }
      
      content += '<div class="network-url">Network Access: http://&lt;your-ip&gt;:' + config.port + '</div>';
      content += '<div class="network-hint">Replace &lt;your-ip&gt; with this device\'s IP address</div>';
      
      if (systemInfo && systemInfo.platform) {
        content += '<div class="network-hint">Find IP with: ';
        if (systemInfo.platform === 'linux' || systemInfo.isRaspberryPi) {
          content += 'hostname -I';
        } else if (systemInfo.platform === 'darwin') {
          content += 'ifconfig | grep "inet "';
        } else {
          content += 'ipconfig (Windows) or ifconfig (Mac/Linux)';
        }
        content += '</div>';
      }
    } else {
      content += '<div class="network-hint">Network access is disabled. Only local connections are accepted.</div>';
    }
  } else {
    content += '<div class="config-item">Unable to load access information</div>';
  }
  
  content += '</div>';
  accessDisplay.innerHTML = content;
}

/**
 * Show network error state
 */
function showNetworkError() {
  const elements = ['networkStatusDisplay', 'serverConfigDisplay', 'accessInfoDisplay'];
  
  elements.forEach(elementId => {
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = '<div class="network-status-display" style="color: #ff6666;">Error loading network information. Please check server connection.</div>';
    }
  });
}

/**
 * Load UI settings from server and apply them to the interface
 * @returns {Promise<void>}
 */
async function loadAndApplyUISettings() {
  try {
    console.log('Loading UI settings from server...');
    
    const response = await fetch('/api/preferences');
    if (!response.ok) {
      throw new Error(`Failed to load preferences: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.success && data.preferences && data.preferences.uiSettings) {
      console.log('UI settings loaded successfully');
      applySettingsToUI(data.preferences.uiSettings);
    } else if (data.success && data.preferences) {
      // Settings loaded but no UI settings found - this is expected for new installations
      console.log('No UI settings found in preferences, using current UI values');
    } else {
      // Handle error response but still try to get default settings
      console.warn('Settings load response indicates error:', data.message || 'Unknown error');
      
      if (data.preferences) {
        // Even if there was an error, apply any available settings
        applySettingsToUI(data.preferences.uiSettings || {});
      }
    }
  } catch (error) {
    console.error('Error loading UI settings:', error);
    console.log('Continuing with current UI values');
    // Don't throw - allow the application to continue with current UI state
  }
}

/**
 * Apply loaded settings to all UI controls
 * @param {object} uiSettings - UI settings object from server
 */
function applySettingsToUI(uiSettings) {
  if (!uiSettings || typeof uiSettings !== 'object') {
    console.log('No UI settings to apply');
    return;
  }

  console.log('Applying settings to UI controls...');

  // UI control mappings for each settings category
  const controlMappings = {
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

  let appliedCount = 0;
  let skippedCount = 0;

  // Apply settings for each category
  for (const [category, categorySettings] of Object.entries(uiSettings)) {
    if (!controlMappings[category]) {
      console.warn(`Unknown settings category: ${category}`);
      continue;
    }

    if (!categorySettings || typeof categorySettings !== 'object') {
      console.warn(`Invalid settings for category ${category}:`, categorySettings);
      continue;
    }

    // Apply each setting in the category
    for (const [settingKey, value] of Object.entries(categorySettings)) {
      const config = controlMappings[category][settingKey];
      if (!config) {
        console.warn(`Unknown setting: ${category}.${settingKey}`);
        skippedCount++;
        continue;
      }

      const element = document.getElementById(config.element);
      if (!element) {
        console.warn(`UI element not found: ${config.element} for setting ${category}.${settingKey}`);
        skippedCount++;
        continue;
      }

      try {
        // Validate the value before applying
        if (!validateSettingValue(category, settingKey, value, config.type)) {
          console.warn(`Invalid value for ${category}.${settingKey}:`, value);
          skippedCount++;
          continue;
        }

        // Set element value based on type
        setElementValue(element, value, config.type);
        
        // Update display value if configured
        if (config.display) {
          updateDisplayValue(config.display, value, config.formatter);
        }

        // Trigger the appropriate event to notify the application of the change
        triggerElementEvent(element, config.type);

        appliedCount++;
      } catch (error) {
        console.error(`Error applying setting ${category}.${settingKey}:`, error);
        skippedCount++;
      }
    }
  }

  console.log(`Settings applied: ${appliedCount} successful, ${skippedCount} skipped`);
}

/**
 * Validate a setting value
 * @param {string} category - Setting category
 * @param {string} key - Setting key
 * @param {*} value - Value to validate
 * @param {string} expectedType - Expected value type
 * @returns {boolean} True if valid
 */
function validateSettingValue(category, key, value, expectedType) {
  // Basic type validation
  if (expectedType === 'number' && typeof value !== 'number') {
    return false;
  }
  if (expectedType === 'string' && typeof value !== 'string') {
    return false;
  }
  if (expectedType === 'boolean' && typeof value !== 'boolean') {
    return false;
  }

  // Additional validation could be added here for ranges, enums, etc.
  // For now, basic type checking is sufficient for the loading functionality
  
  return true;
}

/**
 * Set value on DOM element based on type
 * @param {HTMLElement} element - DOM element
 * @param {*} value - Value to set
 * @param {string} type - Value type
 */
function setElementValue(element, value, type) {
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
 * Update display value for a setting
 * @param {string} displayElementId - ID of display element
 * @param {*} value - Value to display
 * @param {Function} formatter - Optional formatter function
 */
function updateDisplayValue(displayElementId, value, formatter) {
  const displayElement = document.getElementById(displayElementId);
  if (displayElement) {
    displayElement.textContent = formatter ? formatter(value) : value;
  }
}

/**
 * Trigger the appropriate event on an element to notify listeners of value changes
 * @param {HTMLElement} element - DOM element
 * @param {string} type - Value type
 */
function triggerElementEvent(element, type) {
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