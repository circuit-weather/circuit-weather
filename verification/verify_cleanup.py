from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Capture console logs to check for errors
        console_logs = []
        page.on("console", lambda msg: console_logs.append(msg.text))

        try:
            # Navigate to the app
            page.goto("http://localhost:8080")

            # Wait for map or some element to load
            page.wait_for_selector(".map", timeout=10000)

            # Take a screenshot
            page.screenshot(path="verification/screenshot.png")

            # Check for errors in console
            errors = [log for log in console_logs if "error" in log.lower()]
            if errors:
                print("Console Errors found:")
                for err in errors:
                    print(err)
            else:
                print("No console errors found.")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
