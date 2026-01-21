from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()

    # Desktop
    page.set_viewport_size({"width": 1280, "height": 800})
    page.goto("http://localhost:8000")
    page.wait_for_selector("#weatherWidget", state="visible")
    page.screenshot(path="desktop.png")

    # Mobile
    page.set_viewport_size({"width": 375, "height": 667})
    page.reload()
    page.wait_for_selector("#weatherWidget", state="visible")
    page.screenshot(path="mobile.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
