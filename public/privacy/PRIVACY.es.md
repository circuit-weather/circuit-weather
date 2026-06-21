# Politica de privacidad

**Ultima actualizacion:** Enero 2026

## Resumen

Circuit Weather es una aplicacion web de codigo abierto que muestra radar meteorologico en tiempo real para circuitos de Formula 1.

## Recopilacion de datos

**Circuit Weather no recopila, almacena ni procesa datos personales.**

- No hay cuentas ni registro.
- No hay seguimiento interno ni analitica propia.
- No hay base de datos de usuarios.

La aplicacion depende de servicios de terceros e infraestructura que pueden procesar datos estandar de peticiones web (por ejemplo, IP y User Agent).

## Infraestructura y cache

### Cloudflare

El sitio esta alojado en **Cloudflare Workers**.

- **Proxy de privacidad:** Las peticiones de calendario F1, trazados, recursos Leaflet, recursos Mapbox GL JS y tiles de RainViewer pasan por nuestro Worker.
- **Cache avanzada:** Las respuestas API se cachean en el borde para reducir trafico y carga en servicios externos.
- **Datos procesados:** Cloudflare procesa IP y metadatos de peticion para entregar y proteger el sitio.
- **Politica de privacidad:** [cloudflare.com/privacypolicy](https://www.cloudflare.com/privacypolicy/)

## Servicios de terceros

Tu navegador puede conectarse directamente a servicios de terceros para mapas, tiles y widgets.

### Datos de calendario

**OpenF1**

- **Propósito:** Proporciona datos de calendario de F1 de respaldo cuando el proveedor principal no está disponible.
- **Datos enviados:** Tu navegador se conecta directamente a la API de OpenF1. Tu dirección IP es visible para OpenF1 como parte de esta solicitud web estándar.
- **Política de privacidad:** [openf1.org](https://openf1.org/)

### Datos meteorologicos

**Open-Meteo**

- **Proposito:** Pronosticos de sesiones.
- **Datos enviados:** IP y coordenadas del circuito seleccionado.
- **Politica:** [open-meteo.com/en/features#terms](https://open-meteo.com/en/features#terms)

**RainViewer**

- **Proposito:** Capas de radar.
- **Datos enviados:** Ninguno directamente. Los datos de radar se sirven por proxy.
- **Politica:** [rainviewer.com/privacy](https://www.rainviewer.com/privacy.html)

### Mapas y recursos

**Mapbox**

- **Proposito:** Proporciona los tiles de mapa base principales y renderizado vectorial.
- **Datos enviados:** Tu navegador se conecta directamente a las APIs de Mapbox (`api.mapbox.com` y `events.mapbox.com`). Tu direccion IP y los metadatos de la peticion son visibles para Mapbox como parte de las peticiones web estandar.
- **Politica de privacidad:** [mapbox.com/legal/privacy](https://www.mapbox.com/legal/privacy/)

**Carto (OpenStreetMap)**

- **Proposito:** Tiles de mapa base.
- **Datos enviados:** El navegador solicita imagenes directamente a Carto.
- **Politica:** [carto.com/privacy](https://carto.com/privacy/)

**CDN publicos**

- **Google Fonts:** Tipografias.
- **FlagCDN:** Iconos de banderas.

### Comunidad y soporte

**Buy Me a Coffee**

- **Proposito:** Donaciones opcionales.
- **Datos enviados:** Si se usa el widget, Buy Me a Coffee puede usar cookies y datos de pago/sesion.
- **Politica:** [buymeacoffee.com/privacy-policy](https://www.buymeacoffee.com/privacy-policy)

## Fuentes de datos (con proxy)

- **Jolpica F1:** Calendario F1 (caché de borde de 24 horas).
- **GitHub (bacinger/f1-circuits):** Archivos GeoJSON de circuitos (caché de borde de 24 horas).
- **RainViewer:** Metadatos de radar (caché de 1 minuto) y tiles (caché de borde de 2 horas).
- **Leaflet (via Unpkg):** Recursos de libreria de mapas (caché inmutable de 1 año).
- **Mapbox (vía Mapbox CDN):** Recursos de librería de mapas (con proxy por seguridad, caché inmutable de 1 año).

## Almacenamiento local

El navegador guarda preferencias locales:

- **theme:** `light` o `dark`
- **unit:** `metric` o `imperial`
- **language:** su idioma seleccionado (ej. `es`, `en-US`)
- **windOverlay:** `true` o `false` (recuerda si la capa de animación de viento está habilitada)
- **f1_schedule_cache:** guarda en caché los datos del calendario de F1 (caché de 7 días)

Estos datos permanecen en tu dispositivo.

## Codigo abierto

[github.com/circuit-weather/circuit-weather](https://github.com/circuit-weather/circuit-weather)

## Contacto

Para dudas de privacidad, abre un issue en GitHub.
