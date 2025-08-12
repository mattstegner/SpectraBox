const { logger } = require('./logger');

class PerformanceMonitor {
  constructor() {
    this.startTime = Date.now();
    this.requestCount = 0;
    this.errorCount = 0;
    this.monitoringInterval = null;
  }

  /**
   * Start performance monitoring
   * @param {number} intervalMs - Monitoring interval in milliseconds (default: 60000 = 1 minute)
   */
  start(intervalMs = 60000) {
    logger.info('Starting performance monitoring', { interval: intervalMs });
    
    this.monitoringInterval = setInterval(() => {
      this.logPerformanceMetrics();
    }, intervalMs);

    // Log initial metrics
    this.logPerformanceMetrics();
  }

  /**
   * Stop performance monitoring
   */
  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Performance monitoring stopped');
    }
  }

  /**
   * Increment request counter
   */
  incrementRequests() {
    this.requestCount++;
  }

  /**
   * Increment error counter
   */
  incrementErrors() {
    this.errorCount++;
  }

  /**
   * Get current memory usage
   */
  getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100, // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100, // MB
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100, // MB
      external: Math.round(usage.external / 1024 / 1024 * 100) / 100, // MB
      arrayBuffers: Math.round(usage.arrayBuffers / 1024 / 1024 * 100) / 100 // MB
    };
  }

  /**
   * Get CPU usage (approximation)
   */
  getCPUUsage() {
    const usage = process.cpuUsage();
    return {
      user: Math.round(usage.user / 1000), // milliseconds
      system: Math.round(usage.system / 1000) // milliseconds
    };
  }

  /**
   * Get uptime statistics
   */
  getUptimeStats() {
    const uptime = Date.now() - this.startTime;
    return {
      uptimeMs: uptime,
      uptimeSeconds: Math.round(uptime / 1000),
      uptimeMinutes: Math.round(uptime / 1000 / 60),
      uptimeHours: Math.round(uptime / 1000 / 60 / 60 * 100) / 100
    };
  }

  /**
   * Get request statistics
   */
  getRequestStats() {
    const uptime = Date.now() - this.startTime;
    const requestsPerMinute = this.requestCount / (uptime / 1000 / 60);
    
    return {
      totalRequests: this.requestCount,
      totalErrors: this.errorCount,
      errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount * 100) : 0,
      requestsPerMinute: Math.round(requestsPerMinute * 100) / 100
    };
  }

  /**
   * Log comprehensive performance metrics
   */
  logPerformanceMetrics() {
    const memory = this.getMemoryUsage();
    const cpu = this.getCPUUsage();
    const uptime = this.getUptimeStats();
    const requests = this.getRequestStats();

    logger.info('Performance metrics', {
      memory: {
        rss: `${memory.rss}MB`,
        heapUsed: `${memory.heapUsed}MB`,
        heapTotal: `${memory.heapTotal}MB`,
        external: `${memory.external}MB`
      },
      cpu: {
        user: `${cpu.user}ms`,
        system: `${cpu.system}ms`
      },
      uptime: {
        hours: uptime.uptimeHours,
        minutes: uptime.uptimeMinutes
      },
      requests: {
        total: requests.totalRequests,
        errors: requests.totalErrors,
        errorRate: `${Math.round(requests.errorRate * 100) / 100}%`,
        perMinute: requests.requestsPerMinute
      }
    });

    // Warn if memory usage is high (for Raspberry Pi)
    if (memory.rss > 200) {
      logger.warn('High memory usage detected', { rss: `${memory.rss}MB` });
    }

    // Warn if error rate is high
    if (requests.errorRate > 5) {
      logger.warn('High error rate detected', { errorRate: `${requests.errorRate}%` });
    }
  }

  /**
   * Get all performance data
   */
  getAllMetrics() {
    return {
      memory: this.getMemoryUsage(),
      cpu: this.getCPUUsage(),
      uptime: this.getUptimeStats(),
      requests: this.getRequestStats()
    };
  }
}

module.exports = PerformanceMonitor;