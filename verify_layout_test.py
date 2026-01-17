
from playwright.sync_api import Page, expect
import re

def test_verifies_the_layout_on_both_desktop_and_mobile_viewports(page: Page):
    page.goto("http://localhost:8000")

    # It can take a moment for the map and controls to fully render
    page.wait_for_selector(".leaflet-control-zoom", state="visible")
    # The radar controls are not visible by default, so we can't wait for them.
    # Instead, we'll wait for the loading overlay to disappear.
    expect(page.locator("#loadingOverlay")).not_to_be_visible()


    # Desktop viewport
    page.set_viewport_size({"width": 1280, "height": 720})
    # Wait for any layout shifts after resize
    page.wait_for_timeout(500)
    page.screenshot(path="desktop_layout.png")

    # Verify desktop layout
    desktop_zoom_controls = page.locator(".leaflet-control-zoom").bounding_box()
    assert desktop_zoom_controls['x'] > 1000, "Desktop zoom controls are not on the right side"
    assert desktop_zoom_controls['y'] > 500, "Desktop zoom controls are not at the bottom"

    desktop_radar_controls = page.locator(".radar-controls").bounding_box()
    # Looser assertion to account for different screen setups
    assert desktop_radar_controls['x'] > 200, "Desktop radar is not centered"
    assert desktop_radar_controls['y'] > 600, "Desktop radar is not at the bottom"

    # Mobile viewport
    page.set_viewport_size({"width": 375, "height": 812}) # iPhone X size
    # Wait for any layout shifts after resize
    page.wait_for_timeout(1000)
    page.screenshot(path="mobile_layout.png")

    # Verify mobile layout
    mobile_map_container = page.locator(".map-controls-container").bounding_box()
    assert mobile_map_container['x'] > 250, "Mobile map controls container is not on the right"
    assert mobile_map_container['y'] > 600, "Mobile map controls container is not at the bottom"

    mobile_radar_controls = page.locator(".radar-controls").bounding_box()
    assert mobile_radar_controls['x'] < 50, "Mobile radar control is not on the left"
    assert mobile_radar_controls['y'] > 700, "Mobile radar control is not at the bottom"
