import time
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Use a list to store routes we want to hold (simulate delay)
        pending_routes = []

        def handle_route(route):
            print(f"Holding request: {route.request.url}")
            pending_routes.append(route)
            # Do NOT continue yet. This simulates the server taking forever.

        # Intercept rainviewer metadata
        page.route("**/weather-maps.json", handle_route)

        try:
            print("Navigating to app...")
            page.goto("http://localhost:8000")

            # Initial page load triggers the request. We must release it so the app initializes.
            print("Processing initial requests...")
            # Wait a moment for requests to queue
            time.sleep(1)
            while len(pending_routes) > 0:
                print("Releasing initial request...")
                route = pending_routes.pop(0)
                route.continue_()

            # Setup for interaction
            print("Waiting for roundSelect...")
            page.wait_for_selector("#roundSelect")
            page.wait_for_function("document.getElementById('roundSelect').options.length > 1")

            print("Selecting round...")
            page.select_option("#roundSelect", "1")

            # Release any requests triggered by selecting round
            time.sleep(1)
            while len(pending_routes) > 0:
                print("Releasing round select request...")
                route = pending_routes.pop(0)
                route.continue_()

            print("Waiting for sessionSelect...")
            page.wait_for_selector("#sessionSelect")
            page.wait_for_function("document.getElementById('sessionSelect').options.length > 1")

            print("Selecting session to trigger loading...")
            page.select_option("#sessionSelect", "race")

            # Wait for the request to be captured
            print("Waiting for request to be captured...")
            for _ in range(50): # Wait up to 5s
                if len(pending_routes) > 0:
                    break
                time.sleep(0.1)

            if len(pending_routes) == 0:
                print("WARNING: No request was intercepted during selectSession!")

            # Now the request is HELD. The loading state should be ACTIVE.
            print("Checking for loading overlay...")
            loading = page.locator("#loadingOverlay")

            # Check visibility
            if loading.is_visible():
                print("SUCCESS: Loading overlay is visible")
                page.screenshot(path="verification/loading_visible.png")
            else:
                print("FAILURE: Loading overlay is NOT visible")
                try:
                    print("Overlay classes:", page.eval_on_selector("#loadingOverlay", "e => e.className"))
                    print("Overlay style:", page.eval_on_selector("#loadingOverlay", "e => e.getAttribute('style')"))
                except:
                    pass

            # Cleanup: Release the held request to let the app finish
            print("Releasing held request...")
            while len(pending_routes) > 0:
                pending_routes.pop(0).continue_()

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
