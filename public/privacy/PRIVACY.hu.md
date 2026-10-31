# Adatvédelmi Irányelvek

**Utolsó frissítés:** 2026. Október

**Megjegyzés:** Ez a fordítás gépi úton készült. Eltérés esetén az angol nyelvű változat az irányadó.

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

- **Adatvédelmi proxy:** Az F1-es naptár, a pályarajzok, a Leaflet eszközök, a Mapbox GL JS eszközök és a radarcsempék és időjárási figyelmeztetések (LibreWXR, tartalékként RainViewer) kéréseit a Cloudflare Workerünk proxizza.
- **Fejlett gyorsítótárazás:** Az API-válaszokat a peremen (edge) gyorsítótárazzuk a sávszélesség-használat és a feltöltési terhelés minimalizálása érdekében.
- **Feldolgozott adatok:** A Cloudflare feldolgozza az IP-címeket és a kérések metaadatait a weboldal kézbesítése és védelme érdekében.
- **Adatvédelmi irányelvek:** [cloudflare.com/privacypolicy](https://www.cloudflare.com/privacypolicy/)

## Harmadik Féltől Származó Szolgáltatások

A böngészője közvetlenül is csatlakozhat harmadik féltől származó szolgáltatásokhoz térképek, csempék és widgetek betöltéséhez.

### Naptáradatok

**OpenF1**

- **Cél:** Tartalék F1 naptáradatokat biztosít, ha az elsődleges szolgáltató nem elérhető.
- **Küldött adatok:** A böngészője közvetlenül csatlakozik az OpenF1 API-hoz. Az Ön IP-címe látható az OpenF1 számára ennek a szabványos webes kérésnek a részeként.
- **Adatvédelmi irányelvek:** [openf1.org](https://openf1.org/)

### Időjárási Adatok

**Open-Meteo**

- **Cél:** Események időjárás-előrejelzése.
- **Küldött adatok:** IP-cím (szabványos webes kérés) és a kiválasztott pálya koordinátái.
- **Adatvédelmi irányelvek:** [open-meteo.com/en/features#terms](https://open-meteo.com/en/features#terms)

**LibreWXR**

- **Cél:** A csapadékradar, az 1 órás esőelőrejelzés, a műholdas felhőkép, a villámok, a zivatarcellák és a hivatalos időjárási figyelmeztetések elsődleges forrása.
- **Küldött adatok:** Közvetlenül semmi. A kéréseket a Workerünk proxizza, amely csak a kiválasztott pálya kerekített koordinátáit küldi el a LibreWXR-nek (a figyelmeztetésekhez).
- **Adatvédelmi irányelvek:** [librewxr.net](https://librewxr.net/)

**RainViewer**

- **Cél:** Tartalék radar rétegek, csak ha a LibreWXR nem érhető el.
- **Küldött adatok:** Közvetlenül semmi. A radaradatokat a Workerünk proxizza.
- **Adatvédelmi irányelvek:** [rainviewer.com/privacy](https://www.rainviewer.com/privacy.html)

### Térképek és Eszközök

**Mapbox**

- **Cél:** Biztosítja az elsődleges térképháttér csempéket és a vektoros megjelenítést.
- **Küldött adatok:** A böngészője közvetlenül csatlakozik a Mapbox API-khoz (`api.mapbox.com` és `events.mapbox.com`). Az IP-címe és a kérés metaadatai a szokványos webes kérések részeként láthatóak a Mapbox számára.
- **Adatvédelmi irányelvek:** [mapbox.com/legal/privacy](https://www.mapbox.com/legal/privacy/)

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

- **Jolpica F1:** F1-es naptár adatok (24 órás edge cache; az utolsó érvényes másolatot legfeljebb 30 napig tartjuk meg tartalékként, ha a forrás nem érhető el).
- **TheSportsDB:** A Forma-1-en kívüli összes sorozat naptár- és pályaadatai (a forduló közelségétől függően óránként és havonta között frissül; az utoljára lekért másolatot legfeljebb 180 napig tartjuk meg tartalékként).
- **GitHub (bacinger/f1-circuits):** GeoJSON pályafájlok (24 órás edge cache).
- **LibreWXR:** Radar metaadatok (1 perces cache), radarcsempék (2 órás edge cache; előrejelzési csempék 5 perc), műholdas csempék (12 órás edge cache) és időjárási figyelmeztetések (5 perces cache). A metaadatokról (30 perc) és a figyelmeztetésekről (1 óra) rövid ideig tartalék másolatot őrzünk arra az esetre, ha a LibreWXR nem érhető el.
- **RainViewer:** Radar metaadatok (1 perces cache) és csempék (2 órás edge cache).
- **Leaflet (a Unpkg-en keresztül):** Térkép interakciós könyvtár eszközei (biztonsági okokból proxizva, 1 éves módosíthatatlan cache).
- **Mapbox (a Mapbox CDN-en keresztül):** Térkép interakciós könyvtár eszközei (biztonsági okokból proxizva, 1 éves módosíthatatlan cache).

## Helyi Tárolás

A beállításokat a böngészője helyileg tárolja:

- **theme (téma):** `light` (világos) vagy `dark` (sötét)
- **unit (mértékegység):** `metric` (metrikus) vagy `imperial` (birodalmi)
- **language (nyelv):** a kiválasztott nyelv
- **series (sorozat):** a legutóbb választott versenysorozat (pl. `motogp`), a következő látogatáskor ez jelenik meg először
- **windOverlay:** `true` vagy `false` (megjegyzi, hogy a szélanimációs réteg be van-e kapcsolva)
- **radarColour:** a kiválasztott radar színséma száma
- **radarArrows, radarCells, radarLightning, radarSatellite:** `true` vagy `false` (megjegyzi, mely további radarrétegek vannak bekapcsolva)
- **weatherAlerts:** `true` vagy `false` (megjegyzi, hogy megjelennek-e az időjárási figyelmeztetések)
- **f1_schedule_cache:** gyorsítótárazza az F1 naptáradatokat (7 napos gyorsítótár)
- **series_schedule_cache:** gyorsítótárazza a Forma-1-en kívüli összes sorozat naptáradatait (7 napos gyorsítótár; 5 perc, amíg a naptár még töltődik)

Ezek az adatok az Ön eszközén maradnak, és nem kerülnek elküldésre a szervereinkre.

## Nyílt Forráskód

[github.com/circuit-weather/circuit-weather](https://github.com/circuit-weather/circuit-weather)

## Kapcsolat

Adatvédelmi kérdések esetén kérjük, nyisson egy hibajegyet (issue) a GitHubon.
