# Version Management and Update Process

This document describes the version management system and update process for SpectraBox.

## Overview

SpectraBox includes a comprehensive version management and self-update system that allows the server to:

- Track the current version through a `Version.txt` file
- Check for updates from GitHub releases or commits
- Perform automatic updates with minimal user intervention
- Provide real-time update status through the web interface

## Configuration

### Update Configuration File

The update system is configured through `config/update-config.json`:

```json
{
  "github": {
    "owner": "mattstegner",
    "repository": "SpectraBox",
    "apiUrl": "https://api.github.com",
    "rateLimitCacheTimeout": 300000
  },
  "update": {
    "enabled": true,
    "checkInterval": 3600000,
    "autoUpdate": false,
    "updateScript": "./scripts/spectrabox-kiosk-install.sh",
    "backupBeforeUpdate": true,
    "maxUpdateAttempts": 3,
    "updateTimeout": 600000
  },
  "version": {
    "filePath": "./Version.txt",
    "format": "semantic",
    "fallbackValue": "unknown"
  },
  "security": {
    "validateVersionStrings": true,
    "maxVersionLength": 50,
    "allowedVersionPatterns": [
      "^\\d+\\.\\d+\\.\\d+(-[a-zA-Z0-9.-]+)?$",
      "^v?\\d+\\.\\d+(\\.\\d+)?$",
      "^[a-f0-9]{7,40}$",
      "^\\d{4}\\.\\d{2}\\.\\d{2}$",
      "^[a-zA-Z0-9.-]+$"
    ]
  }
}
```

### Configuration Options

#### GitHub Configuration
- `owner`: GitHub repository owner (default: "mattstegner")
- `repository`: GitHub repository name (default: "SpectraBox")
- `apiUrl`: GitHub API base URL (default: "https://api.github.com")
- `rateLimitCacheTimeout`: Cache timeout for rate limit info in milliseconds

#### Update Configuration
- `enabled`: Enable/disable update functionality (default: true)
- `checkInterval`: Interval between automatic update checks in milliseconds
- `autoUpdate`: Enable automatic updates without user confirmation (default: false)
- `updateScript`: Path to the update script (default: "./scripts/spectrabox-kiosk-install.sh")
- `backupBeforeUpdate`: Create backup before updating (default: true)
- `maxUpdateAttempts`: Maximum number of update attempts (default: 3)
- `updateTimeout`: Timeout for update process in milliseconds (default: 600000)

#### Version Configuration
- `filePath`: Path to version file (default: "./Version.txt")
- `format`: Version format type ("semantic", "commit", "date", "custom")
- `fallbackValue`: Value to use when version cannot be determined (default: "unknown")

#### Security Configuration
- `validateVersionStrings`: Enable version string validation (default: true)
- `maxVersionLength`: Maximum allowed version string length (default: 50)
- `allowedVersionPatterns`: Array of regex patterns for valid version formats

## Version File Management

### Version.txt File

The `Version.txt` file in the application root contains the current version:

```
1.0.0
```

### Version File Creation

During deployment, the version file is automatically created if it doesn't exist:

1. **From package.json**: Uses the version field from package.json
2. **From Git**: Uses `git describe --tags --always --dirty`
3. **Default**: Falls back to "1.0.0"

### Version Formats

The system supports multiple version formats:

- **Semantic Versioning**: `1.0.0`, `2.1.3-beta`
- **Simple Versions**: `1.0`, `v2.1`
- **Git Commit Hashes**: `a1b2c3d`, `a1b2c3d4e5f6789`
- **Date-based**: `2024.01.15`
- **Custom**: Any alphanumeric string with dots and dashes

## Update Process

### Update Flow

1. **Check for Updates**: Compare local version with GitHub releases/commits
2. **User Confirmation**: Display update information and request confirmation
3. **Backup Creation**: Create backup of current version (if enabled)
4. **Server Shutdown**: Gracefully shutdown active connections
5. **Update Execution**: Run the update script
6. **Verification**: Verify new version is running
7. **Cleanup**: Remove temporary files and restart services

### Update Methods

#### Manual Updates
Users can trigger updates through the web interface:
1. Navigate to Settings → Server tab
2. Click "Check for Updates"
3. If update available, click "Update Now"
4. Confirm the update when prompted

#### Automatic Updates (Optional)
When `autoUpdate` is enabled in configuration:
- System checks for updates at configured intervals
- Updates are applied automatically without user intervention
- Status updates are provided through WebSocket connections

### Update Script

The default update script (`scripts/spectrabox-kiosk-install.sh`) performs:

1. **System Updates**: Updates system packages
2. **Dependency Installation**: Installs/updates Node.js and dependencies
3. **Code Update**: Pulls latest code from GitHub
4. **Service Restart**: Restarts the SpectraBox service
5. **Verification**: Verifies the update was successful

### Update Status Tracking

Real-time update status is available through:

- **REST API**: `GET /api/update/status`
- **WebSocket**: Real-time status updates
- **Web Interface**: Live progress display

Status includes:
- Current status (idle, checking, updating, success, error)
- Progress percentage
- Status messages
- Error details (if applicable)
- Timestamps

## API Endpoints

### Version Management

#### GET /api/version
Returns current application version:

```json
{
  "success": true,
  "version": "1.0.0",
  "versionFile": {
    "available": true,
    "path": "/path/to/Version.txt"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### GET /api/update/check
Checks for available updates:

```json
{
  "success": true,
  "updateAvailable": true,
  "currentVersion": "1.0.0",
  "latestVersion": "1.1.0",
  "updateInfo": {
    "comparisonMethod": "release",
    "repositoryUrl": "https://github.com/mattstegner/SpectraBox",
    "lastChecked": "2024-01-15T10:30:00.000Z",
    "remoteInfo": {
      "version": "1.1.0",
      "publishedAt": "2024-01-15T09:00:00.000Z",
      "htmlUrl": "https://github.com/mattstegner/SpectraBox/releases/tag/v1.1.0"
    }
  }
}
```

#### POST /api/update/execute
Triggers the update process:

```json
{
  "success": true,
  "message": "Update process initiated. Server will restart automatically.",
  "currentVersion": "1.0.0",
  "latestVersion": "1.1.0",
  "userFriendlyMessage": "Updating from version 1.0.0 to 1.1.0. The server will restart automatically when complete."
}
```

#### GET /api/update/status
Returns current update status:

```json
{
  "success": true,
  "status": "updating",
  "message": "Installing dependencies...",
  "progress": 45,
  "timestamp": "2024-01-15T10:35:00.000Z"
}
```

## Security Considerations

### Version String Validation

All version strings are validated to prevent:
- Path traversal attacks
- Code injection
- Malformed data
- Excessive length

### Update Script Security

The update script runs with:
- Limited permissions
- Input validation
- Secure file operations
- Error handling and recovery

### API Security

Update endpoints include:
- Rate limiting
- Input validation
- Authentication checks (future enhancement)
- Error message sanitization

## Deployment Integration

### Initial Deployment

During initial deployment:

1. **Version File Creation**: Automatically creates Version.txt
2. **Configuration Setup**: Creates default configuration
3. **Script Permissions**: Sets proper execution permissions
4. **Service Configuration**: Configures systemd service

### Update Script Permissions

The update script requires:
- Execute permissions: `chmod +x scripts/spectrabox-kiosk-install.sh`
- Sudo access for system operations
- Write access to application directory
- Network access for downloading updates

### Environment Verification

The deployment process verifies:
- Node.js version compatibility
- Required system packages
- Network connectivity
- File system permissions
- Service configuration

## Troubleshooting

### Common Issues

#### Version File Missing
**Symptom**: Version shows as "unknown"
**Solution**: 
```bash
echo "1.0.0" > Version.txt
chown pi:pi Version.txt
```

#### Update Script Not Executable
**Symptom**: Update fails with permission error
**Solution**:
```bash
chmod +x scripts/spectrabox-kiosk-install.sh
```

#### GitHub API Rate Limiting
**Symptom**: Update check fails with rate limit error
**Solution**: Wait for rate limit reset or configure authentication

#### Network Connectivity Issues
**Symptom**: Cannot connect to GitHub
**Solution**: Check internet connection and firewall settings

### Logging

Update process logs are available through:
- **systemd journal**: `sudo journalctl -u spectrabox -f`
- **Application logs**: Check server.log file
- **Update status**: Monitor through web interface

### Recovery

If an update fails:
1. **Automatic Recovery**: System attempts to restore previous version
2. **Manual Recovery**: Restore from backup if available
3. **Fresh Installation**: Re-run deployment script if necessary

## Best Practices

### Version Management
- Use semantic versioning for releases
- Tag releases in GitHub
- Keep Version.txt file in sync with releases
- Test version comparison logic

### Update Process
- Test updates in development environment
- Create backups before updates
- Monitor update process through logs
- Verify functionality after updates

### Configuration
- Review configuration regularly
- Adjust timeouts based on system performance
- Enable security validation
- Monitor rate limits

### Monitoring
- Set up health checks
- Monitor update status
- Track version changes
- Log update attempts and results

## Related Documentation

- **[Release Management Guide](RELEASE_MANAGEMENT.md)** - Complete guide for creating and managing updates
- **[Deployment Guide](../DEPLOYMENT.md)** - Installation and deployment instructions
- **[API Documentation](#api-endpoints)** - Update-related API endpoints

## Future Enhancements

### Planned Features
- **Rollback Capability**: Ability to rollback to previous version
- **Update Scheduling**: Schedule updates for specific times
- **Update Notifications**: Email/webhook notifications for updates
- **Update History**: Track update history and changelog
- **Staged Updates**: Test updates before full deployment

### Configuration Enhancements
- **Environment-specific Configuration**: Different configs for dev/prod
- **Remote Configuration**: Load configuration from remote source
- **Configuration Validation**: Enhanced validation and error reporting
- **Dynamic Configuration**: Update configuration without restart