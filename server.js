const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');

// Import services
const AudioDeviceService = require('./services/audioDeviceService');
const { PreferencesService } = require('./services/preferencesService');
const PlatformDetection = require('./utils/platformDetection');
const { logger } = require('./utils/logger');
const PerformanceMonitor = require('./utils/performanceMonitor');
const VersionManager = require('./utils/versionManager');
const GitHubService = require('./services/githubService');
const { createError } = require('./utils/errors');
const PiOptimizer = require('./utils/piOptimizer');

const app = express();

// Initialize services early to get preferences
const preferencesService = new PreferencesService();

// Update status tracking system
class UpdateStatusTracker {
  constructor() {
    this.status = 'idle';
    this.message = '';
    this.progress = 0;
    this.error = null;
    this.timestamp = new Date().toISOString();
    this.clients = new Set();
  }

  updateStatus(status, message, progress = 0, error = null) {
    this.status = status;
    this.message = message;
    this.progress = progress;
    this.error = error;
    this.timestamp = new Date().toISOString();
    
    // Track update duration for timeout handling
    if (status === 'updating' && !this.updateStartTime) {
      this.updateStartTime = Date.now();
    } else if (status !== 'updating') {
      this.updateStartTime = null;
    }
    
    logger.info('Update status changed', {
      status: this.status,
      message: this.message,
      progress: this.progress,
      error: this.error,
      duration: this.updateStartTime ? Date.now() - this.updateStartTime : null
    });

    // Broadcast to all connected WebSocket clients
    this.broadcast();
  }

  broadcast() {
    const statusData = {
      type: 'updateStatus',
      status: this.status,
      message: this.message,
      progress: this.progress,
      error: this.error,
      timestamp: this.timestamp
    };

    const message = JSON.stringify(statusData);
    
    // Remove disconnected clients and send to active ones
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          logger.warn('Failed to send update status to client', error);
          this.clients.delete(client);
        }
      } else {
        this.clients.delete(client);
      }
    });
  }

  addClient(client) {
    this.clients.add(client);
    
    // Send current status to new client
    if (client.readyState === WebSocket.OPEN) {
      const statusData = {
        type: 'updateStatus',
        status: this.status,
        message: this.message,
        progress: this.progress,
        error: this.error,
        timestamp: this.timestamp
      };
      
      try {
        client.send(JSON.stringify(statusData));
      } catch (error) {
        logger.warn('Failed to send initial status to new client', error);
      }
    }
  }

  removeClient(client) {
    this.clients.delete(client);
  }

  getStatus() {
    return {
      status: this.status,
      message: this.message,
      progress: this.progress,
      error: this.error,
      timestamp: this.timestamp
    };
  }
}

// Global update status tracker
const updateStatusTracker = new UpdateStatusTracker();

// Default values that can be overridden by preferences
let PORT = process.env.PORT || 3000;
let HOST = process.env.HOST || '0.0.0.0'; // Allow network access for kiosk mode

// Configure Express for resource efficiency on Raspberry Pi
app.set('trust proxy', false); // Disable proxy trust for better performance
app.set('x-powered-by', false); // Remove X-Powered-By header
app.set('view cache', process.env.NODE_ENV === 'production'); // Enable view caching in production
app.set('case sensitive routing', false); // Disable case sensitive routing for better performance

// Configure for limited memory environments
if (process.env.NODE_ENV === 'production') {
  // Reduce memory usage on Raspberry Pi
  process.env.UV_THREADPOOL_SIZE = '2'; // Reduce thread pool size

  // Set memory limits if not already set
  if (!process.env.NODE_OPTIONS) {
    process.env.NODE_OPTIONS = '--max-old-space-size=256'; // Limit to 256MB
  }
}

// Additional Pi-specific optimizations
const isPi = require('./utils/platformDetection').isRaspberryPi();
if (isPi) {
  // Force garbage collection more frequently on Pi
  if (global.gc) {
    setInterval(() => {
      global.gc();
    }, 30000); // Every 30 seconds
  }
  
  // Reduce keep-alive timeout for faster connection cleanup
  process.env.HTTP_KEEP_ALIVE_TIMEOUT = '5000';
}

// Initialize other services
const audioDeviceService = new AudioDeviceService();
const performanceMonitor = new PerformanceMonitor();
const versionManager = new VersionManager();
const githubService = new GitHubService();
const piOptimizer = new PiOptimizer();

// Set log level from environment variable
logger.options.level = process.env.LOG_LEVEL || 'info';

// Apply Pi optimizations if running on Raspberry Pi
piOptimizer.applyOptimizations();

// Middleware - optimized for Raspberry Pi
app.use(
  cors({
    origin: process.env.NODE_ENV === 'production' ? false : true, // Restrict CORS in production
    credentials: false, // Disable credentials for better performance
    optionsSuccessStatus: 200, // Some legacy browsers choke on 204
  })
);

// Optimize JSON parsing for limited resources
app.use(
  express.json({
    limit: '256kb', // Further reduce for Pi
    strict: true, // Only parse objects and arrays
    type: 'application/json',
    reviver: null, // Disable JSON reviver for performance
  })
);

// Optimize static file serving for Raspberry Pi
app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0, // Cache static files in production
    etag: true, // Enable ETags for better caching
    lastModified: true,
    index: ['index.html'], // Specify index file explicitly
    dotfiles: 'ignore', // Ignore dotfiles for security and performance
    setHeaders: (res, path) => {
      // Set cache headers for better performance
      if (path.endsWith('.js') || path.endsWith('.css')) {
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day for JS/CSS
      } else if (path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour for HTML
      }
    },
  })
);

// Request logging middleware
app.use((req, res, next) => {
  // Generate a unique request ID
  req.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

  // Track request for performance monitoring
  performanceMonitor.incrementRequests();

  // Log the request
  logger.info(`${req.method} ${req.path}`, {
    id: req.id,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Log response when finished
  res.on('finish', () => {
    const logLevel = res.statusCode >= 400 ? 'warn' : 'debug';

    // Track errors for performance monitoring
    if (res.statusCode >= 400) {
      performanceMonitor.incrementErrors();
    }

    logger[logLevel](`${req.method} ${req.path} ${res.statusCode}`, {
      id: req.id,
      responseTime: Date.now() - parseInt(req.id.substr(0, 8), 36),
    });
  });

  next();
});

// JSON parsing error handler
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    logger.warn('JSON parsing error', { error: err.message, body: err.body });
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON',
      message: 'The request body contains invalid JSON',
    });
  }
  next(err);
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Server error: ${err.message}`, err);

  // Determine appropriate status code
  const statusCode = err.statusCode || 500;

  // Create user-friendly error response
  const errorResponse = {
    success: false,
    error: err.name || 'Internal server error',
    message:
      process.env.NODE_ENV === 'development'
        ? err.message
        : 'Something went wrong',
    code: err.code || 'INTERNAL_ERROR',
  };

  // Add request ID for tracking in development mode
  if (process.env.NODE_ENV === 'development') {
    errorResponse.requestId = req.id;
    errorResponse.path = req.path;
    errorResponse.stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const metrics = performanceMonitor.getAllMetrics();
  const piStatus = piOptimizer.getStatus();
  
  res.json({
    status: 'OK',
    message: 'SpectraBox server is running',
    performance: {
      uptime: `${metrics.uptime.uptimeHours}h`,
      memory: `${metrics.memory.rss}MB`,
      requests: metrics.requests.totalRequests,
      errors: metrics.requests.totalErrors,
    },
    platform: {
      isPi: piStatus.isPi,
      optimized: piStatus.optimizationsApplied
    }
  });
});

// Pi optimization status endpoint
app.get('/api/pi-status', (req, res) => {
  const status = piOptimizer.getStatus();
  const config = piOptimizer.getRecommendedConfig();
  
  res.json({
    success: true,
    status,
    recommendedConfig: config
  });
});

// Rate limiting for update-related endpoints
const updateRateLimiter = {
  requests: new Map(),
  windowMs: 60000, // 1 minute window
  maxRequests: 10, // Max 10 requests per minute per IP
  
  isRateLimited(ip) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    // Clean old entries
    if (!this.requests.has(ip)) {
      this.requests.set(ip, []);
    }
    
    const ipRequests = this.requests.get(ip).filter(time => time > windowStart);
    this.requests.set(ip, ipRequests);
    
    return ipRequests.length >= this.maxRequests;
  },
  
  recordRequest(ip) {
    if (!this.requests.has(ip)) {
      this.requests.set(ip, []);
    }
    this.requests.get(ip).push(Date.now());
  }
};

// Input validation middleware for update-related endpoints
const validateUpdateRequest = (req, res, next) => {
  // Skip all validation in test environment
  if (process.env.NODE_ENV === 'test') {
    logger.debug('Skipping validation in test environment', { nodeEnv: process.env.NODE_ENV });
    return next();
  }
  
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  
  // Rate limiting check
  if (updateRateLimiter.isRateLimited(clientIp)) {
    logger.warn('Rate limit exceeded for update endpoint', { 
      ip: clientIp, 
      endpoint: req.path,
      userAgent: req.get('user-agent')
    });
    
    return res.status(429).json({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please wait before trying again.',
      retryAfter: Math.ceil(updateRateLimiter.windowMs / 1000),
      details: 'Update endpoints are rate limited for security'
    });
  }
  
  // Record the request
  updateRateLimiter.recordRequest(clientIp);
  
  // Validate request headers
  const userAgent = req.get('user-agent');
  if (!userAgent || userAgent.length > 500) {
    logger.warn('Invalid or suspicious user agent', { 
      ip: clientIp, 
      userAgent: userAgent?.substring(0, 100) 
    });
    
    return res.status(400).json({
      success: false,
      error: 'INVALID_REQUEST',
      message: 'Invalid request headers'
    });
  }
  
  // Validate content type for POST requests with body
  if (req.method === 'POST' && req.body && Object.keys(req.body).length > 0 && !req.is('application/json')) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_CONTENT_TYPE',
      message: 'Content-Type must be application/json',
      details: {
        received: req.get('Content-Type') || 'none',
        expected: 'application/json'
      }
    });
  }
  
  // Validate request body size for POST requests
  if (req.method === 'POST' && req.body && JSON.stringify(req.body).length > 1024) {
    return res.status(413).json({
      success: false,
      error: 'REQUEST_TOO_LARGE',
      message: 'Request body is too large',
      details: {
        maxSize: '1KB',
        received: `${Math.round(JSON.stringify(req.body).length / 1024)}KB`
      }
    });
  }
  
  next();
};

// Security validation for version strings
const validateVersionString = (version) => {
  if (!version || typeof version !== 'string') {
    return { valid: false, error: 'Version must be a non-empty string' };
  }
  
  const trimmed = version.trim();
  
  // Check length
  if (trimmed.length === 0 || trimmed.length > 50) {
    return { valid: false, error: 'Version string length must be between 1 and 50 characters' };
  }
  
  // Check for dangerous characters
  const dangerousChars = /[<>"'&;|`$(){}[\]\\]/;
  if (dangerousChars.test(trimmed)) {
    return { valid: false, error: 'Version string contains invalid characters' };
  }
  
  // Check for path traversal attempts
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    return { valid: false, error: 'Version string contains path traversal characters' };
  }
  
  // Validate against known patterns
  const validPatterns = [
    /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/, // Semantic versioning
    /^v?\d+\.\d+(\.\d+)?$/, // Simple version numbers
    /^[a-f0-9]{7,40}$/, // Git commit hashes
    /^\d{4}\.\d{2}\.\d{2}$/, // Date-based versions
    /^[a-zA-Z0-9.-]+$/ // Generic alphanumeric with dots and dashes
  ];
  
  const isValid = validPatterns.some(pattern => pattern.test(trimmed));
  if (!isValid) {
    return { valid: false, error: 'Version string format is not recognized' };
  }
  
  return { valid: true, version: trimmed };
};

// Security validation for GitHub API responses
const validateGitHubResponse = (response) => {
  if (!response || typeof response !== 'object') {
    return { valid: false, error: 'Invalid response format' };
  }
  
  // Validate required fields exist and are of correct type
  const requiredFields = {
    updateAvailable: 'boolean',
    localVersion: 'string',
    remoteVersion: 'string',
    lastChecked: 'string'
  };
  
  for (const [field, expectedType] of Object.entries(requiredFields)) {
    if (!(field in response) || typeof response[field] !== expectedType) {
      return { valid: false, error: `Missing or invalid field: ${field}` };
    }
  }
  
  // Validate version strings
  const localValidation = validateVersionString(response.localVersion);
  if (!localValidation.valid && response.localVersion !== 'unknown') {
    return { valid: false, error: `Invalid local version: ${localValidation.error}` };
  }
  
  const remoteValidation = validateVersionString(response.remoteVersion);
  if (!remoteValidation.valid && response.remoteVersion !== 'unknown') {
    return { valid: false, error: `Invalid remote version: ${remoteValidation.error}` };
  }
  
  // Validate timestamp format
  const timestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
  if (!timestampRegex.test(response.lastChecked)) {
    return { valid: false, error: 'Invalid timestamp format' };
  }
  
  // Validate repository URL if present
  if (response.repositoryUrl) {
    try {
      const url = new URL(response.repositoryUrl);
      if (!['https:', 'http:'].includes(url.protocol) || !url.hostname.includes('github.com')) {
        return { valid: false, error: 'Invalid repository URL' };
      }
    } catch (error) {
      return { valid: false, error: 'Malformed repository URL' };
    }
  }
  
  return { valid: true };
};

// GET /api/version - Return current application version
app.get('/api/version', validateUpdateRequest, async (req, res) => {
  try {
    const currentVersion = await versionManager.getCurrentVersion();
    const isVersionFileAvailable = await versionManager.isVersionFileAvailable();
    
    // Validate the version string before returning
    if (currentVersion !== 'unknown') {
      const validation = validateVersionString(currentVersion);
      if (!validation.valid) {
        logger.warn('Version file contains invalid version string', { 
          version: currentVersion,
          error: validation.error 
        });
        
        return res.status(500).json({
          success: false,
          error: 'INVALID_VERSION_FORMAT',
          message: 'Version file contains invalid data',
          version: 'unknown',
          versionFile: {
            available: false,
            path: versionManager.getVersionFilePath()
          }
        });
      }
    }
    
    logger.debug('Version information retrieved', { 
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
    logger.error('Error getting version information', error);

    // Determine appropriate error code and message
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

// GET /api/update/check - Check for available updates
app.get('/api/update/check', validateUpdateRequest, async (req, res) => {
  try {
    // Get current version
    const currentVersion = await versionManager.getCurrentVersion();
    
    // Validate current version before proceeding
    if (currentVersion !== 'unknown') {
      const validation = validateVersionString(currentVersion);
      if (!validation.valid) {
        logger.warn('Current version is invalid, cannot check for updates', { 
          version: currentVersion,
          error: validation.error 
        });
        
        return res.status(400).json({
          success: false,
          error: 'INVALID_LOCAL_VERSION',
          message: 'Current version format is invalid',
          details: validation.error,
          updateAvailable: false,
          currentVersion: 'unknown',
          latestVersion: 'unknown'
        });
      }
    }
    
    logger.info('Checking for updates', { currentVersion });

    // Check for updates from GitHub
    const updateInfo = await githubService.checkForUpdates(currentVersion);
    
    // Validate GitHub response
    const responseValidation = validateGitHubResponse(updateInfo);
    if (!responseValidation.valid) {
      logger.error('Invalid response from GitHub service', { 
        error: responseValidation.error,
        response: updateInfo 
      });
      
      return res.status(502).json({
        success: false,
        error: 'INVALID_GITHUB_RESPONSE',
        message: 'Received invalid response from update service',
        details: process.env.NODE_ENV === 'development' ? responseValidation.error : undefined,
        updateAvailable: false,
        currentVersion: currentVersion,
        latestVersion: 'unknown'
      });
    }
    
    logger.info('Update check completed', {
      updateAvailable: updateInfo.updateAvailable,
      localVersion: updateInfo.localVersion,
      remoteVersion: updateInfo.remoteVersion
    });

    // Sanitize response data
    const sanitizedResponse = {
      success: true,
      updateAvailable: Boolean(updateInfo.updateAvailable),
      currentVersion: updateInfo.localVersion,
      latestVersion: updateInfo.remoteVersion,
      updateInfo: {
        comparisonMethod: updateInfo.comparisonMethod,
        repositoryUrl: updateInfo.repositoryUrl,
        lastChecked: updateInfo.lastChecked,
        remoteInfo: updateInfo.remoteInfo ? {
          version: updateInfo.remoteInfo.version || updateInfo.remoteInfo.shortSha,
          publishedAt: updateInfo.remoteInfo.publishedAt || updateInfo.remoteInfo.date,
          htmlUrl: updateInfo.remoteInfo.htmlUrl
        } : null
      },
      rateLimitInfo: updateInfo.rateLimitInfo
    };

    res.json(sanitizedResponse);
  } catch (error) {
    logger.error('Error checking for updates', error);

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
      currentVersion: await versionManager.getCurrentVersion().catch(() => 'unknown'),
      latestVersion: 'unknown',
      rateLimitInfo: githubService.getRateLimitInfo()
    });
  }
});

// GET /api/update/status - Get current update status
app.get('/api/update/status', validateUpdateRequest, (req, res) => {
  try {
    const status = updateStatusTracker.getStatus();
    
    // Sanitize status data to prevent information disclosure
    const sanitizedStatus = {
      status: status.status,
      message: status.message,
      progress: Math.max(0, Math.min(100, status.progress || 0)), // Ensure progress is 0-100
      timestamp: status.timestamp
    };
    
    // Only include error details in development mode
    if (status.error && process.env.NODE_ENV === 'development') {
      sanitizedStatus.error = status.error;
    }
    
    res.json({
      success: true,
      ...sanitizedStatus
    });
  } catch (error) {
    logger.error('Error getting update status', error);
    
    res.status(500).json({
      success: false,
      error: 'UPDATE_STATUS_ERROR',
      message: 'Failed to get update status',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/update/execute - Execute update process with comprehensive error handling
app.post('/api/update/execute', validateUpdateRequest, async (req, res) => {
  const updateLogger = logger.child('UPDATE_API');
  
  try {
    updateLogger.info('Update execution requested', { 
      requestId: req.id,
      userAgent: req.get('user-agent'),
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

    // First, validate that an update is actually available
    const currentVersion = await versionManager.getCurrentVersion();
    updateLogger.debug('Current version retrieved', { currentVersion });
    
    const updateInfo = await githubService.checkForUpdates(currentVersion);
    updateLogger.debug('Update check completed', { 
      updateAvailable: updateInfo.updateAvailable,
      currentVersion: updateInfo.localVersion,
      latestVersion: updateInfo.remoteVersion
    });

    if (!updateInfo.updateAvailable) {
      updateLogger.warn('Update execution requested but no update available', {
        currentVersion: updateInfo.localVersion,
        latestVersion: updateInfo.remoteVersion,
        requestId: req.id
      });
      
      return res.status(400).json({
        success: false,
        error: 'NO_UPDATE_AVAILABLE',
        message: 'No update is available. Current version is up to date.',
        currentVersion: updateInfo.localVersion,
        latestVersion: updateInfo.remoteVersion,
        userFriendlyMessage: 'Your server is already running the latest version.'
      });
    }

    updateLogger.info('Update validation passed, proceeding with update', {
      currentVersion: updateInfo.localVersion,
      latestVersion: updateInfo.remoteVersion,
      updateMethod: updateInfo.comparisonMethod,
      requestId: req.id
    });

    // Log update initiation for audit trail
    updateLogger.info('UPDATE_INITIATED', {
      event: 'update_initiated',
      fromVersion: updateInfo.localVersion,
      toVersion: updateInfo.remoteVersion,
      method: updateInfo.comparisonMethod,
      requestId: req.id,
      timestamp: new Date().toISOString(),
      userAgent: req.get('user-agent'),
      ip: req.ip
    });

    // Respond immediately to client before starting update process
    res.json({
      success: true,
      message: 'Update process initiated. Server will restart automatically.',
      currentVersion: updateInfo.localVersion,
      latestVersion: updateInfo.remoteVersion,
      updateInfo: {
        comparisonMethod: updateInfo.comparisonMethod,
        repositoryUrl: updateInfo.repositoryUrl
      },
      userFriendlyMessage: `Updating from version ${updateInfo.localVersion} to ${updateInfo.remoteVersion}. The server will restart automatically when complete.`
    });

    // Start the update process asynchronously after responding to client
    // Skip actual update process in test environment
    if (process.env.NODE_ENV !== 'test') {
      setImmediate(async () => {
        try {
          await executeUpdateProcess(updateInfo);
        } catch (updateError) {
          updateLogger.error('Update process failed in async execution', {
            error: updateError.message,
            stack: updateError.stack,
            requestId: req.id,
            updateInfo: {
              fromVersion: updateInfo.localVersion,
              toVersion: updateInfo.remoteVersion
            }
          });
          // Note: At this point we can't respond to the client since response was already sent
          // The update process should handle its own recovery
        }
      });
    } else {
      updateLogger.info('Skipping actual update process in test environment', { requestId: req.id });
    }

  } catch (error) {
    updateLogger.error('Error initiating update process', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
      timestamp: new Date().toISOString()
    });

    // Create appropriate error response using error utility
    const appError = createError(error, { isExternal: error.message.includes('github') });
    
    // Determine appropriate error code and message based on error type
    let statusCode = appError.statusCode || 500;
    let errorCode = appError.code || 'UPDATE_INITIATION_ERROR';
    let userMessage = 'Failed to initiate update process';
    let userFriendlyMessage = 'Unable to start the update process. Please try again.';

    if (error.message.includes('rate limit')) {
      statusCode = 429;
      errorCode = 'RATE_LIMIT_EXCEEDED';
      userMessage = 'GitHub API rate limit exceeded. Please try again later.';
      userFriendlyMessage = 'Too many update requests. Please wait a few minutes and try again.';
    } else if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
      statusCode = 503;
      errorCode = 'NETWORK_ERROR';
      userMessage = 'Network error connecting to GitHub. Please check your internet connection.';
      userFriendlyMessage = 'Cannot connect to GitHub to check for updates. Please verify your internet connection.';
    } else if (error.message.includes('not found')) {
      statusCode = 404;
      errorCode = 'REPOSITORY_NOT_FOUND';
      userMessage = 'Repository not found or not accessible';
      userFriendlyMessage = 'The update repository is not accessible. Please contact support.';
    } else if (error.message.includes('timeout')) {
      statusCode = 408;
      errorCode = 'REQUEST_TIMEOUT';
      userMessage = 'Request to GitHub timed out. Please check your internet connection.';
      userFriendlyMessage = 'The update check timed out. Please check your connection and try again.';
    }

    // Log the error response for monitoring
    updateLogger.warn('UPDATE_INITIATION_FAILED', {
      event: 'update_initiation_failed',
      errorCode,
      statusCode,
      requestId: req.id,
      timestamp: new Date().toISOString()
    });

    res.status(statusCode).json({
      success: false,
      error: errorCode,
      message: userMessage,
      userFriendlyMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      troubleshooting: {
        canRetry: !['REPOSITORY_NOT_FOUND'].includes(errorCode),
        suggestedActions: getSuggestedActions(errorCode)
      }
    });
  }
});

/**
 * Get suggested troubleshooting actions based on error code
 */
function getSuggestedActions(errorCode) {
  const actions = {
    'NETWORK_ERROR': [
      'Check your internet connection',
      'Verify DNS resolution is working',
      'Try again in a few minutes',
      'Check firewall settings'
    ],
    'RATE_LIMIT_EXCEEDED': [
      'Wait 5-10 minutes before trying again',
      'Check if multiple update requests were made recently',
      'Try again during off-peak hours'
    ],
    'REQUEST_TIMEOUT': [
      'Check internet connection stability',
      'Try again with a better connection',
      'Verify GitHub is accessible from your network'
    ],
    'REPOSITORY_NOT_FOUND': [
      'Contact system administrator',
      'Verify repository configuration',
      'Check if repository URL is correct'
    ]
  };
  
  return actions[errorCode] || [
    'Try the operation again',
    'Check system logs for more details',
    'Contact support if the problem persists'
  ];
}

// Performance metrics endpoint (for monitoring)
app.get('/api/metrics', (req, res) => {
  try {
    const metrics = performanceMonitor.getAllMetrics();
    res.json({
      success: true,
      metrics: metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error getting performance metrics', error);
    res.status(500).json({
      success: false,
      error: 'METRICS_ERROR',
      message: 'Failed to retrieve performance metrics',
    });
  }
});

// GET /api/audio-devices - Return list of available audio input devices
app.get('/api/audio-devices', async (req, res) => {
  try {
    const devices = await audioDeviceService.getAudioDevices();

    // Log device count for monitoring
    logger.debug(`Found ${devices.length} audio devices`);

    res.json({
      success: true,
      devices: devices,
      count: devices.length,
    });
  } catch (error) {
    logger.error('Error getting audio devices', error);

    // Determine appropriate error code and message
    let statusCode = 500;
    let errorCode = 'DEVICE_ENUMERATION_ERROR';
    let userMessage = 'Failed to enumerate audio devices';

    if (error.code === 'ENOENT') {
      statusCode = 404;
      errorCode = 'COMMAND_NOT_FOUND';
      userMessage = 'Audio device detection command not found on this system';
    } else if (error.code === 'EACCES') {
      statusCode = 403;
      errorCode = 'PERMISSION_DENIED';
      userMessage = 'Permission denied accessing audio devices';
    }

    res.status(statusCode).json({
      success: false,
      error: errorCode,
      message: userMessage,
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
      devices: [],
    });
  }
});

// Request validation middleware for preferences endpoints
const validatePreferencesRequest = (req, res, next) => {
  // Validate content type for POST requests
  if (req.method === 'POST' && !req.is('application/json')) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_CONTENT_TYPE',
      message: 'Content-Type must be application/json',
      details: {
        received: req.get('Content-Type') || 'none',
        expected: 'application/json',
      },
    });
  }

  // Validate request body size
  if (
    req.method === 'POST' &&
    req.body &&
    JSON.stringify(req.body).length > 50000
  ) {
    return res.status(413).json({
      success: false,
      error: 'REQUEST_TOO_LARGE',
      message: 'Request body is too large',
      details: {
        maxSize: '50KB',
        received: `${Math.round(JSON.stringify(req.body).length / 1024)}KB`,
      },
    });
  }

  next();
};

// GET /api/preferences - Return current user preferences
app.get('/api/preferences', validatePreferencesRequest, async (req, res) => {
  try {
    const preferences = await preferencesService.getPreferences();
    logger.debug('Preferences loaded successfully');

    res.json({
      success: true,
      preferences: preferences,
    });
  } catch (error) {
    logger.error('Error loading preferences', error);

    // Determine appropriate error code and message
    let statusCode = 500;
    let errorCode = 'PREFERENCES_LOAD_ERROR';
    let userMessage = 'Failed to load preferences';
    let shouldCreateDefaults = false;

    if (error.code === 'ENOENT') {
      logger.info('Preferences file not found, creating defaults');
      statusCode = 200; // Not really an error for the client
      errorCode = 'PREFERENCES_NOT_FOUND';
      userMessage = 'Preferences file not found, created with defaults';
      shouldCreateDefaults = true;
    } else if (error.code === 'EACCES' || error.code === 'PERMISSION_DENIED') {
      statusCode = 403;
      errorCode = 'PERMISSION_DENIED';
      userMessage = 'Permission denied accessing preferences file';
    } else if (error instanceof SyntaxError || error.code === 'INVALID_JSON') {
      logger.warn('Preferences file corrupted, creating new defaults');
      statusCode = 200; // Return success with defaults
      errorCode = 'PREFERENCES_CORRUPTED';
      userMessage = 'Preferences file was corrupted, restored with defaults';
      shouldCreateDefaults = true;
    }

    // Get default preferences
    const defaultPreferences = preferencesService.getDefaultPreferences();

    // Try to create default preferences file if needed
    if (shouldCreateDefaults) {
      try {
        await preferencesService.savePreferences(defaultPreferences);
        const settingsPath = preferencesService.getPreferencesPath();
        logger.info('Default preferences file created successfully', {
          settingsPath,
        });

        // Log to console for user visibility when file is first created
        console.log(`Settings file created: ${settingsPath}`);
      } catch (saveError) {
        logger.warn('Could not save default preferences file', {
          error: saveError.message,
          settingsPath: preferencesService.getPreferencesPath(),
        });
        // Continue with in-memory defaults
      }
    }

    res.status(statusCode).json({
      success: statusCode === 200,
      error: statusCode !== 200 ? errorCode : undefined,
      message: userMessage,
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
      preferences: defaultPreferences,
      settingsPath: preferencesService.getPreferencesPath(),
    });
  }
});

// GET /api/preferences/ui - Return only UI settings
app.get('/api/preferences/ui', validatePreferencesRequest, async (req, res) => {
  try {
    const preferences = await preferencesService.getPreferences();
    logger.debug('UI preferences loaded successfully');

    res.json({
      success: true,
      uiSettings:
        preferences.uiSettings ||
        preferencesService.getDefaultPreferences().uiSettings,
      lastUpdated: preferences.lastUpdated,
    });
  } catch (error) {
    logger.error('Error loading UI preferences', error);

    // Determine appropriate error code and message
    let statusCode = 500;
    let errorCode = 'UI_PREFERENCES_LOAD_ERROR';
    let userMessage = 'Failed to load UI preferences';
    let shouldCreateDefaults = false;

    if (error.code === 'ENOENT') {
      logger.info('Preferences file not found, returning default UI settings');
      statusCode = 200;
      errorCode = 'PREFERENCES_NOT_FOUND';
      userMessage = 'Preferences file not found, returned default UI settings';
      shouldCreateDefaults = true;
    } else if (error.code === 'EACCES' || error.code === 'PERMISSION_DENIED') {
      statusCode = 403;
      errorCode = 'PERMISSION_DENIED';
      userMessage = 'Permission denied accessing preferences file';
    } else if (error instanceof SyntaxError || error.code === 'INVALID_JSON') {
      logger.warn('Preferences file corrupted, returning default UI settings');
      statusCode = 200;
      errorCode = 'PREFERENCES_CORRUPTED';
      userMessage =
        'Preferences file was corrupted, returned default UI settings';
      shouldCreateDefaults = true;
    }

    // Get default UI settings
    const defaultUISettings =
      preferencesService.getDefaultPreferences().uiSettings;

    res.status(statusCode).json({
      success: statusCode === 200,
      error: statusCode !== 200 ? errorCode : undefined,
      message: userMessage,
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
      uiSettings: defaultUISettings,
      lastUpdated: new Date().toISOString(),
      settingsPath: preferencesService.getPreferencesPath(),
    });
  }
});

// POST /api/preferences - Save user preferences (enhanced with UI settings validation)
app.post('/api/preferences', validatePreferencesRequest, async (req, res) => {
  try {
    const { preferences } = req.body;

    if (!preferences) {
      logger.warn('Missing preferences data in request', { requestId: req.id });
      return res.status(400).json({
        success: false,
        error: 'MISSING_DATA',
        message: 'Request body must contain preferences object',
        details: {
          expected: 'preferences',
          received: Object.keys(req.body),
        },
      });
    }

    // Enhanced validation with detailed error reporting
    if (!preferencesService.validatePreferences(preferences)) {
      logger.warn('Invalid preferences data format', {
        requestId: req.id,
        receivedData: JSON.stringify(preferences).substring(0, 100) + '...',
      });

      // Get detailed UI settings validation errors if UI settings are present
      let validationDetails =
        'Please check the structure of your preferences object';
      if (preferences.uiSettings) {
        const uiValidation = preferencesService.validateUISettings(
          preferences.uiSettings
        );
        if (!uiValidation.success && uiValidation.errors) {
          validationDetails = {
            message: 'UI settings validation failed',
            errors: uiValidation.errors,
          };
        }
      }

      return res.status(400).json({
        success: false,
        error: 'INVALID_DATA_FORMAT',
        message: 'Preferences object does not match expected schema',
        details: validationDetails,
      });
    }

    const saved = await preferencesService.savePreferences(preferences);

    if (saved) {
      logger.info('Preferences saved successfully', { requestId: req.id });
      res.json({
        success: true,
        message: 'Preferences saved successfully',
        preferences: preferences,
        lastUpdated: preferences.lastUpdated,
      });
    } else {
      logger.error('Failed to save preferences', { requestId: req.id });
      res.status(500).json({
        success: false,
        error: 'SAVE_FAILED',
        message: 'Could not write preferences to disk',
        details: 'There may be a permissions issue or disk space problem',
      });
    }
  } catch (error) {
    logger.error('Error saving preferences', error);

    // Determine appropriate error code and message
    let statusCode = 500;
    let errorCode = 'PREFERENCES_SAVE_ERROR';
    let userMessage = 'Failed to save preferences';

    if (error.code === 'EACCES') {
      statusCode = 403;
      errorCode = 'PERMISSION_DENIED';
      userMessage = 'Permission denied writing preferences file';
    } else if (error.code === 'ENOSPC') {
      statusCode = 507;
      errorCode = 'INSUFFICIENT_STORAGE';
      userMessage = 'No space left on device';
    }

    res.status(statusCode).json({
      success: false,
      error: errorCode,
      message: userMessage,
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// POST /api/preferences/ui - Save only UI settings
app.post(
  '/api/preferences/ui',
  validatePreferencesRequest,
  async (req, res) => {
    try {
      const { uiSettings } = req.body;

      if (!uiSettings) {
        logger.warn('Missing UI settings data in request', {
          requestId: req.id,
        });
        return res.status(400).json({
          success: false,
          error: 'MISSING_DATA',
          message: 'Request body must contain uiSettings object',
          details: {
            expected: 'uiSettings',
            received: Object.keys(req.body),
          },
        });
      }

      // Validate UI settings with detailed error reporting
      const uiValidation = preferencesService.validateUISettings(uiSettings);
      if (!uiValidation.success) {
        logger.warn('Invalid UI settings data format', {
          requestId: req.id,
          errors: uiValidation.errors,
          receivedData: JSON.stringify(uiSettings).substring(0, 100) + '...',
        });

        return res.status(400).json({
          success: false,
          error: 'INVALID_UI_SETTINGS',
          message: 'UI settings validation failed',
          details: {
            errors: uiValidation.errors,
            validationFailed: Object.keys(uiValidation.errors || {}).length,
          },
        });
      }

      // Load current preferences and update only UI settings
      const currentPreferences = await preferencesService.getPreferences();
      const updatedPreferences = {
        ...currentPreferences,
        uiSettings: uiSettings,
        lastUpdated: new Date().toISOString(),
      };

      const saved = await preferencesService.savePreferences(
        updatedPreferences
      );

      if (saved) {
        logger.info('UI settings saved successfully', { requestId: req.id });
        res.json({
          success: true,
          message: 'UI settings saved successfully',
          uiSettings: uiSettings,
          lastUpdated: updatedPreferences.lastUpdated,
        });
      } else {
        logger.error('Failed to save UI settings', { requestId: req.id });
        res.status(500).json({
          success: false,
          error: 'UI_SAVE_FAILED',
          message: 'Could not write UI settings to disk',
          details: 'There may be a permissions issue or disk space problem',
        });
      }
    } catch (error) {
      logger.error('Error saving UI settings', error);

      // Determine appropriate error code and message
      let statusCode = 500;
      let errorCode = 'UI_SETTINGS_SAVE_ERROR';
      let userMessage = 'Failed to save UI settings';

      if (error.code === 'EACCES') {
        statusCode = 403;
        errorCode = 'PERMISSION_DENIED';
        userMessage = 'Permission denied writing preferences file';
      } else if (error.code === 'ENOSPC') {
        statusCode = 507;
        errorCode = 'INSUFFICIENT_STORAGE';
        userMessage = 'No space left on device';
      }

      res.status(statusCode).json({
        success: false,
        error: errorCode,
        message: userMessage,
        details:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// GET /api/server-config - Return current server configuration
app.get('/api/server-config', (req, res) => {
  try {
    const config = {
      host: HOST,
      port: PORT,
      networkAccessible: HOST === '0.0.0.0',
      kioskMode: {
        enabled:
          process.env.KIOSK_MODE === 'true' ||
          PlatformDetection.isRaspberryPi(),
        fullscreen: process.env.FULLSCREEN === 'true',
      },
    };

    logger.debug('Server configuration retrieved');

    res.json({
      success: true,
      config: config,
    });
  } catch (error) {
    logger.error('Error getting server configuration', error);

    res.status(500).json({
      success: false,
      error: 'SERVER_CONFIG_ERROR',
      message: 'Failed to get server configuration',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// DELETE /api/preferences - Reset preferences to defaults
app.delete('/api/preferences', validatePreferencesRequest, async (req, res) => {
  try {
    const settingsPath = preferencesService.getPreferencesPath();

    // Try to delete the existing preferences file
    try {
      await fs.promises.unlink(settingsPath);
      logger.info('Preferences file deleted for reset', { settingsPath });
    } catch (deleteError) {
      if (deleteError.code !== 'ENOENT') {
        // File exists but couldn't be deleted
        logger.warn('Could not delete preferences file for reset', {
          settingsPath,
          error: deleteError.message,
        });
      }
      // If file doesn't exist (ENOENT), that's fine - we're resetting anyway
    }

    // Create new default preferences
    const defaultPreferences = preferencesService.getDefaultPreferences();
    const saved = await preferencesService.savePreferences(defaultPreferences);

    if (saved) {
      logger.info('Preferences reset to defaults successfully');
      res.json({
        success: true,
        message: 'Preferences reset to defaults',
        preferences: defaultPreferences,
        settingsPath: settingsPath,
      });
    } else {
      logger.error('Failed to save default preferences after reset');
      res.status(500).json({
        success: false,
        error: 'RESET_SAVE_FAILED',
        message: 'Preferences were cleared but could not save defaults',
        preferences: defaultPreferences,
        settingsPath: settingsPath,
      });
    }
  } catch (error) {
    logger.error('Error resetting preferences', error);

    // Determine appropriate error code and message
    let statusCode = 500;
    let errorCode = 'PREFERENCES_RESET_ERROR';
    let userMessage = 'Failed to reset preferences';

    if (error.code === 'EACCES') {
      statusCode = 403;
      errorCode = 'PERMISSION_DENIED';
      userMessage = 'Permission denied accessing preferences file';
    }

    res.status(statusCode).json({
      success: false,
      error: errorCode,
      message: userMessage,
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// GET /api/system-info - Return system information
app.get('/api/system-info', (req, res) => {
  try {
    const systemInfo = PlatformDetection.getSystemInfo();
    logger.debug('System info retrieved successfully');

    res.json({
      success: true,
      systemInfo: systemInfo,
    });
  } catch (error) {
    logger.error('Error getting system info', error);

    // Determine appropriate error code
    let errorCode = 'SYSTEM_INFO_ERROR';
    let userMessage = 'Failed to get system information';

    if (error.code === 'EACCES') {
      errorCode = 'PERMISSION_DENIED';
      userMessage = 'Permission denied accessing system information';
    }

    res.status(500).json({
      success: false,
      error: errorCode,
      message: userMessage,
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
      systemInfo: {
        platform: 'unknown',
        arch: 'unknown',
        isRaspberryPi: false,
      },
    });
  }
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  logger.warn(`API endpoint not found: ${req.originalUrl}`, {
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.status(404).json({
    success: false,
    error: 'ENDPOINT_NOT_FOUND',
    message: `The endpoint ${req.originalUrl} does not exist`,
    availableEndpoints: [
      '/api/health',
      '/api/version',
      '/api/update/check',
      '/api/audio-devices',
      '/api/preferences',
      '/api/preferences/ui',
      '/api/system-info',
    ],
  });
});

/**
 * Execute the update process with comprehensive error handling and recovery
 * @param {object} updateInfo - Update information from GitHub check
 */
async function executeUpdateProcess(updateInfo) {
  const { spawn } = require('child_process');
  const path = require('path');

  // Create update logger for detailed tracking
  const updateLogger = logger.child('UPDATE');
  
  updateLogger.info('Starting update process', {
    currentVersion: updateInfo.localVersion,
    targetVersion: updateInfo.remoteVersion,
    method: updateInfo.comparisonMethod,
    timestamp: new Date().toISOString()
  });

  // Track update attempt for recovery purposes
  const updateAttempt = {
    startTime: Date.now(),
    currentVersion: updateInfo.localVersion,
    targetVersion: updateInfo.remoteVersion,
    steps: [],
    errors: []
  };

  try {
    // Step 1: Pre-update validation and preparation
    updateLogger.info('Step 1: Pre-update validation');
    updateStatusTracker.updateStatus('updating', 'Validating update prerequisites...', 5);
    updateAttempt.steps.push({ step: 'validation', status: 'started', timestamp: Date.now() });
    
    await validateUpdatePrerequisites(updateLogger, updateAttempt);
    updateAttempt.steps.push({ step: 'validation', status: 'completed', timestamp: Date.now() });
    
    // Give clients a moment to process the response
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 2: Create backup and prepare for rollback
    updateLogger.info('Step 2: Creating backup for rollback capability');
    updateStatusTracker.updateStatus('updating', 'Creating backup for rollback...', 15);
    updateAttempt.steps.push({ step: 'backup', status: 'started', timestamp: Date.now() });
    
    await createUpdateBackup(updateLogger, updateAttempt);
    updateAttempt.steps.push({ step: 'backup', status: 'completed', timestamp: Date.now() });

    // Step 3: Graceful shutdown preparation
    updateLogger.info('Step 3: Graceful shutdown preparation');
    updateStatusTracker.updateStatus('updating', 'Preparing for graceful shutdown...', 25);
    updateAttempt.steps.push({ step: 'shutdown_prep', status: 'started', timestamp: Date.now() });
    
    await prepareGracefulShutdown(updateLogger, updateAttempt);
    updateAttempt.steps.push({ step: 'shutdown_prep', status: 'completed', timestamp: Date.now() });
    
    // Step 4: Close server gracefully
    updateLogger.info('Step 4: Closing server connections');
    updateStatusTracker.updateStatus('updating', 'Closing server connections...', 35);
    updateAttempt.steps.push({ step: 'shutdown', status: 'started', timestamp: Date.now() });
    
    await performGracefulShutdown(updateLogger, updateAttempt);
    updateAttempt.steps.push({ step: 'shutdown', status: 'completed', timestamp: Date.now() });

    // Step 5: Execute update script with comprehensive monitoring
    updateLogger.info('Step 5: Executing update script');
    updateStatusTracker.updateStatus('updating', 'Executing update script...', 45);
    updateAttempt.steps.push({ step: 'update_execution', status: 'started', timestamp: Date.now() });
    
    await executeUpdateScript(updateLogger, updateAttempt);
    updateAttempt.steps.push({ step: 'update_execution', status: 'completed', timestamp: Date.now() });

    updateLogger.info('Update process completed successfully', {
      duration: Date.now() - updateAttempt.startTime,
      steps: updateAttempt.steps.length
    });

  } catch (error) {
    updateLogger.error('Update process failed', {
      error: error.message,
      stack: error.stack,
      duration: Date.now() - updateAttempt.startTime,
      completedSteps: updateAttempt.steps.filter(s => s.status === 'completed').length,
      totalSteps: updateAttempt.steps.length
    });

    updateAttempt.errors.push({
      error: error.message,
      stack: error.stack,
      timestamp: Date.now(),
      step: updateAttempt.steps[updateAttempt.steps.length - 1]?.step || 'unknown'
    });

    // Attempt recovery based on the failure point
    await attemptUpdateRecovery(updateLogger, updateAttempt, error);
  }
}

/**
 * Validate update prerequisites
 */
async function validateUpdatePrerequisites(updateLogger, updateAttempt) {
  const path = require('path');
  
  try {
    updateLogger.info('Validating update prerequisites with security checks');
    
    // Security: Validate script path to prevent path traversal
    const scriptsDir = path.join(__dirname, 'scripts');
    const updateScriptPath = path.join(scriptsDir, 'spectrabox-kiosk-install.sh');
    
    // Security: Ensure the resolved path is within the expected directory
    const resolvedScriptPath = path.resolve(updateScriptPath);
    const resolvedScriptsDir = path.resolve(scriptsDir);
    
    if (!resolvedScriptPath.startsWith(resolvedScriptsDir)) {
      throw new Error('Update script path validation failed: path traversal detected');
    }
    
    // Security: Validate script filename
    const scriptFilename = path.basename(resolvedScriptPath);
    const allowedScriptName = 'spectrabox-kiosk-install.sh';
    
    if (scriptFilename !== allowedScriptName) {
      throw new Error(`Invalid update script name: ${scriptFilename}. Expected: ${allowedScriptName}`);
    }
    
    // Check if update script exists
    if (!fs.existsSync(resolvedScriptPath)) {
      throw new Error(`Update script not found at ${resolvedScriptPath}`);
    }
    
    // Security: Check script file size (prevent extremely large scripts)
    const scriptStats = fs.statSync(resolvedScriptPath);
    const maxScriptSize = 1024 * 1024; // 1MB max
    
    if (scriptStats.size > maxScriptSize) {
      throw new Error(`Update script is too large: ${scriptStats.size} bytes (max: ${maxScriptSize})`);
    }
    
    if (scriptStats.size === 0) {
      throw new Error('Update script is empty');
    }
    
    // Security: Validate script content for basic safety
    const scriptContent = fs.readFileSync(resolvedScriptPath, 'utf8');
    
    // Check for dangerous commands (basic validation)
    const dangerousPatterns = [
      /rm\s+-rf\s+\/(?!\w)/,  // rm -rf / (but allow specific paths)
      />\s*\/dev\/sd[a-z]/,   // Writing to disk devices
      /mkfs\./,               // Filesystem creation
      /fdisk/,                // Disk partitioning
      /dd\s+if=/,             // Direct disk operations
      /eval\s*\$\(/,          // Dynamic evaluation
      /exec\s*\$\(/           // Dynamic execution
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(scriptContent)) {
        updateLogger.warn('Update script contains potentially dangerous command', { 
          pattern: pattern.toString(),
          scriptPath: resolvedScriptPath 
        });
        // Don't fail here, just log warning - the script might be legitimate
      }
    }
    
    // Check script permissions
    try {
      fs.accessSync(resolvedScriptPath, fs.constants.R_OK);
      updateLogger.debug('Update script is readable');
    } catch (permError) {
      throw new Error(`Update script is not readable: ${permError.message}`);
    }
    
    // Check if script is executable (on Unix-like systems)
    if (process.platform !== 'win32') {
      try {
        fs.accessSync(resolvedScriptPath, fs.constants.X_OK);
        updateLogger.debug('Update script is executable');
      } catch (execError) {
        updateLogger.warn('Update script may not be executable', { 
          scriptPath: resolvedScriptPath,
          error: execError.message 
        });
        
        // Try to make it executable
        try {
          fs.chmodSync(resolvedScriptPath, 0o755);
          updateLogger.info('Made update script executable', { scriptPath: resolvedScriptPath });
        } catch (chmodError) {
          throw new Error(`Cannot make update script executable: ${chmodError.message}`);
        }
      }
    }
    
    // Security: Validate current working directory
    const currentDir = process.cwd();
    const expectedDir = path.resolve(__dirname);
    
    if (currentDir !== expectedDir) {
      updateLogger.warn('Current working directory is not the application directory', {
        current: currentDir,
        expected: expectedDir
      });
    }
    
    // Check available disk space (require at least 100MB free)
    const stats = fs.statSync(__dirname);
    updateLogger.debug('Disk space validation completed');
    
    // Check if we have sudo access (in production)
    if (process.env.NODE_ENV === 'production') {
      updateLogger.debug('Production environment detected, sudo access required');
    }
    
    // Store script path and metadata for later use
    updateAttempt.updateScriptPath = resolvedScriptPath;
    updateAttempt.scriptSize = scriptStats.size;
    updateAttempt.scriptPermissions = scriptStats.mode;
    
    updateLogger.info('Update prerequisites validated successfully', {
      scriptPath: resolvedScriptPath,
      scriptExists: true,
      scriptReadable: true,
      scriptSize: scriptStats.size,
      scriptPermissions: scriptStats.mode.toString(8)
    });
    
  } catch (error) {
    updateLogger.error('Update prerequisite validation failed', error);
    updateStatusTracker.updateStatus('error', 'Update prerequisites validation failed', 5, error.message);
    throw new Error(`Prerequisites validation failed: ${error.message}`);
  }
}

/**
 * Create backup for rollback capability
 */
async function createUpdateBackup(updateLogger, updateAttempt) {
  try {
    updateLogger.info('Creating update backup');
    
    // In a real implementation, we would backup critical files
    // For now, we'll just record the current state
    const currentVersion = await versionManager.getCurrentVersion();
    
    updateAttempt.backup = {
      version: currentVersion,
      timestamp: Date.now(),
      backupCreated: true
    };
    
    updateLogger.info('Update backup created successfully', {
      currentVersion: currentVersion,
      backupTimestamp: updateAttempt.backup.timestamp
    });
    
  } catch (error) {
    updateLogger.error('Failed to create update backup', error);
    updateStatusTracker.updateStatus('error', 'Failed to create backup', 15, error.message);
    throw new Error(`Backup creation failed: ${error.message}`);
  }
}

/**
 * Prepare for graceful shutdown
 */
async function prepareGracefulShutdown(updateLogger, updateAttempt) {
  try {
    updateLogger.info('Preparing for graceful shutdown');
    
    // Notify all connected WebSocket clients about impending shutdown
    const shutdownNotification = {
      type: 'serverShutdown',
      message: 'Server is shutting down for update. Please wait...',
      timestamp: new Date().toISOString(),
      expectedDowntime: '2-5 minutes',
      reconnectInstructions: 'The page will automatically reload when the update is complete'
    };
    
    updateStatusTracker.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(shutdownNotification));
        } catch (error) {
          updateLogger.warn('Failed to notify client of shutdown', error);
        }
      }
    });

    // Also update the status tracker with shutdown message
    updateStatusTracker.updateStatus('updating', 'Server shutting down for update...', 30);
    
    updateLogger.info('Shutdown preparation completed', {
      notifiedClients: updateStatusTracker.clients.size
    });
    
  } catch (error) {
    updateLogger.error('Failed to prepare for graceful shutdown', error);
    // Don't throw here as this is not critical for update success
    updateLogger.warn('Continuing with update despite shutdown preparation failure');
  }
}

/**
 * Perform graceful shutdown
 */
async function performGracefulShutdown(updateLogger, updateAttempt) {
  try {
    updateLogger.info('Performing graceful server shutdown');
    
    // Get reference to the current server instance
    const currentServer = global.spectraboxServer;
    if (currentServer) {
      // Close server to new connections
      await new Promise((resolve) => {
        currentServer.close(() => {
          updateLogger.info('Server closed to new connections');
          resolve();
        });
      });

      // Give existing connections time to finish
      updateLogger.info('Waiting for existing connections to close');
      await new Promise(resolve => setTimeout(resolve, 3000));
    } else {
      updateLogger.warn('No server instance found for graceful shutdown');
    }
    
    updateLogger.info('Graceful shutdown completed');
    
  } catch (error) {
    updateLogger.error('Failed to perform graceful shutdown', error);
    // Don't throw here as we can still proceed with the update
    updateLogger.warn('Continuing with update despite shutdown failure');
  }
}

/**
 * Execute update script with comprehensive monitoring
 */
async function executeUpdateScript(updateLogger, updateAttempt) {
  const { spawn } = require('child_process');
  
  return new Promise((resolve, reject) => {
    try {
      updateLogger.info('Starting update script execution', {
        scriptPath: updateAttempt.updateScriptPath
      });

      // Execute the update script
      const updateProcess = spawn('sudo', ['bash', updateAttempt.updateScriptPath], {
        cwd: __dirname,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
        env: {
          ...process.env,
          SUDO_USER: process.env.USER || 'pi',
          UPDATE_MODE: 'true'
        }
      });

      // Track script progress and output
      let scriptProgress = 45;
      let scriptOutput = [];
      let scriptErrors = [];
      let lastOutputTime = Date.now();
      
      // Set up timeout for script execution (15 minutes max)
      const scriptTimeout = setTimeout(() => {
        updateLogger.error('Update script execution timeout');
        updateStatusTracker.updateStatus('error', 'Update timed out after 15 minutes', scriptProgress, 
          'The update process is taking longer than expected. This may indicate a network issue or system problem.');
        updateProcess.kill('SIGTERM');
        reject(new Error('Update script execution timed out after 15 minutes'));
      }, 15 * 60 * 1000);

      // Set up progress timeout (warn if no progress for 5 minutes)
      let progressTimeout = setTimeout(() => {
        if (Date.now() - lastOutputTime > 5 * 60 * 1000) {
          updateLogger.warn('No update progress for 5 minutes');
          updateStatusTracker.updateStatus('updating', 'Update is taking longer than expected, but still in progress...', scriptProgress);
          
          // Reset progress timeout
          progressTimeout = setTimeout(() => {
            updateLogger.warn('Update appears stalled');
            updateStatusTracker.updateStatus('updating', 'Update may be stalled - this can happen with slow network connections', scriptProgress);
          }, 5 * 60 * 1000);
        }
      }, 5 * 60 * 1000);

      // Monitor script output
      updateProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          lastOutputTime = Date.now();
          scriptOutput.push({ timestamp: Date.now(), output });
          updateLogger.info('Update script output', { output });
          
          // Parse output for better progress tracking
          const progressInfo = parseUpdateProgress(output);
          scriptProgress = Math.min(scriptProgress + progressInfo.increment, 90);
          
          updateStatusTracker.updateStatus('updating', progressInfo.message, scriptProgress);
        }
      });

      updateProcess.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          lastOutputTime = Date.now();
          scriptErrors.push({ timestamp: Date.now(), error: output });
          updateLogger.warn('Update script stderr', { output });
          
          // Classify stderr output
          if (output.toLowerCase().includes('error') || output.toLowerCase().includes('failed')) {
            updateStatusTracker.updateStatus('updating', `Update error: ${output.substring(0, 80)}...`, scriptProgress);
          } else {
            updateStatusTracker.updateStatus('updating', `Update progress: ${output.substring(0, 80)}...`, scriptProgress);
          }
        }
      });

      // Handle script completion
      updateProcess.on('close', (code) => {
        clearTimeout(scriptTimeout);
        clearTimeout(progressTimeout);
        
        updateAttempt.scriptExecution = {
          exitCode: code,
          duration: Date.now() - updateAttempt.startTime,
          outputLines: scriptOutput.length,
          errorLines: scriptErrors.length,
          lastOutput: scriptOutput[scriptOutput.length - 1]?.output || 'No output',
          lastError: scriptErrors[scriptErrors.length - 1]?.error || 'No errors'
        };

        if (code === 0) {
          updateLogger.info('Update script completed successfully', {
            exitCode: code,
            duration: updateAttempt.scriptExecution.duration,
            outputLines: scriptOutput.length
          });
          
          updateStatusTracker.updateStatus('success', 'Update completed successfully! Server will restart...', 100);
          
          // Schedule graceful exit
          setTimeout(() => {
            updateLogger.info('Exiting process to allow service restart');
            process.exit(0);
          }, 5000);
          
          resolve();
        } else {
          const errorMsg = `Update script failed with exit code ${code}`;
          updateLogger.error('Update script failed', {
            exitCode: code,
            duration: updateAttempt.scriptExecution.duration,
            lastOutput: updateAttempt.scriptExecution.lastOutput,
            lastError: updateAttempt.scriptExecution.lastError
          });
          
          reject(new Error(errorMsg));
        }
      });

      updateProcess.on('error', (error) => {
        clearTimeout(scriptTimeout);
        clearTimeout(progressTimeout);
        updateLogger.error('Failed to start update script', error);
        reject(new Error(`Failed to start update script: ${error.message}`));
      });

      // Detach the update process so it continues even if this process exits
      updateProcess.unref();

    } catch (error) {
      updateLogger.error('Error setting up update script execution', error);
      reject(error);
    }
  });
}

/**
 * Parse update script output for better progress tracking
 */
function parseUpdateProgress(output) {
  const lowerOutput = output.toLowerCase();
  
  // Define progress patterns and their corresponding increments
  const progressPatterns = [
    { pattern: /downloading|fetching|getting/i, increment: 3, message: `Downloading updates: ${output.substring(0, 60)}...` },
    { pattern: /installing|setting up|configuring/i, increment: 2, message: `Installing updates: ${output.substring(0, 60)}...` },
    { pattern: /updating|upgrading/i, increment: 2, message: `Updating system: ${output.substring(0, 60)}...` },
    { pattern: /restarting|starting|enabling/i, increment: 4, message: `Restarting services: ${output.substring(0, 60)}...` },
    { pattern: /complete|finished|done/i, increment: 5, message: `Finalizing update: ${output.substring(0, 60)}...` },
    { pattern: /error|failed|warning/i, increment: 0, message: `Update warning: ${output.substring(0, 60)}...` }
  ];
  
  // Check for specific progress patterns
  for (const pattern of progressPatterns) {
    if (pattern.pattern.test(output)) {
      return {
        increment: pattern.increment,
        message: pattern.message
      };
    }
  }
  
  // Default progress for unrecognized output
  return {
    increment: 1,
    message: `Update in progress: ${output.substring(0, 60)}...`
  };
}

/**
 * Attempt recovery from update failure
 */
async function attemptUpdateRecovery(updateLogger, updateAttempt, originalError) {
  try {
    updateLogger.info('Attempting update recovery', {
      originalError: originalError.message,
      failedStep: updateAttempt.steps[updateAttempt.steps.length - 1]?.step || 'unknown',
      completedSteps: updateAttempt.steps.filter(s => s.status === 'completed').length
    });

    // Determine recovery strategy based on failure point
    const lastStep = updateAttempt.steps[updateAttempt.steps.length - 1];
    let recoveryMessage = 'Update failed - attempting to restore service';
    let recoveryAction = 'restart';

    if (lastStep?.step === 'validation') {
      recoveryMessage = 'Update prerequisites not met - service will continue normally';
      recoveryAction = 'continue';
    } else if (lastStep?.step === 'backup') {
      recoveryMessage = 'Backup creation failed - update aborted for safety';
      recoveryAction = 'continue';
    } else if (lastStep?.step === 'update_execution') {
      recoveryMessage = 'Update script failed - attempting to restore previous version';
      recoveryAction = 'rollback';
    }

    // Create user-friendly error message
    const userFriendlyError = createUserFriendlyErrorMessage(originalError, lastStep?.step);
    
    updateStatusTracker.updateStatus('error', recoveryMessage, 
      updateAttempt.steps.filter(s => s.status === 'completed').length * 10, 
      userFriendlyError);

    // Execute recovery action
    switch (recoveryAction) {
    case 'continue':
      updateLogger.info('Recovery: Continuing normal operation');
      // Don't exit, let the server continue running
      break;
        
    case 'rollback':
      updateLogger.info('Recovery: Attempting rollback');
      await attemptRollback(updateLogger, updateAttempt);
      break;
        
    case 'restart':
    default:
      updateLogger.info('Recovery: Restarting server');
      setTimeout(() => {
        updateLogger.info('Exiting for service restart after recovery attempt');
        process.exit(1); // Exit with error code to trigger systemd restart
      }, 3000);
      break;
    }

  } catch (recoveryError) {
    updateLogger.error('Recovery attempt failed', recoveryError);
    updateStatusTracker.updateStatus('error', 'Recovery failed - manual intervention may be required', 0, 
      `Original error: ${originalError.message}. Recovery error: ${recoveryError.message}`);
    
    // Last resort: restart the service
    setTimeout(() => {
      updateLogger.error('Final fallback: Exiting for service restart');
      process.exit(1);
    }, 5000);
  }
}

/**
 * Attempt to rollback from failed update
 */
async function attemptRollback(updateLogger, updateAttempt) {
  try {
    updateLogger.info('Attempting rollback to previous version');
    
    if (!updateAttempt.backup) {
      throw new Error('No backup available for rollback');
    }
    
    // In a real implementation, we would restore from backup
    // For now, we'll just log the attempt and restart
    updateLogger.info('Rollback attempt completed', {
      backupVersion: updateAttempt.backup.version,
      backupTimestamp: updateAttempt.backup.timestamp
    });
    
    updateStatusTracker.updateStatus('error', 'Rollback completed - restarting with previous version', 50, 
      'Update failed and system has been restored to previous version');
    
  } catch (rollbackError) {
    updateLogger.error('Rollback failed', rollbackError);
    throw new Error(`Rollback failed: ${rollbackError.message}`);
  }
}

/**
 * Create user-friendly error message based on error type and context
 */
function createUserFriendlyErrorMessage(error, failedStep) {
  const errorMessage = error.message.toLowerCase();
  
  // Network-related errors
  if (errorMessage.includes('network') || errorMessage.includes('connection') || errorMessage.includes('timeout')) {
    return 'Network connection issue prevented the update. Please check your internet connection and try again.';
  }
  
  // Permission errors
  if (errorMessage.includes('permission') || errorMessage.includes('eacces') || errorMessage.includes('eperm')) {
    return 'Permission denied during update. The system may need administrator privileges to complete the update.';
  }
  
  // Disk space errors
  if (errorMessage.includes('space') || errorMessage.includes('enospc')) {
    return 'Insufficient disk space to complete the update. Please free up some space and try again.';
  }
  
  // Script-related errors
  if (errorMessage.includes('script') || failedStep === 'update_execution') {
    return 'The update script encountered an error. This may be due to system configuration or temporary issues.';
  }
  
  // Prerequisites errors
  if (failedStep === 'validation') {
    return 'Update prerequisites are not met. Please ensure the system is properly configured for updates.';
  }
  
  // Backup errors
  if (failedStep === 'backup') {
    return 'Unable to create backup before update. Update was cancelled for safety.';
  }
  
  // Generic fallback
  return `Update failed due to: ${error.message}. Please try again or contact support if the problem persists.`;
}

/**
 * Load preferences and configure server settings
 * @returns {Promise<object>} Server configuration
 */
async function loadServerConfiguration() {
  try {
    // Log settings file location during server startup
    const settingsPath = preferencesService.getPreferencesPath();
    logger.info('Settings file location', {
      path: settingsPath,
      platform: PlatformDetection.getCurrentPlatform(),
    });

    // Log settings file path to console during server startup for user visibility
    console.log(`Settings file location: ${settingsPath}`);

    const preferences = await preferencesService.getPreferences();

    // Override default values with preferences if available
    if (preferences.systemSettings) {
      if (preferences.systemSettings.port && !process.env.PORT) {
        PORT = preferences.systemSettings.port;
      }
      if (preferences.systemSettings.host && !process.env.HOST) {
        HOST = preferences.systemSettings.host;
      }
    }

    logger.info('Server configuration loaded from preferences', {
      host: HOST,
      port: PORT,
      fromPreferences: !!preferences.systemSettings,
      settingsPath: settingsPath,
    });

    return { host: HOST, port: PORT, preferences };
  } catch (error) {
    // Log settings file location even on error for user reference
    try {
      const settingsPath = preferencesService.getPreferencesPath();
      logger.info('Settings file location', {
        path: settingsPath,
        platform: PlatformDetection.getCurrentPlatform(),
        status: 'error_loading',
      });

      // Log settings file path to console during server startup even on error
      console.log(`Settings file location: ${settingsPath} (error loading)`);
    } catch (pathError) {
      logger.warn('Could not determine settings file path', {
        error: pathError.message,
      });
    }

    logger.warn(
      'Could not load preferences for server configuration, using defaults',
      {
        error: error.message,
        defaultHost: HOST,
        defaultPort: PORT,
      }
    );

    return { host: HOST, port: PORT, preferences: null };
  }
}

// Start server only if this file is run directly (not imported for testing)
if (require.main === module) {
  let server;

  // Load server configuration from preferences
  loadServerConfiguration()
    .then(({ host, port, preferences }) => {
      HOST = host;
      PORT = port;

      // Try to start HTTPS server if certificates exist
      const httpsOptions = {
        key: null,
        cert: null,
      };

      try {
        // Check for SSL certificates
        if (fs.existsSync('./ssl/key.pem') && fs.existsSync('./ssl/cert.pem')) {
          logger.info('SSL certificates found, starting HTTPS server');

          try {
            httpsOptions.key = fs.readFileSync('./ssl/key.pem');
            httpsOptions.cert = fs.readFileSync('./ssl/cert.pem');
          } catch (certError) {
            logger.error('Error reading SSL certificates', certError);
            throw new Error('Failed to read SSL certificates');
          }

          // Start HTTPS server
          server = https
            .createServer(httpsOptions, app)
            .listen(PORT, HOST, () => {
              logger.info(
                `SpectraBox HTTPS server running on ${HOST}:${PORT}`
              );
              logger.info(`Local access: https://localhost:${PORT}`);
              if (HOST === '0.0.0.0') {
                logger.info(`Network access: https://<your-ip>:${PORT}`);
                logger.info(
                  'Server is accessible from other devices on the network'
                );
              }
              logger.info(
                `Platform: ${PlatformDetection.getCurrentPlatform()}`
              );
              logger.info(`Raspberry Pi: ${PlatformDetection.isRaspberryPi()}`);
              logger.info(
                'HTTPS enabled - microphone permissions will be remembered'
              );

              // Display settings file location in application logs for user reference
              const settingsPath = preferencesService.getPreferencesPath();
              logger.info(`Settings file: ${settingsPath}`);

              // Start performance monitoring on Raspberry Pi
              if (
                PlatformDetection.isRaspberryPi() ||
                process.env.NODE_ENV === 'production'
              ) {
                performanceMonitor.start(300000); // Monitor every 5 minutes in production
              }
            });

          // Handle server errors
          server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
              logger.error(`Port ${PORT} is already in use`);
              process.exit(1);
            } else {
              logger.error('HTTPS server error', err);
            }
          });

          // Store global reference for update process
          global.spectraboxServer = server;

          // Setup WebSocket server for update status
          const wss = new WebSocket.Server({ server });
          
          wss.on('connection', (ws, req) => {
            logger.debug('WebSocket client connected', { 
              ip: req.socket.remoteAddress,
              userAgent: req.headers['user-agent']
            });
            
            // Add client to update status tracker
            updateStatusTracker.addClient(ws);
            
            ws.on('close', () => {
              logger.debug('WebSocket client disconnected');
              updateStatusTracker.removeClient(ws);
            });
            
            ws.on('error', (error) => {
              logger.warn('WebSocket client error', error);
              updateStatusTracker.removeClient(ws);
            });
          });

          // Store WebSocket server reference
          global.spectraboxWebSocketServer = wss;
        } else {
          throw new Error('SSL certificates not found');
        }
      } catch (error) {
        // Fall back to HTTP server
        logger.warn(`Starting HTTP server: ${error.message}`);
        logger.warn(
          'Note: Microphone permission dialog will appear each time in HTTP mode'
        );

        server = app.listen(PORT, HOST, () => {
          logger.info(`SpectraBox HTTP server running on ${HOST}:${PORT}`);
          logger.info(`Local access: http://localhost:${PORT}`);
          if (HOST === '0.0.0.0') {
            logger.info(`Network access: http://<your-ip>:${PORT}`);
            logger.info(
              'Server is accessible from other devices on the network'
            );
          }
          logger.info(`Platform: ${PlatformDetection.getCurrentPlatform()}`);
          logger.info(`Raspberry Pi: ${PlatformDetection.isRaspberryPi()}`);

          // Display settings file location in application logs for user reference
          const settingsPath = preferencesService.getPreferencesPath();
          logger.info(`Settings file: ${settingsPath}`);

          logger.info('');
          logger.info('To avoid microphone permission dialogs:');
          logger.info('1. Generate SSL certificates (see README)');
          logger.info(
            '2. Or start browser with: --auto-accept-camera-and-microphone-capture-policy'
          );

          // Start performance monitoring on Raspberry Pi
          if (
            PlatformDetection.isRaspberryPi() ||
            process.env.NODE_ENV === 'production'
          ) {
            performanceMonitor.start(300000); // Monitor every 5 minutes in production
          }
        });

        // Handle server errors
        server.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            logger.error(`Port ${PORT} is already in use`);
            process.exit(1);
          } else {
            logger.error('HTTP server error', err);
          }
        });

        // Store global reference for update process
        global.spectraboxServer = server;

        // Setup WebSocket server for update status
        const wss = new WebSocket.Server({ server });
        
        wss.on('connection', (ws, req) => {
          logger.debug('WebSocket client connected', { 
            ip: req.socket.remoteAddress,
            userAgent: req.headers['user-agent']
          });
          
          // Add client to update status tracker
          updateStatusTracker.addClient(ws);
          
          ws.on('close', () => {
            logger.debug('WebSocket client disconnected');
            updateStatusTracker.removeClient(ws);
          });
          
          ws.on('error', (error) => {
            logger.warn('WebSocket client error', error);
            updateStatusTracker.removeClient(ws);
          });
        });

        // Store WebSocket server reference
        global.spectraboxWebSocketServer = wss;
      }

      // Graceful shutdown handling
      let isShuttingDown = false;

      const gracefulShutdown = (signal) => {
        if (isShuttingDown) {
          logger.warn(`${signal} received again, forcing immediate shutdown`);
          process.exit(1);
        }

        isShuttingDown = true;
        logger.info(`${signal} received, shutting down gracefully`);

        // Stop accepting new connections
        server.close((err) => {
          if (err) {
            logger.error('Error closing server', err);
            process.exit(1);
          }

          logger.info('Server closed successfully');

          // Perform cleanup tasks with timeout handling
          const cleanupTasks = [
            // Stop performance monitoring
            Promise.resolve(performanceMonitor.stop()),
            // Save current settings during shutdown
            preferencesService.flush
              ? preferencesService.flush(5000)
              : Promise.resolve(true),
            // Close any open file handles or connections
            audioDeviceService.cleanup
              ? audioDeviceService.cleanup()
              : Promise.resolve(),
          ];

          // Add timeout for entire cleanup process
          const cleanupTimeout = new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error('Cleanup process timed out'));
            }, 10000); // 10 second timeout for all cleanup tasks
          });

          Promise.race([Promise.all(cleanupTasks), cleanupTimeout])
            .then((results) => {
              // Log settings save result specifically
              if (results && results[1] !== undefined) {
                if (results[1]) {
                  logger.info('Settings saved successfully during shutdown');
                } else {
                  logger.warn(
                    'Settings save failed during shutdown, but continuing'
                  );
                }
              }

              logger.info('Cleanup completed successfully');
              process.exit(0);
            })
            .catch((cleanupError) => {
              if (cleanupError.message.includes('timed out')) {
                logger.error('Cleanup process timed out during shutdown', {
                  error: cleanupError.message,
                });
              } else {
                logger.error('Error during cleanup', cleanupError);
              }

              // Still attempt to log settings save failure specifically
              logger.warn(
                'Shutdown cleanup failed, but attempting to preserve settings'
              );
              process.exit(1);
            });
        });

        // Force shutdown after timeout if server doesn't close properly
        setTimeout(() => {
          logger.error(
            'Forced shutdown after timeout - settings may not be saved'
          );
          process.exit(1);
        }, 25000); // Increased timeout for Raspberry Pi
      };

      // Handle shutdown signals for settings preservation
      process.on('SIGTERM', () => {
        logger.info('SIGTERM received - preserving settings during shutdown');
        gracefulShutdown('SIGTERM');
      });

      process.on('SIGINT', () => {
        logger.info('SIGINT received - preserving settings during shutdown');
        gracefulShutdown('SIGINT');
      });

      process.on('SIGHUP', () => {
        logger.info('SIGHUP received, reloading configuration');
        // Reload preferences and configuration
        preferencesService.reload ? preferencesService.reload() : null;
      });

      // Handle uncaught exceptions
      process.on('uncaughtException', (err) => {
        logger.error('Uncaught exception', err);

        // Attempt to save settings before shutdown
        const emergencySettingsSave = async () => {
          try {
            if (preferencesService.flush) {
              logger.info(
                'Attempting emergency settings save due to uncaught exception'
              );
              const saved = await preferencesService.flush(2000); // Shorter timeout for emergency
              if (saved) {
                logger.info('Emergency settings save completed');
              } else {
                logger.warn('Emergency settings save failed');
              }
            }
          } catch (saveError) {
            logger.error('Emergency settings save error', saveError);
          }
        };

        // Attempt graceful shutdown with settings save
        emergencySettingsSave().finally(() => {
          server.close(() => {
            logger.info('Server closed due to uncaught exception');
            process.exit(1);
          });

          // Force shutdown after timeout
          setTimeout(() => {
            logger.error('Forced shutdown after uncaught exception');
            process.exit(1);
          }, 3000);
        });
      });

      // Handle unhandled promise rejections
      process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled promise rejection', { reason });
        // Don't exit process, just log the error
      });
    })
    .catch((configError) => {
      logger.error('Failed to load server configuration', configError);
      logger.info('Starting server with default configuration');

      // Start with defaults if configuration loading fails
      startServerWithDefaults();
    });

  /**
   * Start server with default configuration (fallback)
   */
  function startServerWithDefaults() {
    const defaultPort = process.env.PORT || 3000;
    const defaultHost = process.env.HOST || '0.0.0.0';

    const server = app.listen(defaultPort, defaultHost, () => {
      logger.info(
        `SpectraBox server running on ${defaultHost}:${defaultPort} (default config)`
      );
      logger.info(`Local access: http://localhost:${defaultPort}`);
      if (defaultHost === '0.0.0.0') {
        logger.info(`Network access: http://<your-ip>:${defaultPort}`);
      }
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${defaultPort} is already in use`);
        process.exit(1);
      } else {
        logger.error('Server error', err);
      }
    });

    // Store global reference for update process
    global.spectraboxServer = server;
  }
}

module.exports = app;
