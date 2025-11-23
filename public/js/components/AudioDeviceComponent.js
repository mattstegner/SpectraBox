/**
 * AudioDeviceComponent - Manages audio input device selection UI
 * 
 * Handles device enumeration, selection, and display
 */
class AudioDeviceComponent {
  constructor(selectElement, indicatorElement) {
    this.selectElement = selectElement;
    this.indicatorElement = indicatorElement;
    this.devices = [];
    this.selectedDeviceId = null;
    this.onDeviceChangeCallback = null;
  }

  /**
   * Load available audio input devices
   */
  async loadDevices() {
    try {
      // Request permission first so we can get device labels
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      
      // Get all audio input devices
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      this.devices = allDevices.filter(d => d.kind === 'audioinput');
      
      this.render();
    } catch (error) {
      this.renderError(error);
    }
  }

  /**
   * Render the device select dropdown
   */
  render() {
    this.selectElement.innerHTML = this.getOptionsTemplate();
    this.updateIndicator();
  }

  /**
   * Render error state
   * @param {Error} error - The error object
   */
  renderError(error) {
    this.selectElement.innerHTML = '<option value="">Error loading devices</option>';
    this.indicatorElement.textContent = `Error: ${error.message}`;
  }

  /**
   * Get the options HTML template
   * @returns {string} HTML string
   */
  getOptionsTemplate() {
    if (this.devices.length === 0) {
      return '<option value="">No devices found</option>';
    }
    
    return this.devices.map(device => {
      const label = this.formatDeviceLabel(device.label, device.deviceId);
      const isDefault = device.deviceId === 'default';
      return `<option value="${device.deviceId}"${isDefault ? ' selected' : ''}>${label}</option>`;
    }).join('');
  }

  /**
   * Format device label for display
   * @param {string} label - Device label
   * @param {string} deviceId - Device ID
   * @returns {string} Formatted label
   */
  formatDeviceLabel(label, deviceId) {
    if (!label || label.trim() === '') {
      return deviceId === 'default' ? 'Default Device' : 'Unknown Device';
    }
    return label;
  }

  /**
   * Update the default device indicator text
   */
  updateIndicator() {
    const defaultDevice = this.devices.find(d => d.deviceId === 'default');
    if (defaultDevice) {
      this.indicatorElement.textContent = `Default: ${this.formatDeviceLabel(defaultDevice.label, 'default')}`;
    } else {
      this.indicatorElement.textContent = 'No default device detected';
    }
  }

  /**
   * Set the device change callback
   * @param {Function} callback - Callback function to call when device changes
   */
  onDeviceChange(callback) {
    this.onDeviceChangeCallback = callback;
    this.selectElement.addEventListener('change', (e) => {
      this.selectedDeviceId = e.target.value;
      if (this.onDeviceChangeCallback) {
        this.onDeviceChangeCallback(this.selectedDeviceId);
      }
    });
  }

  /**
   * Get the currently selected device ID
   * @returns {string} Selected device ID
   */
  getSelectedDeviceId() {
    return this.selectElement.value;
  }
}

