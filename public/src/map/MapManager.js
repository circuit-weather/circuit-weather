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

    // Bind the language change handler so we can safely add/remove it
    this.handleLanguageChange = this.handleLanguageChange.bind(this);
  }

  async init() {
    try {
      // Fetch the config to get the mapbox token safely
      // SEC: Add timeout to prevent hanging connections if the API proxy is unresponsive
      const response = await fetch('/api/config', {
          signal: AbortSignal.timeout(5000)
      });
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

      this.map.on('load', () => {
        this.isMapbox = true;
        this.setupResizeObserver();
        this.createMapboxZoomControl();
        this.applyMapLanguage(this.getMapboxLanguageCode(i18n.locale));
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
      let rafId = null;
      this.resizeObserver = new ResizeObserver(() => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
          if (this.map) {
            if (this.isMapbox) {
              this.map.resize();
            } else {
              this.map.invalidateSize();
            }
          }
          rafId = null;
        });
      });
      this.resizeObserver.observe(mapContainer);
    }
  }

  /**
   * Creates custom zoom buttons for the Mapbox map using the same class names and
   * structure as the Leaflet zoom control, so all existing CSS and RecentreControl
   * injection work without modification.
   */
  createMapboxZoomControl() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;

    const zoomControl = document.createElement('div');
    zoomControl.className = 'leaflet-control-zoom mapbox-zoom-control';

    const zoomIn = document.createElement('button');
    zoomIn.className = 'leaflet-control-zoom-in';
    zoomIn.setAttribute('type', 'button');
    zoomIn.setAttribute('aria-label', '+');
    zoomIn.setAttribute('title', 'Zoom in');
    zoomIn.textContent = '+';

    const zoomOut = document.createElement('button');
    zoomOut.className = 'leaflet-control-zoom-out';
    zoomOut.setAttribute('type', 'button');
    zoomOut.setAttribute('aria-label', '−');
    zoomOut.setAttribute('title', 'Zoom out');
    zoomOut.textContent = '−';

    zoomIn.addEventListener('click', () => this.map.zoomIn());
    zoomOut.addEventListener('click', () => this.map.zoomOut());

    // Stop map interactions when clicking control buttons
    [zoomIn, zoomOut].forEach(btn => {
      btn.addEventListener('mousedown', e => e.stopPropagation());
      btn.addEventListener('dblclick', e => e.stopPropagation());
    });

    zoomControl.appendChild(zoomIn);
    zoomControl.appendChild(zoomOut);
    mapContainer.appendChild(zoomControl);
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

      return new Promise((resolve) => {
        // Re-apply the current language after the new style loads.
        this.map.once('style.load', () => {
          this.applyMapLanguage(this.getMapboxLanguageCode(i18n.locale));
          resolve();
        });
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
      return Promise.resolve();
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
    if (this.isMapbox) {
      this.applyMapLanguage(this.getMapboxLanguageCode(e.detail.locale));
    }
  }

  /**
   * Updates map label layers to display names in the given language.
   *
   * The mapbox-gl-language plugin is incompatible with Mapbox GL JS v3 / Standard styles —
   * it was written for the v1/v2 era and only partially works (CJK scripts happen to match
   * its heuristics but Latin-script languages do not). We use setLayoutProperty directly
   * instead, which is the approach Mapbox recommends for v3.
   *
   * @param {string} lang - A Mapbox-supported language code e.g. 'en', 'fr', 'ja', 'zh-Hans'
   */
  applyMapLanguage(lang) {
    if (!this.map || !this.isMapbox) return;

    const nameField = lang === 'mul' ? 'name' : `name_${lang}`;
    // Use coalesce so labels fall back to the local name if no translation exists
    const textField = ['coalesce', ['get', nameField], ['get', 'name']];

    this.map.getStyle().layers.forEach(layer => {
      if (layer.type !== 'symbol') return;
      const field = this.map.getLayoutProperty(layer.id, 'text-field');
      if (!field) return;
      // Only update layers that already have a name expression — avoids touching
      // layers that use text-field for non-place labels (e.g. route numbers)
      const fieldStr = JSON.stringify(field);
      if (fieldStr.includes('"name') || fieldStr.includes("'name")) {
        try {
          this.map.setLayoutProperty(layer.id, 'text-field', textField);
        } catch (_) {
          // Some layers in the Standard style are slot-managed and cannot be updated directly
        }
      }
    });
  }

  getMapboxLanguageCode(locale) {
    // Maps app locale codes to Mapbox vector tile name field suffixes.
    // Supported fields in Mapbox Streets v8: name_ar, name_de, name_en, name_es,
    // name_fr, name_it, name_ja, name_ko, name_pt, name_ru, name_vi, name_zh-Hans, name_zh-Hant
    const base = locale.split('-')[0];

    if (base === 'zh') {
      return 'zh-Hans'; // Simplified Chinese
    }

    const supported = ['ar', 'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'vi'];
    if (supported.includes(base)) {
      return base;
    }

    return 'en'; // Fallback
  }
}
