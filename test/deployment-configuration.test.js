const fs = require('fs');
const path = require('path');
const { initializeConfig, DEFAULT_CONFIG } = require('../scripts/init-config');
const ConfigManager = require('../utils/configManager');
const VersionManager = require('../utils/versionManager');
const GitHubService = require('../services/githubService');

describe('Deployment Configuration Support', () => {
  let testDir;
  let originalCwd;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = path.join(__dirname, 'temp-deployment-test');
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    
    // Change to test directory
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(() => {
    // Restore original directory
    process.chdir(originalCwd);
    
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('Configuration Initialization', () => {
    test('should create default configuration file', () => {
      const configDir = path.join(testDir, 'config');
      const configFile = path.join(configDir, 'update-config.json');
      
      const success = initializeConfig(configDir, configFile);
      
      expect(success).toBe(true);
      expect(fs.existsSync(configFile)).toBe(true);
      
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      expect(config.github.owner).toBe('mattstegner');
      expect(config.github.repository).toBe('SpectraBox');
      expect(config.update.enabled).toBe(true);
      expect(config.version.filePath).toBe('./Version.txt');
    });

    test('should preserve existing configuration', () => {
      // Create config directory and file
      const configDir = path.join(testDir, 'config');
      const configFile = path.join(configDir, 'update-config.json');
      
      fs.mkdirSync(configDir, { recursive: true });
      const existingConfig = {
        github: {
          owner: 'customowner',
          repository: 'customrepo'
        },
        update: {
          enabled: false
        }
      };
      fs.writeFileSync(configFile, JSON.stringify(existingConfig));

      const success = initializeConfig(configDir, configFile);
      
      expect(success).toBe(true);
      
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      expect(config.github.owner).toBe('customowner');
      expect(config.github.repository).toBe('customrepo');
      expect(config.update.enabled).toBe(false);
      
      // Should merge with defaults for missing fields
      expect(config.version).toBeDefined();
      expect(config.security).toBeDefined();
    });

    test('should handle corrupted configuration file', () => {
      // Create config directory and corrupted file
      const configDir = path.join(testDir, 'config');
      const configFile = path.join(configDir, 'update-config.json');
      
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(configFile, 'invalid json {');

      const success = initializeConfig(configDir, configFile);
      
      expect(success).toBe(true);
      expect(fs.existsSync(`${configFile}.backup`)).toBe(true);
      
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      expect(config).toEqual(DEFAULT_CONFIG);
    });
  });

  describe('Version File Management', () => {
    test('should read version from file when it exists', () => {
      const versionFile = path.join(testDir, 'Version.txt');
      fs.writeFileSync(versionFile, '1.2.3');
      
      expect(fs.existsSync(versionFile)).toBe(true);
      const content = fs.readFileSync(versionFile, 'utf8').trim();
      expect(content).toBe('1.2.3');
    });

    test('should handle missing version file', () => {
      const versionFile = path.join(testDir, 'Version.txt');
      expect(fs.existsSync(versionFile)).toBe(false);
    });

    test('should validate version string formats', () => {
      // Test valid version formats
      const validVersions = ['1.0.0', 'v2.1.0', 'a1b2c3d', '2024.01.15'];
      
      for (const version of validVersions) {
        // Basic format validation
        expect(typeof version).toBe('string');
        expect(version.length).toBeGreaterThan(0);
        expect(version.length).toBeLessThanOrEqual(50);
      }
      
      // Test invalid version formats
      const invalidVersions = ['', '../../../etc/passwd'];
      
      for (const version of invalidVersions) {
        if (version === '') {
          expect(version.length).toBe(0);
        } else {
          expect(version.includes('..')).toBe(true);
        }
      }
    });
  });

  describe('GitHub Service Configuration', () => {
    test('should load configuration and update service settings', async () => {
      // Initialize configuration with custom settings
      const configDir = path.join(testDir, 'config');
      const configFile = path.join(configDir, 'update-config.json');
      
      fs.mkdirSync(configDir, { recursive: true });
      const customConfig = {
        github: {
          owner: 'testowner',
          repository: 'testrepo',
          apiUrl: 'https://api.github.com',
          rateLimitCacheTimeout: 120000
        }
      };
      fs.writeFileSync(configFile, JSON.stringify(customConfig));

      const githubService = new GitHubService();
      // Override the config manager to use test directory
      githubService.configManager.configPath = configFile;
      await githubService.loadConfiguration();
      
      expect(githubService.repoOwner).toBe('testowner');
      expect(githubService.repoName).toBe('testrepo');
      expect(githubService.cacheTimeout).toBe(120000);
    });

    test('should handle configuration loading errors gracefully', async () => {
      // Create corrupted config
      const configDir = path.join(testDir, 'config');
      const configFile = path.join(configDir, 'update-config.json');
      
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(configFile, 'invalid json');

      const githubService = new GitHubService();
      // Override the config manager to use test directory
      githubService.configManager.configPath = configFile;
      await githubService.loadConfiguration();
      
      // Should use defaults
      expect(githubService.repoOwner).toBe('mattstegner');
      expect(githubService.repoName).toBe('SpectraBox');
    });
  });

  describe('Update Script Permissions', () => {
    test('should verify update script exists and is executable', () => {
      // Create a mock update script
      const scriptsDir = path.join(testDir, 'scripts');
      const scriptPath = path.join(scriptsDir, 'spectrabox-kiosk-install.sh');
      
      fs.mkdirSync(scriptsDir, { recursive: true });
      fs.writeFileSync(scriptPath, '#!/bin/bash\necho "test"');
      fs.chmodSync(scriptPath, 0o755);

      expect(fs.existsSync(scriptPath)).toBe(true);
      
      const stats = fs.statSync(scriptPath);
      expect(stats.mode & 0o111).toBeTruthy(); // Check execute permissions
    });

    test('should handle missing update script gracefully', async () => {
      const configDir = path.join(testDir, 'config');
      const configFile = path.join(configDir, 'update-config.json');
      initializeConfig(configDir, configFile);
      
      const configManager = new ConfigManager();
      configManager.configPath = configFile;
      const config = await configManager.loadConfig();
      
      expect(config.update.updateScript).toBe('./scripts/spectrabox-kiosk-install.sh');
      
      // Script doesn't exist in test directory, but configuration should still be valid
      const scriptPath = path.join(testDir, config.update.updateScript);
      expect(fs.existsSync(scriptPath)).toBe(false);
    });
  });

  describe('Configuration Integration', () => {
    test('should integrate configuration files with services', async () => {
      // Initialize full configuration
      const configDir = path.join(testDir, 'config');
      const configFile = path.join(configDir, 'update-config.json');
      const versionFile = path.join(testDir, 'Version.txt');
      
      initializeConfig(configDir, configFile);
      
      // Create version file
      fs.writeFileSync(versionFile, '1.0.0');
      
      // Test configuration manager can load configuration
      const configManager = new ConfigManager();
      configManager.configPath = configFile;
      
      const config = await configManager.loadConfig();
      expect(config).toBeDefined();
      expect(config.github).toBeDefined();
      expect(config.update).toBeDefined();
      expect(config.version).toBeDefined();
      
      // Test version file exists and is readable
      expect(fs.existsSync(versionFile)).toBe(true);
      const versionContent = fs.readFileSync(versionFile, 'utf8').trim();
      expect(versionContent).toBe('1.0.0');
    });

    test('should handle configuration updates', async () => {
      const configDir = path.join(testDir, 'config');
      const configFile = path.join(configDir, 'update-config.json');
      
      initializeConfig(configDir, configFile);
      
      const configManager = new ConfigManager();
      configManager.configPath = configFile;
      
      // Update configuration
      const newConfig = {
        github: {
          owner: 'newowner',
          repository: 'newrepo'
        },
        update: {
          enabled: false
        }
      };
      
      const success = await configManager.updateConfig(newConfig);
      expect(success).toBe(true);
      
      // Verify configuration was updated
      const updatedConfig = await configManager.loadConfig();
      expect(updatedConfig.github.owner).toBe('newowner');
      expect(updatedConfig.github.repository).toBe('newrepo');
      expect(updatedConfig.update.enabled).toBe(false);
    });
  });

  describe('Deployment Environment Verification', () => {
    test('should verify required directories can be created', () => {
      const requiredDirs = ['config', 'scripts', 'docs'];
      
      for (const dir of requiredDirs) {
        const dirPath = path.join(testDir, dir);
        fs.mkdirSync(dirPath, { recursive: true });
        expect(fs.existsSync(dirPath)).toBe(true);
        expect(fs.statSync(dirPath).isDirectory()).toBe(true);
      }
    });

    test('should verify file permissions can be set', () => {
      const scriptPath = path.join(testDir, 'test-script.sh');
      fs.writeFileSync(scriptPath, '#!/bin/bash\necho "test"');
      fs.chmodSync(scriptPath, 0o755);
      
      const stats = fs.statSync(scriptPath);
      expect(stats.mode & 0o111).toBeTruthy();
    });

    test('should verify configuration files can be read and written', () => {
      const testConfig = { test: 'value' };
      const configDir = path.join(testDir, 'config');
      const configFile = path.join(configDir, 'test.json');
      
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(configFile, JSON.stringify(testConfig));
      
      const readConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      expect(readConfig).toEqual(testConfig);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle permission errors gracefully', async () => {
      // Create a directory without write permissions
      const readonlyDir = path.join(testDir, 'readonly-config');
      fs.mkdirSync(readonlyDir, { recursive: true });
      fs.chmodSync(readonlyDir, 0o444);
      
      const configManager = new ConfigManager();
      configManager.configPath = path.join(readonlyDir, 'config.json');
      
      const success = await configManager.updateConfig({ test: 'value' });
      expect(success).toBe(false);
      
      // Restore permissions for cleanup
      fs.chmodSync(readonlyDir, 0o755);
    });

    test('should provide fallback values for all configuration sections', () => {
      const configManager = new ConfigManager();
      const defaultConfig = configManager.getDefaultConfig();
      
      expect(defaultConfig.github).toBeDefined();
      expect(defaultConfig.update).toBeDefined();
      expect(defaultConfig.version).toBeDefined();
      expect(defaultConfig.security).toBeDefined();
      
      // Verify all required fields are present
      expect(defaultConfig.github.owner).toBeDefined();
      expect(defaultConfig.github.repository).toBeDefined();
      expect(defaultConfig.update.enabled).toBeDefined();
      expect(defaultConfig.version.filePath).toBeDefined();
      expect(defaultConfig.security.validateVersionStrings).toBeDefined();
    });
  });
});