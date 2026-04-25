# Politique de confidentialite

**Derniere mise a jour :** Janvier 2026

## Vue d'ensemble

Circuit Weather est une application web open source qui affiche un radar meteo en temps reel pour les circuits de Formule 1.

## Collecte de donnees

**Circuit Weather ne collecte, ne stocke et ne traite aucune donnee personnelle.**

- Aucun compte utilisateur ni inscription.
- Aucun suivi interne ni analytics proprietaires.
- Aucune base de donnees utilisateur.

L'application s'appuie toutefois sur des services tiers qui peuvent traiter des donnees web standard (IP, User Agent).

## Infrastructure et cache

### Cloudflare

Le site est heberge sur **Cloudflare Workers**.

- **Proxy de confidentialite :** Les requetes F1, traces, assets Leaflet et tuiles RainViewer passent par notre Worker.
- **Cache avance :** Les reponses API sont mises en cache en edge.
- **Donnees traitees :** Cloudflare traite IP et metadonnees de requete pour fournir et securiser le site.
- **Politique :** [cloudflare.com/privacypolicy](https://www.cloudflare.com/privacypolicy/)

## Services tiers

Votre navigateur peut se connecter directement a certains services tiers.

### Donnees meteo

**Open-Meteo**

- **But :** Previsions meteo de session.
- **Donnees envoyees :** IP et coordonnees du circuit selectionne.
- **Politique :** [open-meteo.com/en/features#terms](https://open-meteo.com/en/features#terms)

**RainViewer**

- **But :** Couches radar.
- **Donnees envoyees :** Aucune en direct, car le radar est proxyfie.
- **Politique :** [rainviewer.com/privacy](https://www.rainviewer.com/privacy.html)

### Cartographie et assets

**Carto (OpenStreetMap)**

- **But :** Tuiles de fond de carte.
- **Donnees envoyees :** Le navigateur demande les images directement a Carto.
- **Politique :** [carto.com/privacy](https://carto.com/privacy/)

**CDN publics**

- **Google Fonts :** Polices.
- **FlagCDN :** Drapeaux.

### Communaute et support

**Buy Me a Coffee**

- **But :** Dons facultatifs.
- **Donnees envoyees :** En cas d'utilisation, des cookies et donnees de paiement/session peuvent etre traites.
- **Politique :** [buymeacoffee.com/privacy-policy](https://www.buymeacoffee.com/privacy-policy)

## Sources de donnees (proxyfiees)

- **Jolpica F1**
- **GitHub (bacinger/f1-circuits)**
- **RainViewer**
- **Leaflet (via Unpkg)**

## Stockage local

Les preferences sont stockees localement dans le navigateur :

- **theme:** `light` ou `dark`
- **unit:** `metric` ou `imperial`
- **language:** votre langue sélectionnée (ex: `fr`, `en-US`)
- **f1_schedule_cache:** met en cache les données du calendrier de la F1 (cache de 24 heures)

## Open source

[github.com/circuit-weather/circuit-weather](https://github.com/circuit-weather/circuit-weather)

## Contact

Pour toute question, ouvrez une issue sur GitHub.
