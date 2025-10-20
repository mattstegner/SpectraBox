/**
 * MidSideProcessor - Converts stereo audio between L/R and Mid-Side representations
 * 
 * Mid-Side (M/S) encoding is a stereo processing technique used in audio production and analysis.
 * It represents stereo audio as:
 * - Mid (M): The mono-compatible center content (what you hear if you sum L+R)
 * - Side (S): The stereo difference information (what makes it "wide")
 * 
 * MATHEMATICAL FOUNDATION:
 * =======================
 * 
 * Simple Mid-Side Matrix (Sum/Difference):
 * 
 * ENCODE (L,R → M,S):
 *   M = (L + R)
 *   S = (L - R)
 * 
 * DECODE (M,S → L,R):
 *   L = (M + S) / 2
 *   R = (M - S) / 2
 * 
 * WHY SIMPLE SUM/DIFFERENCE?
 * ===========================
 * 
 * This implementation uses simple sum/difference without √2 scaling:
 * 
 * 1. Advantages of simple approach:
 *    - More intuitive: M is literally L+R, S is literally L-R
 *    - Simpler to understand and implement
 *    - Clear visualization of correlation
 * 
 * 2. Amplitude characteristics:
 *    - When L=R (mono signal): M = 2×L (+6dB), S = 0
 *    - When L=-R (anti-phase): M = 0, S = 2×L (+6dB)
 *    - The +6dB increase for correlated signals is expected behavior
 * 
 * 3. Note on √2 scaling:
 *    - Some professional tools use M=(L+R)/√2, S=(L-R)/√2 for energy preservation
 *    - That approach maintains RMS levels but is less intuitive
 *    - We prioritize simplicity and direct visualization
 * 
 * PRACTICAL IMPLICATIONS:
 * =======================
 * 
 * - Mono material (L=R): Shows all energy in M channel (+6dB), S is silent
 * - Stereo material: Energy distributed between M and S based on correlation
 * - Anti-phase (L=-R): Shows all energy in S channel (+6dB), M is silent
 * - The +6dB boost for correlated content is normal and expected
 * 
 * REFERENCES:
 * ===========
 * - https://en.wikipedia.org/wiki/Joint_encoding#Mid/side_stereo_coding
 * - Basic M/S encoding used in many audio analyzers and plugins
 */

class MidSideProcessor {
  constructor() {
    /**
     * M/S encoding mode
     * - false: Simple sum/difference (M = L+R, S = L-R, +6dB for mono)
     * - true: Energy-preserving with √2 scaling (M = (L+R)/√2, S = (L-R)/√2, +3dB for mono)
     */
    this.energyPreserving = false;
    
    /**
     * Scaling constants
     */
    this.SQRT2_SCALE = Math.SQRT1_2;  // 1/√2 ≈ 0.7071... for energy-preserving mode
    this.SIMPLE_DECODE_SCALE = 0.5;   // 1/2 for simple sum/difference decoding
    
    /**
     * Denormal threshold for floating-point stability
     * 
     * Denormal (subnormal) numbers are very small floating-point values that can
     * cause performance issues on some CPUs. We clamp values below this threshold
     * to zero to prevent denormal processing overhead.
     * 
     * Threshold chosen as 1e-15 provides good balance:
     * - Small enough to preserve audio dynamics (below -300 dBFS)
     * - Large enough to eliminate most denormal values
     */
    this.DENORMAL_THRESHOLD = 1e-15;
  }
  
  /**
   * Set the M/S encoding mode
   * 
   * @param {boolean} useEnergyPreserving - If true, use √2 scaling (energy-preserving).
   *                                         If false, use simple sum/difference.
   */
  setEnergyPreserving(useEnergyPreserving) {
    this.energyPreserving = useEnergyPreserving;
  }
  
  /**
   * Encode stereo L/R channels to Mid-Side representation
   * 
   * This function takes left and right channel time-domain audio data and
   * converts it to Mid (mono sum) and Side (stereo difference) representation.
   * 
   * @param {Float32Array} leftData - Left channel samples (-1.0 to +1.0 range)
   * @param {Float32Array} rightData - Right channel samples (-1.0 to +1.0 range)
   * @returns {{mid: Float32Array, side: Float32Array}} Encoded M/S data
   * 
   * @example
   * const processor = new MidSideProcessor();
   * const ms = processor.encodeMidSide(leftSamples, rightSamples);
   * // Use ms.mid for center content, ms.side for stereo width
   */
  encodeMidSide(leftData, rightData) {
    // Validate inputs
    if (!leftData || !rightData) {
      throw new Error('MidSideProcessor: Both left and right data arrays are required');
    }
    
    if (leftData.length !== rightData.length) {
      throw new Error('MidSideProcessor: Left and right arrays must have the same length');
    }
    
    const length = leftData.length;
    const mid = new Float32Array(length);
    const side = new Float32Array(length);
    
    // Apply M/S matrix to each sample
    if (this.energyPreserving) {
      // Energy-preserving mode: M = (L+R)/√2, S = (L-R)/√2
      for (let i = 0; i < length; i++) {
        const L = leftData[i];
        const R = rightData[i];
        
        mid[i] = (L + R) * this.SQRT2_SCALE;
        side[i] = (L - R) * this.SQRT2_SCALE;
        
        // Denormal protection
        if (Math.abs(mid[i]) < this.DENORMAL_THRESHOLD) {
          mid[i] = 0.0;
        }
        if (Math.abs(side[i]) < this.DENORMAL_THRESHOLD) {
          side[i] = 0.0;
        }
      }
    } else {
      // Simple sum/difference mode: M = L+R, S = L-R
      for (let i = 0; i < length; i++) {
        const L = leftData[i];
        const R = rightData[i];
        
        mid[i] = L + R;
        side[i] = L - R;
        
        // Denormal protection: clamp very small values to zero
        // This prevents CPU performance issues with subnormal float values
        if (Math.abs(mid[i]) < this.DENORMAL_THRESHOLD) {
          mid[i] = 0.0;
        }
        if (Math.abs(side[i]) < this.DENORMAL_THRESHOLD) {
          side[i] = 0.0;
        }
      }
    }
    
    return { mid, side };
  }
  
  /**
   * Decode Mid-Side representation back to stereo L/R channels
   * 
   * This function is the inverse of encodeMidSide() and is provided mainly for
   * testing round-trip accuracy. In typical use, we don't decode back to L/R
   * because we're analyzing the M/S representation directly.
   * 
   * @param {Float32Array} midData - Mid channel samples
   * @param {Float32Array} sideData - Side channel samples
   * @returns {{left: Float32Array, right: Float32Array}} Decoded stereo data
   * 
   * @example
   * const processor = new MidSideProcessor();
   * const ms = processor.encodeMidSide(leftSamples, rightSamples);
   * const stereo = processor.decodeMidSide(ms.mid, ms.side);
   * // stereo.left and stereo.right should match original within floating-point precision
   */
  decodeMidSide(midData, sideData) {
    // Validate inputs
    if (!midData || !sideData) {
      throw new Error('MidSideProcessor: Both mid and side data arrays are required');
    }
    
    if (midData.length !== sideData.length) {
      throw new Error('MidSideProcessor: Mid and side arrays must have the same length');
    }
    
    const length = midData.length;
    const left = new Float32Array(length);
    const right = new Float32Array(length);
    
    // Apply inverse M/S matrix to each sample
    if (this.energyPreserving) {
      // Energy-preserving mode: L = (M+S)/√2, R = (M-S)/√2
      for (let i = 0; i < length; i++) {
        const M = midData[i];
        const S = sideData[i];
        
        left[i] = (M + S) * this.SQRT2_SCALE;
        right[i] = (M - S) * this.SQRT2_SCALE;
        
        // Denormal protection
        if (Math.abs(left[i]) < this.DENORMAL_THRESHOLD) {
          left[i] = 0.0;
        }
        if (Math.abs(right[i]) < this.DENORMAL_THRESHOLD) {
          right[i] = 0.0;
        }
      }
    } else {
      // Simple sum/difference mode: L = (M+S)/2, R = (M-S)/2
      for (let i = 0; i < length; i++) {
        const M = midData[i];
        const S = sideData[i];
        
        left[i] = (M + S) * this.SIMPLE_DECODE_SCALE;
        right[i] = (M - S) * this.SIMPLE_DECODE_SCALE;
        
        // Denormal protection
        if (Math.abs(left[i]) < this.DENORMAL_THRESHOLD) {
          left[i] = 0.0;
        }
        if (Math.abs(right[i]) < this.DENORMAL_THRESHOLD) {
          right[i] = 0.0;
        }
      }
    }
    
    return { left, right };
  }
  
  /**
   * Calculate RMS (Root Mean Square) level of an audio buffer
   * 
   * Utility function for testing and validation. RMS represents the average
   * energy content of a signal and is useful for verifying energy preservation
   * in M/S encoding/decoding.
   * 
   * @param {Float32Array} data - Audio samples
   * @returns {number} RMS level (linear scale, not dB)
   * 
   * @example
   * const rms = processor.calculateRMS(audioData);
   * const rmsDB = 20 * Math.log10(rms);  // Convert to dBFS
   */
  calculateRMS(data) {
    if (!data || data.length === 0) {
      return 0;
    }
    
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
      sumSquares += data[i] * data[i];
    }
    
    return Math.sqrt(sumSquares / data.length);
  }
  
  /**
   * Verify round-trip accuracy of M/S encoding/decoding
   * 
   * Utility function for testing. Encodes L/R to M/S and then decodes back,
   * checking that the recovered L/R matches the original within floating-point
   * precision.
   * 
   * @param {Float32Array} leftData - Original left channel
   * @param {Float32Array} rightData - Original right channel
   * @param {number} [maxError=1e-6] - Maximum acceptable absolute error
   * @returns {{passed: boolean, maxError: number, avgError: number}} Test results
   */
  verifyRoundTrip(leftData, rightData, maxError = 1e-6) {
    // Encode to M/S
    const { mid, side } = this.encodeMidSide(leftData, rightData);
    
    // Decode back to L/R
    const { left: leftRecovered, right: rightRecovered } = this.decodeMidSide(mid, side);
    
    // Calculate errors
    let maxErrorFound = 0;
    let sumError = 0;
    
    for (let i = 0; i < leftData.length; i++) {
      const errorL = Math.abs(leftRecovered[i] - leftData[i]);
      const errorR = Math.abs(rightRecovered[i] - rightData[i]);
      
      maxErrorFound = Math.max(maxErrorFound, errorL, errorR);
      sumError += errorL + errorR;
    }
    
    const avgError = sumError / (leftData.length * 2);
    const passed = maxErrorFound < maxError;
    
    return {
      passed,
      maxError: maxErrorFound,
      avgError
    };
  }
}

// Export for use in other modules
// Note: Using vanilla JS class pattern for browser compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MidSideProcessor;
}

