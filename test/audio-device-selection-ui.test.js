/**
 * Audio Device Selection UI Tests
 * Tests that the audio device selector properly passes the selected device to getUserMedia
 */

const puppeteer = require('puppeteer');
const app = require('../server');

describe('Audio Device Selection UI Tests', () => {
  let browser;
  let page;
  let server;
  let serverPort;
  let selectedDeviceId = null;

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
    selectedDeviceId = null;
    
    // Mock getUserMedia to capture the constraints passed to it
    await page.evaluateOnNewDocument(() => {
      const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      
      navigator.mediaDevices.getUserMedia = function(constraints) {
        // Store the constraints in the window object so we can check them
        window.lastGetUserMediaConstraints = constraints;
        
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

  test('should use default device when no device is selected', async () => {
    await page.goto(`http://localhost:${serverPort}/`);
    
    // Wait for page to load
    await page.waitForSelector('#settingsBtn', { timeout: 10000 });
    
    // Open settings panel
    await page.click('#settingsBtn');
    await page.waitForSelector('#audioDeviceSelect', { visible: true });
    
    // Ensure "default" is selected
    await page.select('#audioDeviceSelect', 'default');
    
    // Start the analyzer
    await page.click('#startBtn');
    
    // Wait a moment for the start to complete
    await page.waitForTimeout(1000);
    
    // Check the constraints passed to getUserMedia
    const constraints = await page.evaluate(() => window.lastGetUserMediaConstraints);
    
    expect(constraints).toBeDefined();
    expect(constraints.audio).toBeDefined();
    
    // Should NOT have a deviceId constraint when using default
    if (constraints.audio.deviceId) {
      // If deviceId is present, it should be undefined or empty
      fail('deviceId should not be set for default device');
    }
  });

  test('should use selected device when a specific device is chosen', async () => {
    await page.goto(`http://localhost:${serverPort}/`);
    
    // Wait for page to load
    await page.waitForSelector('#settingsBtn', { timeout: 10000 });
    
    // Open settings panel
    await page.click('#settingsBtn');
    await page.waitForSelector('#audioDeviceSelect', { visible: true });
    
    // Wait for devices to load
    await page.waitForTimeout(1000);
    
    // Get available device options (excluding the "default" option)
    const deviceOptions = await page.evaluate(() => {
      const select = document.getElementById('audioDeviceSelect');
      return Array.from(select.options)
        .filter(opt => opt.value !== 'default')
        .map(opt => opt.value);
    });
    
    // If there are no non-default devices, add a test device to the selector
    if (deviceOptions.length === 0) {
      await page.evaluate(() => {
        const select = document.getElementById('audioDeviceSelect');
        const option = document.createElement('option');
        option.value = 'test-device-123';
        option.textContent = 'Test USB Audio Device';
        select.appendChild(option);
      });
    }
    
    // Select the first non-default device (or our test device)
    const testDeviceId = deviceOptions.length > 0 ? deviceOptions[0] : 'test-device-123';
    await page.select('#audioDeviceSelect', testDeviceId);
    
    // Verify the device was selected
    const selectedValue = await page.evaluate(() => 
      document.getElementById('audioDeviceSelect').value
    );
    expect(selectedValue).toBe(testDeviceId);
    
    // Verify that window.selectedAudioDeviceId was set
    const storedDeviceId = await page.evaluate(() => window.selectedAudioDeviceId);
    expect(storedDeviceId).toBe(testDeviceId);
    
    // Start the analyzer
    await page.click('#startBtn');
    
    // Wait a moment for the start to complete
    await page.waitForTimeout(1000);
    
    // Check the constraints passed to getUserMedia
    const constraints = await page.evaluate(() => window.lastGetUserMediaConstraints);
    
    expect(constraints).toBeDefined();
    expect(constraints.audio).toBeDefined();
    expect(constraints.audio.deviceId).toBeDefined();
    expect(constraints.audio.deviceId.exact).toBe(testDeviceId);
    
    console.log('Successfully verified device selection:', testDeviceId);
  });

  test('should log device selection to console', async () => {
    const consoleMessages = [];
    page.on('console', msg => {
      consoleMessages.push(msg.text());
    });
    
    await page.goto(`http://localhost:${serverPort}/`);
    
    // Wait for page to load
    await page.waitForSelector('#settingsBtn', { timeout: 10000 });
    
    // Open settings panel
    await page.click('#settingsBtn');
    await page.waitForSelector('#audioDeviceSelect', { visible: true });
    
    // Add a test device
    await page.evaluate(() => {
      const select = document.getElementById('audioDeviceSelect');
      const option = document.createElement('option');
      option.value = 'test-device-456';
      option.textContent = 'Test Device for Logging';
      select.appendChild(option);
    });
    
    // Select the test device
    await page.select('#audioDeviceSelect', 'test-device-456');
    
    // Start the analyzer
    await page.click('#startBtn');
    
    // Wait for analyzer to start
    await page.waitForTimeout(1500);
    
    // Check console messages
    const hasDeviceLog = consoleMessages.some(msg => 
      msg.includes('Using selected audio device') && msg.includes('test-device-456')
    );
    
    expect(hasDeviceLog).toBe(true);
  });

  test('should handle device change while analyzer is stopped', async () => {
    await page.goto(`http://localhost:${serverPort}/`);
    
    // Wait for page to load
    await page.waitForSelector('#settingsBtn', { timeout: 10000 });
    
    // Open settings panel
    await page.click('#settingsBtn');
    await page.waitForSelector('#audioDeviceSelect', { visible: true });
    
    // Select default first
    await page.select('#audioDeviceSelect', 'default');
    
    // Add and select a test device
    await page.evaluate(() => {
      const select = document.getElementById('audioDeviceSelect');
      const option = document.createElement('option');
      option.value = 'test-device-789';
      option.textContent = 'Test Device Change';
      select.appendChild(option);
    });
    
    await page.select('#audioDeviceSelect', 'test-device-789');
    
    // Start the analyzer
    await page.click('#startBtn');
    await page.waitForTimeout(1000);
    
    // Check constraints
    const constraints = await page.evaluate(() => window.lastGetUserMediaConstraints);
    
    expect(constraints.audio.deviceId).toBeDefined();
    expect(constraints.audio.deviceId.exact).toBe('test-device-789');
  });

  test('should preserve audio constraints when using device selection', async () => {
    await page.goto(`http://localhost:${serverPort}/`);
    
    // Wait for page to load
    await page.waitForSelector('#settingsBtn', { timeout: 10000 });
    
    // Open settings panel
    await page.click('#settingsBtn');
    await page.waitForSelector('#audioDeviceSelect', { visible: true });
    
    // Add a test device
    await page.evaluate(() => {
      const select = document.getElementById('audioDeviceSelect');
      const option = document.createElement('option');
      option.value = 'test-device-constraints';
      option.textContent = 'Test Device for Constraints';
      select.appendChild(option);
    });
    
    // Select the test device
    await page.select('#audioDeviceSelect', 'test-device-constraints');
    
    // Start the analyzer
    await page.click('#startBtn');
    await page.waitForTimeout(1000);
    
    // Check that all audio constraints are preserved
    const constraints = await page.evaluate(() => window.lastGetUserMediaConstraints);
    
    expect(constraints.audio.sampleRate).toBe(44100);
    expect(constraints.audio.echoCancellation).toBe(false);
    expect(constraints.audio.noiseSuppression).toBe(false);
    expect(constraints.audio.autoGainControl).toBe(false);
    expect(constraints.audio.deviceId).toBeDefined();
    expect(constraints.audio.deviceId.exact).toBe('test-device-constraints');
  });
});

