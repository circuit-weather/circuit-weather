import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        await page.goto("http://localhost:8000")

        try:
            # Wait for the initial app loading to complete
            await page.wait_for_selector("#loadingOverlay", state="hidden", timeout=15000)

            # The dropdown is populated dynamically. Wait for the first real option.
            await page.wait_for_selector("#roundSelect option[value='1']", timeout=10000)

            # Select the first round to trigger the map load
            await page.select_option("#roundSelect", index=1)

            # Now that a round is selected, the map should load
            await page.wait_for_selector(".leaflet-container", state="visible", timeout=10000)

            # And the radar controls should appear
            await page.wait_for_selector("#radarControls", state="visible", timeout=10000)

            await page.screenshot(path="final_verification.png")

        except Exception as e:
            print(f"Verification failed: {e}")
            await page.screenshot(path="final_error.png")

        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
