import { i18n } from '../i18n/index.js';
import { getWindDirection } from '../utils/wind.js';
import { getSessionRainVerdict, sessionHours } from '../utils/rain.js';

const VERDICT_KEYS = Object.freeze({
    dry: 'forecast.verdictDry',
    possible: 'forecast.verdictPossible',
    likely: 'forecast.verdictLikely',
});

/**
 * ForecastRenderer is responsible for constructing DOM elements for weather forecast displays,
 * error states, loading skeletons, and weather metrics.
 */
export class ForecastRenderer {
    createErrorIconSvg(svgNS = "http://www.w3.org/2000/svg") {
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "2");

        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("cx", "12");
        circle.setAttribute("cy", "12");
        circle.setAttribute("r", "10");

        const line1 = document.createElementNS(svgNS, "line");
        line1.setAttribute("x1", "12");
        line1.setAttribute("y1", "8");
        line1.setAttribute("x2", "12");
        line1.setAttribute("y2", "12");

        const line2 = document.createElementNS(svgNS, "line");
        line2.setAttribute("x1", "12");
        line2.setAttribute("y1", "16");
        line2.setAttribute("x2", "12.01");
        line2.setAttribute("y2", "16");

        svg.appendChild(circle);
        svg.appendChild(line1);
        svg.appendChild(line2);
        return svg;
    }

    createLoadingSpinnerSvg(svgNS = "http://www.w3.org/2000/svg") {
        const btnSvg = document.createElementNS(svgNS, "svg");
        btnSvg.setAttribute("aria-hidden", "true");
        btnSvg.setAttribute("style", "width: 1rem; height: 1rem; margin-right: 0.5rem; animation: spin 1s linear infinite;");
        btnSvg.setAttribute("viewBox", "0 0 24 24");
        btnSvg.setAttribute("fill", "none");
        btnSvg.setAttribute("stroke", "currentColor");
        btnSvg.setAttribute("stroke-width", "2");

        const path = document.createElementNS(svgNS, "path");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        path.setAttribute("d", "M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83");

        btnSvg.appendChild(path);
        return btnSvg;
    }

    renderError(message) {
        const sidebarContent = document.querySelector('.sidebar-content');
        if (!sidebarContent) return;

        sidebarContent.textContent = '';
        const errorState = document.createElement('div');
        errorState.className = 'error-state';

        const errorIcon = document.createElement('div');
        errorIcon.className = 'error-icon';
        const svgNS = "http://www.w3.org/2000/svg";
        errorIcon.appendChild(this.createErrorIconSvg(svgNS));
        errorState.appendChild(errorIcon);

        // The error heading uses h2 to maintain correct hierarchy under the h1 sidebar-header when replacing sidebar content.
        const h2 = document.createElement('h2');
        h2.setAttribute('data-i18n', 'errors.connectionFailed');
        h2.textContent = i18n.t('errors.connectionFailed');
        errorState.appendChild(h2);

        const p = document.createElement('p');
        p.textContent = message;
        errorState.appendChild(p);

        const btn = document.createElement('button');
        btn.className = 'retry-btn';
        btn.type = 'button';
        btn.setAttribute('data-i18n', 'common.retry');
        btn.setAttribute('data-i18n-attr', 'aria-label:errors.retryConnection');
        btn.setAttribute('aria-label', i18n.t('errors.retryConnection'));
        btn.textContent = i18n.t('common.retry');
        errorState.appendChild(btn);

        sidebarContent.appendChild(errorState);

        btn.addEventListener('click', () => {
            btn.disabled = true;
            btn.setAttribute('aria-disabled', 'true');
            btn.textContent = '';
            btn.appendChild(this.createLoadingSpinnerSvg(svgNS));
            btn.appendChild(document.createTextNode(i18n.t('common.retrying')));

            btn.setAttribute('aria-label', i18n.t('errors.retryingConnection'));
            window.location.reload();
        });
    }

    renderForecastSkeleton(forecastContent, forecastUnavailable) {
        if (forecastUnavailable) forecastUnavailable.style.display = 'none';
        if (forecastContent) {
            forecastContent.setAttribute('aria-busy', 'true');
            forecastContent.style.display = 'block';
            forecastContent.textContent = '';
            const template = document.getElementById('forecast-skeleton-template');
            if (template && typeof template.cloneNode === 'function') {
                if (template.content) {
                    forecastContent.appendChild(template.content.cloneNode(true));
                } else {
                    const clone = template.cloneNode(true);
                    while (clone.firstChild) {
                        forecastContent.appendChild(clone.firstChild);
                    }
                }
            }
        }
    }

    renderUnavailableForecast(weather, forecastContent, forecastUnavailable, overrideNow = null) {
        if (forecastContent) forecastContent.style.display = 'none';
        if (forecastUnavailable) {
            forecastUnavailable.style.display = 'block';

            const p = forecastUnavailable.querySelector('p');
            if (p) {
                if (weather.reason === 'too_far' && weather.availableFrom) {
                    const now = overrideNow || new Date();
                    if (weather.availableFrom > now) {
                        const dateStr = weather.availableFrom.toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        p.textContent = i18n.t('forecast.availableFrom', { date: dateStr });
                    } else {
                        p.textContent = i18n.t('forecast.availableSoon');
                    }
                } else if (weather.reason === 'error') {
                    p.textContent = i18n.t('forecast.unavailable');
                } else {
                    p.textContent = i18n.t('forecast.availableCloser');
                }
            }
        }
    }

    createMetricElement(i18nKey, valueId, valueText) {
        const div = document.createElement('div');
        div.className = 'weather-metric';
        const dt = document.createElement('dt');
        dt.className = 'weather-label';
        dt.setAttribute('data-i18n', i18nKey);
        dt.textContent = i18n.t(i18nKey);
        const dd = document.createElement('dd');
        dd.className = 'weather-value';
        dd.id = valueId;
        dd.textContent = valueText;
        div.appendChild(dt);
        div.appendChild(dd);
        return div;
    }

    createWindArrowSvg(rotation) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'icon-wind-arrow');
        svg.setAttribute('style', `transform: rotate(${rotation}deg); width: 14px; height: 14px;`);
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2.5');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', '12');
        line.setAttribute('y1', '19');
        line.setAttribute('x2', '12');
        line.setAttribute('y2', '5');
        svg.appendChild(line);

        const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        polyline.setAttribute('points', '5 12 12 5 19 12');
        svg.appendChild(polyline);

        return svg;
    }

    createWindMetricElement(wind, dir, speedUnit, dirUnit) {
        const windInfo = getWindDirection(dir);
        const rotation = Number(windInfo.rotation) || 0;

        const divWind = this.createMetricElement('weather.wind', 'weatherWind', `${wind} ${speedUnit}`);
        const ddWindDir = document.createElement('dd');
        ddWindDir.className = 'weather-sub';
        ddWindDir.id = 'weatherWindDir';
        ddWindDir.title = `${dir}${dirUnit || i18n.t('units.degrees') || '°'}`;
        ddWindDir.setAttribute('aria-label', i18n.t('weather.windDirection', { direction: windInfo.text, degrees: dir }));

        ddWindDir.appendChild(document.createTextNode(windInfo.text + ' '));
        ddWindDir.appendChild(this.createWindArrowSvg(rotation));

        divWind.appendChild(ddWindDir);
        return divWind;
    }

    createCurrentWeatherElement(sessionWeather, units, hourlyData) {
        const temp = Math.round(sessionWeather.temp);
        const wind = Math.round(sessionWeather.windSpeed);
        const dir = sessionWeather.windDir;
        const maxPrecip = Math.max(...hourlyData.map(h => h.precipProb));

        const dl = document.createElement('dl');
        dl.className = 'weather-current';

        dl.appendChild(this.createMetricElement('weather.temp', 'weatherTemp', `${temp}${units.temperature_2m}`));
        dl.appendChild(this.createMetricElement('weather.rain', 'weatherRain', `${maxPrecip}%`));
        dl.appendChild(this.createWindMetricElement(wind, dir, units.wind_speed_10m, units.wind_direction_10m));

        return dl;
    }

    createTimelineItemElement(hour, sessionTime, units, weatherClient) {
        const relTime = weatherClient.getRelativeTime(hour.time, sessionTime);
        const desc = weatherClient.getWeatherDescription(hour.code);
        const a11yTime = weatherClient.getAccessibleRelativeTime(hour.time, sessionTime);
        const temp = Math.round(hour.temp);
        const ariaLabel = i18n.t('weather.timelineAria', {
            time: a11yTime,
            description: desc,
            temp,
            rain: hour.precipProb,
            wind: hour.windSpeed,
            windUnit: units.wind_speed_10m,
        });

        const isoDateTime = new Date(hour.time * 1000).toISOString();

        const li = document.createElement('li');
        li.className = 'weather-timeline-item';
        li.setAttribute('aria-label', ariaLabel);

        const timeEl = document.createElement('time');
        timeEl.setAttribute('datetime', isoDateTime);
        timeEl.className = 'weather-timeline-time';
        timeEl.setAttribute('aria-hidden', 'true');
        timeEl.textContent = relTime;
        li.appendChild(timeEl);

        const conditionDiv = document.createElement('div');
        conditionDiv.className = 'weather-timeline-condition';
        conditionDiv.setAttribute('aria-hidden', 'true');
        conditionDiv.textContent = desc;
        li.appendChild(conditionDiv);

        // Wind stays in the summary above and the row's aria-label; the visible row
        // keeps to the two numbers that change most hour to hour.
        const precipDiv = document.createElement('div');
        precipDiv.className = 'weather-timeline-precip';
        precipDiv.setAttribute('aria-hidden', 'true');
        precipDiv.textContent = `${hour.precipProb}%`;
        li.appendChild(precipDiv);

        const tempDiv = document.createElement('div');
        tempDiv.className = 'weather-timeline-temp';
        tempDiv.setAttribute('aria-hidden', 'true');
        tempDiv.textContent = `${temp}${units.temperature_2m}`;
        li.appendChild(tempDiv);
        return li;
    }

    createTimelineElement(hourlyWeather, sessionTime, units, weatherClient) {
        const section = document.createElement('section');
        section.className = 'weather-timeline';
        section.id = 'weatherTimeline';
        section.tabIndex = 0;
        section.setAttribute('data-i18n-attr', 'aria-label:forecast.hourlyForecast');
        section.setAttribute('aria-label', i18n.t('forecast.hourlyForecast'));

        const ol = document.createElement('ol');
        ol.className = 'weather-timeline-list';

        for (const hour of hourlyWeather) {
            const li = this.createTimelineItemElement(hour, sessionTime, units, weatherClient);
            ol.appendChild(li);
        }

        section.appendChild(ol);
        return section;
    }

    /**
     * One sentence answering "will it rain during the session?".
     * @param {Array} hourly
     * @param {Date} sessionTime
     * @param {{id: string, name: string}} session
     * @returns {{level: string, text: string}|null}
     */
    getRainVerdict(hourly, sessionTime, session) {
        const verdict = getSessionRainVerdict(hourly, sessionTime, sessionHours(session.id));
        if (!verdict) return null;

        const time = new Intl.DateTimeFormat(i18n.locale, { hour: 'numeric', minute: '2-digit' })
            .format(new Date(verdict.peakTime * 1000));
        return {
            level: verdict.level,
            text: i18n.t(VERDICT_KEYS[verdict.level], { session: session.name, pct: verdict.peakPct, time }),
        };
    }

    createForecastDashboard(weather, sessionTime, weatherClient) {
        const dashboard = document.createElement('article');
        dashboard.className = 'weather-dashboard';

        let sessionWeather = null;
        if (weather.hourly && weather.hourly.length > 0) {
            const sessionTs = Math.floor(sessionTime.getTime() / 1000);
            sessionWeather = weather.hourly.reduce((prev, curr) =>
                Math.abs(curr.time - sessionTs) < Math.abs(prev.time - sessionTs) ? curr : prev
            );
        }

        if (sessionWeather) {
            const dl = this.createCurrentWeatherElement(sessionWeather, weather.units, weather.hourly);
            dashboard.appendChild(dl);
        }

        if (weather.hourly) {
            const section = this.createTimelineElement(weather.hourly, sessionTime, weather.units, weatherClient);
            dashboard.appendChild(section);
        }

        return dashboard;
    }
}
