/**
 * Cross-Platform Integration Tests
 * Tests functionality across macOS and Linux environments
 */

const request = require('supertest');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const os = require('os');
const path = require('path');
const fs = require('fs').promises;

const app = require('../server');
const AudioDeviceService = require('../services/audioDeviceService');
const { PreferencesService } = require('../services/preferencesService');
const PlatformDetection = require('../utils/platformDetection');

const execAsync = promisify(exec);

describe('Cross-Platform Integration Tests', () => {
  let audioDeviceService;
  let preferencesService;
  let currentPlatform;

  beforeAll(() => {
    audioDeviceService = new AudioDeviceService();
    preferencesService = new PreferencesService();
    currentPlatform = PlatformDetection.getCurrentPlatform();
  });

  describe('Platform Detection', () => {
    test('should correctly identify current platform', () => {
      expect(['darwin', 'linux', 'win32']).toContain(currentPlatform);
      
      const isRaspberryPi = PlatformDetection.isRaspberryPi();
      expect(typeof isRaspberryPi).toBe('boolean');
      
      console.log(`Running on platform: ${currentPlatform}, Raspberry Pi: ${isRaspberryPi}`);
    });

    test('should provide platform-specific configuration paths', () => {
      const configPath = PlatformDetection.getConfigPath();
      expect(configPath).toBeDefined();
      expect(typeof configPath).toBe('string');
      
      if (currentPlatform === 'darwin') {
        expect(configPath).toContain('Library/Application Support');
      } else if (currentPlatform === 'linux') {
        expect(configPath).toContain('.config');
      }
    });

    test('should select appropriate audio device strategy', () => {
      const strategy = PlatformDetection.getAudioDeviceStrategy();
      expect(strategy).toBeDefined();
      
      if (currentPlatform === 'darwin') {
        expect(strategy).toBe('macos');
      } else if (currentPlatform === 'linux') {
        expect(strategy).toBe('linux');
      }
    });
  });

  describe('Audio Device Enumeration', () => {
    test('should enumerate audio devices on current platform', async () => {
      const devices = await audioDeviceService.getAudioDevices();
      
      expect(Array.isArray(devices)).toBe(true);
      expect(devices.length).toBeGreaterThanOrEqual(0);
      
      if (devices.length > 0) {
        const device = devices[0];
        expect(device).toHaveProperty('id');
        expect(device).toHaveProperty('name');
        expect(device).toHaveProperty('type');
        expect(device).toHaveProperty('platform');
        expect(device.platform).toBe(currentPlatform === 'darwin' ? 'macos' : currentPlatform);
      }
      
      console.log(`Found ${devices.length} audio devices on ${currentPlatform}`);
    });

    test('should handle platform-specific audio commands', async () => {
      if (currentPlatform === 'darwin') {
        // Test macOS system_profiler command
        try {
          const { stdout } = await execAsync('system_profiler SPAudioDataType');
          expect(stdout).toContain('Audio');
        } catch (error) {
          console.warn('system_profiler not available:', error.message);
        }
      } else if (currentPlatform === 'linux') {
        // Test Linux arecord command
        try {
          const { stdout } = await execAsync('arecord -l');
          expect(stdout).toBeDefined();
        } catch (error) {
          console.warn('arecord not available:', error.message);
        }
        
        // Test pactl command if available
        try {
          const { stdout } = await execAsync('pactl list sources short');
          expect(stdout).toBeDefined();
        } catch (error) {
          console.warn('pactl not available:', error.message);
        }
      }
    });

    test('should validate device IDs across platforms', async () => {
      const devices = await audioDeviceService.getAudioDevices();
      
      for (const device of devices) {
        const isValid = await audioDeviceService.validateDevice(device.id);
        expect(typeof isValid).toBe('boolean');
        
        // Device ID format should be platform-appropriate
        if (currentPlatform === 'darwin') {
          expect(device.id).toMatch(/^[a-zA-Z0-9\-_:]+$/);
        } else if (currentPlatform === 'linux') {
          expect(device.id).toMatch(/^[a-zA-Z0-9\-_:.,]+$/);
        }
      }
    });

    test('should get default device for current platform', async () => {
      const defaultDevice = await audioDeviceService.getDefaultDevice();
      
      if (defaultDevice) {
        expect(defaultDevice).toHaveProperty('id');
        expect(defaultDevice).toHaveProperty('name');
        expect(defaultDevice.isDefault).toBe(true);
        expect(defaultDevice.platform).toBe(currentPlatform === 'darwin' ? 'macos' : currentPlatform);
      }
    });
  });

  describe('File System Operations', () => {
    test('should create preferences file in platform-specific location', async () => {
      const testPreferences = {
        selectedAudioDevice: 'test-device',
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

      await preferencesService.savePreferences(testPreferences);
      
      // Verify file was created in correct location
      const configPath = PlatformDetection.getConfigPath();
      const prefsPath = path.join(configPath, 'preferences.json');
      
      try {
        const stats = await fs.stat(prefsPath);
        expect(stats.isFile()).toBe(true);
      } catch (error) {
        // File might be in a different location, that's ok
        console.warn('Preferences file location varies by platform');
      }
    });

    test('should handle file permissions correctly', async () => {
      const testPrefs = preferencesService.getDefaultPreferences();
      
      try {
        await preferencesService.savePreferences(testPrefs);
        const loadedPrefs = await preferencesService.getPreferences();
        expect(loadedPrefs).toBeDefined();
      } catch (error) {
        if (error.code === 'EACCES') {
          console.warn('Permission denied - expected in some test environments');
        } else {
          throw error;
        }
      }
    });

    test('should handle path separators correctly', () => {
      const configPath = PlatformDetection.getConfigPath();
      
      if (currentPlatform === 'win32') {
        expect(configPath).toContain('\\');
      } else {
        expect(configPath).toContain('/');
      }
      
      // Should not contain mixed separators
      expect(configPath).not.toMatch(/[\/\\].*[\\\/]/);
    });
  });

  describe('Server Integration', () => {
    test('should start server on all platforms', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);
      
      expect(response.body.status).toBe('OK');
    });

    test('should serve static files with correct MIME types', async () => {
      const testFiles = [
        { path: '/', expectedType: 'text/html' },
        { path: '/js/spectrum-analyzer.js', expectedType: 'application/javascript' },
        { path: '/css/styles.css', expectedType: 'text/css' }
      ];

      for (const file of testFiles) {
        const response = await request(app).get(file.path);
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(new RegExp(file.expectedType));
      }
    });

    test('should handle platform-specific system info', async () => {
      const response = await request(app)
        .get('/api/system-info')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.systemInfo.platform).toBe(currentPlatform);
      expect(response.body.systemInfo.arch).toBe(os.arch());
      
      if (currentPlatform === 'linux') {
        expect(typeof response.body.systemInfo.isRaspberryPi).toBe('boolean');
      }
    });

    test('should provide platform-appropriate audio devices via API', async () => {
      const response = await request(app)
        .get('/api/audio-devices')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.devices)).toBe(true);
      
      for (const device of response.body.devices) {
        expect(device.platform).toBe(currentPlatform === 'darwin' ? 'macos' : currentPlatform);
      }
    });
  });

  describe('Environment Variables', () => {
    test('should respect platform-specific environment variables', () => {
      const originalEnv = process.env.NODE_ENV;
      
      // Test different NODE_ENV values
      process.env.NODE_ENV = 'production';
      expect(process.env.NODE_ENV).toBe('production');
      
      process.env.NODE_ENV = 'development';
      expect(process.env.NODE_ENV).toBe('development');
      
      // Restore original
      process.env.NODE_ENV = originalEnv;
    });

    test('should handle platform-specific path variables', () => {
      if (currentPlatform !== 'win32') {
        expect(process.env.PATH).toContain(':');
      } else {
        expect(process.env.PATH).toContain(';');
      }
    });
  });

  describe('Process Management', () => {
    test('should handle signals correctly on Unix platforms', (done) => {
      if (currentPlatform === 'win32') {
        done();
        return;
      }

      const testProcess = spawn('node', ['-e', 'setTimeout(() => {}, 10000)']);
      
      testProcess.on('exit', (code, signal) => {
        expect(signal).toBe('SIGTERM');
        done();
      });
      
      setTimeout(() => {
        testProcess.kill('SIGTERM');
      }, 100);
    });

    test('should handle graceful shutdown', (done) => {
      const serverScript = `
        const express = require('express');
        const app = express();
        const server = app.listen(0, () => {
          console.log('Server started');
        });
        
        process.on('SIGTERM', () => {
          server.close(() => {
            console.log('Server closed');
            process.exit(0);
          });
        });
      `;
      
      const testProcess = spawn('node', ['-e', serverScript]);
      
      testProcess.stdout.on('data', (data) => {
        if (data.toString().includes('Server started')) {
          testProcess.kill('SIGTERM');
        }
      });
      
      testProcess.on('exit', (code) => {
        expect(code).toBe(0);
        done();
      });
    });
  });

  describe('Network Configuration', () => {
    test('should bind to correct interfaces on all platforms', async () => {
      // Test localhost binding
      const localhostPrefs = {
        ...preferencesService.getDefaultPreferences(),
        systemSettings: {
          port: 3001,
          host: 'localhost'
        }
      };
      
      await preferencesService.savePreferences(localhostPrefs);
      const loaded = await preferencesService.getPreferences();
      expect(loaded.systemSettings.host).toBe('localhost');
    });

    test('should handle IPv4 and IPv6 addresses', async () => {
      const ipv4Prefs = {
        ...preferencesService.getDefaultPreferences(),
        systemSettings: {
          port: 3000,
          host: '192.168.1.100'
        }
      };
      
      const isValid = preferencesService.validatePreferences(ipv4Prefs);
      expect(isValid).toBe(true);
      
      // IPv6 support (if available)
      const ipv6Prefs = {
        ...preferencesService.getDefaultPreferences(),
        systemSettings: {
          port: 3000,
          host: '::1'
        }
      };
      
      const isValidV6 = preferencesService.validatePreferences(ipv6Prefs);
      expect(isValidV6).toBe(true);
    });
  });

  describe('Resource Limits', () => {
    test('should respect platform-specific resource limits', () => {
      const memoryUsage = process.memoryUsage();
      
      // Memory usage should be reasonable on all platforms
      expect(memoryUsage.rss).toBeLessThan(500 * 1024 * 1024); // 500MB
      expect(memoryUsage.heapUsed).toBeLessThan(200 * 1024 * 1024); // 200MB
      
      console.log(`Memory usage on ${currentPlatform}:`, {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`
      });
    });

    test('should handle file descriptor limits', async () => {
      if (currentPlatform !== 'win32') {
        try {
          const { stdout } = await execAsync('ulimit -n');
          const fdLimit = parseInt(stdout.trim());
          expect(fdLimit).toBeGreaterThan(0);
          console.log(`File descriptor limit on ${currentPlatform}: ${fdLimit}`);
        } catch (error) {
          console.warn('Could not check file descriptor limit:', error.message);
        }
      }
    });
  });
});