from playwright.sync_api import sync_playwright

def test_skip_link():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Build step isn't required for this static HTML/CSS check,
        # but we need to serve the files so they load correctly.
        # We can just open the local file directly.
        import os
        filepath = f"file://{os.path.abspath('public/index.html')}"

        try:
            page.goto(filepath)

            # Wait for app layout to be ready
            page.wait_for_selector('.app-layout')

            # Find the skip link
            skip_link = page.locator('.skip-link')

            # Take a screenshot before focus
            page.screenshot(path=".jules/verification/before_focus.png")

            # Focus the skip link (this should make it visible)
            skip_link.focus()

            # Wait a moment for the CSS transition
            page.wait_for_timeout(500)

            # Take a screenshot after focus
            page.screenshot(path=".jules/verification/after_focus.png")

            print("Screenshots captured successfully.")
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    test_skip_link()
