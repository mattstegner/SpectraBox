/**
 * Template Helper Functions
 * 
 * Provides reusable template literal functions for generating HTML dynamically
 */

const Templates = {
  /**
   * Create a slider control with label and value display
   * @param {string} id - Element ID
   * @param {string} label - Label text
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @param {number} step - Step value
   * @param {number} value - Current value
   * @param {string} unit - Unit suffix (e.g., ' Hz', ' dB')
   * @returns {string} HTML string
   */
  slider(id, label, min, max, step, value, unit = '') {
    return `
      <div class="setting-item">
        <label for="${id}">${label}: <span id="${id}Value">${value}${unit}</span></label>
        <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" />
      </div>
    `;
  },

  /**
   * Create a select dropdown with options
   * @param {string} id - Element ID
   * @param {string} label - Label text
   * @param {Array} options - Array of {value, label} objects
   * @param {string} selected - Currently selected value
   * @returns {string} HTML string
   */
  select(id, label, options, selected) {
    return `
      <div class="setting-item">
        <label for="${id}">${label}:</label>
        <select id="${id}">
          ${options.map(opt => 
            `<option value="${opt.value}" ${opt.value === selected ? 'selected' : ''}>${opt.label}</option>`
          ).join('')}
        </select>
      </div>
    `;
  },

  /**
   * Create a toggle switch control
   * @param {string} id - Element ID
   * @param {string} label - Label text
   * @param {boolean} checked - Whether toggle is checked
   * @returns {string} HTML string
   */
  toggle(id, label, checked = false) {
    return `
      <div class="setting-item">
        <label for="${id}">${label}:</label>
        <label class="toggle-switch">
          <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    `;
  },

  /**
   * Create a button element
   * @param {string} id - Element ID
   * @param {string} text - Button text
   * @param {string} className - Additional CSS classes
   * @returns {string} HTML string
   */
  button(id, text, className = '') {
    return `<button id="${id}" class="${className}">${text}</button>`;
  },

  /**
   * Create a status card with title and items
   * @param {string} title - Card title
   * @param {Array} items - Array of content strings
   * @param {string} className - CSS class name
   * @returns {string} HTML string
   */
  statusCard(title, items, className = 'info-section') {
    return `
      <div class="${className}">
        <h4>${title}</h4>
        ${items.map(item => `<p>${item}</p>`).join('')}
      </div>
    `;
  },

  /**
   * Create a config item row
   * @param {string} label - Label text
   * @param {string} value - Value text
   * @returns {string} HTML string
   */
  configItem(label, value) {
    return `
      <div class="config-item">
        <span class="config-label">${label}:</span>
        <span class="config-value">${value}</span>
      </div>
    `;
  }
};

