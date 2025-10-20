# Changelog

All notable changes to SpectraBox will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-10-20

### Added

- **Mid-Side (M/S) Processing Mode**
  - Toggle button at bottom-left of display for switching between Stereo (ST) and Mid-Side (MS) modes
  - Two encoding modes selectable in Meters tab:
    - Simple sum/difference (default, +6dB for mono, intuitive)
    - Energy-preserving √2 scaling (+3dB for mono, accurate metering)
  - Spectrogram displays Mid (replacing Left) and Side (replacing Right) traces in MS mode
  - Meters automatically update labels: PK M/RMS M and PK S/RMS S in MS mode
  - Legend labels dynamically update between Left/Right and Mid/Side
  - Toggle automatically disabled for mono inputs with tooltip explanation
  - Settings persist across sessions
  - Comprehensive unit tests for M/S processor (33 tests)
  - Full documentation in README
- **MidSideProcessor Module**
  - Standalone JavaScript module for Mid-Side encoding/decoding
  - Dual-mode implementation: simple sum/difference and energy-preserving √2 scaling
  - Round-trip accuracy verification for both modes
  - Denormal number handling for CPU performance
  - Extensive inline documentation explaining M/S mathematics
  - Utility functions for RMS calculation and round-trip testing

### Technical Details

- M/S encoding applied to both time-domain (meters) and frequency-domain (spectrogram) data
- Two selectable encoding modes:
  - Simple mode: `M = L + R`, `S = L - R` (+6dB for mono, intuitive)
  - Energy-preserving mode: `M = (L + R) / √2`, `S = (L - R) / √2` (+3dB for mono, accurate metering)
- Mode selection persists across sessions
- Minimal CPU overhead (<1% for typical audio buffers)

### Testing

- 33 comprehensive unit tests covering:
  - Round-trip accuracy (max error < 1e-6) for both modes
  - Amplitude behavior (simple vs energy-preserving)
  - Known test tones validation
  - Edge cases (denormals, all-zeros, max amplitude)
  - Energy-preserving mode switching and correctness
  - Performance benchmarks

## Earlier Versions

See git history for changes prior to this changelog.
