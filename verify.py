
import asyncio
from playwright.async_api import async_playwright
import http.server
import socketserver
import threading

PORT = 8000
SCREENSHOT_PATH = "verification_screenshot.png"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory="public", **kwargs)

async def main():
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        server_thread = threading.Thread(target=httpd.serve_forever)
        server_thread.daemon = True
        server_thread.start()
        print(f"Server started at http://localhost:{PORT}")

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, args=["--disable-web-security"])
            page = await browser.new_page()

            try:
                await page.goto(f"http://localhost:{PORT}")

                # Wait for the loading overlay to disappear
                await page.wait_for_selector("#loadingOverlay", state="hidden", timeout=30000)

                # Select a round to activate the radar controls
                await page.select_option("#roundSelect", "8")

                # Wait for the radar controls to become visible
                await page.wait_for_selector("#radarControls", state="visible", timeout=10000)

                # Move the mouse over the slider to trigger the tooltip
                await page.hover("#radarSlider")

                # Take a screenshot of the radar controls area
                element = await page.query_selector("#radarControls")
                if element:
                    await element.screenshot(path=SCREENSHOT_PATH)
                    print(f"Screenshot saved to {SCREENSHOT_PATH}")
                else:
                    print("Could not find the radar controls to screenshot.")

            except Exception as e:
                print(f"An error occurred during verification: {e}")
            finally:
                await browser.close()
                httpd.shutdown()

if __name__ == "__main__":
    asyncio.run(main())
