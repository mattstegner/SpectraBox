# Comprehensive Test Suite Documentation

This directory contains a complete test suite for the SpectraBox application, covering all requirements and providing multiple testing approaches.

## Test Structure

### Test Categories

#### 1. Unit Tests
- **Files**: `*Service.test.js`, `platformDetection.test.js`, `logger.test.js`
- **Purpose**: Test individual components in isolation
- **Coverage**: Services, utilities, and core modules
- **Run with**: `npm run test:unit`

#### 2. Integration Tests
- **Files**: `integration.test.js`, `server.test.js`, `spectrum-analyzer-integration.test.js`
- **Purpose**: Test component interactions and API endpoints
- **Coverage**: Server functionality, API integration, spectrum analyzer
- **Run with**: `npm run test:integration`

#### 3. End-to-End Tests
- **Files**: `e2e-*.test.js`, `comprehensive-integration.test.js`
- **Purpose**: Test complete user workflows using browser automation
- **Coverage**: Full application workflows, user interactions
- **Run with**: `npm run test:e2e`

#### 4. Performance Tests
- **Files**: `pi-performance.test.js`
- **Purpose**: Test resource usage and performance on Raspberry Pi
- **Coverage**: Memory usage, response times, concurrent users
- **Run with**: `npm run test:performance`

#### 5. Cross-Platform Tests
- **Files**: `cross-platform-*.test.js`
- **Purpose**: Test compatibility across macOS and Linux
- **Coverage**: Platform detection, file operations, audio devices
- **Run with**: `npm run test:cross-platform`

#### 6. Audio Device Tests
- **Files**: `audio-device-scenarios.test.js`
- **Purpose**: Test various audio device configurations
- **Coverage**: Device enumeration, selection, error handling
- **Run with**: `npm run test:audio`

#### 7. Network Accessibility Tests
- **Files**: `network-accessibility.test.js`
- **Purpose**: Test network configuration and kiosk mode
- **Coverage**: Host binding, remote access, kiosk settings
- **Run with**: `npm run test:network`

#### 8. Security Tests
- **Files**: `security-validation.test.js`
- **Purpose**: Test security measures and vulnerability prevention
- **Coverage**: Input validation, XSS prevention, path traversal
- **Run with**: `npm run test:security`

#### 9. Accessibility Tests
- **Files**: `accessibility-compliance.test.js`
- **Purpose**: Test web accessibility compliance (WCAG)
- **Coverage**: ARIA labels, keyboard navigation, screen readers
- **Run with**: `npm run test:accessibility`

## Test Utilities

### Test Runner (`test-runner.js`)
Comprehensive test orchestration with:
- Sequential test suite execution
- Performance monitoring
- Detailed reporting
- Category-based filtering
- Prerequisites checking

**Usage**:
```bash
npm run test:comprehensive
npm run test:comprehensive unit
npm run test:comprehensive e2e
```

### Test Validation (`test-validation.js`)
Validates test coverage against requirements:
- Requirement coverage analysis
- Test quality metrics
- Coverage gap identification
- Recommendations generation

**Usage**:
```bash
npm run test:validate
```

### Test Setup (`setup.js`)
Global test configuration:
- Environment setup
- Mock implementations
- Helper functions
- Performance monitoring utilities

## Running Tests

### Quick Commands
```bash
# Run all tests
npm test

# Run with coverage
npm run test:all

# Run comprehensive suite
npm run test:comprehensive

# Validate test coverage
npm run test:validate

# Run specific categories
npm run test:unit
npm run test:e2e
npm run test:performance
```

### Advanced Usage
```bash
# Run tests with specific timeout
jest --testTimeout=60000

# Run tests matching pattern
jest --testNamePattern="audio device"

# Run tests in specific file
jest test/server.test.js

# Run tests with verbose output
jest --verbose

# Run tests in watch mode
npm run test:watch
```

## Test Configuration

### Jest Configuration (`jest.config.js`)
- Test environment: Node.js
- Timeout: 30 seconds (60s for E2E)
- Coverage collection from source files
- Project-based test organization
- Setup file integration

### Browser Testing (Puppeteer)
- Headless Chrome automation
- Mobile viewport testing
- Accessibility testing
- Performance monitoring
- Screenshot comparison

## Requirements Coverage

The test suite covers all project requirements:

### Requirement 1: Node.js Server Framework
- ✅ Express.js usage (`server.test.js`)
- ✅ Resource efficiency (`pi-performance.test.js`)
- ✅ Static file serving (`integration.test.js`)
- ✅ Browser interface (`e2e-user-workflows.test.js`)

### Requirement 2: Audio Device Management
- ✅ Device enumeration (`audioDeviceService.test.js`)
- ✅ UI display (`e2e-user-workflows.test.js`)
- ✅ macOS APIs (`cross-platform-integration.test.js`)
- ✅ Linux APIs (`cross-platform-integration.test.js`)
- ✅ Error handling (`audio-device-scenarios.test.js`)

### Requirement 3: Preference Persistence
- ✅ Device selection saving (`preferencesService.test.js`)
- ✅ Startup loading (`comprehensive-integration.test.js`)
- ✅ JSON format (`preferencesService.test.js`)
- ✅ Default creation (`preferencesService.test.js`)
- ✅ Corruption handling (`preferencesService.test.js`)

### Requirement 4: Cross-Platform Compatibility
- ✅ OS detection (`platformDetection.test.js`)
- ✅ macOS compatibility (`cross-platform-integration.test.js`)
- ✅ Linux compatibility (`cross-platform-integration.test.js`)
- ✅ Cross-platform modules (`cross-platform-integration.test.js`)
- ✅ Platform handlers (`audioDeviceService.test.js`)

### Requirement 5: Spectrum Analyzer Integration
- ✅ HTML/JS integration (`spectrum-analyzer-integration.test.js`)
- ✅ File serving (`server.test.js`)
- ✅ Code preservation (`spectrum-analyzer-integration.test.js`)
- ✅ Functionality maintenance (`e2e-user-workflows.test.js`)
- ✅ File placement (`server.test.js`)

### Requirement 6: Kiosk Mode Operation
- ✅ Optimization (`pi-performance.test.js`)
- ✅ Network accessibility (`network-accessibility.test.js`)
- ✅ Auto-start (`pi-performance.test.js`)
- ✅ Remote serving (`comprehensive-integration.test.js`)
- ✅ Hardware efficiency (`pi-performance.test.js`)

## Test Quality Metrics

### Coverage Goals
- **Unit Tests**: 90%+ line coverage
- **Integration Tests**: All API endpoints
- **E2E Tests**: All user workflows
- **Performance Tests**: Resource constraints
- **Security Tests**: Common vulnerabilities

### Quality Standards
- Descriptive test names
- Proper setup/teardown
- Mock usage for external dependencies
- Error scenario testing
- Performance benchmarking

## Continuous Integration

### Pre-commit Hooks
```bash
# Run linting and basic tests
npm run lint
npm run test:unit
```

### CI Pipeline
```bash
# Full test suite
npm run test:comprehensive
npm run test:validate
npm run lint
```

### Performance Monitoring
- Memory usage tracking
- Response time measurement
- Resource consumption analysis
- Raspberry Pi optimization validation

## Troubleshooting

### Common Issues

#### Puppeteer Installation
```bash
# Install Chromium dependencies
sudo apt-get install -y chromium-browser
```

#### Permission Errors
```bash
# Fix file permissions
chmod +x test/*.js
```

#### Memory Issues on Pi
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=512"
```

#### Audio Device Testing
```bash
# Install audio utilities (Linux)
sudo apt-get install alsa-utils pulseaudio-utils
```

### Debug Mode
```bash
# Run tests with debug output
DEBUG=* npm test

# Run specific test with verbose output
jest --verbose test/server.test.js
```

## Contributing

### Adding New Tests
1. Follow naming convention: `feature-name.test.js`
2. Include proper describe/test structure
3. Add setup/teardown as needed
4. Update test validation mapping
5. Document test purpose and coverage

### Test Categories
- Place unit tests with component name
- Integration tests test multiple components
- E2E tests use browser automation
- Performance tests measure resources
- Security tests check vulnerabilities

### Best Practices
- Use descriptive test names
- Test both success and error cases
- Mock external dependencies
- Clean up resources in teardown
- Validate against requirements

## Reporting

### Test Results
- Console output with pass/fail status
- JSON reports for CI integration
- Coverage reports in HTML format
- Performance metrics logging

### Coverage Reports
```bash
# Generate coverage report
npm run test:all

# View HTML coverage report
open coverage/index.html
```

### Validation Reports
```bash
# Generate validation report
npm run test:validate

# View validation results
cat test-validation-report.json
```