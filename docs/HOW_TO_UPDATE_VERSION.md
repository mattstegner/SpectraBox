# How to Update SpectraBox Version

This guide walks you through the complete process of releasing a new version of SpectraBox, from updating version numbers to creating the GitHub release.

## Quick Reference

```bash
# 1. Update version numbers
echo "1.2.0" > Version.txt
# Edit package.json version to "1.2.0"
# Edit CHANGELOG.md - change [Unreleased] to [1.2.0] - YYYY-MM-DD

# 2. Commit and push
git add -A
git commit -m "Release v1.2.0: Description of changes"
git push origin main

# 3. Create GitHub release (automated)
export GITHUB_TOKEN='your_token_here'
./scripts/create-release.sh
```

## Detailed Step-by-Step Guide

### Step 1: Update Version Numbers

Update the version in **three places**:

#### 1.1 Update `Version.txt`

```bash
echo "1.2.0" > Version.txt
```

Or manually edit the file to contain only:
```
1.2.0
```

#### 1.2 Update `package.json`

Edit the `version` field:

```json
{
  "name": "spectrabox",
  "version": "1.2.0",
  ...
}
```

**Using npm (alternative):**
```bash
npm version 1.2.0 --no-git-tag-version
```

#### 1.3 Update `CHANGELOG.md`

Change the `[Unreleased]` section to the new version with date:

**Before:**
```markdown
## [Unreleased]

### Added
- New feature X
- New feature Y
```

**After:**
```markdown
## [1.2.0] - 2025-10-20

### Added
- New feature X
- New feature Y

## [1.1.0] - 2025-10-20
...previous releases...
```

### Step 2: Commit and Push Changes

```bash
# Stage all changes
git add -A

# Commit with descriptive message
git commit -m "Release v1.2.0: Brief description of main changes

- Feature 1
- Feature 2
- Bug fix 3

Closes #123, #124"

# Push to GitHub
git push origin main
```

### Step 3: Create GitHub Release (Automated)

#### One-Time Setup: Get GitHub Token

1. Go to https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Name it: `SpectraBox Releases`
4. Select scope: **`repo`** (full control of repositories)
5. Click **"Generate token"**
6. Copy and save the token securely

**Store token in your shell profile (recommended):**

Add to `~/.zshrc` or `~/.bash_profile`:
```bash
export GITHUB_TOKEN='ghp_your_token_here'
```

Then reload:
```bash
source ~/.zshrc  # or source ~/.bash_profile
```

#### Run the Automated Release Script

```bash
./scripts/create-release.sh
```

The script will:
- ✅ Read version from `Version.txt` (e.g., 1.2.0)
- ✅ Extract release notes from `CHANGELOG.md`
- ✅ Show you a preview
- ✅ Ask for confirmation
- ✅ Create the GitHub release with tag `v1.2.0`
- ✅ Display the release URL

**Example output:**
```
[INFO] SpectraBox Release Creator

[INFO] Current version: 1.2.0

[INFO] Repository: mattstegner/SpectraBox
[INFO] Version to release: v1.2.0

Create this release? (y/N): y

[INFO] Creating release: SpectraBox v1.2.0
[INFO] Tag: v1.2.0
[INFO] Sending request to GitHub API...
[SUCCESS] Release created successfully!
[SUCCESS] Release URL: https://github.com/mattstegner/SpectraBox/releases/tag/v1.2.0
```

### Step 4: Verify the Release

#### 4.1 Check GitHub

Visit your repository releases page:
```
https://github.com/mattstegner/SpectraBox/releases
```

You should see your new release listed.

#### 4.2 Test Update Check (Local Development)

```bash
# Start your local server
node server.js

# In another terminal, check the version endpoint
curl -s -k https://localhost:3000/api/version | python3 -m json.tool

# Should show:
# "version": "1.2.0"

# Check for updates
curl -s -k https://localhost:3000/api/update/check | python3 -m json.tool

# Should show:
# "currentVersion": "1.2.0"
# "latestVersion": "1.2.0"
# "updateAvailable": false
```

#### 4.3 Test Update Check (From Raspberry Pi)

If you have SpectraBox deployed on a Raspberry Pi:

1. Navigate to Settings → Server tab
2. Click **"Check for Updates"**
3. It should show: "No updates available. Current version: 1.2.0"

## Version Numbering Guidelines

Follow [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`

### When to Increment

**MAJOR version (2.0.0)** - Breaking changes:
- Incompatible API changes
- Configuration format changes requiring manual intervention
- Removal of features
- Changes requiring users to modify their setup

**MINOR version (1.2.0)** - New features (backward compatible):
- New features or capabilities
- New settings or options
- Enhanced existing features
- New API endpoints

**PATCH version (1.1.1)** - Bug fixes (backward compatible):
- Bug fixes
- Security patches
- Performance improvements
- Documentation updates

### Examples

- `1.1.0` → `1.1.1` - Fixed a bug
- `1.1.1` → `1.2.0` - Added M/S processing feature
- `1.2.0` → `2.0.0` - Changed configuration file format (breaking)

## Complete Release Checklist

Use this checklist for each release:

### Pre-Release

- [ ] Test all features locally
- [ ] Run test suite: `npm test` or `npm run test:comprehensive`
- [ ] Update CHANGELOG.md with all changes since last release
- [ ] Update Version.txt with new version
- [ ] Update package.json version
- [ ] Review README.md for any needed updates
- [ ] Check that all documentation is current

### Release Process

- [ ] Commit version changes with descriptive message
- [ ] Push to GitHub: `git push origin main`
- [ ] Run release script: `./scripts/create-release.sh`
- [ ] Verify release appears on GitHub
- [ ] Test update check locally
- [ ] Test update check from deployed instance (if available)

### Post-Release

- [ ] Verify the release on GitHub releases page
- [ ] Test that users can successfully update
- [ ] Monitor for any issues reported
- [ ] Update CHANGELOG.md with new `[Unreleased]` section for future changes

## Troubleshooting

### Release Script Fails

**Error: "jq is not installed"**
```bash
# macOS
brew install jq

# Linux
sudo apt-get install jq
```

**Error: "401 Unauthorized"**
- Check your GitHub token is correct
- Verify token has `repo` scope
- Token may have expired - generate a new one

**Error: "422 Validation Failed" - Tag already exists**
- You already created this release
- Either delete the existing release/tag on GitHub, or increment the version

### Version Shows as "unknown"

1. Check Version.txt exists and contains valid version:
   ```bash
   cat Version.txt
   ```

2. Restart the server:
   ```bash
   sudo systemctl restart spectrabox  # On Raspberry Pi
   # or
   pkill -f "node.*server" && node server.js  # Local
   ```

### Update Check Shows Wrong Version

1. Clear the GitHub API cache by restarting server
2. Verify release exists on GitHub
3. Check that tag format is correct (`v1.2.0` not just `1.2.0`)

## Advanced: Manual Release (Without Script)

If the automated script doesn't work, you can create releases manually:

### Via GitHub Web Interface

1. Go to https://github.com/mattstegner/SpectraBox/releases
2. Click **"Create a new release"**
3. **Tag**: `v1.2.0` (create new tag)
4. **Release title**: `SpectraBox v1.2.0 - Brief Description`
5. **Description**: Copy content from CHANGELOG.md for this version
6. Click **"Publish release"**

### Via curl (Command Line)

```bash
# Set your variables
VERSION="1.2.0"
GITHUB_TOKEN="your_token_here"

# Get release notes from CHANGELOG.md
RELEASE_NOTES=$(awk '/^## \['"$VERSION"'\]/ { found=1; next } /^## \[/ { if (found) exit } found { print }' CHANGELOG.md)

# Create release
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/mattstegner/SpectraBox/releases \
  -d "{
    \"tag_name\": \"v${VERSION}\",
    \"name\": \"SpectraBox v${VERSION}\",
    \"body\": $(echo "$RELEASE_NOTES" | jq -Rs .),
    \"draft\": false,
    \"prerelease\": false
  }"
```

## Tips for Smooth Releases

1. **Maintain CHANGELOG.md**: Add entries as you develop, not all at release time
2. **Test before releasing**: Run comprehensive tests
3. **Use meaningful version numbers**: Follow semantic versioning
4. **Write good release notes**: Users need to know what changed
5. **Keep Version.txt in sync**: Always update it with package.json
6. **Tag consistently**: Always use `v` prefix (v1.2.0, not 1.2.0)

## Future: Automated Versioning

For even more automation in the future, consider:

- GitHub Actions workflow to auto-create releases
- npm scripts to update all version files at once
- Automated testing before release
- Changelog generation from commit messages

## Quick Reference Commands

```bash
# Check current version
cat Version.txt

# Update version (example: 1.3.0)
echo "1.3.0" > Version.txt
npm version 1.3.0 --no-git-tag-version

# Commit and push
git add -A
git commit -m "Release v1.3.0: Description"
git push origin main

# Create release
./scripts/create-release.sh

# Verify locally
curl -k https://localhost:3000/api/version | python3 -m json.tool
curl -k https://localhost:3000/api/update/check | python3 -m json.tool
```

## See Also

- [RELEASE_MANAGEMENT.md](RELEASE_MANAGEMENT.md) - Detailed release procedures
- [VERSION_MANAGEMENT.md](VERSION_MANAGEMENT.md) - Version system architecture
- [CHANGELOG.md](../CHANGELOG.md) - Version history

---

**Last Updated**: October 20, 2025  
**Version**: 1.1.0

