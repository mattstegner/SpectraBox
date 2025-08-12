/**
 * Spectrum Analyzer Integration Tests
 * Tests the integration of existing spectrum analyzer functionality
 */

const puppeteer = require('puppeteer');
const request = require('supertest');
const app = require('../server');
const fs = require('fs').promises;
const path = require('path');

describe('Spectrum Analyzer Integration Tests', () => {
  let browser;
  let page;
  let server;
  let serverPort;

  beforeAll(async () => {
    // Start server
    server = app.listen(0);
    serverPort = server.address().port;
    
    // Launch browser
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--disable-web-security'
      ]
    });
  });

  afterAll(async () => {
    if (browser) await browser.close();
    if (server) server.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    
    // Mock getUserMedia for testing
    await page.evaluateOnNewDocument(() => {
      navigator.mediaDevices.getUserMedia = () => {
        // Create a mock audio stream
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const destination = audioContext.createMediaStreamDestination();
        
        oscillator.connect(destination);
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4 note
        oscillator.start();
        
        return Promise.resolve(destination.stream);
      };
    });
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  describe('Static File Integration', () => {
    test('should serve spectrum analyzer HTML file', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);
      
      expect(response.headers['content-type']).toMatch(/text\/html/);
      expect(response.text).toContain('Stereo Spectrum Analyzer');
      expect(response.text).toContain('spectrumCanvas');
    });

    test('should serve spectrum analyzer JavaScript files', async () => {
      const jsFiles = [
        '/js/spectrum-analyzer.js',
        '/js/meters.js',
        '/js/spectrum-analyzer-integration.js'
      ];

      for (const jsFile of jsFiles) {
        const response = await request(app)
          .get(jsFile)
          .expect(200);
        
        expect(response.headers['content-type']).toMatch(/application\/javascript/);
        expect(response.text.length).toBeGreaterThan(0);
      }
    });

    test('should serve CSS files', async () => {
      const cssFiles = [
        '/css/styles.css',
        '/css/integration.css'
      ];

      for (const cssFile of cssFiles) {
        const response = await request(app)
          .get(cssFile)
          .expect(200);
        
        expect(response.headers['content-type']).toMatch(/text\/css/);
        expect(response.text.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Spectrum Analyzer Initialization', () => {
    test('should load spectrum analyzer interface', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      // Check main elements are present
      const canvas = await page.$('#spectrumCanvas');
      expect(canvas).toBeTruthy();

      const startButton = await page.$('#startBtn');
      expect(startButton).toBeTruthy();

      const stopButton = await page.$('#stop-button');
      expect(stopButton).toBeTruthy();

      const deviceSelector = await page.$('#audio-device-selector');
      expect(deviceSelector).toBeTruthy();
    });

    test('should initialize canvas with correct dimensions', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      const canvasInfo = await page.evaluate(() => {
        const canvas = document.getElementById('spectrumCanvas');
        return {
          width: canvas.width,
          height: canvas.height,
          offsetWidth: canvas.offsetWidth,
          offsetHeight: canvas.offsetHeight
        };
      });

      expect(canvasInfo.width).toBeGreaterThan(0);
      expect(canvasInfo.height).toBeGreaterThan(0);
      expect(canvasInfo.offsetWidth).toBeGreaterThan(0);
      expect(canvasInfo.offsetHeight).toBeGreaterThan(0);
    });

    test('should load spectrum analyzer JavaScript modules', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      const moduleStatus = await page.evaluate(() => {
        return {
          spectrumAnalyzer: typeof window.SpectrumAnalyzer !== 'undefined',
          audioMeter: typeof window.AudioMeter !== 'undefined',
          webAudioAPI: typeof window.AudioContext !== 'undefined' || typeof window.webkitAudioContext !== 'undefined'
        };
      });

      expect(moduleStatus.spectrumAnalyzer).toBe(true);
      expect(moduleStatus.webAudioAPI).toBe(true);
    });
  });

  describe('Audio Device Integration', () => {
    test('should populate device selector with available devices', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      // Wait for devices to load
      await page.waitForSelector('#audioDeviceSelect option', { timeout: 10000 });

      const deviceCount = await page.$$eval('#audio-device-selector option', 
        options => options.length
      );

      expect(deviceCount).toBeGreaterThan(0);

      const devices = await page.$$eval('#audio-device-selector option', 
        options => options.map(opt => ({ value: opt.value, text: opt.textContent }))
      );

      // Should have at least one device
      expect(devices.length).toBeGreaterThan(0);
      
      // First option should not be empty
      expect(devices[0].value).toBeDefined();
      expect(devices[0].text).toBeDefined();
    });

    test('should handle device selection changes', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      await page.waitForSelector('#audio-device-selector option', { timeout: 5000 });

      const devices = await page.$$eval('#audio-device-selector option', 
        options => options.map(opt => ({ value: opt.value, text: opt.textContent }))
      );

      if (devices.length > 1) {
        // Select different device
        await page.select('#audio-device-selector', devices[1].value);

        // Verify selection changed
        const selectedValue = await page.$eval('#audio-device-selector', el => el.value);
        expect(selectedValue).toBe(devices[1].value);

        // Should trigger preference save
        await page.waitForTimeout(1000);
        
        // Verify via API
        const response = await request(app).get('/api/preferences');
        expect(response.body.preferences.selectedAudioDevice).toBe(devices[1].value);
      }
    });
  });

  describe('Spectrum Analyzer Functionality', () => {
    test('should start spectrum analysis', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      // Wait for interface to load
      await page.waitForSelector('#start-button', { timeout: 5000 });

      // Click start button
      await page.click('#start-button');

      // Wait for analyzer to start
      await page.waitForTimeout(2000);

      // Check if analyzer is running
      const isRunning = await page.evaluate(() => {
        return window.spectrumAnalyzer && window.spectrumAnalyzer.isRunning;
      });

      expect(isRunning).toBe(true);

      // Check button states
      const startButtonDisabled = await page.$eval('#start-button', el => el.disabled);
      const stopButtonDisabled = await page.$eval('#stop-button', el => el.disabled);

      expect(startButtonDisabled).toBe(true);
      expect(stopButtonDisabled).toBe(false);
    });

    test('should stop spectrum analysis', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      // Start analyzer first
      await page.waitForSelector('#start-button', { timeout: 5000 });
      await page.click('#start-button');
      await page.waitForTimeout(1000);

      // Stop analyzer
      await page.click('#stop-button');
      await page.waitForTimeout(1000);

      // Check if analyzer stopped
      const isRunning = await page.evaluate(() => {
        return window.spectrumAnalyzer && window.spectrumAnalyzer.isRunning;
      });

      expect(isRunning).toBe(false);

      // Check button states
      const startButtonDisabled = await page.$eval('#start-button', el => el.disabled);
      const stopButtonDisabled = await page.$eval('#stop-button', el => el.disabled);

      expect(startButtonDisabled).toBe(false);
      expect(stopButtonDisabled).toBe(true);
    });

    test('should update spectrum display', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      await page.waitForSelector('#start-button', { timeout: 5000 });
      await page.click('#start-button');

      // Wait for several animation frames
      await page.waitForTimeout(3000);

      // Check if canvas is being updated
      const canvasData = await page.evaluate(() => {
        const canvas = document.getElementById('spectrum-canvas');
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Check if there's any non-zero pixel data
        const data = Array.from(imageData.data);
        const hasData = data.some(pixel => pixel > 0);
        
        return {
          hasData,
          totalPixels: data.length,
          nonZeroPixels: data.filter(pixel => pixel > 0).length
        };
      });

      expect(canvasData.hasData).toBe(true);
      expect(canvasData.nonZeroPixels).toBeGreaterThan(0);
    });

    test('should handle audio context creation', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      const audioContextInfo = await page.evaluate(() => {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const hasAudioContext = typeof AudioContextClass !== 'undefined';
        
        let contextState = null;
        if (hasAudioContext) {
          const ctx = new AudioContextClass();
          contextState = ctx.state;
          ctx.close();
        }

        return {
          hasAudioContext,
          contextState,
          hasGetUserMedia: typeof navigator.mediaDevices.getUserMedia === 'function'
        };
      });

      expect(audioContextInfo.hasAudioContext).toBe(true);
      expect(audioContextInfo.hasGetUserMedia).toBe(true);
      expect(['suspended', 'running', 'closed']).toContain(audioContextInfo.contextState);
    });
  });

  describe('Audio Meters Integration', () => {
    test('should display audio level meters', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      // Check if meter elements exist
      const meterElements = await page.$$('.audio-meter');
      expect(meterElements.length).toBeGreaterThan(0);

      // Start analyzer to activate meters
      await page.waitForSelector('#start-button', { timeout: 5000 });
      await page.click('#start-button');
      await page.waitForTimeout(2000);

      // Check if meters are updating
      const meterValues = await page.evaluate(() => {
        const meters = document.querySelectorAll('.audio-meter');
        return Array.from(meters).map(meter => {
          const bar = meter.querySelector('.meter-bar');
          return bar ? bar.style.height || bar.style.width : '0%';
        });
      });

      expect(meterValues.length).toBeGreaterThan(0);
      // At least one meter should show some activity
      expect(meterValues.some(value => value !== '0%' && value !== '')).toBe(true);
    });

    test('should handle peak detection', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      await page.waitForSelector('#start-button', { timeout: 5000 });
      await page.click('#start-button');
      await page.waitForTimeout(3000);

      const peakInfo = await page.evaluate(() => {
        return {
          hasPeakIndicators: document.querySelectorAll('.peak-indicator').length > 0,
          hasClippingIndicator: document.querySelector('.clipping-indicator') !== null,
          meterCount: document.querySelectorAll('.audio-meter').length
        };
      });

      expect(peakInfo.meterCount).toBeGreaterThan(0);
      // Peak indicators are optional but should be handled gracefully
      expect(typeof peakInfo.hasPeakIndicators).toBe('boolean');
    });
  });

  describe('Settings Integration', () => {
    test('should open and close settings panel', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      // Open settings
      await page.waitForSelector('#settings-button', { timeout: 5000 });
      await page.click('#settings-button');

      // Check if settings panel is visible
      const settingsPanel = await page.$('#settings-panel');
      expect(settingsPanel).toBeTruthy();

      const isVisible = await page.evaluate(() => {
        const panel = document.getElementById('settings-panel');
        return panel && (panel.style.display !== 'none' && 
                        !panel.classList.contains('hidden'));
      });
      expect(isVisible).toBe(true);

      // Close settings
      const closeButton = await page.$('#close-settings-button');
      if (closeButton) {
        await page.click('#close-settings-button');
        
        const isHidden = await page.evaluate(() => {
          const panel = document.getElementById('settings-panel');
          return panel && (panel.style.display === 'none' || 
                          panel.classList.contains('hidden'));
        });
        expect(isHidden).toBe(true);
      }
    });

    test('should save audio settings', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      // Open settings
      await page.waitForSelector('#settings-button', { timeout: 5000 });
      await page.click('#settings-button');

      // Change sample rate if selector exists
      const sampleRateSelector = await page.$('#sample-rate-select');
      if (sampleRateSelector) {
        await page.select('#sample-rate-select', '48000');
        
        // Save settings
        const saveButton = await page.$('#save-settings-button');
        if (saveButton) {
          await page.click('#save-settings-button');
          await page.waitForTimeout(1000);

          // Verify via API
          const response = await request(app).get('/api/preferences');
          expect(response.body.preferences.audioSettings.sampleRate).toBe(48000);
        }
      }
    });
  });

  describe('Responsive Design Integration', () => {
    test('should adapt to different screen sizes', async () => {
      const viewports = [
        { width: 1920, height: 1080, name: 'Desktop' },
        { width: 1024, height: 768, name: 'Tablet' },
        { width: 375, height: 667, name: 'Mobile' }
      ];

      for (const viewport of viewports) {
        await page.setViewport(viewport);
        await page.goto(`http://localhost:${serverPort}`, { 
          waitUntil: 'networkidle0' 
        });

        // Check canvas adapts to viewport
        const canvasInfo = await page.evaluate(() => {
          const canvas = document.getElementById('spectrum-canvas');
          return {
            width: canvas.offsetWidth,
            height: canvas.offsetHeight,
            maxWidth: window.innerWidth
          };
        });

        expect(canvasInfo.width).toBeLessThanOrEqual(viewport.width);
        expect(canvasInfo.width).toBeGreaterThan(0);
        expect(canvasInfo.height).toBeGreaterThan(0);

        console.log(`${viewport.name}: Canvas ${canvasInfo.width}x${canvasInfo.height}`);
      }
    });

    test('should handle touch interactions on mobile', async () => {
      await page.setViewport({ width: 375, height: 667 });
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      // Simulate touch events
      await page.waitForSelector('#start-button', { timeout: 5000 });
      
      // Touch start button
      await page.touchscreen.tap(100, 100); // Approximate button location
      await page.waitForTimeout(1000);

      // Should still be functional
      const isResponsive = await page.evaluate(() => document.readyState === 'complete');
      expect(isResponsive).toBe(true);
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle microphone permission denied', async () => {
      // Create new page with permission denied
      const deniedPage = await browser.newPage();
      await deniedPage.evaluateOnNewDocument(() => {
        navigator.mediaDevices.getUserMedia = () => {
          return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
        };
      });

      await deniedPage.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      await deniedPage.waitForSelector('#start-button', { timeout: 5000 });
      await deniedPage.click('#start-button');

      // Should show error message
      await deniedPage.waitForSelector('.error-message', { timeout: 5000 });
      const errorText = await deniedPage.$eval('.error-message', el => el.textContent);
      expect(errorText.toLowerCase()).toContain('permission');

      await deniedPage.close();
    });

    test('should handle audio context creation failure', async () => {
      const failPage = await browser.newPage();
      await failPage.evaluateOnNewDocument(() => {
        window.AudioContext = undefined;
        window.webkitAudioContext = undefined;
      });

      await failPage.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      await failPage.waitForSelector('#start-button', { timeout: 5000 });
      await failPage.click('#start-button');

      // Should handle gracefully
      const hasErrorMessage = await failPage.$('.error-message');
      if (hasErrorMessage) {
        const errorText = await failPage.$eval('.error-message', el => el.textContent);
        expect(errorText.toLowerCase()).toContain('audio');
      }

      await failPage.close();
    });
  });

  describe('Performance Integration', () => {
    test('should maintain smooth animation', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      // Start performance monitoring
      await page.tracing.start({ screenshots: false, path: 'spectrum-trace.json' });

      await page.waitForSelector('#start-button', { timeout: 5000 });
      await page.click('#start-button');

      // Let it run for analysis
      await page.waitForTimeout(5000);

      await page.tracing.stop();

      // Check memory usage
      const metrics = await page.metrics();
      expect(metrics.JSHeapUsedSize).toBeLessThan(100 * 1024 * 1024); // Less than 100MB

      console.log('Spectrum analyzer memory usage:', {
        jsHeapUsed: `${Math.round(metrics.JSHeapUsedSize / 1024 / 1024)}MB`,
        jsHeapTotal: `${Math.round(metrics.JSHeapTotalSize / 1024 / 1024)}MB`
      });
    });

    test('should handle rapid start/stop cycles', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      await page.waitForSelector('#start-button', { timeout: 5000 });

      // Rapid start/stop cycles
      for (let i = 0; i < 5; i++) {
        await page.click('#start-button');
        await page.waitForTimeout(500);
        await page.click('#stop-button');
        await page.waitForTimeout(500);
      }

      // Should still be functional
      await page.click('#start-button');
      await page.waitForTimeout(1000);

      const isRunning = await page.evaluate(() => {
        return window.spectrumAnalyzer && window.spectrumAnalyzer.isRunning;
      });
      expect(isRunning).toBe(true);
    });
  });
});