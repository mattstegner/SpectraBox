const { logger } = require('./logger');
const PlatformDetection = require('./platformDetection');

/**
 * Raspberry Pi Performance Optimizer
 * Applies Pi-specific optimizations when running on Raspberry Pi hardware
 */
class PiOptimizer {
  constructor() {
    this.isPi = PlatformDetection.isRaspberryPi();
    this.optimizationsApplied = false;
    this.gcInterval = null;
  }

  /**
   * Apply all Pi-specific optimizations
   */
  applyOptimizations() {
    if (!this.isPi || this.optimizationsApplied) {
      return;
    }

    logger.info('Applying Raspberry Pi performance optimizations');

    // 1. Memory management
    this.setupMemoryOptimizations();

    // 2. Process optimizations
    this.setupProcessOptimizations();

    // 3. Garbage collection
    this.setupGarbageCollection();

    this.optimizationsApplied = true;
    logger.info('Raspberry Pi optimizations applied successfully');
  }

  /**
   * Setup memory-specific optimizations
   */
  setupMemoryOptimizations() {
    // Reduce memory pressure
    if (process.env.NODE_ENV === 'production') {
      process.env.NODE_OPTIONS = process.env.NODE_OPTIONS || '--max-old-space-size=256';
    }

    // Monitor memory usage
    setInterval(() => {
      const usage = process.memoryUsage();
      const rss = Math.round(usage.rss / 1024 / 1024);
      
      if (rss > 200) {
        logger.warn(`High memory usage on Pi: ${rss}MB`);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
          logger.info('Forced garbage collection due to high memory usage');
        }
      }
    }, 60000); // Check every minute
  }

  /**
   * Setup process-level optimizations
   */
  setupProcessOptimizations() {
    // Reduce thread pool size
    process.env.UV_THREADPOOL_SIZE = '2';

    // Set process priority (if possible)
    try {
      process.setpriority(0, -5); // Slightly higher priority
    } catch (error) {
      logger.debug('Could not set process priority:', error.message);
    }

    // Handle process warnings
    process.on('warning', (warning) => {
      if (warning.name === 'MaxListenersExceededWarning') {
        logger.warn('MaxListenersExceededWarning detected - potential memory leak');
      }
    });
  }

  /**
   * Setup garbage collection optimizations
   */
  setupGarbageCollection() {
    if (global.gc) {
      // Force GC every 30 seconds on Pi
      this.gcInterval = setInterval(() => {
        global.gc();
        logger.debug('Performed scheduled garbage collection');
      }, 30000);

      logger.info('Scheduled garbage collection enabled (30s intervals)');
    } else {
      logger.warn('Garbage collection not available - run with --expose-gc for better Pi performance');
    }
  }

  /**
   * Get Pi-specific configuration recommendations
   */
  getRecommendedConfig() {
    if (!this.isPi) {
      return null;
    }

    return {
      audio: {
        fftSize: 2048, // Reduced from 4096
        bufferSize: 1024,
        sampleRate: 44100,
        meterUpdateInterval: 250 // Slower updates
      },
      ui: {
        maxFPS: 30, // Reduced from 60
        disableAnimations: true,
        simplifiedRendering: true
      },
      server: {
        requestLimit: '256kb',
        keepAliveTimeout: 5000,
        maxConnections: 10
      }
    };
  }

  /**
   * Cleanup optimizations
   */
  cleanup() {
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
    }
  }

  /**
   * Get optimization status
   */
  getStatus() {
    return {
      isPi: this.isPi,
      optimizationsApplied: this.optimizationsApplied,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };
  }
}

module.exports = PiOptimizer;