# Implementation Plan

- [x] 1. Extend PreferencesService schema for UI settings

  - Modify services/preferencesService.js to include uiSettings in the default preferences schema
  - Add validation rules for all UI settings categories (general, spectrogramInterface, spectrogramDrawing, meters)
  - Update validatePreferences method to validate UI settings structure and value ranges
  - Write unit tests for new UI settings validation logic
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 2. Create client-side settings persistence manager

  - Create public/js/settings-persistence.js with SettingsManager class
  - Implement methods to collect current settings from all UI controls (sliders, selects, checkboxes, toggles)
  - Add debounced save functionality to prevent excessive server requests during rapid changes
  - Implement settings validation on client side before sending to server
  - Write helper methods to map UI control values to internal setting representations
  - _Requirements: 1.1, 1.5, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Implement automatic settings loading on application startup

  - Modify public/js/spectrum-analyzer-integration.js to load and apply UI settings on page load
  - Create applySettingsToUI method to set all UI controls to saved values
  - Add settings file location logging to server startup in server.js
  - Implement settings validation and fallback to defaults for corrupted settings
  - Handle missing settings file by creating default settings
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 2.1, 2.2, 2.3, 2.4_

- [x] 4. Add automatic settings saving on UI changes

  - Attach event listeners to all settings controls in the Settings panel
  - Implement debounced save handler that triggers 500ms after last change
  - Create method to detect which specific settings have changed to optimize saves
  - Add visual feedback (subtle indicator) when settings are being saved
  - Handle save errors gracefully with retry mechanism
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 5. Implement Reset Settings functionality

  - Add "Reset Settings" button to the General tab in public/index.html
  - ~~Create confirmation dialog asking user to confirm reset action~~ (Removed for touch-screen optimization)
  - Implement resetSettings method that calls server DELETE endpoint
  - Add server-side DELETE /api/preferences endpoint to delete settings file
  - Apply default values to all UI controls immediately after reset
  - Show success feedback message after reset completion
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 6. Add settings save during server shutdown

  - Modify graceful shutdown handler in server.js to save current settings
  - Implement settings flush method in PreferencesService for shutdown saves
  - Add timeout handling to ensure shutdown completes even if save fails
  - Log settings save operations during shutdown for debugging
  - Handle both SIGTERM and SIGINT signals for settings preservation
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 7. Enhance server API endpoints for UI settings

  - Add GET /api/preferences/ui endpoint to return only UI settings
  - Add POST /api/preferences/ui endpoint to save only UI settings
  - Modify existing POST /api/preferences to handle extended schema with UI settings
  - Add comprehensive error responses for validation failures with specific field errors
  - Implement request validation middleware for settings endpoints
  - _Requirements: 1.2, 1.3, 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 8. Add comprehensive error handling and user feedback

  - Implement client-side error handling for network failures during save/load
  - Add retry mechanism with exponential backoff for failed save operations
  - Create user-friendly error messages for different failure scenarios
  - Add loading indicators during settings operations
  - Implement graceful degradation when server is unavailable
  - _Requirements: 6.5, 7.5_

- [x] 9. Create comprehensive test suite for settings persistence

  - Write unit tests for SettingsManager class methods
  - Create integration tests for complete save/load/reset workflows
  - Add tests for settings validation with invalid values and edge cases
  - Write tests for error recovery scenarios (corrupted files, network failures)
  - Create tests for server shutdown settings saving functionality
  - _Requirements: All requirements validation_

- [x] 10. Add settings file location display and logging
  - Log settings file path to console during server startup
  - Add settings file location to server logs when file is created
  - Display file location in application logs for user reference
  - Ensure cross-platform path handling using existing PlatformDetection utilities
  - _Requirements: 2.1, 2.2, 2.3, 2.4_
