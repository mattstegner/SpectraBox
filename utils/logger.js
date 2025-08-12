/**
 * Logger utility for structured logging and error handling
 * Provides consistent logging format and levels across the application
 */
class Logger {
  constructor(options = {}) {
    this.options = {
      level: options.level || process.env.LOG_LEVEL || 'info',
      prefix: options.prefix || '',
      timestamp: options.timestamp !== false,
      colorize: options.colorize !== false && process.stdout.isTTY,
      ...options
    };

    // Log levels with numeric values for comparison
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4
    };

    // ANSI color codes for terminal output
    this.colors = {
      error: '\x1b[31m', // Red
      warn: '\x1b[33m',  // Yellow
      info: '\x1b[36m',  // Cyan
      debug: '\x1b[35m', // Magenta
      trace: '\x1b[90m', // Gray
      reset: '\x1b[0m'   // Reset
    };
  }

  /**
   * Check if the given log level should be logged
   * @param {string} level - Log level to check
   * @returns {boolean} True if the level should be logged
   */
  shouldLog(level) {
    return this.levels[level] <= this.levels[this.options.level];
  }

  /**
   * Format a log message with timestamp and prefix
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @returns {string} Formatted log message
   */
  formatMessage(level, message) {
    let formattedMessage = '';
    
    // Add timestamp if enabled
    if (this.options.timestamp) {
      formattedMessage += `[${new Date().toISOString()}] `;
    }
    
    // Add log level
    formattedMessage += `[${level.toUpperCase()}] `;
    
    // Add prefix if specified
    if (this.options.prefix) {
      formattedMessage += `[${this.options.prefix}] `;
    }
    
    // Add message
    formattedMessage += message;
    
    // Add color if enabled
    if (this.options.colorize) {
      return `${this.colors[level]}${formattedMessage}${this.colors.reset}`;
    }
    
    return formattedMessage;
  }

  /**
   * Log an error message
   * @param {string} message - Error message
   * @param {Error|object} [error] - Error object or additional data
   */
  error(message, error) {
    if (!this.shouldLog('error')) return;
    
    console.error(this.formatMessage('error', message));
    
    if (error) {
      if (error instanceof Error) {
        console.error(this.formatMessage('error', `Stack: ${error.stack}`));
      } else {
        console.error(this.formatMessage('error', `Details: ${JSON.stringify(error)}`));
      }
    }
  }

  /**
   * Log a warning message
   * @param {string} message - Warning message
   * @param {object} [data] - Additional data
   */
  warn(message, data) {
    if (!this.shouldLog('warn')) return;
    
    console.warn(this.formatMessage('warn', message));
    
    if (data) {
      console.warn(this.formatMessage('warn', `Details: ${JSON.stringify(data)}`));
    }
  }

  /**
   * Log an info message
   * @param {string} message - Info message
   * @param {object} [data] - Additional data
   */
  info(message, data) {
    if (!this.shouldLog('info')) return;
    
    console.info(this.formatMessage('info', message));
    
    if (data) {
      console.info(this.formatMessage('info', `Details: ${JSON.stringify(data)}`));
    }
  }

  /**
   * Log a debug message
   * @param {string} message - Debug message
   * @param {object} [data] - Additional data
   */
  debug(message, data) {
    if (!this.shouldLog('debug')) return;
    
    console.debug(this.formatMessage('debug', message));
    
    if (data) {
      console.debug(this.formatMessage('debug', `Details: ${JSON.stringify(data)}`));
    }
  }

  /**
   * Log a trace message
   * @param {string} message - Trace message
   * @param {object} [data] - Additional data
   */
  trace(message, data) {
    if (!this.shouldLog('trace')) return;
    
    console.debug(this.formatMessage('trace', message));
    
    if (data) {
      console.debug(this.formatMessage('trace', `Details: ${JSON.stringify(data)}`));
    }
  }

  /**
   * Create a child logger with a specific prefix
   * @param {string} prefix - Logger prefix
   * @returns {Logger} New logger instance with prefix
   */
  child(prefix) {
    return new Logger({
      ...this.options,
      prefix: this.options.prefix 
        ? `${this.options.prefix}:${prefix}`
        : prefix
    });
  }
}

// Create default logger instance
const defaultLogger = new Logger();

module.exports = {
  Logger,
  logger: defaultLogger,
  // Convenience exports for direct use
  error: (...args) => defaultLogger.error(...args),
  warn: (...args) => defaultLogger.warn(...args),
  info: (...args) => defaultLogger.info(...args),
  debug: (...args) => defaultLogger.debug(...args),
  trace: (...args) => defaultLogger.trace(...args),
  child: (prefix) => defaultLogger.child(prefix)
};