const https = require('https');
const { logger } = require('../utils/logger');

/**
 * GitHub Service
 * 
 * Handles GitHub API interactions for checking updates and releases
 */
class GitHubService {
  constructor() {
    this.apiBaseUrl = 'api.github.com';
    this.repoOwner = 'mattstegner'; // Default repository owner
    this.repoName = 'SpectraBox'; // Default repository name
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes cache
    this.rateLimitRemaining = null;
    this.rateLimitReset = null;
  }

  /**
   * Set repository information
   * @param {string} owner - Repository owner
   * @param {string} name - Repository name
   */
  setRepository(owner, name) {
    this.repoOwner = owner;
    this.repoName = name;
    logger.debug('GitHub repository set', { owner, name });
  }

  /**
   * Get the latest release from GitHub
   * @returns {Promise<object>} Latest release information
   */
  async getLatestRelease() {
    const cacheKey = `latest-release-${this.repoOwner}-${this.repoName}`;
    
    // Check cache first
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      logger.debug('Returning cached latest release data');
      return cached;
    }

    try {
      const path = `/repos/${this.repoOwner}/${this.repoName}/releases/latest`;
      const data = await this.makeGitHubRequest(path);
      
      const releaseInfo = {
        version: data.tag_name,
        name: data.name,
        publishedAt: data.published_at,
        htmlUrl: data.html_url,
        body: data.body,
        prerelease: data.prerelease,
        draft: data.draft
      };

      // Cache the result
      this.setCachedData(cacheKey, releaseInfo);
      
      logger.info('Latest release retrieved from GitHub', { 
        version: releaseInfo.version,
        publishedAt: releaseInfo.publishedAt 
      });
      
      return releaseInfo;
    } catch (error) {
      logger.error('Error getting latest release from GitHub', error);
      throw error;
    }
  }

  /**
   * Get the latest commit from the default branch
   * @returns {Promise<object>} Latest commit information
   */
  async getLatestCommit() {
    const cacheKey = `latest-commit-${this.repoOwner}-${this.repoName}`;
    
    // Check cache first
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      logger.debug('Returning cached latest commit data');
      return cached;
    }

    try {
      const path = `/repos/${this.repoOwner}/${this.repoName}/commits/HEAD`;
      const data = await this.makeGitHubRequest(path);
      
      const commitInfo = {
        sha: data.sha,
        shortSha: data.sha.substring(0, 7),
        message: data.commit.message,
        author: data.commit.author.name,
        date: data.commit.author.date,
        htmlUrl: data.html_url
      };

      // Cache the result
      this.setCachedData(cacheKey, commitInfo);
      
      logger.info('Latest commit retrieved from GitHub', { 
        sha: commitInfo.shortSha,
        date: commitInfo.date 
      });
      
      return commitInfo;
    } catch (error) {
      logger.error('Error getting latest commit from GitHub', error);
      throw error;
    }
  }

  /**
   * Compare local version with remote version
   * @param {string} localVersion - Current local version
   * @returns {Promise<object>} Comparison result with update information
   */
  async checkForUpdates(localVersion) {
    try {
      logger.info('Checking for updates', { localVersion });

      let remoteInfo;
      let updateAvailable = false;
      let comparisonMethod = 'unknown';

      // Try to get latest release first
      try {
        remoteInfo = await this.getLatestRelease();
        comparisonMethod = 'release';
        
        // Compare versions
        updateAvailable = this.compareVersions(localVersion, remoteInfo.version);
      } catch (releaseError) {
        logger.warn('Could not get latest release, trying latest commit', { 
          error: releaseError.message 
        });
        
        // Fallback to latest commit
        try {
          remoteInfo = await this.getLatestCommit();
          comparisonMethod = 'commit';
          
          // For commits, compare SHA if local version looks like a commit hash
          if (this.isCommitHash(localVersion)) {
            updateAvailable = localVersion !== remoteInfo.sha && localVersion !== remoteInfo.shortSha;
          } else {
            // If local version is not a commit hash, assume update is available
            updateAvailable = true;
          }
        } catch (commitError) {
          logger.error('Could not get latest commit either', { 
            error: commitError.message 
          });
          throw commitError;
        }
      }

      const result = {
        updateAvailable,
        localVersion,
        remoteVersion: remoteInfo.version || remoteInfo.shortSha,
        remoteInfo,
        comparisonMethod,
        lastChecked: new Date().toISOString(),
        repositoryUrl: `https://github.com/${this.repoOwner}/${this.repoName}`,
        rateLimitInfo: {
          remaining: this.rateLimitRemaining,
          resetTime: this.rateLimitReset
        }
      };

      logger.info('Update check completed', {
        updateAvailable,
        localVersion,
        remoteVersion: result.remoteVersion,
        method: comparisonMethod
      });

      return result;
    } catch (error) {
      logger.error('Error checking for updates', error);
      
      // Return error result
      return {
        updateAvailable: false,
        localVersion,
        remoteVersion: 'unknown',
        error: error.message,
        lastChecked: new Date().toISOString(),
        repositoryUrl: `https://github.com/${this.repoOwner}/${this.repoName}`,
        rateLimitInfo: {
          remaining: this.rateLimitRemaining,
          resetTime: this.rateLimitReset
        }
      };
    }
  }

  /**
   * Make a request to the GitHub API
   * @param {string} path - API path
   * @returns {Promise<object>} API response data
   */
  async makeGitHubRequest(path) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.apiBaseUrl,
        port: 443,
        path: path,
        method: 'GET',
        headers: {
          'User-Agent': 'SpectraBox-Update-Checker/1.0',
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        // Update rate limit info from headers
        this.rateLimitRemaining = parseInt(res.headers['x-ratelimit-remaining']) || null;
        this.rateLimitReset = res.headers['x-ratelimit-reset'] ? 
          new Date(parseInt(res.headers['x-ratelimit-reset']) * 1000).toISOString() : null;

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const jsonData = JSON.parse(data);
              resolve(jsonData);
            } else if (res.statusCode === 404) {
              reject(new Error(`Repository or resource not found: ${path}`));
            } else if (res.statusCode === 403) {
              reject(new Error(`GitHub API rate limit exceeded or access forbidden`));
            } else {
              reject(new Error(`GitHub API request failed with status ${res.statusCode}: ${data}`));
            }
          } catch (parseError) {
            reject(new Error(`Failed to parse GitHub API response: ${parseError.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`GitHub API request failed: ${error.message}`));
      });

      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('GitHub API request timed out'));
      });

      req.end();
    });
  }

  /**
   * Compare two version strings
   * @param {string} localVersion - Local version
   * @param {string} remoteVersion - Remote version
   * @returns {boolean} True if remote version is newer
   */
  compareVersions(localVersion, remoteVersion) {
    // Handle "unknown" local version
    if (localVersion === 'unknown') {
      return true; // Always consider update available if local version is unknown
    }

    // Clean versions (remove 'v' prefix if present)
    const cleanLocal = localVersion.replace(/^v/, '');
    const cleanRemote = remoteVersion.replace(/^v/, '');

    // If versions are identical, no update needed
    if (cleanLocal === cleanRemote) {
      return false;
    }

    // Try semantic version comparison
    if (this.isSemanticVersion(cleanLocal) && this.isSemanticVersion(cleanRemote)) {
      return this.compareSemanticVersions(cleanLocal, cleanRemote);
    }

    // For non-semantic versions, do string comparison
    // This is a simple fallback - in practice, you might want more sophisticated logic
    return cleanLocal !== cleanRemote;
  }

  /**
   * Check if a string is a semantic version
   * @param {string} version - Version string to check
   * @returns {boolean} True if semantic version
   */
  isSemanticVersion(version) {
    // Support both two-number (1.0) and three-number (1.0.0) semantic versions
    return /^\d+\.\d+(\.\d+)?(-[a-zA-Z0-9.-]+)?$/.test(version);
  }

  /**
   * Compare semantic versions
   * @param {string} local - Local semantic version
   * @param {string} remote - Remote semantic version
   * @returns {boolean} True if remote is newer
   */
  compareSemanticVersions(local, remote) {
    const localParts = local.split('-')[0].split('.').map(Number);
    const remoteParts = remote.split('-')[0].split('.').map(Number);

    for (let i = 0; i < Math.max(localParts.length, remoteParts.length); i++) {
      const localPart = localParts[i] || 0;
      const remotePart = remoteParts[i] || 0;

      if (remotePart > localPart) {
        return true;
      } else if (remotePart < localPart) {
        return false;
      }
    }

    return false; // Versions are equal
  }

  /**
   * Check if a string looks like a commit hash
   * @param {string} str - String to check
   * @returns {boolean} True if looks like commit hash
   */
  isCommitHash(str) {
    return /^[a-f0-9]{7,40}$/.test(str);
  }

  /**
   * Get cached data if still valid
   * @param {string} key - Cache key
   * @returns {object|null} Cached data or null
   */
  getCachedData(key) {
    const cached = this.cache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  /**
   * Set data in cache
   * @param {string} key - Cache key
   * @param {object} data - Data to cache
   */
  setCachedData(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear all cached data
   */
  clearCache() {
    this.cache.clear();
    logger.debug('GitHub service cache cleared');
  }

  /**
   * Get rate limit information
   * @returns {object} Rate limit info
   */
  getRateLimitInfo() {
    return {
      remaining: this.rateLimitRemaining,
      resetTime: this.rateLimitReset
    };
  }
}

module.exports = GitHubService;