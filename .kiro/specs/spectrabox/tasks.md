# Implementation Plan

- [x] 1. Set up project structure and core dependencies

  - Create Node.js project with package.json and install Express.js, cors, and development dependencies (jest, nodemon, eslint)
  - Set up directory structure: services/, utils/, public/, test/, and root files
  - Configure ESLint with Node.js rules and basic npm scripts for development
  - Create .gitignore file for Node.js projects
  - _Requirements: 1.1, 1.3_

- [x] 2. Implement platform detection utilities

  - Create utils/platformDetection.js module to detect current operating system
  - Implement methods for getting platform-specific paths and configurations
  - Add method to detect if running on Raspberry Pi specifically using /proc/cpuinfo
  - Write unit tests for platform detection functionality
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 3. Create preferences service with JSON persistence

  - Implement services/preferencesService.js class with load/save methods for JSON files
  - Create default preferences schema matching design document structure
  - Add validation functions for preference data integrity
  - Add error handling for corrupted files, missing permissions, and file system issues
  - Write unit tests for preference loading, saving, and error scenarios
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Implement cross-platform audio device enumeration

  - Create services/audioDeviceService.js base class with common interface
  - Implement macOS-specific audio device detection using system_profiler or node-core-audio
  - Implement Linux-specific audio device detection using arecord/pactl commands
  - Add device validation and basic caching mechanisms for performance
  - Write unit tests with mocked system calls for both platforms
  - _Requirements: 2.1, 2.3, 2.4, 2.5, 4.4, 4.5_

- [x] 5. Create Express.js server with REST API endpoints

  - Create server.js with Express.js setup and middleware for CORS and static file serving
  - Implement GET /api/audio-devices endpoint for device enumeration
  - Implement GET /api/preferences and POST /api/preferences endpoints
  - Add GET /api/system-info endpoint for platform information
  - Write integration tests for all API endpoints using supertest
  - _Requirements: 1.1, 1.2, 1.4, 2.2_

- [x] 6. Integrate existing spectrum analyzer HTML/JavaScript

  - Copy spectrum analyzer files from external repository to public/ directory
  - Modify HTML to work with new server structure and API endpoints
  - Update JavaScript to use new audio device selection API instead of hardcoded devices
  - Ensure meters.js and all dependencies are properly integrated
  - Preserve all existing spectrum analyzer functionality without modifying original external files
  - Test integration and verify audio device selection works with new backend
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 7. Add comprehensive error handling and logging

  - Implement error handling for all services and API endpoints with appropriate HTTP status codes
  - Add structured logging using console or winston for debugging and monitoring
  - Create user-friendly error messages for common failure scenarios
  - Test error scenarios including missing devices, file permissions, and network issues
  - _Requirements: 2.5, 3.5, 4.5_

- [x] 8. Optimize for Raspberry Pi deployment

  - Configure server for efficient resource usage on limited hardware
  - Create systemd service file for auto-start configuration on system boot
  - Implement graceful shutdown handling for SIGTERM and SIGINT signals
  - Test memory usage and performance on Raspberry Pi hardware
  - Create deployment scripts and basic documentation
  - _Requirements: 6.1, 6.3, 6.5_

- [x] 9. Add network accessibility and kiosk mode support

  - Configure server to accept connections from local network (bind to 0.0.0.0)
  - Add configuration options for host binding and port selection in preferences
  - Test remote browser access functionality from other devices on network
  - Validate kiosk mode operation with full-screen browser setup
  - _Requirements: 6.2, 6.4_

- [x] 10. Create comprehensive test suite
  - Write end-to-end tests for complete user workflows using puppeteer or similar
  - Add cross-platform integration tests for macOS and Linux environments
  - Create performance tests for Raspberry Pi resource constraints
  - Implement automated testing for various audio device scenarios
  - _Requirements: All requirements validation_
