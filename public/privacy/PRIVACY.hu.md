# Adatvédelmi Irányelvek

**Utolsó frissítés:** 2026. Január

## Áttekintés

A Circuit Weather egy nyílt forráskódú webalkalmazás, amely valós idejű időjárás radart jelenít meg a Forma-1-es versenypályákhoz. Elkötelezettek vagyunk az alkalmazásunk működésének és adatainak kezelésének átláthatósága mellett.

## Adatgyűjtés

**A Circuit Weather maga nem gyűjt, tárol vagy dolgoz fel semmilyen személyes adatot.**

- Nincsenek felhasználói fiókok vagy regisztráció.
- Nincs belső nyomon követés vagy analitika.
- Nincs adatbázis a felhasználói információkról.

Az alkalmazás azonban harmadik féltől származó szolgáltatásokra és infrastruktúrára támaszkodik, amelyek a működéshez feldolgozhatnak szabványos webes kérésadatokat (például IP-címet és User Agent-et).

## Infrastruktúra és Gyorsítótárazás

### Cloudflare

Ez a weboldal a **Cloudflare Workers** szolgáltatáson (Static Assets használatával) fut, amely a weboldalt szolgálja ki és az API-t is működteti.

- **Adatvédelmi proxy:** Az F1-es naptár, a pályarajzok, a Leaflet eszközök, a Mapbox GL JS eszközök és a RainViewer radar csempék kéréseit a Cloudflare Workerünk proxizza.
- **Fejlett gyorsítótárazás:** Az API-válaszokat a peremen (edge) gyorsítótárazzuk a sávszélesség-használat és a feltöltési terhelés minimalizálása érdekében.
- **Feldolgozott adatok:** A Cloudflare feldolgozza az IP-címeket és a kérések metaadatait a weboldal kézbesítése és védelme érdekében.
- **Adatvédelmi irányelvek:** [cloudflare.com/privacypolicy](https://www.cloudflare.com/privacypolicy/)

## Harmadik Féltől Származó Szolgáltatások

A böngészője közvetlenül is csatlakozhat harmadik féltől származó szolgáltatásokhoz térképek, csempék és widgetek betöltéséhez.

### Naptáradatok

**OpenF1**

- **Cél:** Tartalék F1 naptáradatokat biztosít, ha az elsődleges szolgáltató nem elérhető.
- **Elküldött adatok:** A böngészője közvetlenül csatlakozik az OpenF1 API-hoz. Az Ön IP-címe látható az OpenF1 számára ennek a szabványos webes kérésnek a részeként.
- **Adatvédelmi irányelvek:** [openf1.org](https://openf1.org/)

### Időjárási Adatok

**Open-Meteo**

- **Cél:** Események időjárás-előrejelzése.
- **Küldött adatok:** IP-cím (szabványos webes kérés) és a kiválasztott pálya koordinátái.
- **Adatvédelmi irányelvek:** [open-meteo.com/en/features#terms](https://open-meteo.com/en/features#terms)

**RainViewer**

- **Cél:** Radar rétegek.
- **Küldött adatok:** Közvetlenül semmi. A radaradatokat a Workerünk proxizza.
- **Adatvédelmi irányelvek:** [rainviewer.com/privacy](https://www.rainviewer.com/privacy.html)

### Térképek és Eszközök

**Mapbox**

- **Cel:** Biztositja az elsodleges terkephatter csempeket es a vektoros megjelenitest.
- **Elkuldott Adatok:** A bongeszoje kozvetlenul csatlakozik a Mapbox API-khoz (`api.mapbox.com` es `events.mapbox.com`). Az IP-cime es a keres metaadatai a szokvanyos webes keresek reszekent lathatoak a Mapbox szamara.
- **Adatvedelmi Iranyelvek:** [mapbox.com/legal/privacy](https://www.mapbox.com/legal/privacy/)

**Carto (OpenStreetMap)**

- **Cél:** Alaptérkép csempék.
- **Küldött adatok:** A böngészője közvetlenül a Carto-tól kéri a térképképeket.
- **Adatvédelmi irányelvek:** [carto.com/privacy](https://carto.com/privacy/)

**Nyilvános CDN-ek**

- **Google Fonts:** Tipográfiai eszközök.
- **FlagCDN:** Országzászló ikonok.

### Közösség és Támogatás

**Buy Me a Coffee**

- **Cél:** Opcionális adományok.
- **Küldött adatok:** Ha használják, a cookie-kat és a fizetési/munkamenet adatokat a Buy Me a Coffee dolgozhatja fel.
- **Adatvédelmi irányelvek:** [buymeacoffee.com/privacy-policy](https://www.buymeacoffee.com/privacy-policy)

### Adatforrások (Proxizva)

- **Jolpica F1:** F1-es naptár adatok (24 órás edge cache).
- **GitHub (bacinger/f1-circuits):** GeoJSON pályafájlok (24 órás edge cache).
- **RainViewer:** Radar metaadatok (1 perces cache) és csempék (2 órás edge cache).
- **Leaflet (az Unpkg-n keresztül):** Térképkönyvtár eszközei (1 éves módosíthatatlan cache).
- **Mapbox (a Mapbox CDN-en keresztül):** Térkép interakciós könyvtár eszközei (biztonsági okokból proxizva, 1 éves módosíthatatlan cache).

## Helyi Tárolás

A beállításokat a böngészője helyileg tárolja:

- **theme (téma):** `light` (világos) vagy `dark` (sötét)
- **unit (mértékegység):** `metric` (metrikus) vagy `imperial` (birodalmi)
- **language (nyelv):** a kiválasztott nyelv (pl. `hu`, `en-US`)
- **windOverlay:** `true` vagy `false` (megjegyzi, hogy a szélanimációs réteg be van-e kapcsolva)
- **f1_schedule_cache:** gyorsítótárazza az F1 naptáradatokat (7 napos gyorsítótár)

Ezek az adatok az Ön eszközén maradnak, és nem kerülnek elküldésre a szervereinkre.

## Nyílt Forráskód

[github.com/circuit-weather/circuit-weather](https://github.com/circuit-weather/circuit-weather)

## Kapcsolat

Adatvédelmi kérdések esetén kérjük, nyisson egy hibajegyet (issue) a GitHubon.
