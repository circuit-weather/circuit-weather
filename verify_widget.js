
const { chromium } = require('playwright');
const assert = require('assert');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        await page.goto('http://localhost:8000/public/index.html', { waitUntil: 'networkidle' });

        // Select the first round to trigger the live weather widget
        await page.selectOption('#roundSelect', { index: 1 });

        // Wait for the weather widget to be populated
        await page.waitForSelector('#widgetTemp:not(:text("--"))');

        // Check if the weather widget is visible
        const widget = await page.locator('.weather-widget');
        const isVisible = await widget.isVisible();
        assert(isVisible, 'The weather widget should be visible.');

        console.log('Verification successful: The weather widget is visible.');
    } catch (error) {
        console.error('Verification failed:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
