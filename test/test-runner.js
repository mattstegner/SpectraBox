/**
 * Comprehensive Test Runner
 * Orchestrates all test suites for complete system validation
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class TestRunner {
  constructor() {
    this.testSuites = [
      {
        name: 'Unit Tests',
        pattern: 'unit-fast.test.js',
        timeout: 15000,
        description: 'Fast individual component unit tests',
        category: 'unit'
      },
      {
        name: 'Integration Tests',
        pattern: 'integration.test.js server.test.js',
        timeout: 45000,
        description: 'Component integration tests',
        category: 'integration'
      },
      {
        name: 'Cross-Platform Tests',
        pattern: 'cross-platform-*.test.js',
        timeout: 60000,
        description: 'Platform compatibility tests',
        category: 'cross-platform'
      },
      {
        name: 'Performance Tests',
        pattern: 'pi-performance.test.js',
        timeout: 90000,
        description: 'Performance and resource usage tests',
        category: 'performance'
      },
      {
        name: 'Audio Device Tests',
        pattern: 'audio-device-scenarios.test.js',
        timeout: 45000,
        description: 'Audio device enumeration and handling tests',
        category: 'audio'
      },
      {
        name: 'Spectrum Analyzer Tests',
        pattern: 'spectrum-analyzer-integration.test.js',
        timeout: 60000,
        description: 'Spectrum analyzer functionality tests',
        category: 'integration'
      },
      {
        name: 'End-to-End Tests',
        pattern: 'e2e-*.test.js',
        timeout: 120000,
        description: 'Complete user workflow tests',
        category: 'e2e'
      },
      {
        name: 'Comprehensive Integration Tests',
        pattern: 'comprehensive-integration.test.js',
        timeout: 180000,
        description: 'Full system integration tests',
        category: 'e2e'
      },
      {
        name: 'Network Accessibility Tests',
        pattern: 'network-accessibility.test.js',
        timeout: 45000,
        description: 'Network access and kiosk mode tests',
        category: 'network'
      },
      {
        name: 'Security Tests',
        pattern: 'security-*.test.js',
        timeout: 60000,
        description: 'Security and vulnerability tests',
        category: 'security'
      },
      {
        name: 'Accessibility Tests',
        pattern: 'accessibility-*.test.js',
        timeout: 60000,
        description: 'Web accessibility compliance tests',
        category: 'accessibility'
      }
    ];
    
    this.results = [];
    this.startTime = Date.now();
  }

  async runTestSuite(suite) {
    console.log(`\n🧪 Running ${suite.name}...`);
    console.log(`   ${suite.description}`);
    
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const jestProcess = spawn('npx', [
        'jest',
        '--testPathPattern', suite.pattern,
        '--testTimeout', suite.timeout.toString(),
        '--verbose',
        '--detectOpenHandles',
        '--forceExit'
      ], {
        stdio: 'pipe',
        cwd: process.cwd()
      });

      let stdout = '';
      let stderr = '';

      jestProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      jestProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      jestProcess.on('close', (code) => {
        const duration = Date.now() - startTime;
        const result = {
          suite: suite.name,
          pattern: suite.pattern,
          success: code === 0,
          duration,
          stdout,
          stderr,
          exitCode: code
        };

        this.results.push(result);

        if (code === 0) {
          console.log(`   ✅ ${suite.name} passed (${duration}ms)`);
        } else {
          console.log(`   ❌ ${suite.name} failed (${duration}ms)`);
          console.log(`   Exit code: ${code}`);
          if (stderr) {
            console.log(`   Error output: ${stderr.slice(0, 500)}...`);
          }
        }

        resolve(result);
      });

      // Handle timeout
      setTimeout(() => {
        if (!jestProcess.killed) {
          console.log(`   ⏰ ${suite.name} timed out, killing process...`);
          jestProcess.kill('SIGKILL');
        }
      }, suite.timeout + 10000); // Add 10s buffer
    });
  }

  async runAllTests() {
    console.log('🚀 Starting Comprehensive Test Suite');
    console.log('=====================================');
    
    // Run test suites sequentially to avoid resource conflicts
    for (const suite of this.testSuites) {
      await this.runTestSuite(suite);
      
      // Brief pause between suites
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    await this.generateReport();
  }

  async runTestsByCategory(category) {
    const categoryMap = {
      'unit': ['Unit Tests'],
      'integration': ['Integration Tests', 'Spectrum Analyzer Tests'],
      'e2e': ['End-to-End Tests', 'Comprehensive Integration Tests'],
      'performance': ['Performance Tests'],
      'cross-platform': ['Cross-Platform Tests'],
      'audio': ['Audio Device Tests'],
      'network': ['Network Accessibility Tests'],
      'all': this.testSuites.map(s => s.name)
    };

    const suitesToRun = categoryMap[category] || [category];
    const filteredSuites = this.testSuites.filter(suite => 
      suitesToRun.includes(suite.name)
    );

    if (filteredSuites.length === 0) {
      console.log(`❌ No test suites found for category: ${category}`);
      console.log(`Available categories: ${Object.keys(categoryMap).join(', ')}`);
      return;
    }

    console.log(`🚀 Running ${category} tests`);
    console.log('=====================================');

    for (const suite of filteredSuites) {
      await this.runTestSuite(suite);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    await this.generateReport();
  }

  async generateReport() {
    const totalDuration = Date.now() - this.startTime;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = this.results.filter(r => !r.success).length;
    const totalTests = this.results.length;

    console.log('\n📊 Test Results Summary');
    console.log('=======================');
    console.log(`Total Test Suites: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    console.log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
    console.log(`Total Duration: ${Math.round(totalDuration / 1000)}s`);

    // Detailed results
    console.log('\n📋 Detailed Results:');
    this.results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      const duration = Math.round(result.duration / 1000);
      console.log(`${status} ${result.suite} (${duration}s)`);
    });

    // Failed tests details
    const failedResults = this.results.filter(r => !r.success);
    if (failedResults.length > 0) {
      console.log('\n❌ Failed Test Details:');
      failedResults.forEach(result => {
        console.log(`\n${result.suite}:`);
        console.log(`  Pattern: ${result.pattern}`);
        console.log(`  Exit Code: ${result.exitCode}`);
        if (result.stderr) {
          console.log(`  Error: ${result.stderr.slice(0, 300)}...`);
        }
      });
    }

    // Generate JSON report
    const report = {
      timestamp: new Date().toISOString(),
      totalDuration,
      summary: {
        total: totalTests,
        passed: passedTests,
        failed: failedTests,
        successRate: Math.round((passedTests / totalTests) * 100)
      },
      results: this.results.map(r => ({
        suite: r.suite,
        pattern: r.pattern,
        success: r.success,
        duration: r.duration,
        exitCode: r.exitCode
      }))
    };

    await fs.writeFile(
      path.join(process.cwd(), 'test-results.json'),
      JSON.stringify(report, null, 2)
    );

    console.log('\n📄 Detailed report saved to test-results.json');

    // Exit with appropriate code
    process.exit(failedTests > 0 ? 1 : 0);
  }

  async checkPrerequisites() {
    console.log('🔍 Checking test prerequisites...');
    
    const checks = [
      {
        name: 'Node.js version',
        check: () => {
          const version = process.version;
          const major = parseInt(version.slice(1).split('.')[0]);
          return major >= 16;
        }
      },
      {
        name: 'Jest installation',
        check: async () => {
          try {
            await fs.access(path.join(process.cwd(), 'node_modules', '.bin', 'jest'));
            return true;
          } catch {
            return false;
          }
        }
      },
      {
        name: 'Puppeteer installation',
        check: async () => {
          try {
            await fs.access(path.join(process.cwd(), 'node_modules', 'puppeteer'));
            return true;
          } catch {
            return false;
          }
        }
      },
      {
        name: 'Test files exist',
        check: async () => {
          try {
            const testDir = path.join(process.cwd(), 'test');
            const files = await fs.readdir(testDir);
            return files.filter(f => f.endsWith('.test.js')).length > 0;
          } catch {
            return false;
          }
        }
      }
    ];

    let allPassed = true;
    for (const check of checks) {
      const result = await check.check();
      console.log(`  ${result ? '✅' : '❌'} ${check.name}`);
      if (!result) allPassed = false;
    }

    if (!allPassed) {
      console.log('\n❌ Prerequisites not met. Please install dependencies:');
      console.log('   npm install');
      process.exit(1);
    }

    console.log('✅ All prerequisites met\n');
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'all';
  
  const runner = new TestRunner();
  
  await runner.checkPrerequisites();

  switch (command) {
    case 'unit':
    case 'integration':
    case 'e2e':
    case 'performance':
    case 'cross-platform':
    case 'audio':
    case 'network':
      await runner.runTestsByCategory(command);
      break;
    case 'all':
    default:
      await runner.runAllTests();
      break;
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = TestRunner;