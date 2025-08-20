/**
 * Server Management
 * 
 * Handles server version display and update functionality
 */

class ServerManager {
  constructor() {
    this.isInitialized = false;
    this.currentVersion = null;
    this.updateInfo = null;
    this.isCheckingUpdates = false;
    this.isUpdating = false;
    this.websocket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    
    // DOM elements
    this.elements = {
      currentVersionDisplay: null,
      updateStatusDisplay: null,
      checkUpdatesBtn: null,
      performUpdateBtn: null,
      repositoryInfoDisplay: null,
      closeKioskBtn: null,
      rebootServerBtn: null
    };
  }

  /**
   * Initialize the server manager
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // Get DOM elements
      this.elements.currentVersionDisplay = document.getElementById('currentVersionDisplay');
      this.elements.updateStatusDisplay = document.getElementById('updateStatusDisplay');
      this.elements.checkUpdatesBtn = document.getElementById('checkUpdatesBtn');
      this.elements.performUpdateBtn = document.getElementById('performUpdateBtn');
      this.elements.repositoryInfoDisplay = document.getElementById('repositoryInfoDisplay');
      this.elements.closeKioskBtn = document.getElementById('closeKioskBtn');
      this.elements.rebootServerBtn = document.getElementById('rebootServerBtn');

      // Check if elements exist (server tab might not be visible)
      if (!this.elements.currentVersionDisplay) {
        console.log('Server tab elements not found, skipping server manager initialization');
        return;
      }

      // Attach event listeners
      this.attachEventListeners();

      // Initialize WebSocket connection for real-time updates
      this.initializeWebSocket();

      // Load initial version information
      await this.loadCurrentVersion();

      // Load initial update status
      await this.loadUpdateStatus();

      this.isInitialized = true;
      console.log('ServerManager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize ServerManager:', error);
    }
  }

  /**
   * Initialize WebSocket connection for real-time update status
   */
  initializeWebSocket() {
    try {
      // Determine WebSocket URL based on current page protocol
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;
      
      console.log('Connecting to WebSocket:', wsUrl);
      
      this.websocket = new WebSocket(wsUrl);
      
      this.websocket.onopen = () => {
        console.log('WebSocket connected for update status');
        this.reconnectAttempts = 0;
      };
      
      this.websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'updateStatus') {
            this.handleUpdateStatusMessage(data);
          } else if (data.type === 'serverShutdown') {
            this.handleServerShutdownMessage(data);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      this.websocket.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason);
        this.websocket = null;
        
        // Handle different closure scenarios
        if (this.isUpdating) {
          // During update, show connection lost message but continue monitoring
          this.showUpdateConnectionLost();
          this.startUpdateReconnectionProcess();
        } else {
          // Normal reconnection logic for non-update scenarios
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect WebSocket (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            
            setTimeout(() => {
              this.initializeWebSocket();
            }, this.reconnectDelay * this.reconnectAttempts);
          }
        }
      };
      
      this.websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
      
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
    }
  }

  /**
   * Handle update status messages from WebSocket
   */
  handleUpdateStatusMessage(data) {
    console.log('Received update status:', data);
    
    // Update UI based on status
    this.displayUpdateStatusFromWebSocket(data);
    
    // Handle different status types
    switch (data.status) {
      case 'updating':
        this.isUpdating = true;
        this.elements.performUpdateBtn.disabled = true;
        this.elements.checkUpdatesBtn.disabled = true;
        this.showUpdateInProgressNotification(data);
        break;
        
      case 'success':
        this.isUpdating = false;
        // Keep buttons disabled as server will restart
        this.showUpdateSuccess(data.message);
        break;
        
      case 'error':
        this.handleUpdateCompletion();
        this.showUpdateError(data.message, data.error);
        break;
        
      case 'idle':
      default:
        this.isUpdating = false;
        this.elements.checkUpdatesBtn.disabled = false;
        // performUpdateBtn state depends on whether update is available
        break;
    }
  }

  /**
   * Show update in progress notification with enhanced user communication
   */
  showUpdateInProgressNotification(data) {
    // Create or update a persistent notification overlay
    this.createUpdateNotificationOverlay(data);
    
    // Also show browser notification if supported
    this.showBrowserNotification('Update in Progress', data.message);
  }

  /**
   * Create update notification overlay for better user visibility
   */
  createUpdateNotificationOverlay(data) {
    // Remove existing overlay if present
    const existingOverlay = document.getElementById('updateNotificationOverlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }

    // Create new overlay
    const overlay = document.createElement('div');
    overlay.id = 'updateNotificationOverlay';
    overlay.className = 'update-notification-overlay';
    
    const progressPercentage = data.progress || 0;
    
    overlay.innerHTML = `
      <div class="update-notification-content">
        <div class="update-notification-header">
          <div class="update-icon">🔄</div>
          <div class="update-title">Server Update in Progress</div>
        </div>
        <div class="update-notification-body">
          <div class="update-message">${data.message}</div>
          <div class="update-progress-container">
            <div class="update-progress-bar">
              <div class="update-progress-fill" style="width: ${progressPercentage}%"></div>
            </div>
            <div class="update-progress-text">${progressPercentage}% Complete</div>
          </div>
          <div class="update-notification-info">
            <p>⚠️ Please do not close this browser tab or navigate away</p>
            <p>The page will automatically reload when the update is complete</p>
            <div class="update-timestamp">Started: ${new Date(data.timestamp).toLocaleTimeString()}</div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
  }

  /**
   * Show browser notification if supported
   */
  showBrowserNotification(title, message) {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, {
          body: message,
          icon: '/favicon.ico',
          tag: 'spectrabox-update'
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            new Notification(title, {
              body: message,
              icon: '/favicon.ico',
              tag: 'spectrabox-update'
            });
          }
        });
      }
    }
  }

  /**
   * Show connection lost message during update
   */
  showUpdateConnectionLost() {
    const overlay = document.getElementById('updateNotificationOverlay');
    if (overlay) {
      const messageElement = overlay.querySelector('.update-message');
      const infoElement = overlay.querySelector('.update-notification-info');
      
      if (messageElement) {
        messageElement.innerHTML = `
          <div class="connection-lost-message">
            ⚠️ Connection to server lost during update
          </div>
          <div class="connection-status">Attempting to reconnect...</div>
        `;
      }
      
      if (infoElement) {
        infoElement.innerHTML = `
          <p>🔄 The server is restarting as part of the update process</p>
          <p>This is normal - please wait while we reconnect</p>
          <p>The page will reload automatically when the update is complete</p>
          <div class="reconnection-attempts">Reconnection attempts: <span id="reconnectAttemptCount">0</span></div>
        `;
      }
    }
  }

  /**
   * Start reconnection process during update
   */
  startUpdateReconnectionProcess() {
    let reconnectAttempts = 0;
    const maxUpdateReconnectAttempts = 60; // Try for 5 minutes during update
    const updateReconnectDelay = 5000; // 5 seconds between attempts during update
    
    const attemptReconnect = () => {
      reconnectAttempts++;
      
      // Update UI with attempt count
      const attemptCountElement = document.getElementById('reconnectAttemptCount');
      if (attemptCountElement) {
        attemptCountElement.textContent = reconnectAttempts;
      }
      
      console.log(`Update reconnection attempt ${reconnectAttempts}/${maxUpdateReconnectAttempts}`);
      
      // Try to reconnect WebSocket
      this.initializeWebSocket();
      
      // If WebSocket connection fails, try again
      setTimeout(() => {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
          if (reconnectAttempts < maxUpdateReconnectAttempts) {
            attemptReconnect();
          } else {
            // Max attempts reached, show timeout message
            this.showUpdateReconnectionTimeout();
          }
        } else {
          // Successfully reconnected
          this.showUpdateReconnectionSuccess();
        }
      }, updateReconnectDelay);
    };
    
    // Start reconnection attempts
    setTimeout(attemptReconnect, updateReconnectDelay);
  }

  /**
   * Show reconnection timeout message
   */
  showUpdateReconnectionTimeout() {
    const overlay = document.getElementById('updateNotificationOverlay');
    if (overlay) {
      const messageElement = overlay.querySelector('.update-message');
      const infoElement = overlay.querySelector('.update-notification-info');
      
      if (messageElement) {
        messageElement.innerHTML = `
          <div class="connection-timeout-message">
            ⏰ Update is taking longer than expected
          </div>
        `;
      }
      
      if (infoElement) {
        infoElement.innerHTML = `
          <p>The server update may still be in progress</p>
          <p>You can try refreshing the page manually, or wait a bit longer</p>
          <button id="manualRefreshBtn" class="manual-refresh-btn">Refresh Page Now</button>
          <div class="timeout-info">If problems persist, check the server logs</div>
        `;
        
        // Add manual refresh button handler
        const refreshBtn = document.getElementById('manualRefreshBtn');
        if (refreshBtn) {
          refreshBtn.addEventListener('click', () => {
            this.performPageReload('Manual refresh after timeout');
          });
        }
      }
    }
  }

  /**
   * Show successful reconnection message
   */
  showUpdateReconnectionSuccess() {
    console.log('Successfully reconnected during update');
    
    const overlay = document.getElementById('updateNotificationOverlay');
    if (overlay) {
      const messageElement = overlay.querySelector('.update-message');
      
      if (messageElement) {
        messageElement.innerHTML = `
          <div class="connection-restored-message">
            ✅ Connection restored - monitoring update progress
          </div>
        `;
      }
    }
  }

  /**
   * Handle server shutdown message
   */
  handleServerShutdownMessage(data) {
    console.log('Received server shutdown notification:', data);
    
    // Update the notification overlay with shutdown information
    const overlay = document.getElementById('updateNotificationOverlay');
    if (overlay) {
      const messageElement = overlay.querySelector('.update-message');
      const infoElement = overlay.querySelector('.update-notification-info');
      
      if (messageElement) {
        messageElement.innerHTML = `
          <div class="server-shutdown-message">
            🔄 ${data.message}
          </div>
        `;
      }
      
      if (infoElement) {
        infoElement.innerHTML = `
          <p>⏱️ Expected downtime: ${data.expectedDowntime || '2-5 minutes'}</p>
          <p>🔄 ${data.reconnectInstructions || 'The page will automatically reload when complete'}</p>
          <p>⚠️ Please keep this tab open and do not navigate away</p>
          <div class="shutdown-timestamp">Shutdown started: ${new Date(data.timestamp).toLocaleTimeString()}</div>
        `;
      }
    } else {
      // Create overlay if it doesn't exist
      this.createUpdateNotificationOverlay({
        message: data.message,
        progress: 30,
        timestamp: data.timestamp
      });
    }

    // Show browser notification
    this.showBrowserNotification('Server Update', data.message);
    
    // Prepare for connection loss
    this.isUpdating = true;
  }

  /**
   * Clean up update notification overlay
   */
  cleanupUpdateNotification() {
    const overlay = document.getElementById('updateNotificationOverlay');
    if (overlay) {
      overlay.remove();
    }
  }

  /**
   * Handle update completion cleanup
   */
  handleUpdateCompletion() {
    // Clean up any existing overlays
    this.cleanupUpdateNotification();
    
    // Reset update state
    this.isUpdating = false;
    
    // Re-enable buttons
    if (this.elements.checkUpdatesBtn) {
      this.elements.checkUpdatesBtn.disabled = false;
    }
    if (this.elements.performUpdateBtn) {
      this.elements.performUpdateBtn.disabled = false;
    }
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    if (this.elements.checkUpdatesBtn) {
      this.elements.checkUpdatesBtn.addEventListener('click', () => {
        this.checkForUpdates();
      });
    }

    if (this.elements.performUpdateBtn) {
      this.elements.performUpdateBtn.addEventListener('click', () => {
        this.performUpdate();
      });
    }

    if (this.elements.closeKioskBtn) {
      this.elements.closeKioskBtn.addEventListener('click', () => {
        this.closeKiosk();
      });
    }

    if (this.elements.rebootServerBtn) {
      this.elements.rebootServerBtn.addEventListener('click', () => {
        this.rebootServer();
      });
    }
  }

  /**
   * Load current version from server
   */
  async loadCurrentVersion() {
    try {
      this.showVersionLoading(true);

      const response = await fetch('/api/version');
      const data = await response.json();

      if (data.success) {
        this.currentVersion = data.version;
        this.displayCurrentVersion(data);
      } else {
        throw new Error(data.message || 'Failed to load version');
      }
    } catch (error) {
      console.error('Error loading current version:', error);
      this.displayVersionError(error.message);
    } finally {
      this.showVersionLoading(false);
    }
  }

  /**
   * Load current update status from server
   */
  async loadUpdateStatus() {
    try {
      const response = await fetch('/api/update/status');
      const data = await response.json();

      if (data.success) {
        this.handleUpdateStatusMessage(data);
      } else {
        console.warn('Failed to load update status:', data.message);
      }
    } catch (error) {
      console.error('Error loading update status:', error);
    }
  }

  /**
   * Check for updates from GitHub
   */
  async checkForUpdates() {
    if (this.isCheckingUpdates) {
      return;
    }

    try {
      this.isCheckingUpdates = true;
      this.showUpdateStatus('checking', 'Checking for updates...');
      this.elements.checkUpdatesBtn.disabled = true;
      this.elements.checkUpdatesBtn.textContent = 'Checking...';

      const response = await fetch('/api/update/check');
      const data = await response.json();

      if (data.success) {
        this.updateInfo = data;
        this.displayUpdateStatus(data);
      } else {
        throw new Error(data.message || 'Failed to check for updates');
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
      this.showUpdateStatus('error', `Error checking for updates: ${error.message}`);
    } finally {
      this.isCheckingUpdates = false;
      this.elements.checkUpdatesBtn.disabled = false;
      this.elements.checkUpdatesBtn.textContent = 'Check for Updates';
    }
  }

  /**
   * Perform server update
   */
  async performUpdate() {
    if (this.isUpdating || !this.updateInfo || !this.updateInfo.updateAvailable) {
      return;
    }

    // Confirm with user before proceeding
    const confirmMessage = `Are you sure you want to update from version ${this.updateInfo.currentVersion} to ${this.updateInfo.latestVersion}?\n\nThe server will restart automatically during the update process.`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      this.isUpdating = true;
      this.elements.performUpdateBtn.disabled = true;
      this.elements.checkUpdatesBtn.disabled = true;
      this.elements.performUpdateBtn.textContent = 'Updating...';
      
      // Show initial update status
      this.showUpdateStatus('updating', 'Initiating update process...');

      const response = await fetch('/api/update/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        // Update will be tracked via WebSocket from here
        console.log('Update process initiated:', data);
      } else {
        throw new Error(data.message || 'Failed to initiate update');
      }
    } catch (error) {
      console.error('Error performing update:', error);
      this.showUpdateStatus('error', `Error initiating update: ${error.message}`);
      
      // Reset button states
      this.isUpdating = false;
      this.elements.performUpdateBtn.disabled = false;
      this.elements.checkUpdatesBtn.disabled = false;
      this.elements.performUpdateBtn.textContent = 'Update Server';
    }
  }

  /**
   * Close kiosk mode
   */
  async closeKiosk() {
    // Confirm with user before proceeding
    const confirmMessage = 'Close kiosk now?\n\nChromium will be terminated on this device.';
    
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      // Disable button while processing
      this.elements.closeKioskBtn.disabled = true;
      this.elements.closeKioskBtn.textContent = 'Closing...';

      console.log('Attempting to close kiosk...');

      const response = await fetch('/api/kiosk/exit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        console.log('Kiosk closed successfully:', data);
        this.showToast('success', data.userFriendlyMessage || 'Kiosk closed. You can now access the desktop.');
        
        // Reset button after a delay
        setTimeout(() => {
          if (this.elements.closeKioskBtn) {
            this.elements.closeKioskBtn.disabled = false;
            this.elements.closeKioskBtn.textContent = 'Close Kiosk';
          }
        }, 3000);
      } else {
        throw new Error(data.userFriendlyMessage || data.message || 'Failed to close kiosk');
      }
    } catch (error) {
      console.error('Error closing kiosk:', error);
      this.showToast('error', `Error: ${error.message}`);
      
      // Reset button state
      this.elements.closeKioskBtn.disabled = false;
      this.elements.closeKioskBtn.textContent = 'Close Kiosk';
    }
  }

  /**
   * Display current version information
   */
  displayCurrentVersion(versionData) {
    if (!this.elements.currentVersionDisplay) return;

    const versionHtml = `
      <div class="version-info">
        <div class="config-item">
          <span class="config-label">Version:</span>
          <span class="config-value version-info">${versionData.version}</span>
        </div>
        <div class="config-item">
          <span class="config-label">Version File:</span>
          <span class="config-value">${versionData.versionFile.available ? 'Available' : 'Missing'}</span>
        </div>
        <div class="config-item">
          <span class="config-label">Last Updated:</span>
          <span class="config-value">${new Date(versionData.timestamp).toLocaleString()}</span>
        </div>
      </div>
    `;

    this.elements.currentVersionDisplay.innerHTML = versionHtml;
  }

  /**
   * Display version loading error
   */
  displayVersionError(errorMessage) {
    if (!this.elements.currentVersionDisplay) return;

    const errorHtml = `
      <div class="update-status-error">
        <div class="status-text">Error loading version</div>
        <div class="update-info">${errorMessage}</div>
      </div>
    `;

    this.elements.currentVersionDisplay.innerHTML = errorHtml;
  }

  /**
   * Display update status information
   */
  displayUpdateStatus(updateData) {
    if (!this.elements.updateStatusDisplay) return;

    let statusClass, statusText, statusDetails;

    if (updateData.updateAvailable) {
      statusClass = 'update-status-available';
      statusText = '🎉 Update Available!';
      statusDetails = `
        <div class="update-info">
          <strong>Current:</strong> ${updateData.currentVersion}<br>
          <strong>Latest:</strong> ${updateData.latestVersion}<br>
          <strong>Method:</strong> ${updateData.updateInfo.comparisonMethod}<br>
          <strong>Last Checked:</strong> ${new Date(updateData.updateInfo.lastChecked).toLocaleString()}
        </div>
      `;
      
      // Enable update button
      if (this.elements.performUpdateBtn) {
        this.elements.performUpdateBtn.disabled = false;
      }
    } else {
      statusClass = 'update-status-current';
      statusText = '✅ Up to Date';
      statusDetails = `
        <div class="update-info">
          <strong>Current:</strong> ${updateData.currentVersion}<br>
          <strong>Latest:</strong> ${updateData.latestVersion}<br>
          <strong>Last Checked:</strong> ${new Date(updateData.updateInfo.lastChecked).toLocaleString()}
        </div>
      `;
      
      // Disable update button
      if (this.elements.performUpdateBtn) {
        this.elements.performUpdateBtn.disabled = true;
      }
    }

    const statusHtml = `
      <div class="${statusClass}">
        <div class="status-text">${statusText}</div>
        ${statusDetails}
      </div>
    `;

    this.elements.updateStatusDisplay.innerHTML = statusHtml;
  }

  /**
   * Show update status with custom message
   */
  showUpdateStatus(type, message) {
    if (!this.elements.updateStatusDisplay) return;

    const statusClasses = {
      'idle': 'update-status-idle',
      'checking': 'update-status-checking',
      'available': 'update-status-available',
      'current': 'update-status-current',
      'updating': 'update-status-updating',
      'success': 'update-status-success',
      'error': 'update-status-error'
    };

    const statusClass = statusClasses[type] || 'update-status-idle';
    
    const statusHtml = `
      <div class="${statusClass}">
        <div class="status-text">${message}</div>
      </div>
    `;

    this.elements.updateStatusDisplay.innerHTML = statusHtml;

    // Disable update button for non-available states
    if (this.elements.performUpdateBtn && type !== 'available') {
      this.elements.performUpdateBtn.disabled = true;
    }
  }

  /**
   * Display update status from WebSocket message
   */
  displayUpdateStatusFromWebSocket(data) {
    if (!this.elements.updateStatusDisplay) return;

    const statusClasses = {
      'idle': 'update-status-idle',
      'checking': 'update-status-checking',
      'updating': 'update-status-updating',
      'success': 'update-status-success',
      'error': 'update-status-error'
    };

    const statusClass = statusClasses[data.status] || 'update-status-idle';
    
    let statusHtml = `
      <div class="${statusClass}">
        <div class="status-text">${data.message}</div>
    `;

    // Add progress bar for updating status
    if (data.status === 'updating' && data.progress > 0) {
      statusHtml += `
        <div class="update-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${data.progress}%"></div>
          </div>
          <div class="progress-text">${data.progress}%</div>
        </div>
      `;
    }

    // Add error details if present
    if (data.status === 'error' && data.error) {
      statusHtml += `
        <div class="update-error-details">
          <details>
            <summary>Error Details</summary>
            <pre>${data.error}</pre>
          </details>
        </div>
      `;
    }

    // Add timestamp
    if (data.timestamp) {
      const timestamp = new Date(data.timestamp).toLocaleString();
      statusHtml += `
        <div class="update-timestamp">
          Last updated: ${timestamp}
        </div>
      `;
    }

    statusHtml += '</div>';

    this.elements.updateStatusDisplay.innerHTML = statusHtml;
  }

  /**
   * Show update success message with enhanced user notifications
   */
  showUpdateSuccess(message) {
    if (!this.elements.updateStatusDisplay) return;

    const statusHtml = `
      <div class="update-status-success">
        <div class="status-text">✅ ${message}</div>
        <div class="update-info">
          The server will restart automatically. Please wait for the page to reload.
        </div>
        <div class="update-countdown">
          <div class="countdown-text">Page will reload in <span id="reloadCountdown">15</span> seconds...</div>
          <div class="countdown-progress">
            <div class="countdown-bar" id="countdownBar"></div>
          </div>
          <button id="reloadNowBtn" class="reload-now-btn">Reload Now</button>
        </div>
      </div>
    `;

    this.elements.updateStatusDisplay.innerHTML = statusHtml;

    // Start countdown and auto-reload process
    this.startUpdateSuccessCountdown();
  }

  /**
   * Start countdown for automatic page reload after successful update
   */
  startUpdateSuccessCountdown() {
    let countdown = 15;
    const countdownElement = document.getElementById('reloadCountdown');
    const countdownBar = document.getElementById('countdownBar');
    const reloadNowBtn = document.getElementById('reloadNowBtn');
    
    // Update countdown display
    const updateCountdown = () => {
      if (countdownElement) {
        countdownElement.textContent = countdown;
      }
      if (countdownBar) {
        const progress = ((15 - countdown) / 15) * 100;
        countdownBar.style.width = `${progress}%`;
      }
    };

    // Set up reload now button
    if (reloadNowBtn) {
      reloadNowBtn.addEventListener('click', () => {
        this.performPageReload('User clicked reload now');
      });
    }

    // Start countdown timer
    const countdownInterval = setInterval(() => {
      countdown--;
      updateCountdown();
      
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        this.performPageReload('Automatic reload after countdown');
      }
    }, 1000);

    // Initial countdown display
    updateCountdown();

    // Also attempt to detect when server is back online
    this.startServerHealthCheck();
  }

  /**
   * Start checking server health to reload as soon as server is available
   */
  startServerHealthCheck() {
    let healthCheckAttempts = 0;
    const maxHealthCheckAttempts = 30; // 30 attempts over 30 seconds
    
    const healthCheckInterval = setInterval(async () => {
      healthCheckAttempts++;
      
      try {
        // Try to fetch the health endpoint
        const response = await fetch('/api/health', {
          method: 'GET',
          cache: 'no-cache',
          timeout: 2000
        });
        
        if (response.ok) {
          clearInterval(healthCheckInterval);
          console.log('Server is back online, reloading page...');
          this.performPageReload('Server health check successful');
          return;
        }
      } catch (error) {
        // Server not ready yet, continue checking
        console.log(`Health check attempt ${healthCheckAttempts}: Server not ready`);
      }
      
      // Stop health checks after max attempts
      if (healthCheckAttempts >= maxHealthCheckAttempts) {
        clearInterval(healthCheckInterval);
        console.log('Health check timeout, will rely on countdown timer');
      }
    }, 1000);
  }

  /**
   * Perform page reload with logging
   */
  performPageReload(reason) {
    console.log(`Reloading page: ${reason}`);
    
    // Show loading message
    if (this.elements.updateStatusDisplay) {
      this.elements.updateStatusDisplay.innerHTML = `
        <div class="update-status-success">
          <div class="status-text">🔄 Reloading page...</div>
          <div class="update-info">Connecting to updated server...</div>
        </div>
      `;
    }
    
    // Perform the reload
    setTimeout(() => {
      window.location.reload(true); // Force reload from server
    }, 500);
  }

  /**
   * Show update error message with comprehensive error handling
   */
  showUpdateError(message, errorDetails) {
    if (!this.elements.updateStatusDisplay) return;

    // Determine error type and provide appropriate guidance
    const errorGuidance = this.getErrorGuidance(message, errorDetails);

    let statusHtml = `
      <div class="update-status-error">
        <div class="status-text">❌ ${message}</div>
        <div class="update-error-guidance">
          ${errorGuidance.message}
        </div>
    `;

    // Add specific troubleshooting steps if available
    if (errorGuidance.steps && errorGuidance.steps.length > 0) {
      statusHtml += `
        <div class="update-troubleshooting">
          <strong>Troubleshooting Steps:</strong>
          <ol>
            ${errorGuidance.steps.map(step => `<li>${step}</li>`).join('')}
          </ol>
        </div>
      `;
    }

    // Add error details in expandable section
    if (errorDetails) {
      statusHtml += `
        <div class="update-error-details">
          <details>
            <summary>Technical Details</summary>
            <pre>${errorDetails}</pre>
          </details>
        </div>
      `;
    }

    // Add retry button for recoverable errors
    if (errorGuidance.canRetry) {
      statusHtml += `
        <div class="update-retry-section">
          <button id="retryUpdateBtn" class="retry-button">Try Update Again</button>
        </div>
      `;
    }

    statusHtml += '</div>';

    this.elements.updateStatusDisplay.innerHTML = statusHtml;

    // Attach retry button event listener if present
    const retryBtn = document.getElementById('retryUpdateBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        this.performUpdate();
      });
    }
  }

  /**
   * Get error guidance based on error type
   */
  getErrorGuidance(message, errorDetails) {
    const errorText = (message + ' ' + (errorDetails || '')).toLowerCase();

    // Network errors
    if (errorText.includes('network') || errorText.includes('connection') || errorText.includes('timeout')) {
      return {
        message: 'This appears to be a network connectivity issue.',
        steps: [
          'Check your internet connection',
          'Verify the server can reach GitHub',
          'Wait a few minutes and try again',
          'Check if there are any firewall restrictions'
        ],
        canRetry: true
      };
    }

    // Permission errors
    if (errorText.includes('permission') || errorText.includes('denied') || errorText.includes('eacces')) {
      return {
        message: 'The update failed due to insufficient permissions.',
        steps: [
          'Ensure the server is running with appropriate privileges',
          'Check file permissions in the application directory',
          'Verify sudo access is available if required',
          'Contact your system administrator if needed'
        ],
        canRetry: true
      };
    }

    // Disk space errors
    if (errorText.includes('space') || errorText.includes('enospc') || errorText.includes('disk full')) {
      return {
        message: 'The update failed due to insufficient disk space.',
        steps: [
          'Free up disk space on the system',
          'Remove unnecessary files or logs',
          'Check available space with "df -h"',
          'Consider expanding storage if consistently low'
        ],
        canRetry: true
      };
    }

    // Script execution errors
    if (errorText.includes('script') || errorText.includes('execution') || errorText.includes('exit code')) {
      return {
        message: 'The update script encountered an error during execution.',
        steps: [
          'Check the server logs for detailed error information',
          'Verify system dependencies are installed',
          'Ensure the update script has proper permissions',
          'Try the update again after a few minutes'
        ],
        canRetry: true
      };
    }

    // Prerequisites errors
    if (errorText.includes('prerequisite') || errorText.includes('validation')) {
      return {
        message: 'Update prerequisites are not met.',
        steps: [
          'Ensure all required system dependencies are installed',
          'Check that the update script is present and accessible',
          'Verify system configuration meets update requirements',
          'Contact support if prerequisites cannot be resolved'
        ],
        canRetry: false
      };
    }

    // Backup errors
    if (errorText.includes('backup')) {
      return {
        message: 'Unable to create backup before update.',
        steps: [
          'Check available disk space for backup creation',
          'Verify write permissions in the backup location',
          'Ensure no other processes are locking files',
          'Try the update again after resolving storage issues'
        ],
        canRetry: true
      };
    }

    // GitHub API errors
    if (errorText.includes('github') || errorText.includes('api') || errorText.includes('rate limit')) {
      return {
        message: 'Unable to communicate with GitHub for update information.',
        steps: [
          'Check internet connectivity to GitHub',
          'Wait for GitHub API rate limits to reset',
          'Verify GitHub service status',
          'Try again in a few minutes'
        ],
        canRetry: true
      };
    }

    // Generic error
    return {
      message: 'The update encountered an unexpected error.',
      steps: [
        'Check the server logs for more detailed information',
        'Ensure the system is in a stable state',
        'Try the update again after a few minutes',
        'Contact support if the problem persists'
      ],
      canRetry: true
    };
  }

  /**
   * Show/hide version loading indicator
   */
  showVersionLoading(show) {
    if (!this.elements.currentVersionDisplay) return;

    if (show) {
      this.elements.currentVersionDisplay.innerHTML = `
        <div class="server-version-loading">
          Loading version information...
        </div>
      `;
    }
  }

  /**
   * Refresh all server information
   */
  async refresh() {
    await this.loadCurrentVersion();
    // Reset update status
    this.showUpdateStatus('idle', 'Click "Check for Updates" to see if a newer version is available.');
    if (this.elements.performUpdateBtn) {
      this.elements.performUpdateBtn.disabled = true;
    }
  }

  /**
   * Reboot the server system
   */
  async rebootServer() {
    // Confirm with user before proceeding
    const confirmMessage = 'Are you sure you want to reboot the server?\n\nThis will:\n• Close the kiosk mode\n• Restart the entire system\n• Automatically relaunch kiosk mode after boot\n\nThe server will be unavailable during the reboot process.';
    
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      // Disable the button and show loading state
      this.elements.rebootServerBtn.disabled = true;
      this.elements.rebootServerBtn.textContent = 'Rebooting...';

      // Make API call to reboot system
      const response = await fetch('/api/system/reboot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (result.success) {
        this.showToast('success', 'System reboot initiated. The server will be unavailable during restart.');
        
        // Show a countdown or additional message since the connection will be lost
        setTimeout(() => {
          this.showToast('success', 'Server is rebooting. Please wait for the system to come back online.');
        }, 2000);
        
      } else {
        this.showToast('error', result.userFriendlyMessage || result.message || 'Failed to initiate system reboot');
        
        // Re-enable button on failure
        this.elements.rebootServerBtn.disabled = false;
        this.elements.rebootServerBtn.textContent = 'Reboot Server';
      }

    } catch (error) {
      console.error('Error rebooting server:', error);
      this.showToast('error', 'Network error: Failed to communicate with server');
      
      // Re-enable button on error
      this.elements.rebootServerBtn.disabled = false;
      this.elements.rebootServerBtn.textContent = 'Reboot Server';
    }
  }

  /**
   * Show toast notification
   * @param {string} type - 'success' or 'error'
   * @param {string} message - Message to display
   */
  showToast(type, message) {
    // Remove any existing toast
    const existingToast = document.getElementById('kioskToast');
    if (existingToast) {
      existingToast.remove();
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.id = 'kioskToast';
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 4px;
      color: white;
      font-size: 14px;
      font-weight: bold;
      z-index: 10000;
      max-width: 300px;
      word-wrap: break-word;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      transition: opacity 0.3s ease;
      ${type === 'success' ? 
        'background-color: #00aa00; border: 1px solid #00cc00;' : 
        'background-color: #cc4400; border: 1px solid #ff5500;'
      }
    `;
    
    toast.textContent = message;
    document.body.appendChild(toast);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        setTimeout(() => {
          if (toast.parentNode) {
            toast.remove();
          }
        }, 300);
      }
    }, 5000);

    console.log(`Toast (${type}): ${message}`);
  }

  /**
   * Get current server information
   */
  getServerInfo() {
    return {
      currentVersion: this.currentVersion,
      updateInfo: this.updateInfo,
      isCheckingUpdates: this.isCheckingUpdates,
      isUpdating: this.isUpdating
    };
  }
}

// Create global instance
window.serverManager = new ServerManager();