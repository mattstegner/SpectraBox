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
    
    // DOM elements
    this.elements = {
      currentVersionDisplay: null,
      updateStatusDisplay: null,
      checkUpdatesBtn: null,
      performUpdateBtn: null,
      repositoryInfoDisplay: null
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

      // Check if elements exist (server tab might not be visible)
      if (!this.elements.currentVersionDisplay) {
        console.log('Server tab elements not found, skipping server manager initialization');
        return;
      }

      // Attach event listeners
      this.attachEventListeners();

      // Load initial version information
      await this.loadCurrentVersion();

      this.isInitialized = true;
      console.log('ServerManager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize ServerManager:', error);
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
   * Perform server update (placeholder for now)
   */
  async performUpdate() {
    if (this.isUpdating || !this.updateInfo || !this.updateInfo.updateAvailable) {
      return;
    }

    // For now, just show a message that this functionality will be implemented
    alert('Update functionality will be implemented in the next phase. This would trigger the server update process.');
    
    // TODO: Implement actual update process in task 7
    console.log('Update would be performed with info:', this.updateInfo);
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