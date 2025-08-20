const request = require('supertest');
const app = require('../server');
const PiOptimizer = require('../utils/piOptimizer');

describe('Raspberry Pi Optimizations', () => {
  let server;
  let piOptimizer;

  beforeAll((done) => {
    server = app.listen(0, () => {
      piOptimizer = new PiOptimizer();
      done();
    });
  });

  afterAll((done) => {
    if (piOptimizer) {
      piOptimizer.cleanup();
    }
    server.close(done);
  });

  describe('Pi Detection', () => {
    test('should detect platform correctly', () => {
      const status = piOptimizer.getStatus();
      expect(status).toHaveProperty('isPi');
      expect(typeof status.isPi).toBe('boolean');
    });

    test('should provide recommended config for Pi', () => {
      const config = piOptimizer.getRecommendedConfig();
      
      if (piOptimizer.getStatus().isPi) {
        expect(config).toBeTruthy();
        expect(config).toHaveProperty('audio');
        expect(config).toHaveProperty('ui');
        expect(config).toHaveProperty('server');
        expect(config.ui.maxFPS).toBeLessThanOrEqual(30);
      }
    });
  });

  describe('Performance Optimizations', () => {
    test('should apply optimizations when on Pi', () => {
      piOptimizer.applyOptimizations();
      const status = piOptimizer.getStatus();
      
      if (status.isPi) {
        expect(status.optimizationsApplied).toBe(true);
      }
    });

    test('should have Pi status endpoint', async () => {
      const response = await request(server)
        .get('/api/pi-status')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toHaveProperty('isPi');
    });
  });

  describe('Memory Management', () => {
    test('should monitor memory usage', () => {
      const status = piOptimizer.getStatus();
      expect(status).toHaveProperty('memoryUsage');
      expect(status.memoryUsage).toHaveProperty('rss');
      expect(status.memoryUsage).toHaveProperty('heapUsed');
    });

    test('should have reasonable memory limits on Pi', () => {
      const status = piOptimizer.getStatus();
      
      if (status.isPi) {
        // Memory should be under 300MB for Pi
        const memoryMB = status.memoryUsage.rss / 1024 / 1024;
        expect(memoryMB).toBeLessThan(300);
      }
    });
  });

  describe('Health Check Integration', () => {
    test('should include Pi status in health check', async () => {
      const response = await request(server)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('platform');
      expect(response.body.platform).toHaveProperty('isPi');
      expect(response.body.platform).toHaveProperty('optimized');
    });
  });
});