from playwright.sync_api import sync_playwright
import time
import re

def verify_weather_app():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Intercept and verify weather API requests
        request_captured = False

        def handle_request(route, request):
            nonlocal request_captured
            if "api.open-meteo.com" in request.url:
                print(f"Captured Request: {request.url}")
                # Check for rounded coordinates
                # rLat for 48.8566 is 48.86
                if "latitude=48.86" in request.url and "longitude=2.35" in request.url:
                     print("PASS: URL contains rounded coordinates.")
                     request_captured = True
                else:
                     print("FAIL: URL does NOT contain expected rounded coordinates.")
            route.continue_()

        page.route("**/*", handle_request)

        print("Navigating to app...")
        page.goto("http://localhost:8000")

        # Wait for map and potentially weather load
        time.sleep(5)

        # Take screenshot
        page.screenshot(path="verification.png")
        print("Screenshot saved to verification.png")

        browser.close()

        if request_captured:
            print("Verification Successful: Weather request captured and validated.")
        else:
             print("Warning: No weather request captured (or logic failed).")

if __name__ == "__main__":
    verify_weather_app()
