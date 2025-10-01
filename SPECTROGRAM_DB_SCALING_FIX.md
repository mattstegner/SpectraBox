# Spectrogram dB Scaling Fix

## Overview

Fixed the spectrogram amplitude display to use accurate dB-per-pixel scaling, matching the behavior of the PAM FFT plugin. This ensures that signals appear at their correct dB positions on the vertical ruler.

## Problem

The spectrogram was using a normalized amplitude display with an `amplitudeScale` multiplier, which distorted the relationship between dB values and their vertical positions. A sine tone at -40 dB would not necessarily appear at the -40 dB mark on the vertical ruler.

## Solution

Implemented fixed dB-per-pixel scaling similar to the PAM FFT plugin:

### PAM FFT Plugin Reference

```cpp
// From fftmeter.cpp line 242
int y = -static_cast<int>((static_cast<double>(m_rectGrid.GetHeight()/70) * vAmp[i]));
```

The PAM plugin uses:

- **Fixed 70 dB range** with 10 dB grid intervals
- **Direct dB-to-pixel conversion**: `y = -(gridHeight / 70) * dB_value`
- **No amplitude scaling factor** that distorts the dB relationship

### SpectraBox Implementation

Changed from:

```javascript
const normalizedDb = (dbValue - adjustableMinDB) / dbRange;
const y = plotBottom - normalizedDb * plotHeight * amplitudeScale;
```

To:

```javascript
const dbRange = maxDB - adjustableMinDB;
const y = plotBottom - ((dbValue - adjustableMinDB) / dbRange) * plotHeight;
```

## Changes Made

### 1. File: `public/js/spectrogram.js`

#### Modified Functions:

1. **`drawSpectrumSimple()`** (lines ~1424-1427, 1451-1454)

   - Removed `amplitudeScale` multiplication from Y coordinate calculation
   - Added direct dB-to-pixel conversion for both left and right channels

2. **`drawSpectrumWithOverlapping()`** (lines ~1492-1497)

   - Removed `amplitudeScale` multiplication
   - Implemented fixed dB-per-pixel scaling for both channels
   - Maintains overlap detection accuracy

3. **`generatePixelAveragedData()`** (lines ~1692-1697)
   - Updated the optimized pixel averaging system
   - Removed `amplitudeScale` from Y coordinate calculations
   - Most important change as this is the primary rendering path

#### Documentation Updates:

- Updated `amplitudeScale` variable comment (line ~66-70)
  - Marked as **DEPRECATED**
  - Documented that it's no longer used for dB calculations
  - Kept for compatibility only

## Key Benefits

### 1. Accurate dB Display

- A -40 dB tone at 1000 Hz now appears exactly at the -40 dB mark on the vertical ruler
- The display accurately represents signal amplitude in dB

### 2. Consistent Scaling

- dB values maintain consistent positions regardless of settings
- The relationship between signal level and vertical position is linear in dB

### 3. PAM FFT Plugin Compatibility

- Uses the same scaling approach as the reference PAM FFT plugin
- Provides professional-grade amplitude accuracy

## Testing Recommendations

### Test Case 1: Single Tone Verification

1. Generate a 1000 Hz sine tone at -40 dB
2. Verify the spectrogram line appears at the -40 dB mark on the vertical ruler
3. Repeat with different frequencies (100 Hz, 5 kHz, 10 kHz)
4. Verify amplitude position remains at -40 dB across all frequencies

### Test Case 2: Multiple Amplitude Levels

1. Generate tones at different levels: -20 dB, -40 dB, -60 dB, -80 dB
2. Verify each appears at the correct dB position on the ruler
3. Check that the spacing between levels is proportional

### Test Case 3: Adjustable Range Testing

1. Set spectrogram range to -100 dB to 0 dB (default)
2. Verify -50 dB tone appears at the midpoint
3. Change range to -80 dB to 0 dB
4. Verify -40 dB tone still appears at the correct position

### Test Case 4: Calibration Offset

1. Adjust the amplitude calibration slider
2. Verify signals move by the expected dB amount
3. A +10 dB calibration should move a -40 dB tone to -30 dB position

## Technical Details

### dB-to-Pixel Calculation

```javascript
// Given:
const dbValue = -40; // Signal level in dB
const adjustableMinDB = -100; // Minimum dB on ruler
const maxDB = 0; // Maximum dB on ruler
const plotHeight = 500; // Canvas height in pixels
const plotBottom = 550; // Bottom Y coordinate

// Calculate:
const dbRange = maxDB - adjustableMinDB; // 100 dB total range
const pixelsPerDB = plotHeight / dbRange; // 5 pixels per dB
const dbFromBottom = dbValue - adjustableMinDB; // 60 dB from bottom
const pixelsFromBottom = dbFromBottom * pixelsPerDB; // 300 pixels
const y = plotBottom - pixelsFromBottom; // Y = 250 pixels

// Result: -40 dB appears at Y position 250
```

### Frequency Scaling (Unchanged)

The logarithmic frequency scaling remains unchanged:

```javascript
const x =
  plotLeft +
  (Math.log10(freq / minFreq) / Math.log10(maxFreq / minFreq)) * plotWidth;
```

This maintains the perceptually-linear frequency display where octaves are equally spaced.

## Compatibility Notes

### Deprecated Features

- **`amplitudeScale`** property: No longer affects the display
- The amplitude scale slider (if present in UI) has no effect
- Old recordings or presets with `amplitudeScale` settings will be ignored

### Backward Compatibility

- Existing code that sets `amplitudeScale` will not cause errors
- The property is maintained for compatibility but not applied
- No breaking changes to the API

## Future Considerations

### Optional Enhancements

1. **Grid Line Display**: Could add horizontal grid lines at 10 dB intervals (like PAM plugin)
2. **Configurable dB Range**: Allow users to select preset ranges (e.g., -70 dB to 0 dB, -100 dB to 0 dB)
3. **dB Reference Level**: Add option to change 0 dB reference (dBFS, dBu, dBV)

### UI Cleanup

- Remove or hide the amplitude scale slider (if visible)
- Update UI labels to clarify dB accuracy
- Add tooltips explaining dB calibration settings

## References

### PAM FFT Plugin Analysis

Source: `/Users/mstegner/Library/Mobile Documents/com~apple~CloudDocs/Code/PAM/pam/plugins/fft/`

Key files analyzed:

- `fftmeter.cpp`: Main rendering logic (lines 211-356)
- `fftmeter.h`: Class structure and constants
- `fftbuilder.cpp`: Settings management

Key scaling insights:

- 70 dB range with 10 dB grid intervals (line 126)
- Direct pixel calculation: `y = -(gridHeight / 70) * dB` (line 242)
- Logarithmic frequency axis: `x = (width / log(bins)) * log(i)` (line 241)

## Author Notes

This fix implements professional-grade dB accuracy based on established audio analysis tools. The vertical ruler now provides accurate amplitude reference for audio analysis, mixing, and mastering workflows.
