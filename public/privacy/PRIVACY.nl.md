# Privacybeleid

**Laatst bijgewerkt:** oktober 2026

**Let op:** Deze vertaling is automatisch gegenereerd. Bij verschillen is de Engelse versie doorslaggevend.

## Overzicht

Circuit Weather is een open-source webapplicatie die realtime weerradar toont voor Formule 1-circuits. Wij streven naar transparantie over de werking van onze applicatie en over de manier waarop uw gegevens worden verwerkt.

## Gegevensverzameling

**Circuit Weather zelf verzamelt, bewaart en verwerkt geen persoonsgegevens.**

- Geen gebruikersaccounts of registratie.
- Geen eigen tracking of analyse.
- Geen database met gebruikersgegevens.

De applicatie maakt echter gebruik van diensten en infrastructuur van derden, die standaard webverzoekgegevens (zoals uw IP-adres en User Agent) kunnen verwerken om te functioneren.

## Infrastructuur en caching

### Cloudflare

Deze website wordt gehost op **Cloudflare Workers** (met Static Assets), die zowel de website leveren als de API aandrijven.

- **Privacyproxy:** Verzoeken om F1-schema's, circuitlayouts, Leaflet-assets, Mapbox GL JS-assets en alle radartegels en weerswaarschuwingen (LibreWXR, met RainViewer als reserve) lopen via onze Cloudflare Worker.
- **Geavanceerde caching:** API-antwoorden worden aan de edge gecachet om bandbreedtegebruik en belasting van bronservers te beperken.
- **Verwerkte gegevens:** Cloudflare verwerkt het IP-adres en metadata van verzoeken om de site te leveren en te beveiligen.
- **Privacybeleid:** [cloudflare.com/privacypolicy](https://www.cloudflare.com/privacypolicy/)

## Diensten van derden

Uw browser kan rechtstreeks verbinding maken met diensten van derden voor kaarten, tegels en widgets.

### Schemagegevens

**OpenF1**

- **Doel:** Levert F1-schemagegevens als terugvaloptie wanneer de primaire aanbieder niet beschikbaar is.
- **Verzonden gegevens:** Uw browser maakt rechtstreeks verbinding met de OpenF1-API. Uw IP-adres is voor OpenF1 zichtbaar als onderdeel van dit standaard webverzoek.
- **Privacybeleid:** [openf1.org](https://openf1.org/)

### Weergegevens

**Open-Meteo**

- **Doel:** Weersverwachtingen voor sessies.
- **Verzonden gegevens:** IP-adres (standaard webverzoek) en de coördinaten van het geselecteerde circuit.
- **Privacybeleid:** [open-meteo.com/en/features#terms](https://open-meteo.com/en/features#terms)

**LibreWXR**

- **Doel:** Primaire bron voor neerslagradar, de regenverwachting voor 1 uur, satellietwolken, bliksem, onweerscellen en officiële weerswaarschuwingen.
- **Verzonden gegevens:** Niets rechtstreeks. Verzoeken lopen via onze Worker, die LibreWXR alleen de afgeronde coördinaten van het gekozen circuit stuurt (voor weerswaarschuwingen).
- **Privacybeleid:** [librewxr.net](https://librewxr.net/)

**RainViewer**

- **Doel:** Reserve-radarlagen, alleen gebruikt als LibreWXR niet beschikbaar is.
- **Verzonden gegevens:** Niets rechtstreeks. Radargegevens lopen via onze Worker.
- **Privacybeleid:** [rainviewer.com/privacy](https://www.rainviewer.com/privacy.html)

### Kaarten en assets

**Mapbox**

- **Doel:** Levert de primaire achtergrondtegels van de kaart en de vectorweergave.
- **Verzonden gegevens:** Uw browser maakt rechtstreeks verbinding met de Mapbox-API's (`api.mapbox.com` en `events.mapbox.com`). Uw IP-adres en metadata van verzoeken zijn voor Mapbox zichtbaar als onderdeel van standaard webverzoeken.
- **Privacybeleid:** [mapbox.com/legal/privacy](https://www.mapbox.com/legal/privacy/)

**Carto (OpenStreetMap)**

- **Doel:** Basiskaarttegels.
- **Verzonden gegevens:** Uw browser vraagt kaartafbeeldingen rechtstreeks op bij Carto.
- **Privacybeleid:** [carto.com/privacy](https://carto.com/privacy/)

**Openbare CDN's**

- **Google Fonts:** Lettertype-assets.
- **FlagCDN:** Vlagpictogrammen van landen.

### Community en ondersteuning

**Buy Me a Coffee**

- **Doel:** Optionele donaties.
- **Verzonden gegevens:** Bij gebruik kunnen cookies en betalings-/sessiegegevens door Buy Me a Coffee worden verwerkt.
- **Privacybeleid:** [buymeacoffee.com/privacy-policy](https://www.buymeacoffee.com/privacy-policy)

### Gegevensbronnen (via proxy)

- **Jolpica F1:** F1-schemagegevens (24 uur edge-cache; een laatst bekende geldige kopie wordt tot 30 dagen bewaard als terugval als de bron niet beschikbaar is).
- **TheSportsDB:** Schema- en circuitgegevens voor Formule 2, Formule 3, Formule E en het WK Endurance (WEC) (elk uur tot elke maand ververst, afhankelijk van hoe dichtbij elke ronde is; de laatst opgehaalde kopie wordt tot 180 dagen bewaard als terugval).
- **GitHub (bacinger/f1-circuits):** GeoJSON-circuitbestanden (24 uur edge-cache).
- **LibreWXR:** Radarmetadata (1 minuut cache), radartegels (2 uur edge-cache; verwachtingstegels 5 minuten), satelliettegels (12 uur edge-cache) en weerswaarschuwingen (5 minuten cache). Kortlevende reservekopieën van de metadata (30 minuten) en waarschuwingen (1 uur) worden bewaard voor het geval LibreWXR niet beschikbaar is.
- **RainViewer:** Radarmetadata (1 minuut cache) en tegels (2 uur edge-cache).
- **Leaflet (via Unpkg):** Assets van de kaartinteractiebibliotheek (via proxy om veiligheidsredenen, 1 jaar immutable cache).
- **Mapbox (via Mapbox CDN):** Assets van de kaartinteractiebibliotheek (via proxy om veiligheidsredenen, 1 jaar immutable cache).

## Lokale opslag

Voorkeursinstellingen worden lokaal in uw browser opgeslagen:

- **theme:** `light` of `dark`
- **unit:** `metric` of `imperial`
- **language:** uw gekozen taal (bijv. `nl`, `en-GB`)
- **windOverlay:** `true` of `false` (onthoudt of de windanimatielaag is ingeschakeld)
- **radarColour:** het nummer van het gekozen radarkleurenschema
- **radarArrows, radarCells, radarLightning, radarSatellite:** `true` of `false` (onthoudt welke extra radarlagen zijn ingeschakeld)
- **weatherAlerts:** `true` of `false` (onthoudt of weerswaarschuwingen worden getoond)
- **f1_schedule_cache:** cachet de F1-schemagegevens (7 dagen cache)
- **series_schedule_cache:** cachet de schemagegevens van Formule 2, Formule 3, Formule E en het WK Endurance (WEC) (7 dagen cache; 5 minuten zolang het schema nog wordt geladen)

Deze gegevens blijven op uw apparaat en worden niet naar onze servers verzonden.

## Open source

[github.com/circuit-weather/circuit-weather](https://github.com/circuit-weather/circuit-weather)

## Contact

Voor vragen over privacy kunt u een issue openen op GitHub.
