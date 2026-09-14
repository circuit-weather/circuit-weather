# 개인정보처리방침

**최종 업데이트:** 2026년 1월

## 개요

Circuit Weather는 포뮬러 1 서킷의 실시간 기상 레이더를 표시하는 오픈소스 웹 애플리케이션입니다. 저희는 이 애플리케이션의 작동 방식과 이용자의 데이터가 처리되는 방식에 대해 투명성을 유지하고자 합니다.

## 데이터 수집

**Circuit Weather 자체는 어떠한 개인정보도 수집·저장·처리하지 않습니다.**

- 사용자 계정이나 회원가입이 없습니다.
- 자체 추적이나 분석이 없습니다.
- 사용자 정보 데이터베이스가 없습니다.

다만 이 애플리케이션은 제3자 서비스 및 인프라에 의존하며, 이들은 서비스 제공을 위해 표준 웹 요청 데이터(IP 주소, User Agent 등)를 처리할 수 있습니다.

## 인프라 및 캐싱

### Cloudflare

이 웹사이트는 **Cloudflare Workers**(Static Assets 사용)에서 호스팅되며, 웹사이트 제공과 API 구동을 모두 담당합니다.

- **프라이버시 프록시:** F1 일정, 트랙 레이아웃, Leaflet 에셋, Mapbox GL JS 에셋 및 모든 RainViewer 레이더 타일 요청은 저희 Cloudflare Worker를 통해 프록시됩니다.
- **고급 캐싱:** API 응답은 엣지에 캐시되어 대역폭 사용량과 원본 서버 부하를 줄입니다.
- **처리되는 데이터:** Cloudflare는 사이트 제공 및 보호를 위해 IP 주소와 요청 메타데이터를 처리합니다.
- **개인정보처리방침:** [cloudflare.com/privacypolicy](https://www.cloudflare.com/privacypolicy/)

## 제3자 서비스

이용자의 브라우저는 지도, 타일, 위젯을 위해 제3자 서비스에 직접 연결할 수 있습니다.

### 일정 데이터

**OpenF1**

- **목적:** 기본 제공자를 사용할 수 없을 때 대체 F1 일정 데이터를 제공합니다.
- **전송되는 데이터:** 브라우저가 OpenF1 API에 직접 연결합니다. 표준 웹 요청의 일부로 이용자의 IP 주소가 OpenF1에 노출됩니다.
- **개인정보처리방침:** [openf1.org](https://openf1.org/)

### 기상 데이터

**Open-Meteo**

- **목적:** 세션 기상 예보.
- **전송되는 데이터:** IP 주소(표준 웹 요청) 및 선택한 서킷 좌표.
- **개인정보처리방침:** [open-meteo.com/en/features#terms](https://open-meteo.com/en/features#terms)

**RainViewer**

- **목적:** 레이더 레이어.
- **전송되는 데이터:** 직접 전송되는 데이터 없음. 레이더 데이터는 저희 Worker를 통해 프록시됩니다.
- **개인정보처리방침:** [rainviewer.com/privacy](https://www.rainviewer.com/privacy.html)

### 지도 및 에셋

**Mapbox**

- **목적:** 기본 지도 배경 타일과 벡터 렌더링을 제공합니다.
- **전송되는 데이터:** 브라우저가 Mapbox API(`api.mapbox.com` 및 `events.mapbox.com`)에 직접 연결합니다. 표준 웹 요청의 일부로 이용자의 IP 주소와 요청 메타데이터가 Mapbox에 노출됩니다.
- **개인정보처리방침:** [mapbox.com/legal/privacy](https://www.mapbox.com/legal/privacy/)

**Carto (OpenStreetMap)**

- **목적:** 베이스맵 타일.
- **전송되는 데이터:** 브라우저가 Carto에 지도 이미지를 직접 요청합니다.
- **개인정보처리방침:** [carto.com/privacy](https://carto.com/privacy/)

**공개 CDN**

- **Google Fonts:** 서체 에셋.
- **FlagCDN:** 국가 국기 아이콘.

### 커뮤니티 및 후원

**Buy Me a Coffee**

- **목적:** 선택적 후원.
- **전송되는 데이터:** 이용 시 쿠키 및 결제/세션 데이터가 Buy Me a Coffee에 의해 처리될 수 있습니다.
- **개인정보처리방침:** [buymeacoffee.com/privacy-policy](https://www.buymeacoffee.com/privacy-policy)

### 데이터 출처(프록시 경유)

- **Jolpica F1:** F1 일정 데이터(24시간 엣지 캐시).
- **GitHub (bacinger/f1-circuits):** GeoJSON 트랙 파일(24시간 엣지 캐시).
- **RainViewer:** 레이더 메타데이터(1분 캐시) 및 타일(2시간 엣지 캐시).
- **Leaflet (Unpkg 경유):** 지도 상호작용 라이브러리 에셋(보안을 위해 프록시, 1년 immutable 캐시).
- **Mapbox (Mapbox CDN 경유):** 지도 상호작용 라이브러리 에셋(보안을 위해 프록시, 1년 immutable 캐시).

## 로컬 저장소

환경설정은 브라우저에 로컬로 저장됩니다:

- **theme:** `light` 또는 `dark`
- **unit:** `metric` 또는 `imperial`
- **language:** 선택한 언어(예: `ko`, `en-US`)
- **windOverlay:** `true` 또는 `false`(바람 애니메이션 레이어의 활성화 여부를 기억합니다)
- **f1_schedule_cache:** F1 일정 데이터를 캐시합니다(7일 캐시)

이 데이터는 이용자의 기기에 남아 있으며 저희 서버로 전송되지 않습니다.

## 오픈소스

[github.com/circuit-weather/circuit-weather](https://github.com/circuit-weather/circuit-weather)

## 문의

개인정보 관련 문의는 GitHub 이슈로 남겨 주시기 바랍니다.
