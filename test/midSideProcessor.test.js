/**
 * MidSideProcessor Unit Tests
 * 
 * Tests for the Mid-Side (M/S) audio processing module.
 * Validates encoding/decoding accuracy, energy preservation, and edge cases.
 */

const MidSideProcessor = require('../public/js/midSideProcessor.js');

describe('MidSideProcessor', () => {
  let processor;
  
  beforeEach(() => {
    processor = new MidSideProcessor();
  });
  
  // ===================================================================
  // BASIC FUNCTIONALITY TESTS
  // ===================================================================
  
  describe('Constructor and Constants', () => {
    test('should initialize with correct scaling constants', () => {
      expect(processor.SIMPLE_DECODE_SCALE).toBe(0.5);
      expect(processor.SQRT2_SCALE).toBeCloseTo(Math.SQRT1_2, 10);
    });
    
    test('should initialize with denormal threshold', () => {
      expect(processor.DENORMAL_THRESHOLD).toBe(1e-15);
    });
    
    test('should default to simple sum/difference mode', () => {
      expect(processor.energyPreserving).toBe(false);
    });
  });
  
  // ===================================================================
  // INPUT VALIDATION TESTS
  // ===================================================================
  
  describe('Input Validation', () => {
    test('should throw error when left data is null', () => {
      const rightData = new Float32Array([0.5, 0.5]);
      expect(() => processor.encodeMidSide(null, rightData)).toThrow();
    });
    
    test('should throw error when right data is null', () => {
      const leftData = new Float32Array([0.5, 0.5]);
      expect(() => processor.encodeMidSide(leftData, null)).toThrow();
    });
    
    test('should throw error when arrays have different lengths', () => {
      const leftData = new Float32Array([0.5, 0.5]);
      const rightData = new Float32Array([0.5]);
      expect(() => processor.encodeMidSide(leftData, rightData)).toThrow();
    });
    
    test('should throw error when decoding with null mid data', () => {
      const sideData = new Float32Array([0.5, 0.5]);
      expect(() => processor.decodeMidSide(null, sideData)).toThrow();
    });
    
    test('should throw error when decoding with null side data', () => {
      const midData = new Float32Array([0.5, 0.5]);
      expect(() => processor.decodeMidSide(midData, null)).toThrow();
    });
    
    test('should throw error when decoding arrays have different lengths', () => {
      const midData = new Float32Array([0.5, 0.5]);
      const sideData = new Float32Array([0.5]);
      expect(() => processor.decodeMidSide(midData, sideData)).toThrow();
    });
  });
  
  // ===================================================================
  // ROUND-TRIP ACCURACY TESTS
  // ===================================================================
  
  describe('Round-Trip Accuracy', () => {
    test('should accurately round-trip mono signal (L=R)', () => {
      const leftData = new Float32Array([0.5, 0.3, 0.7, -0.2, 0.0]);
      const rightData = new Float32Array([0.5, 0.3, 0.7, -0.2, 0.0]);
      
      const { mid, side } = processor.encodeMidSide(leftData, rightData);
      const { left: leftRecovered, right: rightRecovered } = processor.decodeMidSide(mid, side);
      
      // Check each sample
      for (let i = 0; i < leftData.length; i++) {
        expect(leftRecovered[i]).toBeCloseTo(leftData[i], 6);
        expect(rightRecovered[i]).toBeCloseTo(rightData[i], 6);
      }
    });
    
    test('should accurately round-trip stereo signal', () => {
      const leftData = new Float32Array([0.8, 0.5, -0.3, 0.0, 0.6]);
      const rightData = new Float32Array([0.4, 0.2, 0.1, -0.5, 0.3]);
      
      const { mid, side } = processor.encodeMidSide(leftData, rightData);
      const { left: leftRecovered, right: rightRecovered } = processor.decodeMidSide(mid, side);
      
      for (let i = 0; i < leftData.length; i++) {
        expect(leftRecovered[i]).toBeCloseTo(leftData[i], 6);
        expect(rightRecovered[i]).toBeCloseTo(rightData[i], 6);
      }
    });
    
    test('should accurately round-trip anti-phase signal (L=-R)', () => {
      const leftData = new Float32Array([0.5, -0.3, 0.7, 0.2, -0.4]);
      const rightData = new Float32Array([-0.5, 0.3, -0.7, -0.2, 0.4]);
      
      const { mid, side } = processor.encodeMidSide(leftData, rightData);
      const { left: leftRecovered, right: rightRecovered } = processor.decodeMidSide(mid, side);
      
      for (let i = 0; i < leftData.length; i++) {
        expect(leftRecovered[i]).toBeCloseTo(leftData[i], 6);
        expect(rightRecovered[i]).toBeCloseTo(rightData[i], 6);
      }
    });
    
    test('should have maximum error below 1e-6 for round-trip', () => {
      const leftData = new Float32Array(1024);
      const rightData = new Float32Array(1024);
      
      // Generate pseudo-random audio data
      for (let i = 0; i < 1024; i++) {
        leftData[i] = Math.sin(i * 0.1) * 0.8;
        rightData[i] = Math.cos(i * 0.15) * 0.6;
      }
      
      const result = processor.verifyRoundTrip(leftData, rightData, 1e-6);
      
      expect(result.passed).toBe(true);
      expect(result.maxError).toBeLessThan(1e-6);
    });
    
    test('should handle full-scale signals without clipping', () => {
      const leftData = new Float32Array([1.0, -1.0, 0.99, -0.99]);
      const rightData = new Float32Array([1.0, -1.0, -0.99, 0.99]);
      
      const { mid, side } = processor.encodeMidSide(leftData, rightData);
      const { left: leftRecovered, right: rightRecovered } = processor.decodeMidSide(mid, side);
      
      for (let i = 0; i < leftData.length; i++) {
        expect(leftRecovered[i]).toBeCloseTo(leftData[i], 6);
        expect(rightRecovered[i]).toBeCloseTo(rightData[i], 6);
      }
    });
  });
  
  // ===================================================================
  // ENERGY PRESERVATION TESTS
  // ===================================================================
  
  describe('Amplitude Behavior', () => {
    test('should double amplitude for mono signal (L=R)', () => {
      // When L=R, Mid should have 2× the RMS of L, Side should be near zero
      // Theory: M = L+R = 2L, so RMS(M) = RMS(L) × 2 (+6dB)
      const leftData = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        leftData[i] = Math.sin(i * 0.1) * 0.5;
      }
      const rightData = new Float32Array(leftData); // Copy - mono signal
      
      const rmsLeft = processor.calculateRMS(leftData);
      const rmsRight = processor.calculateRMS(rightData);
      
      const { mid, side } = processor.encodeMidSide(leftData, rightData);
      const rmsMid = processor.calculateRMS(mid);
      const rmsSide = processor.calculateRMS(side);
      
      // Mid should have 2× the RMS of original (+6dB)
      expect(rmsMid).toBeCloseTo(rmsLeft * 2, 6);
      expect(rmsMid).toBeCloseTo(rmsRight * 2, 6);
      
      // Side should be very close to zero (within floating-point precision)
      expect(rmsSide).toBeLessThan(1e-10);
    });
    
    test('should have expected energy relationship for stereo signal', () => {
      const leftData = new Float32Array(1024);
      const rightData = new Float32Array(1024);
      
      // Generate uncorrelated stereo signals
      for (let i = 0; i < 1024; i++) {
        leftData[i] = Math.sin(i * 0.1) * 0.5;
        rightData[i] = Math.cos(i * 0.13) * 0.4;
      }
      
      const rmsLeft = processor.calculateRMS(leftData);
      const rmsRight = processor.calculateRMS(rightData);
      const energyLR = rmsLeft * rmsLeft + rmsRight * rmsRight;
      
      const { mid, side } = processor.encodeMidSide(leftData, rightData);
      const rmsMid = processor.calculateRMS(mid);
      const rmsSide = processor.calculateRMS(side);
      const energyMS = rmsMid * rmsMid + rmsSide * rmsSide;
      
      // With simple sum/diff, M/S energy is approximately 2× L/R energy for uncorrelated signals
      // This is expected behavior - we're not preserving energy, just doing sum/diff
      expect(energyMS).toBeGreaterThan(energyLR);
      expect(energyMS / energyLR).toBeCloseTo(2, 0.5); // Roughly 2× energy
    });
    
    test('should double amplitude for anti-phase signal (L=-R)', () => {
      // When L=-R, Side should have 2× the RMS of L, Mid should be near zero
      // Theory: S = L-R = L-(-L) = 2L, so RMS(S) = RMS(L) × 2 (+6dB)
      const leftData = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        leftData[i] = Math.sin(i * 0.1) * 0.5;
      }
      const rightData = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        rightData[i] = -leftData[i]; // Anti-phase
      }
      
      const rmsLeft = processor.calculateRMS(leftData);
      
      const { mid, side } = processor.encodeMidSide(leftData, rightData);
      const rmsMid = processor.calculateRMS(mid);
      const rmsSide = processor.calculateRMS(side);
      
      // Side should have 2× the RMS of original (+6dB)
      expect(rmsSide).toBeCloseTo(rmsLeft * 2, 6);
      
      // Mid should be very close to zero
      expect(rmsMid).toBeLessThan(1e-10);
    });
  });
  
  // ===================================================================
  // KNOWN TEST TONE TESTS
  // ===================================================================
  
  describe('Known Test Tones', () => {
    test('should correctly process L=signal, R=silence', () => {
      // Generate -12 dBFS test tone (amplitude ≈ 0.251)
      const amplitude = Math.pow(10, -12 / 20); // -12 dBFS
      const leftData = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        leftData[i] = amplitude * Math.sin(i * 0.1); // 1kHz-ish at 44.1kHz
      }
      const rightData = new Float32Array(1024); // Silent
      
      const { mid, side } = processor.encodeMidSide(leftData, rightData);
      
      // Calculate RMS levels
      const rmsLeft = processor.calculateRMS(leftData);
      const rmsMid = processor.calculateRMS(mid);
      const rmsSide = processor.calculateRMS(side);
      
      // Convert to dB
      const dbLeft = 20 * Math.log10(rmsLeft);
      const dbMid = 20 * Math.log10(rmsMid);
      const dbSide = 20 * Math.log10(rmsSide);
      
      // Theory: When L has signal and R is silent:
      // M = L, S = L (simple sum/diff with one channel silent)
      // Both should match L exactly (0 dB relative to L)
      expect(dbMid).toBeCloseTo(dbLeft, 0.2);
      expect(dbSide).toBeCloseTo(dbLeft, 0.2);
    });
    
    test('should correctly process L=R (mono signal)', () => {
      // Generate -12 dBFS mono signal
      const amplitude = Math.pow(10, -12 / 20);
      const leftData = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        leftData[i] = amplitude * Math.sin(i * 0.1);
      }
      const rightData = new Float32Array(leftData); // Same as left
      
      const { mid, side } = processor.encodeMidSide(leftData, rightData);
      
      const rmsLeft = processor.calculateRMS(leftData);
      const rmsMid = processor.calculateRMS(mid);
      const rmsSide = processor.calculateRMS(side);
      
      const dbLeft = 20 * Math.log10(rmsLeft);
      const dbMid = 20 * Math.log10(rmsMid);
      
      // Theory: When L=R (mono):
      // M = L+R = 2L
      // RMS(M) = RMS(L) × 2, which is +6dB
      // S = L-R = 0
      
      // Mid should be +6dB relative to original
      expect(rmsMid).toBeCloseTo(rmsLeft * 2, 6);
      expect(dbMid).toBeCloseTo(dbLeft + 6.0, 0.2);
      
      // Side should be essentially zero
      expect(rmsSide).toBeLessThan(1e-10);
    });
  });
  
  // ===================================================================
  // EDGE CASE TESTS
  // ===================================================================
  
  describe('Edge Cases', () => {
    test('should handle all-zero input', () => {
      const leftData = new Float32Array(512);
      const rightData = new Float32Array(512);
      // All zeros by default
      
      const { mid, side } = processor.encodeMidSide(leftData, rightData);
      
      // Output should also be all zeros
      for (let i = 0; i < 512; i++) {
        expect(mid[i]).toBe(0);
        expect(side[i]).toBe(0);
      }
    });
    
    test('should handle denormal (very small) values', () => {
      const leftData = new Float32Array([1e-16, 1e-17, 1e-18, 1e-20]);
      const rightData = new Float32Array([1e-16, 1e-17, 1e-18, 1e-20]);
      
      const { mid, side } = processor.encodeMidSide(leftData, rightData);
      
      // Values below denormal threshold should be clamped to zero
      for (let i = 0; i < 4; i++) {
        expect(mid[i]).toBe(0);
        expect(side[i]).toBe(0);
      }
    });
    
    test('should handle maximum amplitude signals', () => {
      const leftData = new Float32Array([1.0, -1.0, 1.0, -1.0]);
      const rightData = new Float32Array([1.0, -1.0, 1.0, -1.0]);
      
      const { mid, side } = processor.encodeMidSide(leftData, rightData);
      
      // With simple sum/diff: M = L+R, S = L-R
      // When L=R=1.0: M = 2.0, S = 0 (expected +6dB for correlated signals)
      expect(Math.abs(mid[0])).toBeCloseTo(2.0, 5);  // L=R=1.0 → M=2.0
      expect(Math.abs(mid[1])).toBeCloseTo(2.0, 5);  // L=R=-1.0 → M=-2.0
      expect(Math.abs(mid[2])).toBeCloseTo(2.0, 5);  // L=R=1.0 → M=2.0
      expect(Math.abs(mid[3])).toBeCloseTo(2.0, 5);  // L=R=-1.0 → M=-2.0
      
      // When L=R, Side should be near zero
      for (let i = 0; i < 4; i++) {
        expect(Math.abs(side[i])).toBeLessThan(0.01);
      }
    });
    
    test('should handle single sample', () => {
      const leftData = new Float32Array([0.5]);
      const rightData = new Float32Array([0.3]);
      
      const { mid, side } = processor.encodeMidSide(leftData, rightData);
      const { left: leftRecovered, right: rightRecovered } = processor.decodeMidSide(mid, side);
      
      expect(leftRecovered[0]).toBeCloseTo(0.5, 6);
      expect(rightRecovered[0]).toBeCloseTo(0.3, 6);
    });
    
    test('should handle large buffer (8192 samples)', () => {
      const leftData = new Float32Array(8192);
      const rightData = new Float32Array(8192);
      
      // Generate realistic audio data
      for (let i = 0; i < 8192; i++) {
        leftData[i] = Math.sin(i * 0.05) * 0.7 + Math.sin(i * 0.13) * 0.3;
        rightData[i] = Math.cos(i * 0.07) * 0.6 + Math.cos(i * 0.11) * 0.2;
      }
      
      const { mid, side } = processor.encodeMidSide(leftData, rightData);
      const { left: leftRecovered, right: rightRecovered } = processor.decodeMidSide(mid, side);
      
      // Verify round-trip accuracy for large buffer
      let maxError = 0;
      for (let i = 0; i < 8192; i++) {
        maxError = Math.max(
          maxError,
          Math.abs(leftRecovered[i] - leftData[i]),
          Math.abs(rightRecovered[i] - rightData[i])
        );
      }
      
      expect(maxError).toBeLessThan(1e-6);
    });
  });
  
  // ===================================================================
  // UTILITY FUNCTION TESTS
  // ===================================================================
  
  describe('Utility Functions', () => {
    test('calculateRMS should return correct RMS value', () => {
      const data = new Float32Array([0.5, 0.5, 0.5, 0.5]);
      const rms = processor.calculateRMS(data);
      expect(rms).toBeCloseTo(0.5, 6);
    });
    
    test('calculateRMS should handle empty array', () => {
      const data = new Float32Array(0);
      const rms = processor.calculateRMS(data);
      expect(rms).toBe(0);
    });
    
    test('calculateRMS should handle null input', () => {
      const rms = processor.calculateRMS(null);
      expect(rms).toBe(0);
    });
    
    test('verifyRoundTrip should return test results', () => {
      const leftData = new Float32Array([0.5, 0.3, 0.7]);
      const rightData = new Float32Array([0.4, 0.2, 0.6]);
      
      const result = processor.verifyRoundTrip(leftData, rightData);
      
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('maxError');
      expect(result).toHaveProperty('avgError');
      expect(result.passed).toBe(true);
    });
  });
  
  // ===================================================================
  // PERFORMANCE TESTS
  // ===================================================================
  
  describe('Performance', () => {
    test('should process 8192 samples in reasonable time', () => {
      const leftData = new Float32Array(8192);
      const rightData = new Float32Array(8192);
      
      for (let i = 0; i < 8192; i++) {
        leftData[i] = Math.random() * 2 - 1;
        rightData[i] = Math.random() * 2 - 1;
      }
      
      const startTime = performance.now();
      
      for (let iteration = 0; iteration < 100; iteration++) {
        processor.encodeMidSide(leftData, rightData);
      }
      
      const endTime = performance.now();
      const avgTime = (endTime - startTime) / 100;
      
      // Should process each buffer in less than 2ms on average (well within realtime requirements)
      // At 44.1kHz, 8192 samples = ~185ms, so <2ms processing is < 1% CPU overhead
      expect(avgTime).toBeLessThan(2.0);
    });
  });
  
  // ===================================================================
  // ENERGY-PRESERVING MODE TESTS
  // ===================================================================
  
  describe('Energy-Preserving Mode', () => {
    test('should switch to energy-preserving mode', () => {
      processor.setEnergyPreserving(true);
      expect(processor.energyPreserving).toBe(true);
      
      processor.setEnergyPreserving(false);
      expect(processor.energyPreserving).toBe(false);
    });
    
    test('should use √2 scaling in energy-preserving mode for mono signal', () => {
      processor.setEnergyPreserving(true);
      
      const leftData = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        leftData[i] = Math.sin(i * 0.1) * 0.5;
      }
      const rightData = new Float32Array(leftData); // Mono signal
      
      const { mid, side } = processor.encodeMidSide(leftData, rightData);
      
      const rmsLeft = processor.calculateRMS(leftData);
      const rmsMid = processor.calculateRMS(mid);
      const rmsSide = processor.calculateRMS(side);
      
      // In energy-preserving mode: M = (L+R)/√2 = 2L/√2 = L√2
      // So RMS(M) = RMS(L) × √2 (+3dB)
      expect(rmsMid).toBeCloseTo(rmsLeft * Math.sqrt(2), 6);
      expect(rmsSide).toBeLessThan(1e-10);
    });
    
    test('should maintain round-trip accuracy in energy-preserving mode', () => {
      processor.setEnergyPreserving(true);
      
      const leftData = new Float32Array(1024);
      const rightData = new Float32Array(1024);
      
      for (let i = 0; i < 1024; i++) {
        leftData[i] = Math.sin(i * 0.1) * 0.5;
        rightData[i] = Math.cos(i * 0.13) * 0.4;
      }
      
      const { mid, side } = processor.encodeMidSide(leftData, rightData);
      const { left, right } = processor.decodeMidSide(mid, side);
      
      let maxError = 0;
      for (let i = 0; i < 1024; i++) {
        maxError = Math.max(maxError, Math.abs(left[i] - leftData[i]));
        maxError = Math.max(maxError, Math.abs(right[i] - rightData[i]));
      }
      
      expect(maxError).toBeLessThan(1e-6);
    });
    
    test('should produce different results in energy-preserving vs simple mode', () => {
      const leftData = new Float32Array([1.0]);
      const rightData = new Float32Array([1.0]);
      
      // Simple mode
      processor.setEnergyPreserving(false);
      const simple = processor.encodeMidSide(leftData, rightData);
      
      // Energy-preserving mode
      processor.setEnergyPreserving(true);
      const energyPreserving = processor.encodeMidSide(leftData, rightData);
      
      // Simple: M = L+R = 2.0
      expect(simple.mid[0]).toBeCloseTo(2.0, 5);
      
      // Energy-preserving: M = (L+R)/√2 = 2/√2 ≈ 1.414
      expect(energyPreserving.mid[0]).toBeCloseTo(Math.sqrt(2), 5);
      
      // They should be different
      expect(simple.mid[0]).not.toBeCloseTo(energyPreserving.mid[0], 1);
    });
  });
});

