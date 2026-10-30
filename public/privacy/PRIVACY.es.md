# Política de privacidad

**Última actualización:** Octubre 2026

**Aviso:** Esta traducción se ha generado automáticamente. En caso de discrepancia, prevalece la versión en inglés.

## Resumen

Circuit Weather es una aplicación web de código abierto que muestra radar meteorológico en tiempo real para circuitos de Formula 1.

## Recopilación de datos

**Circuit Weather no recopila, almacena ni procesa datos personales.**

- No hay cuentas ni registro.
- No hay seguimiento interno ni analítica propia.
- No hay base de datos de usuarios.

La aplicación depende de servicios de terceros e infraestructura que pueden procesar datos estándar de peticiones web (por ejemplo, IP y User Agent).

## Infraestructura y caché

### Cloudflare

El sitio está alojado en **Cloudflare Workers**.

- **Proxy de privacidad:** Las peticiones de calendario F1, trazados, recursos Leaflet, recursos Mapbox GL JS y tiles de radar y avisos meteorológicos (LibreWXR, con RainViewer como respaldo) pasan por nuestro Worker.
- **Caché avanzada:** Las respuestas API se cachean en el borde para reducir tráfico y carga en servicios externos.
- **Datos procesados:** Cloudflare procesa IP y metadatos de petición para entregar y proteger el sitio.
- **Política:** [cloudflare.com/privacypolicy](https://www.cloudflare.com/privacypolicy/)

## Servicios de terceros

Tu navegador puede conectarse directamente a servicios de terceros para mapas, tiles y widgets.

### Datos de calendario

**OpenF1**

- **Propósito:** Proporciona datos de calendario de F1 de respaldo cuando el proveedor principal no está disponible.
- **Datos enviados:** Tu navegador se conecta directamente a la API de OpenF1. Tu dirección IP es visible para OpenF1 como parte de esta solicitud web estándar.
- **Política:** [openf1.org](https://openf1.org/)

### Datos meteorológicos

**Open-Meteo**

- **Propósito:** Pronósticos de sesiones.
- **Datos enviados:** IP y coordenadas del circuito seleccionado.
- **Política:** [open-meteo.com/en/features#terms](https://open-meteo.com/en/features#terms)

**LibreWXR**

- **Propósito:** Fuente principal del radar de precipitación, el pronóstico de lluvia a 1 hora, las nubes por satélite, los rayos, las células tormentosas y los avisos meteorológicos oficiales.
- **Datos enviados:** Ninguno directamente. Las peticiones pasan por nuestro Worker, que solo envía a LibreWXR las coordenadas redondeadas del circuito seleccionado (para los avisos).
- **Política:** [librewxr.net](https://librewxr.net/)

**RainViewer**

- **Propósito:** Capas de radar de respaldo, solo cuando LibreWXR no está disponible.
- **Datos enviados:** Ninguno directamente. Los datos de radar se sirven por proxy.
- **Política:** [rainviewer.com/privacy](https://www.rainviewer.com/privacy.html)

### Mapas y recursos

**Mapbox**

- **Propósito:** Proporciona los tiles de mapa base principales y renderizado vectorial.
- **Datos enviados:** Tu navegador se conecta directamente a las APIs de Mapbox (`api.mapbox.com` y `events.mapbox.com`). Tu dirección IP y los metadatos de la petición son visibles para Mapbox como parte de las peticiones web estándar.
- **Política:** [mapbox.com/legal/privacy](https://www.mapbox.com/legal/privacy/)

**Carto (OpenStreetMap)**

- **Propósito:** Tiles de mapa base.
- **Datos enviados:** El navegador solicita imágenes directamente a Carto.
- **Política:** [carto.com/privacy](https://carto.com/privacy/)

**CDN públicos**

- **Google Fonts:** Tipografías.
- **FlagCDN:** Iconos de banderas.

### Comunidad y soporte

**Buy Me a Coffee**

- **Propósito:** Donaciones opcionales.
- **Datos enviados:** Si se usa el widget, Buy Me a Coffee puede usar cookies y datos de pago/sesión.
- **Política:** [buymeacoffee.com/privacy-policy](https://www.buymeacoffee.com/privacy-policy)

### Fuentes de datos (con proxy)

- **Jolpica F1:** Calendario F1 (caché de borde de 24 horas; se conserva una última copia válida hasta 30 días como respaldo si la fuente no está disponible).
- **TheSportsDB:** Calendario y datos de circuitos de todas las series excepto la Fórmula 1 (se actualiza entre cada hora y cada mes según la cercanía de cada ronda; la última copia obtenida se conserva hasta 180 días como respaldo).
- **GitHub (bacinger/f1-circuits):** Archivos GeoJSON de circuitos (caché de borde de 24 horas).
- **LibreWXR:** Metadatos de radar (caché de 1 minuto), tiles de radar (caché de borde de 2 horas; tiles de pronóstico 5 minutos), tiles de satélite (caché de borde de 12 horas) y avisos meteorológicos (caché de 5 minutos). Se guardan copias de respaldo de corta duración de los metadatos (30 minutos) y los avisos (1 hora) por si LibreWXR no está disponible.
- **RainViewer:** Metadatos de radar (caché de 1 minuto) y tiles (caché de borde de 2 horas).
- **Leaflet (vía Unpkg):** Recursos de librería de mapas (con proxy por seguridad, caché inmutable de 1 año).
- **Mapbox (vía Mapbox CDN):** Recursos de librería de mapas (con proxy por seguridad, caché inmutable de 1 año).

## Almacenamiento local

El navegador guarda preferencias locales:

- **theme:** `light` o `dark`
- **unit:** `metric` o `imperial`
- **language:** su idioma seleccionado (ej. `es`, `en-US`)
- **windOverlay:** `true` o `false` (recuerda si la capa de animación de viento está habilitada)
- **radarColour:** el número del esquema de colores del radar seleccionado
- **radarArrows, radarCells, radarLightning, radarSatellite:** `true` o `false` (recuerda qué capas adicionales del radar están habilitadas)
- **weatherAlerts:** `true` o `false` (recuerda si se muestran los avisos meteorológicos)
- **f1_schedule_cache:** guarda en caché los datos del calendario de F1 (caché de 7 días)
- **series_schedule_cache:** guarda en caché los datos del calendario de todas las series excepto la Fórmula 1 (caché de 7 días; 5 minutos mientras el calendario aún se está cargando)

Estos datos permanecen en tu dispositivo y no se envían a nuestros servidores.

## Código abierto

[github.com/circuit-weather/circuit-weather](https://github.com/circuit-weather/circuit-weather)

## Contacto

Para dudas de privacidad, abre un issue en GitHub.
