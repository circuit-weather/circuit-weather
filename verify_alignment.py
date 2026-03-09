import asyncio
from playwright.async_api import async_playwright
import os

async def verify():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        # Standard desktop resolution
        page = await browser.new_page(viewport={'width': 1024, 'height': 768})

        # Start wrangler dev in the background if not already running
        # Assuming it might be running or we can start it.
        # For simplicity, I'll just try to connect to 8787 if it's up.
        # But I should probably start it.

        try:
            await page.goto("http://localhost:8787", wait_until="networkidle")

            # Wait for map and countdown
            await page.wait_for_selector("#mapCountdown", state="attached")

            # Take a screenshot
            await page.screenshot(path="verification_alignment.png")
            print("Screenshot saved to verification_alignment.png")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(verify())
