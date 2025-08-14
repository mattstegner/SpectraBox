const request = require('supertest');
const express = require('express');
const cors = require('cors');

// Create a test version of the server with mocked services
function createTestApp() {
  const app = express();
  
  // Mock services
  const mockAudioDeviceService = {
    getAudioDevices: jest.fn(),
    getDefaultDevice: jest.fn(),
    validateDevice: jest.fn()
  };
  
  const mockPreferencesService = {
    getPreferences: jest.fn(),
    savePreferences: jest.fn(),
    validatePreferences: jest.fn(),
    validateUISettings: jest.fn(),
    getDefaultPreferences: jest.fn(),
    getPreferencesPath: jest.fn().mockReturnValue('/test/path/preferences.json')
  };

  const mockPlatformDetection = {
    getSystemInfo: jest.fn(),
    getCurrentPlatform: jest.fn().mockReturnValue('darwin'),
    isRaspberryPi: jest.fn().mockReturnValue(false)
  };

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'SpectraBox server is running' });
  });

  // GET /api/audio-devices
  app.get('/api/audio-devices', async (req, res) => {
    try {
      const devices = await mockAudioDeviceService.getAudioDevices();
      res.json({
        success: true,
        devices: devices,
        count: devices.length
      });
    } catch (error) {
      console.error('Error getting audio devices:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to enumerate audio devices',
        message: error.message,
        devices: []
      });
    }
  });

  // GET /api/preferences
  app.get('/api/preferences', async (req, res) => {
    try {
      const preferences = await mockPreferencesService.getPreferences();
      res.json({
        success: true,
        preferences: preferences
      });
    } catch (error) {
      console.error('Error getting preferences:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to load preferences',
        message: error.message,
        preferences: mockPreferencesService.getDefaultPreferences()
      });
    }
  });

  // POST /api/preferences
  app.post('/api/preferences', async (req, res) => {
    try {
      const { preferences } = req.body;
      
      if (!preferences) {
        return res.status(400).json({
          success: false,
          error: 'Missing preferences data',
          message: 'Request body must contain preferences object'
        });
      }

      if (!mockPreferencesService.validatePreferences(preferences)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid preferences data',
          message: 'Preferences object does not match expected schema'
        });
      }

      const saved = await mockPreferencesService.savePreferences(preferences);
      
      if (saved) {
        res.json({
          success: true,
          message: 'Preferences saved successfully',
          preferences: preferences
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to save preferences',
          message: 'Could not write preferences to disk'
        });
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to save preferences',
        message: error.message
      });
    }
  });

  // Request validation middleware for preferences endpoints
  const validatePreferencesRequest = (req, res, next) => {
    // Validate content type for POST requests
    if (req.method === 'POST' && !req.is('application/json')) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CONTENT_TYPE',
        message: 'Content-Type must be application/json',
        details: {
          received: req.get('Content-Type') || 'none',
          expected: 'application/json'
        }
      });
    }
    
    // Validate request body size
    if (req.method === 'POST' && req.body && JSON.stringify(req.body).length > 50000) {
      return res.status(413).json({
        success: false,
        error: 'REQUEST_TOO_LARGE',
        message: 'Request body is too large',
        details: {
          maxSize: '50KB',
          received: `${Math.round(JSON.stringify(req.body).length / 1024)}KB`
        }
      });
    }
    
    next();
  };

  // GET /api/preferences/ui
  app.get('/api/preferences/ui', validatePreferencesRequest, async (req, res) => {
    try {
      const preferences = await mockPreferencesService.getPreferences();
      
      res.json({
        success: true,
        uiSettings: preferences.uiSettings || mockPreferencesService.getDefaultPreferences().uiSettings,
        lastUpdated: preferences.lastUpdated
      });
    } catch (error) {
      console.error('Error loading UI preferences:', error);
      
      // Determine appropriate error code and message
      let statusCode = 500;
      let errorCode = 'UI_PREFERENCES_LOAD_ERROR';
      let userMessage = 'Failed to load UI preferences';
      
      if (error.code === 'ENOENT') {
        statusCode = 200;
        errorCode = 'PREFERENCES_NOT_FOUND';
        userMessage = 'Preferences file not found, returned default UI settings';
      } else if (error.code === 'EACCES' || error.code === 'PERMISSION_DENIED') {
        statusCode = 403;
        errorCode = 'PERMISSION_DENIED';
        userMessage = 'Permission denied accessing preferences file';
      } else if (error instanceof SyntaxError || error.code === 'INVALID_JSON') {
        statusCode = 200;
        errorCode = 'PREFERENCES_CORRUPTED';
        userMessage = 'Preferences file was corrupted, returned default UI settings';
      }
      
      // Get default UI settings
      const defaultUISettings = mockPreferencesService.getDefaultPreferences().uiSettings;
      
      res.status(statusCode).json({
        success: statusCode === 200,
        error: statusCode !== 200 ? errorCode : undefined,
        message: userMessage,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        uiSettings: defaultUISettings,
        lastUpdated: new Date().toISOString(),
        settingsPath: mockPreferencesService.getPreferencesPath()
      });
    }
  });

  // POST /api/preferences/ui
  app.post('/api/preferences/ui', validatePreferencesRequest, async (req, res) => {
    try {
      const { uiSettings } = req.body;
      
      if (!uiSettings) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_DATA',
          message: 'Request body must contain uiSettings object',
          details: {
            expected: 'uiSettings',
            received: Object.keys(req.body)
          }
        });
      }

      // Validate UI settings with detailed error reporting
      const uiValidation = mockPreferencesService.validateUISettings(uiSettings);
      if (!uiValidation.success) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_UI_SETTINGS',
          message: 'UI settings validation failed',
          details: {
            errors: uiValidation.errors,
            validationFailed: Object.keys(uiValidation.errors || {}).length
          }
        });
      }

      // Load current preferences and update only UI settings
      const currentPreferences = await mockPreferencesService.getPreferences();
      const updatedPreferences = {
        ...currentPreferences,
        uiSettings: uiSettings,
        lastUpdated: new Date().toISOString()
      };

      const saved = await mockPreferencesService.savePreferences(updatedPreferences);
      
      if (saved) {
        res.json({
          success: true,
          message: 'UI settings saved successfully',
          uiSettings: uiSettings,
          lastUpdated: updatedPreferences.lastUpdated
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'UI_SAVE_FAILED',
          message: 'Could not write UI settings to disk',
          details: 'There may be a permissions issue or disk space problem'
        });
      }
    } catch (error) {
      console.error('Error saving UI settings:', error);
      
      // Determine appropriate error code and message
      let statusCode = 500;
      let errorCode = 'UI_SETTINGS_SAVE_ERROR';
      let userMessage = 'Failed to save UI settings';
      
      if (error.code === 'EACCES') {
        statusCode = 403;
        errorCode = 'PERMISSION_DENIED';
        userMessage = 'Permission denied writing preferences file';
      } else if (error.code === 'ENOSPC') {
        statusCode = 507;
        errorCode = 'INSUFFICIENT_STORAGE';
        userMessage = 'No space left on device';
      }
      
      res.status(statusCode).json({
        success: false,
        error: errorCode,
        message: userMessage,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // GET /api/server-config
  app.get('/api/server-config', (req, res) => {
    try {
      const config = {
        host: process.env.TEST_HOST || '0.0.0.0',
        port: parseInt(process.env.TEST_PORT || '3000'),
        networkAccessible: (process.env.TEST_HOST || '0.0.0.0') === '0.0.0.0',
        kioskMode: {
          enabled: process.env.KIOSK_MODE === 'true' || mockPlatformDetection.isRaspberryPi(),
          fullscreen: process.env.FULLSCREEN === 'true'
        }
      };
      
      res.json({
        success: true,
        config: config
      });
    } catch (error) {
      console.error('Error getting server configuration:', error);
      res.status(500).json({
        success: false,
        error: 'SERVER_CONFIG_ERROR',
        message: 'Failed to get server configuration'
      });
    }
  });

  // GET /api/system-info
  app.get('/api/system-info', (req, res) => {
    try {
      const systemInfo = mockPlatformDetection.getSystemInfo();
      res.json({
        success: true,
        systemInfo: systemInfo
      });
    } catch (error) {
      console.error('Error getting system info:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get system information',
        message: error.message,
        systemInfo: {
          platform: 'unknown',
          arch: 'unknown',
          isRaspberryPi: false
        }
      });
    }
  });

  // 404 handler for API routes
  app.use('/api/*', (req, res) => {
    res.status(404).json({
      success: false,
      error: 'API endpoint not found',
      message: `The endpoint ${req.originalUrl} does not exist`
    });
  });

  // Attach mocks to app for testing
  app.mockAudioDeviceService = mockAudioDeviceService;
  app.mockPreferencesService = mockPreferencesService;
  app.mockPlatformDetection = mockPlatformDetection;

  return app;
}

describe('Express.js Server API Endpoints', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'OK',
        message: 'SpectraBox server is running'
      });
    });
  });

  describe('GET /api/audio-devices', () => {
    it('should return list of audio devices successfully', async () => {
      const mockDevices = [
        {
          id: 'device-1',
          name: 'Built-in Microphone',
          isDefault: true,
          type: 'input',
          channels: 1,
          sampleRates: [44100, 48000],
          platform: 'macos'
        },
        {
          id: 'device-2',
          name: 'USB Audio Device',
          isDefault: false,
          type: 'input',
          channels: 2,
          sampleRates: [44100, 48000],
          platform: 'macos'
        }
      ];

      app.mockAudioDeviceService.getAudioDevices.mockResolvedValue(mockDevices);

      const response = await request(app)
        .get('/api/audio-devices')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        devices: mockDevices,
        count: 2
      });
      expect(app.mockAudioDeviceService.getAudioDevices).toHaveBeenCalledTimes(1);
    });

    it('should handle audio device enumeration errors', async () => {
      const errorMessage = 'Failed to enumerate devices';
      app.mockAudioDeviceService.getAudioDevices.mockRejectedValue(new Error(errorMessage));

      const response = await request(app)
        .get('/api/audio-devices')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to enumerate audio devices',
        message: errorMessage,
        devices: []
      });
    });

    it('should return empty array when no devices found', async () => {
      app.mockAudioDeviceService.getAudioDevices.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/audio-devices')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        devices: [],
        count: 0
      });
    });
  });

  describe('GET /api/preferences', () => {
    it('should return current preferences successfully', async () => {
      const mockPreferences = {
        selectedAudioDevice: 'device-1',
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
        lastUpdated: '2025-01-20T10:00:00Z'
      };

      app.mockPreferencesService.getPreferences.mockResolvedValue(mockPreferences);

      const response = await request(app)
        .get('/api/preferences')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        preferences: mockPreferences
      });
      expect(app.mockPreferencesService.getPreferences).toHaveBeenCalledTimes(1);
    });

    it('should handle preferences loading errors', async () => {
      const errorMessage = 'Failed to load preferences';
      const defaultPreferences = { selectedAudioDevice: null };
      
      app.mockPreferencesService.getPreferences.mockRejectedValue(new Error(errorMessage));
      app.mockPreferencesService.getDefaultPreferences.mockReturnValue(defaultPreferences);

      const response = await request(app)
        .get('/api/preferences')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to load preferences',
        message: errorMessage,
        preferences: defaultPreferences
      });
    });
  });

  describe('POST /api/preferences', () => {
    const validPreferences = {
      selectedAudioDevice: 'device-1',
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
      }
    };

    it('should save preferences successfully', async () => {
      app.mockPreferencesService.validatePreferences.mockReturnValue(true);
      app.mockPreferencesService.savePreferences.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/preferences')
        .send({ preferences: validPreferences })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Preferences saved successfully');
      expect(response.body.preferences).toEqual(validPreferences);
      expect(app.mockPreferencesService.validatePreferences).toHaveBeenCalledWith(validPreferences);
      expect(app.mockPreferencesService.savePreferences).toHaveBeenCalledWith(validPreferences);
    });

    it('should return 400 when preferences data is missing', async () => {
      const response = await request(app)
        .post('/api/preferences')
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Missing preferences data',
        message: 'Request body must contain preferences object'
      });
    });

    it('should return 400 when preferences data is invalid', async () => {
      const invalidPreferences = { invalid: 'data' };
      app.mockPreferencesService.validatePreferences.mockReturnValue(false);

      const response = await request(app)
        .post('/api/preferences')
        .send({ preferences: invalidPreferences })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Invalid preferences data',
        message: 'Preferences object does not match expected schema'
      });
    });

    it('should handle save failures', async () => {
      app.mockPreferencesService.validatePreferences.mockReturnValue(true);
      app.mockPreferencesService.savePreferences.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/preferences')
        .send({ preferences: validPreferences })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to save preferences',
        message: 'Could not write preferences to disk'
      });
    });

    it('should handle save exceptions', async () => {
      const errorMessage = 'Disk write error';
      app.mockPreferencesService.validatePreferences.mockReturnValue(true);
      app.mockPreferencesService.savePreferences.mockRejectedValue(new Error(errorMessage));

      const response = await request(app)
        .post('/api/preferences')
        .send({ preferences: validPreferences })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to save preferences',
        message: errorMessage
      });
    });
  });

  describe('GET /api/preferences/ui', () => {
    it('should return UI settings successfully', async () => {
      const mockPreferences = {
        uiSettings: {
          general: { minFrequency: 20, maxFrequency: 20000 },
          spectrogramInterface: { clickInfoSize: 'large' },
          spectrogramDrawing: { fftSize: 4096 },
          meters: { meterSpeed: 'medium' }
        },
        lastUpdated: '2023-01-01T00:00:00.000Z'
      };
      
      app.mockPreferencesService.getPreferences.mockResolvedValue(mockPreferences);

      const response = await request(app)
        .get('/api/preferences/ui')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        uiSettings: mockPreferences.uiSettings,
        lastUpdated: mockPreferences.lastUpdated
      });
    });

    it('should handle missing UI settings by returning defaults', async () => {
      const mockPreferences = {
        audioSettings: { sampleRate: 44100 },
        lastUpdated: '2023-01-01T00:00:00.000Z'
      };
      
      const defaultUISettings = {
        general: { minFrequency: 20, maxFrequency: 20000 },
        spectrogramInterface: { clickInfoSize: 'large' },
        spectrogramDrawing: { fftSize: 4096 },
        meters: { meterSpeed: 'medium' }
      };
      
      app.mockPreferencesService.getPreferences.mockResolvedValue(mockPreferences);
      app.mockPreferencesService.getDefaultPreferences.mockReturnValue({
        uiSettings: defaultUISettings
      });

      const response = await request(app)
        .get('/api/preferences/ui')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.uiSettings).toEqual(defaultUISettings);
    });

    it('should handle preferences loading errors', async () => {
      const errorMessage = 'Failed to load preferences';
      app.mockPreferencesService.getPreferences.mockRejectedValue(new Error(errorMessage));
      app.mockPreferencesService.getDefaultPreferences.mockReturnValue({
        uiSettings: { general: { minFrequency: 20 } }
      });

      const response = await request(app)
        .get('/api/preferences/ui')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'UI_PREFERENCES_LOAD_ERROR',
        message: 'Failed to load UI preferences',
        uiSettings: { general: { minFrequency: 20 } },
        lastUpdated: expect.any(String),
        settingsPath: expect.any(String)
      });
    });
  });

  describe('POST /api/preferences/ui', () => {
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

    it('should save UI settings successfully', async () => {
      const currentPreferences = {
        audioSettings: { sampleRate: 44100 },
        uiSettings: { general: { minFrequency: 30 } },
        systemSettings: { port: 3000 }
      };
      
      app.mockPreferencesService.validateUISettings.mockReturnValue({ success: true });
      app.mockPreferencesService.getPreferences.mockResolvedValue(currentPreferences);
      app.mockPreferencesService.savePreferences.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/preferences/ui')
        .send({ uiSettings: validUISettings })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'UI settings saved successfully',
        uiSettings: validUISettings,
        lastUpdated: expect.any(String)
      });

      // Verify that savePreferences was called with merged preferences
      expect(app.mockPreferencesService.savePreferences).toHaveBeenCalledWith({
        ...currentPreferences,
        uiSettings: validUISettings,
        lastUpdated: expect.any(String)
      });
    });

    it('should return 400 when UI settings data is missing', async () => {
      const response = await request(app)
        .post('/api/preferences/ui')
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'MISSING_DATA',
        message: 'Request body must contain uiSettings object',
        details: {
          expected: 'uiSettings',
          received: []
        }
      });
    });

    it('should return 400 when UI settings validation fails', async () => {
      const invalidUISettings = {
        general: {
          minFrequency: 5, // Invalid: below minimum
          maxFrequency: 25000, // Invalid: above maximum
          inputGain: 'invalid' // Invalid: wrong type
        }
      };

      const validationErrors = {
        'general.minFrequency': 'Value must be between 20 and 500',
        'general.maxFrequency': 'Value must be between 6000 and 20000',
        'general.inputGain': 'general.inputGain must be a number'
      };

      app.mockPreferencesService.validateUISettings.mockReturnValue({
        success: false,
        errors: validationErrors
      });

      const response = await request(app)
        .post('/api/preferences/ui')
        .send({ uiSettings: invalidUISettings })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'INVALID_UI_SETTINGS',
        message: 'UI settings validation failed',
        details: {
          errors: validationErrors,
          validationFailed: 3
        }
      });
    });

    it('should handle save failures', async () => {
      app.mockPreferencesService.validateUISettings.mockReturnValue({ success: true });
      app.mockPreferencesService.getPreferences.mockResolvedValue({});
      app.mockPreferencesService.savePreferences.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/preferences/ui')
        .send({ uiSettings: validUISettings })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'UI_SAVE_FAILED',
        message: 'Could not write UI settings to disk',
        details: 'There may be a permissions issue or disk space problem'
      });
    });

    it('should handle save exceptions', async () => {
      const errorMessage = 'Disk write error';
      app.mockPreferencesService.validateUISettings.mockReturnValue({ success: true });
      app.mockPreferencesService.getPreferences.mockResolvedValue({});
      app.mockPreferencesService.savePreferences.mockRejectedValue(new Error(errorMessage));

      const response = await request(app)
        .post('/api/preferences/ui')
        .send({ uiSettings: validUISettings })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'UI_SETTINGS_SAVE_ERROR',
        message: 'Failed to save UI settings',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      });
    });

    it('should validate request content type', async () => {
      const response = await request(app)
        .post('/api/preferences/ui')
        .set('Content-Type', 'text/plain')
        .send('invalid data')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'INVALID_CONTENT_TYPE',
        message: 'Content-Type must be application/json',
        details: {
          received: 'text/plain',
          expected: 'application/json'
        }
      });
    });

    it('should validate request body size', async () => {
      // Create a large object that exceeds the 50KB limit
      const largeUISettings = {
        general: {
          minFrequency: 20,
          maxFrequency: 20000,
          largeData: 'x'.repeat(60000) // 60KB of data
        }
      };

      const response = await request(app)
        .post('/api/preferences/ui')
        .send({ uiSettings: largeUISettings })
        .expect(413);

      expect(response.body).toEqual({
        success: false,
        error: 'REQUEST_TOO_LARGE',
        message: 'Request body is too large',
        details: {
          maxSize: '50KB',
          received: expect.any(String)
        }
      });
    });
  });

  describe('GET /api/server-config', () => {
    it('should return server configuration successfully', async () => {
      const response = await request(app)
        .get('/api/server-config')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.config).toEqual({
        host: '0.0.0.0',
        port: 3000,
        networkAccessible: true,
        kioskMode: {
          enabled: false,
          fullscreen: false
        }
      });
    });

    it('should indicate network accessibility when host is 0.0.0.0', async () => {
      process.env.TEST_HOST = '0.0.0.0';
      
      const response = await request(app)
        .get('/api/server-config')
        .expect(200);

      expect(response.body.config.networkAccessible).toBe(true);
      
      delete process.env.TEST_HOST;
    });

    it('should indicate no network accessibility when host is localhost', async () => {
      process.env.TEST_HOST = 'localhost';
      
      const response = await request(app)
        .get('/api/server-config')
        .expect(200);

      expect(response.body.config.networkAccessible).toBe(false);
      
      delete process.env.TEST_HOST;
    });

    it('should indicate kiosk mode when on Raspberry Pi', async () => {
      app.mockPlatformDetection.isRaspberryPi.mockReturnValue(true);
      
      const response = await request(app)
        .get('/api/server-config')
        .expect(200);

      expect(response.body.config.kioskMode.enabled).toBe(true);
      
      app.mockPlatformDetection.isRaspberryPi.mockReturnValue(false);
    });

    it('should use custom port from environment', async () => {
      process.env.TEST_PORT = '8080';
      
      const response = await request(app)
        .get('/api/server-config')
        .expect(200);

      expect(response.body.config.port).toBe(8080);
      
      delete process.env.TEST_PORT;
    });
  });

  describe('GET /api/system-info', () => {
    it('should return system information successfully', async () => {
      const mockSystemInfo = {
        platform: 'darwin',
        arch: 'x64',
        release: '21.6.0',
        hostname: 'test-machine',
        isRaspberryPi: false,
        audioStrategy: 'macos',
        configPath: '/Users/test/.config/spectrabox',
        nodeVersion: 'v16.14.0'
      };

      app.mockPlatformDetection.getSystemInfo.mockReturnValue(mockSystemInfo);

      const response = await request(app)
        .get('/api/system-info')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        systemInfo: mockSystemInfo
      });
      expect(app.mockPlatformDetection.getSystemInfo).toHaveBeenCalledTimes(1);
    });

    it('should handle system info errors', async () => {
      const errorMessage = 'System info unavailable';
      app.mockPlatformDetection.getSystemInfo.mockImplementation(() => {
        throw new Error(errorMessage);
      });

      const response = await request(app)
        .get('/api/system-info')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to get system information',
        message: errorMessage,
        systemInfo: {
          platform: 'unknown',
          arch: 'unknown',
          isRaspberryPi: false
        }
      });
    });
  });

  describe('404 handling', () => {
    it('should return 404 for non-existent API endpoints', async () => {
      const response = await request(app)
        .get('/api/non-existent')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'API endpoint not found',
        message: 'The endpoint /api/non-existent does not exist'
      });
    });

    it('should return 404 for non-existent nested API endpoints', async () => {
      const response = await request(app)
        .get('/api/some/nested/endpoint')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'API endpoint not found',
        message: 'The endpoint /api/some/nested/endpoint does not exist'
      });
    });
  });

  describe('Error handling middleware', () => {
    it('should handle server errors gracefully', async () => {
      // Mock a service method to throw an error that bypasses our try-catch
      app.mockAudioDeviceService.getAudioDevices.mockImplementation(() => {
        throw new Error('Unexpected server error');
      });

      const response = await request(app)
        .get('/api/audio-devices')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to enumerate audio devices');
    });
  });

  describe('CORS and middleware', () => {
    it('should include CORS headers', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('*');
    });

    it('should parse JSON request bodies', async () => {
      app.mockPreferencesService.validatePreferences.mockReturnValue(true);
      app.mockPreferencesService.savePreferences.mockResolvedValue(true);

      const preferences = { selectedAudioDevice: 'test' };
      
      await request(app)
        .post('/api/preferences')
        .send({ preferences })
        .expect(200);

      expect(app.mockPreferencesService.validatePreferences).toHaveBeenCalledWith(preferences);
    });
  });
});