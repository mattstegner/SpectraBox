/**
 * SpectraBox Spectrum Analyzer
 * Integrates with the Node.js backend API for audio device management
 */

class SpectrumAnalyzer {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.dataArray = null;
    this.canvas = document.getElementById('spectrumCanvas');
    this.canvasContext = this.canvas.getContext('2d');
    this.isRunning = false;
    this.audioDevices = [];
    this.selectedDevice = null;
    this.preferences = {};
    
    // Audio meters
    this.meters = new AudioMeters();
    
    // UI elements
    this.deviceSelect = document.getElementById('audioDevice');
    this.startButton = document.getElementById('startButton');
    this.stopButton = document.getElementById('stopButton');
    this.statusElement = document.getElementById('status');
    this.sampleRateElement = document.getElementById('sampleRate');
    this.bufferSizeElement = document.getElementById('bufferSize');
    
    this.init();
  }

  /**
   * Initialize the spectrum analyzer
   */
  async init() {
    try {
      await this.loadPreferences();
      await this.loadAudioDevices();
      this.setupEventListeners();
      this.meters.init();
      this.updateStatus('Ready');
    } catch (error) {
      console.error('Initialization error:', error);
      this.updateStatus('Error: ' + error.message);
    }
  }

  /**
   * Load preferences from the backend API
   */
  async loadPreferences() {
    try {
      const response = await fetch('/api/preferences');
      if (response.ok) {
        const data = await response.json();
        this.preferences = data.success ? data.preferences : data.preferences || {};
      } else {
        console.warn('Could not load preferences, using defaults');
        this.preferences = {
          selectedAudioDevice: null,
          audioSettings: {
            sampleRate: 44100,
            bufferSize: 1024,
            gain: 1.0
          },
          uiSettings: {
            theme: 'dark',
            autoStart: false,
            fullscreen: false
          },
          systemSettings: {
            port: 3000,
            host: '0.0.0.0'
          }
        };
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
      this.preferences = {
        selectedAudioDevice: null,
        audioSettings: {
          sampleRate: 44100,
          bufferSize: 1024,
          gain: 1.0
        },
        uiSettings: {
          theme: 'dark',
          autoStart: false,
          fullscreen: false
        },
        systemSettings: {
          port: 3000,
          host: '0.0.0.0'
        }
      };
    }
  }

  /**
   * Save preferences to the backend API
   */
  async savePreferences() {
    try {
      const response = await fetch('/api/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ preferences: this.preferences })
      });
      
      if (!response.ok) {
        console.warn('Could not save preferences');
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
    }
  }

  /**
   * Load available audio devices from the backend API
   */
  async loadAudioDevices() {
    try {
      const response = await fetch('/api/audio-devices');
      if (response.ok) {
        const data = await response.json();
        this.audioDevices = data.success ? data.devices : [];
        this.populateDeviceSelect();
      } else {
        throw new Error('Could not load audio devices');
      }
    } catch (error) {
      console.error('Error loading audio devices:', error);
      this.deviceSelect.innerHTML = '<option value="">Error loading devices</option>';
      throw error;
    }
  }

  /**
   * Populate the device selection dropdown
   */
  populateDeviceSelect() {
    this.deviceSelect.innerHTML = '';
    
    if (this.audioDevices.length === 0) {
      this.deviceSelect.innerHTML = '<option value="">No audio devices found</option>';
      return;
    }

    // Add default option
    this.deviceSelect.innerHTML = '<option value="">Select audio device...</option>';
    
    // Add available devices
    this.audioDevices.forEach(device => {
      const option = document.createElement('option');
      option.value = device.id;
      option.textContent = `${device.name}${device.isDefault ? ' (Default)' : ''}`;
      this.deviceSelect.appendChild(option);
    });

    // Select previously chosen device if available
    if (this.preferences.selectedAudioDevice) {
      this.deviceSelect.value = this.preferences.selectedAudioDevice;
    }
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    this.startButton.addEventListener('click', () => this.start());
    this.stopButton.addEventListener('click', () => this.stop());
    this.deviceSelect.addEventListener('change', (e) => {
      this.preferences.selectedAudioDevice = e.target.value;
      this.savePreferences();
    });

    // Handle window resize
    window.addEventListener('resize', () => this.resizeCanvas());
    this.resizeCanvas();
  }

  /**
   * Start the spectrum analyzer
   */
  async start() {
    if (this.isRunning) return;

    try {
      this.updateStatus('Starting...');
      
      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Get user media with selected device
      const constraints = {
        audio: {
          deviceId: this.preferences.selectedAudioDevice || undefined,
          sampleRate: this.preferences.audioSettings.sampleRate,
          channelCount: 2,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.microphone = this.audioContext.createMediaStreamSource(stream);
      
      // Create analyser
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.preferences.audioSettings.bufferSize * 2;
      this.analyser.smoothingTimeConstant = 0.8;
      
      // Connect audio graph
      this.microphone.connect(this.analyser);
      
      // Setup data array
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      
      // Update UI
      this.isRunning = true;
      this.startButton.disabled = true;
      this.stopButton.disabled = false;
      this.deviceSelect.disabled = true;
      
      // Update info display
      this.sampleRateElement.textContent = this.audioContext.sampleRate + ' Hz';
      this.bufferSizeElement.textContent = this.analyser.fftSize;
      
      // Start visualization
      this.meters.start();
      this.draw();
      this.updateStatus('Running');
      
    } catch (error) {
      console.error('Error starting spectrum analyzer:', error);
      this.updateStatus('Error: ' + error.message);
      this.stop();
    }
  }

  /**
   * Stop the spectrum analyzer
   */
  stop() {
    if (!this.isRunning) return;

    try {
      // Stop audio processing
      if (this.microphone) {
        this.microphone.disconnect();
        this.microphone = null;
      }
      
      if (this.audioContext) {
        this.audioContext.close();
        this.audioContext = null;
      }
      
      // Update UI
      this.isRunning = false;
      this.startButton.disabled = false;
      this.stopButton.disabled = true;
      this.deviceSelect.disabled = false;
      
      // Stop meters
      this.meters.stop();
      
      // Clear canvas
      this.clearCanvas();
      
      // Reset info display
      this.sampleRateElement.textContent = '--';
      this.bufferSizeElement.textContent = '--';
      
      this.updateStatus('Stopped');
      
    } catch (error) {
      console.error('Error stopping spectrum analyzer:', error);
    }
  }

  /**
   * Main drawing loop
   */
  draw() {
    if (!this.isRunning) return;

    // Get frequency data
    this.analyser.getByteFrequencyData(this.dataArray);
    
    // Clear canvas
    this.canvasContext.fillStyle = '#000000';
    this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw spectrum
    this.drawSpectrum();
    
    // Update meters (simplified - using frequency data for demonstration)
    this.updateMeters();
    
    // Continue animation
    requestAnimationFrame(() => this.draw());
  }

  /**
   * Draw the frequency spectrum
   */
  drawSpectrum() {
    const barWidth = this.canvas.width / this.dataArray.length;
    let x = 0;

    for (let i = 0; i < this.dataArray.length; i++) {
      const barHeight = (this.dataArray[i] / 255) * this.canvas.height;
      
      // Create gradient color based on frequency
      const hue = (i / this.dataArray.length) * 240; // Blue to red
      const saturation = 100;
      const lightness = 50 + (this.dataArray[i] / 255) * 30;
      
      this.canvasContext.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      this.canvasContext.fillRect(x, this.canvas.height - barHeight, barWidth - 1, barHeight);
      
      x += barWidth;
    }
  }

  /**
   * Update audio meters (simplified implementation)
   */
  updateMeters() {
    if (!this.dataArray) return;
    
    // Calculate average levels from frequency data
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i];
    }
    const average = sum / this.dataArray.length / 255;
    
    // Update both meters with the same value (mono simulation)
    this.meters.updateLevels(average, average);
  }

  /**
   * Clear the canvas
   */
  clearCanvas() {
    this.canvasContext.fillStyle = '#000000';
    this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Resize canvas to fit container
   */
  resizeCanvas() {
    const container = this.canvas.parentElement;
    const rect = container.getBoundingClientRect();
    
    // Set canvas size (accounting for padding)
    this.canvas.width = Math.max(400, rect.width - 40);
    this.canvas.height = Math.max(300, rect.height - 40);
    
    // Redraw if running
    if (this.isRunning) {
      this.draw();
    } else {
      this.clearCanvas();
    }
  }

  /**
   * Update status display
   */
  updateStatus(status) {
    this.statusElement.textContent = status;
    console.log('Status:', status);
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.spectrumAnalyzer = new SpectrumAnalyzer();
});