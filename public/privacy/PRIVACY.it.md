# Informativa sulla privacy

**Ultimo aggiornamento:** Gennaio 2026

## Panoramica

Circuit Weather e una web app open source che mostra radar meteo in tempo reale per i circuiti di Formula 1.

## Raccolta dati

**Circuit Weather non raccoglie, archivia o elabora dati personali.**

- Nessun account o registrazione.
- Nessun tracciamento interno o analytics proprietari.
- Nessun database utenti.

L'app usa servizi terzi che possono elaborare dati standard delle richieste web (IP e User Agent).

## Infrastruttura e cache

### Cloudflare

Il sito e ospitato su **Cloudflare Workers**.

- **Proxy privacy:** Calendario F1, tracciati, asset Leaflet e tile RainViewer passano dal nostro Worker.
- **Cache edge:** Le risposte API vengono memorizzate in cache vicino all'utente.
- **Dati elaborati:** Cloudflare elabora IP e metadati di richiesta per consegna e sicurezza.
- **Privacy Policy:** [cloudflare.com/privacypolicy](https://www.cloudflare.com/privacypolicy/)

## Servizi di terze parti

Il browser puo connettersi direttamente ad alcuni servizi per mappe, tile e widget.

### Dati meteo

**Open-Meteo**

- **Scopo:** Previsioni meteo di sessione.
- **Dati inviati:** IP e coordinate del circuito selezionato.
- **Privacy:** [open-meteo.com/en/features#terms](https://open-meteo.com/en/features#terms)

**RainViewer**

- **Scopo:** Livelli radar.
- **Dati inviati:** Nessuna connessione diretta; dati serviti via proxy.
- **Privacy:** [rainviewer.com/privacy](https://www.rainviewer.com/privacy.html)

### Mappe e asset

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

## Fonti dati (proxy)

- **Jolpica F1**
- **GitHub (bacinger/f1-circuits)**
- **RainViewer**
- **Leaflet (via Unpkg)**

## Archiviazione locale

Preferenze salvate localmente nel browser:

- **theme:** `light` o `dark`
- **unit:** `metric` o `imperial`

## Open source

[github.com/circuit-weather/circuit-weather](https://github.com/circuit-weather/circuit-weather)

## Contatti

Per domande sulla privacy, apri una issue su GitHub.
