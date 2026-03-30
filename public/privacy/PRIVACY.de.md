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

- **Jolpica F1**
- **GitHub (bacinger/f1-circuits)**
- **RainViewer**
- **Leaflet (via Unpkg)**

## Lokaler Speicher

Lokale Einstellungen im Browser:

- **theme:** `light` oder `dark`
- **unit:** `metric` oder `imperial`

## Open Source

[github.com/circuit-weather/circuit-weather](https://github.com/circuit-weather/circuit-weather)

## Kontakt

Bei Datenschutzfragen bitte ein GitHub-Issue eroffnen.
