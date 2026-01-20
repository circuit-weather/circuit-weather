from playwright.sync_api import sync_playwright
import json

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Listen for console messages
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))

        # Mock F1 API
        page.route("**/api.jolpi.ca/ergast/f1/current.json", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({
                "MRData": {
                    "RaceTable": {
                        "Races": [
                            {
                                "round": "1",
                                "raceName": "Bahrain Grand Prix",
                                "Circuit": {
                                    "Location": {"lat": "26.0325", "long": "50.5106", "country": "Bahrain"},
                                    "circuitId": "bahrain",
                                    "circuitName": "Bahrain International Circuit"
                                },
                                "date": "2024-03-02",
                                "time": "15:00:00Z",
                                "FirstPractice": {"date": "2024-02-29", "time": "11:30:00Z"},
                                "SecondPractice": {"date": "2024-02-29", "time": "15:00:00Z"},
                                "ThirdPractice": {"date": "2024-03-01", "time": "12:30:00Z"},
                                "Qualifying": {"date": "2024-03-01", "time": "16:00:00Z"}
                            }
                        ]
                    }
                }
            })
        ))

        # Mock RainViewer API
        page.route("**/api.rainviewer.com/public/weather-maps.json", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({
                "host": "https://tilecache.rainviewer.com",
                "radar": {
                    "past": [{"time": 1709391600, "path": "/v1/radar/1709391600"}],
                    "nowcast": [{"time": 1709395200, "path": "/v1/radar/1709395200"}]
                }
            })
        ))

        print("Navigating to app...")
        page.goto("http://localhost:8080")

        print("Waiting for rounds to load...")
        try:
            # Wait for round select to populate
            page.wait_for_selector("#roundSelect option:nth-child(2)", state="attached", timeout=10000)
        except Exception as e:
            print(f"Round select did not populate: {e}")
            raise e

        # Select round
        print("Selecting round...")
        page.select_option("#roundSelect", value="1")

        # Verify Share Button visibility
        print("Checking share button...")
        share_btn = page.locator("#shareBtn")
        if not share_btn.is_visible():
            raise Exception("Share button is not visible!")

        # Click share button
        print("Clicking share button...")

        # We need to grant clipboard permissions or mock clipboard
        page.context.grant_permissions(["clipboard-read", "clipboard-write"])

        # Mock clipboard writeText since standard permission might not be enough in headless
        page.evaluate("""
            navigator.clipboard.writeText = (text) => {
                window._copiedText = text;
                return Promise.resolve();
            };
        """)

        share_btn.click()

        # Check for visual feedback class
        print("Checking for feedback class...")
        page.wait_for_selector("#shareBtn.copied", timeout=2000)

        # Check aria-label change
        label = share_btn.get_attribute("aria-label")
        if label != "Link copied!":
            raise Exception(f"Expected aria-label 'Link copied!', got '{label}'")

        print("Share button verified successfully!")

        # Screenshot for proof
        page.screenshot(path="verification/share_btn_feedback.png")

        browser.close()

if __name__ == "__main__":
    run()
