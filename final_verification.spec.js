
import { test, expect } from '@playwright/test';

test('capture final mobile layout screenshot', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });

  // Go to the page and let it load real data
  await page.goto('http://localhost:8000');

  // Wait for the map to be ready and weather widget to appear and be populated
  await page.waitForSelector('.leaflet-control-weather', { state: 'visible' });
  await page.waitForFunction(() => {
    const tempElement = document.querySelector('.leaflet-control-weather .weather-widget-metric[title="Temperature"] span');
    return tempElement && tempElement.textContent.trim() !== '--';
  });

  // Take the screenshot for final visual verification
  await page.screenshot({ path: 'final_padding_fix_verification.png' });
});
