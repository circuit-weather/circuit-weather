# Datenschutzerklarung

**Zuletzt aktualisiert:** Januar 2026

## Uberblick

Circuit Weather ist eine Open-Source-Webanwendung mit Echtzeit-Wetterradar fur Formel-1-Strecken.

## Datenerhebung

**Circuit Weather selbst erhebt, speichert oder verarbeitet keine personenbezogenen Daten.**

- Keine Benutzerkonten oder Registrierung.
- Kein internes Tracking oder eigene Analytics.
- Keine Benutzerdatenbank.

Zur Funktion nutzt die Anwendung Drittanbieter, die ubliche Webanfragedaten (z. B. IP und User Agent) verarbeiten konnen.

## Infrastruktur und Caching

### Cloudflare

Die Website wird auf **Cloudflare Workers** betrieben.

- **Privacy-Proxy:** F1-Kalender, Streckenlayouts, Leaflet-Assets und RainViewer-Tiles laufen uber unseren Worker.
- **Edge-Cache:** API-Antworten werden am Edge zwischengespeichert.
- **Verarbeitete Daten:** Cloudflare verarbeitet IP und Request-Metadaten fur Auslieferung und Sicherheit.
- **Datenschutzrichtlinie:** [cloudflare.com/privacypolicy](https://www.cloudflare.com/privacypolicy/)

## Drittanbieter-Dienste

Der Browser kann fur Karten, Tiles und Widgets direkt mit Drittanbietern kommunizieren.

### Zeitplandaten

**OpenF1**

- **Zweck:** Stellt Fallback-F1-Zeitplandaten bereit, wenn der primäre Anbieter nicht verfügbar ist.
- **Gesendete Daten:** Ihr Browser verbindet sich direkt mit der OpenF1-API. Ihre IP-Adresse ist für OpenF1 als Teil dieser Standard-Webanfrage sichtbar.
- **Datenschutzerklärung:** [openf1.org](https://openf1.org/)

### Wetterdaten

**Open-Meteo**

- **Zweck:** Wettervorhersagen fur Sessions.
- **Gesendete Daten:** IP-Adresse und Koordinaten der gewahlten Strecke.
- **Datenschutz:** [open-meteo.com/en/features#terms](https://open-meteo.com/en/features#terms)

**RainViewer**

- **Zweck:** Radar-Layer.
- **Gesendete Daten:** Keine direkte Verbindung; Daten werden uber unseren Worker bereitgestellt.
- **Datenschutz:** [rainviewer.com/privacy](https://www.rainviewer.com/privacy.html)

### Karten und Assets

**Mapbox**

- **Zweck:** Bereitstellung der primären Hintergrundkarten und Vektordarstellung.
- **Gesendete Daten:** Ihr Browser verbindet sich direkt mit den Mapbox-APIs (`api.mapbox.com` und `events.mapbox.com`). Ihre IP-Adresse und Anfrage-Metadaten sind für Mapbox im Rahmen standardmäßiger Webanfragen sichtbar.
- **Datenschutzerklärung:** [mapbox.com/legal/privacy](https://www.mapbox.com/legal/privacy/)

**Carto (OpenStreetMap)**

- **Zweck:** Basiskarten-Tiles.
- **Gesendete Daten:** Der Browser lädt Kartenbilder direkt von Carto.
- **Datenschutz:** [carto.com/privacy](https://carto.com/privacy/)

**Offentliche CDNs**

- **Google Fonts**
- **FlagCDN**

### Community und Support

**Buy Me a Coffee**

- **Zweck:** Freiwillige Unterstutzung.
- **Gesendete Daten:** Bei Nutzung konnen Cookies sowie Zahlungs-/Sitzungsdaten verarbeitet werden.
- **Datenschutz:** [buymeacoffee.com/privacy-policy](https://www.buymeacoffee.com/privacy-policy)

## Datenquellen (proxy)

- **Jolpica F1:** (24-Stunden-Edge-Cache).
- **GitHub (bacinger/f1-circuits):** (24-Stunden-Edge-Cache).
- **RainViewer:** Radarmetadaten (1-Minuten-Cache) und Kacheln (2-Stunden-Edge-Cache).
- **Leaflet (via Unpkg):** (1-Jahr-Immutable-Cache).
- **Mapbox (über Mapbox CDN):** Interaktionsbibliothek für Karten (aus Sicherheitsgründen geproxyt, 1-Jahr-Immutable-Cache).

## Lokaler Speicher

Lokale Einstellungen im Browser:

- **theme:** `light` oder `dark`
- **unit:** `metric` oder `imperial`
- **language:** Ihre ausgewählte Sprache (z. B. `de`, `en-US`)
- **windOverlay:** `true` oder `false` (speichert, ob die Windanimations-Ebene aktiviert ist)
- **f1_schedule_cache:** speichert die F1-Kalenderdaten zwischen (7-Tage-Cache)

## Open Source

[github.com/circuit-weather/circuit-weather](https://github.com/circuit-weather/circuit-weather)

## Kontakt

Bei Datenschutzfragen bitte ein GitHub-Issue eroffnen.
