const request = require('supertest');
const app = require('../server');
const GitHubService = require('../services/githubService');
const VersionManager = require('../utils/versionManager');

describe('POST /api/update/execute', () => {
  let server;
  let originalCheckForUpdates;
  let originalGetCurrentVersion;
  let originalNodeEnv;

  beforeAll(() => {
    server = app.listen(0);
    // Set development mode to get error details in responses
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
  });

  afterAll((done) => {
    // Restore original NODE_ENV
    process.env.NODE_ENV = originalNodeEnv;
    server.close(done);
  });

  beforeEach(() => {
    // Mock the GitHub service and version manager
    originalCheckForUpdates = GitHubService.prototype.checkForUpdates;
    originalGetCurrentVersion = VersionManager.prototype.getCurrentVersion;
  });

  afterEach(() => {
    // Restore original methods
    GitHubService.prototype.checkForUpdates = originalCheckForUpdates;
    VersionManager.prototype.getCurrentVersion = originalGetCurrentVersion;
  });

  test('should reject update when no update is available', async () => {
    // Mock version manager to return current version
    VersionManager.prototype.getCurrentVersion = jest.fn().mockResolvedValue('1.0.0');
    
    // Mock GitHub service to return no update available
    GitHubService.prototype.checkForUpdates = jest.fn().mockResolvedValue({
      updateAvailable: false,
      localVersion: '1.0.0',
      remoteVersion: '1.0.0',
      comparisonMethod: 'release',
      repositoryUrl: 'https://github.com/test/repo'
    });

    const response = await request(app)
      .post('/api/update/execute')
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      error: 'NO_UPDATE_AVAILABLE',
      message: 'No update is available. Current version is up to date.',
      currentVersion: '1.0.0',
      latestVersion: '1.0.0'
    });
  });

  test('should accept update when update is available', async () => {
    // Mock version manager to return current version
    VersionManager.prototype.getCurrentVersion = jest.fn().mockResolvedValue('1.0.0');
    
    // Mock GitHub service to return update available
    GitHubService.prototype.checkForUpdates = jest.fn().mockResolvedValue({
      updateAvailable: true,
      localVersion: '1.0.0',
      remoteVersion: '1.1.0',
      comparisonMethod: 'release',
      repositoryUrl: 'https://github.com/test/repo'
    });

    const response = await request(app)
      .post('/api/update/execute')
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      message: 'Update process initiated. Server will restart automatically.',
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateInfo: {
        comparisonMethod: 'release',
        repositoryUrl: 'https://github.com/test/repo'
      }
    });
  });

  test('should handle GitHub API errors gracefully', async () => {
    // Mock version manager to return current version
    VersionManager.prototype.getCurrentVersion = jest.fn().mockResolvedValue('1.0.0');
    
    // Mock GitHub service to throw network error
    GitHubService.prototype.checkForUpdates = jest.fn().mockRejectedValue(
      new Error('GitHub API request failed: network error')
    );

    const response = await request(app)
      .post('/api/update/execute')
      .expect(503);

    expect(response.body).toEqual({
      success: false,
      error: 'NETWORK_ERROR',
      message: 'Network error connecting to GitHub. Please check your internet connection.',
      details: 'GitHub API request failed: network error'
    });
  });

  test('should handle rate limit errors', async () => {
    // Mock version manager to return current version
    VersionManager.prototype.getCurrentVersion = jest.fn().mockResolvedValue('1.0.0');
    
    // Mock GitHub service to throw rate limit error
    GitHubService.prototype.checkForUpdates = jest.fn().mockRejectedValue(
      new Error('GitHub API rate limit exceeded')
    );

    const response = await request(app)
      .post('/api/update/execute')
      .expect(429);

    expect(response.body).toEqual({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'GitHub API rate limit exceeded. Please try again later.',
      details: 'GitHub API rate limit exceeded'
    });
  });

  test('should handle version manager errors', async () => {
    // Mock version manager to throw error
    VersionManager.prototype.getCurrentVersion = jest.fn().mockRejectedValue(
      new Error('Version file not found')
    );

    const response = await request(app)
      .post('/api/update/execute')
      .expect(500);

    expect(response.body).toEqual({
      success: false,
      error: 'UPDATE_INITIATION_ERROR',
      message: 'Failed to initiate update process',
      details: 'Version file not found'
    });
  });
});