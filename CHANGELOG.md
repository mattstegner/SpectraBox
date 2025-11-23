# Changelog

All notable changes to SpectraBox will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2025-11-23

### Added

- **Component Architecture**
  - Created 6 new JavaScript component classes for better code encapsulation
  - `LegendComponent` - Manages channel legend display and mode switching
  - `AudioDeviceComponent` - Handles audio device selection UI
  - `NetworkInfoComponent` - Displays network status and configuration
  - `SettingsPanelComponent` - Manages settings panel tabs and visibility
  - `UpdateNotificationComponent` - Handles update notification overlay
  - Components stored in `window.components` object for global access
  
- **Template System**
  - New `Templates` utility module with reusable template functions
  - Template methods: `slider()`, `select()`, `toggle()`, `button()`, `statusCard()`, `configItem()`
  - Modernized HTML generation using template literals
  - Cleaner, more maintainable code for dynamic content

- **CSS Organization**
  - Extracted inline styles to 5 separate, organized CSS files
  - `main.css` - Base styles, body, canvas, legend
  - `components.css` - Buttons, settings panel, tabs, form controls
  - `meters.css` - Update status, progress bars, network/config displays
  - `animations.css` - Keyframes and animation definitions
  - `responsive.css` - Media queries for different screen sizes

### Changed

- **Code Organization**
  - Separated concerns: CSS, HTML structure, and JavaScript logic
  - Reduced `index.html` from 1,573 to 553 lines (~65% reduction)
  - Replaced ~1,027 lines of inline styles with organized CSS files
  - Created logical file structure with `components/` and `utils/` directories

- **Maintainability Improvements**
  - Each component manages its own state and DOM section
  - Better separation of concerns throughout codebase
  - Easier to locate and modify specific UI elements
  - Consistent architectural patterns across all components

### Technical Details

- Zero framework overhead - pure vanilla JavaScript components
- 100% backward compatibility maintained with fallback implementations
- No performance impact - same direct DOM manipulation
- Better browser caching with separate CSS files
- Foundation for future enhancements (Web Components, TypeScript, etc.)

### Performance

- No performance degradation - maintains 30 FPS on Raspberry Pi
- Better caching efficiency with separate CSS files
- Lazy component initialization only when needed

### Developer Experience

- Improved code navigation with clear file structure
- Components can be tested independently
- Reusable templates and components
- Better documentation through code organization
- Easier onboarding for new contributors

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
