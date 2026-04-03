import { CONFIG } from "../config.js";
import { i18n } from "../i18n/index.js";

/**
 * Manages the map instance, rendering Mapbox GL JS if available and falling back to Leaflet.
 */
export class MapManager {
  constructor() {
    this.map = null;
    this.isMapbox = false;
    this.tileLayer = null; // Used for Leaflet fallback
    this.resizeObserver = null;
    this.mapboxLanguage = null;

    // Bind the language change handler so we can safely add/remove it
    this.handleLanguageChange = this.handleLanguageChange.bind(this);
  }

  async init() {
    try {
      // Fetch the config to get the mapbox token safely
      const response = await fetch('/api/config');
      if (!response.ok) throw new Error('Failed to fetch config');
      const config = await response.json();

      if (!config.mapboxToken) {
        console.warn('Mapbox token is missing. Please ensure MAPBOX_ACCESS_TOKEN is set as a Secret in the Cloudflare dashboard (Workers & Pages → your Worker → Settings → Variables and Secrets).');
        throw new Error('Mapbox token not available');
      }

      await this.initMapbox(config.mapboxToken);
    } catch (error) {
      const rawMessage = error.message || String(error);
      const sanitizedMessage = rawMessage.replace(/access_token=[^&]+/g, 'access_token=***');

      console.warn('Mapbox initialization failed, falling back to Leaflet:', sanitizedMessage);

      this.initLeaflet();
    }

    // Listen for i18n language changes
    document.addEventListener('i18n:change', this.handleLanguageChange);

    return this.map;
  }

  async initMapbox(token) {
    mapboxgl.accessToken = token;

    const theme = document.documentElement.getAttribute("data-theme") || "light";
    const styleUrl = theme === "dark" ? CONFIG.mapboxStyleDark : CONFIG.mapboxStyleLight;

    return new Promise((resolve, reject) => {
      this.map = new mapboxgl.Map({
        container: 'map',
        style: styleUrl,
        center: [CONFIG.defaultCenter[1], CONFIG.defaultCenter[0]], // Mapbox is [lng, lat]
        zoom: CONFIG.defaultZoom - 1, // Mapbox zoom is roughly Leaflet zoom - 1
        attributionControl: true
      });

      this.map.addControl(new mapboxgl.NavigationControl(), 'top-right');

      this.mapboxLanguage = new MapboxLanguage({
        defaultLanguage: this.getMapboxLanguageCode(i18n.locale)
      });
      this.map.addControl(this.mapboxLanguage);

      this.map.on('load', () => {
        this.isMapbox = true;
        this.setupResizeObserver();
        resolve(this.map);
      });

      this.map.on('error', (e) => {
        // Only reject if the map hasn't loaded yet. If it errors later, we log it.
        if (!this.isMapbox) {
          reject(new Error(e.error?.message || 'Mapbox failed to load'));
        } else {
          console.error("Mapbox runtime error:", e);
        }
      });
    });
  }

  initLeaflet() {
    // Clean up map container if it already has mapbox DOM elements
    const mapContainer = document.getElementById("map");
    if (mapContainer) {
      mapContainer.innerHTML = '';
      mapContainer.className = 'map'; // reset classes
    }

    this.isMapbox = false;
    this.map = L.map("map", {
      center: CONFIG.defaultCenter,
      zoom: CONFIG.defaultZoom,
      zoomControl: true,
    });

    this.setupResizeObserver();

    this.setTheme(
      document.documentElement.getAttribute("data-theme") || "light",
    );
  }

  setupResizeObserver() {
    const mapContainer = document.getElementById("map");
    if (mapContainer && window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.map) {
          if (this.isMapbox) {
            this.map.resize();
          } else {
            this.map.invalidateSize();
          }
        }
      });
      this.resizeObserver.observe(mapContainer);
    }
  }

  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    document.removeEventListener('i18n:change', this.handleLanguageChange);

    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  setTheme(theme) {
    if (this.isMapbox) {
      const styleUrl = theme === "dark" ? CONFIG.mapboxStyleDark : CONFIG.mapboxStyleLight;
      this.map.setStyle(styleUrl);

      // Ensure language stays applied after style change
      this.map.once('styledata', () => {
        if (this.mapboxLanguage) {
          this.mapboxLanguage.setLanguage(this.map, this.getMapboxLanguageCode(i18n.locale));
        }
      });
    } else {
      const tileUrl = theme === "dark" ? CONFIG.mapTilesDark : CONFIG.mapTiles;

      if (this.tileLayer) this.map.removeLayer(this.tileLayer);

      this.tileLayer = L.tileLayer(tileUrl, {
        attribution:
          '© <a href="https://carto.com/" target="_blank" rel="noopener noreferrer">CARTO</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OSM</a>',
        maxZoom: 18,
        subdomains: "abcd",
      });
      this.tileLayer.addTo(this.map);
    }
  }

  setView(lat, lng, zoom = CONFIG.circuitZoom) {
    if (!this.map) return;

    if (this.isMapbox) {
      this.map.flyTo({
        center: [lng, lat],
        zoom: zoom - 1 // Adjust zoom level
      });
    } else {
      this.map.setView([lat, lng], zoom);
    }
  }

  handleLanguageChange(e) {
    if (this.isMapbox && this.mapboxLanguage) {
      const code = this.getMapboxLanguageCode(e.detail.locale);
      this.mapboxLanguage.setLanguage(this.map, code);
    }
  }

  getMapboxLanguageCode(locale) {
    // Mapbox supports specific language codes (ar, en, es, fr, de, it, pt, ru, zh-Hans, zh-Hant, ja, ko, vi)
    const base = locale.split('-')[0];

    if (base === 'zh') {
      return 'zh-Hans'; // Default to simplified
    }

    const supported = ['ar', 'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'vi'];
    if (supported.includes(base)) {
      return base;
    }

    return 'en'; // Fallback
  }
}
