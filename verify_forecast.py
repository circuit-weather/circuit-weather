
from playwright.sync_api import sync_playwright

def verify_weather_widget():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000")

        # Select a round and session to trigger the weather display
        page.select_option("#roundSelect", "1")
        page.select_option("#sessionSelect", "race")

        # Wait for the weather widget to be updated
        page.wait_for_selector("#weather-widget-container .weather-widget-metric")

        # Take a screenshot of the weather widget
        page.screenshot(path="verification.png")
        browser.close()

if __name__ == "__main__":
    verify_weather_widget()
