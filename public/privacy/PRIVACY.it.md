# Informativa sulla privacy

**Ultimo aggiornamento:** Ottobre 2026

**Avviso:** Questa traduzione è stata generata automaticamente. In caso di discrepanze, prevale la versione inglese.

## Panoramica

Circuit Weather è una web app open source che mostra radar meteo in tempo reale per i circuiti di Formula 1.

## Raccolta dati

**Circuit Weather non raccoglie, archivia o elabora dati personali.**

- Nessun account o registrazione.
- Nessun tracciamento interno o analytics proprietari.
- Nessun database utenti.

L'app usa servizi terzi che possono elaborare dati standard delle richieste web (IP e User Agent).

## Infrastruttura e cache

### Cloudflare

Il sito è ospitato su **Cloudflare Workers**.

- **Proxy privacy:** Calendario F1, tracciati, asset Leaflet, asset Mapbox GL JS e tile radar e allerte meteo (LibreWXR, con RainViewer come riserva) passano dal nostro Worker.
- **Cache edge:** Le risposte API vengono memorizzate in cache vicino all'utente.
- **Dati elaborati:** Cloudflare elabora IP e metadati di richiesta per consegna e sicurezza.
- **Privacy:** [cloudflare.com/privacypolicy](https://www.cloudflare.com/privacypolicy/)

## Servizi di terze parti

Il browser può connettersi direttamente ad alcuni servizi per mappe, tile e widget.

### Dati di pianificazione

**OpenF1**

- **Scopo:** Fornisce dati di fallback sul programma di F1 quando il provider principale non è disponibile.
- **Dati inviati:** Il tuo browser si connette direttamente all'API di OpenF1. Il tuo indirizzo IP è visibile a OpenF1 come parte di questa richiesta web standard.
- **Privacy:** [openf1.org](https://openf1.org/)

### Dati meteo

**Open-Meteo**

- **Scopo:** Previsioni meteo di sessione.
- **Dati inviati:** IP e coordinate del circuito selezionato.
- **Privacy:** [open-meteo.com/en/features#terms](https://open-meteo.com/en/features#terms)

**LibreWXR**

- **Scopo:** Fonte principale per il radar delle precipitazioni, la previsione di pioggia a 1 ora, le nuvole da satellite, i fulmini, le celle temporalesche e le allerte meteo ufficiali.
- **Dati inviati:** Nessuna connessione diretta. Le richieste passano dal nostro Worker, che invia a LibreWXR solo le coordinate arrotondate del circuito selezionato (per le allerte).
- **Privacy:** [librewxr.net](https://librewxr.net/)

**RainViewer**

- **Scopo:** Livelli radar di riserva, usati solo se LibreWXR non è disponibile.
- **Dati inviati:** Nessuna connessione diretta; dati serviti via proxy.
- **Privacy:** [rainviewer.com/privacy](https://www.rainviewer.com/privacy.html)

### Mappe e asset

**Mapbox**

- **Scopo:** Fornisce i tile di sfondo della mappa principali e il rendering vettoriale.
- **Dati inviati:** Il tuo browser si connette direttamente alle API di Mapbox (`api.mapbox.com` e `events.mapbox.com`). Il tuo indirizzo IP e i metadati della richiesta sono visibili a Mapbox come parte delle richieste web standard.
- **Privacy:** [mapbox.com/legal/privacy](https://www.mapbox.com/legal/privacy/)

**Carto (OpenStreetMap)**

- **Scopo:** Tile mappa base.
- **Dati inviati:** Il browser scarica immagini direttamente da Carto.
- **Privacy:** [carto.com/privacy](https://carto.com/privacy/)

**CDN pubbliche**

- **Google Fonts**
- **FlagCDN**

### Supporto progetto

**Buy Me a Coffee**

- **Scopo:** Donazioni facoltative.
- **Dati inviati:** Se usato, possono essere trattati cookie e dati di pagamento/sessione.
- **Privacy:** [buymeacoffee.com/privacy-policy](https://www.buymeacoffee.com/privacy-policy)

### Fonti dati (proxy)

- **Jolpica F1:** (cache edge di 24 ore; un’ultima copia valida viene conservata fino a 30 giorni come riserva se la fonte non è disponibile).
- **TheSportsDB:** Calendario e dati dei circuiti di tutte le serie tranne la Formula 1 (aggiornati da ogni ora a ogni mese in base alla vicinanza di ciascun round; l’ultima copia ottenuta viene conservata fino a 180 giorni come riserva).
- **GitHub (bacinger/f1-circuits):** (cache edge di 24 ore).
- **LibreWXR:** Metadati radar (cache di 1 minuto), tile radar (cache edge di 2 ore; tile di previsione 5 minuti), tile satellitari (cache edge di 12 ore) e allerte meteo (cache di 5 minuti). Copie di riserva di breve durata dei metadati (30 minuti) e delle allerte (1 ora) vengono conservate nel caso LibreWXR non sia disponibile.
- **RainViewer:** Metadati radar (cache di 1 minuto) e tile (cache edge di 2 ore).
- **Leaflet (via Unpkg):** Asset della libreria mappa (proxati per sicurezza, cache immutabile di 1 anno).
- **Mapbox (via Mapbox CDN):** Asset della libreria mappa (proxati per sicurezza, cache immutabile di 1 anno).

## Archiviazione locale

Preferenze salvate localmente nel browser:

- **theme:** `light` o `dark`
- **unit:** `metric` o `imperial`
- **language:** la lingua selezionata (es. `it`, `en-US`)
- **windOverlay:** `true` o `false` (ricorda se il livello di animazione del vento è abilitato)
- **radarColour:** il numero della combinazione di colori radar scelta
- **radarArrows, radarCells, radarLightning, radarSatellite:** `true` o `false` (ricorda quali livelli radar aggiuntivi sono abilitati)
- **weatherAlerts:** `true` o `false` (ricorda se le allerte meteo sono visibili)
- **f1_schedule_cache:** memorizza i dati del calendario F1 (cache di 7 giorni)
- **series_schedule_cache:** memorizza i dati del calendario di tutte le serie tranne la Formula 1 (cache di 7 giorni; 5 minuti mentre il calendario è ancora in caricamento)

Questi dati restano sul tuo dispositivo e non vengono inviati ai nostri server.

## Open source

[github.com/circuit-weather/circuit-weather](https://github.com/circuit-weather/circuit-weather)

## Contatti

Per domande sulla privacy, apri una issue su GitHub.
