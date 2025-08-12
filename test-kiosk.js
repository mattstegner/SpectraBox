#!/usr/bin/env node

/**
 * Test script for kiosk launcher
 */

const KioskLauncher = require('./start-kiosk.js');

// Set development environment
process.env.NODE_ENV = 'development';
process.env.KIOSK_BROWSER = 'true';

const launcher = new KioskLauncher();

console.log('Starting kiosk in development mode...');
console.log('This should launch Chrome automatically on your MacBook');

launcher.start().catch((error) => {
  console.error('Failed to start kiosk:', error);
  process.exit(1);
});

// Handle Ctrl+C to shutdown gracefully
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  launcher.shutdown();
});