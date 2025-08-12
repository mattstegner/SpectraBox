/**
 * Integration tests for spectrum analyzer and backend API
 */

const request = require('supertest');
const app = require('../server');

describe('Spectrum Analyzer Integration', () => {
  describe('Static File Serving', () => {
    test('should serve main HTML page', async () => {
      const response = await request(app).get('/');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/html/);
      expect(response.text).toContain('Pi Audio Kiosk - Spectrum Analyzer');
      expect(response.text).toContain('spectrum-analyzer.js');
      expect(response.text).toContain('meters.js');
    });

    test('should serve spectrum analyzer JavaScript', async () => {
      const response = await request(app).get('/js/spectrum-analyzer.js');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/javascript/);
      expect(response.text).toContain('SpectrumAnalyzer');
      expect(response.text).toContain('/api/audio-devices');
      expect(response.text).toContain('/api/preferences');
    });

    test('should serve meters JavaScript', async () => {
      const response = await request(app).get('/js/meters.js');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/javascript/);
      expect(response.text).toContain('AudioMeters');
    });

    test('should serve CSS styles', async () => {
      const response = await request(app).get('/css/styles.css');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/css/);
      expect(response.text).toContain('Pi Audio Kiosk Styles');
    });
  });

  describe('API Integration', () => {
    test('should provide audio devices for spectrum analyzer', async () => {
      const response = await request(app).get('/api/audio-devices');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.devices)).toBe(true);
      expect(typeof response.body.count).toBe('number');
      
      // Verify device structure matches what frontend expects
      if (response.body.devices.length > 0) {
        const device = response.body.devices[0];
        expect(device).toHaveProperty('id');
        expect(device).toHaveProperty('name');
        expect(device).toHaveProperty('isDefault');
        expect(device).toHaveProperty('type');
      }
    });

    test('should provide preferences for spectrum analyzer', async () => {
      const response = await request(app).get('/api/preferences');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.preferences).toHaveProperty('selectedAudioDevice');
      expect(response.body.preferences).toHaveProperty('audioSettings');
      expect(response.body.preferences.audioSettings).toHaveProperty('sampleRate');
      expect(response.body.preferences.audioSettings).toHaveProperty('bufferSize');
    });

    test('should accept preference updates from spectrum analyzer', async () => {
      const testPreferences = {
        selectedAudioDevice: 'test-device-123',
        audioSettings: {
          sampleRate: 44100,
          bufferSize: 1024,
          gain: 1.0
        },
        uiSettings: {
          theme: 'dark',
          autoStart: true,
          fullscreen: false
        },
        systemSettings: {
          port: 3000,
          host: '0.0.0.0'
        }
      };

      const response = await request(app)
        .post('/api/preferences')
        .send({ preferences: testPreferences });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.preferences.selectedAudioDevice).toBe('test-device-123');
    });
  });

  describe('Error Handling', () => {
    test('should handle 404 for non-existent static files', async () => {
      const response = await request(app).get('/js/non-existent.js');
      expect(response.status).toBe(404);
    });

    test('should handle API errors gracefully', async () => {
      const response = await request(app).get('/api/non-existent');
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('CORS and Headers', () => {
    test('should include CORS headers for API requests', async () => {
      const response = await request(app).get('/api/audio-devices');
      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });

    test('should serve static files with appropriate content types', async () => {
      const htmlResponse = await request(app).get('/');
      expect(htmlResponse.headers['content-type']).toMatch(/text\/html/);

      const jsResponse = await request(app).get('/js/spectrum-analyzer.js');
      expect(jsResponse.headers['content-type']).toMatch(/application\/javascript/);

      const cssResponse = await request(app).get('/css/styles.css');
      expect(cssResponse.headers['content-type']).toMatch(/text\/css/);
    });
  });
});