const fs = require('fs');
const path = require('path');
const VersionManager = require('../utils/versionManager');

describe('VersionManager', () => {
  let versionManager;
  const testVersionFile = path.join(__dirname, '..', 'Version.txt');
  const originalVersionContent = fs.existsSync(testVersionFile) ? 
    fs.readFileSync(testVersionFile, 'utf8') : null;

  beforeEach(() => {
    versionManager = new VersionManager();
    versionManager.clearCache();
  });

  afterEach(() => {
    // Restore original version file if it existed
    if (originalVersionContent !== null) {
      fs.writeFileSync(testVersionFile, originalVersionContent);
    } else if (fs.existsSync(testVersionFile)) {
      fs.unlinkSync(testVersionFile);
    }
  });

  describe('getCurrentVersion', () => {
    test('should read version from existing file', async () => {
      // Create test version file
      fs.writeFileSync(testVersionFile, '1.2');
      
      const version = await versionManager.getCurrentVersion();
      expect(version).toBe('1.2');
    });

    test('should return "unknown" when file does not exist', async () => {
      // Ensure file doesn't exist
      if (fs.existsSync(testVersionFile)) {
        fs.unlinkSync(testVersionFile);
      }
      
      const version = await versionManager.getCurrentVersion();
      expect(version).toBe('unknown');
    });

    test('should return "unknown" when file is empty', async () => {
      // Create empty version file
      fs.writeFileSync(testVersionFile, '');
      
      const version = await versionManager.getCurrentVersion();
      expect(version).toBe('unknown');
    });

    test('should trim whitespace from version', async () => {
      // Create version file with whitespace
      fs.writeFileSync(testVersionFile, '  1.2  \n');
      
      const version = await versionManager.getCurrentVersion();
      expect(version).toBe('1.2');
    });

    test('should cache version for subsequent calls', async () => {
      // Create test version file
      fs.writeFileSync(testVersionFile, '1.2');
      
      const version1 = await versionManager.getCurrentVersion();
      
      // Modify file after first read
      fs.writeFileSync(testVersionFile, '2.0');
      
      // Should return cached version
      const version2 = await versionManager.getCurrentVersion();
      expect(version1).toBe('1.2');
      expect(version2).toBe('1.2'); // Still cached
    });
  });

  describe('updateVersion', () => {
    test('should update version file successfully', async () => {
      const result = await versionManager.updateVersion('2.0');
      expect(result).toBe(true);
      
      const fileContent = fs.readFileSync(testVersionFile, 'utf8');
      expect(fileContent).toBe('2.0');
    });

    test('should return false for invalid version', async () => {
      const result = await versionManager.updateVersion('');
      expect(result).toBe(false);
    });

    test('should return false for null version', async () => {
      const result = await versionManager.updateVersion(null);
      expect(result).toBe(false);
    });

    test('should trim whitespace when updating', async () => {
      const result = await versionManager.updateVersion('  2.1  ');
      expect(result).toBe(true);
      
      const fileContent = fs.readFileSync(testVersionFile, 'utf8');
      expect(fileContent).toBe('2.1');
    });
  });

  describe('isVersionFileAvailable', () => {
    test('should return true when file exists and is readable', async () => {
      fs.writeFileSync(testVersionFile, '1.0');
      
      const available = await versionManager.isVersionFileAvailable();
      expect(available).toBe(true);
    });

    test('should return false when file does not exist', async () => {
      if (fs.existsSync(testVersionFile)) {
        fs.unlinkSync(testVersionFile);
      }
      
      const available = await versionManager.isVersionFileAvailable();
      expect(available).toBe(false);
    });
  });

  describe('isValidVersionFormat', () => {
    test('should validate semantic versions', () => {
      expect(versionManager.isValidVersionFormat('1.0')).toBe(true);
      expect(versionManager.isValidVersionFormat('1.2')).toBe(true);
      expect(versionManager.isValidVersionFormat('1.0.0')).toBe(true);
      expect(versionManager.isValidVersionFormat('1.2.3')).toBe(true);
      expect(versionManager.isValidVersionFormat('1.0.0-beta')).toBe(true);
      expect(versionManager.isValidVersionFormat('2.1.0-alpha.1')).toBe(true);
    });

    test('should validate simple version numbers', () => {
      expect(versionManager.isValidVersionFormat('1.0')).toBe(true);
      expect(versionManager.isValidVersionFormat('v1.0')).toBe(true);
      expect(versionManager.isValidVersionFormat('2.1')).toBe(true);
    });

    test('should validate git commit hashes', () => {
      expect(versionManager.isValidVersionFormat('a1b2c3d')).toBe(true);
      expect(versionManager.isValidVersionFormat('1234567890abcdef')).toBe(true);
    });

    test('should validate date-based versions', () => {
      expect(versionManager.isValidVersionFormat('2024.01.15')).toBe(true);
      expect(versionManager.isValidVersionFormat('2023.12.31')).toBe(true);
    });

    test('should reject invalid formats', () => {
      expect(versionManager.isValidVersionFormat('')).toBe(false);
      expect(versionManager.isValidVersionFormat(null)).toBe(false);
      expect(versionManager.isValidVersionFormat(undefined)).toBe(false);
      expect(versionManager.isValidVersionFormat('invalid version!')).toBe(false);
    });

    test('should reject overly long versions', () => {
      const longVersion = 'a'.repeat(51);
      expect(versionManager.isValidVersionFormat(longVersion)).toBe(false);
    });
  });

  describe('clearCache', () => {
    test('should clear cached version', async () => {
      fs.writeFileSync(testVersionFile, '1.0');
      
      // Read version to cache it
      await versionManager.getCurrentVersion();
      
      // Update file
      fs.writeFileSync(testVersionFile, '2.0');
      
      // Clear cache
      versionManager.clearCache();
      
      // Should read new version
      const version = await versionManager.getCurrentVersion();
      expect(version).toBe('2.0');
    });
  });
});