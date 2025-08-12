const AudioDeviceService = require('../services/audioDeviceService');
const PlatformDetection = require('../utils/platformDetection');
const { exec } = require('child_process');

// Mock child_process
jest.mock('child_process', () => ({
  exec: jest.fn()
}));

// Mock PlatformDetection
jest.mock('../utils/platformDetection', () => ({
  getCurrentPlatform: jest.fn(() => 'darwin'),
  getAudioDeviceStrategy: jest.fn(() => 'macos')
}));

describe('AudioDeviceService', () => {
  let audioService;
  let mockExec;

  beforeEach(() => {
    audioService = new AudioDeviceService();
    mockExec = exec;
    jest.clearAllMocks();
    
    // Clear cache before each test
    audioService.clearCache();
  });

  describe('Constructor and Basic Properties', () => {
    test('should initialize with correct default properties', () => {
      expect(audioService.deviceCache).toBeNull();
      expect(audioService.cacheTimestamp).toBeNull();
      expect(audioService.cacheTimeout).toBe(30000);
    });

    test('should set strategy based on platform detection', () => {
      PlatformDetection.getAudioDeviceStrategy.mockReturnValue('macos');
      const service = new AudioDeviceService();
      expect(service.strategy).toBe('macos');
    });
  });

  describe('Cache Management', () => {
    test('should return false for invalid cache when no cache exists', () => {
      expect(audioService.isCacheValid()).toBe(false);
    });

    test('should return true for valid cache within timeout', () => {
      audioService.deviceCache = [{ id: 'test' }];
      audioService.cacheTimestamp = Date.now();
      expect(audioService.isCacheValid()).toBe(true);
    });

    test('should return false for expired cache', () => {
      audioService.deviceCache = [{ id: 'test' }];
      audioService.cacheTimestamp = Date.now() - 40000; // 40 seconds ago
      expect(audioService.isCacheValid()).toBe(false);
    });

    test('should clear cache correctly', () => {
      audioService.deviceCache = [{ id: 'test' }];
      audioService.cacheTimestamp = Date.now();
      audioService.clearCache();
      expect(audioService.deviceCache).toBeNull();
      expect(audioService.cacheTimestamp).toBeNull();
    });
  });

  describe('Device ID Generation and Formatting', () => {
    test('should generate consistent device IDs', () => {
      const id1 = audioService.generateDeviceId('Built-in Microphone', 'macos');
      const id2 = audioService.generateDeviceId('Built-in Microphone', 'macos');
      expect(id1).toBe(id2);
      expect(id1).toBe('macos-built-in-microphone');
    });

    test('should format device names correctly', () => {
      expect(audioService.formatDeviceName('built_in_microphone')).toBe('Built In Microphone');
      expect(audioService.formatDeviceName('usb_audio_device')).toBe('Usb Audio Device');
    });

    test('should handle special characters in device ID generation', () => {
      const id = audioService.generateDeviceId('Device (USB Audio)', 'linux');
      expect(id).toBe('linux-device--usb-audio-');
    });
  });

  describe('Default Device Marking', () => {
    test('should mark first device as default when none are marked', () => {
      const devices = [
        { id: 'device1', name: 'Device 1', isDefault: false },
        { id: 'device2', name: 'Device 2', isDefault: false }
      ];
      const result = audioService.markDefaultDevice(devices);
      expect(result[0].isDefault).toBe(true);
      expect(result[1].isDefault).toBe(false);
    });

    test('should not change default when one is already marked', () => {
      const devices = [
        { id: 'device1', name: 'Device 1', isDefault: false },
        { id: 'device2', name: 'Device 2', isDefault: true }
      ];
      const result = audioService.markDefaultDevice(devices);
      expect(result[0].isDefault).toBe(false);
      expect(result[1].isDefault).toBe(true);
    });

    test('should handle empty device array', () => {
      const result = audioService.markDefaultDevice([]);
      expect(result).toEqual([]);
    });
  });

  describe('macOS Device Detection', () => {
    beforeEach(() => {
      audioService.strategy = 'macos';
    });

    test('should parse system_profiler output correctly', async () => {
      const mockSystemProfilerOutput = JSON.stringify({
        SPAudioDataType: [{
          _items: [{
            _name: 'Built-in Microphone',
            coreaudio_input_source: {
              coreaudio_input_channels: 1
            }
          }]
        }]
      });

      mockExec.mockImplementation((command, callback) => {
        setTimeout(() => {
          if (command.includes('system_profiler')) {
            callback(null, mockSystemProfilerOutput, '');
          }
        }, 10);
      });

      const devices = await audioService.getMacOSDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe('Built-in Microphone');
      expect(devices[0].platform).toBe('macos');
      expect(devices[0].channels).toBe(1);
    });

    test('should fallback when system_profiler fails', async () => {
      mockExec.mockImplementation((command, callback) => {
        setTimeout(() => {
          if (command.includes('system_profiler')) {
            callback(new Error('Command failed'), '', 'Error');
          } else if (command.includes('which sox')) {
            callback(new Error('sox not found'), '', '');
          }
        }, 10);
      });

      const devices = await audioService.getMacOSDevices();
      expect(devices).toHaveLength(2);
      expect(devices[0].name).toBe('Default Audio Input');
      expect(devices[0].isDefault).toBe(true);
    });

    test('should use SoX alternative when available', async () => {
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('system_profiler')) {
          callback(new Error('Command failed'), '', 'Error');
        } else if (command.includes('which sox')) {
          callback(null, '/usr/local/bin/sox', '');
        } else if (command.includes('sox -V1')) {
          callback(null, 'coreaudio: detected device', '');
        }
      });

      const devices = await audioService.getMacOSDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe('Default Audio Input');
      expect(devices[0].isDefault).toBe(true);
    });

    test('should handle malformed system_profiler JSON', async () => {
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('system_profiler')) {
          callback(null, 'invalid json{', '');
        } else if (command.includes('which sox')) {
          callback(new Error('sox not found'), '', '');
        }
      });

      const devices = await audioService.getMacOSDevices();
      expect(devices).toHaveLength(2);
      expect(devices[0].name).toBe('Default Audio Input');
    });
  });

  describe('Linux Device Detection', () => {
    beforeEach(() => {
      audioService.strategy = 'linux';
    });

    test('should parse PulseAudio pactl output correctly', async () => {
      const mockPactlOutput = '0\talsa_input.pci-0000_00_1f.3.analog-stereo\tmodule-alsa-card.c\ts16le 2ch 44100Hz\tSUSPENDED\n1\talsa_input.usb-device.analog-stereo\tmodule-alsa-card.c\ts16le 2ch 48000Hz\tRUNNING';

      mockExec.mockImplementation((command, callback) => {
        if (command.includes('pactl list sources')) {
          callback(null, mockPactlOutput, '');
        } else if (command.includes('arecord -l')) {
          callback(new Error('ALSA failed'), '', 'Error');
        }
      });

      const devices = await audioService.getLinuxDevices();
      expect(devices).toHaveLength(2);
      expect(devices[0].name).toContain('Pci');
      expect(devices[0].platform).toBe('linux');
      expect(devices[1].name).toContain('Usb');
    });

    test('should parse ALSA arecord output correctly', async () => {
      const mockArecordOutput = 'card 0: PCH [HDA Intel PCH], device 0: ALC3246 Analog [ALC3246 Analog]\ncard 1: USB [USB Audio], device 0: USB Audio [USB Audio]';

      mockExec.mockImplementation((command, callback) => {
        if (command.includes('pactl list sources')) {
          callback(new Error('PulseAudio failed'), '', 'Error');
        } else if (command.includes('arecord -l')) {
          callback(null, mockArecordOutput, '');
        }
      });

      const devices = await audioService.getLinuxDevices();
      expect(devices).toHaveLength(2);
      expect(devices[0].name).toBe('ALC3246 Analog (HDA Intel PCH)');
      expect(devices[1].name).toBe('USB Audio (USB Audio)');
    });

    test('should merge PulseAudio and ALSA devices without duplicates', async () => {
      const mockPactlOutput = '0\talsa_input.pci-0000_00_1f.3.analog-stereo\tmodule-alsa-card.c\ts16le 2ch 44100Hz\tSUSPENDED';
      const mockArecordOutput = 'card 0: PCH [HDA Intel PCH], device 0: ALC3246 Analog [ALC3246 Analog]';

      mockExec.mockImplementation((command, callback) => {
        if (command.includes('pactl list sources')) {
          callback(null, mockPactlOutput, '');
        } else if (command.includes('arecord -l')) {
          callback(null, mockArecordOutput, '');
        }
      });

      const devices = await audioService.getLinuxDevices();
      expect(devices).toHaveLength(2); // Should not duplicate similar devices
    });

    test('should provide fallback when both PulseAudio and ALSA fail', async () => {
      mockExec.mockImplementation((command, callback) => {
        callback(new Error('Command failed'), '', 'Error');
      });

      const devices = await audioService.getLinuxDevices();
      expect(devices).toHaveLength(2);
      expect(devices[0].name).toBe('Default Audio Input');
      expect(devices[0].isDefault).toBe(true);
    });
  });

  describe('Windows Device Detection', () => {
    beforeEach(() => {
      audioService.strategy = 'windows';
    });

    test('should parse Windows WMI output correctly', async () => {
      const mockWMIOutput = JSON.stringify([
        { Name: 'Microphone (Realtek Audio)', DeviceID: 'USB\\VID_1234&PID_5678', Status: 'OK' },
        { Name: 'Line In (Realtek Audio)', DeviceID: 'PCI\\VEN_10EC&DEV_0887', Status: 'OK' }
      ]);

      mockExec.mockImplementation((command, callback) => {
        if (command.includes('Get-WmiObject -Class Win32_SoundDevice')) {
          callback(null, mockWMIOutput, '');
        } else {
          callback(new Error('PowerShell failed'), '', 'Error');
        }
      });

      const devices = await audioService.getWindowsDevices();
      expect(devices).toHaveLength(2);
      expect(devices[0].name).toBe('Microphone (Realtek Audio)');
      expect(devices[0].platform).toBe('windows');
      expect(devices[0].isDefault).toBe(true);
      expect(devices[1].name).toBe('Line In (Realtek Audio)');
      expect(devices[1].isDefault).toBe(false);
    });

    test('should parse Windows PowerShell AudioDeviceCmdlets output correctly', async () => {
      const mockPSOutput = JSON.stringify([
        { Name: 'USB Microphone', ID: '{0.0.1.00000000}.{12345678-1234-1234-1234-123456789012}', Default: true },
        { Name: 'Built-in Microphone', ID: '{0.0.0.00000000}.{87654321-4321-4321-4321-210987654321}', Default: false }
      ]);

      mockExec.mockImplementation((command, callback) => {
        if (command.includes('Get-WmiObject -Class Win32_SoundDevice')) {
          callback(new Error('WMI failed'), '', 'Error');
        } else if (command.includes('Get-AudioDevice -Type Recording')) {
          callback(null, mockPSOutput, '');
        }
      });

      const devices = await audioService.getWindowsDevices();
      expect(devices).toHaveLength(2);
      expect(devices[0].name).toBe('USB Microphone');
      expect(devices[0].isDefault).toBe(true);
      expect(devices[1].name).toBe('Built-in Microphone');
      expect(devices[1].isDefault).toBe(false);
    });

    test('should handle single device WMI response', async () => {
      const mockWMIOutput = JSON.stringify({
        Name: 'Single Microphone',
        DeviceID: 'USB\\VID_1234&PID_5678',
        Status: 'OK'
      });

      mockExec.mockImplementation((command, callback) => {
        if (command.includes('Get-WmiObject -Class Win32_SoundDevice')) {
          callback(null, mockWMIOutput, '');
        } else {
          callback(new Error('PowerShell failed'), '', 'Error');
        }
      });

      const devices = await audioService.getWindowsDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe('Single Microphone');
      expect(devices[0].isDefault).toBe(true);
    });

    test('should provide fallback when both WMI and PowerShell fail', async () => {
      mockExec.mockImplementation((command, callback) => {
        callback(new Error('Command failed'), '', 'Error');
      });

      const devices = await audioService.getWindowsDevices();
      expect(devices).toHaveLength(3);
      expect(devices[0].name).toBe('Default Audio Input');
      expect(devices[0].isDefault).toBe(true);
      expect(devices[1].name).toBe('Microphone');
      expect(devices[2].name).toBe('Line In');
    });

    test('should handle malformed WMI JSON output', async () => {
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('Get-WmiObject -Class Win32_SoundDevice')) {
          callback(null, 'invalid json{', '');
        } else {
          callback(new Error('PowerShell failed'), '', 'Error');
        }
      });

      const devices = await audioService.getWindowsDevices();
      expect(devices).toHaveLength(3); // Should fall back to default devices
      expect(devices[0].name).toBe('Default Audio Input');
    });

    test('should merge WMI and PowerShell devices without duplicates', async () => {
      const mockWMIOutput = JSON.stringify([
        { Name: 'Shared Microphone', DeviceID: 'USB\\VID_1234', Status: 'OK' }
      ]);
      const mockPSOutput = JSON.stringify([
        { Name: 'Shared Microphone', ID: 'duplicate-id', Default: false },
        { Name: 'Unique PowerShell Device', ID: 'unique-id', Default: false }
      ]);

      mockExec.mockImplementation((command, callback) => {
        if (command.includes('Get-WmiObject -Class Win32_SoundDevice')) {
          callback(null, mockWMIOutput, '');
        } else if (command.includes('Get-AudioDevice -Type Recording')) {
          callback(null, mockPSOutput, '');
        }
      });

      const devices = await audioService.getWindowsDevices();
      expect(devices).toHaveLength(2); // Should not duplicate "Shared Microphone"
      expect(devices.some(d => d.name === 'Shared Microphone')).toBe(true);
      expect(devices.some(d => d.name === 'Unique PowerShell Device')).toBe(true);
    });
  });

  describe('Fallback Device Detection', () => {
    test('should provide fallback devices for unsupported platforms', async () => {
      audioService.strategy = 'unknown';
      const devices = await audioService.getFallbackDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe('Default Audio Input');
      expect(devices[0].platform).toBe('fallback');
    });
  });

  describe('Main API Methods', () => {
    test('should return cached devices when cache is valid', async () => {
      const cachedDevices = [{ id: 'cached', name: 'Cached Device' }];
      audioService.deviceCache = cachedDevices;
      audioService.cacheTimestamp = Date.now();

      const devices = await audioService.getAudioDevices();
      expect(devices).toBe(cachedDevices);
      expect(mockExec).not.toHaveBeenCalled();
    });

    test('should refresh devices when cache is invalid', async () => {
      audioService.strategy = 'macos';
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('system_profiler')) {
          callback(new Error('Command failed'), '', 'Error');
        } else if (command.includes('which sox')) {
          callback(new Error('sox not found'), '', '');
        }
      });

      const devices = await audioService.getAudioDevices();
      expect(devices).toHaveLength(2);
      expect(audioService.deviceCache).toBe(devices);
      expect(audioService.cacheTimestamp).toBeTruthy();
    });

    test('should return empty array on enumeration error', async () => {
      audioService.strategy = 'macos';
      // Mock all methods to throw errors
      jest.spyOn(audioService, 'getMacOSDevices').mockRejectedValue(new Error('Test error'));

      const devices = await audioService.getAudioDevices();
      expect(devices).toEqual([]);
    });

    test('should get default device correctly', async () => {
      const mockDevices = [
        { id: 'device1', name: 'Device 1', isDefault: false },
        { id: 'device2', name: 'Device 2', isDefault: true }
      ];
      jest.spyOn(audioService, 'getAudioDevices').mockResolvedValue(mockDevices);

      const defaultDevice = await audioService.getDefaultDevice();
      expect(defaultDevice.id).toBe('device2');
    });

    test('should return first device when no default is marked', async () => {
      const mockDevices = [
        { id: 'device1', name: 'Device 1', isDefault: false },
        { id: 'device2', name: 'Device 2', isDefault: false }
      ];
      jest.spyOn(audioService, 'getAudioDevices').mockResolvedValue(mockDevices);

      const defaultDevice = await audioService.getDefaultDevice();
      expect(defaultDevice.id).toBe('device1');
    });

    test('should return null when no devices available', async () => {
      jest.spyOn(audioService, 'getAudioDevices').mockResolvedValue([]);

      const defaultDevice = await audioService.getDefaultDevice();
      expect(defaultDevice).toBeNull();
    });

    test('should validate device ID correctly', async () => {
      const mockDevices = [
        { id: 'device1', name: 'Device 1' },
        { id: 'device2', name: 'Device 2' }
      ];
      jest.spyOn(audioService, 'getAudioDevices').mockResolvedValue(mockDevices);

      expect(await audioService.validateDevice('device1')).toBe(true);
      expect(await audioService.validateDevice('device3')).toBe(false);
      expect(await audioService.validateDevice('')).toBe(false);
      expect(await audioService.validateDevice(null)).toBe(false);
    });
  });

  describe('Integration with Different Strategies', () => {
    test('should use correct strategy based on platform detection', async () => {
      PlatformDetection.getAudioDeviceStrategy.mockReturnValue('linux');
      const service = new AudioDeviceService();
      
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('pactl')) {
          callback(null, '0\ttest-device\tmodule\ts16le 2ch 44100Hz\tRUNNING', '');
        } else {
          callback(new Error('Command failed'), '', 'Error');
        }
      });

      const devices = await service.getAudioDevices();
      expect(devices.length).toBeGreaterThan(0);
      expect(devices[0].platform).toBe('linux');
    });

    test('should use Windows strategy when platform is Windows', async () => {
      PlatformDetection.getAudioDeviceStrategy.mockReturnValue('windows');
      const service = new AudioDeviceService();
      
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('Get-WmiObject -Class Win32_SoundDevice')) {
          callback(null, JSON.stringify([{ Name: 'Test Windows Device', DeviceID: 'test-id', Status: 'OK' }]), '');
        } else {
          callback(new Error('Command failed'), '', 'Error');
        }
      });

      const devices = await service.getAudioDevices();
      expect(devices.length).toBeGreaterThan(0);
      expect(devices[0].platform).toBe('windows');
      expect(devices[0].name).toBe('Test Windows Device');
    });
  });
});