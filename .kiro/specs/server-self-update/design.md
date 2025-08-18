# Design Document

## Overview

The server self-update feature enables SpectraBox to automatically update its own software through the web interface. The system integrates with the existing Settings UI by adding a new "Server" tab that displays version information and provides update functionality. The design leverages GitHub's API to check for updates and uses the existing `spectrabox-kiosk-install.sh` script to perform the actual update process.

## Architecture

### High-Level Flow
1. **Version Display**: Read local version from `Version.txt` file and display in Server tab
2. **Update Check**: Query GitHub API to compare local vs. remote version
3. **Update Process**: If newer version available, gracefully shutdown server and execute update script
4. **Recovery**: Restart server after successful update or restore on failure

### Component Integration
- **Frontend**: New Server tab in existing Settings panel (`public/index.html`, `public/js/settings-persistence.js`)
- **Backend**: New API endpoints in `server.js` for version management and update operations
- **Update Mechanism**: Leverage existing `scripts/spectrabox-kiosk-install.sh` for actual update process
- **Version Management**: Simple `Version.txt` file in application root for version tracking

## Components and Interfaces

### Frontend Components

#### Server Settings Tab
- **Location**: New tab in existing Settings panel
- **UI Elements**:
  - Version display section showing current version from `Version.txt`
  - Update button to trigger update check and process
  - Status display for update progress and results
  - Error messaging for network/update failures

#### Settings Panel Integration
- **Tab Addition**: Add "Server" tab to existing tab structure in `public/index.html`
- **Event Handling**: Extend existing settings event system in `public/js/settings-persistence.js`
- **Styling**: Use existing CSS classes and styling patterns for consistency

### Backend API Endpoints

#### GET /api/version
- **Purpose**: Return current application version
- **Response**: JSON with version string from `Version.txt`
- **Error Handling**: Return "unknown" if file missing

#### GET /api/update/check
- **Purpose**: Check GitHub for latest version and compare with local
- **Response**: JSON with update availability status and version information
- **GitHub Integration**: Query GitHub API for latest release/commit information

#### POST /api/update/execute
- **Purpose**: Trigger the update process
- **Process**: 
  1. Validate update is available
  2. Gracefully shutdown server connections
  3. Execute update script
  4. Handle success/failure scenarios
- **Security**: Implement proper validation and error handling

### Version Management System

#### Version.txt File
- **Location**: Application root directory
- **Format**: Simple text file containing version string (e.g., "1.2.3" or commit hash)
- **Management**: Manually updated or automatically updated during deployment
- **Fallback**: Display "Version Unknown" if file missing

#### GitHub Integration
- **API Endpoint**: Use GitHub API to fetch latest release or commit information
- **Comparison Logic**: Compare local version string with remote version
- **Rate Limiting**: Implement appropriate caching and rate limiting for GitHub API calls

### Update Process Architecture

#### Update Script Integration
- **Script**: Leverage existing `scripts/spectrabox-kiosk-install.sh`
- **Execution**: Run script with appropriate permissions and environment
- **Process Management**: Handle script execution, monitoring, and cleanup

#### Server Lifecycle Management
- **Graceful Shutdown**: Close existing connections before update
- **Process Suspension**: Temporarily stop server during update
- **Restart Logic**: Automatically restart after successful update
- **Rollback**: Attempt to restore service if update fails

## Data Models

### Version Information
```javascript
{
  currentVersion: string,      // From Version.txt
  latestVersion: string,       // From GitHub API
  updateAvailable: boolean,    // Comparison result
  lastChecked: timestamp,      // Cache management
  githubUrl: string           // Repository URL
}
```

### Update Status
```javascript
{
  status: 'idle' | 'checking' | 'updating' | 'success' | 'error',
  message: string,             // User-friendly status message
  progress: number,            // Optional progress indicator
  error: string | null,        // Error details if applicable
  timestamp: timestamp         // When status was updated
}
```

### Server Configuration
```javascript
{
  version: string,             // Current version
  updateEnabled: boolean,      // Feature toggle
  githubRepo: string,          // Repository information
  updateScript: string         // Path to update script
}
```

## Error Handling

### Network Errors
- **GitHub API Failures**: Handle network timeouts, rate limiting, API unavailability
- **Fallback Behavior**: Graceful degradation when GitHub is unreachable
- **User Feedback**: Clear messaging about network-related issues

### Update Process Errors
- **Script Failures**: Handle update script execution errors
- **Permission Issues**: Handle insufficient permissions for file operations
- **Disk Space**: Check available space before attempting update
- **Recovery**: Attempt to restore previous version on failure

### Version Management Errors
- **Missing Version File**: Handle missing `Version.txt` gracefully
- **Invalid Version Format**: Validate version string format
- **Comparison Errors**: Handle version comparison edge cases

### UI Error States
- **Loading States**: Show appropriate loading indicators during operations
- **Error Messages**: Display user-friendly error messages with actionable guidance
- **Retry Mechanisms**: Provide retry options for failed operations

## Testing Strategy

### Unit Tests
- **Version Reading**: Test `Version.txt` file reading and parsing
- **GitHub API Integration**: Mock GitHub API responses and test comparison logic
- **Update Process**: Test update script execution and error handling
- **UI Components**: Test Server tab functionality and user interactions

### Integration Tests
- **End-to-End Update Flow**: Test complete update process in controlled environment
- **API Endpoint Testing**: Test all new API endpoints with various scenarios
- **Error Scenario Testing**: Test error handling and recovery mechanisms
- **UI Integration**: Test Settings panel integration and user experience

### Security Testing
- **Input Validation**: Test API endpoint input validation and sanitization
- **Permission Checks**: Verify appropriate permission handling for update operations
- **Script Execution**: Test secure execution of update script
- **Error Information Disclosure**: Ensure error messages don't leak sensitive information

### Performance Testing
- **GitHub API Caching**: Test caching mechanisms and rate limiting
- **Update Process Impact**: Measure impact on system resources during update
- **UI Responsiveness**: Test UI responsiveness during update operations
- **Memory Usage**: Monitor memory usage during update process

## Security Considerations

### Update Script Security
- **Script Validation**: Verify update script integrity before execution
- **Permission Management**: Run update script with minimal required permissions
- **Path Validation**: Validate all file paths and prevent directory traversal
- **Environment Isolation**: Isolate update process from main application

### API Security
- **Input Validation**: Validate all API inputs and parameters
- **Rate Limiting**: Implement rate limiting for update-related endpoints
- **Authentication**: Consider authentication for update operations (future enhancement)
- **Error Handling**: Prevent information disclosure through error messages

### Version Management Security
- **File Permissions**: Secure `Version.txt` file with appropriate permissions
- **GitHub API**: Use secure HTTPS connections for GitHub API calls
- **Version Validation**: Validate version strings to prevent injection attacks
- **Update Verification**: Verify update authenticity and integrity

## Implementation Notes

### Existing Code Integration
- **Settings System**: Integrate with existing settings persistence system
- **UI Framework**: Use existing CSS classes and JavaScript patterns
- **Error Handling**: Follow existing error handling patterns in `server.js`
- **Logging**: Use existing logger utility for update process logging

### Configuration Management
- **Feature Toggle**: Allow enabling/disabling update feature via configuration
- **GitHub Repository**: Configure GitHub repository URL and API endpoints
- **Update Script Path**: Configure path to update script
- **Version File Location**: Configure location of `Version.txt` file

### Deployment Considerations
- **Version File Creation**: Ensure `Version.txt` is created during deployment
- **Script Permissions**: Ensure update script has appropriate execution permissions
- **Service Management**: Consider systemd service restart after update
- **Backup Strategy**: Consider backup creation before update execution

### Future Enhancements
- **Automatic Updates**: Option for automatic updates without user intervention
- **Update Scheduling**: Schedule updates for specific times
- **Rollback Capability**: Ability to rollback to previous version
- **Update Notifications**: Notify users when updates are available
- **Update History**: Track update history and changelog display