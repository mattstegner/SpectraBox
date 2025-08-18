const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');
const VersionManager = require('../utils/versionManager');

// Create a test app with just the version endpoint
function createTestApp() {
  const app = express();
  const versionManager = new VersionManager();

  // Mock logger
  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };

  // Add the version endpoint
  app.get('/api/version', async (req, res) => {
    try {
      const currentVersion = await versionManager.getCurrentVersion();
      const isVersionFileAvailable = await versionManager.isVersionFileAvailable();
      
      mockLogger.debug('Version information retrieved', { 
        version: currentVersion,
        fileAvailable: isVersionFileAvailable 
      });

      res.json({
        success: true,
        version: currentVersion,
        versionFile: {
          available: isVersionFileAvailable,
          path: versionManager.getVersionFilePath()
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      mockLogger.error('Error getting version information', error);

      let statusCode = 500;
      let errorCode = 'VERSION_ERROR';
      let userMessage = 'Failed to get version information';

      if (error.code === 'EACCES') {
        statusCode = 403;
        errorCode = 'PERMISSION_DENIED';
        userMessage = 'Permission denied accessing version file';
      }

      res.status(statusCode).json({
        success: false,
        error: errorCode,
        message: userMessage,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        version: 'unknown',
        versionFile: {
          available: false,
          path: versionManager.getVersionFilePath()
        }
      });
    }
  });

  return app;
}

describe('Version API Endpoints', () => {
  let app;
  const testVersionFile = path.join(__dirname, '..', 'Version.txt');
  const originalVersionContent = fs.existsSync(testVersionFile) ? 
    fs.readFileSync(testVersionFile, 'utf8') : null;

  beforeEach(() => {
    app = createTestApp();
  });

  afterEach(() => {
    // Restore original version file if it existed
    if (originalVersionContent !== null) {
      fs.writeFileSync(testVersionFile, originalVersionContent);
    } else if (fs.existsSync(testVersionFile)) {
      fs.unlinkSync(testVersionFile);
    }
  });

  describe('GET /api/version', () => {
    test('should return version when file exists', async () => {
      // Create test version file
      fs.writeFileSync(testVersionFile, '1.2');

      const response = await request(app)
        .get('/api/version')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        version: '1.2',
        versionFile: {
          available: true,
          path: expect.stringContaining('Version.txt')
        },
        timestamp: expect.any(String)
      });
    });

    test('should return "unknown" when version file does not exist', async () => {
      // Ensure file doesn't exist
      if (fs.existsSync(testVersionFile)) {
        fs.unlinkSync(testVersionFile);
      }

      const response = await request(app)
        .get('/api/version')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        version: 'unknown',
        versionFile: {
          available: false,
          path: expect.stringContaining('Version.txt')
        },
        timestamp: expect.any(String)
      });
    });

    test('should return "unknown" when version file is empty', async () => {
      // Create empty version file
      fs.writeFileSync(testVersionFile, '');

      const response = await request(app)
        .get('/api/version')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        version: 'unknown',
        versionFile: {
          available: true,
          path: expect.stringContaining('Version.txt')
        }
      });
    });

    test('should trim whitespace from version', async () => {
      // Create version file with whitespace
      fs.writeFileSync(testVersionFile, '  2.0  \n');

      const response = await request(app)
        .get('/api/version')
        .expect(200);

      expect(response.body.version).toBe('2.0');
    });

    test('should include timestamp in response', async () => {
      fs.writeFileSync(testVersionFile, '1.0');

      const response = await request(app)
        .get('/api/version')
        .expect(200);

      expect(response.body.timestamp).toBeDefined();
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });

    test('should handle various version formats', async () => {
      const versionFormats = [
        '1.0',
        '2.1',
        '1.0.0',
        'v2.1.0',
        '1.0-beta',
        'a1b2c3d4e5f6',
        '2024.01.15'
      ];

      for (const version of versionFormats) {
        // Create a fresh app for each test to avoid caching issues
        const testApp = createTestApp();
        fs.writeFileSync(testVersionFile, version);

        const response = await request(testApp)
          .get('/api/version')
          .expect(200);

        expect(response.body.version).toBe(version);
        expect(response.body.success).toBe(true);
      }
    });
  });

  describe('Version API Error Handling', () => {
    test('should handle missing file gracefully', async () => {
      // Ensure file doesn't exist
      if (fs.existsSync(testVersionFile)) {
        fs.unlinkSync(testVersionFile);
      }

      const response = await request(app)
        .get('/api/version')
        .expect(200);

      expect(response.body.version).toBe('unknown');
      expect(response.body.success).toBe(true);
      expect(response.body.versionFile.available).toBe(false);
    });
  });

  describe('API Response Format', () => {
    test('should follow consistent API response format', async () => {
      fs.writeFileSync(testVersionFile, '1.0');

      const response = await request(app)
        .get('/api/version')
        .expect(200);

      // Check response structure matches other API endpoints
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('versionFile');
      expect(response.body).toHaveProperty('timestamp');
      
      expect(response.body.versionFile).toHaveProperty('available');
      expect(response.body.versionFile).toHaveProperty('path');
    });

    test('should return proper content type', async () => {
      fs.writeFileSync(testVersionFile, '1.0');

      const response = await request(app)
        .get('/api/version')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toBeDefined();
    });
  });
});