import { i18n } from "../i18n/index.js";
import { getWindDirection } from "../utils/wind.js";

/**
 * Custom Control for showing weather data on the map.
 * Compatible with both Leaflet and Mapbox GL JS interfaces.
 */
class MapWeatherWidgetClass {
  constructor() {
    // Scout: Upgraded generic div to semantic section to improve document outline and explicitly signal this standalone widget region to search engines.
    this._div = document.createElement("section");
    this._div.className =
      "leaflet-control-weather mapboxgl-ctrl mapboxgl-ctrl-group";
    this._div.setAttribute("role", "region");
    this._div.setAttribute(
      "aria-label",
      i18n.t("weather.currentCircuitWeather"),
    );
    this._div.setAttribute(
      "data-i18n-attr",
      "aria-label:weather.currentCircuitWeather",
    );
    this._div.setAttribute("tabindex", "0");

    const heading = document.createElement("h2");
    heading.className = "weather-widget-heading";
    heading.setAttribute("data-i18n", "weather.currentConditions");
    heading.textContent = i18n.t("weather.currentConditions");
    this._div.appendChild(heading);

    const dl = document.createElement("dl");
    dl.className = "weather-widget-list";
    dl.style.margin = "0";
    dl.style.padding = "0";
    this._div.appendChild(dl);

    const createMetric = (key, iconSvgPath, valueClass, extraSpans = []) => {
      const wrapper = document.createElement("div");
      wrapper.className = "weather-widget-metric";
      wrapper.setAttribute("role", "group");
      wrapper.setAttribute("aria-label", i18n.t(key));
      wrapper.setAttribute("title", i18n.t(key));

      let attrKey = key;
      if (key === "weather.windSpeed") attrKey = "weather.wind";
      wrapper.setAttribute("data-i18n-attr", `aria-label:${key},title:${attrKey}`);

      const dt = document.createElement("dt");
      dt.className = "sr-only";
      dt.textContent = i18n.t(key);
      wrapper.appendChild(dt);

      const dd = document.createElement("dd");
      dd.style.display = "flex";
      dd.style.alignItems = "center";
      dd.style.margin = "0";

      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("class", `icon-weather icon-${valueClass.split('-')[0]}`);
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2");

      if (valueClass.includes("rain")) {
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
      }

      // Parse paths
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${iconSvgPath}</svg>`, "image/svg+xml");
      const childNodes = doc.documentElement.childNodes;
      childNodes.forEach(node => {
        if (node.nodeType === 1) { // ELEMENT_NODE
          const newNode = document.createElementNS(svgNS, node.tagName);
          Array.from(node.attributes).forEach(attr => newNode.setAttribute(attr.name, attr.value));
          svg.appendChild(newNode);
        }
      });

      dd.appendChild(svg);

      const valueSpan = document.createElement("span");
      valueSpan.className = valueClass;
      valueSpan.textContent = valueClass.includes("temp") || valueClass.includes("wind") ? "--" : "--%";
      dd.appendChild(valueSpan);

      extraSpans.forEach(spanFn => {
        dd.appendChild(spanFn());
      });

      wrapper.appendChild(dd);
      return wrapper;
    };

    dl.appendChild(createMetric("weather.temperature", `<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />`, "temp-value"));
    dl.appendChild(createMetric("weather.rainChance", `<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/>`, "rain-value"));
    dl.appendChild(createMetric("weather.humidity", `<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />`, "humid-value"));

    dl.appendChild(createMetric("weather.windSpeed", `<path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />`, "wind-value", [
        () => {
            const windDirSpan = document.createElement("span");
            windDirSpan.className = "wind-dir";

            const windDirTextSpan = document.createElement("span");
            windDirTextSpan.className = "wind-dir-text";
            windDirSpan.appendChild(windDirTextSpan);

            const svgNS = "http://www.w3.org/2000/svg";
            const svg = document.createElementNS(svgNS, "svg");
            svg.setAttribute("class", "icon-wind-arrow");
            svg.setAttribute("aria-hidden", "true");
            svg.setAttribute("style", "visibility: hidden;");
            svg.setAttribute("viewBox", "0 0 24 24");
            svg.setAttribute("fill", "none");
            svg.setAttribute("stroke", "currentColor");
            svg.setAttribute("stroke-width", "2.5");
            svg.setAttribute("stroke-linecap", "round");
            svg.setAttribute("stroke-linejoin", "round");

            const line = document.createElementNS(svgNS, "line");
            line.setAttribute("x1", "12");
            line.setAttribute("y1", "19");
            line.setAttribute("x2", "12");
            line.setAttribute("y2", "5");
            svg.appendChild(line);

            const polyline = document.createElementNS(svgNS, "polyline");
            polyline.setAttribute("points", "5 12 12 5 19 12");
            svg.appendChild(polyline);

            windDirSpan.appendChild(svg);

            return windDirSpan;
        }
    ]));

    this._ui = {
      temp: this._div.querySelector(".temp-value"),
      rain: this._div.querySelector(".rain-value"),
      humid: this._div.querySelector(".humid-value"),
      wind: this._div.querySelector(".wind-value"),
      windDirText: this._div.querySelector(".wind-dir-text"),
      windArrow: this._div.querySelector(".icon-wind-arrow"),
    };
  }

  // Leaflet interface
  onAdd() {
    // Ensure Leaflet-specific classes are present
    this._div.classList.add("leaflet-control");
    return this._div;
  }

  onRemove() {
    if (this._div.parentNode) {
      this._div.parentNode.removeChild(this._div);
    }
  }

  // Mapbox GL JS interface
  getDefaultPosition() {
    return "top-right";
  }

  update(weather) {
    if (!this._div || !this._ui) return;

    if (!weather || !weather.current) {
      this._ui.temp.textContent = "--";
      this._ui.rain.textContent = "--%";
      this._ui.humid.textContent = "--%";
      this._ui.wind.textContent = "--";
      this.setWindDirection(null);
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
    this.setWindDirection(weather.current.wind_direction_10m);
  }

  setWindDirection(degrees) {
    if (!this._ui || !this._ui.windDirText || !this._ui.windArrow) return;

    if (!Number.isFinite(degrees)) {
      this._ui.windDirText.textContent = "";
      this._ui.windArrow.style.transform = "";
      this._ui.windArrow.style.visibility = "hidden";
      return;
    }

    const { text, rotation } = getWindDirection(degrees);
    this._ui.windDirText.textContent = text;
    this._ui.windArrow.style.transform = `rotate(${rotation}deg)`;
    this._ui.windArrow.style.visibility = "";
  }
}

// Ensure the class supports both L.Control.extend patterns (if called via Leaflet) and standard ES6 class patterns (Mapbox)
export const MapWeatherWidget = function () {
  return new MapWeatherWidgetClass();
};
MapWeatherWidget.prototype = MapWeatherWidgetClass.prototype;
