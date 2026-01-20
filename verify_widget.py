
import asyncio
import http.server
import socketserver
import threading
from playwright.async_api import async_playwright, expect

PORT = 8000
# Serve the public directory
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory="public", **kwargs)

async def main():
    # Allow the port to be reused
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        server_thread = threading.Thread(target=httpd.serve_forever)
        server_thread.daemon = True
        server_thread.start()

        async with async_playwright() as p:
            # Test Desktop
            browser = await p.chromium.launch()
            page = await browser.new_page()

            page.on("pageerror", lambda exc: print(f"Page error: {exc}"))

            # Mock the external APIs called when isLocal is true
            await page.route("https://api.jolpi.ca/ergast/f1/current.json", lambda route: route.fulfill(
                status=200,
                content_type="application/json",
                body='{"MRData": {"RaceTable": {"Races": [{"round": "1", "raceName": "Test Race 1", "date": "2025-01-01", "Circuit": {"Location": {"lat": "1", "long": "1"}}}, {"round": "2", "raceName": "Test Race 2", "date": "2025-01-01", "Circuit": {"Location": {"lat": "2", "long": "2"}}}]}}}'
            ))
            await page.route("https://api.open-meteo.com/v1/forecast**", lambda route: route.fulfill(
                status=200,
                content_type="application/json",
                body='{"current": {"temperature_2m": 20, "relative_humidity_2m": 50, "wind_speed_10m": 10}, "current_units": {"temperature_2m": "°C", "wind_speed_10m": "km/h"}, "hourly": {"time": [], "temperature_2m": [], "relative_humidity_2m": [], "precipitation_probability": [], "wind_speed_10m": [], "wind_direction_10m": [], "weather_code": []}}'
            ))

            await page.goto(f"http://localhost:{PORT}")

            desktop_widget = page.locator(".weather-widget")
            await expect(desktop_widget).to_be_hidden()

            await page.select_option("#roundSelect", "1")

            await expect(desktop_widget).to_be_visible()
            print("Desktop verification successful.")
            await page.screenshot(path="desktop_widget.png")

            # Test Mobile
            await page.set_viewport_size({"width": 375, "height": 667})
            # Reload the page to reset the state for the mobile test
            await page.reload()

            mobile_widget = page.locator("#mobileWeatherCard")
            await expect(mobile_widget).to_be_hidden()

            # Wait for the dropdown to be populated before trying to select an option
            await page.wait_for_selector('#roundSelect option[value="2"]', state='attached')

            await page.select_option("#roundSelect", "2") # Select a different round to trigger the update

            await expect(mobile_widget).to_be_visible()
            print("Mobile verification successful.")
            await page.screenshot(path="mobile_widget.png")

            await browser.close()
        httpd.shutdown()

if __name__ == "__main__":
    asyncio.run(main())
