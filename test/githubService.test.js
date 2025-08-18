// Mock https module
jest.mock('https', () => ({
  request: jest.fn()
}));

const GitHubService = require('../services/githubService');
const https = require('https');

describe('GitHubService', () => {
  let githubService;

  beforeEach(() => {
    githubService = new GitHubService();
    githubService.clearCache();
    jest.clearAllMocks();
  });

  describe('setRepository', () => {
    test('should set repository owner and name', () => {
      githubService.setRepository('testowner', 'testrepo');
      expect(githubService.repoOwner).toBe('testowner');
      expect(githubService.repoName).toBe('testrepo');
    });
  });

  describe('compareVersions', () => {
    test('should return true for unknown local version', () => {
      const result = githubService.compareVersions('unknown', '1.0');
      expect(result).toBe(true);
    });

    test('should return false for identical versions', () => {
      const result = githubService.compareVersions('1.0', '1.0');
      expect(result).toBe(false);
    });

    test('should handle v prefix in versions', () => {
      const result = githubService.compareVersions('v1.0', '1.0');
      expect(result).toBe(false);
    });

    test('should compare semantic versions correctly', () => {
      expect(githubService.compareVersions('1.0', '1.1')).toBe(true);
      expect(githubService.compareVersions('1.1', '1.0')).toBe(false);
      expect(githubService.compareVersions('1.0', '2.0')).toBe(true);
      expect(githubService.compareVersions('2.0', '1.0')).toBe(false);
      expect(githubService.compareVersions('1.0.0', '1.0.1')).toBe(true);
      expect(githubService.compareVersions('1.0.1', '1.0.0')).toBe(false);
    });
  });

  describe('isSemanticVersion', () => {
    test('should identify semantic versions', () => {
      expect(githubService.isSemanticVersion('1.0')).toBe(true);
      expect(githubService.isSemanticVersion('1.2')).toBe(true);
      expect(githubService.isSemanticVersion('1.0.0')).toBe(true);
      expect(githubService.isSemanticVersion('1.2.3')).toBe(true);
      expect(githubService.isSemanticVersion('1.0-beta')).toBe(true);
      expect(githubService.isSemanticVersion('1.0.0-beta')).toBe(true);
      expect(githubService.isSemanticVersion('1.0.0-alpha.1')).toBe(true);
    });

    test('should reject non-semantic versions', () => {
      expect(githubService.isSemanticVersion('v1.0.0')).toBe(false);
      expect(githubService.isSemanticVersion('abc123')).toBe(false);
      expect(githubService.isSemanticVersion('')).toBe(false);
      expect(githubService.isSemanticVersion('1')).toBe(false);
    });
  });

  describe('isCommitHash', () => {
    test('should identify commit hashes', () => {
      expect(githubService.isCommitHash('a1b2c3d')).toBe(true);
      expect(githubService.isCommitHash('1234567890abcdef')).toBe(true);
      expect(githubService.isCommitHash('abcdef1234567890abcdef1234567890abcdef12')).toBe(true);
    });

    test('should reject non-commit hashes', () => {
      expect(githubService.isCommitHash('1.0.0')).toBe(false);
      expect(githubService.isCommitHash('abc123xyz')).toBe(false);
      expect(githubService.isCommitHash('123')).toBe(false);
      expect(githubService.isCommitHash('')).toBe(false);
    });
  });

  describe('makeGitHubRequest', () => {
    test('should make successful request', async () => {
      const mockResponse = {
        statusCode: 200,
        headers: {
          'x-ratelimit-remaining': '4999',
          'x-ratelimit-reset': '1640995200'
        },
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback('{"test": "data"}');
          } else if (event === 'end') {
            callback();
          }
        })
      };

      const mockRequest = {
        on: jest.fn(),
        setTimeout: jest.fn(),
        end: jest.fn()
      };

      https.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });

      const result = await githubService.makeGitHubRequest('/test/path');
      expect(result).toEqual({ test: 'data' });
      expect(githubService.rateLimitRemaining).toBe(4999);
    });

    test('should handle 404 errors', async () => {
      const mockResponse = {
        statusCode: 404,
        headers: {},
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback('Not Found');
          } else if (event === 'end') {
            callback();
          }
        })
      };

      const mockRequest = {
        on: jest.fn(),
        setTimeout: jest.fn(),
        end: jest.fn()
      };

      https.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });

      await expect(githubService.makeGitHubRequest('/test/path'))
        .rejects.toThrow('Repository or resource not found');
    });

    test('should handle rate limit errors', async () => {
      const mockResponse = {
        statusCode: 403,
        headers: {},
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback('Rate limit exceeded');
          } else if (event === 'end') {
            callback();
          }
        })
      };

      const mockRequest = {
        on: jest.fn(),
        setTimeout: jest.fn(),
        end: jest.fn()
      };

      https.request.mockImplementation((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });

      await expect(githubService.makeGitHubRequest('/test/path'))
        .rejects.toThrow('GitHub API rate limit exceeded');
    });

    test('should handle network errors', async () => {
      const mockRequest = {
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            callback(new Error('Network error'));
          }
        }),
        setTimeout: jest.fn(),
        end: jest.fn()
      };

      https.request.mockImplementation(() => {
        return mockRequest;
      });

      await expect(githubService.makeGitHubRequest('/test/path'))
        .rejects.toThrow('GitHub API request failed: Network error');
    });
  });

  describe('caching', () => {
    test('should cache and retrieve data', () => {
      const testData = { test: 'data' };
      githubService.setCachedData('test-key', testData);
      
      const cached = githubService.getCachedData('test-key');
      expect(cached).toEqual(testData);
    });

    test('should return null for expired cache', () => {
      const testData = { test: 'data' };
      githubService.setCachedData('test-key', testData);
      
      // Mock expired cache
      const cacheEntry = githubService.cache.get('test-key');
      cacheEntry.timestamp = Date.now() - 400000; // Older than cache timeout
      
      const cached = githubService.getCachedData('test-key');
      expect(cached).toBeNull();
    });

    test('should clear all cache', () => {
      githubService.setCachedData('test-key-1', { test: 'data1' });
      githubService.setCachedData('test-key-2', { test: 'data2' });
      
      githubService.clearCache();
      
      expect(githubService.getCachedData('test-key-1')).toBeNull();
      expect(githubService.getCachedData('test-key-2')).toBeNull();
    });
  });

  describe('getRateLimitInfo', () => {
    test('should return rate limit information', () => {
      githubService.rateLimitRemaining = 4999;
      githubService.rateLimitReset = '2024-01-01T00:00:00.000Z';
      
      const info = githubService.getRateLimitInfo();
      expect(info).toEqual({
        remaining: 4999,
        resetTime: '2024-01-01T00:00:00.000Z'
      });
    });
  });
});