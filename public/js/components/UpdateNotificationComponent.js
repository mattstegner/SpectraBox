/**
 * UpdateNotificationComponent - Manages update notification overlay
 * 
 * Displays a full-screen overlay during server updates with progress information
 */
class UpdateNotificationComponent {
  constructor() {
    this.overlay = null;
    this.updateData = null;
  }

  /**
   * Show the update notification overlay
   * @param {Object} updateData - Update status data
   */
  show(updateData) {
    this.updateData = updateData;
    this.createOverlay();
    document.body.appendChild(this.overlay);
  }

  /**
   * Hide and remove the update notification overlay
   */
  hide() {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
      this.overlay = null;
    }
  }

  /**
   * Create the overlay DOM element
   */
  createOverlay() {
    const div = document.createElement('div');
    div.className = 'update-notification-overlay';
    div.innerHTML = this.getTemplate();
    this.overlay = div;
  }

  /**
   * Get the full notification template
   * @returns {string} HTML string
   */
  getTemplate() {
    const { status, message, progress } = this.updateData;
    return `
      <div class="update-notification-content">
        <div class="update-notification-header">
          <div class="update-icon">⚙️</div>
          <div class="update-title">Update in Progress</div>
        </div>
        <div class="update-notification-body">
          <div class="update-message">${message}</div>
          ${this.getProgressTemplate(progress)}
          ${this.getInfoTemplate()}
        </div>
      </div>
    `;
  }

  /**
   * Get the progress bar template
   * @param {number} progress - Progress percentage (0-100)
   * @returns {string} HTML string
   */
  getProgressTemplate(progress) {
    return `
      <div class="update-progress-container">
        <div class="update-progress-bar">
          <div class="update-progress-fill" style="width: ${progress}%"></div>
        </div>
        <div class="update-progress-text">${progress}%</div>
      </div>
    `;
  }

  /**
   * Get the informational text template
   * @returns {string} HTML string
   */
  getInfoTemplate() {
    return `
      <div class="update-notification-info">
        <p>The server is being updated. Please wait...</p>
        <p>The page will automatically reload when the update is complete.</p>
      </div>
    `;
  }

  /**
   * Update the progress display
   * @param {number} progress - Progress percentage (0-100)
   * @param {string} message - Status message
   */
  updateProgress(progress, message) {
    if (!this.overlay) return;
    
    const fillElement = this.overlay.querySelector('.update-progress-fill');
    const textElement = this.overlay.querySelector('.update-progress-text');
    const messageElement = this.overlay.querySelector('.update-message');
    
    if (fillElement) fillElement.style.width = `${progress}%`;
    if (textElement) textElement.textContent = `${progress}%`;
    if (messageElement) messageElement.textContent = message;
  }

  /**
   * Check if the overlay is currently visible
   * @returns {boolean} True if visible
   */
  isVisible() {
    return this.overlay !== null && this.overlay.parentNode !== null;
  }
}

