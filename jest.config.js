module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '**/test/**/*.test.js'
  ],
  
  // Coverage configuration
  collectCoverage: false, // Enable with --coverage flag
  collectCoverageFrom: [
    'server.js',
    'services/**/*.js',
    'utils/**/*.js',
    '!**/node_modules/**',
    '!**/test/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Setup and teardown
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  
  // Test timeout (shorter for unit tests)
  testTimeout: 30000,
  
  // Module paths
  moduleDirectories: ['node_modules', '<rootDir>'],
  
  // Test groups - removed projects to fix configuration issues
  // Individual test files can be run with specific timeouts using CLI flags
  
  // Verbose output for debugging
  verbose: false,
  
  // Fail fast on first test failure (useful for CI)
  bail: false,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true
};