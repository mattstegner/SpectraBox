/**
 * Comprehensive Integration Tests
 * Tests complete system integration across all components
 */

const request = require('supertest');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises;
const app = require('../server');
const AudioDeviceService = require('../services/audioDeviceService');
const { PreferencesService } = require('../services/preferencesService');
const PlatformDetection = require('../utils/platformDetection');

describe('Comprehensive Integration Tests', () => {
  let server;
  let serverPort;
  let browser;
  let page;
  let audioDeviceService;
  let preferencesService;

  beforeAll(async () => {
    // Start server
    server = app.listen(0);
    serverPort = server.address().port;
    
    // Initialize services
    audioDeviceService = new AudioDeviceService();
    preferencesService = new PreferencesService();
    
    // Launch browser for E2E tests
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });
  });

  afterAll(async () => {
    if (browser) await browser.close();
    if (server) server.close();
  });

  beforeEach(async () => {
    // Reset preferences
    const defaultPrefs = preferencesService.getDefaultPreferences();
    await preferencesService.savePreferences(defaultPrefs);
    
    // Create fresh page
    if (page) await page.close();
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  describe('Full System Workflow Integration', () => {
    test('should complete full user workflow from startup to audio analysis', async () => {
      // 1. Navigate to application
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      // 2. Verify initial load
      const title = await page.title();
      expect(title).toContain('Pi Audio Kiosk');

      // 3. Wait for audio devices to load
      await page.waitForSelector('#audio-device-selector option', { timeout: 10000 });
      
      // 4. Get available devices
      const deviceOptions = await page.$$eval('#audio-device-selector option', 
        options => options.map(opt => ({ value: opt.value, text: opt.textContent }))
      );
      expect(deviceOptions.length).toBeGreaterThan(0);

      // 5. Select a device if multiple available
      if (deviceOptions.length > 1) {
        await page.select('#audio-device-selector', deviceOptions[1].value);
        await page.waitForTimeout(1000); // Allow save
      }

      // 6. Start spectrum analyzer
      await page.click('#start-button');
      await page.waitForTimeout(2000);

      // 7. Verify analyzer is running
      const isRunning = await page.evaluate(() => {
        return window.spectrumAnalyzer && window.spectrumAnalyzer.isRunning;
      });
      expect(isRunning).toBe(true);

      // 8. Check canvas is updating
      const canvasHasData = await page.evaluate(() => {
        const canvas = document.getElementById('spectrum-canvas');
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return Array.from(imageData.data).some(pixel => pixel > 0);
      });
      expect(canvasHasData).toBe(true);

      // 9. Stop analyzer
      await page.click('#stop-button');
      await page.waitForTimeout(1000);

      // 10. Verify analyzer stopped
      const isStopped = await page.evaluate(() => {
        return !window.spectrumAnalyzer || !window.spectrumAnalyzer.isRunning;
      });
      expect(isStopped).toBe(true);
    });

    test('should persist preferences across browser sessions', async () => {
      // First session - set preferences
      await page.goto(`http://localhost:${serverPort}`, { waitUntil: 'networkidle0' });
      
      await page.waitForSelector('#audio-device-selector option', { timeout: 5000 });
      const deviceOptions = await page.$$eval('#audio-device-selector option', 
        options => options.map(opt => ({ value: opt.value, text: opt.textContent }))
      );

      if (deviceOptions.length > 1) {
        const selectedDevice = deviceOptions[1];
        await page.select('#audio-device-selector', selectedDevice.value);
        await page.waitForTimeout(1000);

        // Open settings and change theme
        await page.click('#settings-button');
        await page.waitForSelector('#theme-toggle', { timeout: 5000 });
        await page.click('#theme-toggle');
        await page.click('#save-settings-button');
        await page.waitForTimeout(1000);

        // Close browser and create new session
        await page.close();
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        
        // Second session - verify persistence
        await page.goto(`http://localhost:${serverPort}`, { waitUntil: 'networkidle0' });
        await page.waitForSelector('#audio-device-selector option', { timeout: 5000 });

        const selectedValue = await page.$eval('#audio-device-selector', el => el.value);
        expect(selectedValue).toBe(selectedDevice.value);

        const bodyClass = await page.$eval('body', el => el.className);
        expect(bodyClass).toContain('light-theme');
      }
    });
  });

  describe('API and Frontend Integration', () => {
    test('should synchronize API data with frontend display', async () => {
      // Get devices from API
      const apiResponse = await request(app)
        .get('/api/audio-devices')
        .expect(200);

      // Load frontend
      await page.goto(`http://localhost:${serverPort}`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('#audio-device-selector option', { timeout: 5000 });

      // Get devices from frontend
      const frontendDevices = await page.$$eval('#audio-device-selector option', 
        options => options.map(opt => ({ value: opt.value, text: opt.textContent }))
      );

      // Compare counts
      expect(frontendDevices.length).toBe(apiResponse.body.devices.length);

      // Compare device IDs
      const apiDeviceIds = apiResponse.body.devices.map(d => d.id);
      const frontendDeviceIds = frontendDevices.map(d => d.value);
      
      for (const apiId of apiDeviceIds) {
        expect(frontendDeviceIds).toContain(apiId);
      }
    });

    test('should handle API errors gracefully in frontend', async () => {
      // Start with working API
      await page.goto(`http://localhost:${serverPort}`, { waitUntil: 'networkidle0' });
      
      // Intercept API requests to simulate errors
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (request.url().includes('/api/audio-devices')) {
          request.respond({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ success: false, error: 'Server error' })
          });
        } else {
          request.continue();
        }
      });

      // Reload to trigger error
      await page.reload({ waitUntil: 'networkidle0' });

      // Check for error handling
      await page.waitForSelector('.error-message', { timeout: 5000 });
      const errorText = await page.$eval('.error-message', el => el.textContent);
      expect(errorText).toContain('error');
    });
  });

  describe('Cross-Platform System Integration', () => {
    test('should work consistently across different platforms', async () => {
      const platform = PlatformDetection.getCurrentPlatform();
      
      // Test system info endpoint
      const systemResponse = await request(app)
        .get('/api/system-info')
        .expect(200);

      expect(systemResponse.body.systemInfo.platform).toBe(platform);

      // Test audio device enumeration
      const devicesResponse = await request(app)
        .get('/api/audio-devices')
        .expect(200);

      expect(devicesResponse.body.success).toBe(true);
      
      // Verify platform-specific device properties
      for (const device of devicesResponse.body.devices) {
        if (platform === 'darwin') {
          expect(device.platform).toBe('macos');
        } else if (platform === 'linux') {
          expect(device.platform).toBe('linux');
        }
      }
    });

    test('should handle platform-specific file operations', async () => {
      const testPrefs = {
        selectedAudioDevice: 'test-device',
        audioSettings: { sampleRate: 44100, bufferSize: 1024, gain: 1.0 },
        uiSettings: { theme: 'dark', autoStart: true, fullscreen: false },
        systemSettings: { port: 3000, host: '0.0.0.0' },
        lastUpdated: new Date().toISOString()
      };

      // Save via API
      const saveResponse = await request(app)
        .post('/api/preferences')
        .send({ preferences: testPrefs })
        .expect(200);

      expect(saveResponse.body.success).toBe(true);

      // Load via API
      const loadResponse = await request(app)
        .get('/api/preferences')
        .expect(200);

      expect(loadResponse.body.success).toBe(true);
      expect(loadResponse.body.preferences.selectedAudioDevice).toBe('test-device');
    });
  });

  describe('Performance Integration', () => {
    test('should maintain performance under realistic load', async () => {
      const startTime = Date.now();
      
      // Simulate multiple users
      const userSessions = [];
      for (let i = 0; i < 3; i++) {
        const userPage = await browser.newPage();
        await userPage.goto(`http://localhost:${serverPort}`);
        userSessions.push(userPage);
      }

      // All users start spectrum analyzer
      for (const userPage of userSessions) {
        await userPage.waitForSelector('#start-button', { timeout: 5000 });
        await userPage.click('#start-button');
      }

      // Let run for a few seconds
      await page.waitForTimeout(5000);

      // Check all are still running
      for (const userPage of userSessions) {
        const isRunning = await userPage.evaluate(() => {
          return window.spectrumAnalyzer && window.spectrumAnalyzer.isRunning;
        });
        expect(isRunning).toBe(true);
      }

      // Cleanup
      for (const userPage of userSessions) {
        await userPage.close();
      }

      const totalTime = Date.now() - startTime;
      expect(totalTime).toBeLessThan(15000); // Should complete in under 15 seconds
    });

    test('should handle rapid API requests without degradation', async () => {
      const requestCount = 50;
      const requests = [];
      
      for (let i = 0; i < requestCount; i++) {
        requests.push(request(app).get('/api/health'));
      }

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should be reasonably fast
      expect(totalTime).toBeLessThan(5000);
      console.log(`${requestCount} API requests completed in ${totalTime}ms`);
    });
  });

  describe('Error Recovery Integration', () => {
    test('should recover from temporary network issues', async () => {
      await page.goto(`http://localhost:${serverPort}`, { waitUntil: 'networkidle0' });
      
      // Start analyzer
      await page.waitForSelector('#start-button', { timeout: 5000 });
      await page.click('#start-button');
      await page.waitForTimeout(1000);

      // Simulate network interruption
      await page.setRequestInterception(true);
      let blockRequests = true;
      
      page.on('request', (request) => {
        if (blockRequests && request.url().includes('/api/')) {
          request.abort();
        } else {
          request.continue();
        }
      });

      // Try to change device (should fail)
      await page.select('#audio-device-selector', 'test-device');
      await page.waitForTimeout(1000);

      // Restore network
      blockRequests = false;

      // Try again (should work)
      await page.select('#audio-device-selector', 'test-device');
      await page.waitForTimeout(2000);

      // Should still be functional
      const isRunning = await page.evaluate(() => {
        return window.spectrumAnalyzer && window.spectrumAnalyzer.isRunning;
      });
      expect(isRunning).toBe(true);
    });

    test('should handle service restart gracefully', async () => {
      // Load initial page
      await page.goto(`http://localhost:${serverPort}`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('#audio-device-selector', { timeout: 5000 });

      // Restart server (simulate service restart)
      server.close();
      await page.waitForTimeout(1000);
      
      server = app.listen(serverPort);
      await page.waitForTimeout(2000);

      // Reload page
      await page.reload({ waitUntil: 'networkidle0' });
      
      // Should work normally
      await page.waitForSelector('#audio-device-selector', { timeout: 10000 });
      const deviceOptions = await page.$$('#audio-device-selector option');
      expect(deviceOptions.length).toBeGreaterThan(0);
    });
  });

  describe('Security Integration', () => {
    test('should handle malicious input safely', async () => {
      const maliciousPrefs = {
        selectedAudioDevice: '<script>alert("xss")</script>',
        audioSettings: {
          sampleRate: 'invalid',
          bufferSize: -1,
          gain: 'malicious'
        },
        uiSettings: {
          theme: '../../../etc/passwd',
          autoStart: 'true',
          fullscreen: null
        },
        systemSettings: {
          port: 99999,
          host: '0.0.0.0; rm -rf /'
        }
      };

      // Should handle gracefully without crashing
      const response = await request(app)
        .post('/api/preferences')
        .send({ preferences: maliciousPrefs });

      // Should either reject or sanitize
      expect([200, 400]).toContain(response.status);
      
      if (response.status === 200) {
        // If accepted, should be sanitized
        expect(response.body.preferences.selectedAudioDevice).not.toContain('<script>');
      }
    });

    test('should prevent path traversal attacks', async () => {
      const pathTraversalAttempts = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '/etc/shadow',
        'C:\\Windows\\System32\\config\\SAM'
      ];

      for (const maliciousPath of pathTraversalAttempts) {
        const response = await request(app)
          .get(`/api/file/${encodeURIComponent(maliciousPath)}`);
        
        // Should not return sensitive files
        expect([404, 403, 400]).toContain(response.status);
      }
    });
  });

  describe('Accessibility Integration', () => {
    test('should be accessible to screen readers', async () => {
      await page.goto(`http://localhost:${serverPort}`, { waitUntil: 'networkidle0' });
      
      // Check for ARIA labels
      const ariaLabels = await page.$$eval('[aria-label]', 
        elements => elements.map(el => el.getAttribute('aria-label'))
      );
      expect(ariaLabels.length).toBeGreaterThan(0);

      // Check for semantic HTML
      const headings = await page.$$('h1, h2, h3, h4, h5, h6');
      expect(headings.length).toBeGreaterThan(0);

      // Check for form labels
      const labels = await page.$$('label');
      expect(labels.length).toBeGreaterThan(0);
    });

    test('should support keyboard navigation', async () => {
      await page.goto(`http://localhost:${serverPort}`, { waitUntil: 'networkidle0' });
      
      // Tab through interactive elements
      await page.keyboard.press('Tab');
      let focusedElement = await page.evaluate(() => document.activeElement.tagName);
      expect(['BUTTON', 'SELECT', 'INPUT']).toContain(focusedElement);

      // Should be able to activate with Enter/Space
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
      
      // Should not crash or become unresponsive
      const isResponsive = await page.evaluate(() => document.readyState === 'complete');
      expect(isResponsive).toBe(true);
    });
  });
});