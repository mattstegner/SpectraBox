# RMS Meter Integration Time Fix

## Overview

Fixed the RMS meter integration time issue by increasing the meter FFT size from 2048 to 8192 samples, providing a more accurate integration window for RMS measurements.

## Problem Identified

The RMS meters were using too short an integration time window, making them overly responsive and not accurately representing perceived loudness:

- **Previous FFT size**: 2048 samples
- **Previous integration time**: ~43ms at 48kHz (too short)
- **Industry standard**: ~300ms integration time

## Solution Implemented

### Changes Made

#### 1. Added `meterFFTSize` Property

**File**: `public/js/spectrogram.js` (lines 35-41)

```javascript
// === METER FFT SIZE SETTINGS ===
// FFT size for RMS meter calculations (independent of spectrogram FFT)
// Larger values = longer integration time for more accurate RMS measurements
// At 48kHz: 8192 samples = ~171ms integration time (industry standard is ~300ms)
// At 44.1kHz: 8192 samples = ~186ms integration time
// This can be adjusted via: analyzer.meterFFTSize = 16384 (for ~341ms at 48kHz)
this.meterFFTSize = 8192; // Fixed size for RMS meter integration window
```

#### 2. Updated Meter Analyzer Configuration

**File**: `public/js/spectrogram.js` (lines 1128-1138)

Changed from hardcoded 2048 to use the configurable `this.meterFFTSize`:

```javascript
// === CONFIGURE METER ANALYZER SETTINGS ===
// FFT size optimized for RMS meter integration time (independent of spectrogram)
// Using 8192 samples provides proper RMS integration window:
// - At 48kHz: 8192/48000 = 171ms integration time
// - At 44.1kHz: 8192/44100 = 186ms integration time
// This is closer to the industry standard ~300ms for RMS meters
// Combined with smoothing algorithms, this provides accurate RMS measurements
this.meterAnalyserLeft.fftSize = this.meterFFTSize; // Use configurable meter FFT size
this.meterAnalyserRight.fftSize = this.meterFFTSize;
this.meterAnalyserLeft.smoothingTimeConstant = 0.3; // Faster response for meters
this.meterAnalyserRight.smoothingTimeConstant = 0.3;
```

#### 3. Updated Time Domain Data Retrieval

**File**: `public/js/spectrogram.js` (lines 1319-1325)

Now uses the configurable FFT size:

```javascript
// === GET TIME DOMAIN DATA FOR LEVEL METERS ===
// Time domain data shows the raw audio waveform (amplitude over time)
// We use this to calculate peak and RMS levels for the level meters
// Use dedicated meter analyzers with proper integration window size
// Using 8192 samples (configurable) for accurate RMS integration time (~171ms at 48kHz)
const timeDataLeft = new Float32Array(this.meterFFTSize); // Array for left channel waveform
const timeDataRight = new Float32Array(this.meterFFTSize); // Array for right channel waveform
```

#### 4. Added Runtime Configuration Method

**File**: `public/js/spectrogram.js` (lines 2630-2671)

New `setMeterFFTSize()` method allows runtime adjustment:

```javascript
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
setMeterFFTSize(fftSize) { ... }
```

## Integration Times at Different Sample Rates

### With 8192 samples (current default):

| Sample Rate | Integration Time |
| ----------- | ---------------- |
| 44.1 kHz    | 186 ms           |
| 48 kHz      | 171 ms           |
| 96 kHz      | 85 ms            |

### With 16384 samples (optional, closer to standard):

| Sample Rate | Integration Time |
| ----------- | ---------------- |
| 44.1 kHz    | 371 ms           |
| 48 kHz      | 341 ms           |
| 96 kHz      | 171 ms           |

## Usage Examples

### Using the Default (8192 samples):

No action needed - the meters now use 8192 samples by default, providing ~171ms integration at 48kHz.

### Changing to Industry Standard (~300ms):

Open browser console and type:

```javascript
analyzer.setMeterFFTSize(16384);
```

### Checking Current Integration Time:

The console will display the integration time whenever you change the FFT size or start audio.

## Benefits of This Fix

1. **More Accurate RMS Measurements**: Longer integration time better represents average energy content
2. **Better Correlation with Perceived Loudness**: RMS meters now respond more like human hearing
3. **Distinguishes from Peak Meters**: RMS meters are now clearly slower and more stable than peak meters
4. **Configurable**: Easy to adjust if different integration time is needed
5. **Hybrid Approach**: Combines proper integration window with existing smoothing algorithms

## Comparison with PAM Implementation

PAM's `LevelCalculator::CalculateEnergy()` method (the RMS equivalent) processes buffer sizes determined by the audio system, which are typically larger than 2048 samples. The SpectraBox implementation now aligns better with this approach by using a larger integration window.

## Notes

- The existing smoothing algorithms (`rmsBallasticsMultiplier`, attack/decay rates) are preserved and work in combination with the improved integration window
- This fix implements **Option 3** from the analysis: hybrid approach with 8192 FFT size plus existing smoothing
- The integration time is still slightly shorter than the industry standard 300ms, but much closer than before
- Users can easily increase to 16384 samples if they want the full 300ms+ integration time

## Testing Recommendations

1. Test with sine wave tones at known levels (-20 dB, -40 dB, etc.)
2. Compare RMS meter behavior with peak meters - RMS should be noticeably slower
3. Verify that RMS meters are 3-6 dB below peak meters for typical audio
4. Test with different audio sources (music, speech, noise) to ensure proper ballistics
5. Compare with PAM's RMS meters if possible

## Files Modified

- `public/js/spectrogram.js`
  - Added `meterFFTSize` property (line 41)
  - Updated meter analyzer configuration (lines 1135-1136)
  - Updated time domain data retrieval (lines 1324-1325)
  - Added `setMeterFFTSize()` method (lines 2646-2671)
