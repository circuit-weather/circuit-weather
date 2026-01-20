
const { chromium } = require('playwright');
const assert = require('assert');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:8000', { waitUntil: 'networkidle' });

    // Select the first round to trigger the weather widget
    await page.selectOption('#roundSelect', { index: 1 });

    // Wait for the widget to be visible
    await page.waitForSelector('.weather-widget', { state: 'visible', timeout: 15000 });
    console.log('Weather widget is visible.');

    // Check that it has content
    const temp = await page.locator('#widgetTemp').textContent();
    assert.notStrictEqual(temp, '--', 'Temperature should not be the default value.');
    console.log(`Weather widget content verified. Temperature is ${temp}`);

    await page.screenshot({ path: 'weather_widget_visible.png' });
    console.log('Screenshot captured: weather_widget_visible.png');

  } catch (error) {
    console.error('Test failed:', error);
    await page.screenshot({ path: 'error.png' });
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
