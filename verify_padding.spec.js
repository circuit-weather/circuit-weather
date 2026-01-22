
import { test, expect } from '@playwright/test';

test('verify mobile weather widget padding', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });

  // Mock the API response to ensure the weather widget renders
  await page.route('**/api/weather**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        latitude: 50.93,
        longitude: 6.95,
        generationtime_ms: 0.2,
        utc_offset_seconds: 0,
        timezone: 'GMT',
        timezone_abbreviation: 'GMT',
        elevation: 48,
        current_units: {
          time: 'iso8601',
          interval: 'seconds',
          temperature_2m: '°C',
          relative_humidity_2m: '%',
          is_day: '',
          precipitation: 'mm',
          weather_code: 'wmo code',
          wind_speed_10m: 'km/h',
        },
        current: {
          time: new Date().toISOString(),
          interval: 900,
          temperature_2m: 15.0,
          relative_humidity_2m: 75,
          is_day: 1,
          precipitation: 0.0,
          weather_code: 0,
          wind_speed_10m: 10.0,
          precipitation_probability: 5,
        },
        hourly_units: {
          time: 'iso8601',
          temperature_2m: '°C',
          precipitation_probability: '%',
        },
        hourly: {
          time: [new Date().toISOString()],
          temperature_2m: [15.0],
          precipitation_probability: [5],
        },
      }),
    });
  });

  await page.goto('http://localhost:8000');

  // Wait for the map to be ready and weather widget to appear
  await page.waitForSelector('.leaflet-control-weather', { state: 'visible' });
  await page.waitForSelector('#weatherWidget .temperature', { state: 'visible' });
  const temperature = await page.textContent('#weatherWidget .temperature');
  expect(temperature).not.toBe('--°');

  await page.screenshot({ path: 'verify_padding_fix.png' });
});
