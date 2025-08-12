const { exec } = require('child_process');
const PlatformDetection = require('../utils/platformDetection');
const { logger } = require('../utils/logger');

// Create service-specific logger
const serviceLogger = logger.child('AudioDeviceService');

/**
 * Cross-platform audio device enumeration service
 * Provides unified interface for detecting audio input devices across different operating systems
 */
class AudioDeviceService {
  constructor() {
    this.deviceCache = null;
    this.cacheTimestamp = null;
    this.cacheTimeout = 30000; // 30 seconds cache timeout
    this.strategy = PlatformDetection.getAudioDeviceStrategy();
  }

  /**
   * Get all available audio input devices
   * @returns {Promise<Array>} Array of audio device objects
   */
  async getAudioDevices() {
    // Check cache first
    if (this.isCacheValid()) {
      serviceLogger.debug('Using cached audio devices');
      return this.deviceCache;
    }

    serviceLogger.info(`Enumerating audio devices using ${this.strategy} strategy`);
    
    try {
      let devices = [];
      
      switch (this.strategy) {
      case 'macos':
        devices = await this.getMacOSDevices();
        break;
      case 'linux':
        devices = await this.getLinuxDevices();
        break;
      case 'windows':
        devices = await this.getWindowsDevices();
        break;
      default:
        serviceLogger.warn(`Unknown platform strategy: ${this.strategy}, using fallback`);
        devices = await this.getFallbackDevices();
        break;
      }

      // Cache the results
      this.deviceCache = devices;
      this.cacheTimestamp = Date.now();
      
      serviceLogger.info(`Found ${devices.length} audio devices`);
      serviceLogger.debug('Audio devices', { devices });
      
      return devices;
    } catch (error) {
      serviceLogger.error('Error enumerating audio devices', error);
      
      // Create a custom error with more context
      const enhancedError = new Error(`Failed to enumerate audio devices: ${error.message}`);
      enhancedError.code = error.code || 'DEVICE_ENUM_ERROR';
      enhancedError.originalError = error;
      enhancedError.platform = this.strategy;
      
      // Throw the enhanced error for better handling upstream
      throw enhancedError;
    }
  }

  /**
   * Get the default audio input device
   * @returns {Promise<Object|null>} Default device object or null
   */
  async getDefaultDevice() {
    const devices = await this.getAudioDevices();
    return devices.find(device => device.isDefault) || devices[0] || null;
  }

  /**
   * Validate if a device ID exists and is available
   * @param {string} deviceId - Device ID to validate
   * @returns {Promise<boolean>} True if device is valid and available
   */
  async validateDevice(deviceId) {
    if (!deviceId) return false;
    
    const devices = await this.getAudioDevices();
    return devices.some(device => device.id === deviceId);
  }

  /**
   * Clear the device cache to force refresh on next call
   */
  clearCache() {
    this.deviceCache = null;
    this.cacheTimestamp = null;
  }

  /**
   * Check if the current cache is still valid
   * @returns {boolean} True if cache is valid
   */
  isCacheValid() {
    return !!(this.deviceCache && 
              this.cacheTimestamp && 
              (Date.now() - this.cacheTimestamp) < this.cacheTimeout);
  }

  /**
   * Get audio devices on macOS using system_profiler
   * @returns {Promise<Array>} Array of audio device objects
   */
  async getMacOSDevices() {
    return new Promise((resolve, reject) => {
      serviceLogger.debug('Attempting to enumerate macOS audio devices using system_profiler');
      
      // First try system_profiler for detailed hardware info
      exec('system_profiler SPAudioDataType -json', (error, stdout, stderr) => {
        if (error) {
          serviceLogger.warn('system_profiler failed, trying alternative method', { 
            error: error.message,
            stderr: stderr
          });
          
          this.getMacOSDevicesAlternative()
            .then(resolve)
            .catch(reject);
          return;
        }

        try {
          const data = JSON.parse(stdout);
          const devices = [];
          
          if (data.SPAudioDataType) {
            data.SPAudioDataType.forEach(audioItem => {
              if (audioItem._items) {
                audioItem._items.forEach(device => {
                  // Look for input devices
                  if (device._name && (device.coreaudio_input_source || device.coreaudio_device_input)) {
                    devices.push({
                      id: this.generateDeviceId(device._name, 'macos'),
                      name: device._name,
                      isDefault: false, // Will be determined separately
                      type: 'input',
                      channels: device.coreaudio_input_source?.coreaudio_input_channels || 2,
                      sampleRates: [44100, 48000], // Common rates, could be more specific
                      platform: 'macos'
                    });
                  }
                });
              }
            });
          }

          // If no devices found via system_profiler, try alternative
          if (devices.length === 0) {
            serviceLogger.warn('No devices found in system_profiler output, trying alternative method');
            this.getMacOSDevicesAlternative()
              .then(resolve)
              .catch(reject);
          } else {
            serviceLogger.debug(`Found ${devices.length} devices via system_profiler`);
            resolve(this.markDefaultDevice(devices));
          }
        } catch (parseError) {
          serviceLogger.warn('Failed to parse system_profiler output', { 
            error: parseError.message,
            outputSample: stdout.substring(0, 200) + '...'
          });
          
          this.getMacOSDevicesAlternative()
            .then(resolve)
            .catch(reject);
        }
      });
    });
  }

  /**
   * Alternative macOS device detection using audiodevice command or basic fallback
   * @returns {Promise<Array>} Array of audio device objects
   */
  async getMacOSDevicesAlternative() {
    // Try to use SoX if available, otherwise provide basic fallback
    return new Promise((resolve) => {
      exec('which sox', (error) => {
        if (!error) {
          // SoX is available, try to use it
          exec('sox -V1 -n -t coreaudio default trim 0 0 2>&1', (soxError, stdout) => {
            if (!soxError && stdout.includes('coreaudio')) {
              resolve([{
                id: 'default-macos-input',
                name: 'Default Audio Input',
                isDefault: true,
                type: 'input',
                channels: 2,
                sampleRates: [44100, 48000],
                platform: 'macos'
              }]);
            } else {
              resolve(this.getMacOSFallbackDevices());
            }
          });
        } else {
          resolve(this.getMacOSFallbackDevices());
        }
      });
    });
  }

  /**
   * Fallback device list for macOS
   * @returns {Array} Basic device list
   */
  getMacOSFallbackDevices() {
    return [
      {
        id: 'default-macos-input',
        name: 'Default Audio Input',
        isDefault: true,
        type: 'input',
        channels: 2,
        sampleRates: [44100, 48000],
        platform: 'macos'
      },
      {
        id: 'built-in-microphone',
        name: 'Built-in Microphone',
        isDefault: false,
        type: 'input',
        channels: 1,
        sampleRates: [44100, 48000],
        platform: 'macos'
      }
    ];
  }

  /**
   * Get audio devices on Linux using ALSA and PulseAudio commands
   * @returns {Promise<Array>} Array of audio device objects
   */
  async getLinuxDevices() {
    const devices = [];
    
    // Try PulseAudio first (more common on desktop Linux)
    try {
      const pulseDevices = await this.getPulseAudioDevices();
      devices.push(...pulseDevices);
    } catch (error) {
      console.warn('PulseAudio enumeration failed:', error.message);
    }

    // Try ALSA as fallback or additional source
    try {
      const alsaDevices = await this.getALSADevices();
      // Merge ALSA devices, avoiding duplicates
      alsaDevices.forEach(alsaDevice => {
        if (!devices.some(device => device.name === alsaDevice.name)) {
          devices.push(alsaDevice);
        }
      });
    } catch (error) {
      console.warn('ALSA enumeration failed:', error.message);
    }

    // If no devices found, provide fallback
    if (devices.length === 0) {
      return this.getLinuxFallbackDevices();
    }

    return this.markDefaultDevice(devices);
  }

  /**
   * Get audio devices using PulseAudio (pactl)
   * @returns {Promise<Array>} Array of audio device objects
   */
  async getPulseAudioDevices() {
    return new Promise((resolve, reject) => {
      exec('pactl list sources short', (error, stdout, _stderr) => {
        if (error) {
          reject(new Error(`PulseAudio command failed: ${error.message}`));
          return;
        }

        const devices = [];
        const lines = stdout.trim().split('\n');
        
        lines.forEach(line => {
          if (line.trim()) {
            const parts = line.split('\t');
            if (parts.length >= 2) {
              const id = parts[1];
              const name = parts[1].replace(/^alsa_input\./, '').replace(/\./g, ' ');
              
              devices.push({
                id: this.generateDeviceId(id, 'linux-pulse'),
                name: this.formatDeviceName(name),
                isDefault: false,
                type: 'input',
                channels: 2, // Default assumption
                sampleRates: [44100, 48000],
                platform: 'linux'
              });
            }
          }
        });

        resolve(devices);
      });
    });
  }

  /**
   * Get audio devices using ALSA (arecord)
   * @returns {Promise<Array>} Array of audio device objects
   */
  async getALSADevices() {
    return new Promise((resolve, reject) => {
      exec('arecord -l', (error, stdout, _stderr) => {
        if (error) {
          reject(new Error(`ALSA command failed: ${error.message}`));
          return;
        }

        const devices = [];
        const lines = stdout.split('\n');
        
        lines.forEach(line => {
          // Parse lines like: "card 0: PCH [HDA Intel PCH], device 0: ALC3246 Analog [ALC3246 Analog]"
          const match = line.match(/card (\d+): (.+?) \[(.+?)\], device (\d+): (.+?) \[(.+?)\]/);
          if (match) {
            const [, cardNum, , cardDesc, deviceNum, , deviceDesc] = match;
            const id = `hw:${cardNum},${deviceNum}`;
            
            devices.push({
              id: this.generateDeviceId(id, 'linux-alsa'),
              name: `${deviceDesc} (${cardDesc})`,
              isDefault: false,
              type: 'input',
              channels: 2,
              sampleRates: [44100, 48000],
              platform: 'linux'
            });
          }
        });

        resolve(devices);
      });
    });
  }

  /**
   * Fallback device list for Linux
   * @returns {Array} Basic device list
   */
  getLinuxFallbackDevices() {
    return [
      {
        id: 'default-linux-input',
        name: 'Default Audio Input',
        isDefault: true,
        type: 'input',
        channels: 2,
        sampleRates: [44100, 48000],
        platform: 'linux'
      },
      {
        id: 'hw:0,0',
        name: 'Hardware Device 0',
        isDefault: false,
        type: 'input',
        channels: 2,
        sampleRates: [44100, 48000],
        platform: 'linux'
      }
    ];
  }

  /**
   * Get audio devices on Windows using PowerShell and WMI
   * @returns {Promise<Array>} Array of audio device objects
   */
  async getWindowsDevices() {
    const devices = [];
    
    // Try PowerShell WMI query first
    try {
      const wmiDevices = await this.getWindowsWMIDevices();
      devices.push(...wmiDevices);
    } catch (error) {
      console.warn('Windows WMI enumeration failed:', error.message);
    }

    // Try PowerShell Get-AudioDevice as fallback (if available)
    try {
      const psDevices = await this.getWindowsPowerShellDevices();
      // Merge PowerShell devices, avoiding duplicates
      psDevices.forEach(psDevice => {
        if (!devices.some(device => device.name === psDevice.name)) {
          devices.push(psDevice);
        }
      });
    } catch (error) {
      console.warn('Windows PowerShell enumeration failed:', error.message);
    }

    // If no devices found, provide fallback
    if (devices.length === 0) {
      return this.getWindowsFallbackDevices();
    }

    return this.markDefaultDevice(devices);
  }

  /**
   * Get audio devices using Windows WMI (Windows Management Instrumentation)
   * @returns {Promise<Array>} Array of audio device objects
   */
  async getWindowsWMIDevices() {
    return new Promise((resolve, reject) => {
      // PowerShell command to query audio input devices via WMI
      const psCommand = `
        Get-WmiObject -Class Win32_SoundDevice | 
        Where-Object { $_.Status -eq 'OK' } | 
        Select-Object Name, DeviceID, Status | 
        ConvertTo-Json
      `;
      
      exec(`powershell -Command "${psCommand}"`, (error, stdout, _stderr) => {
        if (error) {
          reject(new Error(`Windows WMI command failed: ${error.message}`));
          return;
        }

        try {
          const devices = [];
          let data;
          
          // Handle both single object and array responses
          try {
            data = JSON.parse(stdout);
            if (!Array.isArray(data)) {
              data = [data];
            }
          } catch (parseError) {
            // If JSON parsing fails, try to extract device names from text output
            const lines = stdout.split('\n');
            data = lines
              .filter(line => line.includes('Name') && line.includes(':'))
              .map(line => ({
                Name: line.split(':')[1]?.trim(),
                DeviceID: `windows-${Date.now()}-${Math.random()}`,
                Status: 'OK'
              }));
          }

          data.forEach((device, index) => {
            if (device && device.Name) {
              devices.push({
                id: this.generateDeviceId(device.DeviceID || device.Name, 'windows-wmi'),
                name: device.Name,
                isDefault: index === 0, // Mark first as default
                type: 'input',
                channels: 2,
                sampleRates: [44100, 48000],
                platform: 'windows'
              });
            }
          });

          resolve(devices);
        } catch (parseError) {
          reject(new Error(`Failed to parse Windows WMI output: ${parseError.message}`));
        }
      });
    });
  }

  /**
   * Get audio devices using PowerShell Get-AudioDevice (if AudioDeviceCmdlets module is available)
   * @returns {Promise<Array>} Array of audio device objects
   */
  async getWindowsPowerShellDevices() {
    return new Promise((resolve, reject) => {
      // Try to use AudioDeviceCmdlets module if available
      const psCommand = `
        if (Get-Module -ListAvailable -Name AudioDeviceCmdlets) {
          Import-Module AudioDeviceCmdlets;
          Get-AudioDevice -Type Recording | 
          Select-Object Name, ID, Default | 
          ConvertTo-Json
        } else {
          # Fallback to basic device enumeration
          Get-WmiObject -Class Win32_PnPEntity | 
          Where-Object { $_.Name -like '*microphone*' -or $_.Name -like '*audio*' } | 
          Select-Object Name, DeviceID | 
          ConvertTo-Json
        }
      `;
      
      exec(`powershell -Command "${psCommand}"`, (error, stdout, _stderr) => {
        if (error) {
          reject(new Error(`Windows PowerShell command failed: ${error.message}`));
          return;
        }

        try {
          const devices = [];
          let data;
          
          try {
            data = JSON.parse(stdout);
            if (!Array.isArray(data)) {
              data = [data];
            }
          } catch (parseError) {
            // Fallback parsing
            resolve([]);
            return;
          }

          data.forEach(device => {
            if (device && device.Name) {
              devices.push({
                id: this.generateDeviceId(device.ID || device.DeviceID || device.Name, 'windows-ps'),
                name: device.Name,
                isDefault: device.Default === true || device.Default === 'True',
                type: 'input',
                channels: 2,
                sampleRates: [44100, 48000],
                platform: 'windows'
              });
            }
          });

          resolve(devices);
        } catch (parseError) {
          reject(new Error(`Failed to parse Windows PowerShell output: ${parseError.message}`));
        }
      });
    });
  }

  /**
   * Fallback device list for Windows
   * @returns {Array} Basic device list
   */
  getWindowsFallbackDevices() {
    return [
      {
        id: 'default-windows-input',
        name: 'Default Audio Input',
        isDefault: true,
        type: 'input',
        channels: 2,
        sampleRates: [44100, 48000],
        platform: 'windows'
      },
      {
        id: 'windows-microphone',
        name: 'Microphone',
        isDefault: false,
        type: 'input',
        channels: 1,
        sampleRates: [44100, 48000],
        platform: 'windows'
      },
      {
        id: 'windows-line-in',
        name: 'Line In',
        isDefault: false,
        type: 'input',
        channels: 2,
        sampleRates: [44100, 48000],
        platform: 'windows'
      }
    ];
  }

  /**
   * Generic fallback for unsupported platforms
   * @returns {Promise<Array>} Array of basic audio device objects
   */
  async getFallbackDevices() {
    return [
      {
        id: 'default-fallback-input',
        name: 'Default Audio Input',
        isDefault: true,
        type: 'input',
        channels: 2,
        sampleRates: [44100, 48000],
        platform: 'fallback'
      }
    ];
  }

  /**
   * Mark the first device as default if no default is set
   * @param {Array} devices - Array of device objects
   * @returns {Array} Array with default device marked
   */
  markDefaultDevice(devices) {
    if (devices.length > 0 && !devices.some(device => device.isDefault)) {
      devices[0].isDefault = true;
    }
    return devices;
  }

  /**
   * Generate a consistent device ID
   * @param {string} name - Device name or identifier
   * @param {string} platform - Platform identifier
   * @returns {string} Generated device ID
   */
  generateDeviceId(name, platform) {
    return `${platform}-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  }

  /**
   * Format device name for better readability
   * @param {string} name - Raw device name
   * @returns {string} Formatted device name
   */
  formatDeviceName(name) {
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .trim();
  }
}

module.exports = AudioDeviceService;