/**
 * Test Validation Script
 * Validates test coverage and completeness
 */

const fs = require('fs').promises;
const path = require('path');

class TestValidator {
  constructor() {
    this.testDirectory = path.join(process.cwd(), 'test');
    this.sourceDirectories = ['services', 'utils', 'public/js'];
    this.requirements = [];
    this.testFiles = [];
    this.sourceFiles = [];
    this.coverage = {
      requirements: {},
      files: {},
      functions: {}
    };
  }

  async validateTestSuite() {
    console.log('🔍 Validating Test Suite Completeness');
    console.log('=====================================');

    await this.loadRequirements();
    await this.scanTestFiles();
    await this.scanSourceFiles();
    await this.validateCoverage();
    await this.generateReport();
  }

  async loadRequirements() {
    try {
      const requirementsPath = path.join(process.cwd(), '.kiro/specs/spectrabox/requirements.md');
      const content = await fs.readFile(requirementsPath, 'utf8');
      
      // Extract requirements from markdown
      const requirementMatches = content.match(/### Requirement \d+/g) || [];
      const acceptanceCriteria = content.match(/\d+\. WHEN .+ THEN .+ SHALL .+/g) || [];
      
      this.requirements = {
        total: requirementMatches.length,
        criteria: acceptanceCriteria.length,
        list: requirementMatches.map((req, index) => ({
          id: index + 1,
          title: req,
          tested: false
        }))
      };

      console.log(`📋 Found ${this.requirements.total} requirements with ${this.requirements.criteria} acceptance criteria`);
    } catch (error) {
      console.warn('⚠️  Could not load requirements:', error.message);
    }
  }

  async scanTestFiles() {
    try {
      const files = await fs.readdir(this.testDirectory);
      this.testFiles = files.filter(file => file.endsWith('.test.js'));
      
      console.log(`🧪 Found ${this.testFiles.length} test files`);
      
      // Analyze test content
      for (const file of this.testFiles) {
        const filePath = path.join(this.testDirectory, file);
        const content = await fs.readFile(filePath, 'utf8');
        
        const testCases = (content.match(/test\(|it\(/g) || []).length;
        const describes = (content.match(/describe\(/g) || []).length;
        const requirements = (content.match(/_Requirements?: \d+\.\d+/g) || []).length;
        
        console.log(`  📄 ${file}: ${testCases} tests, ${describes} suites, ${requirements} requirement refs`);
      }
    } catch (error) {
      console.error('❌ Error scanning test files:', error.message);
    }
  }

  async scanSourceFiles() {
    for (const dir of this.sourceDirectories) {
      try {
        const dirPath = path.join(process.cwd(), dir);
        const files = await fs.readdir(dirPath);
        
        for (const file of files) {
          if (file.endsWith('.js')) {
            const filePath = path.join(dirPath, file);
            const content = await fs.readFile(filePath, 'utf8');
            
            // Extract functions and classes
            const functions = (content.match(/(?:function\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)\s*=>|\w+))/g) || []).length;
            const classes = (content.match(/class\s+\w+/g) || []).length;
            const exports = (content.match(/module\.exports|exports\./g) || []).length;
            
            this.sourceFiles.push({
              path: path.join(dir, file),
              functions,
              classes,
              exports,
              tested: false
            });
          }
        }
      } catch (error) {
        console.warn(`⚠️  Could not scan ${dir}:`, error.message);
      }
    }
    
    console.log(`📁 Found ${this.sourceFiles.length} source files`);
  }

  async validateCoverage() {
    console.log('\n🎯 Validating Test Coverage');
    console.log('============================');

    // Check requirement coverage
    await this.validateRequirementCoverage();
    
    // Check file coverage
    await this.validateFileCoverage();
    
    // Check test categories
    await this.validateTestCategories();
  }

  async validateRequirementCoverage() {
    const testContent = await this.getAllTestContent();
    
    // Look for requirement references in tests
    const requirementRefs = testContent.match(/_Requirements?: (\d+\.\d+)/g) || [];
    const referencedRequirements = new Set();
    
    requirementRefs.forEach(ref => {
      const match = ref.match(/(\d+\.\d+)/);
      if (match) {
        referencedRequirements.add(match[1]);
      }
    });

    console.log(`📊 Requirements Coverage:`);
    console.log(`  Referenced in tests: ${referencedRequirements.size}`);
    console.log(`  Total requirements: ${this.requirements.total}`);
    
    if (referencedRequirements.size < this.requirements.total) {
      console.log(`  ⚠️  Missing coverage for ${this.requirements.total - referencedRequirements.size} requirements`);
    } else {
      console.log(`  ✅ All requirements referenced in tests`);
    }
  }

  async validateFileCoverage() {
    const testContent = await this.getAllTestContent();
    
    let testedFiles = 0;
    
    for (const sourceFile of this.sourceFiles) {
      const fileName = path.basename(sourceFile.path, '.js');
      const isImported = testContent.includes(`require('../${sourceFile.path}')`) ||
                        testContent.includes(`require('..${sourceFile.path}')`) ||
                        testContent.includes(fileName);
      
      if (isImported) {
        sourceFile.tested = true;
        testedFiles++;
      }
    }

    console.log(`📊 File Coverage:`);
    console.log(`  Tested files: ${testedFiles}/${this.sourceFiles.length}`);
    console.log(`  Coverage: ${Math.round((testedFiles / this.sourceFiles.length) * 100)}%`);

    const untestedFiles = this.sourceFiles.filter(f => !f.tested);
    if (untestedFiles.length > 0) {
      console.log(`  ⚠️  Untested files:`);
      untestedFiles.forEach(file => {
        console.log(`    - ${file.path}`);
      });
    }
  }

  async validateTestCategories() {
    const expectedCategories = [
      'unit',
      'integration', 
      'e2e',
      'performance',
      'cross-platform',
      'security',
      'accessibility'
    ];

    const foundCategories = new Set();
    
    for (const testFile of this.testFiles) {
      expectedCategories.forEach(category => {
        if (testFile.toLowerCase().includes(category) || 
            testFile.includes(category.replace('-', ''))) {
          foundCategories.add(category);
        }
      });
    }

    console.log(`📊 Test Categories:`);
    console.log(`  Found: ${Array.from(foundCategories).join(', ')}`);
    
    const missingCategories = expectedCategories.filter(cat => !foundCategories.has(cat));
    if (missingCategories.length > 0) {
      console.log(`  ⚠️  Missing categories: ${missingCategories.join(', ')}`);
    } else {
      console.log(`  ✅ All test categories covered`);
    }
  }

  async getAllTestContent() {
    let allContent = '';
    
    for (const testFile of this.testFiles) {
      try {
        const filePath = path.join(this.testDirectory, testFile);
        const content = await fs.readFile(filePath, 'utf8');
        allContent += content + '\n';
      } catch (error) {
        console.warn(`⚠️  Could not read ${testFile}:`, error.message);
      }
    }
    
    return allContent;
  }

  async generateReport() {
    console.log('\n📊 Test Suite Validation Report');
    console.log('================================');

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        testFiles: this.testFiles.length,
        sourceFiles: this.sourceFiles.length,
        requirements: this.requirements.total,
        acceptanceCriteria: this.requirements.criteria
      },
      coverage: {
        files: {
          tested: this.sourceFiles.filter(f => f.tested).length,
          total: this.sourceFiles.length,
          percentage: Math.round((this.sourceFiles.filter(f => f.tested).length / this.sourceFiles.length) * 100)
        }
      },
      testFiles: this.testFiles.map(file => ({
        name: file,
        category: this.categorizeTestFile(file)
      })),
      recommendations: this.generateRecommendations()
    };

    // Save report
    await fs.writeFile(
      path.join(process.cwd(), 'test-validation-report.json'),
      JSON.stringify(report, null, 2)
    );

    // Display summary
    console.log(`✅ Test Files: ${report.summary.testFiles}`);
    console.log(`📁 Source Files: ${report.summary.sourceFiles}`);
    console.log(`📋 Requirements: ${report.summary.requirements}`);
    console.log(`🎯 File Coverage: ${report.coverage.files.percentage}%`);

    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      report.recommendations.forEach(rec => {
        console.log(`  - ${rec}`);
      });
    }

    console.log('\n📄 Detailed report saved to test-validation-report.json');
  }

  categorizeTestFile(filename) {
    const categories = {
      'unit': ['Service.test.js', 'Detection.test.js', 'unit-fast.test.js'],
      'integration': ['integration.test.js', 'server.test.js', 'spectrum-analyzer-integration.test.js'],
      'e2e': ['e2e-', 'comprehensive-integration.test.js'],
      'performance': ['performance.test.js', 'pi-performance.test.js'],
      'cross-platform': ['cross-platform'],
      'security': ['security'],
      'accessibility': ['accessibility'],
      'scenarios': ['scenarios.test.js', 'network-accessibility.test.js']
    };

    for (const [category, patterns] of Object.entries(categories)) {
      if (patterns.some(pattern => filename.includes(pattern))) {
        return category;
      }
    }

    return 'other';
  }

  generateRecommendations() {
    const recommendations = [];
    
    const untestedFiles = this.sourceFiles.filter(f => !f.tested);
    if (untestedFiles.length > 0) {
      recommendations.push(`Add tests for ${untestedFiles.length} untested source files`);
    }

    const fileCoverage = (this.sourceFiles.filter(f => f.tested).length / this.sourceFiles.length) * 100;
    if (fileCoverage < 80) {
      recommendations.push('Increase file coverage to at least 80%');
    }

    if (this.testFiles.length < 10) {
      recommendations.push('Consider adding more comprehensive test files');
    }

    const hasE2E = this.testFiles.some(f => f.includes('e2e'));
    if (!hasE2E) {
      recommendations.push('Add end-to-end tests for user workflows');
    }

    const hasPerformance = this.testFiles.some(f => f.includes('performance'));
    if (!hasPerformance) {
      recommendations.push('Add performance tests for Raspberry Pi constraints');
    }

    return recommendations;
  }
}

// CLI interface
async function main() {
  const validator = new TestValidator();
  await validator.validateTestSuite();
}

if (require.main === module) {
  main().catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });
}

module.exports = TestValidator;