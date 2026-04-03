
import asyncio
from playwright.async_api import async_playwright

async def run():
    async def measure(page, name):
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
                mapbox_logo: getBox('.mapboxgl-ctrl-bottom-left'),
                attribution: getBox('.mapboxgl-ctrl-bottom-right') || getBox('.leaflet-control-attribution'),
                radar: getBox('.radar-controls'),
                controls: getBox('.mapboxgl-ctrl-top-right') || getBox('.mapbox-zoom-control') || getBox('.leaflet-control-zoom')
            };
        }''')
        print(f"--- {name} ---")
        print(f"Offsets: {measurements['vars']}")

        if measurements['radar'] and (measurements['attribution'] or measurements['mapbox_logo']):
            logo_top = measurements['mapbox_logo']['y'] if measurements['mapbox_logo'] else measurements['attribution']['y']
            gap = logo_top - measurements['radar']['bottom']
            print(f"Bottom Gap: {gap}px")
            if gap < 7:
                 print("FAILURE: Radar overlaps logo/attribution!")

        await page.screenshot(path=f'/home/jules/verification/{name}.png')

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={'width': 390, 'height': 844}, user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1')
        page = await context.new_page()

        await page.goto('http://localhost:8787?renderer=mapbox')
        await page.wait_for_selector('.mapboxgl-map')

        await page.evaluate('''async () => {
            const app = window.app;
            app.selectRound("1");
            await app.selectSession("fp1");
        }''')

        await measure(page, 'mobile_dynamic_mapbox')
        await browser.close()

if __name__ == '__main__':
    asyncio.run(run())
