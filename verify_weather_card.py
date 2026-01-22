
from playwright.sync_api import sync_playwright, expect

def verify_weather_widget():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000")

        # Select a round and session to trigger the weather display
        page.select_option("#roundSelect", "1")
        page.select_option("#sessionSelect", "race")

        # Wait for the weather widget to be visible
        weather_widget = page.locator(".leaflet-control-weather")
        expect(weather_widget).to_be_visible(timeout=10000)

        # Wait for the precipitation data to be populated, indicating the API call has finished
        precip_value = weather_widget.locator('div[title="Precipitation"] span')
        expect(precip_value).not_to_have_text("--%", timeout=10000)

        # Take a screenshot of just the weather widget for verification
        weather_widget.screenshot(path="verification.png")
        browser.close()

if __name__ == "__main__":
    verify_weather_widget()
