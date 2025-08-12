const { Logger, logger } = require('../utils/logger');

describe('Logger', () => {
  let originalConsole;
  let mockConsole;
  
  beforeEach(() => {
    // Save original console methods
    originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug
    };
    
    // Create mock console methods
    mockConsole = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    
    // Replace console methods with mocks
    console.log = mockConsole.log;
    console.info = mockConsole.info;
    console.warn = mockConsole.warn;
    console.error = mockConsole.error;
    console.debug = mockConsole.debug;
  });
  
  afterEach(() => {
    // Restore original console methods
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.debug = originalConsole.debug;
  });
  
  test('should create a logger with default options', () => {
    const testLogger = new Logger();
    expect(testLogger.options.level).toBe('info');
    expect(testLogger.options.prefix).toBe('');
    expect(testLogger.options.timestamp).toBe(true);
  });
  
  test('should create a logger with custom options', () => {
    const testLogger = new Logger({
      level: 'debug',
      prefix: 'test',
      timestamp: false
    });
    expect(testLogger.options.level).toBe('debug');
    expect(testLogger.options.prefix).toBe('test');
    expect(testLogger.options.timestamp).toBe(false);
  });
  
  test('should log error messages', () => {
    const testLogger = new Logger({ timestamp: false, colorize: false });
    testLogger.error('Test error');
    expect(mockConsole.error).toHaveBeenCalledWith('[ERROR] Test error');
  });
  
  test('should log warning messages', () => {
    const testLogger = new Logger({ timestamp: false, colorize: false });
    testLogger.warn('Test warning');
    expect(mockConsole.warn).toHaveBeenCalledWith('[WARN] Test warning');
  });
  
  test('should log info messages', () => {
    const testLogger = new Logger({ timestamp: false, colorize: false });
    testLogger.info('Test info');
    expect(mockConsole.info).toHaveBeenCalledWith('[INFO] Test info');
  });
  
  test('should log debug messages if level is debug or higher', () => {
    const debugLogger = new Logger({ level: 'debug', timestamp: false, colorize: false });
    debugLogger.debug('Test debug');
    expect(mockConsole.debug).toHaveBeenCalledWith('[DEBUG] Test debug');
    
    mockConsole.debug.mockClear();
    
    const infoLogger = new Logger({ level: 'info', timestamp: false, colorize: false });
    infoLogger.debug('Test debug');
    expect(mockConsole.debug).not.toHaveBeenCalled();
  });
  
  test('should include prefix in log messages', () => {
    const testLogger = new Logger({ prefix: 'TestModule', timestamp: false, colorize: false });
    testLogger.info('Test message');
    expect(mockConsole.info).toHaveBeenCalledWith('[INFO] [TestModule] Test message');
  });
  
  test('should create child loggers with extended prefix', () => {
    const parentLogger = new Logger({ prefix: 'Parent', timestamp: false, colorize: false });
    const childLogger = parentLogger.child('Child');
    
    childLogger.info('Test message');
    expect(mockConsole.info).toHaveBeenCalledWith('[INFO] [Parent:Child] Test message');
  });
  
  test('should log additional data when provided', () => {
    const testLogger = new Logger({ timestamp: false, colorize: false });
    const testData = { id: 123, name: 'test' };
    
    testLogger.info('Test message', testData);
    
    expect(mockConsole.info).toHaveBeenCalledWith('[INFO] Test message');
    expect(mockConsole.info).toHaveBeenCalledWith('[INFO] Details: {"id":123,"name":"test"}');
  });
  
  test('should log error stack when error object is provided', () => {
    const testLogger = new Logger({ timestamp: false, colorize: false });
    const testError = new Error('Test error');
    
    testLogger.error('Error occurred', testError);
    
    expect(mockConsole.error).toHaveBeenCalledWith('[ERROR] Error occurred');
    expect(mockConsole.error).toHaveBeenCalledWith(expect.stringContaining('[ERROR] Stack: Error: Test error'));
  });
});