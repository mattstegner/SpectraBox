const request = require('supertest');
const { spawn } = require('child_process');
const { PreferencesService } = require('../services/preferencesService');

describe('Network Accessibility', () => {
  let serverProcess;
  let preferencesService;

  beforeAll(() => {
    preferencesService = new PreferencesService();
  });

  afterEach(async () => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
      
      // Wait for process to exit
      await new Promise((resolve) => {
        serverProcess.on('exit', resolve);
        setTimeout(resolve, 5000); // Force resolve after 5 seconds
      });
    }
  });

  describe('Server Configuration', () => {
    it('should load host and port from preferences', async () => {
      // Create test preferences with custom network settings
      const testPreferences = {
        selectedAudioDevice: null,
        audioSettings: {
          sampleRate: 44100,
          bufferSize: 1024,
          gain: 1.0
        },
        uiSettings: {
          theme: 'dark',
          autoStart: true,
          fullscreen: false
        },
        systemSettings: {
          port: 3001,
          host: '0.0.0.0'
        },
        lastUpdated: new Date().toISOString()
      };

      // Save test preferences
      await preferencesService.savePreferences(testPreferences);

      // Load preferences and verify they contain network settings
      const loadedPreferences = await preferencesService.getPreferences();
      
      expect(loadedPreferences.systemSettings.host).toBe('0.0.0.0');
      expect(loadedPreferences.systemSettings.port).toBe(3001);
    });

    it('should validate network accessibility preferences', async () => {
      const networkPreferences = {
        selectedAudioDevice: null,
        audioSettings: {
          sampleRate: 44100,
          bufferSize: 1024,
          gain: 1.0
        },
        uiSettings: {
          theme: 'dark',
          autoStart: true,
          fullscreen: false
        },
        systemSettings: {
          port: 8080,
          host: '0.0.0.0'
        },
        lastUpdated: new Date().toISOString()
      };

      const isValid = preferencesService.validatePreferences(networkPreferences);
      expect(isValid).toBe(true);
    });

    it('should reject invalid host configurations', async () => {
      const invalidPreferences = {
        selectedAudioDevice: null,
        audioSettings: {
          sampleRate: 44100,
          bufferSize: 1024,
          gain: 1.0
        },
        uiSettings: {
          theme: 'dark',
          autoStart: true,
          fullscreen: false
        },
        systemSettings: {
          port: 3000,
          host: 123 // Invalid host type
        },
        lastUpdated: new Date().toISOString()
      };

      const isValid = preferencesService.validatePreferences(invalidPreferences);
      expect(isValid).toBe(false);
    });

    it('should reject invalid port configurations', async () => {
      const invalidPreferences = {
        selectedAudioDevice: null,
        audioSettings: {
          sampleRate: 44100,
          bufferSize: 1024,
          gain: 1.0
        },
        uiSettings: {
          theme: 'dark',
          autoStart: true,
          fullscreen: false
        },
        systemSettings: {
          port: 70000, // Invalid port number
          host: '0.0.0.0'
        },
        lastUpdated: new Date().toISOString()
      };

      const isValid = preferencesService.validatePreferences(invalidPreferences);
      expect(isValid).toBe(false);
    });
  });

  describe('Kiosk Mode Configuration', () => {
    it('should provide default kiosk mode settings', async () => {
      const defaultPreferences = preferencesService.getDefaultPreferences();
      
      expect(defaultPreferences.systemSettings.host).toBe('0.0.0.0');
      expect(defaultPreferences.systemSettings.port).toBe(3000);
      expect(defaultPreferences.uiSettings.fullscreen).toBe(false);
    });

    it('should support fullscreen kiosk mode preference', async () => {
      const kioskPreferences = {
        selectedAudioDevice: null,
        audioSettings: {
          sampleRate: 44100,
          bufferSize: 1024,
          gain: 1.0
        },
        uiSettings: {
          theme: 'dark',
          autoStart: true,
          fullscreen: true // Enable fullscreen for kiosk mode
        },
        systemSettings: {
          port: 3000,
          host: '0.0.0.0'
        },
        lastUpdated: new Date().toISOString()
      };

      const isValid = preferencesService.validatePreferences(kioskPreferences);
      expect(isValid).toBe(true);
      
      await preferencesService.savePreferences(kioskPreferences);
      const loaded = await preferencesService.getPreferences();
      
      expect(loaded.uiSettings.fullscreen).toBe(true);
    });
  });

  describe('Network Host Binding', () => {
    it('should support localhost binding', async () => {
      const localhostPreferences = {
        selectedAudioDevice: null,
        audioSettings: {
          sampleRate: 44100,
          bufferSize: 1024,
          gain: 1.0
        },
        uiSettings: {
          theme: 'dark',
          autoStart: true,
          fullscreen: false
        },
        systemSettings: {
          port: 3000,
          host: 'localhost'
        },
        lastUpdated: new Date().toISOString()
      };

      const isValid = preferencesService.validatePreferences(localhostPreferences);
      expect(isValid).toBe(true);
    });

    it('should support specific IP binding', async () => {
      const ipPreferences = {
        selectedAudioDevice: null,
        audioSettings: {
          sampleRate: 44100,
          bufferSize: 1024,
          gain: 1.0
        },
        uiSettings: {
          theme: 'dark',
          autoStart: true,
          fullscreen: false
        },
        systemSettings: {
          port: 3000,
          host: '192.168.1.100'
        },
        lastUpdated: new Date().toISOString()
      };

      const isValid = preferencesService.validatePreferences(ipPreferences);
      expect(isValid).toBe(true);
    });

    it('should support all interfaces binding (0.0.0.0)', async () => {
      const allInterfacesPreferences = {
        selectedAudioDevice: null,
        audioSettings: {
          sampleRate: 44100,
          bufferSize: 1024,
          gain: 1.0
        },
        uiSettings: {
          theme: 'dark',
          autoStart: true,
          fullscreen: false
        },
        systemSettings: {
          port: 3000,
          host: '0.0.0.0'
        },
        lastUpdated: new Date().toISOString()
      };

      const isValid = preferencesService.validatePreferences(allInterfacesPreferences);
      expect(isValid).toBe(true);
    });
  });
});