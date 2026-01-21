
from playwright.sync_api import sync_playwright, expect

def verify_forecast_card(page):
    page.goto("http://localhost:8000")

    # Select a round and session to trigger the forecast
    round_select = page.locator("#roundSelect")
    round_select.select_option("1")

    session_select = page.locator("#sessionSelect")
    session_select.select_option("race")

    # Wait for the forecast to be visible
    forecast_section = page.locator("#forecastSection")
    expect(forecast_section).to_be_visible()

    # Take a screenshot of the sidebar
    sidebar = page.locator("#sidebar")
    sidebar.screenshot(path="verification.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_forecast_card(page)
        finally:
            browser.close()
