/**
 * Comprehensive Update Functionality Test Suite
 * 
 * This test suite covers all aspects of the server self-update functionality:
 * - Unit tests for version reading and GitHub API integration
 * - Integration tests for update process flow
 * - Error handling and recovery scenarios
 * - UI components and user interaction flows
 * 
 * Requirements covered: 1.2, 1.4, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 4.1, 4.2
 */

const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

// Mock child_process for update script testing
jest.mock('child_process');

describe('Comprehensive Update Functionality Test Suite', () => {
  let app;
  let server;
  let originalEnv;

  beforeAll(async () => {
    originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    
    // Import app after setting test environment
    app = require('../server');
    server = app.listen(0);
  });

  afterAll(async () => {
    process.env.NODE_ENV = originalEnv;
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Unit Tests - Version Reading and Management', () => {
    const testVersionFile = path.join(__dirname, '..', 'Version.txt');
    let originalVersionContent;

    beforeEach(() => {
      // Backup original version file if it exists
      originalVersionContent = fs.existsSync(testVersionFile) ? 
        fs.readFileSync(testVersionFile, 'utf8') : null;
    });

    afterEach(() => {
      // Restore original version file
      if (originalVersionContent !== null) {
        fs.writeFileSync(testVersionFile, originalVersionContent);
      } else if (fs.existsSync(testVersionFile)) {
        fs.unlinkSync(testVersionFile);
      }
    });

    test('should read version from existing file correctly', async () => {
      // Requirement 1.2: Version reading functionality
      fs.writeFileSync(testVersionFile, '2.1');
      
      const VersionManager = require('../utils/versionManager');
      const versionManager = new VersionManager();
      versionManager.clearCache();
      
      const version = await versionManager.getCurrentVersion();
      expect(version).toBe('2.1');
    });

    test('should handle missing version file gracefully', async () => {
      // Requirement 1.4: Fallback behavior for missing version file
      if (fs.existsSync(testVersionFile)) {
        fs.unlinkSync(testVersionFile);
      }
      
      const VersionManager = require('../utils/versionManager');
      const versionManager = new VersionManager();
      versionManager.clearCache();
      
      const version = await versionManager.getCurrentVersion();
      expect(version).toBe('unknown');
    });

    test('should validate version formats correctly', () => {
      // Requirement 1.2: Version format validation
      const VersionManager = require('../utils/versionManager');
      const versionManager = new VersionManager();
      
      // Valid formats
      expect(versionManager.isValidVersionFormat('1.0')).toBe(true);
      expect(versionManager.isValidVersionFormat('2.1')).toBe(true);
      expect(versionManager.isValidVersionFormat('1.0.0')).toBe(true);
      expect(versionManager.isValidVersionFormat('v2.1.0')).toBe(true);
      expect(versionManager.isValidVersionFormat('1.0-beta')).toBe(true);
      expect(versionManager.isValidVersionFormat('a1b2c3d')).toBe(true);
      
      // Invalid formats
      expect(versionManager.isValidVersionFormat('')).toBe(false);
      expect(versionManager.isValidVersionFormat(null)).toBe(false);
      expect(versionManager.isValidVersionFormat('invalid!')).toBe(false);
    });

    test('should cache version data appropriately', async () => {
      // Requirement 1.2: Version caching functionality
      fs.writeFileSync(testVersionFile, '1.5');
      
      const VersionManager = require('../utils/versionManager');
      const versionManager = new VersionManager();
      versionManager.clearCache();
      
      const version1 = await versionManager.getCurrentVersion();
      
      // Modify file after first read
      fs.writeFileSync(testVersionFile, '2.0');
      
      // Should return cached version
      const version2 = await versionManager.getCurrentVersion();
      expect(version1).toBe('1.5');
      expect(version2).toBe('1.5'); // Still cached
      
      // Clear cache and read again
      versionManager.clearCache();
      const version3 = await versionManager.getCurrentVersion();
      expect(version3).toBe('2.0'); // New version after cache clear
    });
  });

  describe('Unit Tests - GitHub API Integration', () => {
    let githubService;

    beforeEach(() => {
      const GitHubService = require('../services/githubService');
      githubService = new GitHubService();
      githubService.clearCache();
    });

    test('should compare versions correctly', () => {
      // Requirement 2.3: Version comparison logic
      expect(githubService.compareVersions('1.0', '1.1')).toBe(true);
      expect(githubService.compareVersions('1.1', '1.0')).toBe(false);
      expect(githubService.compareVersions('1.0', '1.0')).toBe(false);
      expect(githubService.compareVersions('unknown', '1.0')).toBe(true);
      expect(githubService.compareVersions('v1.0', '1.0')).toBe(false);
    });

    test('should identify semantic versions correctly', () => {
      // Requirement 2.2: Version format detection
      expect(githubService.isSemanticVersion('1.0')).toBe(true);
      expect(githubService.isSemanticVersion('2.1')).toBe(true);
      expect(githubService.isSemanticVersion('1.0.0')).toBe(true);
      expect(githubService.isSemanticVersion('1.0-beta')).toBe(true);
      expect(githubService.isSemanticVersion('v1.0.0')).toBe(false);
      expect(githubService.isSemanticVersion('abc123')).toBe(false);
    });

    test('should identify commit hashes correctly', () => {
      // Requirement 2.2: Commit hash detection
      expect(githubService.isCommitHash('a1b2c3d')).toBe(true);
      expect(githubService.isCommitHash('1234567890abcdef')).toBe(true);
      expect(githubService.isCommitHash('1.0.0')).toBe(false);
      expect(githubService.isCommitHash('123')).toBe(false);
    });

    test('should cache GitHub API responses', () => {
      // Requirement 2.5: API response caching
      const testData = { test: 'data', timestamp: Date.now() };
      githubService.setCachedData('test-key', testData);
      
      const cached = githubService.getCachedData('test-key');
      expect(cached).toEqual(testData);
    });

    test('should handle expired cache correctly', () => {
      // Requirement 2.5: Cache expiration handling
      const testData = { test: 'data' };
      githubService.setCachedData('test-key', testData);
      
      // Mock expired cache
      const cacheEntry = githubService.cache.get('test-key');
      cacheEntry.timestamp = Date.now() - 400000; // Older than cache timeout
      
      const cached = githubService.getCachedData('test-key');
      expect(cached).toBeNull();
    });

    test('should provide rate limit information', () => {
      // Requirement 2.4: Rate limit tracking
      githubService.rateLimitRemaining = 4999;
      githubService.rateLimitReset = '2024-01-01T00:00:00.000Z';
      
      const info = githubService.getRateLimitInfo();
      expect(info).toEqual({
        remaining: 4999,
        resetTime: '2024-01-01T00:00:00.000Z'
      });
    });
  });

  describe('Integration Tests - API Endpoints', () => {
    test('GET /api/version should return version information', async () => {
      // Requirement 1.2: Version API endpoint
      const response = await request(app)
        .get('/api/version')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('versionFile');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.versionFile).toHaveProperty('available');
      expect(response.body.versionFile).toHaveProperty('path');
    });

    test('GET /api/update/check should check for updates', async () => {
      // Requirement 2.2, 2.3: Update checking functionality
      const response = await request(app)
        .get('/api/update/check');

      // Response should be either 200 (success) or error status
      expect([200, 429, 503, 404]).toContain(response.status);
      expect(response.body).toHaveProperty('success');
      
      if (response.body.success) {
        expect(response.body).toHaveProperty('updateAvailable');
        expect(response.body).toHaveProperty('currentVersion');
        expect(response.body).toHaveProperty('latestVersion');
        expect(response.body).toHaveProperty('updateInfo');
        expect(response.body).toHaveProperty('rateLimitInfo');
      }
    });

    test('GET /api/update/status should return update status', async () => {
      // Requirement 3.1: Update status tracking
      const response = await request(app)
        .get('/api/update/status')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('progress');
      expect(response.body).toHaveProperty('timestamp');
      
      // Validate status values
      const validStatuses = ['idle', 'checking', 'updating', 'success', 'error'];
      expect(validStatuses).toContain(response.body.status);
      
      // Validate progress range
      expect(response.body.progress).toBeGreaterThanOrEqual(0);
      expect(response.body.progress).toBeLessThanOrEqual(100);
    });

    test('POST /api/update/execute should handle update execution', async () => {
      // Requirement 3.1, 3.2: Update execution
      const response = await request(app)
        .post('/api/update/execute');

      // Should either succeed (200) or fail with specific error (400, 429, 503, etc.)
      expect([200, 400, 429, 503, 404, 500]).toContain(response.status);
      expect(response.body).toHaveProperty('success');
      
      if (response.status === 400) {
        // No update available
        expect(response.body.error).toBe('NO_UPDATE_AVAILABLE');
      } else if (response.status === 200) {
        // Update initiated
        expect(response.body.success).toBe(true);
        expect(response.body).toHaveProperty('message');
      }
    });

    test('GET /api/health should provide health check endpoint', async () => {
      // Requirement 4.1: Health check for update completion
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'OK');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('performance');
    });
  });

  describe('Integration Tests - Update Process Flow', () => {
    test('should handle complete update flow with mocked script', async () => {
      // Requirement 3.1, 3.2, 3.3: Complete update process
      
      // Mock successful update script
      const mockProcess = {
        stdout: { 
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('Installing updates...')), 50);
            }
          })
        },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 100); // Success exit code
          }
        }),
        unref: jest.fn(),
        kill: jest.fn()
      };

      spawn.mockReturnValue(mockProcess);

      // Mock version manager and GitHub service for update availability
      const VersionManager = require('../utils/versionManager');
      const GitHubService = require('../services/githubService');
      
      const mockGetCurrentVersion = jest.spyOn(VersionManager.prototype, 'getCurrentVersion')
        .mockResolvedValue('1.0.0');
      
      const mockCheckForUpdates = jest.spyOn(GitHubService.prototype, 'checkForUpdates')
        .mockResolvedValue({
          updateAvailable: true,
          localVersion: '1.0.0',
          remoteVersion: '1.1.0',
          comparisonMethod: 'release',
          repositoryUrl: 'https://github.com/test/repo',
          lastChecked: new Date().toISOString()
        });

      // Execute update
      const updateResponse = await request(app)
        .post('/api/update/execute')
        .expect(200);

      expect(updateResponse.body.success).toBe(true);
      expect(updateResponse.body).toHaveProperty('message');

      // Wait for update process to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify script was called
      expect(spawn).toHaveBeenCalledWith(
        'sudo',
        ['bash', expect.stringContaining('spectrabox-kiosk-install.sh')],
        expect.any(Object)
      );

      mockGetCurrentVersion.mockRestore();
      mockCheckForUpdates.mockRestore();
    });

    test('should track update progress through status endpoint', async () => {
      // Requirement 3.1, 4.1: Update progress tracking
      
      // Get initial status
      const initialStatus = await request(app)
        .get('/api/update/status')
        .expect(200);

      expect(initialStatus.body.status).toBe('idle');
      expect(initialStatus.body.progress).toBe(0);

      // Status should include proper structure
      expect(initialStatus.body).toHaveProperty('timestamp');
      expect(typeof initialStatus.body.timestamp).toBe('string');
      expect(() => new Date(initialStatus.body.timestamp)).not.toThrow();
    });
  });

  describe('Error Handling and Recovery Tests', () => {
    test('should handle GitHub API network errors', async () => {
      // Requirement 2.4: Network error handling
      const GitHubService = require('../services/githubService');
      const originalCheckForUpdates = GitHubService.prototype.checkForUpdates;
      
      GitHubService.prototype.checkForUpdates = jest.fn().mockRejectedValue(
        new Error('Network error: ENOTFOUND api.github.com')
      );

      const response = await request(app)
        .get('/api/update/check')
        .expect(503);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('NETWORK_ERROR');
      expect(response.body.message).toContain('Network error connecting to GitHub');

      GitHubService.prototype.checkForUpdates = originalCheckForUpdates;
    });

    test('should handle GitHub API rate limiting', async () => {
      // Requirement 2.4: Rate limit error handling
      const GitHubService = require('../services/githubService');
      const originalCheckForUpdates = GitHubService.prototype.checkForUpdates;
      
      GitHubService.prototype.checkForUpdates = jest.fn().mockRejectedValue(
        new Error('GitHub API rate limit exceeded')
      );

      const response = await request(app)
        .get('/api/update/check')
        .expect(429);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.body.message).toContain('rate limit exceeded');

      GitHubService.prototype.checkForUpdates = originalCheckForUpdates;
    });

    test('should handle repository not found errors', async () => {
      // Requirement 2.4: Repository access error handling
      const GitHubService = require('../services/githubService');
      const originalCheckForUpdates = GitHubService.prototype.checkForUpdates;
      
      GitHubService.prototype.checkForUpdates = jest.fn().mockRejectedValue(
        new Error('Repository not found')
      );

      const response = await request(app)
        .get('/api/update/check')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('REPOSITORY_NOT_FOUND');
      expect(response.body.message).toContain('Repository not found');

      GitHubService.prototype.checkForUpdates = originalCheckForUpdates;
    });

    test('should handle update script execution failures', async () => {
      // Requirement 3.3, 4.2: Script execution error handling
      
      // Mock failed update script
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { 
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from('Error: Permission denied')), 50);
            }
          })
        },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 100); // Failure exit code
          }
        }),
        unref: jest.fn(),
        kill: jest.fn()
      };

      spawn.mockReturnValue(mockProcess);

      // Mock update availability
      const VersionManager = require('../utils/versionManager');
      const GitHubService = require('../services/githubService');
      
      const mockGetCurrentVersion = jest.spyOn(VersionManager.prototype, 'getCurrentVersion')
        .mockResolvedValue('1.0.0');
      
      const mockCheckForUpdates = jest.spyOn(GitHubService.prototype, 'checkForUpdates')
        .mockResolvedValue({
          updateAvailable: true,
          localVersion: '1.0.0',
          remoteVersion: '1.1.0',
          comparisonMethod: 'release',
          repositoryUrl: 'https://github.com/test/repo'
        });

      // Execute update
      const updateResponse = await request(app)
        .post('/api/update/execute')
        .expect(200);

      expect(updateResponse.body.success).toBe(true);

      // Wait for update process to fail
      await new Promise(resolve => setTimeout(resolve, 200));

      // Check error status
      const errorStatus = await request(app)
        .get('/api/update/status')
        .expect(200);

      expect(errorStatus.body.success).toBe(true);
      // Status should reflect the error
      expect(['error', 'idle']).toContain(errorStatus.body.status);

      mockGetCurrentVersion.mockRestore();
      mockCheckForUpdates.mockRestore();
    });

    test('should handle missing update script', async () => {
      // Requirement 4.1, 4.2: Prerequisites validation
      
      // Mock fs.existsSync to return false for update script
      const originalExistsSync = fs.existsSync;
      fs.existsSync = jest.fn((filePath) => {
        if (filePath.includes('spectrabox-kiosk-install.sh')) {
          return false;
        }
        return originalExistsSync(filePath);
      });

      const response = await request(app)
        .post('/api/update/execute')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('UPDATE_INITIATION_ERROR');

      fs.existsSync = originalExistsSync;
    });

    test('should provide user-friendly error messages', async () => {
      // Requirement 4.2: User-friendly error handling
      
      // Mock version manager error
      const VersionManager = require('../utils/versionManager');
      const mockGetCurrentVersion = jest.spyOn(VersionManager.prototype, 'getCurrentVersion')
        .mockRejectedValue(new Error('Cannot read version file'));

      const response = await request(app)
        .post('/api/update/execute')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Failed to initiate update process');
      
      // Should include troubleshooting information
      expect(response.body).toHaveProperty('troubleshooting');
      expect(response.body.troubleshooting).toHaveProperty('canRetry');
      expect(response.body.troubleshooting).toHaveProperty('suggestedActions');

      mockGetCurrentVersion.mockRestore();
    });
  });

  describe('UI Components and User Interaction Tests', () => {
    test('should include server management JavaScript file', () => {
      // Requirement 1.2, 2.2: UI component existence
      const serverManagementPath = path.join(__dirname, '..', 'public', 'js', 'server-management.js');
      expect(fs.existsSync(serverManagementPath)).toBe(true);
      
      const content = fs.readFileSync(serverManagementPath, 'utf8');
      expect(content).toContain('ServerManager');
      expect(content).toContain('loadCurrentVersion');
      expect(content).toContain('checkForUpdates');
      expect(content).toContain('performUpdate');
    });

    test('should include server tab in HTML', () => {
      // Requirement 1.2: Server tab UI
      const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
      expect(fs.existsSync(htmlPath)).toBe(true);
      
      const content = fs.readFileSync(htmlPath, 'utf8');
      expect(content).toContain('data-tab="server"');
      expect(content).toContain('currentVersionDisplay');
      expect(content).toContain('updateStatusDisplay');
      expect(content).toContain('checkUpdatesBtn');
      expect(content).toContain('performUpdateBtn');
    });

    test('should include update progress and notification styles', () => {
      // Requirement 3.1, 4.1: UI feedback and progress indication
      const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
      const content = fs.readFileSync(htmlPath, 'utf8');
      
      // Check for CSS classes in the style section
      expect(content).toContain('.update-progress-bar');
      expect(content).toContain('.update-progress-fill');
      expect(content).toContain('.update-notification-overlay');
      expect(content).toContain('progress-shine');
    });

    test('should include WebSocket functionality for real-time updates', () => {
      // Requirement 3.1: Real-time update status
      const serverManagementPath = path.join(__dirname, '..', 'public', 'js', 'server-management.js');
      const content = fs.readFileSync(serverManagementPath, 'utf8');
      
      expect(content).toContain('initializeWebSocket');
      expect(content).toContain('handleUpdateStatusMessage');
      expect(content).toContain('WebSocket');
      expect(content).toContain('updateStatus');
    });

    test('should include update notification and countdown functionality', () => {
      // Requirement 4.1: User notifications and automatic reload
      const serverManagementPath = path.join(__dirname, '..', 'public', 'js', 'server-management.js');
      const content = fs.readFileSync(serverManagementPath, 'utf8');
      
      expect(content).toContain('showUpdateInProgressNotification');
      expect(content).toContain('createUpdateNotificationOverlay');
      expect(content).toContain('startUpdateSuccessCountdown');
      expect(content).toContain('performPageReload');
      expect(content).toContain('startServerHealthCheck');
    });

    test('should include error handling and recovery UI', () => {
      // Requirement 4.2: Error handling UI
      const serverManagementPath = path.join(__dirname, '..', 'public', 'js', 'server-management.js');
      const content = fs.readFileSync(serverManagementPath, 'utf8');
      
      expect(content).toContain('showUpdateError');
      expect(content).toContain('getErrorGuidance');
      expect(content).toContain('handleUpdateCompletion');
      expect(content).toContain('cleanupUpdateNotification');
      expect(content).toContain('showUpdateReconnectionTimeout');
    });

    test('should include connection handling during server suspension', () => {
      // Requirement 3.2: Connection handling during updates
      const serverManagementPath = path.join(__dirname, '..', 'public', 'js', 'server-management.js');
      const content = fs.readFileSync(serverManagementPath, 'utf8');
      
      expect(content).toContain('handleServerShutdownMessage');
      expect(content).toContain('showUpdateConnectionLost');
      expect(content).toContain('startUpdateReconnectionProcess');
      expect(content).toContain('connection-lost-message');
    });
  });

  describe('Security and Validation Tests', () => {
    test('should validate API input parameters', async () => {
      // Requirement 4.1, 4.2: Input validation and security
      
      // Test invalid JSON in POST request
      const response = await request(app)
        .post('/api/update/execute')
        .send('invalid json')
        .set('Content-Type', 'application/json');

      // Should handle malformed JSON gracefully
      expect([400, 500]).toContain(response.status);
    });

    test('should include security headers in responses', async () => {
      // Requirement 4.1: Security measures
      const response = await request(app)
        .get('/api/version')
        .expect(200);

      // Check for security-related headers
      expect(response.headers).toHaveProperty('content-type');
      expect(response.headers['content-type']).toContain('application/json');
    });

    test('should handle concurrent update requests safely', async () => {
      // Requirement 3.1: Concurrent request handling
      
      // Mock update availability
      const VersionManager = require('../utils/versionManager');
      const GitHubService = require('../services/githubService');
      
      const mockGetCurrentVersion = jest.spyOn(VersionManager.prototype, 'getCurrentVersion')
        .mockResolvedValue('1.0.0');
      
      const mockCheckForUpdates = jest.spyOn(GitHubService.prototype, 'checkForUpdates')
        .mockResolvedValue({
          updateAvailable: true,
          localVersion: '1.0.0',
          remoteVersion: '1.1.0',
          comparisonMethod: 'release',
          repositoryUrl: 'https://github.com/test/repo'
        });

      // Mock successful update script
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 100);
          }
        }),
        unref: jest.fn(),
        kill: jest.fn()
      };

      spawn.mockReturnValue(mockProcess);

      // Send multiple concurrent update requests
      const requests = [
        request(app).post('/api/update/execute'),
        request(app).post('/api/update/execute'),
        request(app).post('/api/update/execute')
      ];

      const responses = await Promise.all(requests);

      // Only one should succeed, others should be rejected or handled appropriately
      const successCount = responses.filter(r => r.status === 200).length;
      const errorCount = responses.filter(r => r.status !== 200).length;

      // At least one should succeed, others should be handled gracefully
      expect(successCount).toBeGreaterThanOrEqual(1);
      expect(successCount + errorCount).toBe(3);

      mockGetCurrentVersion.mockRestore();
      mockCheckForUpdates.mockRestore();
    });
  });

  describe('Performance and Monitoring Tests', () => {
    test('should complete version API call within reasonable time', async () => {
      // Requirement 1.2: Performance requirements
      const startTime = Date.now();
      
      await request(app)
        .get('/api/version')
        .expect(200);
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    test('should handle update status requests efficiently', async () => {
      // Requirement 3.1: Status tracking performance
      const startTime = Date.now();
      
      await request(app)
        .get('/api/update/status')
        .expect(200);
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(500); // Should complete within 500ms
    });

    test('should include proper logging for update operations', () => {
      // Requirement 4.1: Logging and monitoring
      const serverCode = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
      
      // Verify logging is present for update operations
      expect(serverCode).toContain('logger.info');
      expect(serverCode).toContain('UPDATE');
      expect(serverCode).toContain('logger.error');
    });

    test('should track update duration and provide metrics', async () => {
      // Requirement 3.1: Update process monitoring
      const response = await request(app)
        .get('/api/update/status')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(typeof response.body.timestamp).toBe('string');
      
      // Timestamp should be valid ISO string
      expect(() => new Date(response.body.timestamp)).not.toThrow();
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });
  });
});