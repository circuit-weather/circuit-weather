# プライバシーポリシー

**最終更新:** 2026年1月

## 概要

Circuit Weather は、Formula 1 サーキット向けのリアルタイム天気レーダーを表示するオープンソースの Web アプリです。

## データ収集

**Circuit Weather 自体は個人データを収集・保存・処理しません。**

- ユーザー登録やアカウントはありません。
- 独自トラッキングや独自分析はありません。
- ユーザー情報データベースはありません。

ただし、アプリの動作には第三者サービスが必要であり、通常の Web リクエスト情報（IP アドレス、User Agent など）を処理する場合があります。

## インフラとキャッシュ

### Cloudflare

本サイトは **Cloudflare Workers** 上で運用されています。

- **プライバシープロキシ:** F1 スケジュール、トラックレイアウト、Leaflet アセット、Mapbox GL JS アセット、RainViewer タイルは Worker 経由で配信されます。
- **エッジキャッシュ:** API 応答はエッジにキャッシュされ、帯域と上流負荷を削減します。
- **処理データ:** Cloudflare は配信とセキュリティのため IP とリクエストメタデータを処理します。
- **ポリシー:** [cloudflare.com/privacypolicy](https://www.cloudflare.com/privacypolicy/)

## サードパーティサービス

地図・タイル・ウィジェット表示のため、ブラウザが第三者サービスへ直接接続する場合があります。

### スケジュールデータ

**OpenF1**

- **目的：** プライマリプロバイダーが利用できない場合にフォールバックF1スケジュールデータを提供します。
- **送信されるデータ：** ブラウザはOpenF1 APIに直接接続します。標準のWebリクエストの一部として、IPアドレスはOpenF1に表示されます。
- **プライバシーポリシー：** [openf1.org](https://openf1.org/)

### 気象データ

**Open-Meteo**

- **目的:** セッション予報の提供。
- **送信データ:** IP アドレスおよび選択サーキット座標。
- **ポリシー:** [open-meteo.com/en/features#terms](https://open-meteo.com/en/features#terms)

**RainViewer**

- **目的:** レーダーレイヤーの提供。
- **送信データ:** 直接送信なし（Worker 経由でプロキシ）。
- **ポリシー:** [rainviewer.com/privacy](https://www.rainviewer.com/privacy.html)

### 地図とアセット

**Mapbox**

- **目的:** 主要なマップ背景タイルとベクターレンダリングを提供します。
- **送信されるデータ:** ブラウザは直接 Mapbox API (`api.mapbox.com` および `events.mapbox.com`) に接続します。IPアドレスとリクエストのメタデータは標準的なウェブリクエストの一部としてMapboxに表示されます。
- **プライバシーポリシー:** [mapbox.com/legal/privacy](https://www.mapbox.com/legal/privacy/)

**Carto (OpenStreetMap)**

- **目的:** ベースマップタイルの提供。
- **送信データ:** ブラウザが Carto CDN に直接画像を要求します。
- **ポリシー:** [carto.com/privacy](https://carto.com/privacy/)

**公開 CDN**

- **Google Fonts**
- **FlagCDN**

### サポート機能

**Buy Me a Coffee**

- **目的:** 任意の寄付受付。
- **送信データ:** ウィジェット利用時、Cookie や決済/セッション情報が処理される場合があります。
- **ポリシー:** [buymeacoffee.com/privacy-policy](https://www.buymeacoffee.com/privacy-policy)

## データ提供元（プロキシ経由）

- **Jolpica F1:** (24時間エッジキャッシュ).
- **GitHub (bacinger/f1-circuits):** (24時間エッジキャッシュ).
- **RainViewer:** レーダーメタデータ (1分間キャッシュ) とタイル (2時間エッジキャッシュ).
- **Leaflet (via Unpkg):** (1年間不変キャッシュ).
- **Mapbox (Mapbox CDN 経由):** マップライブラリアセット (セキュリティのためプロキシされます、1年間不変キャッシュ)。

## ローカルストレージ

以下の設定をブラウザ内に保存します。

- **theme:** `light` または `dark`
- **unit:** `metric` または `imperial`
- **language:** 選択した言語 (例: `ja`, `en-US`)
- **windOverlay:** `true` または `false` (風のアニメーションレイヤーが有効かどうかを記憶します)
- **f1_schedule_cache:** F1のスケジュールデータをキャッシュします (7日間キャッシュ)

これらのデータは端末内にのみ保存されます。

## オープンソース

[github.com/circuit-weather/circuit-weather](https://github.com/circuit-weather/circuit-weather)

## お問い合わせ

プライバシーに関する質問は GitHub Issue でご連絡ください。
