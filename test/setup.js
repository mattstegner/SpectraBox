/**
 * Jest Test Setup
 * Global setup and configuration for all tests
 */

const path = require('path');
const fs = require('fs');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.TEST_MODE = 'true';

// Suppress console output during tests (except for explicit test output)
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// Allow test output that starts with specific prefixes
const allowedPrefixes = ['Memory usage:', 'Platform detection:', 'Found', 'Running on', 'CPU cores', 'Handled'];

console.log = (...args) => {
  const message = args.join(' ');
  if (allowedPrefixes.some(prefix => message.includes(prefix))) {
    originalConsoleLog(...args);
  }
};

console.warn = (...args) => {
  const message = args.join(' ');
  if (message.includes('not available') || message.includes('Permission denied')) {
    originalConsoleWarn(...args);
  }
};

console.error = (...args) => {
  // Always show errors in tests
  originalConsoleError(...args);
};

// Global test timeout
jest.setTimeout(30000);

// Clean up test files after tests
afterAll(async () => {
  // Clean up any test preference files
  const testConfigPaths = [
    path.join(process.cwd(), 'test-preferences.json'),
    path.join(process.cwd(), 'preferences-test.json')
  ];

  for (const filePath of testConfigPaths) {
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      // File doesn't exist, that's fine
    }
  }

  // Restore console methods
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});

// Global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Mock performance.now() if not available (for older Node versions)
if (typeof performance === 'undefined') {
  global.performance = {
    now: () => Date.now()
  };
}

// Mock requestAnimationFrame for browser-like tests
global.requestAnimationFrame = (callback) => {
  return setTimeout(callback, 16); // ~60fps
};

global.cancelAnimationFrame = (id) => {
  clearTimeout(id);
};

// Mock localStorage for browser-like tests
global.localStorage = {
  store: {},
  getItem: function(key) {
    return this.store[key] || null;
  },
  setItem: function(key, value) {
    this.store[key] = value.toString();
  },
  removeItem: function(key) {
    delete this.store[key];
  },
  clear: function() {
    this.store = {};
  }
};

// Mock sessionStorage
global.sessionStorage = {
  store: {},
  getItem: function(key) {
    return this.store[key] || null;
  },
  setItem: function(key, value) {
    this.store[key] = value.toString();
  },
  removeItem: function(key) {
    delete this.store[key];
  },
  clear: function() {
    this.store = {};
  }
};

// Mock window object for browser-like tests
global.window = {
  location: {
    href: 'http://localhost:3000',
    origin: 'http://localhost:3000'
  },
  navigator: {
    userAgent: 'Node.js Test Environment'
  }
};

// Mock document object for DOM-like tests
global.document = {
  getElementById: jest.fn(),
  querySelector: jest.fn(),
  querySelectorAll: jest.fn(),
  createElement: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
};

// Helper function to wait for async operations
global.waitFor = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to retry operations
global.retry = async (fn, maxAttempts = 3, delay = 1000) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      await waitFor(delay);
    }
  }
};

// Test utilities
global.testUtils = {
  // Generate mock audio device
  createMockDevice: (overrides = {}) => ({
    id: 'mock-device-' + Math.random().toString(36).substr(2, 9),
    name: 'Mock Audio Device',
    isDefault: false,
    type: 'input',
    channels: 1,
    sampleRates: [44100, 48000],
    platform: 'test',
    ...overrides
  }),

  // Generate mock preferences
  createMockPreferences: (overrides = {}) => ({
    selectedAudioDevice: null,
    audioSettings: {
      sampleRate: 44100,
      bufferSize: 1024,
      gain: 1.0
    },
    uiSettings: {
      theme: 'dark',
      autoStart: true,
      fullscreen: false
    },
    systemSettings: {
      port: 3000,
      host: '0.0.0.0'
    },
    lastUpdated: new Date().toISOString(),
    ...overrides
  }),

  // Create temporary test file
  createTempFile: async (filename, content) => {
    const filePath = path.join(process.cwd(), filename);
    await fs.promises.writeFile(filePath, content);
    return filePath;
  },

  // Clean up temporary test file
  cleanupTempFile: async (filePath) => {
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      // File doesn't exist, that's fine
    }
  }
};

// Performance monitoring for tests
global.testPerformance = {
  start: () => {
    return {
      startTime: Date.now(),
      startMemory: process.memoryUsage()
    };
  },

  end: (marker) => {
    const endTime = Date.now();
    const endMemory = process.memoryUsage();
    
    return {
      duration: endTime - marker.startTime,
      memoryDelta: {
        rss: endMemory.rss - marker.startMemory.rss,
        heapUsed: endMemory.heapUsed - marker.startMemory.heapUsed,
        heapTotal: endMemory.heapTotal - marker.startMemory.heapTotal
      }
    };
  }
};