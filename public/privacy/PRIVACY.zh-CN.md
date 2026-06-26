# 隐私政策

**最后更新:** 2026年1月

## 概述

Circuit Weather 是一个开源网站应用，用于显示 Formula 1 赛道的实时天气雷达。

## 数据收集

**Circuit Weather 本身不会收集、存储或处理个人数据。**

- 无用户账号或注册。
- 无内部追踪或自有分析。
- 无用户信息数据库。

但应用依赖第三方服务与基础设施，这些服务可能会处理标准 Web 请求数据（如 IP 地址和 User Agent）。

## 基础设施与缓存

### Cloudflare

网站部署在 **Cloudflare Workers**。

- **隐私代理:** F1 赛历、赛道布局、Leaflet 资源、Mapbox GL JS 资源和 RainViewer 雷达瓦片通过 Worker 代理。
- **边缘缓存:** API 响应在边缘节点缓存，以降低带宽和上游负载。
- **处理数据:** Cloudflare 会处理 IP 与请求元数据以完成分发和安全防护。
- **隐私政策:** [cloudflare.com/privacypolicy](https://www.cloudflare.com/privacypolicy/)

## 第三方服务

浏览器可能会直接连接部分第三方服务以渲染地图、瓦片和组件。

### 赛程数据

**OpenF1**

- **目的：** 当主要提供商不可用时提供备用 F1 赛程数据。
- **发送的数据：** 您的浏览器直接连接到 OpenF1 API。作为此标准网络请求的一部分，您的 IP 地址对 OpenF1 可见。
- **隐私政策：** [openf1.org](https://openf1.org/)

### 天气数据

**Open-Meteo**

- **用途:** 提供赛段天气预报。
- **发送数据:** IP 地址与所选赛道坐标。
- **隐私政策:** [open-meteo.com/en/features#terms](https://open-meteo.com/en/features#terms)

**RainViewer**

- **用途:** 提供雷达图层。
- **发送数据:** 不直接发送（通过 Worker 代理）。
- **隐私政策:** [rainviewer.com/privacy](https://www.rainviewer.com/privacy.html)

### 地图与资源

**Mapbox**

- **目的:** 提供主要的地图背景瓦片和矢量渲染。
- **发送的数据:** 您的浏览器直接连接到 Mapbox API（`api.mapbox.com` 和 `events.mapbox.com`）。您的 IP 地址和请求元数据作为标准 Web 请求的一部分对 Mapbox 可见。
- **隐私政策:** [mapbox.com/legal/privacy](https://www.mapbox.com/legal/privacy/)

**Carto (OpenStreetMap)**

- **用途:** 提供底图瓦片。
- **发送数据:** 浏览器会直接向 Carto 请求地图图片。
- **隐私政策:** [carto.com/privacy](https://carto.com/privacy/)

**公共 CDN**

- **Google Fonts**
- **FlagCDN**

### 社区支持

**Buy Me a Coffee**

- **用途:** 可选捐助。
- **发送数据:** 使用该组件时，可能会处理 Cookie 以及支付/会话数据。
- **隐私政策:** [buymeacoffee.com/privacy-policy](https://www.buymeacoffee.com/privacy-policy)

## 数据来源（代理）

- **Jolpica F1:** (24 小时边缘缓存).
- **GitHub (bacinger/f1-circuits):** (24 小时边缘缓存).
- **RainViewer:** 雷达元数据 (1 分钟缓存) 和瓦片 (2 小时边缘缓存).
- **Leaflet (通过 Unpkg):** 地图交互库资产 (为了安全而进行代理, 1 年不可变缓存)。
- **Mapbox (通过 Mapbox CDN):** 地图交互库资产 (为了安全而进行代理, 1 年不可变缓存)。

## 本地存储

浏览器本地保存以下偏好：

- **theme:** `light` 或 `dark`
- **unit:** `metric` 或 `imperial`
- **language:** 您选择的语言 (如 `zh-CN`, `en-US`)
- **windOverlay:** `true` 或 `false` (记住风场动画图层是否启用)
- **f1_schedule_cache:** 缓存 F1 赛程数据 (7天缓存)

这些数据仅保存在你的设备上。

## 开源

[github.com/circuit-weather/circuit-weather](https://github.com/circuit-weather/circuit-weather)

## 联系方式

如有隐私相关问题，请在 GitHub 提交 issue。
