import asyncio
import os
import subprocess
import time
from playwright.async_api import async_playwright

# --- Configuration ---
PORT = 8765
PUBLIC_DIR = "public"
BASE_URL = f"http://localhost:{PORT}"
VERIFICATIONS_DIR = "verifications"
DESKTOP_SS_PATH = os.path.join(VERIFICATIONS_DIR, "desktop_verification.png")
MOBILE_SS_PATH = os.path.join(VERIFICATIONS_DIR, "mobile_verification.png")

# --- Verification Steps ---
async def main():
    """Main function to run the verification steps."""
    server_process = None
    try:
        # Create verifications directory if it doesn't exist
        os.makedirs(VERIFICATIONS_DIR, exist_ok=True)

        # 1. Start the local web server
        print(f"Starting Python HTTP server for directory '{PUBLIC_DIR}' on port {PORT}...")
        server_process = subprocess.Popen(
            ["python3", "-m", "http.server", str(PORT)],
            cwd=PUBLIC_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        time.sleep(2)
        print("Server started successfully.")

        # 2. Run Playwright tests
        async with async_playwright() as p:
            # --- Desktop Verification ---
            print("Running Desktop verification...")
            browser_desktop = await p.chromium.launch(headless=True)
            page_desktop = await browser_desktop.new_page()
            await page_desktop.set_viewport_size({"width": 1280, "height": 800})
            await page_desktop.goto(BASE_URL)
            await page_desktop.wait_for_selector(".leaflet-control-weather", state="visible")
            await page_desktop.screenshot(path=DESKTOP_SS_PATH)
            print(f"Desktop screenshot saved to {DESKTOP_SS_PATH}")
            await browser_desktop.close()

            # --- Mobile Verification ---
            print("Running Mobile verification...")
            browser_mobile = await p.chromium.launch(headless=True)
            page_mobile = await browser_mobile.new_page(
                user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 13_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Mobile/15E148 Safari/604.1"
            )
            await page_mobile.set_viewport_size({"width": 375, "height": 667})
            await page_mobile.goto(BASE_URL)
            await page_mobile.wait_for_selector(".leaflet-control-weather", state="visible")
            await page_mobile.screenshot(path=MOBILE_SS_PATH)
            print(f"Mobile screenshot saved to {MOBILE_SS_PATH}")
            await browser_mobile.close()

        print("Verification successful!")

    except Exception as e:
        print(f"An error occurred during verification: {e}")

    finally:
        # 3. Stop the server
        if server_process:
            print("Stopping the server...")
            server_process.terminate()
            server_process.wait()
            print("Server stopped.")

if __name__ == "__main__":
    asyncio.run(main())
