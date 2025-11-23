/**
 * SettingsPanelComponent - Manages the settings panel UI
 * 
 * Handles tab switching, visibility, and panel interactions.
 * Works with existing HTML structure for now, can be enhanced later to generate HTML from templates.
 */
class SettingsPanelComponent {
  constructor(container) {
    this.container = container;
    this.currentTab = 'general';
    this.isVisible = false;
    this.tabs = ['general', 'spectrogram', 'spectrogram-drawing', 'meters', 'performance', 'network', 'server'];
    this.tabLabels = {
      'general': 'General',
      'spectrogram': 'Spectrogram Interface',
      'spectrogram-drawing': 'Spectrogram Drawing',
      'meters': 'Meters',
      'performance': 'Performance',
      'network': 'Network',
      'server': 'Server'
    };
  }

  /**
   * Initialize the component with existing HTML structure
   */
  initialize() {
    this.attachEventListeners();
  }

  /**
   * Attach event listeners for tab switching and panel interactions
   */
  attachEventListeners() {
    // Get all tab buttons
    const tabButtons = this.container.querySelectorAll('.settings-tab');
    tabButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const tabName = button.getAttribute('data-tab');
        this.switchTab(tabName);
      });
    });
  }

  /**
   * Switch to a different tab
   * @param {string} tabName - Name of the tab to switch to
   */
  switchTab(tabName) {
    if (!this.tabs.includes(tabName)) {
      console.warn(`Unknown tab: ${tabName}`);
      return;
    }

    this.currentTab = tabName;

    // Update tab buttons
    const tabButtons = this.container.querySelectorAll('.settings-tab');
    tabButtons.forEach(button => {
      const buttonTab = button.getAttribute('data-tab');
      if (buttonTab === tabName) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });

    // Update tab content pages
    const pages = this.container.querySelectorAll('.settings-page');
    pages.forEach(page => {
      const pageId = page.getAttribute('id');
      const pageName = pageId.replace('-page', '');
      if (pageName === tabName) {
        page.classList.add('active');
      } else {
        page.classList.remove('active');
      }
    });

    // Trigger custom event for tab change
    this.container.dispatchEvent(new CustomEvent('tabChanged', {
      detail: { tab: tabName }
    }));
  }

  /**
   * Show the settings panel
   */
  show() {
    this.container.style.display = 'block';
    this.isVisible = true;
  }

  /**
   * Hide the settings panel
   */
  hide() {
    this.container.style.display = 'none';
    this.isVisible = false;
  }

  /**
   * Toggle the settings panel visibility
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Get the current active tab name
   * @returns {string} Current tab name
   */
  getCurrentTab() {
    return this.currentTab;
  }

  /**
   * Check if the panel is visible
   * @returns {boolean} True if visible
   */
  getIsVisible() {
    return this.isVisible;
  }

  /**
   * Get tab label from tab name
   * @param {string} tab - Tab name
   * @returns {string} Tab label
   */
  getTabLabel(tab) {
    return this.tabLabels[tab] || tab;
  }
}

