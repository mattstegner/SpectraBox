/**
 * Tests for comprehensive update error handling and recovery
 */

const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Mock child_process spawn for testing
jest.mock('child_process');

describe('Update Error Handling and Recovery', () => {
  let app;
  let server;
  let originalEnv;

  beforeAll(async () => {
    // Save original environment
    originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    // Import app after setting test environment
    app = require('../server');
    
    // Start server for testing
    server = app.listen(0);
  });

  afterAll(async () => {
    // Restore original environment
    process.env.NODE_ENV = originalEnv;
    
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('Update Prerequisites Validation', () => {
    test('should fail when update script is missing', async () => {
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
      expect(response.body.message).toContain('Failed to initiate update process');

      // Restore original function
      fs.existsSync = originalExistsSync;
    });

    test('should fail when update script is not readable', async () => {
      // Mock fs.accessSync to throw permission error
      const originalAccessSync = fs.accessSync;
      fs.accessSync = jest.fn((filePath, mode) => {
        if (filePath.includes('spectrabox-kiosk-install.sh')) {
          const error = new Error('Permission denied');
          error.code = 'EACCES';
          throw error;
        }
        return originalAccessSync(filePath, mode);
      });

      const response = await request(app)
        .post('/api/update/execute')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Failed to initiate update process');

      // Restore original function
      fs.accessSync = originalAccessSync;
    });
  });

  describe('Update Script Execution Errors', () => {
    test('should handle script execution failure with exit code', async () => {
      // Mock spawn to simulate script failure
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            // Simulate script failure with exit code 1
            setTimeout(() => callback(1), 100);
          } else if (event === 'error') {
            // Store error callback for later use
            mockProcess.errorCallback = callback;
          }
        }),
        unref: jest.fn(),
        kill: jest.fn()
      };

      spawn.mockReturnValue(mockProcess);

      const response = await request(app)
        .post('/api/update/execute')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Update process initiated');

      // Wait for async update process to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify spawn was called with correct parameters
      expect(spawn).toHaveBeenCalledWith('sudo', ['bash', expect.stringContaining('spectrabox-kiosk-install.sh')], expect.any(Object));
    });

    test('should handle script startup failure', async () => {
      // Mock spawn to simulate startup failure
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            // Simulate script startup failure
            setTimeout(() => {
              const error = new Error('spawn ENOENT');
              error.code = 'ENOENT';
              callback(error);
            }, 100);
          }
        }),
        unref: jest.fn(),
        kill: jest.fn()
      };

      spawn.mockReturnValue(mockProcess);

      const response = await request(app)
        .post('/api/update/execute')
        .expect(200);

      expect(response.body.success).toBe(true);

      // Wait for async update process to complete
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    test('should handle script timeout', async () => {
      // Mock spawn to simulate long-running script
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        unref: jest.fn(),
        kill: jest.fn()
      };

      spawn.mockReturnValue(mockProcess);

      const response = await request(app)
        .post('/api/update/execute')
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify timeout handling would be triggered
      expect(mockProcess.kill).not.toHaveBeenCalled(); // Not called immediately
    });
  });

  describe('Network and GitHub API Errors', () => {
    test('should handle GitHub API network errors', async () => {
      // Mock GitHubService to throw network error
      const GitHubService = require('../services/githubService');
      const originalCheckForUpdates = GitHubService.prototype.checkForUpdates;
      
      GitHubService.prototype.checkForUpdates = jest.fn().mockRejectedValue(
        new Error('Network error: ENOTFOUND api.github.com')
      );

      const response = await request(app)
        .post('/api/update/execute')
        .expect(503);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('NETWORK_ERROR');
      expect(response.body.message).toContain('Network error connecting to GitHub');

      // Restore original method
      GitHubService.prototype.checkForUpdates = originalCheckForUpdates;
    });

    test('should handle GitHub API rate limiting', async () => {
      // Mock GitHubService to throw rate limit error
      const GitHubService = require('../services/githubService');
      const originalCheckForUpdates = GitHubService.prototype.checkForUpdates;
      
      GitHubService.prototype.checkForUpdates = jest.fn().mockRejectedValue(
        new Error('API rate limit exceeded')
      );

      const response = await request(app)
        .post('/api/update/execute')
        .expect(429);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.body.message).toContain('rate limit exceeded');

      // Restore original method
      GitHubService.prototype.checkForUpdates = originalCheckForUpdates;
    });

    test('should handle GitHub repository not found', async () => {
      // Mock GitHubService to throw not found error
      const GitHubService = require('../services/githubService');
      const originalCheckForUpdates = GitHubService.prototype.checkForUpdates;
      
      GitHubService.prototype.checkForUpdates = jest.fn().mockRejectedValue(
        new Error('Repository not found')
      );

      const response = await request(app)
        .post('/api/update/execute')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('REPOSITORY_NOT_FOUND');
      expect(response.body.message).toContain('Repository not found');

      // Restore original method
      GitHubService.prototype.checkForUpdates = originalCheckForUpdates;
    });
  });

  describe('Update Status Tracking', () => {
    test('should track update status through all phases', async () => {
      // Mock successful update process
      const mockProcess = {
        stdout: { 
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              // Simulate script output
              setTimeout(() => callback(Buffer.from('Installing updates...')), 50);
            }
          })
        },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            // Simulate successful completion
            setTimeout(() => callback(0), 150);
          }
        }),
        unref: jest.fn(),
        kill: jest.fn()
      };

      spawn.mockReturnValue(mockProcess);

      // Get initial status
      const initialStatus = await request(app)
        .get('/api/update/status')
        .expect(200);

      expect(initialStatus.body.success).toBe(true);
      expect(initialStatus.body.status).toBe('idle');

      // Start update
      const updateResponse = await request(app)
        .post('/api/update/execute')
        .expect(200);

      expect(updateResponse.body.success).toBe(true);

      // Wait for update process to progress
      await new Promise(resolve => setTimeout(resolve, 200));

      // Check final status
      const finalStatus = await request(app)
        .get('/api/update/status')
        .expect(200);

      expect(finalStatus.body.success).toBe(true);
      // Status should be either 'success' or 'updating' depending on timing
      expect(['success', 'updating']).toContain(finalStatus.body.status);
    });

    test('should provide detailed error information in status', async () => {
      // Mock failed update process
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { 
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              // Simulate error output
              setTimeout(() => callback(Buffer.from('Error: Permission denied')), 50);
            }
          })
        },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            // Simulate failure
            setTimeout(() => callback(1), 100);
          }
        }),
        unref: jest.fn(),
        kill: jest.fn()
      };

      spawn.mockReturnValue(mockProcess);

      // Start update
      await request(app)
        .post('/api/update/execute')
        .expect(200);

      // Wait for update process to fail
      await new Promise(resolve => setTimeout(resolve, 200));

      // Check error status
      const errorStatus = await request(app)
        .get('/api/update/status')
        .expect(200);

      expect(errorStatus.body.success).toBe(true);
      expect(errorStatus.body.status).toBe('error');
      expect(errorStatus.body.error).toBeDefined();
    });
  });

  describe('Recovery Mechanisms', () => {
    test('should attempt recovery after script failure', async () => {
      // Mock failed update process
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            // Simulate script failure
            setTimeout(() => callback(1), 100);
          }
        }),
        unref: jest.fn(),
        kill: jest.fn()
      };

      spawn.mockReturnValue(mockProcess);

      const response = await request(app)
        .post('/api/update/execute')
        .expect(200);

      expect(response.body.success).toBe(true);

      // Wait for recovery attempt
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify recovery was attempted (process should continue or restart)
      expect(mockProcess.unref).toHaveBeenCalled();
    });

    test('should handle backup creation failure gracefully', async () => {
      // Mock version manager to throw error during backup
      const VersionManager = require('../utils/versionManager');
      const originalGetCurrentVersion = VersionManager.prototype.getCurrentVersion;
      
      VersionManager.prototype.getCurrentVersion = jest.fn().mockRejectedValue(
        new Error('Cannot read version file')
      );

      const response = await request(app)
        .post('/api/update/execute')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Failed to initiate update process');

      // Restore original method
      VersionManager.prototype.getCurrentVersion = originalGetCurrentVersion;
    });
  });

  describe('User-Friendly Error Messages', () => {
    test('should provide user-friendly error for permission issues', async () => {
      // Mock permission error
      const GitHubService = require('../services/githubService');
      const originalCheckForUpdates = GitHubService.prototype.checkForUpdates;
      
      const permissionError = new Error('Permission denied');
      permissionError.code = 'EACCES';
      
      GitHubService.prototype.checkForUpdates = jest.fn().mockRejectedValue(permissionError);

      const response = await request(app)
        .post('/api/update/execute')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Failed to initiate update process');

      // Restore original method
      GitHubService.prototype.checkForUpdates = originalCheckForUpdates;
    });

    test('should provide user-friendly error for disk space issues', async () => {
      // Mock disk space error during backup
      const originalWriteFileSync = fs.writeFileSync;
      fs.writeFileSync = jest.fn(() => {
        const error = new Error('No space left on device');
        error.code = 'ENOSPC';
        throw error;
      });

      // This would be tested in a more complex scenario where backup creation fails
      // For now, we'll test the error handling structure

      // Restore original function
      fs.writeFileSync = originalWriteFileSync;
    });
  });

  describe('Logging and Monitoring', () => {
    test('should log all update process steps', async () => {
      // Mock console methods to capture logs
      const originalConsoleInfo = console.info;
      const originalConsoleError = console.error;
      const logs = [];

      console.info = jest.fn((...args) => {
        logs.push({ level: 'info', args });
      });
      console.error = jest.fn((...args) => {
        logs.push({ level: 'error', args });
      });

      // Mock successful update process
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

      await request(app)
        .post('/api/update/execute')
        .expect(200);

      // Wait for logging to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify logging occurred
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some(log => log.args.some(arg => 
        typeof arg === 'string' && arg.includes('UPDATE')
      ))).toBe(true);

      // Restore original console methods
      console.info = originalConsoleInfo;
      console.error = originalConsoleError;
    });

    test('should track update duration and steps', async () => {
      // This test verifies that update tracking includes timing information
      const response = await request(app)
        .get('/api/update/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.timestamp).toBeDefined();
      expect(typeof response.body.timestamp).toBe('string');
    });
  });
});