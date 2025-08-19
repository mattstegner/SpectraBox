const fs = require('fs');
const path = require('path');
const ConfigManager = require('../utils/configManager');

describe('ConfigManager', () => {
  let configManager;
  let testConfigPath;
  let originalConfigPath;

  beforeEach(() => {
    configManager = new ConfigManager();
    
    // Use a test-specific config file
    testConfigPath = path.join(__dirname, 'test-config.json');
    originalConfigPath = configManager.configPath;
    configManager.configPath = testConfigPath;
    
    // Clear any existing test config
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
    
    // Clear cache
    configManager.clearCache();
  });

  afterEach(() => {
    // Clean up test config file
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
    
    // Restore original config path
    configManager.configPath = originalConfigPath;
  });

  describe('loadConfig', () => {
    test('should return default config when file does not exist', async () => {
      const config = await configManager.loadConfig();
      
      expect(config).toBeDefined();
      expect(config.github).toBeDefined();
      expect(config.github.owner).toBe('mattstegner');
      expect(config.github.repository).toBe('SpectraBox');
      expect(config.update).toBeDefined();
      expect(config.update.enabled).toBe(true);
      expect(config.version).toBeDefined();
      expect(config.security).toBeDefined();
    });

    test('should load and validate config from file', async () => {
      const testConfig = {
        github: {
          owner: 'testowner',
          repository: 'testrepo',
          apiUrl: 'https://api.github.com'
        },
        update: {
          enabled: false,
          autoUpdate: true
        }
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(testConfig));

      const config = await configManager.loadConfig();
      
      expect(config.github.owner).toBe('testowner');
      expect(config.github.repository).toBe('testrepo');
      expect(config.update.enabled).toBe(false);
      expect(config.update.autoUpdate).toBe(true);
      
      // Should fill in defaults for missing values
      expect(config.version).toBeDefined();
      expect(config.security).toBeDefined();
    });

    test('should cache config for performance', async () => {
      const testConfig = { github: { owner: 'cached' } };
      fs.writeFileSync(testConfigPath, JSON.stringify(testConfig));

      const config1 = await configManager.loadConfig();
      
      // Modify file after first load
      fs.writeFileSync(testConfigPath, JSON.stringify({ github: { owner: 'modified' } }));
      
      const config2 = await configManager.loadConfig();
      
      // Should return cached version
      expect(config1.github.owner).toBe('cached');
      expect(config2.github.owner).toBe('cached');
    });

    test('should handle invalid JSON gracefully', async () => {
      fs.writeFileSync(testConfigPath, 'invalid json {');

      const config = await configManager.loadConfig();
      
      // Should return default config
      expect(config.github.owner).toBe('mattstegner');
    });
  });

  describe('validateConfig', () => {
    test('should validate GitHub configuration', () => {
      const testConfig = {
        github: {
          owner: '  testowner  ',
          repository: '  testrepo  ',
          apiUrl: 'https://api.github.com',
          rateLimitCacheTimeout: 60000
        }
      };

      const validated = configManager.validateConfig(testConfig);
      
      expect(validated.github.owner).toBe('testowner');
      expect(validated.github.repository).toBe('testrepo');
      expect(validated.github.rateLimitCacheTimeout).toBe(60000);
    });

    test('should reject invalid URLs', () => {
      const testConfig = {
        github: {
          apiUrl: 'not-a-url'
        }
      };

      const validated = configManager.validateConfig(testConfig);
      
      // Should use default URL
      expect(validated.github.apiUrl).toBe('https://api.github.com');
    });

    test('should validate update configuration', () => {
      const testConfig = {
        update: {
          enabled: false,
          checkInterval: 120000, // 2 minutes
          maxUpdateAttempts: 5,
          updateTimeout: 300000 // 5 minutes
        }
      };

      const validated = configManager.validateConfig(testConfig);
      
      expect(validated.update.enabled).toBe(false);
      expect(validated.update.checkInterval).toBe(120000);
      expect(validated.update.maxUpdateAttempts).toBe(5);
      expect(validated.update.updateTimeout).toBe(300000);
    });

    test('should reject invalid intervals and timeouts', () => {
      const testConfig = {
        update: {
          checkInterval: 30000, // Too short (< 1 minute)
          updateTimeout: 30000, // Too short (< 1 minute)
          maxUpdateAttempts: 15 // Too many (> 10)
        }
      };

      const validated = configManager.validateConfig(testConfig);
      
      // Should use defaults
      expect(validated.update.checkInterval).toBe(3600000);
      expect(validated.update.updateTimeout).toBe(600000);
      expect(validated.update.maxUpdateAttempts).toBe(3);
    });

    test('should validate security configuration', () => {
      const testConfig = {
        security: {
          validateVersionStrings: false,
          maxVersionLength: 25,
          allowedVersionPatterns: [
            '^\\d+\\.\\d+$',
            '^[a-f0-9]{7}$'
          ]
        }
      };

      const validated = configManager.validateConfig(testConfig);
      
      expect(validated.security.validateVersionStrings).toBe(false);
      expect(validated.security.maxVersionLength).toBe(25);
      expect(validated.security.allowedVersionPatterns).toHaveLength(2);
    });

    test('should filter invalid regex patterns', () => {
      const testConfig = {
        security: {
          allowedVersionPatterns: [
            '^\\d+\\.\\d+$', // Valid
            '[invalid regex', // Invalid
            '^[a-f0-9]{7}$', // Valid
            123 // Invalid type
          ]
        }
      };

      const validated = configManager.validateConfig(testConfig);
      
      expect(validated.security.allowedVersionPatterns).toHaveLength(2);
      expect(validated.security.allowedVersionPatterns).toContain('^\\d+\\.\\d+$');
      expect(validated.security.allowedVersionPatterns).toContain('^[a-f0-9]{7}$');
    });
  });

  describe('updateConfig', () => {
    test('should save validated config to file', async () => {
      const newConfig = {
        github: {
          owner: 'newowner',
          repository: 'newrepo'
        }
      };

      const success = await configManager.updateConfig(newConfig);
      
      expect(success).toBe(true);
      expect(fs.existsSync(testConfigPath)).toBe(true);
      
      const savedConfig = JSON.parse(fs.readFileSync(testConfigPath, 'utf8'));
      expect(savedConfig.github.owner).toBe('newowner');
      expect(savedConfig.github.repository).toBe('newrepo');
    });

    test('should create config directory if it does not exist', async () => {
      const nestedPath = path.join(__dirname, 'nested', 'test-config.json');
      configManager.configPath = nestedPath;

      const success = await configManager.updateConfig({ github: { owner: 'test' } });
      
      expect(success).toBe(true);
      expect(fs.existsSync(nestedPath)).toBe(true);
      
      // Clean up
      fs.unlinkSync(nestedPath);
      fs.rmdirSync(path.dirname(nestedPath));
    });
  });

  describe('getConfig', () => {
    test('should return specific config section', async () => {
      const testConfig = {
        github: { owner: 'test' },
        update: { enabled: false }
      };
      
      fs.writeFileSync(testConfigPath, JSON.stringify(testConfig));

      const githubConfig = await configManager.getConfig('github');
      const updateConfig = await configManager.getConfig('update');
      
      expect(githubConfig.owner).toBe('test');
      expect(updateConfig.enabled).toBe(false);
    });

    test('should return full config when no section specified', async () => {
      const config = await configManager.getConfig();
      
      expect(config.github).toBeDefined();
      expect(config.update).toBeDefined();
      expect(config.version).toBeDefined();
      expect(config.security).toBeDefined();
    });
  });

  describe('isValidUrl', () => {
    test('should validate HTTP and HTTPS URLs', () => {
      expect(configManager.isValidUrl('https://api.github.com')).toBe(true);
      expect(configManager.isValidUrl('http://localhost:3000')).toBe(true);
    });

    test('should reject invalid URLs', () => {
      expect(configManager.isValidUrl('not-a-url')).toBe(false);
      expect(configManager.isValidUrl('ftp://example.com')).toBe(false);
      expect(configManager.isValidUrl('')).toBe(false);
      expect(configManager.isValidUrl(null)).toBe(false);
    });
  });

  describe('clearCache', () => {
    test('should clear cached configuration', async () => {
      const testConfig = { github: { owner: 'cached' } };
      fs.writeFileSync(testConfigPath, JSON.stringify(testConfig));

      // Load config to cache it
      await configManager.loadConfig();
      
      // Clear cache
      configManager.clearCache();
      
      // Modify file
      fs.writeFileSync(testConfigPath, JSON.stringify({ github: { owner: 'modified' } }));
      
      // Should load fresh config
      const config = await configManager.loadConfig();
      expect(config.github.owner).toBe('modified');
    });
  });
});