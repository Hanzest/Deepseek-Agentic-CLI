import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { chromium } from 'playwright-core';
import { describe, it, expect } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const htmlPath = join(__dirname, '..', 'index.html');
const fileUrl = `file://${htmlPath.replace(/\\/g, '/')}`;

const week1Path = join(__dirname, '..', '..', 'z_secrets', 'self-mastery-curriculum', 'communication', 'week-01-listening.json');
const week2Path = join(__dirname, '..', '..', 'z_secrets', 'self-mastery-curriculum', 'communication', 'week-02-clear-expression.json');

describe('SPA Interactive Learning Integration', () => {
  it('loads, uploads pages, shows correct sidebar titles, and handles re-rendering and quiz interaction', async () => {
    console.log("Launching chrome browser...");
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);

    // Log browser console logs
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));

    try {
      console.log("Navigating to HTML page:", fileUrl);
      await page.goto(fileUrl);

      console.log("Checking welcome text...");
      const welcomeText = await page.textContent('body');
      expect(welcomeText).toContain('to get started');

      console.log("Clearing localStorage...");
      await page.evaluate(() => {
        localStorage.clear();
      });
      await page.reload();

      console.log("Uploading curriculum files...");
      const fileInput = await page.locator('input[type=file]').first();
      await fileInput.setInputFiles([week1Path, week2Path]);

      console.log("Waiting for files to load...");
      await page.waitForTimeout(1000);

      console.log("Reading sidebar titles...");
      const sidebarLinks = page.locator('.page-list div.group > button span.truncate');
      const count = await sidebarLinks.count();
      console.log(`Found ${count} page titles in sidebar`);
      expect(count).toBe(2);

      const titles = [];
      for (let i = 0; i < count; i++) {
        titles.push((await sidebarLinks.nth(i).textContent()).trim());
      }
      console.log("Sidebar titles found:", titles);
      expect(titles).toContain('Week 1 — Listening & Empathy');
      expect(titles).toContain('Week 2 — Clear Expression & Structured Thinking');

      console.log("Navigating to Week 1 page...");
      const week1Btn = page.locator('.page-list div.group > button').filter({ hasText: 'Week 1' });
      await week1Btn.click();
      await page.waitForTimeout(500);

      const mainTitle1 = await page.locator('main h1').textContent();
      console.log("Main content title:", mainTitle1.trim());
      expect(mainTitle1.trim()).toBe('Week 1 — Listening & Empathy');

      const hookSection = await page.locator('main h2').nth(0).textContent();
      console.log("First section header:", hookSection.trim());
      expect(hookSection.trim()).toContain('Hook');

      console.log("Navigating to Week 2 page...");
      const week2Btn = page.locator('.page-list div.group > button').filter({ hasText: 'Week 2' });
      await week2Btn.click();
      await page.waitForTimeout(500);

      const mainTitle2 = await page.locator('main h1').textContent();
      console.log("Main content title after nav:", mainTitle2.trim());
      expect(mainTitle2.trim()).toBe('Week 2 — Clear Expression & Structured Thinking');

      const pyramidSection = await page.locator('main h2').nth(0).textContent();
      console.log("Week 2 first section header:", pyramidSection.trim());
      expect(pyramidSection.trim()).toContain('Email');

      console.log("Navigating back to Week 1 page...");
      await week1Btn.click();
      await page.waitForTimeout(500);

      console.log("Looking for quiz option...");
      const quizOption = page.locator('input[type="radio"]').first();
      console.log("Clicking quiz option...");
      await quizOption.click();
      
      console.log("Verifying quiz option is checked...");
      const isChecked = await quizOption.isChecked();
      console.log("Is quiz option checked:", isChecked);
      expect(isChecked).toBe(true);

      console.log("Test execution completed successfully!");
    } finally {
      await browser.close();
      console.log("Browser closed.");
    }
  }, 40000); // 40s timeout
});
