const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Mock the platform detection module
const mockConfigPath = path.join(os.tmpdir(), 'test-pi-audio-kiosk');
jest.mock('../utils/platformDetection', () => ({
  getConfigPath: jest.fn(() => mockConfigPath)
}));

const { PreferencesService } = require('../services/preferencesService');

describe('PreferencesService', () => {
  let preferencesService;
  let testConfigDir;
  let testPreferencesPath;

  beforeEach(() => {
    preferencesService = new PreferencesService();
    testConfigDir = path.join(os.tmpdir(), 'test-pi-audio-kiosk');
    testPreferencesPath = path.join(testConfigDir, 'preferences.json');
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.rm(testConfigDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('getDefaultPreferences', () => {
    test('should return valid default preferences structure', () => {
      const defaults = preferencesService.getDefaultPreferences();
      
      expect(defaults).toHaveProperty('selectedAudioDevice');
      expect(defaults).toHaveProperty('audioSettings');
      expect(defaults).toHaveProperty('uiSettings');
      expect(defaults).toHaveProperty('systemSettings');
      expect(defaults).toHaveProperty('lastUpdated');
      
      expect(defaults.audioSettings).toHaveProperty('sampleRate', 44100);
      expect(defaults.audioSettings).toHaveProperty('bufferSize', 1024);
      expect(defaults.audioSettings).toHaveProperty('gain', 1.0);
      
      expect(defaults.uiSettings).toHaveProperty('theme', 'dark');
      expect(defaults.uiSettings).toHaveProperty('autoStart', true);
      expect(defaults.uiSettings).toHaveProperty('fullscreen', false);
      
      expect(defaults.systemSettings).toHaveProperty('port', 3000);
      expect(defaults.systemSettings).toHaveProperty('host', '0.0.0.0');
    });

    test('should include valid ISO timestamp', () => {
      const defaults = preferencesService.getDefaultPreferences();
      const timestamp = new Date(defaults.lastUpdated);
      
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.getTime()).not.toBeNaN();
    });
  });

  describe('getUISettingsSchema', () => {
    test('should return complete UI settings schema', () => {
      const schema = preferencesService.getUISettingsSchema();
      
      expect(schema).toHaveProperty('general');
      expect(schema).toHaveProperty('spectrogramInterface');
      expect(schema).toHaveProperty('spectrogramDrawing');
      expect(schema).toHaveProperty('meters');
      
      // Test general schema
      expect(schema.general).toHaveProperty('minFrequency');
      expect(schema.general.minFrequency).toEqual({ type: 'number', min: 20, max: 500 });
      expect(schema.general).toHaveProperty('holdMode');
      expect(schema.general.holdMode).toEqual({ type: 'string', enum: ['latch', 'temporary'] });
      
      // Test spectrogram interface schema
      expect(schema.spectrogramInterface).toHaveProperty('clickInfoSize');
      expect(schema.spectrogramInterface.clickInfoSize).toEqual({ type: 'string', enum: ['small', 'large'] });
      
      // Test spectrogram drawing schema
      expect(schema.spectrogramDrawing).toHaveProperty('fftSize');
      expect(schema.spectrogramDrawing.fftSize).toEqual({ 
        type: 'number', 
        enum: [512, 1024, 2048, 4096, 8192, 16384, 32768] 
      });
      
      // Test meters schema
      expect(schema.meters).toHaveProperty('meterSpeed');
      expect(schema.meters.meterSpeed).toEqual({ type: 'string', enum: ['slow', 'medium', 'fast'] });
    });
  });

  describe('validateSettingValue', () => {
    test('should validate number values within range', () => {
      const result = preferencesService.validateSettingValue('general', 'minFrequency', 100);
      expect(result.success).toBe(true);
    });

    test('should reject number values below minimum', () => {
      const result = preferencesService.validateSettingValue('general', 'minFrequency', 10);
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be at least 20');
    });

    test('should reject number values above maximum', () => {
      const result = preferencesService.validateSettingValue('general', 'minFrequency', 600);
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be at most 500');
    });

    test('should validate string enum values', () => {
      const result = preferencesService.validateSettingValue('general', 'holdMode', 'latch');
      expect(result.success).toBe(true);
    });

    test('should reject invalid string enum values', () => {
      const result = preferencesService.validateSettingValue('general', 'holdMode', 'invalid');
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be one of: latch, temporary');
    });

    test('should validate boolean values', () => {
      const result = preferencesService.validateSettingValue('spectrogramInterface', 'overlappingDisplay', true);
      expect(result.success).toBe(true);
    });

    test('should reject non-boolean values for boolean settings', () => {
      const result = preferencesService.validateSettingValue('spectrogramInterface', 'overlappingDisplay', 'true');
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be a boolean');
    });

    test('should reject wrong type for number settings', () => {
      const result = preferencesService.validateSettingValue('general', 'minFrequency', '100');
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be a number');
    });

    test('should reject unknown category', () => {
      const result = preferencesService.validateSettingValue('unknown', 'setting', 'value');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown settings category');
    });

    test('should reject unknown setting key', () => {
      const result = preferencesService.validateSettingValue('general', 'unknownSetting', 'value');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown setting');
    });

    test('should validate FFT size enum values', () => {
      const validResult = preferencesService.validateSettingValue('spectrogramDrawing', 'fftSize', 4096);
      expect(validResult.success).toBe(true);
      
      const invalidResult = preferencesService.validateSettingValue('spectrogramDrawing', 'fftSize', 3000);
      expect(invalidResult.success).toBe(false);
      expect(invalidResult.error).toContain('must be one of');
    });
  });

  describe('validateUISettings', () => {
    test('should validate complete valid UI settings', () => {
      const validUISettings = {
        general: {
          minFrequency: 20,
          maxFrequency: 20000,
          inputGain: 0.0,
          holdMode: 'latch'
        },
        spectrogramInterface: {
          clickInfoSize: 'large',
          responsiveness: 90,
          amplitudeOffset: 0.0,
          overlappingDisplay: true,
          overlapTolerance: 1.0,
          spectrogramRange: -100
        },
        spectrogramDrawing: {
          fftSize: 4096,
          pixelAveraging: true,
          multiPixelSmoothing: 3,
          frequencyDependentSmoothing: true,
          noiseFloorSubtraction: 0,
          peakEnvelope: true
        },
        meters: {
          meterSpeed: 'medium',
          holdTime: 0.5,
          decibelsSpeed: 150,
          rmsWeighting: 'Z'
        }
      };
      
      const result = preferencesService.validateUISettings(validUISettings);
      expect(result.success).toBe(true);
      expect(result.errors).toBeNull();
    });

    test('should reject null or non-object UI settings', () => {
      const result = preferencesService.validateUISettings(null);
      expect(result.success).toBe(false);
      expect(result.errors.general).toContain('must be an object');
    });

    test('should accept missing categories (partial updates)', () => {
      const incompleteSettings = {
        general: {
          minFrequency: 20,
          maxFrequency: 20000,
          inputGain: 0.0,
          holdMode: 'latch'
        }
        // Missing other categories - this is now allowed for partial updates
      };
      
      const result = preferencesService.validateUISettings(incompleteSettings);
      expect(result.success).toBe(true);
      expect(result.errors).toBe(null);
    });

    test('should reject invalid category structure', () => {
      const invalidSettings = {
        general: 'not an object',
        spectrogramInterface: {},
        spectrogramDrawing: {},
        meters: {}
      };
      
      const result = preferencesService.validateUISettings(invalidSettings);
      expect(result.success).toBe(false);
      expect(result.errors.general).toContain('must be an object');
    });

    test('should collect multiple validation errors', () => {
      const invalidSettings = {
        general: {
          minFrequency: 10, // Too low
          maxFrequency: 25000, // Too high
          inputGain: 0.0,
          holdMode: 'invalid' // Invalid enum
        },
        spectrogramInterface: {
          clickInfoSize: 'large',
          responsiveness: 150, // Too high
          amplitudeOffset: 0.0,
          overlappingDisplay: 'true', // Wrong type
          overlapTolerance: 1.0,
          spectrogramRange: -100
        },
        spectrogramDrawing: {
          fftSize: 4096,
          pixelAveraging: true,
          multiPixelSmoothing: 3,
          frequencyDependentSmoothing: true,
          noiseFloorSubtraction: 0,
          peakEnvelope: true
        },
        meters: {
          meterSpeed: 'medium',
          holdTime: 0.5,
          decibelsSpeed: 150,
          rmsWeighting: 'Z'
        }
      };
      
      const result = preferencesService.validateUISettings(invalidSettings);
      expect(result.success).toBe(false);
      expect(result.errors['general.minFrequency']).toContain('must be at least 20');
      expect(result.errors['general.maxFrequency']).toContain('must be at most 20000');
      expect(result.errors['general.holdMode']).toContain('must be one of');
      expect(result.errors['spectrogramInterface.responsiveness']).toContain('must be at most 100');
      expect(result.errors['spectrogramInterface.overlappingDisplay']).toContain('must be a boolean');
    });

    test('should accept partial settings within categories', () => {
      const incompleteSettings = {
        general: {
          minFrequency: 20
          // Missing other settings - now allowed for partial updates
        },
        spectrogramInterface: {
          clickInfoSize: 'large',
          responsiveness: 90,
          amplitudeOffset: 0.0,
          overlappingDisplay: true,
          overlapTolerance: 1.0,
          spectrogramRange: -100
        },
        spectrogramDrawing: {
          fftSize: 4096,
          pixelAveraging: true,
          multiPixelSmoothing: 3,
          frequencyDependentSmoothing: true,
          noiseFloorSubtraction: 0,
          peakEnvelope: true
        },
        meters: {
          meterSpeed: 'medium',
          holdTime: 0.5,
          decibelsSpeed: 150,
          rmsWeighting: 'Z'
        }
      };
      
      const result = preferencesService.validateUISettings(incompleteSettings);
      expect(result.success).toBe(true);
      expect(result.errors).toBe(null);
    });
  });

  describe('validatePreferences', () => {
    test('should validate correct preferences structure', () => {
      const validPrefs = preferencesService.getDefaultPreferences();
      expect(preferencesService.validatePreferences(validPrefs)).toBe(true);
    });

    test('should reject null or undefined preferences', () => {
      expect(preferencesService.validatePreferences(null)).toBe(false);
      expect(preferencesService.validatePreferences(undefined)).toBe(false);
    });

    test('should reject non-object preferences', () => {
      expect(preferencesService.validatePreferences('string')).toBe(false);
      expect(preferencesService.validatePreferences(123)).toBe(false);
      expect(preferencesService.validatePreferences([])).toBe(false);
    });

    test('should reject preferences missing required sections', () => {
      const incomplete = { selectedAudioDevice: null };
      expect(preferencesService.validatePreferences(incomplete)).toBe(false);
    });

    test('should reject invalid audioSettings', () => {
      const validPrefs = preferencesService.getDefaultPreferences();
      
      // Invalid sampleRate
      validPrefs.audioSettings.sampleRate = -1;
      expect(preferencesService.validatePreferences(validPrefs)).toBe(false);
      
      // Reset and test invalid bufferSize
      validPrefs.audioSettings.sampleRate = 44100;
      validPrefs.audioSettings.bufferSize = 0;
      expect(preferencesService.validatePreferences(validPrefs)).toBe(false);
      
      // Reset and test invalid gain
      validPrefs.audioSettings.bufferSize = 1024;
      validPrefs.audioSettings.gain = -1;
      expect(preferencesService.validatePreferences(validPrefs)).toBe(false);
    });

    test('should reject invalid basic uiSettings', () => {
      const validPrefs = preferencesService.getDefaultPreferences();
      
      validPrefs.uiSettings.theme = 123;
      expect(preferencesService.validatePreferences(validPrefs)).toBe(false);
      
      validPrefs.uiSettings.theme = 'dark';
      validPrefs.uiSettings.autoStart = 'true';
      expect(preferencesService.validatePreferences(validPrefs)).toBe(false);
    });

    test('should reject invalid detailed UI settings', () => {
      const validPrefs = preferencesService.getDefaultPreferences();
      
      // Invalid general settings
      validPrefs.uiSettings.general.minFrequency = 10; // Too low
      expect(preferencesService.validatePreferences(validPrefs)).toBe(false);
      
      // Reset and test invalid spectrogram interface settings
      validPrefs.uiSettings.general.minFrequency = 20;
      validPrefs.uiSettings.spectrogramInterface.responsiveness = 150; // Too high
      expect(preferencesService.validatePreferences(validPrefs)).toBe(false);
      
      // Reset and test invalid spectrogram drawing settings
      validPrefs.uiSettings.spectrogramInterface.responsiveness = 90;
      validPrefs.uiSettings.spectrogramDrawing.fftSize = 3000; // Invalid enum
      expect(preferencesService.validatePreferences(validPrefs)).toBe(false);
      
      // Reset and test invalid meters settings
      validPrefs.uiSettings.spectrogramDrawing.fftSize = 4096;
      validPrefs.uiSettings.meters.holdTime = 3.0; // Too high
      expect(preferencesService.validatePreferences(validPrefs)).toBe(false);
    });

    test('should reject invalid systemSettings', () => {
      const validPrefs = preferencesService.getDefaultPreferences();
      
      // Invalid port
      validPrefs.systemSettings.port = 70000;
      expect(preferencesService.validatePreferences(validPrefs)).toBe(false);
      
      validPrefs.systemSettings.port = 0;
      expect(preferencesService.validatePreferences(validPrefs)).toBe(false);
      
      // Invalid host
      validPrefs.systemSettings.port = 3000;
      validPrefs.systemSettings.host = 123;
      expect(preferencesService.validatePreferences(validPrefs)).toBe(false);
    });
  });

  describe('loadPreferences', () => {
    test('should create default preferences when file does not exist', async () => {
      const preferences = await preferencesService.loadPreferences();
      
      expect(preferences).toEqual(expect.objectContaining({
        selectedAudioDevice: null,
        audioSettings: expect.any(Object),
        uiSettings: expect.any(Object),
        systemSettings: expect.any(Object)
      }));
      
      // Should also create the file
      const fileExists = await fs.access(testPreferencesPath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });

    test('should load existing valid preferences file', async () => {
      // Create test preferences file with complete UI settings structure
      const testPrefs = {
        selectedAudioDevice: 'test-device',
        audioSettings: { sampleRate: 48000, bufferSize: 512, gain: 0.8 },
        uiSettings: { 
          theme: 'light', 
          autoStart: false, 
          fullscreen: true,
          general: {
            minFrequency: 20,
            maxFrequency: 20000,
            inputGain: 0.0,
            holdMode: 'latch'
          },
          spectrogramInterface: {
            clickInfoSize: 'large',
            responsiveness: 90,
            amplitudeOffset: 0.0,
            overlappingDisplay: true,
            overlapTolerance: 1.0,
            spectrogramRange: -100
          },
          spectrogramDrawing: {
            fftSize: 4096,
            pixelAveraging: true,
            multiPixelSmoothing: 3,
            frequencyDependentSmoothing: true,
            noiseFloorSubtraction: 0,
            peakEnvelope: true
          },
          meters: {
            meterSpeed: 'medium',
            holdTime: 0.5,
            decibelsSpeed: 150,
            rmsWeighting: 'Z'
          }
        },
        systemSettings: { port: 8080, host: '127.0.0.1' },
        lastUpdated: '2025-01-20T10:00:00Z'
      };
      
      await fs.mkdir(testConfigDir, { recursive: true });
      await fs.writeFile(testPreferencesPath, JSON.stringify(testPrefs, null, 2));
      
      const loaded = await preferencesService.loadPreferences();
      expect(loaded).toEqual(testPrefs);
    });

    test('should handle corrupted JSON file', async () => {
      // Create corrupted JSON file
      await fs.mkdir(testConfigDir, { recursive: true });
      await fs.writeFile(testPreferencesPath, '{ invalid json }');
      
      const preferences = await preferencesService.loadPreferences();
      
      // Should return defaults
      expect(preferences).toEqual(expect.objectContaining({
        selectedAudioDevice: null,
        audioSettings: expect.any(Object)
      }));
      
      // Should backup corrupted file
      const files = await fs.readdir(testConfigDir);
      const backupFiles = files.filter(f => f.startsWith('preferences.json.backup.'));
      expect(backupFiles.length).toBe(1);
    });

    test('should handle invalid preferences data', async () => {
      // Create file with invalid preferences structure
      const invalidPrefs = { invalid: 'structure' };
      
      await fs.mkdir(testConfigDir, { recursive: true });
      await fs.writeFile(testPreferencesPath, JSON.stringify(invalidPrefs));
      
      const preferences = await preferencesService.loadPreferences();
      
      // Should return defaults
      expect(preferences).toEqual(expect.objectContaining({
        selectedAudioDevice: null,
        audioSettings: expect.any(Object)
      }));
    });
  });

  describe('savePreferences', () => {
    test('should save valid preferences to file', async () => {
      const testPrefs = preferencesService.getDefaultPreferences();
      testPrefs.selectedAudioDevice = 'test-device';
      
      const result = await preferencesService.savePreferences(testPrefs);
      expect(result).toBe(true);
      
      // Verify file was created and contains correct data
      const fileContent = await fs.readFile(testPreferencesPath, 'utf8');
      const savedPrefs = JSON.parse(fileContent);
      
      expect(savedPrefs.selectedAudioDevice).toBe('test-device');
      expect(savedPrefs.lastUpdated).toBeDefined();
    });

    test('should merge incomplete preferences with defaults', async () => {
      const incompletePrefs = { 
        audioSettings: {
          sampleRate: 48000,
          bufferSize: 2048,
          gain: 1.5
        }
        // Missing other required sections - should be merged with defaults
      };
      
      const result = await preferencesService.savePreferences(incompletePrefs);
      expect(result).toBe(true);
      
      // Verify the saved preferences include both provided and default values
      const saved = await preferencesService.getPreferences();
      expect(saved.audioSettings.sampleRate).toBe(48000);
      expect(saved.uiSettings).toBeDefined(); // Should have default UI settings
      expect(saved.systemSettings).toBeDefined(); // Should have default system settings
    });

    test('should update lastUpdated timestamp', async () => {
      const testPrefs = preferencesService.getDefaultPreferences();
      const originalTimestamp = testPrefs.lastUpdated;
      
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await preferencesService.savePreferences(testPrefs);
      
      const fileContent = await fs.readFile(testPreferencesPath, 'utf8');
      const savedPrefs = JSON.parse(fileContent);
      
      expect(savedPrefs.lastUpdated).not.toBe(originalTimestamp);
    });

    test('should create directory if it does not exist', async () => {
      const testPrefs = preferencesService.getDefaultPreferences();
      
      const result = await preferencesService.savePreferences(testPrefs);
      expect(result).toBe(true);
      
      const dirExists = await fs.access(testConfigDir).then(() => true).catch(() => false);
      expect(dirExists).toBe(true);
    });
  });

  describe('getPreferences', () => {
    test('should load preferences if not already loaded', async () => {
      const preferences = await preferencesService.getPreferences();
      
      expect(preferences).toEqual(expect.objectContaining({
        selectedAudioDevice: null,
        audioSettings: expect.any(Object)
      }));
    });

    test('should return cached preferences if already loaded', async () => {
      // Load preferences first time
      await preferencesService.getPreferences();
      
      // Modify the cached preferences
      preferencesService.preferences.selectedAudioDevice = 'cached-device';
      
      // Get preferences again - should return cached version
      const second = await preferencesService.getPreferences();
      expect(second.selectedAudioDevice).toBe('cached-device');
    });
  });

  describe('updatePreferences', () => {
    test('should merge partial updates with existing preferences', async () => {
      // Load initial preferences
      await preferencesService.getPreferences();
      
      const updates = {
        selectedAudioDevice: 'new-device',
        audioSettings: { sampleRate: 48000 }
      };
      
      const result = await preferencesService.updatePreferences(updates);
      expect(result).toBe(true);
      
      const current = await preferencesService.getPreferences();
      expect(current.selectedAudioDevice).toBe('new-device');
      expect(current.audioSettings.sampleRate).toBe(48000);
      expect(current.audioSettings.bufferSize).toBe(1024); // Should preserve existing
    });

    test('should handle deep merge of nested objects', async () => {
      await preferencesService.getPreferences();
      
      const updates = {
        uiSettings: { theme: 'light' }
      };
      
      await preferencesService.updatePreferences(updates);
      
      const current = await preferencesService.getPreferences();
      expect(current.uiSettings.theme).toBe('light');
      expect(current.uiSettings.autoStart).toBe(true); // Should preserve existing
    });
  });

  describe('mergePreferences', () => {
    test('should perform deep merge of preference objects', () => {
      const current = {
        selectedAudioDevice: 'device1',
        audioSettings: { sampleRate: 44100, bufferSize: 1024 },
        uiSettings: { theme: 'dark', autoStart: true }
      };
      
      const updates = {
        selectedAudioDevice: 'device2',
        audioSettings: { sampleRate: 48000 },
        uiSettings: { theme: 'light' }
      };
      
      const merged = preferencesService.mergePreferences(current, updates);
      
      expect(merged.selectedAudioDevice).toBe('device2');
      expect(merged.audioSettings.sampleRate).toBe(48000);
      expect(merged.audioSettings.bufferSize).toBe(1024); // Preserved
      expect(merged.uiSettings.theme).toBe('light');
      expect(merged.uiSettings.autoStart).toBe(true); // Preserved
    });

    test('should not modify original objects', () => {
      const current = { audioSettings: { sampleRate: 44100 } };
      const updates = { audioSettings: { sampleRate: 48000 } };
      
      const merged = preferencesService.mergePreferences(current, updates);
      
      expect(current.audioSettings.sampleRate).toBe(44100); // Unchanged
      expect(merged.audioSettings.sampleRate).toBe(48000);
    });
  });

  describe('flush', () => {
    test('should save current preferences during shutdown', async () => {
      // Load initial preferences
      await preferencesService.getPreferences();
      
      // Modify preferences in memory
      const testPrefs = preferencesService.getDefaultPreferences();
      testPrefs.uiSettings.theme = 'light';
      preferencesService.preferences = testPrefs;
      
      // Flush should save the current preferences
      const result = await preferencesService.flush();
      expect(result).toBe(true);
      
      // Verify preferences were saved to disk
      const savedData = await fs.readFile(testPreferencesPath, 'utf8');
      const savedPrefs = JSON.parse(savedData);
      expect(savedPrefs.uiSettings.theme).toBe('light');
    });

    test('should return true when no preferences are loaded', async () => {
      // Don't load any preferences
      const result = await preferencesService.flush();
      expect(result).toBe(true);
    });

    test('should handle timeout during flush', async () => {
      // Load preferences
      await preferencesService.getPreferences();
      
      // Mock savePreferences to take longer than timeout
      const originalSave = preferencesService.savePreferences;
      preferencesService.savePreferences = jest.fn(() => 
        new Promise(resolve => setTimeout(resolve, 6000)) // 6 seconds
      );
      
      // Flush with short timeout should fail
      const result = await preferencesService.flush(1000); // 1 second timeout
      expect(result).toBe(false);
      
      // Restore original method
      preferencesService.savePreferences = originalSave;
    });

    test('should handle save errors gracefully', async () => {
      // Load preferences
      await preferencesService.getPreferences();
      
      // Mock savePreferences to throw error
      const originalSave = preferencesService.savePreferences;
      preferencesService.savePreferences = jest.fn(() => 
        Promise.reject(new Error('Save failed'))
      );
      
      // Flush should handle error and return false
      const result = await preferencesService.flush();
      expect(result).toBe(false);
      
      // Restore original method
      preferencesService.savePreferences = originalSave;
    });

    test('should use default timeout when none specified', async () => {
      // Load preferences
      await preferencesService.getPreferences();
      
      // Mock savePreferences to succeed quickly
      const originalSave = preferencesService.savePreferences;
      preferencesService.savePreferences = jest.fn(() => Promise.resolve(true));
      
      // Flush without timeout should use default (5000ms)
      const result = await preferencesService.flush();
      expect(result).toBe(true);
      expect(preferencesService.savePreferences).toHaveBeenCalled();
      
      // Restore original method
      preferencesService.savePreferences = originalSave;
    });
  });
});