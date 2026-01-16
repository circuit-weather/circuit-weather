from playwright.sync_api import Page, expect, sync_playwright
import time

def verify_range_circles(page: Page):
    # 1. Go to app
    page.goto("http://localhost:8080")

    # 2. Wait for map to load (leaflet-container)
    page.wait_for_selector(".leaflet-container")

    # 3. Wait for range circles (class 'range-label')
    try:
        page.wait_for_selector(".range-label", timeout=10000)
    except:
        pass

    # 4. Wait a bit for tiles
    time.sleep(2)

    # 5. Take screenshot
    page.screenshot(path="verification_frontend.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 720})
        try:
            verify_range_circles(page)
        finally:
            browser.close()
