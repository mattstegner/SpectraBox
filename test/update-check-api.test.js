const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');

// Mock the services
const mockVersionManager = {
  getCurrentVersion: jest.fn(),
  isVersionFileAvailable: jest.fn(),
  getVersionFilePath: jest.fn().mockReturnValue('/test/Version.txt')
};

const mockGitHubService = {
  checkForUpdates: jest.fn(),
  getRateLimitInfo: jest.fn().mockReturnValue({
    remaining: 4999,
    resetTime: '2024-01-01T00:00:00.000Z'
  })
};

// Create a test app with just the update check endpoint
function createTestApp() {
  const app = express();

  // Mock logger
  const mockLogger = {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };

  // Add the update check endpoint
  app.get('/api/update/check', async (req, res) => {
    try {
      // Get current version
      const currentVersion = await mockVersionManager.getCurrentVersion();
      
      mockLogger.info('Checking for updates', { currentVersion });

      // Check for updates from GitHub
      const updateInfo = await mockGitHubService.checkForUpdates(currentVersion);
      
      mockLogger.info('Update check completed', {
        updateAvailable: updateInfo.updateAvailable,
        localVersion: updateInfo.localVersion,
        remoteVersion: updateInfo.remoteVersion
      });

      res.json({
        success: true,
        updateAvailable: updateInfo.updateAvailable,
        currentVersion: updateInfo.localVersion,
        latestVersion: updateInfo.remoteVersion,
        updateInfo: {
          comparisonMethod: updateInfo.comparisonMethod,
          repositoryUrl: updateInfo.repositoryUrl,
          lastChecked: updateInfo.lastChecked,
          remoteInfo: updateInfo.remoteInfo
        },
        rateLimitInfo: updateInfo.rateLimitInfo
      });
    } catch (error) {
      mockLogger.error('Error checking for updates', error);

      // Determine appropriate error code and message
      let statusCode = 500;
      let errorCode = 'UPDATE_CHECK_ERROR';
      let userMessage = 'Failed to check for updates';

      if (error.message.includes('rate limit')) {
        statusCode = 429;
        errorCode = 'RATE_LIMIT_EXCEEDED';
        userMessage = 'GitHub API rate limit exceeded. Please try again later.';
      } else if (error.message.includes('not found')) {
        statusCode = 404;
        errorCode = 'REPOSITORY_NOT_FOUND';
        userMessage = 'Repository not found or not accessible';
      } else if (error.message.includes('timed out')) {
        statusCode = 408;
        errorCode = 'REQUEST_TIMEOUT';
        userMessage = 'Request to GitHub timed out. Please check your internet connection.';
      } else if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
        statusCode = 503;
        errorCode = 'NETWORK_ERROR';
        userMessage = 'Network error connecting to GitHub. Please check your internet connection.';
      }

      res.status(statusCode).json({
        success: false,
        error: errorCode,
        message: userMessage,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        updateAvailable: false,
        currentVersion: await mockVersionManager.getCurrentVersion().catch(() => 'unknown'),
        latestVersion: 'unknown',
        rateLimitInfo: mockGitHubService.getRateLimitInfo()
      });
    }
  });

  return app;
}

describe('Update Check API Endpoints', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
  });

  describe('GET /api/update/check', () => {
    test('should return update available when newer version exists', async () => {
      mockVersionManager.getCurrentVersion.mockResolvedValue('1.0.0');
      mockGitHubService.checkForUpdates.mockResolvedValue({
        updateAvailable: true,
        localVersion: '1.0.0',
        remoteVersion: '1.1.0',
        comparisonMethod: 'release',
        repositoryUrl: 'https://github.com/mattstegner/SpectraBox',
        lastChecked: '2024-01-01T00:00:00.000Z',
        remoteInfo: {
          version: '1.1.0',
          name: 'Release 1.1.0',
          publishedAt: '2024-01-01T00:00:00.000Z',
          htmlUrl: 'https://github.com/mattstegner/SpectraBox/releases/tag/1.1.0'
        },
        rateLimitInfo: {
          remaining: 4999,
          resetTime: '2024-01-01T00:00:00.000Z'
        }
      });

      const response = await request(app)
        .get('/api/update/check')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        updateAvailable: true,
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        updateInfo: {
          comparisonMethod: 'release',
          repositoryUrl: 'https://github.com/mattstegner/SpectraBox',
          lastChecked: '2024-01-01T00:00:00.000Z',
          remoteInfo: expect.any(Object)
        },
        rateLimitInfo: expect.any(Object)
      });
    });

    test('should return no update when versions are same', async () => {
      mockVersionManager.getCurrentVersion.mockResolvedValue('1.0.0');
      mockGitHubService.checkForUpdates.mockResolvedValue({
        updateAvailable: false,
        localVersion: '1.0.0',
        remoteVersion: '1.0.0',
        comparisonMethod: 'release',
        repositoryUrl: 'https://github.com/mattstegner/SpectraBox',
        lastChecked: '2024-01-01T00:00:00.000Z',
        remoteInfo: {
          version: '1.0.0',
          name: 'Release 1.0.0',
          publishedAt: '2024-01-01T00:00:00.000Z'
        },
        rateLimitInfo: {
          remaining: 4999,
          resetTime: '2024-01-01T00:00:00.000Z'
        }
      });

      const response = await request(app)
        .get('/api/update/check')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        updateAvailable: false,
        currentVersion: '1.0.0',
        latestVersion: '1.0.0'
      });
    });

    test('should handle rate limit errors', async () => {
      mockVersionManager.getCurrentVersion.mockResolvedValue('1.0.0');
      mockGitHubService.checkForUpdates.mockRejectedValue(
        new Error('GitHub API rate limit exceeded')
      );

      const response = await request(app)
        .get('/api/update/check')
        .expect(429);

      expect(response.body).toMatchObject({
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'GitHub API rate limit exceeded. Please try again later.',
        updateAvailable: false,
        currentVersion: '1.0.0',
        latestVersion: 'unknown'
      });
    });

    test('should handle repository not found errors', async () => {
      mockVersionManager.getCurrentVersion.mockResolvedValue('1.0.0');
      mockGitHubService.checkForUpdates.mockRejectedValue(
        new Error('Repository not found')
      );

      const response = await request(app)
        .get('/api/update/check')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: 'REPOSITORY_NOT_FOUND',
        message: 'Repository not found or not accessible',
        updateAvailable: false
      });
    });

    test('should handle network timeout errors', async () => {
      mockVersionManager.getCurrentVersion.mockResolvedValue('1.0.0');
      mockGitHubService.checkForUpdates.mockRejectedValue(
        new Error('Request timed out')
      );

      const response = await request(app)
        .get('/api/update/check')
        .expect(408);

      expect(response.body).toMatchObject({
        success: false,
        error: 'REQUEST_TIMEOUT',
        message: 'Request to GitHub timed out. Please check your internet connection.',
        updateAvailable: false
      });
    });

    test('should handle network errors', async () => {
      mockVersionManager.getCurrentVersion.mockResolvedValue('1.0.0');
      mockGitHubService.checkForUpdates.mockRejectedValue(
        new Error('ENOTFOUND github.com')
      );

      const response = await request(app)
        .get('/api/update/check')
        .expect(503);

      expect(response.body).toMatchObject({
        success: false,
        error: 'NETWORK_ERROR',
        message: 'Network error connecting to GitHub. Please check your internet connection.',
        updateAvailable: false
      });
    });

    test('should handle unknown local version', async () => {
      mockVersionManager.getCurrentVersion.mockResolvedValue('unknown');
      mockGitHubService.checkForUpdates.mockResolvedValue({
        updateAvailable: true,
        localVersion: 'unknown',
        remoteVersion: '1.0.0',
        comparisonMethod: 'release',
        repositoryUrl: 'https://github.com/mattstegner/SpectraBox',
        lastChecked: '2024-01-01T00:00:00.000Z',
        remoteInfo: {
          version: '1.0.0'
        },
        rateLimitInfo: {
          remaining: 4999,
          resetTime: '2024-01-01T00:00:00.000Z'
        }
      });

      const response = await request(app)
        .get('/api/update/check')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        updateAvailable: true,
        currentVersion: 'unknown',
        latestVersion: '1.0.0'
      });
    });

    test('should include rate limit information in response', async () => {
      mockVersionManager.getCurrentVersion.mockResolvedValue('1.0.0');
      mockGitHubService.checkForUpdates.mockResolvedValue({
        updateAvailable: false,
        localVersion: '1.0.0',
        remoteVersion: '1.0.0',
        comparisonMethod: 'release',
        repositoryUrl: 'https://github.com/mattstegner/SpectraBox',
        lastChecked: '2024-01-01T00:00:00.000Z',
        remoteInfo: {},
        rateLimitInfo: {
          remaining: 4999,
          resetTime: '2024-01-01T00:00:00.000Z'
        }
      });

      const response = await request(app)
        .get('/api/update/check')
        .expect(200);

      expect(response.body.rateLimitInfo).toEqual({
        remaining: 4999,
        resetTime: '2024-01-01T00:00:00.000Z'
      });
    });
  });

  describe('API Response Format', () => {
    test('should follow consistent API response format', async () => {
      mockVersionManager.getCurrentVersion.mockResolvedValue('1.0.0');
      mockGitHubService.checkForUpdates.mockResolvedValue({
        updateAvailable: false,
        localVersion: '1.0.0',
        remoteVersion: '1.0.0',
        comparisonMethod: 'release',
        repositoryUrl: 'https://github.com/mattstegner/SpectraBox',
        lastChecked: '2024-01-01T00:00:00.000Z',
        remoteInfo: {},
        rateLimitInfo: {
          remaining: 4999,
          resetTime: '2024-01-01T00:00:00.000Z'
        }
      });

      const response = await request(app)
        .get('/api/update/check')
        .expect(200);

      // Check response structure matches other API endpoints
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('updateAvailable');
      expect(response.body).toHaveProperty('currentVersion');
      expect(response.body).toHaveProperty('latestVersion');
      expect(response.body).toHaveProperty('updateInfo');
      expect(response.body).toHaveProperty('rateLimitInfo');
      
      expect(response.body.updateInfo).toHaveProperty('comparisonMethod');
      expect(response.body.updateInfo).toHaveProperty('repositoryUrl');
      expect(response.body.updateInfo).toHaveProperty('lastChecked');
    });

    test('should return proper content type', async () => {
      mockVersionManager.getCurrentVersion.mockResolvedValue('1.0.0');
      mockGitHubService.checkForUpdates.mockResolvedValue({
        updateAvailable: false,
        localVersion: '1.0.0',
        remoteVersion: '1.0.0',
        comparisonMethod: 'release',
        repositoryUrl: 'https://github.com/mattstegner/SpectraBox',
        lastChecked: '2024-01-01T00:00:00.000Z',
        remoteInfo: {},
        rateLimitInfo: {}
      });

      const response = await request(app)
        .get('/api/update/check')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toBeDefined();
    });
  });
});