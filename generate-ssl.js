#!/usr/bin/env node

/**
 * Generate self-signed SSL certificates for local HTTPS development
 * This helps avoid microphone permission dialogs in browsers
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const sslDir = path.join(__dirname, 'ssl');

console.log('Generating self-signed SSL certificates...');

// Create ssl directory if it doesn't exist
if (!fs.existsSync(sslDir)) {
  fs.mkdirSync(sslDir);
  console.log('Created ssl/ directory');
}

try {
  // Generate private key
  execSync(`openssl genrsa -out "${path.join(sslDir, 'key.pem')}" 2048`, { stdio: 'inherit' });
    
  // Generate certificate
  execSync(`openssl req -new -x509 -key "${path.join(sslDir, 'key.pem')}" -out "${path.join(sslDir, 'cert.pem')}" -days 365 -subj "/C=US/ST=Local/L=Local/O=SpectraBox/CN=localhost"`, { stdio: 'inherit' });
    
  console.log('\n✅ SSL certificates generated successfully!');
  console.log('📁 Certificates saved to ssl/ directory');
  console.log('🔒 Server will now run with HTTPS');
  console.log('🎤 Microphone permissions will be remembered across browser sessions');
  console.log('\n⚠️  Note: You may need to accept the self-signed certificate warning in your browser');
    
} catch (error) {
  console.error('\n❌ Error generating SSL certificates:');
  console.error('Make sure OpenSSL is installed on your system');
  console.error('On macOS: brew install openssl');
  console.error('On Ubuntu/Debian: sudo apt-get install openssl');
  console.error('On Windows: Download from https://slproweb.com/products/Win32OpenSSL.html');
  process.exit(1);
}