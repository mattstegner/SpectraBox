/**
 * LevelMeters - Handles peak and RMS level meter functionality
 * 
 * This class manages the calculation, smoothing, and visualization of audio level meters.
 * It provides both peak and RMS measurements with configurable attack/decay characteristics.
 */
class LevelMeters {
    constructor(analyzer) {
        // Reference to the main analyzer for accessing canvas context and dimensions
        this.analyzer = analyzer;
        
        // === LEVEL METER VISUAL SETTINGS ===
        this.peakMeterWidth = 30;           // Width of each level meter in pixels
        this.peakMeterSpacing = 50;         // Space between meter groups
        
        // === METER dB RANGE (separate from spectrogram range) ===
        this.meterMinDB = -60;              // Quietest level for meters (-60 dB)
        this.meterMaxDB = 0;                // Loudest level for meters (0 dB)
        
        // === AUDIO LEVEL TRACKING ===
        // Peak levels track the instantaneous maximum amplitude
        this.peakLevelLeft = -60;           // Current peak level for left channel
        this.peakLevelRight = -60;          // Current peak level for right channel
        this.lastPeakUpdateTime = 0;        // Timestamp for level meter timing
        
        // RMS (Root Mean Square) levels track the average energy content
        // RMS is better for perceived loudness than peak measurements
        this.rmsLevelLeft = -60;            // Current RMS level for left channel
        this.rmsLevelRight = -60;           // Current RMS level for right channel
        
        // === HOLD INDICATOR SETTINGS ===
        // Hold indicators show the highest point reached by the signal temporarily
        this.holdTime = 0.5;                // Hold time in seconds (configurable 0.5-2.0s)
        
        // Peak hold levels and timing
        this.peakHoldLeft = -60;            // Hold value for left peak meter
        this.peakHoldRight = -60;           // Hold value for right peak meter
        this.peakHoldLeftTime = 0;          // Timestamp when left peak hold was set
        this.peakHoldRightTime = 0;         // Timestamp when right peak hold was set
        
        // RMS hold levels and timing
        this.rmsHoldLeft = -60;             // Hold value for left RMS meter
        this.rmsHoldRight = -60;            // Hold value for right RMS meter
        this.rmsHoldLeftTime = 0;           // Timestamp when left RMS hold was set
        this.rmsHoldRightTime = 0;          // Timestamp when right RMS hold was set
        
        // === METER SPEED CONFIGURATION ===
        // Configurable attack/release rates for meter ballistics
        // Lower values = faster response
        // attack: how quickly meter responds to increases (0.1 = very fast, 0.9 = very slow)
        // release: how quickly meter falls back down (0.3 = fast fall, 0.9 = very slow fall)
        this.meterSpeeds = {
            slow: { attack: 0.6, release: 0.95 },
            medium: { attack: 0.36, release: 0.84 },
            fast: { attack: 0.12, release: 0.36 }
        };
        this.currentMeterSpeed = this.meterSpeeds.medium;  // Default to medium speed
        
        // === RMS BALLISTICS MULTIPLIER ===
        // Controls how much slower RMS meters should be compared to peak meters
        // 1.0 = same speed as peak meters, 2.0 = twice as slow, etc.
        // 
        // To adjust this value during runtime, use the browser console:
        // analyzer.levelMeters.setRmsBallasticsMultiplier(3.0);  // Make RMS 3x slower
        // 
        this.rmsBallasticsMultiplier = 2.0;  // Default: RMS meters are 2x slower than peak meters
        
        // === METER LAYOUT POSITIONS ===
        // These will be calculated in updateLayout()
        this.peakLeftMeter = 0;
        this.rmsLeftMeter = 0;
        this.rmsRightMeter = 0;
        this.peakRightMeter = 0;
        
        // === PHASE CORRELATION METER ===
        this.correlationLevel = 0;              // Current phase correlation (-1 to +1)
        this.correlationMeterY = 0;             // Y position of correlation meter
        this.correlationMeterHeight = 15;       // Height of correlation meter
        
        // === NUMERICAL DISPLAY TIMING ===
        this.lastNumDisplayUpdate = 0;          // Timestamp of last peak numerical display update
        this.lastRmsDisplayUpdate = 0;          // Timestamp of last RMS numerical display update
        this.numDisplayUpdateInterval = 150;    // Update interval for peak displays in milliseconds (150ms = 6.7 times per second)
        this.storedDisplayValues = {            // Cached display strings for each meter
            peakLeft: '-60.0',
            peakRight: '-60.0',
            rmsLeft: '-60.0',
            rmsRight: '-60.0'
        };
        
        // === RMS WEIGHTING SETTINGS ===
        this.rmsWeighting = 'Z';                // Current weighting type: 'Z', 'A', or 'C'
        
        // === WEIGHTING FILTER STATES ===
        // Biquad filter states for A and C weighting (left and right channels)
        this.aWeightingFiltersLeft = this.initializeAWeightingFilters();
        this.aWeightingFiltersRight = this.initializeAWeightingFilters();
        this.cWeightingFiltersLeft = this.initializeCWeightingFilters();
        this.cWeightingFiltersRight = this.initializeCWeightingFilters();
        
        // === DEDICATED METER ANALYZERS ===
        // References to dedicated analyzer nodes (independent of spectrogram FFT size)
        this.meterAnalyserLeft = null;          // Dedicated left channel analyzer for meters
        this.meterAnalyserRight = null;         // Dedicated right channel analyzer for meters
    }
    
    /**
     * Initialize the level meters when audio starts
     * @param {AnalyserNode} meterAnalyserLeft - Dedicated left channel analyzer for meters
     * @param {AnalyserNode} meterAnalyserRight - Dedicated right channel analyzer for meters
     */
    initialize(meterAnalyserLeft, meterAnalyserRight) {
        // Store references to dedicated meter analyzers
        this.meterAnalyserLeft = meterAnalyserLeft;
        this.meterAnalyserRight = meterAnalyserRight;
        
        this.lastPeakUpdateTime = performance.now();
        
        // Reset hold indicators to minimum levels
        const currentTime = performance.now();
        this.peakHoldLeft = -60;
        this.peakHoldRight = -60;
        this.rmsHoldLeft = -60;
        this.rmsHoldRight = -60;
        this.peakHoldLeftTime = currentTime;
        this.peakHoldRightTime = currentTime;
        this.rmsHoldLeftTime = currentTime;
        this.rmsHoldRightTime = currentTime;
    }

    
    /**
     * Update meter layout positions based on current canvas dimensions
     */
    updateLayout() {
        // === CALCULATE LEVEL METER POSITIONS ===
        // Layout: [Spectrum] [PK L] [RMS L] [RMS R] [PK R]
        //         [Phase Correlation Meter (horizontal)]
        this.peakLeftMeter = this.analyzer.plotRight + 20;                           // First meter: Peak Left
        this.rmsLeftMeter = this.peakLeftMeter + this.peakMeterWidth + 10;  // Second: RMS Left
        this.rmsRightMeter = this.rmsLeftMeter + this.peakMeterWidth + 10;  // Third: RMS Right
        this.peakRightMeter = this.rmsRightMeter + this.peakMeterWidth + 10;// Fourth: Peak Right
        
        // === PHASE CORRELATION METER POSITION ===
        // Position so bottom of meter aligns with bottom of spectrum plot
        this.correlationMeterY = this.analyzer.plotBottom - this.correlationMeterHeight + 1; // Move down by 1 pixels
    }
    
    /**
     * Set the meter speed from the UI control
     * @param {string} speedName - 'slow', 'medium', or 'fast'
     */
    setMeterSpeed(speedName) {
        this.currentMeterSpeed = this.meterSpeeds[speedName];
    }
    
    /**
     * Set the RMS ballistics multiplier
     * @param {number} multiplier - How much slower RMS meters should be (1.0 = same speed, 2.0 = twice as slow)
     * 
     * Examples:
     * - 1.0: RMS meters respond at the same speed as peak meters
     * - 2.0: RMS meters respond twice as slowly (default)
     * - 3.0: RMS meters respond three times as slowly
     * - 0.5: Invalid, will be clamped to 1.0 minimum
     */
    setRmsBallasticsMultiplier(multiplier) {
        this.rmsBallasticsMultiplier = Math.max(1.0, multiplier);  // Minimum 1.0 (same speed as peak)
    }
    
    /**
     * Calculate the RMS numerical display update interval based on the ballistics multiplier
     * @returns {number} Update interval in milliseconds for RMS displays
     */
    getRmsDisplayUpdateInterval() {
        return this.numDisplayUpdateInterval * this.rmsBallasticsMultiplier;
    }
    
    /**
     * Set the hold time from the UI control
     * @param {number} holdTimeSeconds - Hold time in seconds (0.5 to 2.0)
     */
    setHoldTime(holdTimeSeconds) {
        this.holdTime = holdTimeSeconds;
    }
    
    /**
     * Set the numerical display update interval from the UI control
     * @param {number} intervalMs - Update interval in milliseconds (10 to 250)
     */
    setDisplayUpdateInterval(intervalMs) {
        this.numDisplayUpdateInterval = intervalMs;
    }
    
    /**
     * Set the RMS weighting type from the UI control
     * @param {string} weightingType - 'Z' (flat), 'A' (human hearing), or 'C' (entertainment)
     */
    setRmsWeighting(weightingType) {
        this.rmsWeighting = weightingType;
        
        // Reset filter states when weighting changes to avoid transients
        if (weightingType === 'A') {
            this.aWeightingFiltersLeft = this.initializeAWeightingFilters();
            this.aWeightingFiltersRight = this.initializeAWeightingFilters();
        } else if (weightingType === 'C') {
            this.cWeightingFiltersLeft = this.initializeCWeightingFilters();
            this.cWeightingFiltersRight = this.initializeCWeightingFilters();
        }
    }
    
    /**
     * Clear the meter area of the canvas
     */
    clearMeterArea() {
        this.analyzer.ctx.fillStyle = '#111';
        // Clear the entire meter area, including space for numerical displays above meters and correlation meter below
        const numericalDisplayHeight = 20; // Space needed above meters for numerical dB displays
        const clearStartY = this.analyzer.plotTop - numericalDisplayHeight;
        const clearHeight = Math.min(
            this.correlationMeterY + this.correlationMeterHeight + 30 - clearStartY,
            this.analyzer.canvasHeight - clearStartY
        );
        this.analyzer.ctx.fillRect(this.peakLeftMeter - 15, clearStartY, 
                                  this.analyzer.canvasWidth - this.peakLeftMeter + 15, clearHeight);
    }
    
    /**
     * Updates both peak and RMS level measurements for both audio channels
     * Now using dedicated meter analyzers with fixed 2048 FFT size for optimal performance
     * 
     * @param {Float32Array} timeDataLeft - Raw waveform data for left channel (-1.0 to +1.0)
     * @param {Float32Array} timeDataRight - Raw waveform data for right channel (-1.0 to +1.0)
     */
    updateLevels(timeDataLeft, timeDataRight) {
        // === CALCULATE TIMING FOR SMOOTHING ===
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastPeakUpdateTime) / 1000; // Time since last update (in seconds)
        this.lastPeakUpdateTime = currentTime;                     // Update timestamp for next call
        
        // === CALCULATE INSTANTANEOUS LEVELS ===
        // Peak level = maximum sample value in the current time window
        const peakLeft = this.calculatePeakLevel(timeDataLeft);    // Get left channel peak level
        const peakRight = this.calculatePeakLevel(timeDataRight);  // Get right channel peak level
        
        // RMS level = root mean square (average energy) in the current time window
        // RMS is better for perceived loudness than peak measurements
        const rmsLeft = this.calculateRmsLevel(timeDataLeft, 'left');      // Get left channel RMS level
        const rmsRight = this.calculateRmsLevel(timeDataRight, 'right');   // Get right channel RMS level
        
        // === APPLY ATTACK/DECAY SMOOTHING ===
        // Smoothing prevents meters from jumping around too rapidly
        // Attack = fast response to louder sounds, Decay = slow fall when sound stops
        
        // Smooth peak levels (fast attack, slow decay for realistic peak meter behavior)
        this.peakLevelLeft = this.smoothPeakLevel(this.peakLevelLeft, peakLeft, deltaTime);
        this.peakLevelRight = this.smoothPeakLevel(this.peakLevelRight, peakRight, deltaTime);
        
        // Smooth RMS levels (slower ballistics using dedicated RMS smoothing function)
        this.rmsLevelLeft = this.smoothRmsLevel(this.rmsLevelLeft, rmsLeft, deltaTime);
        this.rmsLevelRight = this.smoothRmsLevel(this.rmsLevelRight, rmsRight, deltaTime);
        
        // === UPDATE HOLD INDICATORS ===
        // Hold indicators track the highest levels reached for a specified duration
        this.updateHoldIndicators(currentTime);
        
        // === CALCULATE PHASE CORRELATION ===
        // Phase correlation measures the relationship between left and right channels
        const correlation = this.calculatePhaseCorrelation(timeDataLeft, timeDataRight);
        
        // Smooth correlation level (using same smoothing as other meters)
        this.correlationLevel = this.smoothCorrelationLevel(this.correlationLevel, correlation, deltaTime);
    }
    
    /**
     * Updates hold indicators for all meters (peak and RMS for both channels)
     * Hold indicators track the highest levels reached for a specified duration
     * 
     * @param {number} currentTime - Current timestamp in milliseconds
     */
    updateHoldIndicators(currentTime) {
        const holdTimeMs = this.holdTime * 1000; // Convert hold time to milliseconds
        
        // === UPDATE PEAK HOLD LEFT ===
        if (this.peakLevelLeft > this.peakHoldLeft) {
            // New peak detected - update hold value and timestamp
            this.peakHoldLeft = this.peakLevelLeft;
            this.peakHoldLeftTime = currentTime;
        } else if (currentTime - this.peakHoldLeftTime > holdTimeMs) {
            // Hold time expired - decay hold indicator
            this.peakHoldLeft = this.peakLevelLeft;
            this.peakHoldLeftTime = currentTime;
        }
        
        // === UPDATE PEAK HOLD RIGHT ===
        if (this.peakLevelRight > this.peakHoldRight) {
            // New peak detected - update hold value and timestamp
            this.peakHoldRight = this.peakLevelRight;
            this.peakHoldRightTime = currentTime;
        } else if (currentTime - this.peakHoldRightTime > holdTimeMs) {
            // Hold time expired - decay hold indicator
            this.peakHoldRight = this.peakLevelRight;
            this.peakHoldRightTime = currentTime;
        }
        
        // === UPDATE RMS HOLD LEFT ===
        if (this.rmsLevelLeft > this.rmsHoldLeft) {
            // New RMS peak detected - update hold value and timestamp
            this.rmsHoldLeft = this.rmsLevelLeft;
            this.rmsHoldLeftTime = currentTime;
        } else if (currentTime - this.rmsHoldLeftTime > holdTimeMs) {
            // Hold time expired - decay hold indicator
            this.rmsHoldLeft = this.rmsLevelLeft;
            this.rmsHoldLeftTime = currentTime;
        }
        
        // === UPDATE RMS HOLD RIGHT ===
        if (this.rmsLevelRight > this.rmsHoldRight) {
            // New RMS peak detected - update hold value and timestamp
            this.rmsHoldRight = this.rmsLevelRight;
            this.rmsHoldRightTime = currentTime;
        } else if (currentTime - this.rmsHoldRightTime > holdTimeMs) {
            // Hold time expired - decay hold indicator
            this.rmsHoldRight = this.rmsLevelRight;
            this.rmsHoldRightTime = currentTime;
        }
    }
    
    /**
     * Calculates the peak level (maximum amplitude) from time domain audio data
     * Peak level represents the loudest instantaneous sample in the audio buffer
     * 
     * @param {Float32Array} timeData - Raw audio waveform data (-1.0 to +1.0 values)
     * @returns {number} Peak level in dBFS (decibels relative to full scale)
     */
    calculatePeakLevel(timeData) {
        let peak = 0;                                              // Start with zero peak
        
        // === FIND MAXIMUM SAMPLE VALUE ===
        for (let i = 0; i < timeData.length; i++) {
            // Data is already in -1.0 to +1.0 range (standard audio format)
            const sample = timeData[i];                           // No scaling needed
            
            // Track the maximum absolute value (peak regardless of positive/negative)
            peak = Math.max(peak, Math.abs(sample));              // Take absolute value for peak magnitude
        }
        
        // === CONVERT TO dBFS (DECIBELS FULL SCALE) ===
        // dBFS is the standard unit for digital audio levels
        // 0 dBFS = maximum possible digital level, negative values = quieter
        if (peak > 0) {
            // Formula: dB = 20 * log10(amplitude)
            // Clamp to minimum of -60 dB to avoid extremely negative values
            return Math.max(-60, 20 * Math.log10(peak));
        } else {
            // If no signal detected, return minimum displayable level
            return -60;
        }
    }
    
    /**
     * Calculates the RMS level (Root Mean Square) from time domain audio data
     * RMS represents the average energy content and correlates better with perceived loudness
     * 
     * @param {Float32Array} timeData - Raw audio waveform data (-1.0 to +1.0 values)
     * @param {string} channel - 'left' or 'right' to determine which filter states to use
     * @returns {number} RMS level in dBFS (decibels relative to full scale)
     */
    calculateRmsLevel(timeData, channel) {
        // === APPLY FREQUENCY WEIGHTING IF NEEDED ===
        let processedData;
        if (this.rmsWeighting === 'Z') {
            // Z-weighting: no filtering (flat response)
            processedData = timeData;
        } else {
            // Apply weighting filter to the time domain data
            processedData = this.applyWeighting(timeData, channel);
        }
        
        let sumSquares = 0;                                        // Sum of squared sample values
        
        // === CALCULATE ROOT MEAN SQUARE ===
        for (let i = 0; i < processedData.length; i++) {
            // Data is already in -1.0 to +1.0 range (standard audio format)
            const sample = processedData[i];                       // No scaling needed
            
            // Square each sample (this removes negative values and emphasizes louder parts)
            sumSquares += sample * sample;                         // Accumulate squared values
        }
        
        // Calculate RMS: square root of the mean of the squared values
        const rms = Math.sqrt(sumSquares / processedData.length);       // RMS = √(average of squares)
        
        // === CONVERT TO dBFS ===
        // Same conversion as peak level, but RMS values are typically lower than peak
        if (rms > 0) {
            // RMS levels are usually 3-6 dB below peak levels for typical audio
            return Math.max(-60, 20 * Math.log10(rms));
        } else {
            // If no signal detected, return minimum displayable level
            return -60;
        }
    }
    
    /**
     * Calculates the phase correlation between left and right audio channels
     * Correlation ranges from -1 (perfectly out of phase) to +1 (perfectly in phase)
     * 
     * @param {Float32Array} timeDataLeft - Raw waveform data for left channel (-1.0 to +1.0)
     * @param {Float32Array} timeDataRight - Raw waveform data for right channel (-1.0 to +1.0)
     * @returns {number} Phase correlation coefficient (-1 to +1)
     */
    calculatePhaseCorrelation(timeDataLeft, timeDataRight) {
        let sumLeft = 0, sumRight = 0;
        let sumLeftSquared = 0, sumRightSquared = 0;
        let sumProduct = 0;
        const n = timeDataLeft.length;
        
        // === CONVERT DATA AND CALCULATE SUMS ===
        const leftSamples = [];
        const rightSamples = [];
        
        for (let i = 0; i < n; i++) {
            // Data is already in -1.0 to +1.0 range (standard audio format)
            const leftSample = timeDataLeft[i];                   // No scaling needed
            const rightSample = timeDataRight[i];                 // No scaling needed
            
            leftSamples[i] = leftSample;
            rightSamples[i] = rightSample;
            
            sumLeft += leftSample;
            sumRight += rightSample;
        }
        
        // === CALCULATE MEANS ===
        const meanLeft = sumLeft / n;
        const meanRight = sumRight / n;
        
        // === CALCULATE CORRELATION COEFFICIENT ===
        for (let i = 0; i < n; i++) {
            const leftDeviation = leftSamples[i] - meanLeft;
            const rightDeviation = rightSamples[i] - meanRight;
            
            sumLeftSquared += leftDeviation * leftDeviation;
            sumRightSquared += rightDeviation * rightDeviation;
            sumProduct += leftDeviation * rightDeviation;
        }
        
        // === CALCULATE PEARSON CORRELATION COEFFICIENT ===
        const denominator = Math.sqrt(sumLeftSquared * sumRightSquared);
        
        if (denominator === 0) {
            return 0; // No correlation if either channel has no variance
        }
        
        const correlation = sumProduct / denominator;
        
        // Clamp to valid range (should already be in range, but just to be safe)
        return Math.max(-1, Math.min(1, correlation));
    }
    
    /**
     * Applies smoothing to phase correlation readings
     * Uses similar ballistics to level meters but with different characteristics
     * 
     * @param {number} currentCorrelation - Current smoothed correlation
     * @param {number} targetCorrelation - New measured correlation
     * @param {number} deltaTime - Time elapsed since last update in seconds
     * @returns {number} New smoothed correlation
     */
    smoothCorrelationLevel(currentCorrelation, targetCorrelation, deltaTime) {
        // Use faster smoothing for correlation meter since it changes more gradually
        const smoothingFactor = 0.7; // Moderate smoothing
        
        return targetCorrelation * (1 - smoothingFactor) + currentCorrelation * smoothingFactor;
    }
    
    /**
     * Applies attack/release smoothing to level meter readings using configurable meter speed
     * Creates realistic meter ballistics - fast response to loud sounds, slow decay when quiet
     * 
     * @param {number} currentLevel - Current smoothed level in dB
     * @param {number} targetLevel - New measured level in dB
     * @param {number} deltaTime - Time elapsed since last update in seconds (unused in this implementation)
     * @returns {number} New smoothed level in dB
     */
    smoothPeakLevel(currentLevel, targetLevel, deltaTime) {
        // Convert dB levels to linear amplitude for smoother calculations
        const currentLinear = Math.pow(10, currentLevel / 20);
        const targetLinear = Math.pow(10, targetLevel / 20);
        
        let smoothedLinear;
        
        if (targetLinear > currentLinear) {
            // === ATTACK PHASE ===
            // When sound gets louder, use attack speed
            // Lower attack values = faster response to increasing levels
            smoothedLinear = targetLinear * (1 - this.currentMeterSpeed.attack) + currentLinear * this.currentMeterSpeed.attack;
        } else {
            // === RELEASE PHASE ===
            // When sound gets quieter, use release speed
            // Lower release values = faster fall when sound decreases
            smoothedLinear = targetLinear * (1 - this.currentMeterSpeed.release) + currentLinear * this.currentMeterSpeed.release;
        }
        
        // Convert back to dB scale, ensuring we don't go below minimum
        const smoothedDB = 20 * Math.log10(smoothedLinear + 1e-10);
        return Math.max(-60, smoothedDB);  // Clamp to minimum displayable level
    }
    
    /**
     * Applies attack/release smoothing to RMS level meter readings with adjustable ballistics
     * Uses slower ballistics than peak meters by applying the rmsBallasticsMultiplier
     * 
     * @param {number} currentLevel - Current smoothed level in dB
     * @param {number} targetLevel - New measured level in dB
     * @param {number} deltaTime - Time elapsed since last update in seconds (unused in this implementation)
     * @returns {number} New smoothed level in dB
     */
    smoothRmsLevel(currentLevel, targetLevel, deltaTime) {
        // Convert dB levels to linear amplitude for smoother calculations
        const currentLinear = Math.pow(10, currentLevel / 20);
        const targetLinear = Math.pow(10, targetLevel / 20);
        
        // Calculate adjusted speeds for RMS meters (slower than peak meters)
        // Higher values = slower response (approaching 1.0 = very slow)
        const adjustedAttack = 1 - ((1 - this.currentMeterSpeed.attack) / this.rmsBallasticsMultiplier);
        const adjustedRelease = 1 - ((1 - this.currentMeterSpeed.release) / this.rmsBallasticsMultiplier);
        
        let smoothedLinear;
        
        if (targetLinear > currentLinear) {
            // === ATTACK PHASE ===
            // When sound gets louder, use slower attack speed for RMS
            smoothedLinear = targetLinear * (1 - adjustedAttack) + currentLinear * adjustedAttack;
        } else {
            // === RELEASE PHASE ===
            // When sound gets quieter, use slower release speed for RMS
            smoothedLinear = targetLinear * (1 - adjustedRelease) + currentLinear * adjustedRelease;
        }
        
        // Convert back to dB scale, ensuring we don't go below minimum
        const smoothedDB = 20 * Math.log10(smoothedLinear + 1e-10);
        return Math.max(-60, smoothedDB);  // Clamp to minimum displayable level
    }
    
    /**
     * Updates the stored numerical display values at controlled rates
     * Peak displays update at base interval, RMS displays update slower based on ballistics multiplier
     */
    updateStoredDisplayValues() {
        const currentTime = performance.now();
        
        // Update peak displays at base rate
        if (currentTime - this.lastNumDisplayUpdate >= this.numDisplayUpdateInterval) {
            this.storedDisplayValues.peakLeft = this.peakLevelLeft.toFixed(1);
            this.storedDisplayValues.peakRight = this.peakLevelRight.toFixed(1);
            this.lastNumDisplayUpdate = currentTime;
        }
        
        // Update RMS displays at slower rate based on ballistics multiplier
        const rmsUpdateInterval = this.getRmsDisplayUpdateInterval();
        if (currentTime - this.lastRmsDisplayUpdate >= rmsUpdateInterval) {
            this.storedDisplayValues.rmsLeft = this.rmsLevelLeft.toFixed(1);
            this.storedDisplayValues.rmsRight = this.rmsLevelRight.toFixed(1);
            this.lastRmsDisplayUpdate = currentTime;
        }
    }
    

    
    /**
     * Draws all level meters (peak and RMS for both channels) and phase correlation meter
     * Coordinates the drawing of individual meters in their assigned positions
     */
    drawAllMeters() {
        // === UPDATE NUMERICAL DISPLAY VALUES ===
        // Update the cached numerical display values at controlled intervals
        this.updateStoredDisplayValues();
        
        // === DRAW PEAK METERS ===
        // Peak meters show instantaneous maximum levels - good for detecting clipping
        this.drawSingleMeter(this.peakLeftMeter, this.peakLevelLeft, 'PK L', this.peakHoldLeft, this.storedDisplayValues.peakLeft);
        this.drawSingleMeter(this.peakRightMeter, this.peakLevelRight, 'PK R', this.peakHoldRight, this.storedDisplayValues.peakRight);
        
        // === DRAW RMS METERS ===
        // RMS meters show average energy levels - better for perceived loudness
        this.drawSingleMeter(this.rmsLeftMeter, this.rmsLevelLeft, 'RMS L', this.rmsHoldLeft, this.storedDisplayValues.rmsLeft);
        this.drawSingleMeter(this.rmsRightMeter, this.rmsLevelRight, 'RMS R', this.rmsHoldRight, this.storedDisplayValues.rmsRight);
        
        // === DRAW PHASE CORRELATION METER ===
        // Shows phase relationship between left and right channels
        this.drawCorrelationMeter();
    }
    
    /**
     * Draws a single level meter with colored segments, hold indicator, and label
     * Creates a professional-looking VU meter with green/yellow/red color coding
     * 
     * @param {number} x - Horizontal position of the meter
     * @param {number} level - Current level in dB
     * @param {string} label - Text label for the meter (e.g., "PK L", "RMS R")
     * @param {number} holdLevel - Hold indicator level in dB
     * @param {string} displayValue - Pre-formatted display string for numerical readout
     */
    drawSingleMeter(x, level, label, holdLevel, displayValue) {
        const ctx = this.analyzer.ctx;
        
        // === CALCULATE REDUCED METER HEIGHT ===
        // Use less height to make room for correlation meter and labels
        // Reduced by 5 pixels from original calculation
        const meterHeight = this.analyzer.plotHeight - this.correlationMeterHeight - 25;  // Reduced from 20 to 25
        const meterBottom = this.analyzer.plotTop + meterHeight;
        
        // === DRAW METER BACKGROUND ===
        ctx.fillStyle = '#222';                              // Dark gray background
        ctx.fillRect(x, this.analyzer.plotTop, this.peakMeterWidth, meterHeight);
        
        // === DRAW METER BORDER ===
        ctx.strokeStyle = '#555';                            // Medium gray border
        ctx.lineWidth = 1;
        ctx.strokeRect(x, this.analyzer.plotTop, this.peakMeterWidth, meterHeight);
        
        // === CALCULATE METER FILL HEIGHT ===
        // Convert dB level to a 0-1 normalized value for drawing
        const normalizedLevel = (level - this.meterMinDB) / (this.meterMaxDB - this.meterMinDB);
        const fillHeight = normalizedLevel * meterHeight;     // Height in pixels
        const fillY = meterBottom - fillHeight;               // Y coordinate (top of fill area)
        
        // === DRAW COLORED LEVEL SEGMENTS ===
        // Only draw segments if there's actually a signal above minimum
        this.drawMeterSegments(x, fillY, fillHeight, level, meterBottom);
        
        // === DRAW HOLD INDICATOR ===
        // Draw hold indicator as a bright line segment at the hold level
        this.drawHoldIndicator(x, holdLevel, meterBottom, this.analyzer.plotTop);
        
        // === DRAW NUMERICAL dB DISPLAY ===
        // Show current level in dB with one decimal place at top of meter (updates 6.7 times per second)
        ctx.fillStyle = '#fff';                              // White text for visibility
        ctx.font = '12px Arial';                             // Larger font for better readability
        ctx.textAlign = 'center';                            // Center text above meter
        ctx.textBaseline = 'bottom';                         // Align text bottom to position
        ctx.fillText(displayValue, x + this.peakMeterWidth / 2, this.analyzer.plotTop - 2);
        
        // === DRAW METER LABEL ===
        ctx.fillStyle = '#fff';                              // White text
        ctx.font = '10px Arial';                             // Small font for compact display
        ctx.textAlign = 'center';                            // Center text under meter
        ctx.textBaseline = 'top';
        ctx.fillText(label, x + this.peakMeterWidth / 2, meterBottom + 5);
    }
    
    /**
     * Draws the colored segments that make up a level meter
     * Uses professional audio color coding: green (safe), yellow (loud), red (danger)
     * 
     * @param {number} x - Horizontal position of the meter
     * @param {number} fillY - Top edge of the meter fill area
     * @param {number} fillHeight - Height of the meter fill area
     * @param {number} peakLevel - Current level in dB (used to determine segment colors)
     * @param {number} meterBottom - Bottom edge of the meter
     */
    drawMeterSegments(x, fillY, fillHeight, peakLevel, meterBottom) {
        const ctx = this.analyzer.ctx;
        
        // === SEGMENT VISUAL SETTINGS ===
        const segmentHeight = 2;                                  // Height of each colored bar
        const segmentSpacing = 1;                                 // Space between bars
        const totalSegmentHeight = segmentHeight + segmentSpacing; // Total space per segment
        
        // Calculate the actual meter height for this meter
        const actualMeterHeight = meterBottom - this.analyzer.plotTop;
        
        // === DRAW SEGMENTS FROM BOTTOM TO TOP ===
        // Start at the bottom and work upward, only drawing segments within the fill height
        for (let y = meterBottom - segmentHeight; y >= fillY; y -= totalSegmentHeight) {
            // === CALCULATE dB LEVEL FOR THIS SEGMENT ===
            // Determine what dB level this vertical position represents
            const segmentNormalized = (meterBottom - y) / actualMeterHeight;  // 0-1 range
            const segmentDB = this.meterMinDB + segmentNormalized * (this.meterMaxDB - this.meterMinDB);
            
            // === CHOOSE COLOR BASED ON dB LEVEL ===
            // Standard professional audio color coding:
            // Green: -∞ to -18 dB (safe operating levels)
            // Yellow: -18 to -6 dB (getting loud, attention needed)
            // Red: -6 to 0 dB (danger zone, risk of clipping)
            let color;
            if (segmentDB <= -18) {
                color = '#00ff00';                                 // Green - safe levels
            } else if (segmentDB <= -6) {
                color = '#ffff00';                                 // Yellow - loud but OK
            } else {
                color = '#ff0000';                                 // Red - danger zone
            }
            
            // === DRAW THE SEGMENT ===
            ctx.fillStyle = color;
            // Draw slightly inset from meter edges for visual appeal
            ctx.fillRect(x + 2, y, this.peakMeterWidth - 4, segmentHeight);
        }
    }
    
    /**
     * Draws the hold indicator for a level meter
     * Shows as a bright white line segment at the hold level position
     * 
     * @param {number} x - Horizontal position of the meter
     * @param {number} holdLevel - Hold level in dB
     * @param {number} meterBottom - Bottom edge of the meter
     * @param {number} meterTop - Top edge of the meter
     */
    drawHoldIndicator(x, holdLevel, meterBottom, meterTop) {
        const ctx = this.analyzer.ctx;
        
        // Only draw if hold level is above minimum displayable level
        if (holdLevel > this.meterMinDB) {
            // Calculate the actual meter height for this meter
            const actualMeterHeight = meterBottom - meterTop;
            
            // === CALCULATE HOLD INDICATOR POSITION ===
            // Convert dB level to y-coordinate
            const normalizedHoldLevel = (holdLevel - this.meterMinDB) / (this.meterMaxDB - this.meterMinDB);
            const holdY = meterBottom - (normalizedHoldLevel * actualMeterHeight);
            
            // === DRAW HOLD INDICATOR LINE ===
            ctx.fillStyle = '#ffffff';                          // Bright white for visibility
            const indicatorHeight = 2;                          // Same height as meter segments
            // Draw slightly inset from meter edges for consistency with segments
            ctx.fillRect(x + 2, holdY - indicatorHeight/2, this.peakMeterWidth - 4, indicatorHeight);
        }
    }
    
    /**
     * Draws the horizontal phase correlation meter
     * Shows correlation from -1 (anti-correlated) to +1 (correlated)
     */
    drawCorrelationMeter() {
        const ctx = this.analyzer.ctx;
        
        // === METER DIMENSIONS ===
        // Right edge aligns with right edge of Peak Right meter
        const meterRightEdge = this.peakRightMeter + this.peakMeterWidth;
        const meterWidth = meterRightEdge - this.peakLeftMeter;
        const meterX = this.peakLeftMeter;
        const meterY = this.correlationMeterY;
        const meterHeight = this.correlationMeterHeight;
        
        // === DRAW METER BACKGROUND ===
        ctx.fillStyle = '#222';
        ctx.fillRect(meterX, meterY, meterWidth, meterHeight);
        
        // === DRAW METER BORDER ===
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.strokeRect(meterX, meterY, meterWidth, meterHeight);
        
        // === DRAW CENTER LINE (ZERO CORRELATION) ===
        const centerX = meterX + meterWidth / 2;
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(centerX, meterY);
        ctx.lineTo(centerX, meterY + meterHeight);
        ctx.stroke();
        
        // === CALCULATE METER FILL ===
        // Convert correlation (-1 to +1) to position (0 to meterWidth)
        const normalizedCorrelation = (this.correlationLevel + 1) / 2; // Convert -1..1 to 0..1
        const fillWidth = normalizedCorrelation * meterWidth;
        
        // === DRAW CORRELATION SEGMENTS ===
        this.drawCorrelationSegments(meterX, meterY, meterWidth, meterHeight, fillWidth);
        
        // === DRAW LABELS ===
        ctx.fillStyle = '#fff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        
        // Combined meter label and value
        ctx.fillText(`Phase: ${this.correlationLevel.toFixed(2)}`, centerX, this.analyzer.plotBottom + 9);
        
        // Scale labels - all aligned on same horizontal plane above the meter
        const labelY = meterY - 12; // Closer to the top of the meter, this is the hight of the Correlation meter numerical labels
        
        // -1 label positioned just above left edge of meter
        ctx.textAlign = 'left';
        ctx.fillText('-1', meterX, labelY);
        
        // 0 label at center
        ctx.textAlign = 'center';
        ctx.fillText('0', centerX, labelY);
        
        // +1 label positioned just above right edge of meter
        ctx.textAlign = 'right';
        ctx.fillText('+1', meterX + meterWidth, labelY);
    }
    
    /**
     * Initialize A-weighting filter cascade (4 biquad stages)
     * A-weighting approximates human hearing sensitivity curve
     * @returns {Array} Array of biquad filter states
     */
    initializeAWeightingFilters() {
        // A-weighting filter coefficients for 44.1kHz sample rate
        // Based on IEC 61672-1 standard, implemented as cascaded biquad sections
        return [
            // Stage 1: High-pass ~20Hz (removes very low frequencies)
            { b0: 0.9995948206, b1: -1.9991896411, b2: 0.9995948206, a1: -1.9991896411, a2: 0.9991897616, x1: 0, x2: 0, y1: 0, y2: 0 },
            // Stage 2: High-pass ~20Hz (double pole for sharper rolloff)
            { b0: 0.9995948206, b1: -1.9991896411, b2: 0.9995948206, a1: -1.9991896411, a2: 0.9991897616, x1: 0, x2: 0, y1: 0, y2: 0 },
            // Stage 3: Peak at ~1kHz (emphasizes frequencies where hearing is most sensitive)
            { b0: 0.3971894087, b1: 0.0000000000, b2: -0.3971894087, a1: -0.1981346640, a2: 0.2057211826, x1: 0, x2: 0, y1: 0, y2: 0 },
            // Stage 4: Low-pass ~12kHz (rolls off high frequencies)
            { b0: 0.0179475827, b1: 0.0358951654, b2: 0.0179475827, a1: -1.5949259280, a2: 0.6667162589, x1: 0, x2: 0, y1: 0, y2: 0 }
        ];
    }
    
    /**
     * Initialize C-weighting filter cascade (2 biquad stages)
     * C-weighting has flatter response than A-weighting, mainly removes very low frequencies
     * @returns {Array} Array of biquad filter states
     */
    initializeCWeightingFilters() {
        // C-weighting filter coefficients for 44.1kHz sample rate
        // Based on IEC 61672-1 standard, implemented as cascaded biquad sections
        return [
            // Stage 1: High-pass ~31Hz (removes very low frequencies)
            { b0: 0.9979823923, b1: -1.9959647845, b2: 0.9979823923, a1: -1.9959647845, a2: 0.9959647845, x1: 0, x2: 0, y1: 0, y2: 0 },
            // Stage 2: Low-pass ~8kHz (gentle high frequency rolloff)
            { b0: 0.0444858780, b1: 0.0889717560, b2: 0.0444858780, a1: -1.3080101325, a2: 0.4859536445, x1: 0, x2: 0, y1: 0, y2: 0 }
        ];
    }
    
    /**
     * Apply weighting filter to time domain audio data
     * @param {Float32Array} timeData - Raw audio waveform data (-1.0 to +1.0 values)
     * @param {string} channel - 'left' or 'right' to determine which filter states to use
     * @returns {Float32Array} Filtered audio data
     */
    applyWeighting(timeData, channel) {
        // Select appropriate filter bank
        let filters;
        if (this.rmsWeighting === 'A') {
            filters = channel === 'left' ? this.aWeightingFiltersLeft : this.aWeightingFiltersRight;
        } else if (this.rmsWeighting === 'C') {
            filters = channel === 'left' ? this.cWeightingFiltersLeft : this.cWeightingFiltersRight;
        } else {
            // Z-weighting (no filtering)
            return timeData;
        }
        
        // Create output array
        const filteredData = new Float32Array(timeData.length);
        
        // Process each sample through the filter cascade
        for (let i = 0; i < timeData.length; i++) {
            // Data is already in -1.0 to +1.0 range for filtering
            let sample = timeData[i];                             // No scaling needed
            
            // Apply each biquad filter in sequence
            for (let stage = 0; stage < filters.length; stage++) {
                sample = this.processBiquad(sample, filters[stage]);
            }
            
            // Store filtered sample (already in correct range)
            filteredData[i] = sample;
        }
        
        return filteredData;
    }
    
    /**
     * Process a single sample through a biquad filter section
     * @param {number} input - Input sample (-1.0 to +1.0)
     * @param {Object} filter - Biquad filter state object
     * @returns {number} Filtered output sample
     */
    processBiquad(input, filter) {
        // Direct Form II biquad implementation
        // y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]
        
        const output = filter.b0 * input + filter.b1 * filter.x1 + filter.b2 * filter.x2 
                      - filter.a1 * filter.y1 - filter.a2 * filter.y2;
        
        // Update delay line
        filter.x2 = filter.x1;
        filter.x1 = input;
        filter.y2 = filter.y1;
        filter.y1 = output;
        
        return output;
    }
    
    /**
     * Draws the colored segments for the phase correlation meter
     * Uses color coding: red (anti-correlated), yellow (uncorrelated), green (correlated)
     */
    drawCorrelationSegments(meterX, meterY, meterWidth, meterHeight, fillWidth) {
        const ctx = this.analyzer.ctx;
        const segmentWidth = 3;
        const segmentSpacing = 1;
        const totalSegmentWidth = segmentWidth + segmentSpacing;
        
        // Draw segments from left to current position
        for (let x = meterX; x < meterX + fillWidth; x += totalSegmentWidth) {
            // Calculate correlation value for this segment
            const segmentNormalized = (x - meterX) / meterWidth; // 0 to 1
            const segmentCorrelation = (segmentNormalized * 2) - 1; // -1 to +1
            
            // Choose color based on correlation value
            let color;
            if (segmentCorrelation < -0.4) {
                color = '#ff0000'; // Red - anti-correlated (bad for stereo)
            } else if (segmentCorrelation < 0.4) {
                color = '#ffff00'; // Yellow - uncorrelated (neutral)
            } else {
                color = '#00ff00'; // Green - correlated (good for stereo)
            }
            
            // Draw the segment
            ctx.fillStyle = color;
            ctx.fillRect(x, meterY + 2, segmentWidth, meterHeight - 4);
        }
    }
    
    /**
     * Draws the dB scale ruler for the level meters
     * Provides numerical references for reading peak and RMS levels
     */
    drawMeterRulers() {
        const ctx = this.analyzer.ctx;
        
        // === CALCULATE REDUCED METER DIMENSIONS ===
        // Use same reduced height calculation as in drawSingleMeter
        const meterHeight = this.analyzer.plotHeight - this.correlationMeterHeight - 25;  // Same reduction as in drawSingleMeter
        const meterBottom = this.analyzer.plotTop + meterHeight;
        
        // === RULER TEXT APPEARANCE ===
        ctx.fillStyle = '#fff';                              // White text for visibility
        ctx.font = '10px Arial';                             // Smaller font for compact meter area
        ctx.textAlign = 'left';                              // Left-align number labels
        ctx.textBaseline = 'middle';                         // Center text vertically on ruler lines
        
        // === DRAW TICK MARKS FOR EVERY dB AND LABELS ===
        // Draw tick marks for all integer dB values from -60 to 0
        // Use audio-industry standard dB markings with emphasis on critical levels
        const dbSteps = [-60, -50, -40, -30, -24, -18, -12, -6, -3, 0];
        
        for (let dB = -60; dB <= 0; dB++) {
            // Convert dB value to y-coordinate (same scale as shortened meters)
            const y = meterBottom - ((dB - this.meterMinDB) / (this.meterMaxDB - this.meterMinDB)) * meterHeight;
            
            // === DRAW LEFT SIDE TICK MARK ===
            // Small horizontal line on the left side of the meter area
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(this.peakLeftMeter - 5, y);            // Start 5 pixels to the left
            ctx.lineTo(this.peakLeftMeter, y);               // End at meter edge
            ctx.stroke();
            
            // === DRAW RIGHT SIDE TICK MARK ===
            // Small horizontal line on the right side of the meter area
            ctx.beginPath();
            ctx.moveTo(this.peakRightMeter + this.peakMeterWidth, y);        // Start at right meter edge
            ctx.lineTo(this.peakRightMeter + this.peakMeterWidth + 5, y);    // End 5 pixels to the right
            ctx.stroke();
            
            // === DRAW dB VALUE LABEL (only for major dB steps) ===
            // Number label on the right side of all meters for selected values
            if (dbSteps.includes(dB)) {
                ctx.fillText(dB.toString(), this.peakRightMeter + this.peakMeterWidth + 5, y);
            }
        }
    }
} 