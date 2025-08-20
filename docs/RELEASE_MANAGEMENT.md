# Release Management Guide

This guide provides step-by-step instructions for creating and managing updates for SpectraBox, ensuring users can automatically detect and install new versions.

## Overview

SpectraBox uses a GitHub-based update system that can work with either:
1. **GitHub Releases** (recommended for stable versions)
2. **Git Commits** (for development/beta versions)

When users check for updates, the system compares their local version with the latest GitHub release or commit and automatically downloads and installs updates if available.

## Update Detection Methods

### Method 1: GitHub Releases (Recommended)
- Uses semantic versioning (e.g., v1.0.0, v1.1.0, v2.0.0)
- Provides release notes and changelog
- Stable, production-ready releases
- Better user experience with clear version information

### Method 2: Git Commits (Development)
- Uses commit hashes (e.g., a1b2c3d)
- Automatic updates on every commit
- Good for development/beta testing
- Less user-friendly version information

## Step-by-Step Release Process

### Phase 1: Prepare Your Code Changes

#### 1.1 Update Version Information
```bash
# Update the Version.txt file with your new version
echo "1.1.0" > Version.txt

# Or update package.json version (optional but recommended)
npm version patch  # For bug fixes (1.0.0 -> 1.0.1)
npm version minor  # For new features (1.0.0 -> 1.1.0)
npm version major  # For breaking changes (1.0.0 -> 2.0.0)
```

#### 1.2 Update Documentation
- Update CHANGELOG.md with new features, bug fixes, and breaking changes
- Update README.md if there are new installation or usage instructions
- Update any relevant documentation in the `docs/` folder

#### 1.3 Test Your Changes

**Basic Testing (Quick):**
```bash
# Run basic Jest tests (this is what npm test does)
npm test

# Run unit tests only (fastest)
npm run test:unit

# Test the update system specifically
npm test -- --testPathPattern=update
```

**Comprehensive Testing (Recommended for Releases):**
```bash
# Run ALL available tests (33+ test suites)
npm run test:comprehensive

# Or run specific test categories:
npm run test:integration    # Integration tests
npm run test:e2e           # End-to-end tests
npm run test:security      # Security tests
npm run test:performance   # Performance tests
npm run test:audio         # Audio device tests
npm run test:network       # Network accessibility tests
```

**Platform-Specific Testing:**
```bash
# Test on a Raspberry Pi if possible
./scripts/test-network-access.sh

# Cross-platform compatibility tests
npm run test:cross-platform
```

**What Each Command Does:**

- `npm test` - Runs basic Jest tests (subset of all tests)
- `npm run test:comprehensive` - Runs ALL 33+ test suites including:
  - Unit tests (fast component tests)
  - Integration tests (component interaction)
  - End-to-end tests (full user workflows)
  - Performance tests (Pi-specific performance)
  - Security tests (vulnerability checks)
  - Accessibility tests (web compliance)
  - Audio device tests (hardware interaction)
  - Network tests (kiosk mode, remote access)
  - Cross-platform tests (different OS compatibility)

**For Release Testing, Recommended Order:**
1. `npm run test:unit` (quick smoke test)
2. `npm run test:integration` (core functionality)
3. `npm run test:comprehensive` (full validation)
4. Manual testing on actual Raspberry Pi hardware

### Phase 2: Commit and Push Changes

#### 2.1 Commit Your Changes
```bash
# Stage all changes
git add .

# Commit with a descriptive message
git commit -m "Release v1.1.0: Add new spectrum analyzer features

- Added real-time frequency analysis
- Improved audio device detection
- Fixed memory leak in WebSocket connections
- Updated deployment scripts for better Pi compatibility

Closes #123, #124, #125"
```

#### 2.2 Push to GitHub
```bash
# Push to main branch
git push origin main

# Or push to your development branch first for testing
git push origin feature/new-release
```

### Phase 3: Create a GitHub Release (Method 1 - Recommended)

#### 3.1 Navigate to GitHub Releases
1. Go to your GitHub repository: `https://github.com/mattstegner/SpectraBox`
2. Click on "Releases" in the right sidebar
3. Click "Create a new release"

#### 3.2 Configure the Release
**Tag version:** `v1.1.0`
- Use semantic versioning with 'v' prefix
- Must be higher than the previous version
- Examples: v1.0.1, v1.1.0, v2.0.0

**Release title:** `SpectraBox v1.1.0 - Enhanced Spectrum Analysis`

**Description:** Write detailed release notes:
```markdown
## 🚀 New Features
- Real-time frequency analysis with improved accuracy
- Enhanced audio device detection and management
- New WebSocket-based live updates for spectrum data

## 🐛 Bug Fixes
- Fixed memory leak in WebSocket connections
- Resolved audio device enumeration issues on Raspberry Pi
- Improved error handling in update system

## 🔧 Improvements
- Updated deployment scripts for better Pi compatibility
- Enhanced logging and debugging capabilities
- Improved performance on low-memory devices

## 📋 Installation
For new installations:
```bash
curl -fsSL https://raw.githubusercontent.com/mattstegner/SpectraBox/main/scripts/spectrabox-kiosk-install.sh | sudo bash
```

For existing installations, the update will be available through the web interface:
1. Navigate to Settings → Server
2. Click "Check for Updates"
3. Click "Update Now" when prompted

## ⚠️ Breaking Changes
- None in this release

## 🔗 Full Changelog
See the [full changelog](https://github.com/mattstegner/SpectraBox/compare/v1.0.0...v1.1.0) for all changes.
```

#### 3.3 Attach Assets (Optional)
- You can attach pre-built packages or additional files
- Not required for SpectraBox since it builds from source

#### 3.4 Publish the Release
- Check "Set as the latest release" for stable releases
- Check "Set as a pre-release" for beta/alpha versions
- Click "Publish release"

### Phase 4: Verify Update Detection

#### 4.1 Test Update Detection
On a test installation:
```bash
# Check current version
curl http://localhost:3000/api/version

# Check for updates
curl http://localhost:3000/api/update/check

# Should return:
# {
#   "success": true,
#   "updateAvailable": true,
#   "currentVersion": "1.0.0",
#   "latestVersion": "1.1.0",
#   ...
# }
```

#### 4.2 Test Update Process
1. Open the web interface
2. Navigate to Settings → Server
3. Click "Check for Updates"
4. Verify it shows the new version
5. Click "Update Now" to test the full update process

### Phase 5: Monitor and Support

#### 5.1 Monitor Update Adoption
- Check GitHub release download statistics
- Monitor server logs for update attempts
- Watch for issues reported by users

#### 5.2 Handle Issues
- Monitor GitHub Issues for update-related problems
- Be prepared to create hotfix releases if needed
- Consider rollback procedures for critical issues

## Alternative: Commit-Based Updates (Method 2)

If you prefer commit-based updates instead of releases:

### 1. Just Push Your Changes
```bash
git add .
git commit -m "Improve spectrum analyzer performance"
git push origin main
```

### 2. Update Detection is Automatic
- The system will detect the new commit hash
- Users will see updates available immediately
- Version will show as the commit hash (e.g., "a1b2c3d")

### 3. Considerations
- Less user-friendly version information
- No release notes or changelog
- Every commit triggers an update notification
- Better for development/testing environments

## Version Numbering Guidelines

### Semantic Versioning (MAJOR.MINOR.PATCH)

**MAJOR version (2.0.0)** - Incompatible API changes:
- Breaking changes to configuration format
- Removal of features or APIs
- Changes requiring manual intervention

**MINOR version (1.1.0)** - New functionality (backward compatible):
- New features or capabilities
- New API endpoints
- Enhanced existing features

**PATCH version (1.0.1)** - Bug fixes (backward compatible):
- Bug fixes
- Security patches
- Performance improvements

### Examples:
- `1.0.0` → `1.0.1` (bug fix)
- `1.0.1` → `1.1.0` (new feature)
- `1.1.0` → `2.0.0` (breaking change)

## Configuration Changes

### Adding New Configuration Options

If your update includes new configuration options:

#### 1. Update Default Configuration
Edit `scripts/init-config.js` and add new options to `DEFAULT_CONFIG`:
```javascript
const DEFAULT_CONFIG = {
  // ... existing config ...
  newFeature: {
    enabled: true,
    setting1: "default_value",
    setting2: 42
  }
};
```

#### 2. Update Configuration Manager
If needed, update `utils/configManager.js` to handle validation of new options.

#### 3. Test Configuration Migration
The `init-config.js` script will automatically merge new options with existing user configurations during updates.

## Deployment Script Updates

### Updating the Installation Script

If you need to update the deployment process:

#### 1. Update the Script
Edit `scripts/spectrabox-kiosk-install.sh` with your changes.

#### 2. Test Thoroughly
```bash
# Test on a clean Raspberry Pi
./scripts/spectrabox-kiosk-install.sh

# Test update scenarios
# (on a system with existing installation)
./scripts/spectrabox-kiosk-install.sh
```

#### 3. Update Documentation
Update `DEPLOYMENT.md` with any new requirements or changes.

## Rollback Procedures

### If an Update Causes Issues

#### 1. Quick Rollback via Git
```bash
# Revert to previous version
git revert HEAD
git push origin main

# Or reset to specific version
git reset --hard v1.0.0
git push --force origin main
```

#### 2. Create Hotfix Release
```bash
# Create hotfix branch
git checkout -b hotfix/v1.1.1

# Fix the issue
# ... make changes ...

# Commit and release
git commit -m "Hotfix v1.1.1: Fix critical update issue"
git push origin hotfix/v1.1.1

# Create release v1.1.1 following the normal process
```

#### 3. User Recovery
Users can manually rollback by:
```bash
cd /home/pi/spectrabox
git checkout v1.0.0  # or previous working version
sudo systemctl restart spectrabox
```

## Automation Options

### GitHub Actions (Optional)

You can automate releases with GitHub Actions:

```yaml
# .github/workflows/release.yml
name: Create Release
on:
  push:
    tags:
      - 'v*'
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Create Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ github.ref }}
          release_name: Release ${{ github.ref }}
          draft: false
          prerelease: false
```

### Automated Testing

Set up automated testing before releases:
```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
```

## Testing Strategy for Releases

### Understanding the Test Suite

SpectraBox has **33+ test files** covering different aspects:

| Test Category | Files | What It Tests | When to Run |
|---------------|-------|---------------|-------------|
| **Unit Tests** | `unit-fast.test.js` | Individual components | Every commit |
| **Integration** | `integration.test.js`, `server.test.js` | Component interaction | Before releases |
| **Update System** | `update-*.test.js` (12 files) | Self-update functionality | Always for releases |
| **Audio** | `audio-device-*.test.js` | Hardware interaction | Hardware changes |
| **Performance** | `pi-performance.test.js` | Pi-specific performance | Pi-related changes |
| **Security** | `security-*.test.js` | Vulnerability checks | Security changes |
| **E2E** | `e2e-*.test.js`, `comprehensive-*.test.js` | Full user workflows | Major releases |
| **Network** | `network-*.test.js` | Remote access, kiosk | Network changes |
| **Cross-Platform** | `cross-platform-*.test.js` | OS compatibility | Platform changes |

### Testing Commands Explained

**`npm test`** (Basic - what you asked about):
- Runs: Basic Jest tests only
- Duration: ~30 seconds
- Coverage: Core functionality only
- **Answer: NO, this does NOT run all available tests**

**`npm run test:comprehensive`** (Complete):
- Runs: All 33+ test files
- Duration: ~10-15 minutes
- Coverage: Everything including hardware simulation
- **This runs ALL available tests for the entire codebase**

### Recommended Testing for Releases

#### Pre-Release Testing Checklist:
```bash
# 1. Quick smoke test (30 seconds)
npm run test:unit

# 2. Core functionality (2-3 minutes)
npm run test:integration

# 3. Update system validation (3-4 minutes)
npm test -- --testPathPattern=update

# 4. Full comprehensive test (10-15 minutes)
npm run test:comprehensive

# 5. Platform-specific validation
./scripts/test-network-access.sh
```

#### What Gets Tested:
- ✅ **Server functionality** (API endpoints, WebSocket)
- ✅ **Update system** (GitHub integration, version management)
- ✅ **Audio device handling** (enumeration, selection)
- ✅ **Spectrum analyzer** (real-time processing)
- ✅ **User interface** (settings, preferences)
- ✅ **Security** (input validation, rate limiting)
- ✅ **Performance** (memory usage, CPU efficiency)
- ✅ **Network access** (remote connections, kiosk mode)
- ✅ **Cross-platform** (different OS compatibility)
- ✅ **Error handling** (graceful failures, recovery)

## Best Practices

### 1. Release Frequency
- **Patch releases**: As needed for critical bugs
- **Minor releases**: Monthly or bi-monthly for new features
- **Major releases**: Quarterly or bi-annually for significant changes

### 2. Testing Strategy
- Test on actual Raspberry Pi hardware
- Test both fresh installations and updates
- Test with different Pi models and OS versions
- Verify all update mechanisms work correctly

### 3. Communication
- Write clear, detailed release notes
- Highlight breaking changes prominently
- Provide migration guides for major updates
- Use GitHub Discussions or Issues for user feedback

### 4. Backup Strategy
- Always test rollback procedures
- Document recovery steps for users
- Consider automatic backup creation during updates

### 5. Version Management
- Keep Version.txt in sync with releases
- Use consistent version numbering
- Tag releases properly in Git
- Maintain a changelog

## Troubleshooting Common Issues

### Users Not Seeing Updates
1. Check GitHub release is published and marked as "latest"
2. Verify Version.txt contains correct version number
3. Check user's internet connectivity
4. Verify GitHub API rate limits aren't exceeded

### Update Process Failing
1. Check deployment script permissions
2. Verify all dependencies are available
3. Check disk space on user's system
4. Review system logs for specific errors

### Version Comparison Issues
1. Ensure version format is consistent
2. Check for extra whitespace in Version.txt
3. Verify semantic versioning format
4. Test version comparison logic

## Quick Reference Checklist

### For Each Release:
- [ ] Update Version.txt
- [ ] Update package.json version (optional)
- [ ] Update CHANGELOG.md
- [ ] Run full test suite
- [ ] Commit and push changes
- [ ] Create GitHub release with proper tag
- [ ] Write detailed release notes
- [ ] Test update detection
- [ ] Test update process
- [ ] Monitor for issues

### For Hotfixes:
- [ ] Create hotfix branch
- [ ] Fix critical issue
- [ ] Test thoroughly
- [ ] Create patch release
- [ ] Notify users if needed

This process ensures that your users will automatically detect and be able to install your updates through the built-in update system.

## Practical Example: Creating Your First Update

Let's walk through creating a sample update from the current version (1.0) to version 1.1.0:

### Step 1: Make Your Changes
```bash
# Example: Add a new feature or fix a bug
echo "// New feature added" >> public/js/spectrum-analyzer.js
```

### Step 2: Update Version
```bash
# Update the version file
echo "1.1.0" > Version.txt

# Optionally update package.json
npm version minor  # Updates to 1.1.0
```

### Step 3: Commit Changes
```bash
git add .
git commit -m "Release v1.1.0: Improve spectrum analyzer performance

- Enhanced frequency resolution
- Reduced CPU usage by 15%
- Fixed memory leak in WebSocket connections
- Improved error handling

Closes #45, #46"
```

### Step 4: Push to GitHub
```bash
git push origin main
```

### Step 5: Create GitHub Release
1. Go to https://github.com/mattstegner/SpectraBox/releases
2. Click "Create a new release"
3. Tag: `v1.1.0`
4. Title: `SpectraBox v1.1.0 - Performance Improvements`
5. Description:
```markdown
## 🚀 What's New
- Enhanced spectrum analyzer with better frequency resolution
- Reduced CPU usage by 15% for better Raspberry Pi performance
- Improved WebSocket connection stability

## 🐛 Bug Fixes
- Fixed memory leak in WebSocket connections
- Resolved audio device detection issues
- Better error handling throughout the application

## 📦 Installation
New users can install with:
```bash
curl -fsSL https://raw.githubusercontent.com/mattstegner/SpectraBox/main/scripts/spectrabox-kiosk-install.sh | sudo bash
```

Existing users will see the update notification in their web interface.
```
6. Click "Publish release"

### Step 6: Verify Update Works
Test on an existing installation:
```bash
# Check current version
curl http://localhost:3000/api/version
# Should show: "version": "1.0"

# Check for updates
curl http://localhost:3000/api/update/check
# Should show: "updateAvailable": true, "latestVersion": "1.1.0"
```

### Step 7: Test the Update Process
1. Open web interface: http://your-pi-ip:3000
2. Go to Settings → Server
3. Click "Check for Updates" - should show v1.1.0 available
4. Click "Update Now" - should download and install automatically
5. After restart, verify version is now 1.1.0

That's it! Your users will now be able to automatically update to your new version.

## Quick Command Reference

```bash
# Create and publish a new release
echo "1.2.0" > Version.txt
git add .
git commit -m "Release v1.2.0: Your changes here"
git push origin main
# Then create GitHub release with tag v1.2.0

# Test update detection
curl http://localhost:3000/api/update/check

# Check current version
curl http://localhost:3000/api/version

# View update status
curl http://localhost:3000/api/update/status
```