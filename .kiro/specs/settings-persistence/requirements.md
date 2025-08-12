# Requirements Document

## Introduction

This feature adds persistent settings storage to the pi-audio-kiosk application, allowing all user preferences from the Settings panel to be automatically saved to disk and restored on application startup. The system will use a human-readable JSON format for storage, provide settings validation, and include a reset functionality to restore defaults.

## Requirements

### Requirement 1

**User Story:** As a user, I want my settings to be automatically saved when I change them, so that my preferences are preserved between application sessions.

#### Acceptance Criteria

1. WHEN a user changes any setting in the Settings panel THEN the system SHALL automatically save the setting to disk
2. WHEN the application shuts down THEN the system SHALL save all current settings to a JSON file
3. WHEN settings are saved THEN the system SHALL use JSON format for human readability
4. WHEN saving settings THEN the system SHALL include appropriate setting names and internal representation values
5. WHEN a setting is changed THEN the system SHALL debounce rapid changes to avoid excessive disk writes

### Requirement 2

**User Story:** As a user, I want to know where my settings file is stored, so that I can locate it if needed for backup or troubleshooting.

#### Acceptance Criteria

1. WHEN the application starts THEN the system SHALL log the settings file location to the console
2. WHEN settings are first created THEN the system SHALL display the file path in the application logs
3. WHEN the settings file location is determined THEN the system SHALL use a predictable, platform-appropriate path
4. WHEN running on different platforms THEN the system SHALL use OS-appropriate configuration directories

### Requirement 3

**User Story:** As a user, I want all my Settings panel preferences to be saved, so that I don't lose any customizations.

#### Acceptance Criteria

1. WHEN saving settings THEN the system SHALL include all General tab settings (audio device, frequency range, gain, hold mode)
2. WHEN saving settings THEN the system SHALL include all Spectrogram Interface settings (click info size, responsiveness, calibration, overlapping, overlap tolerance, range)
3. WHEN saving settings THEN the system SHALL include all Spectrogram Drawing settings (FFT size, pixel averaging, smoothing, frequency-dependent smoothing, noise floor, peak envelope)
4. WHEN saving settings THEN the system SHALL include all Meters settings (speed, hold time, decibel speed, RMS weighting)
5. WHEN saving settings THEN the system SHALL store both display values and internal values for each setting

### Requirement 4

**User Story:** As a user, I want a Reset Settings button, so that I can easily restore all settings to their default values.

#### Acceptance Criteria

1. WHEN the Reset Settings button is clicked THEN the system SHALL restore all settings to their default values
2. WHEN settings are reset THEN the system SHALL delete the settings file from disk
3. WHEN settings are reset THEN the system SHALL immediately apply the default values to the UI
4. WHEN the Reset Settings button is clicked THEN the system SHALL immediately reset settings without confirmation (optimized for touch screen interface)
5. WHEN settings are reset THEN the system SHALL provide visual feedback that the reset was successful

### Requirement 5

**User Story:** As a developer, I want settings to be saved during application shutdown, so that user preferences are not lost during normal application termination.

#### Acceptance Criteria

1. WHEN the application receives SIGTERM signal THEN the system SHALL save current settings before shutting down
2. WHEN the application receives SIGINT signal THEN the system SHALL save current settings before shutting down
3. WHEN the server is stopped normally THEN the system SHALL save current settings
4. WHEN saving during shutdown THEN the system SHALL complete the save operation before terminating
5. WHEN shutdown saving fails THEN the system SHALL log the error but continue shutdown

### Requirement 6

**User Story:** As a user, I want my settings to be automatically loaded when the application starts, so that my preferences are immediately available.

#### Acceptance Criteria

1. WHEN the application starts THEN the system SHALL check for an existing settings file
2. WHEN no settings file exists THEN the system SHALL create one with default values
3. WHEN a settings file exists THEN the system SHALL load and apply the saved settings
4. WHEN loading settings THEN the system SHALL validate the file format and content
5. WHEN settings validation fails THEN the system SHALL fall back to defaults and recreate the file

### Requirement 7

**User Story:** As a user, I want my settings to be validated when loaded, so that corrupted or invalid settings don't break the application.

#### Acceptance Criteria

1. WHEN loading settings THEN the system SHALL validate JSON syntax and structure
2. WHEN loading settings THEN the system SHALL validate that all required settings are present
3. WHEN loading settings THEN the system SHALL validate that setting values are within acceptable ranges
4. WHEN invalid settings are detected THEN the system SHALL use default values for invalid settings
5. WHEN settings validation fails completely THEN the system SHALL backup the corrupted file and create a new default file