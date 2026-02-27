from playwright.sync_api import sync_playwright

def verify_share_button():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use mobile viewport
        context = browser.new_context(
            viewport={'width': 375, 'height': 800},
            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1'
        )
        page = context.new_page()

        # Navigate to the app
        page.goto("http://localhost:8787")

        # Open the sidebar
        page.click("#mobileMenuBtn")

        # Wait for sidebar to be visible (it has class sidebar--open)
        page.wait_for_selector(".sidebar.sidebar--open")

        # Wait for options to be populated in the select
        # We just wait for the second option (index 1) to exist in the DOM
        page.wait_for_selector("#roundSelect option:nth-child(2)", state="attached")

        # Force selection via JS to avoid visibility issues with native select on mobile emulation
        page.select_option("#roundSelect", index=1)

        # Close sidebar by clicking backdrop
        page.click("#sidebarBackdrop")

        # Wait for sidebar to close
        page.wait_for_selector(".sidebar:not(.sidebar--open)")

        # Wait for Mobile Race Info to appear
        page.wait_for_selector("#mobileRaceInfo", state="visible")

        # Give it a moment to settle
        page.wait_for_timeout(500)

        # Take a screenshot of the mobile race info banner
        page.screenshot(path=".jules/verification/mobile_share_button.png")

        browser.close()

if __name__ == "__main__":
    verify_share_button()
