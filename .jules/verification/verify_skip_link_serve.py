from playwright.sync_api import sync_playwright
import threading
import http.server
import socketserver
import os

PORT = 8000

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory="public", **kwargs)

def start_server():
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        httpd.serve_forever()

def test_skip_link():
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            page.goto(f"http://localhost:{PORT}")

            # Wait for app layout to be ready
            page.wait_for_selector('.app-layout')

            # Find the skip link
            skip_link = page.locator('.skip-link')

            # Focus the skip link (this should make it visible)
            skip_link.focus()

            # Wait a moment for the CSS transition
            page.wait_for_timeout(500)

            # Take a screenshot after focus
            page.screenshot(path=".jules/verification/after_focus_served.png")

            print("Screenshots captured successfully.")
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    test_skip_link()
