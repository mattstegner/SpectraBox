/**
 * NetworkInfoComponent - Displays network status and configuration information
 * 
 * Shows local and network access availability, URLs, and kiosk mode status
 */
class NetworkInfoComponent {
  constructor(container) {
    this.container = container;
    this.networkData = null;
  }

  /**
   * Load network information from the API
   * Uses the existing server-config and system-info endpoints
   */
  async load() {
    try {
      // Fetch from both endpoints in parallel
      const [configResponse, systemResponse] = await Promise.all([
        fetch('/api/server-config'),
        fetch('/api/system-info')
      ]);

      if (!configResponse.ok || !systemResponse.ok) {
        throw new Error('Failed to fetch network info');
      }

      const configData = await configResponse.json();
      const systemData = await systemResponse.json();

      // Transform the data into the format expected by the component
      this.networkData = {
        localAccess: {
          available: true,
          url: `${window.location.protocol}//${window.location.hostname}:${window.location.port}`
        },
        networkAccess: {
          available: configData.config?.networkAccessible || false,
          url: systemData.systemInfo?.networkUrl || null
        },
        kioskMode: configData.config?.kioskMode || false
      };

      this.render();
    } catch (error) {
      console.error('Error loading network info:', error);
      this.renderError(error);
    }
  }

  /**
   * Render the network information
   */
  render() {
    if (!this.networkData) {
      this.container.innerHTML = this.getLoadingTemplate();
      return;
    }
    this.container.innerHTML = this.getNetworkTemplate();
  }

  /**
   * Render error state
   * @param {Error} error - The error object
   */
  renderError(error) {
    this.container.innerHTML = `
      <div class="network-status-loading">
        Error loading network information: ${error.message}
      </div>
    `;
  }

  /**
   * Get the loading state template
   * @returns {string} HTML string
   */
  getLoadingTemplate() {
    return '<div class="network-status-loading">Loading network information...</div>';
  }

  /**
   * Get the network information template
   * @returns {string} HTML string
   */
  getNetworkTemplate() {
    const { localAccess, networkAccess, kioskMode } = this.networkData;
    return `
      <div class="network-status-display">
        ${this.getAccessItemTemplate('Local Access', localAccess.available, localAccess.url)}
        ${this.getAccessItemTemplate('Network Access', networkAccess.available, networkAccess.url)}
        ${kioskMode ? '<div class="kiosk-indicator">Running in Kiosk Mode</div>' : ''}
      </div>
    `;
  }

  /**
   * Get a single access item template
   * @param {string} label - Item label
   * @param {boolean} available - Whether access is available
   * @param {string} url - Access URL
   * @returns {string} HTML string
   */
  getAccessItemTemplate(label, available, url) {
    const icon = available ? '✅' : '❌';
    return `
      <div class="network-status-item">
        <span class="status-indicator">${icon}</span>
        <span class="status-text">${label}</span>
        ${url ? `<div class="network-url">${url}</div>` : ''}
      </div>
    `;
  }

  /**
   * Refresh the network information
   */
  async refresh() {
    this.container.innerHTML = this.getLoadingTemplate();
    await this.load();
  }
}

