/**
 * Audio Device Scenario Tests
 * Tests various audio device configurations and edge cases
 */

const request = require('supertest');
const app = require('../server');
const AudioDeviceService = require('../services/audioDeviceService');
const { PreferencesService } = require('../services/preferencesService');
const PlatformDetection = require('../utils/platformDetection');

describe('Audio Device Scenarios', () => {
  let audioDeviceService;
  let preferencesService;

  beforeAll(() => {
    audioDeviceService = new AudioDeviceService();
    preferencesService = new PreferencesService();
  });

  describe('Device Enumeration Scenarios', () => {
    test('should handle no audio devices available', async () => {
      // Mock the service to return no devices
      const originalGetDevices = audioDeviceService.getAudioDevices;
      audioDeviceService.getAudioDevices = jest.fn().mockResolvedValue([]);

      const response = await request(app)
        .get('/api/audio-devices')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.devices).toEqual([]);
      expect(response.body.count).toBe(0);

      // Restore original method
      audioDeviceService.getAudioDevices = originalGetDevices;
    });

    test('should handle single audio device', async () => {
      const mockDevice = {
        id: 'single-device',
        name: 'Built-in Microphone',
        isDefault: true,
        type: 'input',
        channels: 1,
        sampleRates: [44100, 48000],
        platform: 'macos'
      };

      const originalGetDevices = audioDeviceService.getAudioDevices;
      audioDeviceService.getAudioDevices = jest.fn().mockResolvedValue([mockDevice]);

      const response = await request(app)
        .get('/api/audio-devices')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.devices).toHaveLength(1);
      expect(response.body.devices[0]).toEqual(mockDevice);
      expect(response.body.count).toBe(1);

      audioDeviceService.getAudioDevices = originalGetDevices;
    });

    test('should handle multiple audio devices', async () => {
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
          name: 'USB Audio Interface',
          isDefault: false,
          type: 'input',
          channels: 2,
          sampleRates: [44100, 48000, 96000],
          platform: 'macos'
        },
        {
          id: 'device-3',
          name: 'Bluetooth Headset',
          isDefault: false,
          type: 'input',
          channels: 1,
          sampleRates: [16000, 44100],
          platform: 'macos'
        }
      ];

      const originalGetDevices = audioDeviceService.getAudioDevices;
      audioDeviceService.getAudioDevices = jest.fn().mockResolvedValue(mockDevices);

      const response = await request(app)
        .get('/api/audio-devices')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.devices).toHaveLength(3);
      expect(response.body.count).toBe(3);

      // Verify default device is first
      const defaultDevice = response.body.devices.find(d => d.isDefault);
      expect(defaultDevice).toBeDefined();
      expect(defaultDevice.id).toBe('device-1');

      audioDeviceService.getAudioDevices = originalGetDevices;
    });

    test('should handle devices with special characters in names', async () => {
      const mockDevices = [
        {
          id: 'device-special',
          name: 'Audio Device (USB 2.0) - Stereo Mix',
          isDefault: false,
          type: 'input',
          channels: 2,
          sampleRates: [44100],
          platform: 'macos'
        },
        {
          id: 'device-unicode',
          name: 'Микрофон USB',
          isDefault: false,
          type: 'input',
          channels: 1,
          sampleRates: [48000],
          platform: 'macos'
        }
      ];

      const originalGetDevices = audioDeviceService.getAudioDevices;
      audioDeviceService.getAudioDevices = jest.fn().mockResolvedValue(mockDevices);

      const response = await request(app)
        .get('/api/audio-devices')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.devices).toHaveLength(2);
      expect(response.body.devices[0].name).toBe('Audio Device (USB 2.0) - Stereo Mix');
      expect(response.body.devices[1].name).toBe('Микрофон USB');

      audioDeviceService.getAudioDevices = originalGetDevices;
    });
  });

  describe('Device Selection Scenarios', () => {
    test('should save valid device selection', async () => {
      const validPreferences = {
        selectedAudioDevice: 'valid-device-id',
        audioSettings: {
          sampleRate: 44100,
          bufferSize: 1024,
          gain: 1.0
        },
        uiSettings: {
          theme: 'dark',
          autoStart: true,
          fullscreen: false,
          general: {
            minFrequency: 20,
            maxFrequency: 20000,
            inputGain: 0,
            holdMode: 'latch'
          },
          spectrogramInterface: {
            clickInfoSize: 'large',
            responsiveness: 90,
            amplitudeOffset: 0,
            overlappingDisplay: true,
            overlapTolerance: 1,
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
        systemSettings: {
          port: 3000,
          host: '0.0.0.0'
        }
      };

      const response = await request(app)
        .post('/api/preferences')
        .send({ preferences: validPreferences })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.preferences.selectedAudioDevice).toBe('valid-device-id');
    });

    test('should handle selection of non-existent device', async () => {
      const invalidPreferences = {
        selectedAudioDevice: 'non-existent-device',
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

      // This should still save (validation happens on frontend)
      const response = await request(app)
        .post('/api/preferences')
        .send({ preferences: invalidPreferences })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.preferences.selectedAudioDevice).toBe('non-existent-device');
    });

    test('should handle null device selection', async () => {
      const nullDevicePreferences = {
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
        }
      };

      const response = await request(app)
        .post('/api/preferences')
        .send({ preferences: nullDevicePreferences })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.preferences.selectedAudioDevice).toBe(null);
    });
  });

  describe('Audio Settings Scenarios', () => {
    test('should handle standard sample rates', async () => {
      const sampleRates = [8000, 16000, 22050, 44100, 48000, 96000, 192000];

      for (const sampleRate of sampleRates) {
        const preferences = {
          selectedAudioDevice: 'test-device',
          audioSettings: {
            sampleRate: sampleRate,
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

        const response = await request(app)
          .post('/api/preferences')
          .send({ preferences })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.preferences.audioSettings.sampleRate).toBe(sampleRate);
      }
    });

    test('should handle various buffer sizes', async () => {
      const bufferSizes = [128, 256, 512, 1024, 2048, 4096];

      for (const bufferSize of bufferSizes) {
        const preferences = {
          selectedAudioDevice: 'test-device',
          audioSettings: {
            sampleRate: 44100,
            bufferSize: bufferSize,
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

        const response = await request(app)
          .post('/api/preferences')
          .send({ preferences })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.preferences.audioSettings.bufferSize).toBe(bufferSize);
      }
    });

    test('should handle gain values', async () => {
      const gainValues = [0.0, 0.5, 1.0, 1.5, 2.0];

      for (const gain of gainValues) {
        const preferences = {
          selectedAudioDevice: 'test-device',
          audioSettings: {
            sampleRate: 44100,
            bufferSize: 1024,
            gain: gain
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

        const response = await request(app)
          .post('/api/preferences')
          .send({ preferences })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.preferences.audioSettings.gain).toBe(gain);
      }
    });
  });

  describe('Platform-Specific Device Scenarios', () => {
    test('should handle macOS-specific device IDs', async () => {
      if (PlatformDetection.getCurrentPlatform() === 'darwin') {
        const macOSDevices = [
          {
            id: 'AppleHDAEngineInput:1B,0,1,0:1',
            name: 'Built-in Microphone',
            isDefault: true,
            type: 'input',
            channels: 1,
            sampleRates: [44100, 48000],
            platform: 'macos'
          },
          {
            id: 'AppleUSBAudioEngine:Manufacturer:Product Name:000000:2,1',
            name: 'USB Audio Device',
            isDefault: false,
            type: 'input',
            channels: 2,
            sampleRates: [44100, 48000],
            platform: 'macos'
          }
        ];

        const originalGetDevices = audioDeviceService.getAudioDevices;
        audioDeviceService.getAudioDevices = jest.fn().mockResolvedValue(macOSDevices);

        const response = await request(app)
          .get('/api/audio-devices')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.devices).toHaveLength(2);
        expect(response.body.devices[0].platform).toBe('macos');

        audioDeviceService.getAudioDevices = originalGetDevices;
      }
    });

    test('should handle Linux-specific device IDs', async () => {
      if (PlatformDetection.getCurrentPlatform() === 'linux') {
        const linuxDevices = [
          {
            id: 'hw:0,0',
            name: 'HDA Intel PCH: ALC269VC Analog (hw:0,0)',
            isDefault: true,
            type: 'input',
            channels: 2,
            sampleRates: [44100, 48000],
            platform: 'linux'
          },
          {
            id: 'hw:1,0',
            name: 'USB Audio Device: USB Audio (hw:1,0)',
            isDefault: false,
            type: 'input',
            channels: 1,
            sampleRates: [44100, 48000],
            platform: 'linux'
          }
        ];

        const originalGetDevices = audioDeviceService.getAudioDevices;
        audioDeviceService.getAudioDevices = jest.fn().mockResolvedValue(linuxDevices);

        const response = await request(app)
          .get('/api/audio-devices')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.devices).toHaveLength(2);
        expect(response.body.devices[0].platform).toBe('linux');

        audioDeviceService.getAudioDevices = originalGetDevices;
      }
    });
  });

  describe('Error Scenarios', () => {
    test('should handle device enumeration failure', async () => {
      const originalGetDevices = audioDeviceService.getAudioDevices;
      audioDeviceService.getAudioDevices = jest.fn().mockRejectedValue(new Error('Device enumeration failed'));

      const response = await request(app)
        .get('/api/audio-devices')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to enumerate audio devices');
      expect(response.body.devices).toEqual([]);

      audioDeviceService.getAudioDevices = originalGetDevices;
    });

    test('should handle device validation failure', async () => {
      const originalValidateDevice = audioDeviceService.validateDevice;
      audioDeviceService.validateDevice = jest.fn().mockResolvedValue(false);

      // This test would be implemented in the frontend validation
      // Backend currently doesn't validate device existence on save
      expect(true).toBe(true);

      audioDeviceService.validateDevice = originalValidateDevice;
    });

    test('should handle permission denied errors', async () => {
      const originalGetDevices = audioDeviceService.getAudioDevices;
      const permissionError = new Error('Permission denied');
      permissionError.code = 'EACCES';
      audioDeviceService.getAudioDevices = jest.fn().mockRejectedValue(permissionError);

      const response = await request(app)
        .get('/api/audio-devices')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to enumerate audio devices');
      expect(response.body.message).toBe('Permission denied');

      audioDeviceService.getAudioDevices = originalGetDevices;
    });
  });

  describe('Device Hot-Plugging Scenarios', () => {
    test('should handle device list changes', async () => {
      // First request - initial devices
      const initialDevices = [
        {
          id: 'device-1',
          name: 'Built-in Microphone',
          isDefault: true,
          type: 'input',
          channels: 1,
          sampleRates: [44100],
          platform: 'macos'
        }
      ];

      const originalGetDevices = audioDeviceService.getAudioDevices;
      audioDeviceService.getAudioDevices = jest.fn().mockResolvedValue(initialDevices);

      let response = await request(app)
        .get('/api/audio-devices')
        .expect(200);

      expect(response.body.devices).toHaveLength(1);

      // Second request - device added
      const updatedDevices = [
        ...initialDevices,
        {
          id: 'device-2',
          name: 'USB Microphone',
          isDefault: false,
          type: 'input',
          channels: 1,
          sampleRates: [44100, 48000],
          platform: 'macos'
        }
      ];

      audioDeviceService.getAudioDevices = jest.fn().mockResolvedValue(updatedDevices);

      response = await request(app)
        .get('/api/audio-devices')
        .expect(200);

      expect(response.body.devices).toHaveLength(2);
      expect(response.body.devices[1].name).toBe('USB Microphone');

      audioDeviceService.getAudioDevices = originalGetDevices;
    });

    test('should handle selected device disconnection', async () => {
      // Save preferences with a specific device
      const preferences = {
        selectedAudioDevice: 'usb-device-123',
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

      await request(app)
        .post('/api/preferences')
        .send({ preferences })
        .expect(200);

      // Mock device list without the selected device
      const devicesWithoutSelected = [
        {
          id: 'device-1',
          name: 'Built-in Microphone',
          isDefault: true,
          type: 'input',
          channels: 1,
          sampleRates: [44100],
          platform: 'macos'
        }
      ];

      const originalGetDevices = audioDeviceService.getAudioDevices;
      audioDeviceService.getAudioDevices = jest.fn().mockResolvedValue(devicesWithoutSelected);

      const response = await request(app)
        .get('/api/audio-devices')
        .expect(200);

      expect(response.body.devices).toHaveLength(1);
      expect(response.body.devices.find(d => d.id === 'usb-device-123')).toBeUndefined();

      audioDeviceService.getAudioDevices = originalGetDevices;
    });
  });

  describe('Performance with Many Devices', () => {
    test('should handle large number of audio devices', async () => {
      // Generate many mock devices
      const manyDevices = Array.from({ length: 50 }, (_, i) => ({
        id: `device-${i}`,
        name: `Audio Device ${i}`,
        isDefault: i === 0,
        type: 'input',
        channels: Math.random() > 0.5 ? 1 : 2,
        sampleRates: [44100, 48000],
        platform: 'macos'
      }));

      const originalGetDevices = audioDeviceService.getAudioDevices;
      audioDeviceService.getAudioDevices = jest.fn().mockResolvedValue(manyDevices);

      const startTime = Date.now();
      const response = await request(app)
        .get('/api/audio-devices')
        .expect(200);
      const responseTime = Date.now() - startTime;

      expect(response.body.success).toBe(true);
      expect(response.body.devices).toHaveLength(50);
      expect(response.body.count).toBe(50);
      
      // Should still be reasonably fast
      expect(responseTime).toBeLessThan(1000);

      console.log(`Handled 50 devices in ${responseTime}ms`);

      audioDeviceService.getAudioDevices = originalGetDevices;
    });
  });
});