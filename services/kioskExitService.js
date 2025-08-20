/**
 * Kiosk Exit Service
 * 
 * Handles exiting Chromium kiosk mode on Raspberry Pi systems.
 * Provides multiple strategies for safely terminating kiosk browsers.
 */

const { spawn, execFile } = require('child_process');
const { logger } = require('../utils/logger');
const PlatformDetection = require('../utils/platformDetection');

class KioskExitService {
  constructor() {
    this.supportedPlatforms = ['linux'];
    this.kioskProcessPatterns = [
      'chromium.*--kiosk',
      'chromium-browser.*--kiosk',
      'firefox-esr.*--kiosk'
    ];
    this.systemdServices = [
      'spectrabox-kiosk.service',
      'spectrabox-kiosk'
    ];
  }

  /**
   * Exit kiosk mode using the most appropriate method
   * @returns {Promise<{success: boolean, method: string, message: string}>}
   */
  async exitKiosk() {
    try {
      // Validate platform support
      if (!this.isPlatformSupported()) {
        const allowOverride = process.env.ALLOW_KIOSK_EXIT === 'true';
        if (!allowOverride) {
          return {
            success: false,
            method: 'validation',
            message: 'Kiosk exit not supported on this platform. Set ALLOW_KIOSK_EXIT=true to override.'
          };
        }
        logger.warn('Platform validation bypassed via ALLOW_KIOSK_EXIT environment variable');
      }

      logger.info('Attempting to exit kiosk mode');

      // Try systemd service approach first (most reliable)
      const systemdResult = await this.exitViaSystemd();
      if (systemdResult.success) {
        return systemdResult;
      }

      logger.debug('Systemd approach failed, trying process termination');

      // Fall back to process termination
      const processResult = await this.exitViaPkill();
      if (processResult.success) {
        return processResult;
      }

      // If both methods fail, return the more informative error
      return {
        success: false,
        method: 'combined',
        message: `Both systemd and process termination failed. Systemd: ${systemdResult.message}. Process: ${processResult.message}`
      };

    } catch (error) {
      logger.error('Unexpected error in kiosk exit service', error);
      return {
        success: false,
        method: 'error',
        message: `Unexpected error: ${error.message}`
      };
    }
  }

  /**
   * Exit kiosk via systemd service management
   * @param {string} serviceName - Name of the systemd service to stop
   * @returns {Promise<{success: boolean, method: string, message: string}>}
   */
  async exitViaSystemd(serviceName = null) {
    const servicesToTry = serviceName ? [serviceName] : this.systemdServices;

    for (const service of servicesToTry) {
      try {
        logger.debug(`Attempting to stop systemd service: ${service}`);

        // First check if the service exists and is running
        const statusResult = await this.checkSystemdServiceStatus(service);
        if (!statusResult.exists) {
          logger.debug(`Service ${service} does not exist, skipping`);
          continue;
        }

        if (!statusResult.running) {
          logger.debug(`Service ${service} is not running, skipping`);
          continue;
        }

        // Attempt to stop the service
        const stopResult = await this.stopSystemdService(service);
        if (stopResult.success) {
          return {
            success: true,
            method: 'systemd',
            message: `Successfully stopped kiosk service: ${service}`
          };
        } else {
          logger.warn(`Failed to stop service ${service}: ${stopResult.error}`);
        }

      } catch (error) {
        logger.warn(`Error handling systemd service ${service}:`, error.message);
        continue;
      }
    }

    return {
      success: false,
      method: 'systemd',
      message: 'No running kiosk systemd services found or failed to stop them'
    };
  }

  /**
   * Exit kiosk via process termination
   * @returns {Promise<{success: boolean, method: string, message: string}>}
   */
  async exitViaPkill() {
    let terminatedProcesses = [];
    let errors = [];

    for (const pattern of this.kioskProcessPatterns) {
      try {
        logger.debug(`Attempting to terminate processes matching: ${pattern}`);
        
        const result = await this.killProcessesByPattern(pattern);
        if (result.count > 0) {
          terminatedProcesses.push(`${result.count} processes matching '${pattern}'`);
          logger.info(`Terminated ${result.count} processes matching '${pattern}'`);
        } else {
          logger.debug(`No processes found matching '${pattern}'`);
        }

      } catch (error) {
        errors.push(`Failed to terminate '${pattern}': ${error.message}`);
        logger.warn(`Error terminating processes matching '${pattern}':`, error.message);
      }
    }

    if (terminatedProcesses.length > 0) {
      return {
        success: true,
        method: 'pkill',
        message: `Successfully terminated: ${terminatedProcesses.join(', ')}`
      };
    }

    if (errors.length > 0) {
      return {
        success: false,
        method: 'pkill',
        message: `Process termination failed: ${errors.join('; ')}`
      };
    }

    return {
      success: true,
      method: 'pkill',
      message: 'No kiosk processes found to terminate (kiosk may already be closed)'
    };
  }

  /**
   * Check if a systemd service exists and is running
   * @param {string} serviceName - Name of the service to check
   * @returns {Promise<{exists: boolean, running: boolean}>}
   */
  async checkSystemdServiceStatus(serviceName) {
    return new Promise((resolve) => {
      // Use systemctl to check service status
      const args = ['status', serviceName];
      const process = spawn('systemctl', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        // systemctl status returns:
        // 0 - service is running
        // 1,2,3 - service exists but not running
        // 4 - service does not exist
        
        const exists = code !== 4;
        const running = code === 0;

        logger.debug(`Service ${serviceName} status: exists=${exists}, running=${running}, code=${code}`);
        
        resolve({ exists, running });
      });

      process.on('error', (error) => {
        logger.debug(`Error checking service ${serviceName}:`, error.message);
        resolve({ exists: false, running: false });
      });
    });
  }

  /**
   * Stop a systemd service
   * @param {string} serviceName - Name of the service to stop
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async stopSystemdService(serviceName) {
    return new Promise((resolve) => {
      // Determine if we need sudo
      const needsSudo = process.getuid && process.getuid() !== 0;
      const command = needsSudo ? 'sudo' : 'systemctl';
      const args = needsSudo ? ['systemctl', 'stop', serviceName] : ['stop', serviceName];

      logger.debug(`Stopping service with command: ${command} ${args.join(' ')}`);

      const process = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 10000 // 10 second timeout
      });

      let stderr = '';

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          logger.info(`Successfully stopped systemd service: ${serviceName}`);
          resolve({ success: true });
        } else {
          const error = `Failed to stop service ${serviceName} (exit code ${code}): ${stderr.trim()}`;
          logger.warn(error);
          resolve({ success: false, error });
        }
      });

      process.on('error', (error) => {
        const errorMsg = `Error stopping service ${serviceName}: ${error.message}`;
        logger.warn(errorMsg);
        resolve({ success: false, error: errorMsg });
      });
    });
  }

  /**
   * Kill processes matching a pattern using pkill
   * @param {string} pattern - Pattern to match processes against
   * @returns {Promise<{count: number, error?: string}>}
   */
  async killProcessesByPattern(pattern) {
    return new Promise((resolve) => {
      // Use pkill with -f flag to match full command line
      const args = ['-f', pattern];
      
      logger.debug(`Running pkill with args: ${args.join(' ')}`);

      const process = spawn('pkill', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000 // 5 second timeout
      });

      let stderr = '';

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          // pkill succeeded, processes were terminated
          // We can't easily get the exact count from pkill, so we'll estimate
          logger.debug(`pkill succeeded for pattern: ${pattern}`);
          resolve({ count: 1 }); // At least 1 process was terminated
        } else if (code === 1) {
          // No processes matched the pattern
          logger.debug(`No processes found matching pattern: ${pattern}`);
          resolve({ count: 0 });
        } else {
          // Other error
          const error = `pkill failed for pattern '${pattern}' (exit code ${code}): ${stderr.trim()}`;
          logger.warn(error);
          resolve({ count: 0, error });
        }
      });

      process.on('error', (error) => {
        const errorMsg = `Error running pkill for pattern '${pattern}': ${error.message}`;
        logger.warn(errorMsg);
        resolve({ count: 0, error: errorMsg });
      });
    });
  }

  /**
   * Check if the current platform supports kiosk exit
   * @returns {boolean}
   */
  isPlatformSupported() {
    const platform = process.platform;
    const isSupported = this.supportedPlatforms.includes(platform);
    
    logger.debug(`Platform support check: ${platform} is ${isSupported ? 'supported' : 'not supported'}`);
    
    return isSupported;
  }

  /**
   * Get information about the current kiosk state
   * @returns {Promise<{running: boolean, processes: Array, services: Array}>}
   */
  async getKioskStatus() {
    try {
      const processes = await this.findKioskProcesses();
      const services = await this.findKioskServices();

      return {
        running: processes.length > 0 || services.length > 0,
        processes,
        services
      };
    } catch (error) {
      logger.error('Error getting kiosk status:', error);
      return {
        running: false,
        processes: [],
        services: [],
        error: error.message
      };
    }
  }

  /**
   * Find running kiosk processes
   * @returns {Promise<Array>}
   */
  async findKioskProcesses() {
    const processes = [];

    for (const pattern of this.kioskProcessPatterns) {
      try {
        // Use pgrep to find processes matching pattern
        const result = await this.findProcessesByPattern(pattern);
        if (result.length > 0) {
          processes.push(...result.map(pid => ({ pattern, pid })));
        }
      } catch (error) {
        logger.debug(`Error finding processes for pattern '${pattern}':`, error.message);
      }
    }

    return processes;
  }

  /**
   * Find running kiosk systemd services
   * @returns {Promise<Array>}
   */
  async findKioskServices() {
    const services = [];

    for (const service of this.systemdServices) {
      try {
        const status = await this.checkSystemdServiceStatus(service);
        if (status.exists && status.running) {
          services.push({ name: service, running: true });
        }
      } catch (error) {
        logger.debug(`Error checking service '${service}':`, error.message);
      }
    }

    return services;
  }

  /**
   * Find processes matching a pattern using pgrep
   * @param {string} pattern - Pattern to match
   * @returns {Promise<Array<number>>} Array of PIDs
   */
  async findProcessesByPattern(pattern) {
    return new Promise((resolve) => {
      const args = ['-f', pattern];
      const process = spawn('pgrep', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          // Parse PIDs from output
          const pids = stdout.trim().split('\n')
            .filter(line => line.trim())
            .map(line => parseInt(line.trim(), 10))
            .filter(pid => !isNaN(pid));
          
          resolve(pids);
        } else {
          // No processes found or error
          resolve([]);
        }
      });

      process.on('error', () => {
        resolve([]);
      });
    });
  }

  /**
   * Reboot the system (exits kiosk, then reboots)
   * Kiosk mode will automatically restart on boot if properly configured
   * @returns {Promise<{success: boolean, method: string, message: string}>}
   */
  async rebootSystem() {
    try {
      // Check platform support
      if (!this.isPlatformSupported() && !process.env.ALLOW_KIOSK_EXIT) {
        return {
          success: false,
          method: 'platform_check',
          message: `Reboot not supported on platform: ${process.platform}. Only supported on: ${this.supportedPlatforms.join(', ')}`
        };
      }

      logger.info('Initiating system reboot sequence');

      // First, try to exit kiosk mode gracefully
      const kioskExitResult = await this.exitKiosk();
      if (kioskExitResult.success) {
        logger.info(`Kiosk exited successfully using method: ${kioskExitResult.method}`);
      } else {
        logger.warn(`Failed to exit kiosk cleanly: ${kioskExitResult.message}`);
        // Continue with reboot anyway
      }

      // Give a brief moment for kiosk to clean up
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Execute system reboot
      logger.info('Executing system reboot command');
      
      return new Promise((resolve, reject) => {
        // Use spawn for the reboot command
        const rebootProcess = spawn('sudo', ['reboot'], {
          detached: true,
          stdio: 'ignore'
        });

        rebootProcess.on('error', (error) => {
          logger.error('Failed to execute reboot command:', error);
          resolve({
            success: false,
            method: 'reboot_command',
            message: `Failed to execute reboot: ${error.message}`
          });
        });

        // The reboot command typically doesn't return, so we'll assume success
        // if we get here without an immediate error
        setTimeout(() => {
          logger.info('Reboot command executed successfully');
          resolve({
            success: true,
            method: 'sudo_reboot',
            message: 'System reboot initiated successfully'
          });
        }, 1000);
      });

    } catch (error) {
      logger.error('Error during system reboot:', error);
      return {
        success: false,
        method: 'reboot_error',
        message: `Reboot failed: ${error.message}`
      };
    }
  }
}

module.exports = KioskExitService;
