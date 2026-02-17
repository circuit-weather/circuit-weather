
import json
from datetime import datetime, timedelta
from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Capture logs
        page.on("console", lambda msg: print(f"BROWSER LOG: {msg.text}"))
        page.on("pageerror", lambda err: print(f"BROWSER ERROR: {err}"))

        # Check if app.js is updated
        print("Checking app.js content...")
        try:
            resp = page.request.get("http://localhost:8787/app.js")
            if "icon-wind-arrow" in resp.text():
                print("SUCCESS: app.js contains the new icon code.")
            else:
                print("FAILURE: app.js does NOT contain the new icon code. Server might be caching old version.")
        except Exception as e:
            print(f"Could not fetch app.js: {e}")

        # 1. Mock F1 Schedule (Set next race to tomorrow)
        def handle_f1_schedule(route):
            tomorrow = datetime.now() + timedelta(days=1)
            date_str = tomorrow.strftime("%Y-%m-%d")

            response_data = {
                "MRData": {
                    "RaceTable": {
                        "Races": [
                            {
                                "round": "1",
                                "raceName": "Test Grand Prix",
                                "date": date_str,
                                "time": "14:00:00Z",
                                "Circuit": {
                                    "circuitId": "albert_park",
                                    "circuitName": "Albert Park Grand Prix Circuit",
                                    "Location": {
                                        "lat": "-37.8497",
                                        "long": "144.968",
                                        "locality": "Melbourne",
                                        "country": "Australia"
                                    }
                                },
                                "FirstPractice": {"date": date_str, "time": "01:00:00Z"},
                                "SecondPractice": {"date": date_str, "time": "05:00:00Z"},
                                "ThirdPractice": {"date": date_str, "time": "03:00:00Z"},
                                "Qualifying": {"date": date_str, "time": "06:00:00Z"}
                            }
                        ]
                    }
                }
            }
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(response_data)
            )

        page.route("**/api/f1/current.json", handle_f1_schedule)

        # 2. Mock Weather API (Open-Meteo)
        def handle_weather(route):
            print(f"Intercepted Weather Request: {route.request.url}")
            now_ts = int(datetime.now().timestamp())
            # Ensure we cover the "future" session time (tomorrow)
            # Start from yesterday to cover everything
            start_ts = now_ts - 86400

            time_array = [start_ts + (i * 3600) for i in range(100)]
            count = len(time_array)

            response_data = {
                "current": {
                    "time": now_ts,
                    "interval": 900,
                    "temperature_2m": 20.0,
                    "relative_humidity_2m": 50,
                    "precipitation_probability": 0,
                    "rain": 0,
                    "showers": 0,
                    "weather_code": 0,
                    "wind_speed_10m": 15.0,
                    "wind_direction_10m": 90, # EAST
                    "wind_gusts_10m": 25.0
                },
                "hourly": {
                    "time": time_array,
                    "temperature_2m": [20.0] * count,
                    "relative_humidity_2m": [50] * count,
                    "precipitation_probability": [0] * count,
                    "wind_speed_10m": [15.0] * count,
                    "wind_direction_10m": [90] * count,
                    "weather_code": [0] * count
                },
                "current_units": {
                    "time": "iso8601",
                    "interval": "seconds",
                    "temperature_2m": "°C",
                    "relative_humidity_2m": "%",
                    "precipitation_probability": "%",
                    "rain": "mm",
                    "showers": "mm",
                    "weather_code": "wmo code",
                    "wind_speed_10m": "km/h",
                    "wind_direction_10m": "°",
                    "wind_gusts_10m": "km/h"
                }
            }

            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(response_data)
            )

        page.route("https://api.open-meteo.com/**", handle_weather)

        # Also intercept radar/track
        page.route("**/api/radar", lambda r: r.fulfill(status=200, body=json.dumps({"radar": {"past": [], "nowcast": []}})))
        page.route("**/api/track/**", lambda r: r.fulfill(status=200, body=json.dumps({"type": "FeatureCollection", "features": []})))

        # 3. Navigate
        print("Navigating to app...")
        page.goto("http://localhost:8787/")

        # 4. Wait for the wind arrow element
        print("Waiting for wind arrow...")
        try:
            selector = "#weatherWindDir svg.icon-wind-arrow"
            page.wait_for_selector(selector, state="visible", timeout=8000)

            # 5. Verify properties
            element = page.locator(selector)
            style = element.get_attribute("style")
            print(f"Found style: {style}")

            if "rotate(270deg)" in style:
                print("SUCCESS: Wind arrow rotation is correct (270deg).")
            else:
                print("FAILURE: Wind arrow rotation is incorrect.")

            page.screenshot(path="verification_success.png")

        except Exception as e:
            print(f"Error during verification: {e}")

            # Debug Dump
            try:
                forecast_html = page.locator("#forecastContent").inner_html()
                print(f"DUMP #forecastContent: {forecast_html[:500]}...") # First 500 chars
            except:
                print("Could not dump forecast content.")

            page.screenshot(path="verification_failure.png")
            print("Screenshot saved to verification_failure.png")

        browser.close()

if __name__ == "__main__":
    run()
