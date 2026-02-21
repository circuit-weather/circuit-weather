import { FEATURE_FLAGS } from '../config.js';

export class WeatherWidget {
    constructor() {
        this.el = null;
        this.create();
    }

    create() {
        // Feature flag: Don't create widget if current weather is disabled
        if (!FEATURE_FLAGS.enableCurrentWeather) return;

        const container = document.querySelector('.main-content');
        if (!container) return;

        this.el = document.createElement('div');
        this.el.className = 'weather-widget';
        // HTML injected by JS
        this.el.innerHTML = `
            <div class="weather-widget-metric" id="widgetTempGroup" role="group" aria-label="Temperature" title="Temperature">
                <svg class="icon-weather icon-temp" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
                </svg>
                <span id="widgetTemp">--</span>
            </div>
            <div class="weather-widget-metric" id="widgetHumidGroup" role="group" aria-label="Humidity" title="Humidity">
                <svg class="icon-weather icon-humidity" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                </svg>
                <span id="widgetHumidity">--</span>
            </div>
            <div class="weather-widget-metric" id="widgetWindGroup" role="group" aria-label="Wind Speed" title="Wind Speed">
                 <svg class="icon-weather icon-wind" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
                </svg>
                <span id="widgetWind">--</span>
            </div>
        `;

        container.appendChild(this.el);
    }

    update(weather) {
        if (!this.el) return;

        if (!weather || !weather.current) {
            this.el.style.display = 'none';
            return;
        }

        // Only toggle flex, visibility controlled by CSS media query (hidden on mobile)
        this.el.style.display = 'flex';

        const temp = Math.round(weather.current.temperature_2m);
        const humidity = Math.round(weather.current.relative_humidity_2m || 0);
        const wind = Math.round(weather.current.wind_speed_10m);

        const tempEl = document.getElementById('widgetTemp');
        const humidEl = document.getElementById('widgetHumidity');
        const windEl = document.getElementById('widgetWind');

        if (tempEl) tempEl.textContent = `${temp}${weather.units.temperature_2m}`;
        if (humidEl) humidEl.textContent = `${humidity}%`;
        if (windEl) windEl.textContent = `${wind} ${weather.units.wind_speed_10m}`;
    }
}
