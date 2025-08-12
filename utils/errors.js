/**
 * Custom error classes for standardized error handling
 */

/**
 * Base application error class
 */
class AppError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code || 'APP_ERROR';
    this.statusCode = options.statusCode || 500;
    this.details = options.details || {};
    this.originalError = options.originalError;
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  /**
   * Convert error to JSON-serializable object
   * @returns {object} Error details
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      stack: process.env.NODE_ENV === 'development' ? this.stack : undefined
    };
  }
}

/**
 * Error for validation failures
 */
class ValidationError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      code: options.code || 'VALIDATION_ERROR',
      statusCode: options.statusCode || 400,
      details: options.details,
      originalError: options.originalError
    });
  }
}

/**
 * Error for resource not found
 */
class NotFoundError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      code: options.code || 'NOT_FOUND',
      statusCode: options.statusCode || 404,
      details: options.details,
      originalError: options.originalError
    });
  }
}

/**
 * Error for permission issues
 */
class PermissionError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      code: options.code || 'PERMISSION_DENIED',
      statusCode: options.statusCode || 403,
      details: options.details,
      originalError: options.originalError
    });
  }
}

/**
 * Error for configuration issues
 */
class ConfigurationError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      code: options.code || 'CONFIG_ERROR',
      statusCode: options.statusCode || 500,
      details: options.details,
      originalError: options.originalError
    });
  }
}

/**
 * Error for external service/dependency issues
 */
class ExternalServiceError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      code: options.code || 'EXTERNAL_SERVICE_ERROR',
      statusCode: options.statusCode || 502,
      details: options.details,
      originalError: options.originalError
    });
  }
}

/**
 * Create an appropriate error instance based on error code or type
 * @param {Error|string} error - Original error or error message
 * @param {object} options - Error options
 * @returns {AppError} Appropriate error instance
 */
function createError(error, options = {}) {
  const message = error instanceof Error ? error.message : error;
  const code = (error instanceof Error && error.code) || options.code;
  const originalError = error instanceof Error ? error : undefined;
  
  const errorOptions = {
    ...options,
    code,
    originalError
  };
  
  // Determine appropriate error type based on code or status
  if (code === 'ENOENT' || options.statusCode === 404) {
    return new NotFoundError(message, errorOptions);
  } else if (code === 'EACCES' || code === 'EPERM' || options.statusCode === 403) {
    return new PermissionError(message, errorOptions);
  } else if (code === 'VALIDATION_ERROR' || options.statusCode === 400) {
    return new ValidationError(message, errorOptions);
  } else if (code && code.includes('CONFIG')) {
    return new ConfigurationError(message, errorOptions);
  } else if (options.isExternal) {
    return new ExternalServiceError(message, errorOptions);
  }
  
  // Default to base AppError
  return new AppError(message, errorOptions);
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  PermissionError,
  ConfigurationError,
  ExternalServiceError,
  createError
};