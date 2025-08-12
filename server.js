const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const fs = require('fs');

// Import services
const AudioDeviceService = require('./services/audioDeviceService');
const { PreferencesService } = require('./services/preferencesService');
const PlatformDetection = require('./utils/platformDetection');
const { logger } = require('./utils/logger');
const PerformanceMonitor = require('./utils/performanceMonitor');

const app = express();

// Initialize services early to get preferences
const preferencesService = new PreferencesService();

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

// Initialize other services
const audioDeviceService = new AudioDeviceService();
const performanceMonitor = new PerformanceMonitor();

// Set log level from environment variable
logger.options.level = process.env.LOG_LEVEL || 'info';

// Middleware - optimized for Raspberry Pi
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true, // Restrict CORS in production
  credentials: false, // Disable credentials for better performance
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
}));

// Optimize JSON parsing for limited resources
app.use(express.json({ 
  limit: '512kb', // Reduce from 1mb for Raspberry Pi
  strict: true, // Only parse objects and arrays
  type: 'application/json'
}));

// Optimize static file serving for Raspberry Pi
app.use(express.static(path.join(__dirname, 'public'), {
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
  }
}));

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
    userAgent: req.get('user-agent')
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
      responseTime: Date.now() - parseInt(req.id.substr(0, 8), 36)
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
      message: 'The request body contains invalid JSON'
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
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    code: err.code || 'INTERNAL_ERROR'
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
  res.json({ 
    status: 'OK', 
    message: 'Pi Audio Kiosk server is running',
    performance: {
      uptime: `${metrics.uptime.uptimeHours}h`,
      memory: `${metrics.memory.rss}MB`,
      requests: metrics.requests.totalRequests,
      errors: metrics.requests.totalErrors
    }
  });
});

// Performance metrics endpoint (for monitoring)
app.get('/api/metrics', (req, res) => {
  try {
    const metrics = performanceMonitor.getAllMetrics();
    res.json({
      success: true,
      metrics: metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting performance metrics', error);
    res.status(500).json({
      success: false,
      error: 'METRICS_ERROR',
      message: 'Failed to retrieve performance metrics'
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
      count: devices.length
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
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      devices: []
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
        expected: 'application/json'
      }
    });
  }
  
  // Validate request body size
  if (req.method === 'POST' && req.body && JSON.stringify(req.body).length > 50000) {
    return res.status(413).json({
      success: false,
      error: 'REQUEST_TOO_LARGE',
      message: 'Request body is too large',
      details: {
        maxSize: '50KB',
        received: `${Math.round(JSON.stringify(req.body).length / 1024)}KB`
      }
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
      preferences: preferences
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
        logger.info('Default preferences file created successfully', { settingsPath });
        
        // Log to console for user visibility when file is first created
        console.log(`Settings file created: ${settingsPath}`);
      } catch (saveError) {
        logger.warn('Could not save default preferences file', { 
          error: saveError.message,
          settingsPath: preferencesService.getPreferencesPath()
        });
        // Continue with in-memory defaults
      }
    }
    
    res.status(statusCode).json({
      success: statusCode === 200,
      error: statusCode !== 200 ? errorCode : undefined,
      message: userMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      preferences: defaultPreferences,
      settingsPath: preferencesService.getPreferencesPath()
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
      uiSettings: preferences.uiSettings || preferencesService.getDefaultPreferences().uiSettings,
      lastUpdated: preferences.lastUpdated
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
      userMessage = 'Preferences file was corrupted, returned default UI settings';
      shouldCreateDefaults = true;
    }
    
    // Get default UI settings
    const defaultUISettings = preferencesService.getDefaultPreferences().uiSettings;
    
    res.status(statusCode).json({
      success: statusCode === 200,
      error: statusCode !== 200 ? errorCode : undefined,
      message: userMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      uiSettings: defaultUISettings,
      lastUpdated: new Date().toISOString(),
      settingsPath: preferencesService.getPreferencesPath()
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
          received: Object.keys(req.body)
        }
      });
    }

    // Enhanced validation with detailed error reporting
    if (!preferencesService.validatePreferences(preferences)) {
      logger.warn('Invalid preferences data format', { 
        requestId: req.id,
        receivedData: JSON.stringify(preferences).substring(0, 100) + '...'
      });
      
      // Get detailed UI settings validation errors if UI settings are present
      let validationDetails = 'Please check the structure of your preferences object';
      if (preferences.uiSettings) {
        const uiValidation = preferencesService.validateUISettings(preferences.uiSettings);
        if (!uiValidation.success && uiValidation.errors) {
          validationDetails = {
            message: 'UI settings validation failed',
            errors: uiValidation.errors
          };
        }
      }
      
      return res.status(400).json({
        success: false,
        error: 'INVALID_DATA_FORMAT',
        message: 'Preferences object does not match expected schema',
        details: validationDetails
      });
    }

    const saved = await preferencesService.savePreferences(preferences);
    
    if (saved) {
      logger.info('Preferences saved successfully', { requestId: req.id });
      res.json({
        success: true,
        message: 'Preferences saved successfully',
        preferences: preferences,
        lastUpdated: preferences.lastUpdated
      });
    } else {
      logger.error('Failed to save preferences', { requestId: req.id });
      res.status(500).json({
        success: false,
        error: 'SAVE_FAILED',
        message: 'Could not write preferences to disk',
        details: 'There may be a permissions issue or disk space problem'
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
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/preferences/ui - Save only UI settings
app.post('/api/preferences/ui', validatePreferencesRequest, async (req, res) => {
  try {
    const { uiSettings } = req.body;
    
    if (!uiSettings) {
      logger.warn('Missing UI settings data in request', { requestId: req.id });
      return res.status(400).json({
        success: false,
        error: 'MISSING_DATA',
        message: 'Request body must contain uiSettings object',
        details: {
          expected: 'uiSettings',
          received: Object.keys(req.body)
        }
      });
    }

    // Validate UI settings with detailed error reporting
    const uiValidation = preferencesService.validateUISettings(uiSettings);
    if (!uiValidation.success) {
      logger.warn('Invalid UI settings data format', { 
        requestId: req.id,
        errors: uiValidation.errors,
        receivedData: JSON.stringify(uiSettings).substring(0, 100) + '...'
      });
      
      return res.status(400).json({
        success: false,
        error: 'INVALID_UI_SETTINGS',
        message: 'UI settings validation failed',
        details: {
          errors: uiValidation.errors,
          validationFailed: Object.keys(uiValidation.errors || {}).length
        }
      });
    }

    // Load current preferences and update only UI settings
    const currentPreferences = await preferencesService.getPreferences();
    const updatedPreferences = {
      ...currentPreferences,
      uiSettings: uiSettings,
      lastUpdated: new Date().toISOString()
    };

    const saved = await preferencesService.savePreferences(updatedPreferences);
    
    if (saved) {
      logger.info('UI settings saved successfully', { requestId: req.id });
      res.json({
        success: true,
        message: 'UI settings saved successfully',
        uiSettings: uiSettings,
        lastUpdated: updatedPreferences.lastUpdated
      });
    } else {
      logger.error('Failed to save UI settings', { requestId: req.id });
      res.status(500).json({
        success: false,
        error: 'UI_SAVE_FAILED',
        message: 'Could not write UI settings to disk',
        details: 'There may be a permissions issue or disk space problem'
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
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/server-config - Return current server configuration
app.get('/api/server-config', (req, res) => {
  try {
    const config = {
      host: HOST,
      port: PORT,
      networkAccessible: HOST === '0.0.0.0',
      kioskMode: {
        enabled: process.env.KIOSK_MODE === 'true' || PlatformDetection.isRaspberryPi(),
        fullscreen: process.env.FULLSCREEN === 'true'
      }
    };
    
    logger.debug('Server configuration retrieved');
    
    res.json({
      success: true,
      config: config
    });
  } catch (error) {
    logger.error('Error getting server configuration', error);
    
    res.status(500).json({
      success: false,
      error: 'SERVER_CONFIG_ERROR',
      message: 'Failed to get server configuration',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// DELETE /api/preferences - Reset preferences to defaults
app.delete('/api/preferences', validatePreferencesRequest, async (req, res) => {
  try {
    const settingsPath = preferencesService.getPreferencesPath();
    
    // Try to delete the existing preferences file
    try {
      await fs.unlink(settingsPath);
      logger.info('Preferences file deleted for reset', { settingsPath });
    } catch (deleteError) {
      if (deleteError.code !== 'ENOENT') {
        // File exists but couldn't be deleted
        logger.warn('Could not delete preferences file for reset', { 
          settingsPath,
          error: deleteError.message 
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
        settingsPath: settingsPath
      });
    } else {
      logger.error('Failed to save default preferences after reset');
      res.status(500).json({
        success: false,
        error: 'RESET_SAVE_FAILED',
        message: 'Preferences were cleared but could not save defaults',
        preferences: defaultPreferences,
        settingsPath: settingsPath
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
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
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
      systemInfo: systemInfo
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
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      systemInfo: {
        platform: 'unknown',
        arch: 'unknown',
        isRaspberryPi: false
      }
    });
  }
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  logger.warn(`API endpoint not found: ${req.originalUrl}`, { 
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  
  res.status(404).json({
    success: false,
    error: 'ENDPOINT_NOT_FOUND',
    message: `The endpoint ${req.originalUrl} does not exist`,
    availableEndpoints: [
      '/api/health',
      '/api/audio-devices',
      '/api/preferences',
      '/api/preferences/ui',
      '/api/system-info'
    ]
  });
});



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
      platform: PlatformDetection.getCurrentPlatform()
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
      settingsPath: settingsPath
    });
    
    return { host: HOST, port: PORT, preferences };
  } catch (error) {
    // Log settings file location even on error for user reference
    try {
      const settingsPath = preferencesService.getPreferencesPath();
      logger.info('Settings file location', { 
        path: settingsPath,
        platform: PlatformDetection.getCurrentPlatform(),
        status: 'error_loading'
      });
      
      // Log settings file path to console during server startup even on error
      console.log(`Settings file location: ${settingsPath} (error loading)`);
    } catch (pathError) {
      logger.warn('Could not determine settings file path', { error: pathError.message });
    }
    
    logger.warn('Could not load preferences for server configuration, using defaults', {
      error: error.message,
      defaultHost: HOST,
      defaultPort: PORT
    });
    
    return { host: HOST, port: PORT, preferences: null };
  }
}

// Start server only if this file is run directly (not imported for testing)
if (require.main === module) {
  let server;
  
  // Load server configuration from preferences
  loadServerConfiguration().then(({ host, port, preferences }) => {
    HOST = host;
    PORT = port;
  
  // Try to start HTTPS server if certificates exist
  const httpsOptions = {
    key: null,
    cert: null
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
      server = https.createServer(httpsOptions, app).listen(PORT, HOST, () => {
        logger.info(`Pi Audio Kiosk HTTPS server running on ${HOST}:${PORT}`);
        logger.info(`Local access: https://localhost:${PORT}`);
        if (HOST === '0.0.0.0') {
          logger.info(`Network access: https://<your-ip>:${PORT}`);
          logger.info('Server is accessible from other devices on the network');
        }
        logger.info(`Platform: ${PlatformDetection.getCurrentPlatform()}`);
        logger.info(`Raspberry Pi: ${PlatformDetection.isRaspberryPi()}`);
        logger.info('HTTPS enabled - microphone permissions will be remembered');
        
        // Display settings file location in application logs for user reference
        const settingsPath = preferencesService.getPreferencesPath();
        logger.info(`Settings file: ${settingsPath}`);
        
        // Start performance monitoring on Raspberry Pi
        if (PlatformDetection.isRaspberryPi() || process.env.NODE_ENV === 'production') {
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
    } else {
      throw new Error('SSL certificates not found');
    }
  } catch (error) {
    // Fall back to HTTP server
    logger.warn(`Starting HTTP server: ${error.message}`);
    logger.warn('Note: Microphone permission dialog will appear each time in HTTP mode');
    
    server = app.listen(PORT, HOST, () => {
      logger.info(`Pi Audio Kiosk HTTP server running on ${HOST}:${PORT}`);
      logger.info(`Local access: http://localhost:${PORT}`);
      if (HOST === '0.0.0.0') {
        logger.info(`Network access: http://<your-ip>:${PORT}`);
        logger.info('Server is accessible from other devices on the network');
      }
      logger.info(`Platform: ${PlatformDetection.getCurrentPlatform()}`);
      logger.info(`Raspberry Pi: ${PlatformDetection.isRaspberryPi()}`);
      
      // Display settings file location in application logs for user reference
      const settingsPath = preferencesService.getPreferencesPath();
      logger.info(`Settings file: ${settingsPath}`);
      
      logger.info('');
      logger.info('To avoid microphone permission dialogs:');
      logger.info('1. Generate SSL certificates (see README)');
      logger.info('2. Or start browser with: --auto-accept-camera-and-microphone-capture-policy');
      
      // Start performance monitoring on Raspberry Pi
      if (PlatformDetection.isRaspberryPi() || process.env.NODE_ENV === 'production') {
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
        preferencesService.flush ? preferencesService.flush(5000) : Promise.resolve(true),
        // Close any open file handles or connections
        audioDeviceService.cleanup ? audioDeviceService.cleanup() : Promise.resolve()
      ];

      // Add timeout for entire cleanup process
      const cleanupTimeout = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Cleanup process timed out'));
        }, 10000); // 10 second timeout for all cleanup tasks
      });

      Promise.race([
        Promise.all(cleanupTasks),
        cleanupTimeout
      ]).then((results) => {
        // Log settings save result specifically
        if (results && results[1] !== undefined) {
          if (results[1]) {
            logger.info('Settings saved successfully during shutdown');
          } else {
            logger.warn('Settings save failed during shutdown, but continuing');
          }
        }
        
        logger.info('Cleanup completed successfully');
        process.exit(0);
      }).catch((cleanupError) => {
        if (cleanupError.message.includes('timed out')) {
          logger.error('Cleanup process timed out during shutdown', { error: cleanupError.message });
        } else {
          logger.error('Error during cleanup', cleanupError);
        }
        
        // Still attempt to log settings save failure specifically
        logger.warn('Shutdown cleanup failed, but attempting to preserve settings');
        process.exit(1);
      });
    });
    
    // Force shutdown after timeout if server doesn't close properly
    setTimeout(() => {
      logger.error('Forced shutdown after timeout - settings may not be saved');
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
          logger.info('Attempting emergency settings save due to uncaught exception');
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
  
  }).catch((configError) => {
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
      logger.info(`Pi Audio Kiosk server running on ${defaultHost}:${defaultPort} (default config)`);
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
  }
}

module.exports = app;