# Politique de confidentialité

**Dernière mise à jour :** Janvier 2026

**Avis :** Cette traduction a été générée automatiquement. En cas de divergence, la version anglaise fait foi.

## Vue d'ensemble

Circuit Weather est une application web open source qui affiche un radar météo en temps réel pour les circuits de Formule 1.

## Collecte de données

**Circuit Weather ne collecte, ne stocke et ne traite aucune donnée personnelle.**

- Aucun compte utilisateur ni inscription.
- Aucun suivi interne ni analytics propriétaires.
- Aucune base de données utilisateur.

L'application s'appuie toutefois sur des services tiers qui peuvent traiter des données web standard (IP, User Agent).

## Infrastructure et cache

### Cloudflare

Le site est hébergé sur **Cloudflare Workers**.

- **Proxy de confidentialité :** Les requêtes F1, tracés, assets Leaflet, assets Mapbox GL JS et tuiles RainViewer passent par notre Worker.
- **Cache avancé :** Les réponses API sont mises en cache en edge.
- **Données traitées :** Cloudflare traite IP et métadonnées de requête pour fournir et sécuriser le site.
- **Politique :** [cloudflare.com/privacypolicy](https://www.cloudflare.com/privacypolicy/)

## Services tiers

Votre navigateur peut se connecter directement à certains services tiers.

### Données de calendrier

**OpenF1**

- **Objectif :** Fournit des données de calendrier F1 de secours lorsque le fournisseur principal est indisponible.
- **Données envoyées :** Votre navigateur se connecte directement à l'API OpenF1. Votre adresse IP est visible par OpenF1 dans le cadre de cette requête web standard.
- **Politique de confidentialité :** [openf1.org](https://openf1.org/)

### Données météo

**Open-Meteo**

- **But :** Prévisions météo de session.
- **Données envoyées :** IP et coordonnées du circuit sélectionné.
- **Politique :** [open-meteo.com/en/features#terms](https://open-meteo.com/en/features#terms)

**RainViewer**

- **But :** Couches radar.
- **Données envoyées :** Aucune en direct, car le radar est proxyfié.
- **Politique :** [rainviewer.com/privacy](https://www.rainviewer.com/privacy.html)

### Cartographie et assets

**Mapbox**

- **But :** Fournit les tuiles de fond de carte principales et le rendu vectoriel.
- **Données envoyées :** Votre navigateur se connecte directement aux API Mapbox (`api.mapbox.com` et `events.mapbox.com`). Votre adresse IP et les métadonnées de requête sont visibles par Mapbox dans le cadre de requêtes web standard.
- **Politique :** [mapbox.com/legal/privacy](https://www.mapbox.com/legal/privacy/)

**Carto (OpenStreetMap)**

- **But :** Tuiles de fond de carte.
- **Données envoyées :** Le navigateur demande les images directement à Carto.
- **Politique :** [carto.com/privacy](https://carto.com/privacy/)

**CDN publics**

- **Google Fonts :** Polices.
- **FlagCDN :** Drapeaux.

### Communauté et support

**Buy Me a Coffee**

- **But :** Dons facultatifs.
- **Données envoyées :** En cas d'utilisation, des cookies et données de paiement/session peuvent être traités.
- **Politique :** [buymeacoffee.com/privacy-policy](https://www.buymeacoffee.com/privacy-policy)

## Sources de données (proxyfiées)

- **Jolpica F1 :** (cache edge de 24 heures).
- **GitHub (bacinger/f1-circuits) :** (cache edge de 24 heures).
- **RainViewer :** Métadonnées radar (cache d'une minute) et tuiles (cache edge de 2 heures).
- **Leaflet (via Unpkg) :** Assets de bibliothèque de carte (proxyfiés par sécurité, cache immuable d'un an).
- **Mapbox (via Mapbox CDN) :** Assets de bibliothèque de carte (proxyfiés par sécurité, cache immuable d'un an).

## Stockage local

Les préférences sont stockées localement dans le navigateur :

- **theme:** `light` ou `dark`
- **unit:** `metric` ou `imperial`
- **language:** votre langue sélectionnée (ex: `fr`, `en-US`)
- **windOverlay:** `true` ou `false` (mémorise si le calque d'animation du vent est activé)
- **f1_schedule_cache:** met en cache les données du calendrier de la F1 (cache de 7 jours)

## Open source

[github.com/circuit-weather/circuit-weather](https://github.com/circuit-weather/circuit-weather)

## Contact

Pour toute question, ouvrez une issue sur GitHub.
