import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        # Mobile view
        context = await browser.new_context(
            viewport={'width': 375, 'height': 667},
            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1'
        )
        page = await context.new_page()

        # Go to the local dev server
        try:
            await page.goto('http://localhost:8787', wait_until='networkidle')
        except Exception as e:
            print(f"Error navigating: {e}")
            await browser.close()
            return

        # Wait for the map countdown to be visible
        try:
            await page.wait_for_selector('#mapCountdown', state='visible', timeout=5000)
            print("Map countdown is visible on mobile.")
        except:
            print("Map countdown NOT visible on mobile.")

        # Check if sidebar countdown exists (it shouldn't)
        sidebar_countdown = await page.query_selector('#countdownCard')
        if sidebar_countdown:
            print("Sidebar countdown STILL EXISTS on mobile!")
        else:
            print("Sidebar countdown removed on mobile.")

        # Capture screenshot
        await page.screenshot(path='verification_mobile.png')

        # Check sidebar (mobile often has a toggle)
        # In this app, mobile sidebar is usually hidden by default or overlaid.

        await browser.close()

if __name__ == '__main__':
    asyncio.run(run())
