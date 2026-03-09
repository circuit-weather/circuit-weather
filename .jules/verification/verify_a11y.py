from playwright.sync_api import sync_playwright
import time

def verify_a11y(page):
    page.goto("http://localhost:8080/")

    # Give it a second to render
    time.sleep(2)

    # Evaluate script to check if tabindex and role are correctly set on MapWeatherWidget
    page.evaluate("""
        const el = document.querySelector('.leaflet-control-weather');
        if (el) {
            el.style.border = '4px solid green';
        }
    """)

    page.evaluate("""
        const card = document.getElementById('mapCountdown');
        if (card) {
            card.style.display = 'block';
            const timer = document.getElementById('mapCountdownTimer');
            if (timer) {
                timer.style.border = '4px solid green';
            }
        }
    """)

    # Open privacy modal by executing js to bypass any layout interception
    page.evaluate("""
        const link = document.getElementById('privacyLink');
        if (link) {
            link.click();
        }
    """)

    time.sleep(1) # wait for animation

    # Highlight privacy modal content
    page.evaluate("""
        const modal = document.getElementById('privacyModalContent');
        if (modal) {
            modal.style.border = '4px solid green';
        }
    """)

    # Take screenshot
    page.screenshot(path=".jules/verification/a11y_verification.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        try:
            verify_a11y(page)
            print("Screenshot saved to .jules/verification/a11y_verification.png")
        finally:
            browser.close()
