/**
 * Fast Unit Tests
 * Quick unit tests that don't require external dependencies
 */

const PlatformDetection = require('../utils/platformDetection');
const { PreferencesService } = require('../services/preferencesService');
const AudioDeviceService = require('../services/audioDeviceService');

describe('Fast Unit Tests', () => {
  describe('Platform Detection', () => {
    test('should detect current platform', () => {
      const platform = PlatformDetection.getCurrentPlatform();
      expect(['darwin', 'linux', 'win32']).toContain(platform);
    });

    test('should provide config path', () => {
      const configPath = PlatformDetection.getConfigPath();
      expect(typeof configPath).toBe('string');
      expect(configPath.length).toBeGreaterThan(0);
    });

    test('should detect Raspberry Pi status', () => {
      const isRaspberryPi = PlatformDetection.isRaspberryPi();
      expect(typeof isRaspberryPi).toBe('boolean');
    });

    test('should provide audio device strategy', () => {
      const strategy = PlatformDetection.getAudioDeviceStrategy();
      expect(['macos', 'linux', 'fallback']).toContain(strategy);
    });
  });

  describe('Preferences Service', () => {
    let preferencesService;

    beforeEach(() => {
      preferencesService = new PreferencesService();
    });

    test('should provide default preferences', () => {
      const defaults = preferencesService.getDefaultPreferences();
      
      expect(defaults).toHaveProperty('selectedAudioDevice');
      expect(defaults).toHaveProperty('audioSettings');
      expect(defaults).toHaveProperty('uiSettings');
      expect(defaults).toHaveProperty('systemSettings');
      expect(defaults).toHaveProperty('lastUpdated');
    });

    test('should validate preferences structure', () => {
      const validPrefs = preferencesService.getDefaultPreferences();
      const isValid = preferencesService.validatePreferences(validPrefs);
      expect(isValid).toBe(true);
    });

    test('should reject invalid preferences', () => {
      const invalidPrefs = {
        selectedAudioDevice: 123, // Should be string or null
        audioSettings: 'invalid', // Should be object
      };
      
      const isValid = preferencesService.validatePreferences(invalidPrefs);
      expect(isValid).toBe(false);
    });

    test('should handle missing properties in validation', () => {
      const incompletePrefs = {
        selectedAudioDevice: 'test-device'
        // Missing other required properties
      };
      
      const isValid = preferencesService.validatePreferences(incompletePrefs);
      expect(isValid).toBe(false);
    });
  });

  describe('Audio Device Service', () => {
    let audioDeviceService;

    beforeEach(() => {
      audioDeviceService = new AudioDeviceService();
    });

    test('should initialize without errors', () => {
      expect(audioDeviceService).toBeDefined();
      expect(typeof audioDeviceService.getAudioDevices).toBe('function');
      expect(typeof audioDeviceService.getDefaultDevice).toBe('function');
      expect(typeof audioDeviceService.validateDevice).toBe('function');
    });

    test('should handle device validation', async () => {
      // Test with obviously invalid device ID
      const isValid = await audioDeviceService.validateDevice('invalid-device-id-12345');
      expect(typeof isValid).toBe('boolean');
    });

    test('should handle null device validation', async () => {
      const isValid = await audioDeviceService.validateDevice(null);
      expect(isValid).toBe(false);
    });

    test('should handle empty string device validation', async () => {
      const isValid = await audioDeviceService.validateDevice('');
      expect(isValid).toBe(false);
    });
  });

  describe('Utility Functions', () => {
    test('should handle test utilities', () => {
      expect(global.testUtils).toBeDefined();
      expect(typeof global.testUtils.createMockDevice).toBe('function');
      expect(typeof global.testUtils.createMockPreferences).toBe('function');
    });

    test('should create mock devices', () => {
      const mockDevice = global.testUtils.createMockDevice();
      
      expect(mockDevice).toHaveProperty('id');
      expect(mockDevice).toHaveProperty('name');
      expect(mockDevice).toHaveProperty('type');
      expect(mockDevice).toHaveProperty('platform');
      expect(mockDevice.type).toBe('input');
    });

    test('should create mock preferences', () => {
      const mockPrefs = global.testUtils.createMockPreferences();
      
      expect(mockPrefs).toHaveProperty('selectedAudioDevice');
      expect(mockPrefs).toHaveProperty('audioSettings');
      expect(mockPrefs).toHaveProperty('uiSettings');
      expect(mockPrefs).toHaveProperty('systemSettings');
    });

    test('should allow preference overrides', () => {
      const mockPrefs = global.testUtils.createMockPreferences({
        selectedAudioDevice: 'custom-device'
      });
      
      expect(mockPrefs.selectedAudioDevice).toBe('custom-device');
    });
  });

  describe('Performance Utilities', () => {
    test('should provide performance monitoring', () => {
      expect(global.testPerformance).toBeDefined();
      expect(typeof global.testPerformance.start).toBe('function');
      expect(typeof global.testPerformance.end).toBe('function');
    });

    test('should measure performance', () => {
      const marker = global.testPerformance.start();
      
      expect(marker).toHaveProperty('startTime');
      expect(marker).toHaveProperty('startMemory');
      expect(typeof marker.startTime).toBe('number');
      expect(typeof marker.startMemory).toBe('object');
    });

    test('should calculate performance delta', async () => {
      const marker = global.testPerformance.start();
      
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const result = global.testPerformance.end(marker);
      
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('memoryDelta');
      expect(result.duration).toBeGreaterThan(0);
      expect(typeof result.memoryDelta).toBe('object');
    });
  });

  describe('Global Mocks', () => {
    test('should provide localStorage mock', () => {
      expect(global.localStorage).toBeDefined();
      
      global.localStorage.setItem('test', 'value');
      expect(global.localStorage.getItem('test')).toBe('value');
      
      global.localStorage.removeItem('test');
      expect(global.localStorage.getItem('test')).toBe(null);
    });

    test('should provide sessionStorage mock', () => {
      expect(global.sessionStorage).toBeDefined();
      
      global.sessionStorage.setItem('test', 'value');
      expect(global.sessionStorage.getItem('test')).toBe('value');
      
      global.sessionStorage.clear();
      expect(global.sessionStorage.getItem('test')).toBe(null);
    });

    test('should provide window mock', () => {
      expect(global.window).toBeDefined();
      expect(global.window.location).toBeDefined();
      expect(global.window.navigator).toBeDefined();
    });

    test('should provide document mock', () => {
      expect(global.document).toBeDefined();
      expect(typeof global.document.getElementById).toBe('function');
      expect(typeof global.document.querySelector).toBe('function');
    });
  });

  describe('Helper Functions', () => {
    test('should provide waitFor helper', async () => {
      const startTime = Date.now();
      await global.waitFor(50);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeGreaterThanOrEqual(45);
    });

    test('should provide retry helper', async () => {
      let attempts = 0;
      
      const result = await global.retry(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Not ready');
        }
        return 'success';
      }, 5, 10);
      
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    test('should handle retry failure', async () => {
      let attempts = 0;
      
      try {
        await global.retry(async () => {
          attempts++;
          throw new Error('Always fails');
        }, 3, 10);
        
        fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toBe('Always fails');
        expect(attempts).toBe(3);
      }
    });
  });
});