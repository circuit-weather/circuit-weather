
import asyncio
from playwright.async_api import async_playwright

async def run():
    async def measure(page, name):
        # Wait for dynamic offset updates to settle
        await asyncio.sleep(1)

        measurements = await page.evaluate('''() => {
            const getBox = (selector) => {
                const el = document.querySelector(selector);
                if (!el || window.getComputedStyle(el).display === 'none') return null;
                const rect = el.getBoundingClientRect();
                return { y: rect.top, x: rect.left, w: rect.width, h: rect.height, bottom: rect.bottom, right: rect.right };
            };
            const getVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name);

            return {
                vars: {
                    top: getVar('--mobile-top-offset'),
                    radar: getVar('--mobile-radar-offset'),
                    controls: getVar('--mobile-controls-offset')
                },
                header: getBox('.mobile-header'),
                banner: getBox('.mobile-race-info'),
                weather: getBox('.leaflet-control-weather') || getBox('.mapboxgl-ctrl-top-right'),
                radar: getBox('.radar-controls'),
                controls: getBox('.leaflet-control-zoom') || getBox('.mapbox-zoom-control'),
                attribution: getBox('.mapboxgl-ctrl-bottom-right') || getBox('.leaflet-control-attribution')
            };
        }''')
        print(f"--- {name} ---")
        print(f"Offsets: {measurements['vars']}")

        # Verify collision (top)
        if measurements['banner'] and measurements['weather']:
            gap = measurements['weather']['y'] - measurements['banner']['bottom']
            print(f"Top Gap (Weather - Banner): {gap}px")
            if gap < 7:
                print(f"FAILURE: Weather widget overlaps banner! Gap: {gap}px")

        # Verify collision (bottom)
        if measurements['radar'] and measurements['attribution']:
            gap = measurements['attribution']['y'] - measurements['radar']['bottom']
            print(f"Bottom Gap (Attribution - Radar): {gap}px")
            if gap < 7:
                 print(f"FAILURE: Radar overlaps attribution! Gap: {gap}px")

        if measurements['controls'] and measurements['radar']:
             gap = measurements['radar']['y'] - measurements['controls']['bottom']
             print(f"Control Gap (Radar - Controls): {gap}px")
             if gap < 7:
                  print(f"FAILURE: Controls overlap radar! Gap: {gap}px")

        await page.screenshot(path=f'/home/jules/verification/{name}.png')

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={'width': 390, 'height': 844}, user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1')
        page = await context.new_page()

        await page.goto('http://localhost:8080')
        await page.wait_for_selector('.leaflet-container, .mapboxgl-map')

        # 1. No session (no radar, no banner)
        await measure(page, 'mobile_dynamic_empty')

        # Select round and session via JS to avoid sidebar UI issues in playwright
        await page.evaluate('''() => {
            const app = window.app;
            app.selectRound("1");
        }''')
        await measure(page, 'mobile_dynamic_round')

        await page.evaluate('''async () => {
            const app = window.app;
            await app.selectSession("fp1");
        }''')
        await measure(page, 'mobile_dynamic_session')

        await browser.close()

if __name__ == '__main__':
    asyncio.run(run())
