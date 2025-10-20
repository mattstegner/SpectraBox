const https = require('https');
const { logger } = require('../utils/logger');
const ConfigManager = require('../utils/configManager');

/**
 * GitHub Service
 * 
 * Handles GitHub API interactions for checking updates and releases
 */
class GitHubService {
  constructor() {
    this.configManager = new ConfigManager();
    this.apiBaseUrl = 'api.github.com';
    this.repoOwner = 'mattstegner'; // Default repository owner
    this.repoName = 'SpectraBox'; // Default repository name
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes cache
    this.rateLimitRemaining = null;
    this.rateLimitReset = null;
    this.configLoaded = false;
  }

  /**
   * Load configuration and update service settings
   */
  async loadConfiguration() {
    try {
      const config = await this.configManager.loadConfig();
      
      // Update GitHub settings from configuration
      if (config.github) {
        this.repoOwner = config.github.owner || this.repoOwner;
        this.repoName = config.github.repository || this.repoName;
        
        // Extract hostname from API URL
        if (config.github.apiUrl) {
          try {
            const url = new URL(config.github.apiUrl);
            this.apiBaseUrl = url.hostname;
          } catch (error) {
            logger.warn('Invalid GitHub API URL in configuration, using default', { 
              url: config.github.apiUrl 
            });
          }
        }
        
        this.cacheTimeout = config.github.rateLimitCacheTimeout || this.cacheTimeout;
      }
      
      this.configLoaded = true;
      logger.debug('GitHub service configuration loaded', {
        owner: this.repoOwner,
        repository: this.repoName,
        apiUrl: this.apiBaseUrl,
        cacheTimeout: this.cacheTimeout
      });
    } catch (error) {
      logger.error('Error loading GitHub service configuration', { error: error.message });
      // Continue with defaults
      this.configLoaded = true;
    }
  }

  /**
   * Ensure configuration is loaded before API calls
   */
  async ensureConfigLoaded() {
    if (!this.configLoaded) {
      await this.loadConfiguration();
    }
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
    await this.ensureConfigLoaded();
    
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
    await this.ensureConfigLoaded();
    
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
      await this.ensureConfigLoaded();
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
        logger.warn('Could not get latest release', { 
          error: releaseError.message 
        });
        
        // Only fallback to commits if local version is also a commit hash
        if (this.isCommitHash(localVersion)) {
          logger.info('Local version is a commit hash, checking latest commit');
          try {
            remoteInfo = await this.getLatestCommit();
            comparisonMethod = 'commit';
            
            // Compare SHA for commit-based versions
            updateAvailable = localVersion !== remoteInfo.sha && localVersion !== remoteInfo.shortSha;
          } catch (commitError) {
            logger.error('Could not get latest commit either', { 
              error: commitError.message 
            });
            throw commitError;
          }
        } else {
          // Local version is a semantic version, but no releases exist on GitHub
          // Don't report an update available - user should create a release
          logger.info('No GitHub releases found and local version is semantic - no update available');
          
          // Return a result indicating no releases are available
          return {
            updateAvailable: false,
            localVersion,
            remoteVersion: 'no-releases',
            remoteInfo: null,
            comparisonMethod: 'none',
            lastChecked: new Date().toISOString(),
            repositoryUrl: `https://github.com/${this.repoOwner}/${this.repoName}`,
            rateLimitInfo: {
              remaining: this.rateLimitRemaining,
              resetTime: this.rateLimitReset
            },
            message: 'No GitHub releases found. Update checks require tagged releases.'
          };
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
   * Make a request to the GitHub API with enhanced security validation
   * @param {string} path - API path
   * @returns {Promise<object>} API response data
   */
  async makeGitHubRequest(path) {
    return new Promise((resolve, reject) => {
      // Security: Validate API path
      if (!path || typeof path !== 'string') {
        reject(new Error('Invalid API path provided'));
        return;
      }
      
      // Security: Ensure path starts with / and doesn't contain dangerous characters
      if (!path.startsWith('/') || path.includes('..') || path.includes('\\')) {
        reject(new Error('Invalid API path format'));
        return;
      }
      
      // Security: Validate path length
      if (path.length > 500) {
        reject(new Error('API path too long'));
        return;
      }
      
      // Security: Validate hostname
      if (!this.apiBaseUrl || this.apiBaseUrl !== 'api.github.com') {
        reject(new Error('Invalid API hostname'));
        return;
      }

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
        let dataSize = 0;
        const maxResponseSize = 1024 * 1024; // 1MB max response size

        // Update rate limit info from headers
        this.rateLimitRemaining = parseInt(res.headers['x-ratelimit-remaining']) || null;
        this.rateLimitReset = res.headers['x-ratelimit-reset'] ? 
          new Date(parseInt(res.headers['x-ratelimit-reset']) * 1000).toISOString() : null;

        res.on('data', (chunk) => {
          dataSize += chunk.length;
          
          // Security: Prevent excessive response size
          if (dataSize > maxResponseSize) {
            req.destroy();
            reject(new Error('GitHub API response too large'));
            return;
          }
          
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              // Security: Validate response size before parsing
              if (data.length === 0) {
                reject(new Error('Empty response from GitHub API'));
                return;
              }
              
              const jsonData = JSON.parse(data);
              
              // Security: Basic validation of response structure
              if (!jsonData || typeof jsonData !== 'object') {
                reject(new Error('Invalid response format from GitHub API'));
                return;
              }
              
              // Security: Sanitize response data
              const sanitizedData = this.sanitizeGitHubResponse(jsonData);
              resolve(sanitizedData);
            } else if (res.statusCode === 404) {
              reject(new Error(`Repository or resource not found: ${path}`));
            } else if (res.statusCode === 403) {
              reject(new Error(`GitHub API rate limit exceeded or access forbidden`));
            } else {
              reject(new Error(`GitHub API request failed with status ${res.statusCode}: ${data.substring(0, 200)}`));
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
   * Sanitize GitHub API response data
   * @param {object} data - Raw response data
   * @returns {object} Sanitized response data
   */
  sanitizeGitHubResponse(data) {
    if (!data || typeof data !== 'object') {
      return {};
    }
    
    const sanitized = {};
    
    // For release data
    if (data.tag_name) {
      sanitized.tag_name = this.sanitizeString(data.tag_name, 50);
      sanitized.name = this.sanitizeString(data.name, 100);
      sanitized.published_at = this.sanitizeString(data.published_at, 30);
      sanitized.html_url = this.sanitizeUrl(data.html_url);
      sanitized.body = this.sanitizeString(data.body, 5000);
      sanitized.prerelease = Boolean(data.prerelease);
      sanitized.draft = Boolean(data.draft);
    }
    
    // For commit data
    if (data.sha) {
      sanitized.sha = this.sanitizeString(data.sha, 40);
      if (data.commit) {
        sanitized.commit = {
          message: this.sanitizeString(data.commit.message, 500),
          author: {
            name: this.sanitizeString(data.commit.author?.name, 100),
            date: this.sanitizeString(data.commit.author?.date, 30)
          }
        };
      }
      sanitized.html_url = this.sanitizeUrl(data.html_url);
    }
    
    return sanitized;
  }

  /**
   * Sanitize string values
   * @param {any} value - Value to sanitize
   * @param {number} maxLength - Maximum allowed length
   * @returns {string} Sanitized string
   */
  sanitizeString(value, maxLength = 100) {
    if (typeof value !== 'string') {
      return '';
    }
    
    // Remove dangerous characters
    const sanitized = value
      .replace(/[<>\"'&;|`$(){}[\]\\]/g, '')
      .replace(/\x00-\x1f\x7f-\x9f/g, '') // Remove control characters
      .trim();
    
    return sanitized.substring(0, maxLength);
  }

  /**
   * Sanitize URL values
   * @param {any} value - URL to sanitize
   * @returns {string} Sanitized URL or empty string
   */
  sanitizeUrl(value) {
    if (typeof value !== 'string') {
      return '';
    }
    
    try {
      const url = new URL(value);
      
      // Only allow HTTPS GitHub URLs
      if (url.protocol !== 'https:' || !url.hostname.endsWith('github.com')) {
        return '';
      }
      
      return url.toString();
    } catch (error) {
      return '';
    }
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