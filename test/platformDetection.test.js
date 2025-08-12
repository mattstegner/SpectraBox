const os = require('os');
const fs = require('fs');
const path = require('path');
const PlatformDetection = require('../utils/platformDetection');

// Mock dependencies
jest.mock('os');
jest.mock('fs');

describe('PlatformDetection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCurrentPlatform', () => {
    it('should return the current platform from os.platform()', () => {
      os.platform.mockReturnValue('darwin');
      expect(PlatformDetection.getCurrentPlatform()).toBe('darwin');
      expect(os.platform).toHaveBeenCalled();
    });
  });

  describe('Platform detection methods', () => {
    it('should correctly identify macOS', () => {
      os.platform.mockReturnValue('darwin');
      expect(PlatformDetection.isMacOS()).toBe(true);
      expect(PlatformDetection.isLinux()).toBe(false);
      expect(PlatformDetection.isWindows()).toBe(false);
    });

    it('should correctly identify Linux', () => {
      os.platform.mockReturnValue('linux');
      expect(PlatformDetection.isMacOS()).toBe(false);
      expect(PlatformDetection.isLinux()).toBe(true);
      expect(PlatformDetection.isWindows()).toBe(false);
    });

    it('should correctly identify Windows', () => {
      os.platform.mockReturnValue('win32');
      expect(PlatformDetection.isMacOS()).toBe(false);
      expect(PlatformDetection.isLinux()).toBe(false);
      expect(PlatformDetection.isWindows()).toBe(true);
    });
  });

  describe('isRaspberryPi', () => {
    it('should return false on non-Linux platforms', () => {
      os.platform.mockReturnValue('darwin');
      expect(PlatformDetection.isRaspberryPi()).toBe(false);
    });

    it('should return true when /proc/cpuinfo contains Raspberry Pi', () => {
      os.platform.mockReturnValue('linux');
      fs.readFileSync.mockReturnValue('Hardware\t: BCM2835\nRevision\t: a020d3\nSerial\t\t: 00000000abcdef01\nModel\t\t: Raspberry Pi 3 Model B Plus Rev 1.3');
      
      expect(PlatformDetection.isRaspberryPi()).toBe(true);
      expect(fs.readFileSync).toHaveBeenCalledWith('/proc/cpuinfo', 'utf8');
    });

    it('should return true when /proc/cpuinfo contains BCM2', () => {
      os.platform.mockReturnValue('linux');
      fs.readFileSync.mockReturnValue('processor\t: 0\nmodel name\t: ARMv7 Processor rev 4 (v7l)\nBogoMIPS\t: 38.40\nFeatures\t: half thumb fastmult vfp edsp neon vfpv3 tls vfpv4 idiva idivt vfpd32 lpae evtstrm crc32\nCPU implementer\t: 0x41\nCPU architecture: 7\nCPU variant\t: 0x0\nCPU part\t: 0xd03\nCPU revision\t: 4\n\nHardware\t: BCM2709');
      
      expect(PlatformDetection.isRaspberryPi()).toBe(true);
    });

    it('should return true when /proc/cpuinfo contains ARM', () => {
      os.platform.mockReturnValue('linux');
      fs.readFileSync.mockReturnValue('processor\t: 0\nmodel name\t: ARM Cortex-A72\nBogoMIPS\t: 108.00');
      
      expect(PlatformDetection.isRaspberryPi()).toBe(true);
    });

    it('should return false when /proc/cpuinfo does not contain Pi identifiers', () => {
      os.platform.mockReturnValue('linux');
      fs.readFileSync.mockReturnValue('processor\t: 0\nvendor_id\t: GenuineIntel\nmodel name\t: Intel(R) Core(TM) i7-8700K CPU @ 3.70GHz');
      
      expect(PlatformDetection.isRaspberryPi()).toBe(false);
    });

    it('should return false when /proc/cpuinfo cannot be read', () => {
      os.platform.mockReturnValue('linux');
      fs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });
      
      expect(PlatformDetection.isRaspberryPi()).toBe(false);
    });
  });

  describe('getConfigPath', () => {
    beforeEach(() => {
      os.homedir.mockReturnValue('/home/user');
    });

    it('should return macOS config path', () => {
      os.platform.mockReturnValue('darwin');
      const expected = path.join('/home/user', 'Library', 'Application Support', 'pi-audio-kiosk');
      expect(PlatformDetection.getConfigPath()).toBe(expected);
    });

    it('should return Linux config path', () => {
      os.platform.mockReturnValue('linux');
      const expected = path.join('/home/user', '.config', 'pi-audio-kiosk');
      expect(PlatformDetection.getConfigPath()).toBe(expected);
    });

    it('should return Windows config path', () => {
      os.platform.mockReturnValue('win32');
      const expected = path.join('/home/user', 'AppData', 'Roaming', 'pi-audio-kiosk');
      expect(PlatformDetection.getConfigPath()).toBe(expected);
    });

    it('should return default config path for unknown platforms', () => {
      os.platform.mockReturnValue('freebsd');
      const expected = path.join('/home/user', '.pi-audio-kiosk');
      expect(PlatformDetection.getConfigPath()).toBe(expected);
    });
  });

  describe('getPreferencesPath', () => {
    it('should return preferences file path within config directory', () => {
      os.platform.mockReturnValue('linux');
      os.homedir.mockReturnValue('/home/user');
      
      const expected = path.join('/home/user', '.config', 'pi-audio-kiosk', 'preferences.json');
      expect(PlatformDetection.getPreferencesPath()).toBe(expected);
    });
  });

  describe('getAudioDeviceStrategy', () => {
    it('should return "macos" for Darwin platform', () => {
      os.platform.mockReturnValue('darwin');
      expect(PlatformDetection.getAudioDeviceStrategy()).toBe('macos');
    });

    it('should return "linux" for Linux platform', () => {
      os.platform.mockReturnValue('linux');
      expect(PlatformDetection.getAudioDeviceStrategy()).toBe('linux');
    });

    it('should return "windows" for Windows platform', () => {
      os.platform.mockReturnValue('win32');
      expect(PlatformDetection.getAudioDeviceStrategy()).toBe('windows');
    });

    it('should return "fallback" for unknown platforms', () => {
      os.platform.mockReturnValue('freebsd');
      expect(PlatformDetection.getAudioDeviceStrategy()).toBe('fallback');
    });
  });

  describe('getSystemInfo', () => {
    it('should return comprehensive system information', () => {
      os.platform.mockReturnValue('linux');
      os.arch.mockReturnValue('arm64');
      os.release.mockReturnValue('5.4.0-1043-raspi');
      os.hostname.mockReturnValue('raspberrypi');
      os.homedir.mockReturnValue('/home/pi');
      fs.readFileSync.mockReturnValue('Hardware\t: BCM2711\nModel\t\t: Raspberry Pi 4 Model B Rev 1.4');
      
      const systemInfo = PlatformDetection.getSystemInfo();
      
      expect(systemInfo).toEqual({
        platform: 'linux',
        arch: 'arm64',
        release: '5.4.0-1043-raspi',
        hostname: 'raspberrypi',
        isRaspberryPi: true,
        audioStrategy: 'linux',
        configPath: path.join('/home/pi', '.config', 'pi-audio-kiosk'),
        nodeVersion: process.version
      });
    });
  });

  describe('ensureConfigDirectory', () => {
    beforeEach(() => {
      os.platform.mockReturnValue('linux');
      os.homedir.mockReturnValue('/home/user');
    });

    it('should return true when directory already exists', () => {
      fs.existsSync.mockReturnValue(true);
      
      expect(PlatformDetection.ensureConfigDirectory()).toBe(true);
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should create directory and return true when it does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {});
      
      expect(PlatformDetection.ensureConfigDirectory()).toBe(true);
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        path.join('/home/user', '.config', 'pi-audio-kiosk'),
        { recursive: true }
      );
    });

    it('should return false when directory creation fails', () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      expect(PlatformDetection.ensureConfigDirectory()).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to create config directory:', 'Permission denied');
      
      consoleSpy.mockRestore();
    });
  });
});