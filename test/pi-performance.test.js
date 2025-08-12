const request = require('supertest');
const { spawn } = require('child_process');
const os = require('os');
const app = require('../server');
const PerformanceMonitor = require('../utils/performanceMonitor');
const PlatformDetection = require('../utils/platformDetection');

describe('Raspberry Pi Performance Tests', () => {
  let server;
  let performanceMonitor;

  beforeAll((done) => {
    server = app.listen(0, () => {
      performanceMonitor = new PerformanceMonitor();
      done();
    });
  });

  afterAll((done) => {
    if (performanceMonitor) {
      performanceMonitor.stop();
    }
    server.close(done);
  });

  describe('Memory Usage', () => {
    test('should maintain reasonable memory usage', () => {
      const memory = performanceMonitor.getMemoryUsage();
      
      // Memory usage should be under 200MB for Raspberry Pi
      expect(memory.rss).toBeLessThan(200);
      expect(memory.heapUsed).toBeLessThan(100);
      
      console.log('Memory usage:', {
        rss: `${memory.rss}MB`,
        heapUsed: `${memory.heapUsed}MB`,
        heapTotal: `${memory.heapTotal}MB`
      });
    });

    test('should not have memory leaks after multiple requests', async () => {
      const initialMemory = performanceMonitor.getMemoryUsage();
      
      // Make multiple requests to test for memory leaks
      const requests = Array(50).fill().map(() => 
        request(app).get('/api/health').expect(200)
      );
      
      await Promise.all(requests);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const finalMemory = performanceMonitor.getMemoryUsage();
      
      // Memory should not increase significantly (allow 20MB variance in test environment)
      const memoryIncrease = finalMemory.rss - initialMemory.rss;
      expect(memoryIncrease).toBeLessThan(20);
      
      console.log('Memory change after 50 requests:', {
        initial: `${initialMemory.rss}MB`,
        final: `${finalMemory.rss}MB`,
        increase: `${memoryIncrease}MB`
      });
    });
  });

  describe('Response Performance', () => {
    test('should respond to health check quickly', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/api/health')
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      
      // Response should be under 100ms
      expect(responseTime).toBeLessThan(100);
      expect(response.body.status).toBe('OK');
      
      console.log('Health check response time:', `${responseTime}ms`);
    });

    test('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 10;
      const startTime = Date.now();
      
      const requests = Array(concurrentRequests).fill().map(() =>
        request(app).get('/api/health').expect(200)
      );
      
      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;
      const avgTime = totalTime / concurrentRequests;
      
      // Average response time should be reasonable
      expect(avgTime).toBeLessThan(50);
      expect(responses).toHaveLength(concurrentRequests);
      
      console.log('Concurrent requests performance:', {
        requests: concurrentRequests,
        totalTime: `${totalTime}ms`,
        avgTime: `${avgTime}ms`
      });
    });
  });

  describe('Resource Optimization', () => {
    test('should have proper cache headers for static files', async () => {
      const response = await request(app)
        .get('/index.html')
        .expect(200);
      
      // Should have cache headers in production-like environment
      if (process.env.NODE_ENV === 'production') {
        expect(response.headers['cache-control']).toBeDefined();
        expect(response.headers['etag']).toBeDefined();
      }
    });

    test('should limit JSON payload size', async () => {
      const largePayload = {
        preferences: {
          data: 'x'.repeat(1024 * 1024) // 1MB of data
        }
      };
      
      // Should reject payloads larger than 512KB
      await request(app)
        .post('/api/preferences')
        .send(largePayload)
        .expect(413); // Payload too large
    });

    test('should have performance monitoring enabled', () => {
      const metrics = performanceMonitor.getAllMetrics();
      
      expect(metrics).toHaveProperty('memory');
      expect(metrics).toHaveProperty('cpu');
      expect(metrics).toHaveProperty('uptime');
      expect(metrics).toHaveProperty('requests');
      
      expect(metrics.memory.rss).toBeGreaterThan(0);
      expect(metrics.uptime.uptimeMs).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle errors gracefully without memory spikes', async () => {
      const initialMemory = performanceMonitor.getMemoryUsage();
      
      // Generate multiple errors
      const errorRequests = Array(20).fill().map(() =>
        request(app).get('/api/nonexistent').expect(404)
      );
      
      await Promise.all(errorRequests);
      
      const finalMemory = performanceMonitor.getMemoryUsage();
      const memoryIncrease = finalMemory.rss - initialMemory.rss;
      
      // Memory increase should be minimal even with errors (allow 10MB in test environment)
      expect(memoryIncrease).toBeLessThan(10);
      
      console.log('Memory impact of errors:', {
        errors: errorRequests.length,
        memoryIncrease: `${memoryIncrease}MB`
      });
    });
  });

  describe('Metrics Endpoint', () => {
    test('should provide performance metrics', async () => {
      const response = await request(app)
        .get('/api/metrics')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.metrics).toBeDefined();
      expect(response.body.metrics.memory).toBeDefined();
      expect(response.body.metrics.uptime).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
      
      // Verify memory metrics are reasonable
      const memory = response.body.metrics.memory;
      expect(memory.rss).toBeGreaterThan(0);
      expect(memory.rss).toBeLessThan(500); // Should be well under 500MB
    });
  });
});

describe('Raspberry Pi Specific Tests', () => {
  test('should detect platform correctly', () => {
    const platform = PlatformDetection.getCurrentPlatform();
    expect(platform).toBeDefined();
    expect(typeof platform).toBe('string');
    
    const isRaspberryPi = PlatformDetection.isRaspberryPi();
    expect(typeof isRaspberryPi).toBe('boolean');
    
    console.log('Platform detection:', {
      platform,
      isRaspberryPi
    });
  });

  test('should have appropriate configuration for limited resources', () => {
    // Check if memory limits are set appropriately
    if (process.env.NODE_ENV === 'production') {
      expect(process.env.NODE_OPTIONS).toContain('max-old-space-size');
    }
    
    // Check thread pool size optimization
    if (process.env.NODE_ENV === 'production') {
      expect(process.env.UV_THREADPOOL_SIZE).toBe('2');
    }
  });

  test('should optimize for ARM architecture if on Raspberry Pi', () => {
    const isRaspberryPi = PlatformDetection.isRaspberryPi();
    const arch = os.arch();
    
    if (isRaspberryPi) {
      expect(['arm', 'arm64']).toContain(arch);
      console.log(`Running on Raspberry Pi with ${arch} architecture`);
    }
  });

  test('should handle limited CPU cores efficiently', () => {
    const cpuCount = os.cpus().length;
    const isRaspberryPi = PlatformDetection.isRaspberryPi();
    
    if (isRaspberryPi) {
      // Raspberry Pi typically has 1-4 cores
      expect(cpuCount).toBeGreaterThanOrEqual(1);
      expect(cpuCount).toBeLessThanOrEqual(4);
    }
    
    console.log(`CPU cores available: ${cpuCount}`);
  });
});

describe('Audio Device Performance Tests', () => {
  test('should enumerate devices quickly', async () => {
    const startTime = Date.now();
    
    const response = await request(app)
      .get('/api/audio-devices')
      .expect(200);
    
    const enumerationTime = Date.now() - startTime;
    
    // Device enumeration should be fast (under 2 seconds even on Pi)
    expect(enumerationTime).toBeLessThan(2000);
    expect(response.body.success).toBe(true);
    
    console.log(`Audio device enumeration time: ${enumerationTime}ms`);
  });

  test('should cache device information for performance', async () => {
    // First request (cold cache)
    const startTime1 = Date.now();
    await request(app).get('/api/audio-devices').expect(200);
    const firstRequestTime = Date.now() - startTime1;
    
    // Second request (warm cache)
    const startTime2 = Date.now();
    await request(app).get('/api/audio-devices').expect(200);
    const secondRequestTime = Date.now() - startTime2;
    
    // Second request should be faster due to caching
    expect(secondRequestTime).toBeLessThanOrEqual(firstRequestTime);
    
    console.log('Device enumeration performance:', {
      firstRequest: `${firstRequestTime}ms`,
      secondRequest: `${secondRequestTime}ms`,
      improvement: `${Math.round((1 - secondRequestTime/firstRequestTime) * 100)}%`
    });
  });
});

describe('Stress Testing', () => {
  test('should handle rapid API requests without degradation', async () => {
    const requestCount = 100;
    const requests = [];
    const startTime = Date.now();
    
    // Fire off many concurrent requests
    for (let i = 0; i < requestCount; i++) {
      requests.push(request(app).get('/api/health'));
    }
    
    const responses = await Promise.all(requests);
    const totalTime = Date.now() - startTime;
    const avgTime = totalTime / requestCount;
    
    // All requests should succeed
    responses.forEach(response => {
      expect(response.status).toBe(200);
    });
    
    // Average response time should be reasonable
    expect(avgTime).toBeLessThan(100);
    
    console.log(`Stress test results: ${requestCount} requests in ${totalTime}ms (avg: ${avgTime}ms)`);
  });

  test('should maintain performance under sustained load', async () => {
    const duration = 10000; // 10 seconds
    const interval = 100; // Request every 100ms
    const startTime = Date.now();
    const responseTimes = [];
    
    while (Date.now() - startTime < duration) {
      const reqStart = Date.now();
      await request(app).get('/api/health').expect(200);
      const reqTime = Date.now() - reqStart;
      responseTimes.push(reqTime);
      
      // Wait for next interval
      await new Promise(resolve => setTimeout(resolve, interval - reqTime));
    }
    
    // Calculate statistics
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const maxResponseTime = Math.max(...responseTimes);
    const minResponseTime = Math.min(...responseTimes);
    
    // Performance should remain consistent
    expect(avgResponseTime).toBeLessThan(50);
    expect(maxResponseTime).toBeLessThan(200);
    
    console.log('Sustained load test results:', {
      requests: responseTimes.length,
      avgTime: `${Math.round(avgResponseTime)}ms`,
      minTime: `${minResponseTime}ms`,
      maxTime: `${maxResponseTime}ms`
    });
  });
});

describe('Memory Leak Detection', () => {
  test('should not leak memory during normal operation', async () => {
    const initialMemory = process.memoryUsage();
    
    // Perform many operations
    for (let i = 0; i < 1000; i++) {
      await request(app).get('/api/health');
      
      if (i % 100 === 0) {
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }
    }
    
    // Final garbage collection
    if (global.gc) {
      global.gc();
    }
    
    const finalMemory = process.memoryUsage();
    const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
    const memoryGrowthMB = memoryGrowth / 1024 / 1024;
    
    // Memory growth should be minimal (less than 10MB)
    expect(memoryGrowthMB).toBeLessThan(10);
    
    console.log('Memory leak test results:', {
      initialHeap: `${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB`,
      finalHeap: `${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`,
      growth: `${Math.round(memoryGrowthMB)}MB`
    });
  });
});