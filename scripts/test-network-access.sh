#!/bin/bash

# Pi Audio Kiosk - Network Access Test Script
# This script tests network accessibility functionality

set -e

echo "🌐 Pi Audio Kiosk - Network Access Test"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

# Check if server is running
check_server() {
    local port=${1:-3000}
    local host=${2:-localhost}
    
    if curl -s "http://${host}:${port}/api/health" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Test server configuration endpoint
test_server_config() {
    local port=${1:-3000}
    local host=${2:-localhost}
    
    log_test "Testing server configuration endpoint..."
    
    local response=$(curl -s "http://${host}:${port}/api/server-config" 2>/dev/null || echo "")
    
    if [ -n "$response" ]; then
        echo "$response" | jq . 2>/dev/null || echo "$response"
        return 0
    else
        log_error "Failed to get server configuration"
        return 1
    fi
}

# Get local IP addresses
get_local_ips() {
    log_info "Local IP addresses:"
    
    # macOS
    if command -v ifconfig > /dev/null 2>&1; then
        ifconfig | grep "inet " | grep -v "127.0.0.1" | awk '{print "  • " $2}'
    # Linux
    elif command -v hostname > /dev/null 2>&1; then
        hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^$' | while read ip; do
            echo "  • $ip"
        done
    # Alternative for Linux
    elif command -v ip > /dev/null 2>&1; then
        ip addr show | grep "inet " | grep -v "127.0.0.1" | awk '{print "  • " $2}' | cut -d'/' -f1
    else
        log_warn "Could not determine local IP addresses"
    fi
}

# Test network accessibility
test_network_access() {
    local port=${1:-3000}
    
    log_test "Testing network accessibility on port $port..."
    
    # Test localhost access
    if check_server "$port" "localhost"; then
        log_info "✓ Server accessible on localhost:$port"
    else
        log_error "✗ Server not accessible on localhost:$port"
        return 1
    fi
    
    # Test 127.0.0.1 access
    if check_server "$port" "127.0.0.1"; then
        log_info "✓ Server accessible on 127.0.0.1:$port"
    else
        log_warn "✗ Server not accessible on 127.0.0.1:$port"
    fi
    
    # Test server configuration
    if test_server_config "$port" "localhost"; then
        log_info "✓ Server configuration endpoint working"
    else
        log_warn "✗ Server configuration endpoint not working"
    fi
    
    return 0
}

# Main test function
main() {
    local port=${1:-3000}
    
    log_info "Testing Pi Audio Kiosk network accessibility..."
    echo ""
    
    # Show local IP addresses
    get_local_ips
    echo ""
    
    # Test network access
    if test_network_access "$port"; then
        echo ""
        log_info "Network accessibility test completed successfully! 🎉"
        echo ""
        echo "Access URLs:"
        echo "  • Local: http://localhost:$port"
        echo "  • Network: http://<your-ip>:$port"
        echo ""
        echo "To test from another device on your network:"
        echo "  1. Find your IP address from the list above"
        echo "  2. Open a web browser on another device"
        echo "  3. Navigate to http://<your-ip>:$port"
        echo ""
        echo "Server Configuration:"
        test_server_config "$port" "localhost" | grep -E '(host|port|networkAccessible)' || true
    else
        echo ""
        log_error "Network accessibility test failed!"
        echo ""
        echo "Troubleshooting:"
        echo "  1. Make sure the Pi Audio Kiosk server is running"
        echo "  2. Check if the port $port is available"
        echo "  3. Verify firewall settings allow connections on port $port"
        echo "  4. Ensure the server is configured to bind to 0.0.0.0"
        return 1
    fi
}

# Check for dependencies
if ! command -v curl > /dev/null 2>&1; then
    log_error "curl is required but not installed"
    exit 1
fi

# Run the test
main "$@"