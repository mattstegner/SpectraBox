/**
 * StereoSpectrumAnalyzer - A real-time stereo audio spectrum analyzer
 * 
 * This class creates a visual representation of audio frequency content using the Web Audio API.
 * It displays both left and right channel spectrum data along with peak and RMS level meters.
 */
class StereoSpectrumAnalyzer {
  constructor() {
    // === AUDIO CONTEXT VARIABLES ===
    // These handle the Web Audio API components for processing audio input
    this.audioContext = null;           // Main audio processing context
    this.mediaStream = null;            // Input stream from microphone
    this.source = null;                 // Audio source node from media stream
    this.gainNode = null;               // Gain node for manual volume adjustment
    this.splitter = null;               // Channel splitter to separate left/right channels (null for mono inputs)
    this.analyserLeft = null;           // FFT analyzer for left channel (spectrogram)
    this.analyserRight = null;          // FFT analyzer for right channel (spectrogram)
        
    // === DEDICATED METER ANALYZERS ===
    // These analyzers are independent of spectrogram FFT size for optimal meter performance
    this.meterAnalyserLeft = null;      // Fixed-size FFT analyzer for left channel meters
    this.meterAnalyserRight = null;     // Fixed-size FFT analyzer for right channel meters
    this.meterSplitter = null;          // Dedicated channel splitter for meters (null for mono inputs)
    this.isRunning = false;             // Flag to track if analysis is active
    this.animationId = null;            // ID for requestAnimationFrame loop
        
    // === GAIN CONTROL SETTINGS ===
    this.inputGainDB = 0;               // Input gain in decibels (-30 to +12 dB)
        
    // === FFT (Fast Fourier Transform) SETTINGS ===
    // FFT converts time-domain audio signals into frequency-domain data
    this.fftSize = 4096;                // Number of samples for FFT (must be power of 2)
    this.bufferLength = this.fftSize / 2;
        
    // === METER FFT SIZE SETTINGS ===
    // FFT size for RMS meter calculations (independent of spectrogram FFT)
    // Larger values = longer integration time for more accurate RMS measurements
    // At 48kHz: 8192 samples = ~171ms integration time (industry standard is ~300ms)
    // At 44.1kHz: 8192 samples = ~186ms integration time
    // This can be adjusted via: analyzer.meterFFTSize = 16384 (for ~341ms at 48kHz)
    this.meterFFTSize = 8192;           // Fixed size for RMS meter integration window
        
    // === PERFORMANCE SETTINGS ===
    this.refreshRate = 30;              // Target FPS - optimized for Raspberry Pi performance
        
    // === CANVAS DRAWING SETUP ===
    // Get canvas element and 2D drawing context for rendering the spectrum
    this.canvas = document.getElementById('spectrumCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvasContainer = this.canvas.parentElement;
        
    // === DISPLAY FREQUENCY RANGE ===
    // Human hearing range: 20 Hz to 20 kHz (20,000 Hz)
    this.minFreq = 20;                  // Lowest frequency to display
    this.maxFreq = 20000;               // Highest frequency to display
        
    // === AMPLITUDE DISPLAY RANGE (dB scale) ===
    // dB (decibels) is a logarithmic unit for measuring sound intensity
    // 0 dB = maximum digital level, negative values = quieter sounds
    // Range adjusted to match Web Audio API getFloatFrequencyData() output
    this.minDB = -100;                  // Default quietest level to display (matches Web Audio API range)
    this.maxDB = 0;                     // Loudest level (0 dB = digital maximum)
    this.adjustableMinDB = -100;        // User-adjustable minimum dB level for spectrogram range (-100 to -50 dB)
        
    // === OVERLAPPING DISPLAY STATE ===
    // Controls whether to show white blending for overlapping channels
    this.overlappingEnabled = true;     // Default to enabled
        
    // === OVERLAP TOLERANCE SETTING ===
    // Controls the dB tolerance for overlap detection (1.0 dB default)
    // Now working directly with dB values from getFloatFrequencyData()
    this.overlapToleranceDB = 1.0;      // Default tolerance in dB
        
    // === AMPLITUDE SCALING SETTING (DEPRECATED) ===
    // NOTE: No longer used for dB calculations to ensure accurate amplitude display
    // The spectrogram now uses fixed dB-per-pixel scaling (like PAM FFT plugin)
    // This ensures signals appear at their correct dB positions on the vertical ruler
    this.amplitudeScale = 1.0;          // Kept for compatibility but not applied to dB calculations
        
    // === AMPLITUDE CALIBRATION OFFSET ===
    // Compensates for Web Audio API's getFloatFrequencyData() offset from true dBFS
    // The Web Audio API applies windowing and FFT processing that reduces amplitude readings
    // by approximately 10-20 dB compared to the actual input signal level
    this.amplitudeCalibrationDB = 15.0; // Default calibration offset (adjustable in settings)
        
    // === CLICK POINT DISPLAY STATE ===
    // Controls the interactive frequency/amplitude display when clicking on spectrum
    this.clickPoint = null;             // Stores click position and calculated values
    this.showClickInfo = false;         // Whether to show click information
    this.clickInfoSize = 'large';       // Size of click info display ('small' or 'large')
        
    // === PIXEL-BASED FFT AVERAGING ===
    // Controls whether to average multiple FFT bins that fall within the same pixel column
    // This helps reduce visual noise at high frequencies where many bins map to few pixels
    this.pixelAveragingEnabled = true;          // Default to enabled for cleaner display
        
    // === ADVANCED SMOOTHING SETTINGS ===
    // Additional noise reduction and smoothing techniques
    this.multiPixelSmoothing = 3;               // Number of adjacent pixels to smooth across (3 = moderate smoothing)
    this.frequencyDependentSmoothingEnabled = true;   // Apply more smoothing at higher frequencies (enabled by default)
    this.noiseFloorSubtractionDB = 0;           // dB to subtract as estimated noise floor
    this.peakEnvelopeEnabled = true;            // Use peak envelope tracking instead of averaging (enabled by default)
        
    // === HOLD MODE STATE ===
    // Controls the visual hold mode for spectrogram amplitude tracking
    this.holdModeEnabled = false;       // Whether hold mode is currently active
    this.heldAmplitudesLeft = null;     // Array to store held values for left channel
    this.heldAmplitudesRight = null;    // Array to store held values for right channel
    this.holdButtonMode = 'latch';      // Hold button behavior: 'latch' (toggle) or 'average' (time-average)
        
    // === AVERAGE MODE STATE ===
    // Additional state needed for average mode calculations
    this.averageAmplitudesLeft = null;   // Array to store running averages for left channel (linear scale)
    this.averageAmplitudesRight = null;  // Array to store running averages for right channel (linear scale)
    this.averageTimeSeconds = 10;           // User-configurable averaging time in seconds (1-15s)
    this.averageSmoothingFactor = this.calculateSmoothingFactor(this.averageTimeSeconds);  // EMA smoothing factor calculated from time
    this.averageInitialized = false;     // Track if average arrays have been seeded with first values
        
    // === FREEZE MODE STATE ===
    // Controls the freeze functionality for capturing amplitude lines
    this.freezeButtons = new Map();     // Map of freeze button data: id -> { capturing, active, dataLeft, dataRight }
        
    // === FREEZE BUTTON COLORS ===
    // Colors for each freeze button line
    this.freezeButtonColors = {
      'freezeBtn1': '#ff0000',        // Red
      'freezeBtn2': '#ffff00',        // Yellow  
      'freezeBtn3': '#ff8800',        // Orange
      'freezeBtn4': '#aa00ff'         // Purple
    };
        
    // === CREATE LEVEL METERS INSTANCE ===
    // Initialize the level meters component
    this.levelMeters = new LevelMeters(this);
    
    // === MID-SIDE MODE STATE ===
    // Controls M/S processing mode for stereo analysis
    this.midSideModeEnabled = false;    // Current M/S mode state (false = Stereo, true = Mid-Side)
    this.isStereoInput = true;          // Track if input is stereo (2 channels) or mono (1 channel)
    this.msProcessor = null;            // Will hold MidSideProcessor instance when initialized
        
    // === INITIALIZATION ===
    // Set up all the interactive elements and prepare the display
    this.setupEventListeners();         // Attach button clicks and settings changes
    this.resizeCanvas();                // Set canvas size to fit container
    this.drawStaticElements();          // Draw grid lines, labels, and rulers
    this.updateLegendVisibility();      // Initialize legend to match toggle state
    this.updateChannelIndicator('Stereo'); // Initialize with default stereo state
    
    // === LOAD M/S MODE FROM SETTINGS ===
    // Load saved M/S mode preference after settings manager initializes
    if (typeof window.settingsManager !== 'undefined') {
      window.addEventListener('settingsLoaded', () => {
        this.loadMidSideModeFromSettings();
      });
    }
  }
    
  /**
     * Sets up all event listeners for user interactions
     * This includes button clicks, window resizing, and settings changes
     */
  setupEventListeners() {
    // === START/STOP BUTTON HANDLERS ===
    // Connect the UI buttons to their respective methods
    document.getElementById('startBtn').addEventListener('click', () => this.start());
    document.getElementById('stopBtn').addEventListener('click', () => this.stop());
        
    // === HOLD BUTTON HANDLERS ===
    // Set up hold button event listeners for both latch and temporary modes
    this.setupHoldButtonHandlers();
        
    // === FREEZE BUTTON HANDLERS ===
    // Set up freeze button event listeners for capture and display functionality
    this.setupFreezeButtonHandlers();
    
    // === MID-SIDE TOGGLE BUTTON HANDLER ===
    // Set up M/S mode toggle button event listener
    const msToggleBtn = document.getElementById('msToggleBtn');
    if (msToggleBtn) {
      msToggleBtn.addEventListener('click', () => {
        // Only allow toggle if input is stereo (not mono)
        if (!this.isStereoInput) {
          return; // Ignore clicks when mono input
        }
        this.toggleMidSideMode();
      });
    }
    
    // === MID-SIDE ENERGY PRESERVING TOGGLE HANDLER ===
    // Set up M/S energy-preserving mode toggle event listener
    const msEnergyPreservingToggle = document.getElementById('msEnergyPreservingToggle');
    if (msEnergyPreservingToggle) {
      msEnergyPreservingToggle.addEventListener('change', async () => {
        const isEnergyPreserving = msEnergyPreservingToggle.checked;
        
        // Update the M/S processor if it exists
        if (this.msProcessor) {
          this.msProcessor.setEnergyPreserving(isEnergyPreserving);
        }
        
        // Save the preference
        await this.saveMSEnergyPreservingToSettings(isEnergyPreserving);
      });
    }
        
    // === SETTINGS PANEL FUNCTIONALITY ===
    // Set up the settings panel open/close behavior and controls
    this.setupSettingsPanel();
        
    // === CANVAS CLICK HANDLING ===
    // Handle clicks on the spectrum plot for frequency/amplitude display
    this.canvas.addEventListener('click', (e) => {
      this.handleCanvasClick(e);
    });
        
    // === WINDOW RESIZE HANDLING ===
    // When window is resized, we need to update canvas dimensions and redraw
    // Debouncing prevents excessive redraws during window drag operations
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);           // Cancel previous resize handler
      resizeTimeout = setTimeout(() => {     // Wait 100ms after resize stops
        this.resizeCanvas();               // Update canvas size to new container size
        // Clear click info since coordinate system has changed
        this.showClickInfo = false;
        this.clickPoint = null;
        if (!this.isRunning) {             // If not actively analyzing audio
          this.drawStaticElements();     // Redraw the static grid and labels
        }
        // Note: If running, the animation loop will handle redrawing
                
        // Adjust settings panel layout if it's visible
        const settingsPanel = document.getElementById('settingsPanel');
        if (settingsPanel && settingsPanel.style.display === 'block') {
          this.adjustSettingsPanelLayout();
        }
      }, 100);
    });
  }
    
  /**
     * Configures the settings panel behavior (open/close functionality)
     * Creates a modal-like experience where the panel can be toggled and closed by clicking outside
     */
  setupSettingsPanel() {
    const settingsBtn = document.getElementById('settingsBtn');    // Gear icon button
    const settingsPanel = document.getElementById('settingsPanel'); // The floating settings panel
        
    // === SETTINGS BUTTON CLICK HANDLER ===
    // Toggle the settings panel open/closed when gear button is clicked
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();                   // Prevent this click from bubbling up to document
      const isVisible = settingsPanel.style.display === 'block';
      if (isVisible) {
        settingsPanel.style.display = 'none';
      } else {
        settingsPanel.style.display = 'block';
        this.adjustSettingsPanelLayout();  // Adjust layout when opening
      }
    });
        
    // === CLICK-OUTSIDE-TO-CLOSE FUNCTIONALITY ===
    // Listen for clicks anywhere on the document
    document.addEventListener('click', (e) => {
      // If the click is not inside the panel and not on the settings button
      if (!settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
        settingsPanel.style.display = 'none';  // Close the panel
      }
    });
        
    // === PREVENT PANEL CLICKS FROM CLOSING PANEL ===
    // Stop clicks inside the panel from bubbling up to the document click handler
    settingsPanel.addEventListener('click', (e) => {
      e.stopPropagation();    // Keep panel open when clicking inside it
    });
        
    // === SETUP TAB FUNCTIONALITY ===
    // Configure tab switching functionality
    this.setupTabHandlers();
        
    // === SETUP INDIVIDUAL SETTING CONTROLS ===
    // Configure all the sliders, dropdowns, and inputs within the settings panel
    this.setupSettingsHandlers();
  }
    
  /**
     * Sets up event handlers for tab switching functionality
     * Allows users to switch between different settings categories
     */
  setupTabHandlers() {
    // Get all tab buttons and settings pages
    const tabButtons = document.querySelectorAll('.settings-tab');
    const settingsPages = document.querySelectorAll('.settings-page');
        
    // Add click handler to each tab button
    tabButtons.forEach(tabButton => {
      tabButton.addEventListener('click', (e) => {
        const targetTab = e.target.getAttribute('data-tab');
                
        // Remove active class from all tabs and pages
        tabButtons.forEach(btn => btn.classList.remove('active'));
        settingsPages.forEach(page => page.classList.remove('active'));
                
        // Add active class to clicked tab and corresponding page
        e.target.classList.add('active');
        document.getElementById(`${targetTab}-page`).classList.add('active');
                
        // Adjust layout for the newly active tab
        setTimeout(() => this.adjustSettingsPanelLayout(), 10);
      });
    });
  }
    
  /**
     * Sets up event handlers for all individual settings controls
     * Each control updates the analyzer's behavior in real-time
     */
  setupSettingsHandlers() {
    // === FFT SIZE DROPDOWN HANDLER ===
    // FFT size determines frequency resolution vs time resolution trade-off
    // Larger FFT = better frequency resolution but slower updates
    document.getElementById('fftSizeSelect').addEventListener('change', (e) => {
      this.fftSize = parseInt(e.target.value);        // Update our internal FFT size
      this.bufferLength = this.fftSize / 2;           // Half the FFT size due to Nyquist limit
            
      // If analyzer nodes exist (i.e., we're currently running), update them
      if (this.analyserLeft && this.analyserRight) {
        this.analyserLeft.fftSize = this.fftSize;   // Apply new FFT size to left channel
        this.analyserRight.fftSize = this.fftSize;  // Apply new FFT size to right channel
      }
    });
        
    // === SPECTROGRAM SMOOTHING SLIDER HANDLER ===
    // Smoothing reduces flickering by averaging current and previous FFT results
    // UI shows 1-100 for user friendliness, internally maps to 0.6-0.98 range
    // 1 = less smoothing (more responsive), 100 = maximum smoothing (very smooth but slow)
    const smoothingSlider = document.getElementById('smoothingSlider');
    const smoothingValue = document.getElementById('smoothingValue');    // Text display of current value
    smoothingSlider.addEventListener('input', (e) => {
      const uiValue = parseInt(e.target.value);               // Get slider value (1 to 100)
      smoothingValue.textContent = uiValue;                   // Update the displayed number
            
      // Map UI range (1-100) to internal range (0.6-0.98)
      const internalValue = 0.6 + ((uiValue - 1) / 99) * (0.98 - 0.6);
            
      // Apply smoothing to both analyzer nodes if they exist
      if (this.analyserLeft && this.analyserRight) {
        this.analyserLeft.smoothingTimeConstant = internalValue;   // Update left channel smoothing
        this.analyserRight.smoothingTimeConstant = internalValue;  // Update right channel smoothing
      }
    });
        
    // === MINIMUM FREQUENCY SLIDER HANDLER ===
    // Controls the lowest frequency displayed on the spectrum
    const minFreqSlider = document.getElementById('minFreqSlider');
    const minFreqValue = document.getElementById('minFreqValue');
    minFreqSlider.addEventListener('input', (e) => {
      const newMinFreq = parseInt(e.target.value);
      minFreqValue.textContent = `${newMinFreq} Hz`;      // Update displayed value
            
      // Validate: minimum frequency must be less than maximum frequency
      if (newMinFreq < this.maxFreq) {
        this.minFreq = newMinFreq;                      // Update our frequency range
        // Clear click info since frequency scaling has changed
        this.showClickInfo = false;
        this.clickPoint = null;
        if (!this.isRunning) {                         // If not actively running
          this.drawStaticElements();                 // Redraw grid with new frequency labels
        }
        // If running, the animation loop will pick up the change automatically
      } else {
        e.target.value = this.minFreq;                 // Reset slider to previous valid value
        minFreqValue.textContent = `${this.minFreq} Hz`; // Update display to match
      }
    });
        
    // === MAXIMUM FREQUENCY SLIDER HANDLER ===
    // Controls the highest frequency displayed on the spectrum
    const maxFreqSlider = document.getElementById('maxFreqSlider');
    const maxFreqValue = document.getElementById('maxFreqValue');
    maxFreqSlider.addEventListener('input', (e) => {
      const newMaxFreq = parseInt(e.target.value);
      const displayValue = (newMaxFreq / 1000).toFixed(1);    // Convert to kHz with 1 decimal
      maxFreqValue.textContent = `${displayValue} kHz`;       // Update displayed value
            
      // Validate: maximum frequency must be greater than minimum frequency
      if (newMaxFreq > this.minFreq) {
        this.maxFreq = newMaxFreq;                          // Update our frequency range
        // Clear click info since frequency scaling has changed
        this.showClickInfo = false;
        this.clickPoint = null;
        if (!this.isRunning) {                             // If not actively running
          this.drawStaticElements();                     // Redraw grid with new frequency labels
        }
        // If running, the animation loop will pick up the change automatically
      } else {
        e.target.value = this.maxFreq;                     // Reset slider to previous valid value
        const resetDisplayValue = (this.maxFreq / 1000).toFixed(1);
        maxFreqValue.textContent = `${resetDisplayValue} kHz`; // Update display to match
      }
    });
        
    // === OVERLAPPING TOGGLE HANDLER ===
    // Controls whether to show white blending for overlapping channels
    document.getElementById('overlappingToggle').addEventListener('change', (e) => {
      this.overlappingEnabled = e.target.checked;    // Update overlapping state
      this.updateLegendVisibility();                 // Update legend to match new state
      // The animation loop will pick up this change automatically
    });
        
    // === OVERLAP TOLERANCE SLIDER HANDLER ===
    // Controls the dB tolerance for detecting channel overlap
    // Range: 0.1 dB to 2.0 dB (displayed to user), used directly with dB values
    const overlapToleranceSlider = document.getElementById('overlapToleranceSlider');
    const overlapToleranceValue = document.getElementById('overlapToleranceValue');
    overlapToleranceSlider.addEventListener('input', (e) => {
      const dbValue = parseFloat(e.target.value);                     // Get slider value in dB
      overlapToleranceValue.textContent = `${dbValue.toFixed(1)} dB`; // Update displayed value
            
      // Update internal value (now working directly with dB values)
      this.overlapToleranceDB = dbValue;                              // Store dB value
            
      // Update legend to show new tolerance value
      this.updateOverlapLegendText();
      // The animation loop will pick up this change automatically for overlap detection
    });
        
    // === METER SPEED DROPDOWN HANDLER ===
    // Controls how fast the level meters respond to audio changes
    // Delegate to level meters component
    const meterSpeedSelect = document.getElementById('meterSpeedSelect');
    meterSpeedSelect.addEventListener('change', (e) => {
      this.levelMeters.setMeterSpeed(e.target.value);
    });
        
    // === HOLD TIME SLIDER HANDLER ===
    // Controls how long hold indicators remain visible
    // Range: 0.5 to 2.0 seconds
    const holdTimeSlider = document.getElementById('holdTimeSlider');
    const holdTimeValue = document.getElementById('holdTimeValue');
    holdTimeSlider.addEventListener('input', (e) => {
      const timeValue = parseFloat(e.target.value);                   // Get slider value in seconds
      holdTimeValue.textContent = `${timeValue.toFixed(1)}s`;         // Update displayed value
      this.levelMeters.setHoldTime(timeValue);                        // Update hold time in meters
    });
        
    // === DECIBEL DISPLAY SPEED SLIDER HANDLER ===
    // Controls how fast the numerical dB displays update
    // Range: 10 to 250 milliseconds in 5ms increments (default: 150ms)
    const decibelsSpeedSlider = document.getElementById('decibelsSpeedSlider');
    const decibelsSpeedValue = document.getElementById('decibelsSpeedValue');
    decibelsSpeedSlider.addEventListener('input', (e) => {
      const intervalValue = parseInt(e.target.value);                 // Get slider value in milliseconds
      decibelsSpeedValue.textContent = `${intervalValue}ms`;          // Update displayed value
      this.levelMeters.setDisplayUpdateInterval(intervalValue);      // Update display interval in meters
    });
        
    // === AMPLITUDE SCALE SLIDER HANDLER ===
    // Controls how tall the spectrum lines appear
    // Range: 0.5 (50%) to 2.0 (200%) with 1% precision
    // NOTE: UI control hidden as amplitude calibration is now the preferred method
    // Keeping the property functional with default value (1.0 = 100%)
    /*
        const amplitudeScaleSlider = document.getElementById('amplitudeScaleSlider');
        const amplitudeScaleValue = document.getElementById('amplitudeScaleValue');
        amplitudeScaleSlider.addEventListener('input', (e) => {
            const scaleValue = parseFloat(e.target.value);                  // Get slider value
            amplitudeScaleValue.textContent = `${Math.round(scaleValue * 100)}%`; // Update displayed percentage
            this.amplitudeScale = scaleValue;                               // Update internal scale factor
            // The animation loop will pick up this change automatically
        });
        */
        
    // === CLICK INFO SIZE DROPDOWN HANDLER ===
    // Controls the size of the click point information display
    document.getElementById('clickInfoSizeSelect').addEventListener('change', (e) => {
      this.clickInfoSize = e.target.value;                            // Update click info size setting
      // The animation loop will pick up this change automatically
    });
        
    // === PIXEL-BASED FFT AVERAGING TOGGLE HANDLER ===
    // Controls whether to average FFT bins that fall within the same pixel column
    document.getElementById('pixelAveragingToggle').addEventListener('change', (e) => {
      this.pixelAveragingEnabled = e.target.checked;                   // Update pixel averaging state
      // The animation loop will pick up this change automatically
    });
        
    // === MULTI-PIXEL SMOOTHING SLIDER HANDLER ===
    // Controls how many adjacent pixels to smooth across for even cleaner curves
    const multiPixelSmoothingSlider = document.getElementById('multiPixelSmoothingSlider');
    const multiPixelSmoothingValue = document.getElementById('multiPixelSmoothingValue');
    multiPixelSmoothingSlider.addEventListener('input', (e) => {
      const smoothingValue = parseInt(e.target.value);
      multiPixelSmoothingValue.textContent = smoothingValue;
      this.multiPixelSmoothing = smoothingValue;
      // The animation loop will pick up this change automatically
    });
        
    // === FREQUENCY-DEPENDENT SMOOTHING TOGGLE HANDLER ===
    // Controls whether to apply more aggressive smoothing at higher frequencies
    document.getElementById('frequencyDependentSmoothingToggle').addEventListener('change', (e) => {
      this.frequencyDependentSmoothingEnabled = e.target.checked;
      // The animation loop will pick up this change automatically
    });
        
    // === NOISE FLOOR SUBTRACTION SLIDER HANDLER ===
    // Controls how much dB to subtract as estimated noise floor
    const noiseFloorSubtractionSlider = document.getElementById('noiseFloorSubtractionSlider');
    const noiseFloorSubtractionValue = document.getElementById('noiseFloorSubtractionValue');
    noiseFloorSubtractionSlider.addEventListener('input', (e) => {
      const subtractionValue = parseInt(e.target.value);
      noiseFloorSubtractionValue.textContent = `${subtractionValue} dB`;
      this.noiseFloorSubtractionDB = subtractionValue;
      // The animation loop will pick up this change automatically
    });
        
    // === PEAK ENVELOPE TOGGLE HANDLER ===
    // Controls whether to use peak envelope tracking instead of averaging
    document.getElementById('peakEnvelopeToggle').addEventListener('change', (e) => {
      this.peakEnvelopeEnabled = e.target.checked;
      // The animation loop will pick up this change automatically
    });
        
    // === INPUT GAIN SLIDER HANDLER ===
    // Controls the input gain applied before spectrum and meter analysis
    // Range: -30 dB to +12 dB in 0.1 dB steps
    const gainSlider = document.getElementById('gainSlider');
    const gainValue = document.getElementById('gainValue');
    gainSlider.addEventListener('input', (e) => {
      const gainDB = parseFloat(e.target.value);                      // Get slider value in dB
      gainValue.textContent = `${gainDB.toFixed(1)} dB`;              // Update displayed value
      this.inputGainDB = gainDB;                                      // Store dB value
            
      // Update gain node if it exists (i.e., we're currently running)
      if (this.gainNode) {
        // Convert dB to linear gain: gain = 10^(dB/20)
        const linearGain = Math.pow(10, gainDB / 20);
        this.gainNode.gain.setValueAtTime(linearGain, this.audioContext.currentTime);
      }
    });
        
    // === RMS WEIGHTING DROPDOWN HANDLER ===
    // Controls the frequency weighting applied to RMS measurements
    document.getElementById('rmsWeightingSelect').addEventListener('change', (e) => {
      this.levelMeters.setRmsWeighting(e.target.value);
    });
        
    // === AMPLITUDE CALIBRATION SLIDER HANDLER ===
    // Controls the dB offset applied to correct Web Audio API's internal reference level
    // This compensates for windowing and FFT processing losses in getFloatFrequencyData()
    // 
    // UI DESIGN: The slider shows adjustments relative to a 15 dB baseline calibration
    // - Slider range: -15.0 to +15.0 dB (displayed as offset from baseline)
    // - Slider default: 0.0 dB (represents the 15 dB baseline, no additional offset)
    // - Internal calculation: actualCalibration = 15.0 + sliderOffset
    // - This allows fine-tuning around the typical 15 dB Web Audio API offset
    const calibrationSlider = document.getElementById('calibrationSlider');
    const calibrationValue = document.getElementById('calibrationValue');
    calibrationSlider.addEventListener('input', (e) => {
      const offsetDB = parseFloat(e.target.value);                        // Get slider offset value (-15 to +15)
      const actualCalibrationDB = 15.0 + offsetDB;                       // Calculate actual calibration (0 to 30 dB)
            
      // Update display to show the offset with appropriate sign
      const displayText = offsetDB >= 0 ? `+${offsetDB.toFixed(1)} dB` : `${offsetDB.toFixed(1)} dB`;
      calibrationValue.textContent = displayText;
            
      this.amplitudeCalibrationDB = actualCalibrationDB;                  // Update internal calibration offset
      // The animation loop will pick up this change automatically
    });
        
    // === HOLD BUTTON MODE DROPDOWN HANDLER ===
    // Controls whether hold button operates in latch or temporary mode
    document.getElementById('holdModeSelect').addEventListener('change', (e) => {
      this.holdButtonMode = e.target.value;                               // Update hold button mode
            
      // If switching modes while hold is active, deactivate it to prevent confusion
      if (this.holdModeEnabled) {
        this.deactivateHoldMode();
      }
            
      // Re-setup the hold button handlers for the new mode
      this.setupHoldButtonHandlers();
            
      // Update button text to reflect the new mode
      this.updateHoldButtonText();
    });
        
    // === AVERAGE TIME SLIDER HANDLER ===
    // Controls the averaging time window for average hold mode (1-15 seconds)
    document.getElementById('averageTimeSlider').addEventListener('input', (e) => {
      const averageTime = parseInt(e.target.value);                       // Get slider value in seconds
      this.setAverageTime(averageTime);                                   // Update averaging time and smoothing factor
    });
        
    // === SPECTROGRAM RANGE SLIDER HANDLER ===
    // Controls the minimum dB level displayed on the spectrogram (allows zooming on upper portion)
    // Range: -100 dB to -50 dB in 10 dB steps (maxDB remains at 0 dB)
    const spectrogramRangeSlider = document.getElementById('spectrogramRangeSlider');
    const spectrogramRangeValue = document.getElementById('spectrogramRangeValue');
    spectrogramRangeSlider.addEventListener('input', (e) => {
      const newMinDB = parseInt(e.target.value);                          // Get slider value in dB
      spectrogramRangeValue.textContent = `${newMinDB} dB to 0 dB`;       // Update displayed range
      this.adjustableMinDB = newMinDB;                                    // Update internal minimum dB value
            
      // Clear click info since amplitude scaling has changed
      this.showClickInfo = false;
      this.clickPoint = null;
            
      if (!this.isRunning) {                                             // If not actively running
        this.drawStaticElements();                                     // Redraw grid with new amplitude range
      }
      // If running, the animation loop will pick up the change automatically
    });
        
    // === REFRESH RATE SLIDER HANDLER ===
    // Controls the frame rate for performance optimization
    const refreshRateSlider = document.getElementById('refreshRateSlider');
    const refreshRateValue = document.getElementById('refreshRateValue');
    if (refreshRateSlider && refreshRateValue) {
      refreshRateSlider.addEventListener('input', (e) => {
        this.refreshRate = parseInt(e.target.value);
        refreshRateValue.textContent = `${this.refreshRate} FPS`;
      });
    }
        
    // === V-SYNC TOGGLE HANDLER ===
    // Controls whether to use V-Sync (requestAnimationFrame) vs fixed rate (setTimeout)
    const vSyncToggle = document.getElementById('enableVSyncToggle');
    if (vSyncToggle) {
      vSyncToggle.addEventListener('change', (e) => {
        this.enableVSync = e.target.checked;
        // Note: V-Sync change takes effect on next animation cycle
      });
    }
  }
    
  /**
     * Adjusts the settings panel layout based on available space
     * Simplified for touchscreen - maintains consistent width and auto-scaling content
     */
  adjustSettingsPanelLayout() {
    const settingsPanel = document.getElementById('settingsPanel');
    const canvasContainer = this.canvasContainer;
        
    if (!settingsPanel || settingsPanel.style.display !== 'block') {
      return; // Panel not visible, nothing to adjust
    }
        
    // === CALCULATE AVAILABLE HEIGHT FOR SMALL SCREENS ===
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
        
    // For small screens (like 800x480), use most of the available height
    let maxAvailableHeight;
    if (viewportHeight <= 600) {
      maxAvailableHeight = viewportHeight - 50; // Very tight on small screens
    } else if (viewportHeight <= 768) {
      maxAvailableHeight = viewportHeight - 70; // Moderate spacing
    } else {
      const canvasRect = canvasContainer.getBoundingClientRect();
      maxAvailableHeight = canvasRect.height - 80; // Original logic for larger screens
    }
        
    // === ADJUST PANEL WIDTH FOR SMALL SCREENS ===
    if (viewportWidth <= 800) {
      settingsPanel.style.width = `${Math.min(viewportWidth - 20, 780)}px`;
      settingsPanel.style.minWidth = '300px';
      settingsPanel.style.maxWidth = `${viewportWidth - 20}px`;
    } else {
      settingsPanel.style.width = '780px';
      settingsPanel.style.minWidth = '780px';
      settingsPanel.style.maxWidth = '780px';
    }
        
    // === GET ACTIVE SETTINGS PAGE ===
    const activeSettingsPage = document.querySelector('.settings-page.active');
    if (!activeSettingsPage) return;
        
    // === ENSURE CONSISTENT SINGLE-COLUMN LAYOUT ON SMALL SCREENS ===
    const allSettingsPages = document.querySelectorAll('.settings-page');
    allSettingsPages.forEach(page => {
      if (viewportWidth <= 800) {
        page.classList.remove('two-column');
      }
    });
        
    if (viewportWidth <= 800) {
      settingsPanel.classList.remove('two-column');
    }
        
    // === SET PANEL HEIGHT ===
    settingsPanel.style.maxHeight = `${maxAvailableHeight}px`;
        
    // === ADJUST CONTENT AREA MAX HEIGHT ===
    const settingsContent = settingsPanel.querySelector('.settings-content');
    const tabsHeight = settingsPanel.querySelector('.settings-tabs').offsetHeight;
    const contentMaxHeight = maxAvailableHeight - tabsHeight - 10; // Minimal padding
    settingsContent.style.maxHeight = `${contentMaxHeight}px`;
        
    // === ENSURE SCROLLING IS ENABLED ===
    settingsContent.style.overflowY = 'auto';
    settingsContent.style.overflowX = 'hidden';
        
    // === ENSURE CONTENT USES FULL WIDTH ===
    settingsContent.style.width = '100%';
    settingsContent.style.boxSizing = 'border-box';
        
    // === LOG FOR DEBUGGING ===
    console.log(`Settings panel adjusted: ${viewportWidth}x${viewportHeight}, panel height: ${maxAvailableHeight}px, content height: ${contentMaxHeight}px`);
  }
    
  /**
     * Adjusts the panel position to ensure it stays within the canvas container bounds
     * @param {HTMLElement} settingsPanel - The settings panel element
     * @param {DOMRect} canvasRect - The canvas container bounding rectangle
     */
  adjustPanelPosition(settingsPanel, canvasRect) {
    // Get panel dimensions after applying two-column class
    const panelRect = settingsPanel.getBoundingClientRect();
    const panelWidth = settingsPanel.offsetWidth;
        
    // === CALCULATE AVAILABLE SPACE ===
    const availableWidth = canvasRect.width;
    const currentLeft = 10; // Default left position
        
    // === CHECK IF PANEL WOULD EXTEND BEYOND RIGHT EDGE ===
    if (currentLeft + panelWidth > availableWidth) {
      // Move panel to the right edge of available space
      const newLeft = Math.max(0, availableWidth - panelWidth - 10); // 10px margin from right edge
      settingsPanel.style.left = `${newLeft}px`;
    } else {
      // Keep default position
      settingsPanel.style.left = '10px';
    }
  }
    
  /**
     * Updates the legend visibility based on the overlapping enabled state
     * Shows or hides the white overlap indicator in the legend
     */
  updateLegendVisibility() {
    // Use direct DOM manipulation (LegendComponent caused issues with visibility state)
    const overlapLegendItem = document.getElementById('overlapLegendItem');
    if (overlapLegendItem) {
      overlapLegendItem.style.display = this.overlappingEnabled ? 'flex' : 'none';
    }
    // Also update the legend text with current tolerance
    this.updateOverlapLegendText();
  }
    
  /**
     * Updates the overlap legend text to show the current tolerance value
     */
  updateOverlapLegendText() {
    const overlapLegendItem = document.getElementById('overlapLegendItem');
    if (overlapLegendItem) {
      const legendText = overlapLegendItem.querySelector('span');
      if (legendText) {
        legendText.textContent = `Overlap (±${this.overlapToleranceDB.toFixed(1)}dB)`;
      }
    }
  }
    
  /**
     * Updates the channel indicator to show whether input is Mono or Stereo
     * Also controls visibility of appropriate legend items
     * @param {string} channelType - 'Mono' or 'Stereo'
     */
  updateChannelIndicator(channelType) {
    // Use direct DOM manipulation (LegendComponent not used for legend state)
    const channelIndicator = document.getElementById('channelIndicator');
    const channelIndicatorText = document.getElementById('channelIndicatorText');
    // Get the legend container and query within it for more specificity
    const legendContainer = document.getElementById('legend');
    const leftChannelItem = legendContainer ? legendContainer.querySelector('.legend-item:nth-child(2)') : null;
    const rightChannelItem = legendContainer ? legendContainer.querySelector('.legend-item:nth-child(3)') : null;
        
    if (channelType === 'Mono') {
      // Show mono indicator, hide left/right channel indicators
      if (channelIndicator) channelIndicator.style.display = 'flex';
      if (channelIndicatorText) channelIndicatorText.textContent = 'Mono';
      if (leftChannelItem) {
        leftChannelItem.style.display = 'none';
        console.log('Hiding left channel item for Mono mode');
      }
      if (rightChannelItem) {
        rightChannelItem.style.display = 'none';
        console.log('Hiding right channel item for Mono mode');
      }
    } else {
      // Hide mono indicator, show left/right channel indicators
      if (channelIndicator) channelIndicator.style.display = 'none';
      if (leftChannelItem) {
        leftChannelItem.style.display = 'flex';
        console.log('Showing left channel item for Stereo mode');
      }
      if (rightChannelItem) {
        rightChannelItem.style.display = 'flex';
        console.log('Showing right channel item for Stereo mode');
      }
    }
  }
    
  /**
     * Updates the hold button text based on the current hold mode setting
     */
  updateHoldButtonText() {
    const holdBtn = document.getElementById('holdBtn');
    if (!holdBtn) return;
        
    // Update text based on current hold button mode
    if (this.holdButtonMode === 'average') {
      holdBtn.textContent = 'Aver';
    } else {
      holdBtn.textContent = 'Peak';
    }
  }
    
  /**
     * Sets up hold button event handlers based on the current hold button mode
     * Supports both latch (toggle) and temporary (while pressed) modes
     */
  setupHoldButtonHandlers() {
    const holdBtn = document.getElementById('holdBtn');
        
    // Remove any existing event listeners by cloning the button
    const newHoldBtn = holdBtn.cloneNode(true);
    holdBtn.parentNode.replaceChild(newHoldBtn, holdBtn);
        
    // Update button text for the current mode
    this.updateHoldButtonText();
        
    // Both latch and average modes use click to toggle
    newHoldBtn.addEventListener('mousedown', () => this.toggleHoldMode());
  }
    
  /**
     * Toggles the hold mode on/off (used in latch mode)
     * Hold mode tracks maximum amplitude values visually for the spectrogram
     */
  toggleHoldMode() {
    if (this.holdModeEnabled) {
      this.deactivateHoldMode();
    } else {
      this.activateHoldMode();
    }
  }
    
  /**
     * Activates hold mode and updates UI accordingly
     */
  activateHoldMode() {
    if (this.holdModeEnabled) return; // Already active
        
    this.holdModeEnabled = true;
        
    // Initialize hold session based on current mode
    this.initializeHoldSession();
        
    // Update button appearance to show active state (green background)
    const holdBtn = document.getElementById('holdBtn');
    if (holdBtn) {
      holdBtn.classList.add('active');
    }
  }
    
  /**
     * Deactivates hold mode and updates UI accordingly
     */
  deactivateHoldMode() {
    if (!this.holdModeEnabled) return; // Already inactive
        
    this.holdModeEnabled = false;
        
    // Clear hold session data
    this.clearHoldSession();
        
    // Update button appearance to show inactive state (gray background)
    const holdBtn = document.getElementById('holdBtn');
    if (holdBtn) {
      holdBtn.classList.remove('active');
    }
  }
    
  /**
     * Initializes hold session based on current mode
     * Called when entering hold mode
     */
  initializeHoldSession() {
    if (this.holdButtonMode === 'latch') {
      // Initialize arrays with minimum dB values for peak tracking
      this.heldAmplitudesLeft = new Float32Array(this.bufferLength);
      this.heldAmplitudesRight = new Float32Array(this.bufferLength);
      this.heldAmplitudesLeft.fill(-Infinity);
      this.heldAmplitudesRight.fill(-Infinity);
    } else if (this.holdButtonMode === 'average') {
      // Initialize arrays for averaging (linear scale for proper averaging)
      this.averageAmplitudesLeft = new Float32Array(this.bufferLength);
      this.averageAmplitudesRight = new Float32Array(this.bufferLength);
      this.averageAmplitudesLeft.fill(0);
      this.averageAmplitudesRight.fill(0);
      this.averageInitialized = false;  // Will be seeded with first real audio data
            
      // Initialize display arrays for computed averages (dB scale)
      this.heldAmplitudesLeft = new Float32Array(this.bufferLength);
      this.heldAmplitudesRight = new Float32Array(this.bufferLength);
      this.heldAmplitudesLeft.fill(-Infinity);
      this.heldAmplitudesRight.fill(-Infinity);
    }
  }
    
  /**
     * Clears hold session data
     * Called when exiting hold mode
     */
  clearHoldSession() {
    this.heldAmplitudesLeft = null;
    this.heldAmplitudesRight = null;
        
    if (this.holdButtonMode === 'average') {
      this.averageAmplitudesLeft = null;
      this.averageAmplitudesRight = null;
      this.averageInitialized = false;
    }
  }
  
  /**
   * Load M/S mode setting from server preferences
   */
  async loadMidSideModeFromSettings() {
    try {
      const response = await fetch('/api/preferences');
      if (!response.ok) {
        console.warn('Could not load M/S mode preference');
        return;
      }
      
      const data = await response.json();
      const midSideMode = data.preferences?.uiSettings?.general?.midSideMode;
      
      if (typeof midSideMode === 'boolean' && midSideMode !== this.midSideModeEnabled) {
        // Apply the saved M/S mode setting
        this.midSideModeEnabled = midSideMode;
        
        // Update UI to match
        const msToggleBtn = document.getElementById('msToggleBtn');
        if (msToggleBtn) {
          msToggleBtn.textContent = midSideMode ? 'MS' : 'ST';
          if (midSideMode) {
            msToggleBtn.classList.add('active');
            msToggleBtn.title = 'Mid-Side Mode Active (Click to switch to Stereo)';
          } else {
            msToggleBtn.classList.remove('active');
            msToggleBtn.title = 'Stereo Mode Active (Click to switch to Mid-Side)';
          }
        }
        
        // Update labels
        this.updateLegendLabels(midSideMode ? 'MS' : 'ST');
        this.levelMeters.updateMeterLabels(midSideMode ? 'MS' : 'ST');
      }
    } catch (error) {
      console.warn('Error loading M/S mode preference:', error);
    }
  }
  
  /**
   * Save M/S mode setting to server preferences
   */
  async saveMidSideModeToSettings() {
    try {
      // First, get current preferences
      const getResponse = await fetch('/api/preferences');
      if (!getResponse.ok) {
        console.warn('Could not load current preferences for M/S mode save');
        return;
      }
      
      const getData = await getResponse.json();
      const preferences = getData.preferences || {};
      
      // Ensure structure exists
      if (!preferences.uiSettings) {
        preferences.uiSettings = {};
      }
      if (!preferences.uiSettings.general) {
        preferences.uiSettings.general = {};
      }
      
      // Update M/S mode setting
      preferences.uiSettings.general.midSideMode = this.midSideModeEnabled;
      
      // Save back to server
      const saveResponse = await fetch('/api/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ preferences })
      });
      
      if (!saveResponse.ok) {
        console.warn('Could not save M/S mode preference');
      }
    } catch (error) {
      console.warn('Error saving M/S mode preference:', error);
    }
  }
  
  /**
   * Loads the M/S energy-preserving setting from preferences
   * and applies it to the M/S processor and UI checkbox
   */
  async loadMSEnergyPreservingFromSettings() {
    try {
      const response = await fetch('/api/preferences');
      if (!response.ok) {
        console.warn('Could not load M/S energy-preserving preference');
        return;
      }
      
      const data = await response.json();
      const msEnergyPreserving = data.preferences?.uiSettings?.general?.msEnergyPreserving;
      
      if (typeof msEnergyPreserving === 'boolean') {
        // Apply to processor
        if (this.msProcessor) {
          this.msProcessor.setEnergyPreserving(msEnergyPreserving);
        }
        
        // Update toggle UI
        const toggle = document.getElementById('msEnergyPreservingToggle');
        if (toggle) {
          toggle.checked = msEnergyPreserving;
        }
      }
    } catch (error) {
      console.warn('Error loading M/S energy-preserving preference:', error);
    }
  }
  
  /**
   * Saves the M/S energy-preserving setting to preferences
   * @param {boolean} isEnergyPreserving - Whether to use energy-preserving √2 scaling
   */
  async saveMSEnergyPreservingToSettings(isEnergyPreserving) {
    try {
      // First, get current preferences
      const getResponse = await fetch('/api/preferences');
      if (!getResponse.ok) {
        console.warn('Could not load current preferences for M/S energy-preserving save');
        return;
      }
      
      const getData = await getResponse.json();
      const preferences = getData.preferences || {};
      
      // Ensure structure exists
      if (!preferences.uiSettings) {
        preferences.uiSettings = {};
      }
      if (!preferences.uiSettings.general) {
        preferences.uiSettings.general = {};
      }
      
      // Update M/S energy-preserving setting
      preferences.uiSettings.general.msEnergyPreserving = isEnergyPreserving;
      
      // Save back to server
      const saveResponse = await fetch('/api/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ preferences })
      });
      
      if (!saveResponse.ok) {
        console.warn('Could not save M/S energy-preserving preference');
      }
    } catch (error) {
      console.warn('Error saving M/S energy-preserving preference:', error);
    }
  }
  
  /**
   * Toggles between Stereo (ST) and Mid-Side (MS) processing modes
   * Updates UI button state, legend labels, and meter labels accordingly
   */
  toggleMidSideMode() {
    // Toggle the state
    this.midSideModeEnabled = !this.midSideModeEnabled;
    
    // Update button appearance
    const msToggleBtn = document.getElementById('msToggleBtn');
    if (msToggleBtn) {
      if (this.midSideModeEnabled) {
        msToggleBtn.textContent = 'MS';
        msToggleBtn.classList.add('active');
        msToggleBtn.title = 'Mid-Side Mode Active (Click to switch to Stereo)';
      } else {
        msToggleBtn.textContent = 'ST';
        msToggleBtn.classList.remove('active');
        msToggleBtn.title = 'Stereo Mode Active (Click to switch to Mid-Side)';
      }
    }
    
    // Update legend labels
    this.updateLegendLabels(this.midSideModeEnabled ? 'MS' : 'ST');
    
    // Update meter labels
    this.levelMeters.updateMeterLabels(this.midSideModeEnabled ? 'MS' : 'ST');
    
    // Save preference to server
    this.saveMidSideModeToSettings();
  }
  
  /**
   * Updates the legend labels based on current mode (Stereo or Mid-Side)
   * @param {string} mode - 'ST' for Stereo mode or 'MS' for Mid-Side mode
   */
  updateLegendLabels(mode) {
    // Get legend items for left and right channels
    const legendItems = document.querySelectorAll('.legend-item');
    
    // Legend structure: [0] Channel Indicator, [1] Left/Mid, [2] Right/Side, [3] Overlap
    if (legendItems.length >= 3) {
      const leftLabel = legendItems[1].querySelector('span');
      const rightLabel = legendItems[2].querySelector('span');
      
      if (leftLabel && rightLabel) {
        if (mode === 'MS') {
          // Mid-Side mode labels
          leftLabel.textContent = 'Mid';
          rightLabel.textContent = 'Side';
        } else {
          // Stereo mode labels
          leftLabel.textContent = 'Left';
          rightLabel.textContent = 'Right';
        }
      }
    }
  }
    
  /**
     * Updates held amplitude values with new maximum values if they exceed current held values
     * Only called when hold mode is enabled
     * 
     * @param {Float32Array} dataLeft - Current FFT frequency data for left channel (dB values)
     * @param {Float32Array} dataRight - Current FFT frequency data for right channel (dB values)
     */
  updateHeldAmplitudes(dataLeft, dataRight) {
    if (!this.holdModeEnabled || !this.heldAmplitudesLeft || !this.heldAmplitudesRight) {
      return; // Hold mode not active or arrays not initialized
    }
        
    if (this.holdButtonMode === 'latch') {
      // === LATCH MODE: Track peak values ===
      for (let i = 0; i < dataLeft.length; i++) {
        // Update left channel held amplitude if current value is higher
        if (dataLeft[i] > this.heldAmplitudesLeft[i]) {
          this.heldAmplitudesLeft[i] = dataLeft[i];
        }
                
        // Update right channel held amplitude if current value is higher
        if (dataRight[i] > this.heldAmplitudesRight[i]) {
          this.heldAmplitudesRight[i] = dataRight[i];
        }
      }
    } else if (this.holdButtonMode === 'average') {
      // === AVERAGE MODE: Exponential Moving Average for responsive outlier handling ===
      // EMA formula: newAvg = α * newValue + (1-α) * oldAvg
      // where α (smoothing factor) controls responsiveness to new data
      const alpha = this.averageSmoothingFactor;
            
      for (let i = 0; i < dataLeft.length; i++) {
        // Convert dB to linear scale for proper averaging
        // Handle -Infinity case by treating as zero power
        const linearLeft = dataLeft[i] === -Infinity ? 0 : Math.pow(10, dataLeft[i] / 10);
        const linearRight = dataRight[i] === -Infinity ? 0 : Math.pow(10, dataRight[i] / 10);
                
        if (!this.averageInitialized) {
          // First frame: seed the averages with initial values
          this.averageAmplitudesLeft[i] = linearLeft;
          this.averageAmplitudesRight[i] = linearRight;
        } else {
          // Subsequent frames: apply exponential moving average
          // This gives more weight to recent data, allowing outliers to fade naturally
          this.averageAmplitudesLeft[i] = alpha * linearLeft + (1 - alpha) * this.averageAmplitudesLeft[i];
          this.averageAmplitudesRight[i] = alpha * linearRight + (1 - alpha) * this.averageAmplitudesRight[i];
        }
                
        // Convert back to dB for display
        if (this.averageAmplitudesLeft[i] > 0) {
          this.heldAmplitudesLeft[i] = 10 * Math.log10(this.averageAmplitudesLeft[i]);
        } else {
          this.heldAmplitudesLeft[i] = -Infinity;
        }
                
        if (this.averageAmplitudesRight[i] > 0) {
          this.heldAmplitudesRight[i] = 10 * Math.log10(this.averageAmplitudesRight[i]);
        } else {
          this.heldAmplitudesRight[i] = -Infinity;
        }
      }
            
      // Mark averages as initialized after first frame
      if (!this.averageInitialized) {
        this.averageInitialized = true;
      }
    }
  }
    
  /**
     * Handles canvas click events for frequency/amplitude display
     * @param {MouseEvent} e - The click event
     */
  handleCanvasClick(e) {
    // === GET CLICK COORDINATES ===
    const rect = this.canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
        
    // === CHECK IF CLICK IS ON CLOSE BUTTON ===
    if (this.showClickInfo && this.clickPoint && this.clickPoint.closeX !== undefined) {
      if (clickX >= this.clickPoint.closeX && clickX <= this.clickPoint.closeX + this.clickPoint.closeSize &&
                clickY >= this.clickPoint.closeY && clickY <= this.clickPoint.closeY + this.clickPoint.closeSize) {
        // Click was on close button - hide the info
        this.showClickInfo = false;
        this.clickPoint = null;
        return;
      }
    }
        
    // === CHECK IF CLICK IS WITHIN PLOT AREA ===
    if (clickX < this.plotLeft || clickX > this.plotRight || 
            clickY < this.plotTop || clickY > this.plotBottom) {
      return; // Click outside plot area
    }
        
    // === CONVERT CLICK COORDINATES TO FREQUENCY AND AMPLITUDE ===
    const frequency = this.pixelToFrequency(clickX);
    const amplitude = this.pixelToAmplitude(clickY);
        
    // === STORE CLICK INFORMATION ===
    this.clickPoint = {
      x: clickX,
      y: clickY,
      frequency: frequency,
      amplitude: amplitude,
      displayX: clickX,
      displayY: clickY,
      textWidth: 0 // Will be calculated when drawing
    };
    this.showClickInfo = true;
  }
    
  /**
     * Converts pixel X coordinate to frequency value
     * @param {number} pixelX - X coordinate in pixels
     * @returns {number} Frequency in Hz
     */
  pixelToFrequency(pixelX) {
    // Reverse the logarithmic frequency scaling
    const normalizedX = (pixelX - this.plotLeft) / this.plotWidth;
    const logRange = Math.log10(this.maxFreq / this.minFreq);
    const frequency = this.minFreq * Math.pow(10, normalizedX * logRange);
    return Math.round(frequency);
  }
    
  /**
     * Converts pixel Y coordinate to amplitude value in dB
     * @param {number} pixelY - Y coordinate in pixels
     * @returns {number} Amplitude in dB
     */
  pixelToAmplitude(pixelY) {
    // Reverse the linear amplitude scaling using adjustable range
    const normalizedY = (this.plotBottom - pixelY) / (this.plotHeight * this.amplitudeScale);
    const amplitude = this.adjustableMinDB + (normalizedY * (this.maxDB - this.adjustableMinDB));
    return Math.round(amplitude * 10) / 10; // Round to 1 decimal place
  }
    
  /**
     * Adjusts canvas size and calculates drawing areas when window is resized
     * Handles high-DPI displays and organizes screen real estate for different elements
     */
  resizeCanvas() {
    // === GET CONTAINER DIMENSIONS ===
    // The canvas fills its container, so we need to know the container's actual size
    const containerRect = this.canvasContainer.getBoundingClientRect();
    const containerWidth = containerRect.width;      // Container width in CSS pixels
    const containerHeight = containerRect.height;    // Container height in CSS pixels
        
    // === HANDLE HIGH-DPI DISPLAYS ===
    // On high-DPI displays (Retina, etc.), we need more canvas pixels than CSS pixels
    // to avoid blurry rendering. devicePixelRatio tells us the scaling factor.
    const dpr = window.devicePixelRatio || 1;        // Usually 1 for normal displays, 2+ for high-DPI
    this.canvas.width = containerWidth * dpr;        // Set canvas resolution (in device pixels)
    this.canvas.height = containerHeight * dpr;      // Higher resolution = sharper graphics
        
    // === SCALE DRAWING CONTEXT ===
    // Scale the drawing context so our code can work in CSS pixels
    // but the actual rendering uses the full device resolution
    this.ctx.scale(dpr, dpr);
        
    // === STORE WORKING DIMENSIONS ===
    // We'll use these throughout our drawing code (in CSS pixels for easy math)
    this.canvasWidth = containerWidth;
    this.canvasHeight = containerHeight;
        
    // === CALCULATE DRAWING AREAS ===
    // Divide the canvas into regions: rulers, spectrum plot, and level meters
    this.plotLeft = 82;                              // Reserve space for dB scale (left side)
        
    // Dynamically size the meter area based on actual meter layout needs
    // 4 meters (30px each) + spacing (20+10+10+10) + right padding for dB scale numbers
    // Added extra padding (25px) to prevent dB scale numbers from being cut off in kiosk mode
    const meterAreaWidth = Math.max(205, Math.min(225, this.canvasWidth * 0.15));
    this.plotRight = this.canvasWidth - meterAreaWidth;  // Spectrum ends here, meters begin
        
    this.plotTop = 20;                               // Space for meter labels at top
    this.plotBottom = this.canvasHeight - 35;        // Reduced space for frequency scale at bottom (was 60px)
        
    // === CALCULATE SPECTRUM PLOT DIMENSIONS ===
    this.plotWidth = this.plotRight - this.plotLeft;    // Width available for spectrum display
    this.plotHeight = this.plotBottom - this.plotTop;   // Height available for spectrum display
        
    // Update level meters layout
    this.levelMeters.updateLayout();
  }
    
  /**
     * Starts the spectrum analyzer by setting up the Web Audio API chain
     * This method requests microphone access and creates the audio processing pipeline
     */
  async start() {
    try {
      // === NOTIFY USER OF MICROPHONE REQUEST ===
      this.updateStatus('Requesting audio device access...');
            
      // === REQUEST AUDIO ACCESS (using selected device if available) ===
      // Use the device selected in the dropdown, or default if none selected
      const audioConstraints = {
        audio: {
          sampleRate: 44100,             // CD-quality sample rate (44.1 kHz)
          echoCancellation: false,       // Disable processing - we want raw audio
          noiseSuppression: false,       // Disable noise reduction - we want everything
          autoGainControl: false         // Disable automatic volume adjustment
        }
      };
            
      // Add device ID if a specific device was selected
      if (window.selectedAudioDeviceId && window.selectedAudioDeviceId !== 'default') {
        audioConstraints.audio.deviceId = { exact: window.selectedAudioDeviceId };
        console.log('Using selected audio device:', window.selectedAudioDeviceId);
      } else {
        console.log('Using default audio device');
      }
            
      this.mediaStream = await navigator.mediaDevices.getUserMedia(audioConstraints);
            
      // === DETECT INPUT CHANNEL COUNT ===
      let inputChannelCount = 2; // Default to stereo
      if (this.mediaStream.getAudioTracks()[0] && this.mediaStream.getAudioTracks()[0].getSettings) {
        inputChannelCount = this.mediaStream.getAudioTracks()[0].getSettings().channelCount || 1;
      }
      
      // === UPDATE STEREO/MONO STATE FOR M/S PROCESSING ===
      this.isStereoInput = (inputChannelCount === 2);
      
      // === INITIALIZE MID-SIDE PROCESSOR FOR STEREO INPUT ===
      if (this.isStereoInput) {
        // Create M/S processor instance for stereo input
        this.msProcessor = new MidSideProcessor();
        // Load and apply the energy-preserving setting
        await this.loadMSEnergyPreservingFromSettings();
      } else {
        // Clear M/S processor for mono input
        this.msProcessor = null;
        // Force stereo mode (disable M/S mode for mono)
        this.midSideModeEnabled = false;
      }
      
      // === UPDATE M/S TOGGLE BUTTON STATE ===
      const msToggleBtn = document.getElementById('msToggleBtn');
      if (msToggleBtn) {
        if (this.isStereoInput) {
          // Enable button for stereo input
          msToggleBtn.disabled = false;
          msToggleBtn.title = this.midSideModeEnabled ? 
            'Mid-Side Mode Active (Click to switch to Stereo)' : 
            'Stereo Mode Active (Click to switch to Mid-Side)';
        } else {
          // Disable button for mono input
          msToggleBtn.disabled = true;
          msToggleBtn.textContent = 'ST';
          msToggleBtn.classList.remove('active');
          msToggleBtn.title = 'Mid-Side requires stereo input';
        }
      }
      
      // === UPDATE LEGEND LABELS BASED ON MODE ===
      this.updateLegendLabels(this.midSideModeEnabled ? 'MS' : 'ST');
            
      // === CREATE AUDIO CONTEXT ===
      // AudioContext is the main interface for audio processing in browsers
      // It manages the audio processing graph and timing
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 44100              // Match the input sample rate
      });
            
      // === CREATE AUDIO SOURCE NODE ===
      // Convert the media stream into an audio node that can be processed
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
            
      // === CREATE GAIN NODE ===
      // Gain node allows manual volume adjustment before analysis
      this.gainNode = this.audioContext.createGain();
            
      // Set initial gain from current setting (convert dB to linear)
      const initialLinearGain = Math.pow(10, this.inputGainDB / 20);
      this.gainNode.gain.setValueAtTime(initialLinearGain, this.audioContext.currentTime);
            
      // === CREATE SPECTROGRAM ANALYZER NODES ===
      // AnalyserNode performs FFT analysis on audio data for spectrum display
      // We need one for each channel to compare left vs right
      this.analyserLeft = this.audioContext.createAnalyser();
      this.analyserRight = this.audioContext.createAnalyser();
            
      // === CONFIGURE SPECTROGRAM ANALYZER SETTINGS ===
      // Set up the FFT parameters for both spectrogram analyzers
      this.analyserLeft.fftSize = this.fftSize;                    // Number of samples for FFT
      this.analyserRight.fftSize = this.fftSize;                   
      this.analyserLeft.smoothingTimeConstant = 0.788;             // Smooth out fluctuations (UI shows 50)
      this.analyserRight.smoothingTimeConstant = 0.788;
            
      // === CREATE DEDICATED METER ANALYZER NODES ===
      // These analyzers are independent of spectrogram FFT size for optimal meter performance
      this.meterAnalyserLeft = this.audioContext.createAnalyser();
      this.meterAnalyserRight = this.audioContext.createAnalyser();
            
      // === CONFIGURE METER ANALYZER SETTINGS ===
      // FFT size optimized for RMS meter integration time (independent of spectrogram)
      // Using 8192 samples provides proper RMS integration window:
      // - At 48kHz: 8192/48000 = 171ms integration time
      // - At 44.1kHz: 8192/44100 = 186ms integration time
      // This is closer to the industry standard ~300ms for RMS meters
      // Combined with smoothing algorithms, this provides accurate RMS measurements
      this.meterAnalyserLeft.fftSize = this.meterFFTSize;          // Use configurable meter FFT size
      this.meterAnalyserRight.fftSize = this.meterFFTSize;         
      this.meterAnalyserLeft.smoothingTimeConstant = 0.3;          // Faster response for meters
      this.meterAnalyserRight.smoothingTimeConstant = 0.3;             
            
      // === SETUP AUDIO ROUTING BASED ON INPUT TYPE ===
      if (inputChannelCount === 1) {
        // === MONO INPUT HANDLING ===
        // For mono input, duplicate the single channel to both spectrogram and meter analyzers
        this.updateStatus('Mono input detected - duplicating to stereo...');
        this.updateChannelIndicator('Mono');                    // Update legend to show Mono
                
        // Build the signal chain: Input → Gain → Analyzers (both spectrogram and meters)
        this.source.connect(this.gainNode);                     // Input feeds the gain node
                
        // Connect spectrogram analyzers
        this.gainNode.connect(this.analyserLeft);               // Gain output to left spectrogram analyzer
        this.gainNode.connect(this.analyserRight);              // Same gain output to right spectrogram analyzer
                
        // Connect meter analyzers (same signal to both)
        this.gainNode.connect(this.meterAnalyserLeft);          // Gain output to left meter analyzer
        this.gainNode.connect(this.meterAnalyserRight);         // Same gain output to right meter analyzer
                
        // Note: No splitter needed for mono - same gained signal goes to all analyzers
      } else {
        // === STEREO INPUT HANDLING ===
        // For stereo input, use channel splitters to separate left and right for both spectrogram and meters
        this.updateStatus('Stereo input detected...');
        this.updateChannelIndicator('Stereo');                  // Update legend to show Stereo
                
        // Create channel splitters for both spectrogram and meters
        this.splitter = this.audioContext.createChannelSplitter(2);      // For spectrogram
        this.meterSplitter = this.audioContext.createChannelSplitter(2); // For meters
                
        // === CONNECT THE AUDIO PROCESSING GRAPH ===
        // Build the signal chain: Input → Gain → Splitters → Analyzers
        //                                              ├─→ Spectrogram Splitter ──→ Left/Right Spectrogram Analyzers
        //                         Input ──→ Gain ──→ ├
        //                                              └─→ Meter Splitter ──────→ Left/Right Meter Analyzers
        this.source.connect(this.gainNode);                     // Input feeds the gain node
                
        // Connect to both splitters
        this.gainNode.connect(this.splitter);                   // Gain output feeds the spectrogram splitter
        this.gainNode.connect(this.meterSplitter);              // Gain output also feeds the meter splitter
                
        // Connect spectrogram analyzers
        this.splitter.connect(this.analyserLeft, 0);            // Left channel to left spectrogram analyzer
        this.splitter.connect(this.analyserRight, 1);           // Right channel to right spectrogram analyzer
                
        // Connect meter analyzers
        this.meterSplitter.connect(this.meterAnalyserLeft, 0);  // Left channel to left meter analyzer
        this.meterSplitter.connect(this.meterAnalyserRight, 1); // Right channel to right meter analyzer
      }
            
      // === START THE ANALYSIS LOOP ===
      this.isRunning = true;                                      // Set running flag
      this.levelMeters.initialize(this.meterAnalyserLeft, this.meterAnalyserRight); // Initialize level meters with dedicated analyzers
      this.animate();                                             // Start the drawing loop
            
      // === UPDATE USER INTERFACE ===
      document.getElementById('startBtn').disabled = true;        // Disable start button
      document.getElementById('stopBtn').disabled = false;        // Enable stop button
      this.updateStatus('');                                      // Clear status message
            
    } catch (error) {
      // === HANDLE ERRORS ===
      // Common causes: user denied microphone access, no microphone available
      console.error('Error starting analyzer:', error);
      this.updateStatus('Error: Could not access microphone');
    }
  }
    
  /**
     * Stops the spectrum analyzer and cleans up all audio resources
     * Properly disconnects the Web Audio API chain and releases microphone access
     */
  stop() {
    // === STOP THE ANIMATION LOOP ===
    this.isRunning = false;                             // Signal the animate loop to stop
        
    // Cancel any pending animation frame to stop drawing immediately
    if (this.animationId) {
      clearTimeout(this.animationId);                 // Stop the drawing loop
    }
        
    // === RELEASE MICROPHONE ACCESS ===
    // Stop all tracks in the media stream to release the microphone
    // This turns off the microphone indicator in the browser
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
        
    // === CLOSE AUDIO CONTEXT ===
    // Clean up the Web Audio API context and free system resources
    if (this.audioContext) {
      this.audioContext.close();                      // Closes context and disconnects all nodes
    }
        
    // === RESET ALL REFERENCES ===
    // Clear all object references to prevent memory leaks
    this.audioContext = null;                          // Audio processing context
    this.mediaStream = null;                           // Microphone stream
    this.source = null;                                // Audio source node
    this.gainNode = null;                              // Gain node for volume adjustment
    this.splitter = null;                              // Channel splitter node for spectrogram (null for mono inputs)
    this.analyserLeft = null;                          // Left channel spectrogram analyzer
    this.analyserRight = null;                         // Right channel spectrogram analyzer
    this.meterSplitter = null;                         // Channel splitter node for meters (null for mono inputs)
    this.meterAnalyserLeft = null;                     // Left channel meter analyzer
    this.meterAnalyserRight = null;                    // Right channel meter analyzer
        
    // === UPDATE USER INTERFACE ===
    document.getElementById('startBtn').disabled = false;   // Enable start button
    document.getElementById('stopBtn').disabled = true;     // Disable stop button
    this.updateStatus('Analysis stopped');                  // Show status message
    this.updateChannelIndicator('Stereo');                  // Reset channel indicator to default
        
    // === CLEAR CLICK POINT INFO ===
    // Hide any active click point information
    this.showClickInfo = false;
    this.clickPoint = null;
        
    // === CLEAR HOLD MODE ===
    // Reset hold mode when stopping
    if (this.holdModeEnabled) {
      this.deactivateHoldMode();
    }
        
    // === CLEAR FREEZE MODES ===
    // Reset all freeze buttons when stopping
    this.freezeButtons.forEach((freezeData, freezeId) => {
      if (freezeData.active) {
        this.clearFreezeLine(freezeId);
      }
    });
        
    // === CLEAR DISPLAY ===
    // Clear the entire canvas and redraw just the static elements (grid, labels)
    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.drawStaticElements();                              // Redraw grid and labels
  }
    
  /**
     * Main animation loop that continuously updates the display
     * Uses setTimeout for optimized 30fps rendering (better for Raspberry Pi performance)
     */
  animate() {
    // === CHECK IF WE SHOULD CONTINUE ===
    // Exit immediately if stop() has been called
    if (!this.isRunning) return;
        
    // === DRAW ONE FRAME ===
    // Update the entire display with current audio data
    this.draw();
        
    // === SCHEDULE NEXT FRAME ===
    // setTimeout calls this function again based on configured refresh rate
    // This provides good performance while reducing CPU load on Raspberry Pi
    this.animationId = setTimeout(() => this.animate(), 1000 / this.refreshRate);
  }
    
  /**
     * Draws one complete frame of the spectrum analyzer
     * This method is called at the configured refresh rate to create real-time visualization
     */
  draw() {
    // === GET FREQUENCY DOMAIN DATA ===
    // Frequency data shows how much energy is present at each frequency
    // Values are in dB (decibels), typically ranging from -Infinity to 0 dB
    const dataLeft = new Float32Array(this.bufferLength);     // Array for left channel FFT data
    const dataRight = new Float32Array(this.bufferLength);    // Array for right channel FFT data
        
    // Get the current FFT data from both analyzers (in dB)
    this.analyserLeft.getFloatFrequencyData(dataLeft);       // Fill array with left channel spectrum (dB)
    this.analyserRight.getFloatFrequencyData(dataRight);     // Fill array with right channel spectrum (dB)
    
    // === APPLY MID-SIDE ENCODING TO FREQUENCY DATA IF ENABLED ===
    // M/S encoding can be applied in frequency domain since both FFT and M/S are linear transforms
    // For simplicity in frequency domain with magnitude-only data:
    // Mid power ≈ (L power + R power) / 2, Side power ≈ (L power + R power) / 2
    // This is an approximation that works reasonably well for visualization
    if (this.midSideModeEnabled && this.isStereoInput) {
      // Create temp arrays for M and S
      const dataMid = new Float32Array(dataLeft.length);
      const dataSide = new Float32Array(dataLeft.length);
      
      for (let i = 0; i < dataLeft.length; i++) {
        // Convert dB to linear power
        const powerL = Math.pow(10, dataLeft[i] / 10);
        const powerR = Math.pow(10, dataRight[i] / 10);
        
        // Approximate M and S power in frequency domain
        // For perfectly correlated signals (L=R): all energy in M, none in S
        // For perfectly uncorrelated signals: energy split between M and S
        // For anti-phase (L=-R): all energy in S, none in M
        // Simple approximation: average the powers for visualization
        const powerM = (powerL + powerR) / 2;
        const powerS = Math.abs(powerL - powerR) / 2;
        
        // Convert back to dB
        dataMid[i] = powerM > 0 ? 10 * Math.log10(powerM) : -Infinity;
        dataSide[i] = powerS > 0 ? 10 * Math.log10(powerS) : -Infinity;
      }
      
      // Replace dataLeft and dataRight with Mid and Side for display
      for (let i = 0; i < dataLeft.length; i++) {
        dataLeft[i] = dataMid[i];
        dataRight[i] = dataSide[i];
      }
    }
        
    // === UPDATE HELD AMPLITUDES (IF HOLD MODE IS ACTIVE) ===
    // Track maximum amplitude values for visual hold mode
    this.updateHeldAmplitudes(dataLeft, dataRight);
        
    // === UPDATE FREEZE AMPLITUDES (IF ANY FREEZE BUTTONS ARE CAPTURING) ===
    // Track maximum amplitude values for freeze capture mode
    this.updateFreezeAmplitudes(dataLeft, dataRight);
        
    // === GET TIME DOMAIN DATA FOR LEVEL METERS ===
    // Time domain data shows the raw audio waveform (amplitude over time)
    // We use this to calculate peak and RMS levels for the level meters
    // Use dedicated meter analyzers with proper integration window size
    // Using 8192 samples (configurable) for accurate RMS integration time (~171ms at 48kHz)
    const timeDataLeft = new Float32Array(this.meterFFTSize);       // Array for left channel waveform
    const timeDataRight = new Float32Array(this.meterFFTSize);      // Array for right channel waveform
        
    // Get the current time domain data from dedicated meter analyzers
    this.meterAnalyserLeft.getFloatTimeDomainData(timeDataLeft);    // Fill array with left channel waveform
    this.meterAnalyserRight.getFloatTimeDomainData(timeDataRight);  // Fill array with right channel waveform
    
    // === APPLY MID-SIDE ENCODING IF ENABLED ===
    // Convert L/R to Mid/Side if M/S mode is active and we have stereo input
    let meterDataLeft = timeDataLeft;
    let meterDataRight = timeDataRight;
    
    if (this.midSideModeEnabled && this.isStereoInput && this.msProcessor) {
      // Encode stereo L/R to Mid/Side
      const msData = this.msProcessor.encodeMidSide(timeDataLeft, timeDataRight);
      meterDataLeft = msData.mid;   // Mid replaces Left for meter display
      meterDataRight = msData.side; // Side replaces Right for meter display
    }
        
    // === UPDATE LEVEL METERS ===
    // Calculate peak and RMS levels from the time domain data (L/R or M/S depending on mode)
    this.levelMeters.updateLevels(meterDataLeft, meterDataRight);
        
    // === CLEAR DRAWING AREAS ===
    // Clear the entire canvas to remove old rulers and labels
    this.ctx.fillStyle = '#111';                              // Dark background color
    this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);  // Clear entire canvas
    this.levelMeters.clearMeterArea();                        // Clear meter area
        
    // === DRAW BACKGROUND GRID ===
    // Draw the frequency and amplitude grid lines
    this.drawGrid();
        
    // === DRAW SPECTRUM LINES ===
    // Draw the frequency response curves for both channels with blending
    this.drawSpectrum(dataLeft, dataRight);                   // Both channels with white blending for overlaps
        
    // Ensure alpha is reset to full opacity for other drawing operations
    this.ctx.globalAlpha = 1.0;
        
    // === DRAW FREEZE LINES ===
    // Draw all active freeze lines as overlays
    this.drawFreezeLines();
        
    // === DRAW LEVEL METERS ===
    // Draw all four level meters (peak left, RMS left, RMS right, peak right)
    this.levelMeters.drawAllMeters();
        
    // === DRAW CLICK POINT INFORMATION ===
    // Draw the interactive frequency/amplitude display if active
    if (this.showClickInfo && this.clickPoint) {
      this.drawClickPointInfo();
    }
        
    // === REDRAW RULERS AND LABELS ===
    // Draw the frequency and dB scales (these go on top of everything)
    this.drawRulers();                                         // Frequency and dB scales for spectrum
    this.drawLabels();                                         // Axis labels and titles
    this.levelMeters.drawMeterRulers();                       // dB scale for level meters
  }
    
  /**
     * Draws frequency spectrum curves for both audio channels
     * When overlapping is enabled and channels are within 1dB, draws in white
     * Otherwise draws left in green and right in blue
     * When hold mode is enabled, draws held amplitudes at full opacity and live at 25% opacity
     * When pixel averaging is enabled, averages FFT bins that fall within the same pixel column
     * 
     * @param {Float32Array} dataLeft - FFT frequency data for left channel (dB values)
     * @param {Float32Array} dataRight - FFT frequency data for right channel (dB values)
     */
  drawSpectrum(dataLeft, dataRight) {
    if (this.holdModeEnabled && this.heldAmplitudesLeft && this.heldAmplitudesRight) {
      // === HOLD MODE: DRAW BOTH HELD AND LIVE SPECTRUMS ===
            
      // First draw the live spectrum at reduced opacity (25%)
      this.ctx.globalAlpha = 0.25;  // Set to 25% opacity for "ghost" effect
            
      this.drawSpectrumWithMode(dataLeft, dataRight);
            
      // Reset opacity and draw the held spectrum at full opacity
      this.ctx.globalAlpha = 1.0;  // Full opacity for held spectrum
            
      this.drawSpectrumWithMode(this.heldAmplitudesLeft, this.heldAmplitudesRight);
    } else {
      // === NORMAL MODE: DRAW SPECTRUM AS USUAL ===
      this.drawSpectrumWithMode(dataLeft, dataRight);
    }
  }
    
  /**
     * Draws spectrum with the appropriate mode (pixel averaging vs bin-based, overlapping vs simple)
     * 
     * @param {Float32Array} dataLeft - FFT frequency data for left channel (dB values)
     * @param {Float32Array} dataRight - FFT frequency data for right channel (dB values)
     */
  drawSpectrumWithMode(dataLeft, dataRight) {
    if (this.pixelAveragingEnabled) {
      // === PIXEL-BASED AVERAGING MODE ===
      if (this.overlappingEnabled) {
        this.drawSpectrumPixelAveragedWithOverlapping(dataLeft, dataRight);
      } else {
        this.drawSpectrumPixelAveragedSimple(dataLeft, dataRight);
      }
    } else {
      // === TRADITIONAL BIN-BASED MODE ===
      if (this.overlappingEnabled) {
        this.drawSpectrumWithOverlapping(dataLeft, dataRight);
      } else {
        this.drawSpectrumSimple(dataLeft, dataRight);
      }
    }
  }
    
  /**
     * Draws simple separate spectrum lines for both channels (no overlap detection)
     * 
     * @param {Float32Array} dataLeft - FFT frequency data for left channel (in dB)
     * @param {Float32Array} dataRight - FFT frequency data for right channel (in dB)
     */
  drawSpectrumSimple(dataLeft, dataRight) {
    const sampleRate = this.audioContext.sampleRate;
        
    // === CHECK IF INPUT IS MONO ===
    if (!this.isStereoInput) {
      // === DRAW MONO CHANNEL (ORANGE/YELLOW) ===
      this.ctx.strokeStyle = '#ffaa00';  // Use orange color for mono (matches legend)
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      let isFirstPoint = true;
          
      for (let i = 0; i < dataLeft.length; i++) {
        const frequency = (i * sampleRate) / (2 * dataLeft.length);
        if (frequency < this.minFreq || frequency > this.maxFreq) continue;
              
        const x = this.plotLeft + (Math.log10(frequency / this.minFreq) / Math.log10(this.maxFreq / this.minFreq)) * this.plotWidth;
        const dbValue = Math.max(this.adjustableMinDB, Math.min(this.maxDB, dataLeft[i] + this.amplitudeCalibrationDB));
        const dbRange = this.maxDB - this.adjustableMinDB;
        const y = this.plotBottom - ((dbValue - this.adjustableMinDB) / dbRange) * this.plotHeight;
              
        if (isFirstPoint) {
          this.ctx.moveTo(x, y);
          isFirstPoint = false;
        } else {
          this.ctx.lineTo(x, y);
        }
      }
      this.ctx.stroke();
      return;  // Exit early for mono
    }
        
    // === DRAW LEFT CHANNEL (GREEN) ===
    this.ctx.strokeStyle = '#00ff00';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    let isFirstPointLeft = true;
        
    for (let i = 0; i < dataLeft.length; i++) {
      const frequency = (i * sampleRate) / (2 * dataLeft.length);
      if (frequency < this.minFreq || frequency > this.maxFreq) continue;
            
      const x = this.plotLeft + (Math.log10(frequency / this.minFreq) / Math.log10(this.maxFreq / this.minFreq)) * this.plotWidth;
      // Convert dB value to pixel position (clamp to display range)
      // Apply calibration offset to correct for Web Audio API's internal reference level
      // Using fixed dB-per-pixel scaling (similar to PAM FFT plugin) for accurate amplitude display
      const dbValue = Math.max(this.adjustableMinDB, Math.min(this.maxDB, dataLeft[i] + this.amplitudeCalibrationDB));
      const dbRange = this.maxDB - this.adjustableMinDB;
      const y = this.plotBottom - ((dbValue - this.adjustableMinDB) / dbRange) * this.plotHeight;
            
      if (isFirstPointLeft) {
        this.ctx.moveTo(x, y);
        isFirstPointLeft = false;
      } else {
        this.ctx.lineTo(x, y);
      }
    }
    this.ctx.stroke();
        
    // === DRAW RIGHT CHANNEL (BLUE) ===
    this.ctx.strokeStyle = '#0080ff';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    let isFirstPointRight = true;
        
    for (let i = 0; i < dataRight.length; i++) {
      const frequency = (i * sampleRate) / (2 * dataRight.length);
      if (frequency < this.minFreq || frequency > this.maxFreq) continue;
            
      const x = this.plotLeft + (Math.log10(frequency / this.minFreq) / Math.log10(this.maxFreq / this.minFreq)) * this.plotWidth;
      // Convert dB value to pixel position (clamp to display range)
      // Apply calibration offset to correct for Web Audio API's internal reference level
      // Using fixed dB-per-pixel scaling (similar to PAM FFT plugin) for accurate amplitude display
      const dbValue = Math.max(this.adjustableMinDB, Math.min(this.maxDB, dataRight[i] + this.amplitudeCalibrationDB));
      const dbRange = this.maxDB - this.adjustableMinDB;
      const y = this.plotBottom - ((dbValue - this.adjustableMinDB) / dbRange) * this.plotHeight;
            
      if (isFirstPointRight) {
        this.ctx.moveTo(x, y);
        isFirstPointRight = false;
      } else {
        this.ctx.lineTo(x, y);
      }
    }
    this.ctx.stroke();
  }
    
  /**
     * Draws spectrum curves with overlap detection and white blending
     * 
     * @param {Float32Array} dataLeft - FFT frequency data for left channel (in dB)
     * @param {Float32Array} dataRight - FFT frequency data for right channel (in dB)
     */
  drawSpectrumWithOverlapping(dataLeft, dataRight) {
    // === FOR MONO INPUT, FALLBACK TO SIMPLE DRAWING ===
    // No point in overlap detection when left and right are identical
    if (!this.isStereoInput) {
      this.drawSpectrumSimple(dataLeft, dataRight);
      return;
    }
        
    const sampleRate = this.audioContext.sampleRate;          // Get sample rate (44100 Hz)
        
    // === COLLECT ALL POINTS WITH OVERLAP INFORMATION ===
    const allPoints = [];
        
    // === PROCESS EACH FREQUENCY BIN ===
    for (let i = 0; i < dataLeft.length; i++) {
      // === CALCULATE FREQUENCY FOR THIS BIN ===
      const frequency = (i * sampleRate) / (2 * dataLeft.length);
            
      // === SKIP FREQUENCIES OUTSIDE DISPLAY RANGE ===
      if (frequency < this.minFreq || frequency > this.maxFreq) continue;
            
      // === CONVERT FREQUENCY TO X-COORDINATE (LOGARITHMIC SCALE) ===
      const x = this.plotLeft + (Math.log10(frequency / this.minFreq) / Math.log10(this.maxFreq / this.minFreq)) * this.plotWidth;
            
      // === CONVERT AMPLITUDES TO Y-COORDINATES ===
      // Convert dB values to pixel positions (clamp to display range)
      // Apply calibration offset to correct for Web Audio API's internal reference level
      // Using fixed dB-per-pixel scaling (similar to PAM FFT plugin) for accurate amplitude display
      const dbLeft = Math.max(this.adjustableMinDB, Math.min(this.maxDB, dataLeft[i] + this.amplitudeCalibrationDB));
      const dbRight = Math.max(this.adjustableMinDB, Math.min(this.maxDB, dataRight[i] + this.amplitudeCalibrationDB));
      const dbRange = this.maxDB - this.adjustableMinDB;
      const yLeft = this.plotBottom - ((dbLeft - this.adjustableMinDB) / dbRange) * this.plotHeight;
      const yRight = this.plotBottom - ((dbRight - this.adjustableMinDB) / dbRange) * this.plotHeight;
            
      // === DETERMINE IF CHANNELS OVERLAP ===
      const amplitudeDiff = Math.abs(dbLeft - dbRight);
      const isOverlapping = amplitudeDiff <= this.overlapToleranceDB;
            
      allPoints.push({
        x,
        yLeft,
        yRight,
        isOverlapping
      });
    }
        
    // === DRAW LINES WITH DYNAMIC COLORS ===
    this.drawDynamicColoredLines(allPoints);
  }
    
  /**
     * Draws simple separate spectrum lines with pixel-based FFT averaging
     * Averages multiple FFT bins that fall within the same pixel column for cleaner high-frequency display
     * 
     * @param {Float32Array} dataLeft - FFT frequency data for left channel (in dB)
     * @param {Float32Array} dataRight - FFT frequency data for right channel (in dB)
     */
  drawSpectrumPixelAveragedSimple(dataLeft, dataRight) {
    const sampleRate = this.audioContext.sampleRate;
        
    // === PREPARE PIXEL-BASED DATA ===
    const pixelData = this.generatePixelAveragedData(dataLeft, dataRight, sampleRate);
        
    // === CHECK IF INPUT IS MONO ===
    if (!this.isStereoInput) {
      // === DRAW MONO CHANNEL (ORANGE/YELLOW) ===
      this.ctx.strokeStyle = '#ffaa00';  // Use orange color for mono (matches legend)
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      let isFirstPoint = true;
          
      for (let i = 0; i < pixelData.length; i++) {
        const point = pixelData[i];
              
        if (isFirstPoint) {
          this.ctx.moveTo(point.x, point.yLeft);  // Use left channel data (same as right for mono)
          isFirstPoint = false;
        } else {
          this.ctx.lineTo(point.x, point.yLeft);
        }
      }
      this.ctx.stroke();
      return;  // Exit early for mono
    }
        
    // === DRAW LEFT CHANNEL (GREEN) ===
    this.ctx.strokeStyle = '#00ff00';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    let isFirstPointLeft = true;
        
    for (let i = 0; i < pixelData.length; i++) {
      const point = pixelData[i];
            
      if (isFirstPointLeft) {
        this.ctx.moveTo(point.x, point.yLeft);
        isFirstPointLeft = false;
      } else {
        this.ctx.lineTo(point.x, point.yLeft);
      }
    }
    this.ctx.stroke();
        
    // === DRAW RIGHT CHANNEL (BLUE) ===
    this.ctx.strokeStyle = '#0080ff';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    let isFirstPointRight = true;
        
    for (let i = 0; i < pixelData.length; i++) {
      const point = pixelData[i];
            
      if (isFirstPointRight) {
        this.ctx.moveTo(point.x, point.yRight);
        isFirstPointRight = false;
      } else {
        this.ctx.lineTo(point.x, point.yRight);
      }
    }
    this.ctx.stroke();
  }
    
  /**
     * Draws spectrum curves with pixel-based averaging and overlap detection
     * 
     * @param {Float32Array} dataLeft - FFT frequency data for left channel (in dB)
     * @param {Float32Array} dataRight - FFT frequency data for right channel (in dB)
     */
  drawSpectrumPixelAveragedWithOverlapping(dataLeft, dataRight) {
    // === FOR MONO INPUT, FALLBACK TO SIMPLE DRAWING ===
    // No point in overlap detection when left and right are identical
    if (!this.isStereoInput) {
      this.drawSpectrumPixelAveragedSimple(dataLeft, dataRight);
      return;
    }
        
    const sampleRate = this.audioContext.sampleRate;
        
    // === PREPARE PIXEL-BASED DATA WITH OVERLAP INFORMATION ===
    const pixelData = this.generatePixelAveragedData(dataLeft, dataRight, sampleRate);
        
    // === DRAW LINES WITH DYNAMIC COLORS ===
    this.drawDynamicColoredLines(pixelData);
  }
    
  /**
     * Generates pixel-averaged FFT data by averaging FFT bins that fall within each pixel column
     * This reduces visual noise at high frequencies where many bins map to few pixels
     * Includes advanced smoothing techniques for even cleaner display
     * 
     * OPTIMIZED VERSION: Pre-calculates bin-to-pixel mapping for much better performance
     * 
     * @param {Float32Array} dataLeft - FFT frequency data for left channel (in dB)
     * @param {Float32Array} dataRight - FFT frequency data for right channel (in dB)
     * @param {number} sampleRate - Audio sample rate
     * @returns {Array} Array of pixel data points with averaged values
     */
  generatePixelAveragedData(dataLeft, dataRight, sampleRate) {
    // === CACHE FREQUENTLY USED VALUES ===
    const plotWidth = this.plotWidth;
    const plotLeft = this.plotLeft;
    const plotRight = this.plotRight;
    const minFreq = this.minFreq;
    const maxFreq = this.maxFreq;
    const logRange = Math.log10(maxFreq / minFreq);
    const binToFreqMultiplier = sampleRate / (2 * dataLeft.length);
        
    // === INITIALIZE PIXEL DATA ACCUMULATORS ===
    // Use arrays for faster access than object properties
    const pixelCount = plotRight - plotLeft + 1;
    const pixelBinsLeft = new Array(pixelCount);
    const pixelBinsRight = new Array(pixelCount);
    const pixelBinCounts = new Array(pixelCount);
        
    // Initialize arrays
    for (let i = 0; i < pixelCount; i++) {
      pixelBinsLeft[i] = [];
      pixelBinsRight[i] = [];
      pixelBinCounts[i] = 0;
    }
        
    // === SINGLE PASS: MAP BINS TO PIXELS ===
    // Go through FFT data once and assign each bin to its pixel
    for (let binIndex = 0; binIndex < dataLeft.length; binIndex++) {
      const binFreq = binIndex * binToFreqMultiplier;
            
      // Skip bins outside frequency range
      if (binFreq < minFreq || binFreq > maxFreq) continue;
            
      // === CALCULATE PIXEL POSITION FOR THIS BIN ===
      // Optimize: Use cached logRange and avoid repeated Math.log10 calls
      const normalizedX = Math.log10(binFreq / minFreq) / logRange;
      const pixelX = Math.round(plotLeft + normalizedX * plotWidth);
            
      // Ensure pixel is within bounds
      if (pixelX >= plotLeft && pixelX <= plotRight) {
        const pixelIndex = pixelX - plotLeft;
        pixelBinsLeft[pixelIndex].push(dataLeft[binIndex]);
        pixelBinsRight[pixelIndex].push(dataRight[binIndex]);
        pixelBinCounts[pixelIndex]++;
      }
    }
        
    // === PROCESS PIXEL DATA ===
    const pixelData = [];
    const dbRange = this.maxDB - this.adjustableMinDB;
    const calibrationDB = this.amplitudeCalibrationDB;
    const amplitudeScale = this.amplitudeScale;
    const plotBottom = this.plotBottom;
    const plotHeight = this.plotHeight;
    const adjustableMinDB = this.adjustableMinDB;
    const maxDB = this.maxDB;
        
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
      const binCount = pixelBinCounts[pixelIndex];
            
      // Skip pixels with no bins
      if (binCount === 0) continue;
            
      const pixelX = plotLeft + pixelIndex;
      const binsLeft = pixelBinsLeft[pixelIndex];
      const binsRight = pixelBinsRight[pixelIndex];
            
      // === CALCULATE FREQUENCY FOR ADVANCED PROCESSING ===
      // Only calculate when needed for frequency-dependent smoothing
      let frequency = 0;
      if (this.frequencyDependentSmoothingEnabled) {
        const normalizedX = pixelIndex / plotWidth;
        frequency = minFreq * Math.pow(10, normalizedX * logRange);
      }
            
      // === PROCESS FFT BINS FOR THIS PIXEL ===
      let avgLeft, avgRight;
            
      if (this.peakEnvelopeEnabled) {
        // === PEAK ENVELOPE MODE ===
        avgLeft = this.findPeakDBValueOptimized(binsLeft);
        avgRight = this.findPeakDBValueOptimized(binsRight);
      } else {
        // === AVERAGING MODE ===
        if (this.frequencyDependentSmoothingEnabled) {
          avgLeft = this.averageDBValuesWithFrequencyWeightingOptimized(binsLeft, frequency);
          avgRight = this.averageDBValuesWithFrequencyWeightingOptimized(binsRight, frequency);
        } else {
          avgLeft = this.averageDBValuesOptimized(binsLeft);
          avgRight = this.averageDBValuesOptimized(binsRight);
        }
      }
            
      // === APPLY NOISE FLOOR SUBTRACTION ===
      if (this.noiseFloorSubtractionDB > 0) {
        avgLeft = this.subtractNoiseFloor(avgLeft, this.noiseFloorSubtractionDB);
        avgRight = this.subtractNoiseFloor(avgRight, this.noiseFloorSubtractionDB);
      }
            
      // === CONVERT AVERAGED dB VALUES TO Y-COORDINATES ===
      // Using fixed dB-per-pixel scaling (similar to PAM FFT plugin) for accurate amplitude display
      // This ensures that dB values align correctly with the vertical ruler
      const dbLeft = Math.max(adjustableMinDB, Math.min(maxDB, avgLeft + calibrationDB));
      const dbRight = Math.max(adjustableMinDB, Math.min(maxDB, avgRight + calibrationDB));
      const yLeft = plotBottom - ((dbLeft - adjustableMinDB) / dbRange) * plotHeight;
      const yRight = plotBottom - ((dbRight - adjustableMinDB) / dbRange) * plotHeight;
            
      // === DETERMINE IF CHANNELS OVERLAP ===
      const amplitudeDiff = Math.abs(dbLeft - dbRight);
      const isOverlapping = amplitudeDiff <= this.overlapToleranceDB;
            
      // === ADD PIXEL DATA POINT ===
      pixelData.push({
        x: pixelX,
        yLeft: yLeft,
        yRight: yRight,
        isOverlapping: isOverlapping
      });
    }
        
    // === APPLY MULTI-PIXEL SMOOTHING ===
    if (this.multiPixelSmoothing > 1) {
      return this.applyMultiPixelSmoothing(pixelData, this.multiPixelSmoothing);
    }
        
    return pixelData;
  }
    
  /**
     * Averages dB values correctly by converting to linear, averaging, then converting back to dB
     * This provides proper energy-based averaging rather than simple arithmetic mean of dB values
     * 
     * @param {Float32Array} dbData - Array of dB values
     * @param {Array} indices - Array of indices to average
     * @returns {number} Averaged dB value
     */
  averageDBValues(dbData, indices) {
    if (indices.length === 0) return -Infinity;
    if (indices.length === 1) return dbData[indices[0]];
        
    // === CONVERT dB TO LINEAR AMPLITUDE ===
    let sumLinear = 0;
    let validCount = 0;
        
    for (let i = 0; i < indices.length; i++) {
      const dbValue = dbData[indices[i]];
            
      // Skip -Infinity values (silence)
      if (dbValue > -Infinity && !isNaN(dbValue)) {
        // Convert dB to linear: amplitude = 10^(dB/20)
        const linearValue = Math.pow(10, dbValue / 20);
        sumLinear += linearValue;
        validCount++;
      }
    }
        
    // === CONVERT BACK TO dB ===
    if (validCount === 0) return -Infinity;
        
    const avgLinear = sumLinear / validCount;
        
    // Convert linear back to dB: dB = 20 * log10(amplitude)
    if (avgLinear > 0) {
      return 20 * Math.log10(avgLinear);
    } else {
      return -Infinity;
    }
  }
    
  /**
     * OPTIMIZED: Averages dB values from a direct array of dB values (no index lookup)
     * Used by the optimized pixel averaging system for better performance
     * 
     * @param {Array} dbValues - Array of dB values to average
     * @returns {number} Averaged dB value
     */
  averageDBValuesOptimized(dbValues) {
    const length = dbValues.length;
    if (length === 0) return -Infinity;
    if (length === 1) return dbValues[0];
        
    // === CONVERT dB TO LINEAR AMPLITUDE ===
    let sumLinear = 0;
    let validCount = 0;
        
    for (let i = 0; i < length; i++) {
      const dbValue = dbValues[i];
            
      // Skip -Infinity values (silence)
      if (dbValue > -Infinity && !isNaN(dbValue)) {
        // Convert dB to linear: amplitude = 10^(dB/20)
        sumLinear += Math.pow(10, dbValue * 0.05); // 0.05 = 1/20, slightly faster
        validCount++;
      }
    }
        
    // === CONVERT BACK TO dB ===
    if (validCount === 0) return -Infinity;
        
    const avgLinear = sumLinear / validCount;
        
    // Convert linear back to dB: dB = 20 * log10(amplitude)
    return avgLinear > 0 ? 20 * Math.log10(avgLinear) : -Infinity;
  }
    
  /**
     * Averages dB values with frequency-dependent weighting for smoother high-frequency response
     * Applies more aggressive smoothing at higher frequencies where noise is typically more problematic
     * 
     * @param {Float32Array} dbData - Array of dB values
     * @param {Array} indices - Array of indices to average
     * @param {number} frequency - Center frequency for this pixel (Hz)
     * @returns {number} Frequency-weighted averaged dB value
     */
  averageDBValuesWithFrequencyWeighting(dbData, indices, frequency) {
    if (indices.length === 0) return -Infinity;
    if (indices.length === 1) return dbData[indices[0]];
        
    // === CALCULATE FREQUENCY-DEPENDENT SMOOTHING FACTOR ===
    // More smoothing at higher frequencies (above 2kHz)
    const smoothingFactor = Math.min(1.0, Math.max(0.1, frequency / 10000)); // 0.1 to 1.0 based on frequency
    const windowSize = Math.max(1, Math.floor(indices.length * smoothingFactor));
        
    // === SORT INDICES BY AMPLITUDE (DESCENDING) ===
    // This helps preserve peaks while smoothing noise
    const sortedIndices = indices.slice().sort((a, b) => dbData[b] - dbData[a]);
        
    // === TAKE TOP N VALUES FOR AVERAGING ===
    const indicesToAverage = sortedIndices.slice(0, Math.max(1, windowSize));
        
    // === PERFORM REGULAR AVERAGING ON SELECTED INDICES ===
    return this.averageDBValues(dbData, indicesToAverage);
  }
    
  /**
     * OPTIMIZED: Frequency-weighted averaging from direct array of dB values
     * Used by the optimized pixel averaging system for better performance
     * 
     * @param {Array} dbValues - Array of dB values to average
     * @param {number} frequency - Center frequency for this pixel (Hz)
     * @returns {number} Frequency-weighted averaged dB value
     */
  averageDBValuesWithFrequencyWeightingOptimized(dbValues, frequency) {
    const length = dbValues.length;
    if (length === 0) return -Infinity;
    if (length === 1) return dbValues[0];
        
    // === CALCULATE FREQUENCY-DEPENDENT SMOOTHING FACTOR ===
    // More smoothing at higher frequencies (above 2kHz)
    const smoothingFactor = Math.min(1.0, Math.max(0.1, frequency / 10000)); // 0.1 to 1.0 based on frequency
    const windowSize = Math.max(1, Math.floor(length * smoothingFactor));
        
    // === SORT VALUES BY AMPLITUDE (DESCENDING) ===
    // This helps preserve peaks while smoothing noise
    const sortedValues = dbValues.slice().sort((a, b) => b - a);
        
    // === TAKE TOP N VALUES FOR AVERAGING ===
    const valuesToAverage = sortedValues.slice(0, windowSize);
        
    // === PERFORM OPTIMIZED AVERAGING ===
    return this.averageDBValuesOptimized(valuesToAverage);
  }
    
  /**
     * Finds the peak (maximum) dB value in a set of FFT bins
     * Used for peak envelope mode to track spectral peaks instead of averaging
     * 
     * @param {Float32Array} dbData - Array of dB values
     * @param {Array} indices - Array of indices to search
     * @returns {number} Peak dB value
     */
  findPeakDBValue(dbData, indices) {
    if (indices.length === 0) return -Infinity;
        
    let peakValue = -Infinity;
        
    for (let i = 0; i < indices.length; i++) {
      const dbValue = dbData[indices[i]];
      if (dbValue > peakValue && dbValue > -Infinity && !isNaN(dbValue)) {
        peakValue = dbValue;
      }
    }
        
    return peakValue;
  }
    
  /**
     * OPTIMIZED: Finds the peak (maximum) dB value from direct array of dB values
     * Used by the optimized pixel averaging system for better performance
     * 
     * @param {Array} dbValues - Array of dB values to search
     * @returns {number} Peak dB value
     */
  findPeakDBValueOptimized(dbValues) {
    const length = dbValues.length;
    if (length === 0) return -Infinity;
        
    let peakValue = -Infinity;
        
    for (let i = 0; i < length; i++) {
      const dbValue = dbValues[i];
      if (dbValue > peakValue && dbValue > -Infinity && !isNaN(dbValue)) {
        peakValue = dbValue;
      }
    }
        
    return peakValue;
  }
    
  /**
     * Subtracts an estimated noise floor from dB values to enhance signal visibility
     * This helps make actual signals more prominent by reducing the visual impact of noise
     * 
     * @param {number} dbValue - Original dB value
     * @param {number} noiseFloorDB - Noise floor level to subtract
     * @returns {number} dB value with noise floor subtracted
     */
  subtractNoiseFloor(dbValue, noiseFloorDB) {
    if (dbValue === -Infinity || isNaN(dbValue)) return dbValue;
        
    // Convert to linear, subtract noise floor (also in linear), convert back to dB
    const linearValue = Math.pow(10, dbValue / 20);
    const linearNoiseFloor = Math.pow(10, (dbValue - noiseFloorDB) / 20);
        
    // Only subtract if signal is significantly above noise floor
    if (linearValue > linearNoiseFloor * 2) { // At least 6dB above noise floor
      const cleanLinearValue = Math.max(0, linearValue - linearNoiseFloor);
      return cleanLinearValue > 0 ? 20 * Math.log10(cleanLinearValue) : -Infinity;
    }
        
    // If too close to noise floor, reduce it significantly
    return dbValue - noiseFloorDB;
  }
    
  /**
     * Applies multi-pixel smoothing across adjacent pixels for ultra-smooth curves
     * Uses a moving average filter across the pixel data to reduce high-frequency artifacts
     * 
     * OPTIMIZED VERSION: Reduces array allocations and function calls for better performance
     * 
     * @param {Array} pixelData - Array of pixel data points
     * @param {number} smoothingFactor - Number of adjacent pixels to smooth across
     * @returns {Array} Smoothed pixel data array
     */
  applyMultiPixelSmoothing(pixelData, smoothingFactor) {
    if (smoothingFactor <= 1 || pixelData.length < 3) return pixelData;
        
    const smoothedData = new Array(pixelData.length); // Pre-allocate array
    const halfWindow = Math.floor(smoothingFactor / 2);
    const dataLength = pixelData.length;
        
    for (let i = 0; i < dataLength; i++) {
      // === DETERMINE SMOOTHING WINDOW ===
      const startIndex = Math.max(0, i - halfWindow);
      const endIndex = Math.min(dataLength - 1, i + halfWindow);
      const windowSize = endIndex - startIndex + 1;
            
      // === CALCULATE SMOOTHED Y VALUES ===
      let sumYLeft = 0, sumYRight = 0;
      let overlapCount = 0;
            
      // Direct loop without creating intermediate array
      for (let j = startIndex; j <= endIndex; j++) {
        const point = pixelData[j];
        sumYLeft += point.yLeft;
        sumYRight += point.yRight;
        if (point.isOverlapping) overlapCount++;
      }
            
      const avgYLeft = sumYLeft / windowSize;
      const avgYRight = sumYRight / windowSize;
      const isOverlapping = (overlapCount / windowSize) > 0.5; // Majority vote
            
      // === ADD SMOOTHED PIXEL DATA POINT ===
      smoothedData[i] = {
        x: pixelData[i].x,
        yLeft: avgYLeft,
        yRight: avgYRight,
        isOverlapping: isOverlapping
      };
    }
        
    return smoothedData;
  }

  /**
     * Draws continuous lines that change color based on overlap detection
     * 
     * @param {Array} allPoints - Array of all frequency points with overlap information
     */
  drawDynamicColoredLines(allPoints) {
    if (allPoints.length === 0) return;
        
    this.ctx.lineWidth = 2;
        
    // === DRAW LINES POINT BY POINT WITH DYNAMIC COLORS ===
    for (let i = 0; i < allPoints.length; i++) {
      const point = allPoints[i];
      const nextPoint = allPoints[i + 1];
            
      // Skip if this is the last point (no line to draw)
      if (!nextPoint) continue;
            
      if (point.isOverlapping && nextPoint.isOverlapping) {
        // === BOTH POINTS OVERLAP - DRAW WHITE LINE ===
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.beginPath();
        const yAvg1 = (point.yLeft + point.yRight) / 2;
        const yAvg2 = (nextPoint.yLeft + nextPoint.yRight) / 2;
        this.ctx.moveTo(point.x, yAvg1);
        this.ctx.lineTo(nextPoint.x, yAvg2);
        this.ctx.stroke();
      } else if (!point.isOverlapping && !nextPoint.isOverlapping) {
        // === BOTH POINTS SEPARATE - DRAW GREEN AND BLUE LINES ===
        // Draw left channel (green)
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.beginPath();
        this.ctx.moveTo(point.x, point.yLeft);
        this.ctx.lineTo(nextPoint.x, nextPoint.yLeft);
        this.ctx.stroke();
                
        // Draw right channel (blue)
        this.ctx.strokeStyle = '#0080ff';
        this.ctx.beginPath();
        this.ctx.moveTo(point.x, point.yRight);
        this.ctx.lineTo(nextPoint.x, nextPoint.yRight);
        this.ctx.stroke();
      } else {
        // === TRANSITION BETWEEN OVERLAP AND SEPARATE ===
        // Handle the transition smoothly by drawing appropriate segments
        if (point.isOverlapping) {
          // Current point overlaps, next doesn't - transition from white to separate
          const yAvg = (point.yLeft + point.yRight) / 2;
                    
          // Draw white line from overlap point to transition point
          this.ctx.strokeStyle = '#ffffff';
          this.ctx.beginPath();
          this.ctx.moveTo(point.x, yAvg);
          this.ctx.lineTo(nextPoint.x, (nextPoint.yLeft + nextPoint.yRight) / 2);
          this.ctx.stroke();
                    
          // Draw separate lines from transition point to next point
          this.ctx.strokeStyle = '#00ff00';
          this.ctx.beginPath();
          this.ctx.moveTo(nextPoint.x, (nextPoint.yLeft + nextPoint.yRight) / 2);
          this.ctx.lineTo(nextPoint.x, nextPoint.yLeft);
          this.ctx.stroke();
                    
          this.ctx.strokeStyle = '#0080ff';
          this.ctx.beginPath();
          this.ctx.moveTo(nextPoint.x, (nextPoint.yLeft + nextPoint.yRight) / 2);
          this.ctx.lineTo(nextPoint.x, nextPoint.yRight);
          this.ctx.stroke();
        } else {
          // Current point separate, next overlaps - transition from separate to white
          const nextYAvg = (nextPoint.yLeft + nextPoint.yRight) / 2;
                    
          // Draw left channel line to transition point
          this.ctx.strokeStyle = '#00ff00';
          this.ctx.beginPath();
          this.ctx.moveTo(point.x, point.yLeft);
          this.ctx.lineTo(nextPoint.x, nextYAvg);
          this.ctx.stroke();
                    
          // Draw right channel line to transition point
          this.ctx.strokeStyle = '#0080ff';
          this.ctx.beginPath();
          this.ctx.moveTo(point.x, point.yRight);
          this.ctx.lineTo(nextPoint.x, nextYAvg);
          this.ctx.stroke();
        }
      }
    }
  }
    
  /**
     * Draws the background grid lines for the spectrum display
     * Creates a professional oscilloscope-like appearance with frequency and amplitude references
     */
  drawGrid() {
    // === GRID APPEARANCE SETTINGS ===
    this.ctx.strokeStyle = '#333';                            // Dark gray grid lines (subtle)
    this.ctx.lineWidth = 1;                                   // Thin lines for minimal visual impact
        
    // === VERTICAL GRID LINES (FREQUENCY REFERENCE) ===
    // Draw lines at musically/acoustically significant frequencies
    const freqSteps = [30, 50, 100, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000, 8000, 10000, 15000]; // Key frequencies in Hz
    freqSteps.forEach(freq => {
      // Only draw lines for frequencies within our display range
      if (freq >= this.minFreq && freq <= this.maxFreq) {
        // Convert frequency to x-coordinate using logarithmic scaling
        const x = this.plotLeft + (Math.log10(freq / this.minFreq) / Math.log10(this.maxFreq / this.minFreq)) * this.plotWidth;
                
        // Draw vertical line from top to bottom of plot area
        this.ctx.beginPath();
        this.ctx.moveTo(x, this.plotTop);
        this.ctx.lineTo(x, this.plotBottom);
        this.ctx.stroke();
      }
    });
        
    // === HORIZONTAL GRID LINES (dB REFERENCE) ===
    // Draw lines at 10 dB intervals for amplitude reference (matches ruler spacing)
    for (let dB = this.adjustableMinDB; dB <= this.maxDB; dB += 10) {
      // Convert dB value to y-coordinate using adjustable range
      const y = this.plotBottom - ((dB - this.adjustableMinDB) / (this.maxDB - this.adjustableMinDB)) * this.plotHeight;
            
      // Draw horizontal line across entire plot width
      this.ctx.beginPath();
      this.ctx.moveTo(this.plotLeft, y);
      this.ctx.lineTo(this.plotRight, y);
      this.ctx.stroke();
    }
  }
    
  /**
     * Draws all the static elements that don't change during audio analysis
     * This includes grid lines, rulers, labels, and other reference information
     */
  drawStaticElements() {
    this.drawRulers();                                        // Frequency and amplitude scales
    this.drawLabels();                                        // Axis labels and titles
  }
    
  /**
     * Draws the frequency and amplitude ruler scales around the spectrum plot
     * Provides numerical references for reading frequency and dB values from the display
     */
  drawRulers() {
    // === TEXT APPEARANCE SETTINGS ===
    this.ctx.fillStyle = '#fff';                              // White text for visibility
    this.ctx.font = '12px Arial';                             // Readable font size
    this.ctx.textAlign = 'center';                            // Center text on frequency markers
    this.ctx.textBaseline = 'top';                            // Align text top edge
        
    // === FREQUENCY RULER (BOTTOM OF SPECTRUM) ===
    // Display frequency values along the bottom edge
    const freqLabels = [20, 30, 50, 100, 200, 300, 500, 800, '1k', '1.5k', '2k', '3k', '5k', '8k', '10k', '15k', '20k']; // User-friendly labels
    const freqValues = [20, 30, 50, 100, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000, 8000, 10000, 15000, 20000];  // Actual Hz values
        
    freqLabels.forEach((label, i) => {
      const freq = freqValues[i];
      // Only show labels for frequencies within our current display range
      if (freq >= this.minFreq && freq <= this.maxFreq) {
        // Convert frequency to x-coordinate using same logarithmic scaling as spectrum
        const x = this.plotLeft + (Math.log10(freq / this.minFreq) / Math.log10(this.maxFreq / this.minFreq)) * this.plotWidth;
        // Draw label below the spectrum plot
        this.ctx.fillText(label.toString(), x, this.plotBottom + 10);
      }
    });
        
    // === dB RULER (LEFT SIDE OF SPECTRUM) ===
    // Display amplitude values along the left edge
    this.ctx.textAlign = 'right';                             // Right-align text to plot edge
    this.ctx.textBaseline = 'middle';                         // Center text vertically on dB lines
        
    // Draw dB values at 10 dB intervals for better granularity
    // Use 10 dB intervals for the adjustable range to 0 dB
    for (let dB = this.adjustableMinDB; dB <= this.maxDB; dB += 10) {
      // Convert dB value to y-coordinate using adjustable range
      const y = this.plotBottom - ((dB - this.adjustableMinDB) / (this.maxDB - this.adjustableMinDB)) * this.plotHeight;
      // Draw label to the left of the spectrum plot
      this.ctx.fillText(dB.toString(), this.plotLeft - 2, y);
    }
  }
    
  /**
     * Draws axis labels to identify what the spectrum display shows
     * Adds professional labeling for frequency (horizontal) and amplitude (vertical) axes
     */
  drawLabels() {
    // === LABEL APPEARANCE SETTINGS ===
    this.ctx.fillStyle = '#fff';                              // White text for visibility
    this.ctx.font = '14px Arial';                             // Slightly larger font for labels
    this.ctx.textAlign = 'center';                            // Center labels on their axes
    this.ctx.textBaseline = 'top';
        
    // === FREQUENCY AXIS LABEL (BOTTOM CENTER) ===
    // Label the horizontal axis to indicate it shows frequency
    // this.ctx.fillText('Frequency (Hz)', this.plotLeft + this.plotWidth / 2, this.plotBottom + 35);
        
    // === AMPLITUDE AXIS LABEL (LEFT SIDE, ROTATED) ===
    // Label the vertical axis to indicate it shows amplitude in decibels
    // this.ctx.save();                                          // Save current drawing state
    // this.ctx.translate(20, this.plotTop + this.plotHeight / 2); // Move to middle of left edge
    // this.ctx.rotate(-Math.PI / 2);                            // Rotate 90 degrees counterclockwise
    // this.ctx.fillText('Amplitude (dB)', 0, 0);                // Draw rotated text
    // this.ctx.restore();                                       // Restore original drawing state
  }
    
  /**
     * Draws the click point information display
     * Shows a dot at the click position with frequency and amplitude information
     */
  drawClickPointInfo() {
    // === DETERMINE SIZE SETTINGS ===
    const isLarge = this.clickInfoSize === 'large';
    const dotRadius = isLarge ? 4 : 2;                        // Large: 8px dot (radius 4), Small: 4px dot (radius 2)
    const fontSize = isLarge ? 16 : 12;                       // Large: 16px font, Small: 12px font
        
    // === DRAW THE CLICK POINT DOT ===
    this.ctx.fillStyle = '#ffff00';                           // Yellow dot for visibility
    this.ctx.beginPath();
    this.ctx.arc(this.clickPoint.x, this.clickPoint.y, dotRadius, 0, 2 * Math.PI);
    this.ctx.fill();
        
    // === PREPARE TEXT INFORMATION ===
    // Format frequency display
    let freqText;
    if (this.clickPoint.frequency >= 1000) {
      freqText = `${(this.clickPoint.frequency / 1000).toFixed(1)}kHz`;
    } else {
      freqText = `${this.clickPoint.frequency}Hz`;
    }
        
    // Format amplitude display
    const ampText = `${this.clickPoint.amplitude}dB`;
        
    // Combine into display text
    const displayText = `${freqText}, ${ampText}`;
        
    // === CONFIGURE TEXT APPEARANCE ===
    this.ctx.fillStyle = '#ffffff';                           // White text for visibility
    this.ctx.font = `${fontSize}px Arial`;                    // Dynamic font size based on setting
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'bottom';
        
    // === CALCULATE TEXT DIMENSIONS ===
    const textMetrics = this.ctx.measureText(displayText);
    const textWidth = textMetrics.width;
    const textHeight = fontSize; // Text height matches font size
        
    // === CALCULATE DISPLAY POSITION ===
    // Start with position slightly offset from the click point
    let displayX = this.clickPoint.x + 8;
    let displayY = this.clickPoint.y - 8;
        
    // === ADJUST POSITION TO KEEP TEXT ON SCREEN ===
    // Check if text would go off the right edge
    const closeButtonSpace = (isLarge ? 16 : 12) + 10;       // Close button size + padding
    if (displayX + textWidth + closeButtonSpace > this.plotRight) {
      displayX = this.clickPoint.x - textWidth - closeButtonSpace; // Show on left side instead
    }
        
    // Check if text would go off the top edge
    if (displayY - textHeight < this.plotTop) {
      displayY = this.clickPoint.y + textHeight + 8; // Show below instead
    }
        
    // === DRAW TEXT BACKGROUND ===
    // Draw a semi-transparent background for better text readability
    const backgroundWidth = textWidth + closeButtonSpace + 3;  // Include space for close button
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(displayX - 3, displayY - textHeight - 3, backgroundWidth, textHeight + 6);
        
    // === DRAW THE TEXT ===
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillText(displayText, displayX, displayY);
        
    // === DRAW CLOSE BUTTON ===
    const closeX = displayX + textWidth + 5;
    const closeY = displayY - textHeight - 3;
    const closeSize = isLarge ? 16 : 12;                      // Larger close button for large text
        
    // Draw close button background
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    this.ctx.fillRect(closeX, closeY, closeSize, closeSize);
        
    // Draw close button border
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(closeX, closeY, closeSize, closeSize);
        
    // Draw the X symbol
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = isLarge ? 3 : 2;                     // Thicker X for larger button
    const xPadding = isLarge ? 3 : 2;                         // Proportional padding
    this.ctx.beginPath();
    this.ctx.moveTo(closeX + xPadding, closeY + xPadding);
    this.ctx.lineTo(closeX + closeSize - xPadding, closeY + closeSize - xPadding);
    this.ctx.moveTo(closeX + closeSize - xPadding, closeY + xPadding);
    this.ctx.lineTo(closeX + xPadding, closeY + closeSize - xPadding);
    this.ctx.stroke();
        
    // === STORE DISPLAY INFORMATION FOR CLICK DETECTION ===
    this.clickPoint.displayX = displayX;
    this.clickPoint.displayY = displayY;
    this.clickPoint.textWidth = textWidth;
    this.clickPoint.closeX = closeX;
    this.clickPoint.closeY = closeY;
    this.clickPoint.closeSize = closeSize;
  }
    
  /**
     * Updates the status message displayed to the user
     * Used to show microphone access requests, errors, and other information
     * 
     * @param {string} message - The status message to display
     */
  updateStatus(message) {
    document.getElementById('status').textContent = message;
  }
    
  /**
     * Sets up freeze button event handlers for all freeze buttons
     * Supports press-and-hold to capture, release to freeze, and press again to clear
     */
  setupFreezeButtonHandlers() {
    // Find all freeze buttons (freezeBtn1, freezeBtn2, etc.)
    const freezeButtons = document.querySelectorAll('[id^="freezeBtn"]');
        
    freezeButtons.forEach(button => {
      const freezeId = button.id; // e.g., "freezeBtn1"
            
      // Initialize freeze button data if not exists
      if (!this.freezeButtons.has(freezeId)) {
        this.freezeButtons.set(freezeId, {
          capturing: false,
          active: false,
          dataLeft: null,
          dataRight: null
        });
      }
            
      // Remove existing event listeners by cloning the button
      const newButton = button.cloneNode(true);
      button.parentNode.replaceChild(newButton, button);
            
      // Add event listeners for press-and-hold functionality
      newButton.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.handleFreezeButtonPress(freezeId);
      });
            
      newButton.addEventListener('mouseup', () => {
        this.handleFreezeButtonRelease(freezeId);
      });
            
      newButton.addEventListener('mouseleave', () => {
        // Handle case where mouse leaves button while pressed
        this.handleFreezeButtonRelease(freezeId);
      });
    });
        
    // Handle case where mouse is released outside any button
    document.addEventListener('mouseup', () => {
      this.freezeButtons.forEach((data, freezeId) => {
        if (data.capturing) {
          this.handleFreezeButtonRelease(freezeId);
        }
      });
    });
  }
    
  /**
     * Handles freeze button press event
     * Either starts capturing or clears the freeze line
     * @param {string} freezeId - The ID of the freeze button (e.g., "freezeBtn1")
     */
  handleFreezeButtonPress(freezeId) {
    const freezeData = this.freezeButtons.get(freezeId);
    if (!freezeData) return;
        
    if (freezeData.active) {
      // Button is currently displaying a freeze line - clear it
      this.clearFreezeLine(freezeId);
    } else {
      // Button is inactive - start capturing
      this.startFreezeCapture(freezeId);
    }
  }
    
  /**
     * Handles freeze button release event
     * Stops capturing and keeps the freeze line visible
     * @param {string} freezeId - The ID of the freeze button (e.g., "freezeBtn1")
     */
  handleFreezeButtonRelease(freezeId) {
    const freezeData = this.freezeButtons.get(freezeId);
    if (!freezeData) return;
        
    if (freezeData.capturing) {
      // Stop capturing and keep the line visible
      this.stopFreezeCapture(freezeId);
    }
  }
    
  /**
     * Starts capturing amplitude data for a freeze button
     * @param {string} freezeId - The ID of the freeze button (e.g., "freezeBtn1")
     */
  startFreezeCapture(freezeId) {
    const freezeData = this.freezeButtons.get(freezeId);
    if (!freezeData) return;
        
    freezeData.capturing = true;
    freezeData.active = true;
        
    // Initialize freeze data arrays with minimum values
    freezeData.dataLeft = new Float32Array(this.bufferLength);
    freezeData.dataRight = new Float32Array(this.bufferLength);
    freezeData.dataLeft.fill(-Infinity);
    freezeData.dataRight.fill(-Infinity);
        
    // Update button appearance to show capturing state
    const button = document.getElementById(freezeId);
    if (button) {
      button.classList.add('active');
    }
  }
    
  /**
     * Stops capturing amplitude data for a freeze button
     * Keeps the captured line visible as a freeze overlay
     * @param {string} freezeId - The ID of the freeze button (e.g., "freezeBtn1")
     */
  stopFreezeCapture(freezeId) {
    const freezeData = this.freezeButtons.get(freezeId);
    if (!freezeData) return;
        
    freezeData.capturing = false;
    // Keep active = true to display the frozen line
        
    // Button stays active (red) to indicate freeze line is visible
    const button = document.getElementById(freezeId);
    if (button) {
      button.classList.add('active');
    }
  }
    
  /**
     * Clears the freeze line for a freeze button
     * @param {string} freezeId - The ID of the freeze button (e.g., "freezeBtn1")
     */
  clearFreezeLine(freezeId) {
    const freezeData = this.freezeButtons.get(freezeId);
    if (!freezeData) return;
        
    freezeData.capturing = false;
    freezeData.active = false;
    freezeData.dataLeft = null;
    freezeData.dataRight = null;
        
    // Update button appearance to show inactive state
    const button = document.getElementById(freezeId);
    if (button) {
      button.classList.remove('active');
    }
  }
    
  /**
     * Updates freeze amplitude data with new maximum values if they exceed current captured values
     * Called during the drawing loop when any freeze button is capturing
     * @param {Float32Array} dataLeft - Current FFT frequency data for left channel (dB values)
     * @param {Float32Array} dataRight - Current FFT frequency data for right channel (dB values)
     */
  updateFreezeAmplitudes(dataLeft, dataRight) {
    this.freezeButtons.forEach((freezeData, freezeId) => {
      if (freezeData.capturing && freezeData.dataLeft && freezeData.dataRight) {
        // Update freeze values for each frequency bin
        for (let i = 0; i < dataLeft.length; i++) {
          // Update left channel freeze amplitude if current value is higher
          if (dataLeft[i] > freezeData.dataLeft[i]) {
            freezeData.dataLeft[i] = dataLeft[i];
          }
                    
          // Update right channel freeze amplitude if current value is higher
          if (dataRight[i] > freezeData.dataRight[i]) {
            freezeData.dataRight[i] = dataRight[i];
          }
        }
      }
    });
  }
    
  /**
     * Draws all active freeze lines as colored overlays
     * Each freeze button can have its own captured amplitude data displayed with its own color
     */
  drawFreezeLines() {
    this.freezeButtons.forEach((freezeData, freezeId) => {
      if (freezeData.active && freezeData.dataLeft && freezeData.dataRight) {
        // Draw freeze lines for this freeze button with its specific color
        this.drawSingleFreezeLine(freezeData.dataLeft, freezeData.dataRight, freezeId);
      }
    });
  }
    
  /**
     * Draws a single freeze line using the captured amplitude data
     * @param {Float32Array} dataLeft - Captured FFT frequency data for left channel (dB values)
     * @param {Float32Array} dataRight - Captured FFT frequency data for right channel (dB values)
     * @param {string} freezeId - The ID of the freeze button (e.g., "freezeBtn1") for color selection
     */
  drawSingleFreezeLine(dataLeft, dataRight, freezeId) {
    const sampleRate = this.audioContext.sampleRate;
        
    // Set freeze line appearance with button-specific color
    this.ctx.strokeStyle = this.freezeButtonColors[freezeId] || '#ff0000';  // Use button-specific color or default to red
    this.ctx.lineWidth = 2;
    this.ctx.globalAlpha = 0.8;  // Slightly transparent so it doesn't completely obscure the live spectrum
        
    // === USE SAME DRAWING MODE AS MAIN SPECTROGRAM ===
    // Apply the same pixel-based averaging and smoothing settings
    if (this.pixelAveragingEnabled) {
      this.drawFreezeLinePixelAveraged(dataLeft, dataRight, sampleRate);
    } else {
      this.drawFreezeLineTraditional(dataLeft, dataRight, sampleRate);
    }
        
    this.ctx.globalAlpha = 1.0;  // Reset alpha to full opacity
  }
    
  /**
     * Draws freeze line using pixel-based averaging (same as main spectrogram)
     * @param {Float32Array} dataLeft - Captured FFT frequency data for left channel (dB values)
     * @param {Float32Array} dataRight - Captured FFT frequency data for right channel (dB values)
     * @param {number} sampleRate - Audio sample rate
     */
  drawFreezeLinePixelAveraged(dataLeft, dataRight, sampleRate) {
    // === PREPARE PIXEL-BASED DATA ===
    const pixelData = this.generatePixelAveragedData(dataLeft, dataRight, sampleRate);
        
    // === DRAW FREEZE LINE ===
    this.ctx.beginPath();
    let isFirstPoint = true;
        
    for (let i = 0; i < pixelData.length; i++) {
      const point = pixelData[i];
            
      // Take the maximum amplitude between left and right channels for this pixel
      const maxY = Math.min(point.yLeft, point.yRight); // Lower Y value = higher amplitude
            
      if (isFirstPoint) {
        this.ctx.moveTo(point.x, maxY);
        isFirstPoint = false;
      } else {
        this.ctx.lineTo(point.x, maxY);
      }
    }
    this.ctx.stroke();
  }
    
  /**
     * Draws freeze line using traditional bin-based approach
     * @param {Float32Array} dataLeft - Captured FFT frequency data for left channel (dB values)
     * @param {Float32Array} dataRight - Captured FFT frequency data for right channel (dB values)
     * @param {number} sampleRate - Audio sample rate
     */
  drawFreezeLineTraditional(dataLeft, dataRight, sampleRate) {
    // === DRAW COMBINED FREEZE LINE ===
    // For simplicity, we'll draw a single line that represents the maximum of both channels
    this.ctx.beginPath();
    let isFirstPoint = true;
        
    for (let i = 0; i < dataLeft.length; i++) {
      const frequency = (i * sampleRate) / (2 * dataLeft.length);
      if (frequency < this.minFreq || frequency > this.maxFreq) continue;
            
      // Calculate X coordinate
      const x = this.plotLeft + (Math.log10(frequency / this.minFreq) / Math.log10(this.maxFreq / this.minFreq)) * this.plotWidth;
            
      // Take the maximum amplitude between left and right channels for this frequency
      const maxAmplitude = Math.max(dataLeft[i], dataRight[i]);
            
      // Skip if amplitude is -Infinity (no signal captured)
      if (maxAmplitude === -Infinity) continue;
            
      // Convert amplitude to Y coordinate with calibration
      const dbValue = Math.max(this.adjustableMinDB, Math.min(this.maxDB, maxAmplitude + this.amplitudeCalibrationDB));
      const normalizedDb = (dbValue - this.adjustableMinDB) / (this.maxDB - this.adjustableMinDB);
      const y = this.plotBottom - normalizedDb * this.plotHeight * this.amplitudeScale;
            
      if (isFirstPoint) {
        this.ctx.moveTo(x, y);
        isFirstPoint = false;
      } else {
        this.ctx.lineTo(x, y);
      }
    }
        
    this.ctx.stroke();
  }
    
  /**
     * Calculate the smoothing factor for exponential moving average based on averaging time
     * @param {number} timeSeconds - Desired averaging time in seconds (1-15)
     * @returns {number} Alpha smoothing factor (0.0-1.0)
     */
  calculateSmoothingFactor(timeSeconds) {
    // Assume 30 FPS for frame rate calculation
    const frameRate = 30;
    const timeConstantFrames = timeSeconds * frameRate;
        
    // For exponential moving average, alpha = 1 / time_constant
    // This gives a time constant where old data decays to ~37% after the specified time
    return 1.0 / timeConstantFrames;
  }
    
  /**
     * Update the averaging time and recalculate the smoothing factor
     * @param {number} timeSeconds - New averaging time in seconds (1-15)
     */
  setAverageTime(timeSeconds) {
    this.averageTimeSeconds = Math.max(1, Math.min(15, timeSeconds));
    this.averageSmoothingFactor = this.calculateSmoothingFactor(this.averageTimeSeconds);
        
    // If we're currently in average mode with hold active, restart the session
    // to apply the new smoothing factor immediately
    if (this.holdModeEnabled && this.holdButtonMode === 'average') {
      this.initializeHoldSession();
    }
  }
    
  /**
     * Set the meter FFT size for RMS integration window
     * @param {number} fftSize - FFT size for meter analyzers (must be power of 2)
     * 
     * This controls the integration time window for RMS measurements:
     * - 2048 samples: ~43ms at 48kHz (too short, makes meters too responsive)
     * - 4096 samples: ~85ms at 48kHz (still short)
     * - 8192 samples: ~171ms at 48kHz (better, default)
     * - 16384 samples: ~341ms at 48kHz (industry standard ~300ms)
     * 
     * Examples:
     *   analyzer.setMeterFFTSize(16384);  // Use industry standard 300ms integration
     *   analyzer.setMeterFFTSize(8192);   // Use default ~170ms integration
     * 
     * Note: This will restart audio if currently running to apply the change.
     */
  setMeterFFTSize(fftSize) {
    // Validate that fftSize is a power of 2 and within reasonable range
    const validSizes = [2048, 4096, 8192, 16384, 32768];
    if (!validSizes.includes(fftSize)) {
      console.error(`Invalid meter FFT size: ${fftSize}. Must be one of: ${validSizes.join(', ')}`);
      return;
    }
        
    // Store the new FFT size
    this.meterFFTSize = fftSize;
        
    // If audio is currently running, need to restart to apply the change
    if (this.isRunning && this.meterAnalyserLeft && this.meterAnalyserRight) {
      this.meterAnalyserLeft.fftSize = fftSize;
      this.meterAnalyserRight.fftSize = fftSize;
            
      // Calculate and display integration time at current sample rate
      if (this.audioContext) {
        const sampleRate = this.audioContext.sampleRate;
        const integrationTimeMs = (fftSize / sampleRate * 1000).toFixed(1);
        console.log(`Meter FFT size updated to ${fftSize} (${integrationTimeMs}ms integration time at ${sampleRate}Hz)`);
      }
    } else {
      console.log(`Meter FFT size set to ${fftSize}. Will be applied when audio starts.`);
    }
  }
}

/**
 * APPLICATION INITIALIZATION
 * This code runs when the HTML page finishes loading
 */

// Wait for the entire page (HTML, CSS, images) to finish loading
window.addEventListener('load', () => {
  // === CREATE THE SPECTRUM ANALYZER ===
  // Instantiate the main analyzer class, which sets up the UI and canvas
  const analyzer = new StereoSpectrumAnalyzer();
    
  // Make analyzer globally accessible for console commands
  window.analyzer = analyzer;
  console.log('SpectraBox: Analyzer created and made globally accessible:', window.analyzer);
    
  // === AUTO-START ANALYSIS ===
  // Automatically begin spectrum analysis when the page loads
  // This will prompt the user for microphone access and start visualization
  analyzer.start();
}); 