import { i18n } from '../i18n/index.js';

/**
 * Custom Control for showing weather data on the map.
 * Compatible with both Leaflet and Mapbox GL JS interfaces.
 */
class MapWeatherWidgetClass {
    constructor() {
        // Scout: Upgraded generic div to semantic section to improve document outline and explicitly signal this standalone widget region to search engines.
        this._div = document.createElement('section');
        this._div.className = 'leaflet-control-weather mapboxgl-ctrl mapboxgl-ctrl-group';
        this._div.setAttribute('role', 'region');
        this._div.setAttribute('aria-label', i18n.t('weather.currentCircuitWeather'));
        this._div.setAttribute('data-i18n-attr', 'aria-label:weather.currentCircuitWeather');
        this._div.setAttribute('tabindex', '0');

        this._div.innerHTML = `
            <h2 class="weather-widget-heading" data-i18n="weather.currentConditions">${i18n.t('weather.currentConditions')}</h2>
            <div class="weather-widget-metric" role="group" aria-label="${i18n.t('weather.temperature')}" title="${i18n.t('weather.temperature')}" data-i18n-attr="aria-label:weather.temperature,title:weather.temperature">
                <svg class="icon-weather icon-temp" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" /></svg>
                <span class="temp-value">--</span>
            </div>
            <div class="weather-widget-metric" role="group" aria-label="${i18n.t('weather.rainChance')}" title="${i18n.t('weather.rainChance')}" data-i18n-attr="aria-label:weather.rainChance,title:weather.rainChance">
                <svg class="icon-weather icon-rain" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>
                <span class="rain-value">--%</span>
            </div>
            <div class="weather-widget-metric" role="group" aria-label="${i18n.t('weather.humidity')}" title="${i18n.t('weather.humidity')}" data-i18n-attr="aria-label:weather.humidity,title:weather.humidity">
                <svg class="icon-weather icon-humidity" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" /></svg>
                <span class="humid-value">--%</span>
            </div>
            <div class="weather-widget-metric" role="group" aria-label="${i18n.t('weather.windSpeed')}" title="${i18n.t('weather.wind')}" data-i18n-attr="aria-label:weather.windSpeed,title:weather.wind">
                 <svg class="icon-weather icon-wind" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" /></svg>
                <span class="wind-value">--</span>
            </div>
        `;

        this._ui = {
            temp: this._div.querySelector('.temp-value'),
            rain: this._div.querySelector('.rain-value'),
            humid: this._div.querySelector('.humid-value'),
            wind: this._div.querySelector('.wind-value')
        };
    }

    // Leaflet interface
    onAdd(map) {
        // Ensure Leaflet-specific classes are present
        this._div.classList.add('leaflet-control');
        return this._div;
    }

    onRemove(map) {
        if (this._div.parentNode) {
            this._div.parentNode.removeChild(this._div);
        }
    }

    // Mapbox GL JS interface
    getDefaultPosition() {
        return 'top-right';
    }

    update(weather) {
        if (!this._div || !this._ui) return;

        if (!weather || !weather.current) {
            this._ui.temp.textContent = '--';
            this._ui.rain.textContent = '--%';
            this._ui.humid.textContent = '--%';
            this._ui.wind.textContent = '--';
            return;
        }

        const temp = Math.round(weather.current.temperature_2m);
        const rain = Math.round(weather.current.precipitation_probability || 0);
        const humidity = Math.round(weather.current.relative_humidity_2m || 0);
        const wind = Math.round(weather.current.wind_speed_10m);

        this._ui.temp.textContent = `${temp}${weather.units.temperature_2m}`;
        this._ui.rain.textContent = `${rain}%`;
        this._ui.humid.textContent = `${humidity}%`;
        this._ui.wind.textContent = `${wind} ${weather.units.wind_speed_10m}`;
    }
}

// Ensure the class supports both L.Control.extend patterns (if called via Leaflet) and standard ES6 class patterns (Mapbox)
export const MapWeatherWidget = function() {
    return new MapWeatherWidgetClass();
};
MapWeatherWidget.prototype = MapWeatherWidgetClass.prototype;
