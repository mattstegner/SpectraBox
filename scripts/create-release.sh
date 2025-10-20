#!/bin/bash

# SpectraBox Release Creation Script
# Automates the creation of GitHub releases using the GitHub API

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_OWNER="mattstegner"
REPO_NAME="SpectraBox"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Function to print colored messages
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Read version from Version.txt
get_current_version() {
    if [ -f "$PROJECT_ROOT/Version.txt" ]; then
        cat "$PROJECT_ROOT/Version.txt" | tr -d '\n' | tr -d '\r'
    else
        print_error "Version.txt not found!"
        exit 1
    fi
}

# Generate release notes from CHANGELOG.md
generate_release_notes() {
    local version=$1
    local changelog_file="$PROJECT_ROOT/CHANGELOG.md"
    
    if [ ! -f "$changelog_file" ]; then
        print_warning "CHANGELOG.md not found, using default release notes"
        echo "Release v${version}"
        return
    fi
    
    # Extract the section for this version from CHANGELOG.md
    # This is a simple extraction - adjust the awk command if your format differs
    awk -v ver="$version" '
        /^## \['"$version"'\]/ { found=1; next }
        /^## \[/ { if (found) exit }
        found { print }
    ' "$changelog_file"
}

# Create GitHub release using API
create_github_release() {
    local version=$1
    local tag_name="v${version}"
    local release_name="SpectraBox v${version}"
    local github_token=$2
    
    print_info "Creating release: $release_name"
    print_info "Tag: $tag_name"
    
    # Generate release notes
    local release_body=$(generate_release_notes "$version")
    
    if [ -z "$release_body" ]; then
        release_body="Release version ${version}"
    fi
    
    # Escape the release body for JSON
    local escaped_body=$(echo "$release_body" | jq -Rs .)
    
    # Create the JSON payload
    local json_payload=$(cat <<EOF
{
  "tag_name": "${tag_name}",
  "name": "${release_name}",
  "body": ${escaped_body},
  "draft": false,
  "prerelease": false
}
EOF
)
    
    print_info "Sending request to GitHub API..."
    
    # Make the API request
    local response=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Accept: application/vnd.github+json" \
        -H "Authorization: Bearer ${github_token}" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases" \
        -d "$json_payload")
    
    # Extract HTTP status code (last line)
    local http_code=$(echo "$response" | tail -n1)
    # Extract response body (all but last line)
    local response_body=$(echo "$response" | sed '$d')
    
    # Check if successful
    if [ "$http_code" = "201" ]; then
        local release_url=$(echo "$response_body" | jq -r '.html_url')
        print_success "Release created successfully!"
        print_success "Release URL: $release_url"
        return 0
    else
        print_error "Failed to create release (HTTP $http_code)"
        echo "$response_body" | jq '.' 2>/dev/null || echo "$response_body"
        return 1
    fi
}

# Main script
main() {
    print_info "SpectraBox Release Creator"
    echo ""
    
    # Check dependencies
    if ! command_exists jq; then
        print_error "jq is not installed. Please install it first:"
        echo "  macOS: brew install jq"
        echo "  Linux: sudo apt-get install jq"
        exit 1
    fi
    
    if ! command_exists curl; then
        print_error "curl is not installed"
        exit 1
    fi
    
    # Get current version
    local version=$(get_current_version)
    print_info "Current version: $version"
    echo ""
    
    # Check for GitHub token
    local github_token="${GITHUB_TOKEN:-}"
    
    if [ -z "$github_token" ]; then
        print_warning "GitHub token not found in GITHUB_TOKEN environment variable"
        echo ""
        echo "To create a GitHub Personal Access Token:"
        echo "  1. Go to https://github.com/settings/tokens"
        echo "  2. Click 'Generate new token' → 'Generate new token (classic)'"
        echo "  3. Give it a name (e.g., 'SpectraBox Releases')"
        echo "  4. Select scopes: 'repo' (full control of private repositories)"
        echo "  5. Click 'Generate token' and copy it"
        echo ""
        echo "Then run this script with:"
        echo "  export GITHUB_TOKEN='your_token_here'"
        echo "  ./scripts/create-release.sh"
        echo ""
        echo "Or provide it when prompted:"
        echo ""
        read -sp "Enter GitHub Token: " github_token
        echo ""
        
        if [ -z "$github_token" ]; then
            print_error "No token provided. Exiting."
            exit 1
        fi
    fi
    
    echo ""
    print_info "Repository: ${REPO_OWNER}/${REPO_NAME}"
    print_info "Version to release: v${version}"
    echo ""
    
    # Confirm
    read -p "Create this release? (y/N): " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        print_info "Release creation cancelled"
        exit 0
    fi
    
    echo ""
    
    # Create the release
    if create_github_release "$version" "$github_token"; then
        echo ""
        print_success "Release v${version} created successfully!"
        print_info "The update will now be available to users running SpectraBox"
    else
        echo ""
        print_error "Failed to create release"
        exit 1
    fi
}

# Run main function
main "$@"

