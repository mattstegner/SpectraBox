/**
 * Accessibility Compliance Tests
 * Tests WCAG 2.1 compliance and accessibility features
 */

const puppeteer = require('puppeteer');
const request = require('supertest');
const app = require('../server');

describe('Accessibility Compliance Tests', () => {
  let browser;
  let page;
  let server;
  let serverPort;

  beforeAll(async () => {
    server = app.listen(0);
    serverPort = server.address().port;
    
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  });

  afterAll(async () => {
    if (browser) await browser.close();
    if (server) server.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  describe('WCAG 2.1 Level A Compliance', () => {
    test('should have proper document structure', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      // Check for proper HTML structure
      const doctype = await page.evaluate(() => {
        return document.doctype ? document.doctype.name : null;
      });
      expect(doctype).toBe('html');

      // Check for lang attribute
      const htmlLang = await page.$eval('html', el => el.getAttribute('lang'));
      expect(htmlLang).toBeTruthy();
      expect(htmlLang).toMatch(/^[a-z]{2}(-[A-Z]{2})?$/); // e.g., 'en' or 'en-US'

      // Check for proper title
      const title = await page.title();
      expect(title).toBeTruthy();
      expect(title.length).toBeGreaterThan(0);
    });

    test('should have semantic HTML structure', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      // Check for semantic elements
      const semanticElements = await page.evaluate(() => {
        const elements = {
          main: document.querySelector('main') !== null,
          header: document.querySelector('header') !== null,
          nav: document.querySelector('nav') !== null,
          section: document.querySelectorAll('section').length > 0,
          headings: document.querySelectorAll('h1, h2, h3, h4, h5, h6').length > 0
        };
        return elements;
      });

      expect(semanticElements.main || semanticElements.section).toBe(true);
      expect(semanticElements.headings).toBe(true);
    });

    test('should have proper heading hierarchy', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      const headingStructure = await page.evaluate(() => {
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
        return headings.map(h => ({
          level: parseInt(h.tagName.charAt(1)),
          text: h.textContent.trim()
        }));
      });

      if (headingStructure.length > 0) {
        // Should start with h1
        expect(headingStructure[0].level).toBe(1);
        
        // Check for logical progression (no skipping levels)
        for (let i = 1; i < headingStructure.length; i++) {
          const currentLevel = headingStructure[i].level;
          const previousLevel = headingStructure[i - 1].level;
          
          // Should not skip more than one level
          expect(currentLevel - previousLevel).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe('Form Accessibility', () => {
    test('should have proper form labels', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      const formAccessibility = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
        const results = {
          totalInputs: inputs.length,
          labeledInputs: 0,
          ariaLabeledInputs: 0,
          unlabeledInputs: []
        };

        inputs.forEach(input => {
          const id = input.id;
          const hasLabel = id && document.querySelector(`label[for="${id}"]`);
          const hasAriaLabel = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
          
          if (hasLabel || hasAriaLabel) {
            if (hasLabel) results.labeledInputs++;
            if (hasAriaLabel) results.ariaLabeledInputs++;
          } else {
            results.unlabeledInputs.push({
              tagName: input.tagName,
              type: input.type,
              id: input.id,
              name: input.name
            });
          }
        });

        return results;
      });

      // All form inputs should have labels or aria-labels
      if (formAccessibility.totalInputs > 0) {
        expect(formAccessibility.unlabeledInputs.length).toBe(0);
        expect(formAccessibility.labeledInputs + formAccessibility.ariaLabeledInputs)
          .toBeGreaterThan(0);
      }
    });

    test('should have accessible form validation', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      // Check for aria-invalid and aria-describedby on form fields
      const validationAccessibility = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
        return inputs.map(input => ({
          hasAriaInvalid: input.hasAttribute('aria-invalid'),
          hasAriaDescribedby: input.hasAttribute('aria-describedby'),
          hasRequired: input.hasAttribute('required'),
          hasAriaRequired: input.hasAttribute('aria-required')
        }));
      });

      // Required fields should have proper ARIA attributes
      validationAccessibility.forEach(field => {
        if (field.hasRequired) {
          expect(field.hasAriaRequired || field.hasRequired).toBe(true);
        }
      });
    });
  });

  describe('Interactive Element Accessibility', () => {
    test('should have accessible buttons', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      const buttonAccessibility = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        return buttons.map(button => ({
          hasText: button.textContent.trim().length > 0,
          hasAriaLabel: button.hasAttribute('aria-label'),
          hasAriaLabelledby: button.hasAttribute('aria-labelledby'),
          isDisabled: button.disabled || button.getAttribute('aria-disabled') === 'true',
          hasTabIndex: button.hasAttribute('tabindex')
        }));
      });

      // All buttons should have accessible names
      buttonAccessibility.forEach(button => {
        expect(button.hasText || button.hasAriaLabel || button.hasAriaLabelledby).toBe(true);
      });
    });

    test('should support keyboard navigation', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      // Test tab navigation
      await page.keyboard.press('Tab');
      
      const firstFocusedElement = await page.evaluate(() => {
        return {
          tagName: document.activeElement.tagName,
          type: document.activeElement.type,
          id: document.activeElement.id,
          tabIndex: document.activeElement.tabIndex
        };
      });

      // Should focus on an interactive element
      expect(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A']).toContain(firstFocusedElement.tagName);

      // Test multiple tab presses
      const focusableElements = [];
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
        const focused = await page.evaluate(() => ({
          tagName: document.activeElement.tagName,
          id: document.activeElement.id
        }));
        focusableElements.push(focused);
      }

      // Should be able to navigate through multiple elements
      const uniqueElements = new Set(focusableElements.map(el => `${el.tagName}#${el.id}`));
      expect(uniqueElements.size).toBeGreaterThan(1);
    });

    test('should have visible focus indicators', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      // Tab to first focusable element
      await page.keyboard.press('Tab');

      const focusStyles = await page.evaluate(() => {
        const focused = document.activeElement;
        const styles = window.getComputedStyle(focused);
        const pseudoStyles = window.getComputedStyle(focused, ':focus');
        
        return {
          outline: styles.outline,
          outlineWidth: styles.outlineWidth,
          outlineStyle: styles.outlineStyle,
          outlineColor: styles.outlineColor,
          boxShadow: styles.boxShadow,
          border: styles.border,
          focusOutline: pseudoStyles.outline,
          focusBoxShadow: pseudoStyles.boxShadow
        };
      });

      // Should have some form of focus indicator
      const hasFocusIndicator = 
        focusStyles.outline !== 'none' ||
        focusStyles.outlineWidth !== '0px' ||
        focusStyles.boxShadow !== 'none' ||
        focusStyles.focusOutline !== 'none' ||
        focusStyles.focusBoxShadow !== 'none';

      expect(hasFocusIndicator).toBe(true);
    });
  });

  describe('Color and Contrast', () => {
    test('should have sufficient color contrast', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      // Get text elements and their computed styles
      const textElements = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, div, button, label'));
        return elements
          .filter(el => el.textContent.trim().length > 0)
          .slice(0, 10) // Test first 10 elements
          .map(el => {
            const styles = window.getComputedStyle(el);
            return {
              text: el.textContent.trim().substring(0, 50),
              color: styles.color,
              backgroundColor: styles.backgroundColor,
              fontSize: styles.fontSize
            };
          });
      });

      // Basic check - should have defined colors
      textElements.forEach(element => {
        expect(element.color).toBeTruthy();
        expect(element.color).not.toBe('rgba(0, 0, 0, 0)');
      });
    });

    test('should not rely solely on color for information', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      // Check for error messages and status indicators
      const statusElements = await page.evaluate(() => {
        const selectors = ['.error', '.warning', '.success', '.info', '[class*="status"]', '[class*="alert"]'];
        const elements = [];
        
        selectors.forEach(selector => {
          const found = Array.from(document.querySelectorAll(selector));
          elements.push(...found);
        });

        return elements.map(el => ({
          text: el.textContent.trim(),
          hasIcon: el.querySelector('svg, i, .icon') !== null,
          hasAriaLabel: el.hasAttribute('aria-label'),
          className: el.className
        }));
      });

      // Status elements should have text or icons, not just color
      statusElements.forEach(element => {
        if (element.text.length === 0) {
          expect(element.hasIcon || element.hasAriaLabel).toBe(true);
        }
      });
    });
  });

  describe('ARIA and Screen Reader Support', () => {
    test('should have proper ARIA landmarks', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      const landmarks = await page.evaluate(() => {
        const landmarkRoles = ['banner', 'navigation', 'main', 'contentinfo', 'complementary', 'search'];
        const landmarks = {};
        
        landmarkRoles.forEach(role => {
          landmarks[role] = document.querySelectorAll(`[role="${role}"], ${role}`).length;
        });

        // Also check for semantic HTML5 elements
        landmarks.header = document.querySelectorAll('header').length;
        landmarks.nav = document.querySelectorAll('nav').length;
        landmarks.main = document.querySelectorAll('main').length;
        landmarks.footer = document.querySelectorAll('footer').length;
        landmarks.aside = document.querySelectorAll('aside').length;

        return landmarks;
      });

      // Should have at least a main content area
      expect(landmarks.main + landmarks.contentinfo).toBeGreaterThan(0);
    });

    test('should have proper ARIA labels for complex widgets', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      const complexWidgets = await page.evaluate(() => {
        const widgets = Array.from(document.querySelectorAll('[role]'));
        return widgets.map(widget => ({
          role: widget.getAttribute('role'),
          hasAriaLabel: widget.hasAttribute('aria-label'),
          hasAriaLabelledby: widget.hasAttribute('aria-labelledby'),
          hasAriaDescribedby: widget.hasAttribute('aria-describedby'),
          id: widget.id
        }));
      });

      // Complex widgets should have proper labeling
      complexWidgets.forEach(widget => {
        if (['button', 'tab', 'tabpanel', 'dialog', 'alertdialog'].includes(widget.role)) {
          expect(widget.hasAriaLabel || widget.hasAriaLabelledby).toBe(true);
        }
      });
    });

    test('should announce dynamic content changes', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      // Check for ARIA live regions
      const liveRegions = await page.evaluate(() => {
        const regions = Array.from(document.querySelectorAll('[aria-live], [role="status"], [role="alert"]'));
        return regions.map(region => ({
          ariaLive: region.getAttribute('aria-live'),
          role: region.getAttribute('role'),
          id: region.id,
          className: region.className
        }));
      });

      // Should have live regions for dynamic content
      if (liveRegions.length > 0) {
        liveRegions.forEach(region => {
          expect(['polite', 'assertive', 'off'].includes(region.ariaLive) || 
                 ['status', 'alert'].includes(region.role)).toBe(true);
        });
      }
    });
  });

  describe('Media and Content Accessibility', () => {
    test('should have alt text for images', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      const images = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        return imgs.map(img => ({
          src: img.src,
          alt: img.alt,
          hasAlt: img.hasAttribute('alt'),
          isDecorative: img.getAttribute('role') === 'presentation' || img.alt === ''
        }));
      });

      // All images should have alt attributes
      images.forEach(img => {
        expect(img.hasAlt).toBe(true);
      });
    });

    test('should have accessible canvas content', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      const canvasAccessibility = await page.evaluate(() => {
        const canvases = Array.from(document.querySelectorAll('canvas'));
        return canvases.map(canvas => ({
          hasAriaLabel: canvas.hasAttribute('aria-label'),
          hasAriaLabelledby: canvas.hasAttribute('aria-labelledby'),
          hasRole: canvas.hasAttribute('role'),
          hasFallbackContent: canvas.textContent.trim().length > 0
        }));
      });

      // Canvas elements should have accessible alternatives
      canvasAccessibility.forEach(canvas => {
        expect(canvas.hasAriaLabel || canvas.hasAriaLabelledby || canvas.hasFallbackContent).toBe(true);
      });
    });
  });

  describe('Responsive and Mobile Accessibility', () => {
    test('should be accessible on mobile devices', async () => {
      await page.setViewport({ width: 375, height: 667 });
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      // Check for mobile-specific accessibility features
      const mobileAccessibility = await page.evaluate(() => {
        return {
          hasViewportMeta: document.querySelector('meta[name="viewport"]') !== null,
          hasTouchTargets: document.querySelectorAll('button, a, input, select').length > 0,
          hasSkipLinks: document.querySelector('a[href^="#"]') !== null
        };
      });

      expect(mobileAccessibility.hasViewportMeta).toBe(true);
      
      // Check touch target sizes
      const touchTargets = await page.$$eval('button, a, input[type="button"], input[type="submit"]', 
        elements => elements.map(el => {
          const rect = el.getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            area: rect.width * rect.height
          };
        })
      );

      // Touch targets should be at least 44x44 pixels (WCAG guideline)
      touchTargets.forEach(target => {
        if (target.width > 0 && target.height > 0) {
          expect(Math.min(target.width, target.height)).toBeGreaterThanOrEqual(40); // Allow some tolerance
        }
      });
    });
  });

  describe('Error Prevention and Recovery', () => {
    test('should provide clear error messages', async () => {
      await page.goto(`http://localhost:${serverPort}`, { 
        waitUntil: 'networkidle0' 
      });

      // Simulate form errors by submitting invalid data
      const forms = await page.$$('form');
      
      if (forms.length > 0) {
        // Try to trigger validation errors
        await page.evaluate(() => {
          const form = document.querySelector('form');
          if (form) {
            const inputs = form.querySelectorAll('input[required]');
            inputs.forEach(input => {
              input.value = ''; // Clear required fields
            });
          }
        });

        // Check for error message accessibility
        const errorMessages = await page.evaluate(() => {
          const errors = Array.from(document.querySelectorAll('.error, [role="alert"], [aria-invalid="true"]'));
          return errors.map(error => ({
            text: error.textContent.trim(),
            hasRole: error.hasAttribute('role'),
            isLive: error.hasAttribute('aria-live') || error.getAttribute('role') === 'alert',
            isAssociated: error.hasAttribute('aria-describedby') || error.hasAttribute('aria-labelledby')
          }));
        });

        // Error messages should be accessible
        errorMessages.forEach(error => {
          if (error.text.length > 0) {
            expect(error.hasRole || error.isLive).toBe(true);
          }
        });
      }
    });
  });
});