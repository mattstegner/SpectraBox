/**
 * LegendComponent - Manages the channel legend display
 * 
 * Displays and updates the legend showing channel colors and modes
 */
class LegendComponent {
  constructor(container) {
    this.container = container;
    this.channelMode = 'Stereo';
    this.showOverlap = true;
    this.overlapTolerance = 1.0;
  }

  /**
   * Render the legend HTML
   */
  render() {
    this.container.innerHTML = this.getTemplate();
  }

  /**
   * Get the full legend template
   * @returns {string} HTML string
   */
  getTemplate() {
    return `
      <div class="legend-item" id="channelIndicator">
        <div class="legend-color channel-indicator"></div>
        <span id="channelIndicatorText">${this.channelMode}</span>
      </div>
      <div class="legend-item">
        <div class="legend-color left-channel"></div>
        <span>Left</span>
      </div>
      <div class="legend-item">
        <div class="legend-color right-channel"></div>
        <span>Right</span>
      </div>
      ${this.showOverlap ? this.getOverlapItemTemplate() : ''}
    `;
  }

  /**
   * Get the overlap legend item template
   * @returns {string} HTML string
   */
  getOverlapItemTemplate() {
    return `
      <div class="legend-item" id="overlapLegendItem">
        <div class="legend-color" style="background-color: #ffffff"></div>
        <span>Overlap (±${this.overlapTolerance}dB)</span>
      </div>
    `;
  }

  /**
   * Update the channel mode text
   * @param {string} mode - Mode name (e.g., 'Stereo', 'Mid-Side')
   */
  updateChannelMode(mode) {
    this.channelMode = mode;
    const indicator = document.getElementById('channelIndicatorText');
    if (indicator) {
      indicator.textContent = mode;
    }
  }

  /**
   * Toggle the overlap legend item visibility
   * @param {boolean} show - Whether to show overlap item
   */
  toggleOverlap(show) {
    this.showOverlap = show;
    // Use direct DOM manipulation to avoid re-rendering entire legend
    // which would reset mono/stereo visibility state
    const overlapItem = document.getElementById('overlapLegendItem');
    if (overlapItem) {
      overlapItem.style.display = show ? 'flex' : 'none';
    }
  }

  /**
   * Update the overlap tolerance value
   * @param {number} tolerance - Tolerance value in dB
   */
  updateOverlapTolerance(tolerance) {
    this.overlapTolerance = tolerance;
    if (this.showOverlap) {
      // Update just the text content without re-rendering
      const overlapItem = document.getElementById('overlapLegendItem');
      if (overlapItem) {
        const span = overlapItem.querySelector('span');
        if (span) {
          span.textContent = `Overlap (±${tolerance}dB)`;
        }
      }
    }
  }
}

