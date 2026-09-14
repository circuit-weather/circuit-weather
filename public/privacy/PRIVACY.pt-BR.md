# Política de privacidade

**Última atualização:** Janeiro 2026

**Aviso:** Esta tradução foi gerada automaticamente. Em caso de divergência, prevalece a versão em inglês.

## Visão geral

O Circuit Weather é uma aplicação web open source que mostra radar meteorológico em tempo real para circuitos de Formula 1.

## Recolha de dados

**O Circuit Weather não recolhe, armazena ou processa dados pessoais.**

- Sem contas de utilizador ou registo.
- Sem rastreamento interno ou analytics proprietários.
- Sem base de dados de utilizadores.

A aplicação depende de serviços de terceiros que podem processar dados web padrão (IP e User Agent).

## Infraestrutura e cache

### Cloudflare

O website está alojado em **Cloudflare Workers**.

- **Proxy de privacidade:** Calendário F1, traçados, assets Leaflet, assets Mapbox GL JS e tiles RainViewer passam pelo nosso Worker.
- **Cache edge:** Respostas API são guardadas em cache para melhor desempenho.
- **Dados processados:** A Cloudflare processa IP e metadados de pedido para entrega e segurança.
- **Política:** [cloudflare.com/privacypolicy](https://www.cloudflare.com/privacypolicy/)

## Serviços de terceiros

O navegador pode ligar-se diretamente a serviços terceiros para mapas, tiles e widgets.

### Dados de Agendamento

**OpenF1**

- **Propósito:** Fornece dados alternativos do calendário da F1 quando o provedor principal está indisponível.
- **Dados Enviados:** Seu navegador se conecta diretamente à API do OpenF1. Seu endereço IP é visível para o OpenF1 como parte dessa solicitação da web padrão.
- **Política de Privacidade:** [openf1.org](https://openf1.org/)

### Dados meteorológicos

**Open-Meteo**

- **Objetivo:** Previsões de sessão.
- **Dados enviados:** IP e coordenadas do circuito selecionado.
- **Política:** [open-meteo.com/en/features#terms](https://open-meteo.com/en/features#terms)

**RainViewer**

- **Objetivo:** Camadas de radar.
- **Dados enviados:** Nenhum diretamente; os dados passam por proxy.
- **Política:** [rainviewer.com/privacy](https://www.rainviewer.com/privacy.html)

### Mapas e recursos

**Mapbox**

- **Propósito:** Fornece os blocos de fundo do mapa principal e renderização vetorial.
- **Dados Enviados:** Seu navegador se conecta diretamente às APIs do Mapbox (`api.mapbox.com` e `events.mapbox.com`). Seu endereço IP e metadados de solicitação são visíveis para o Mapbox como parte de solicitações da web padrão.
- **Política de privacidade:** [mapbox.com/legal/privacy](https://www.mapbox.com/legal/privacy/)

**Carto (OpenStreetMap)**

- **Objetivo:** Tiles de mapa base.
- **Dados enviados:** O navegador pede imagens diretamente ao Carto.
- **Política:** [carto.com/privacy](https://carto.com/privacy/)

**CDNs públicas**

- **Google Fonts**
- **FlagCDN**

### Comunidade e apoio

**Buy Me a Coffee**

- **Objetivo:** Donativos opcionais.
- **Dados enviados:** Se usado, podem ser processados cookies e dados de pagamento/sessão.
- **Política:** [buymeacoffee.com/privacy-policy](https://www.buymeacoffee.com/privacy-policy)

## Fontes de dados (proxy)

- **Jolpica F1:** (cache de borda de 24 horas).
- **GitHub (bacinger/f1-circuits):** (cache de borda de 24 horas).
- **RainViewer:** Metadados de radar (cache de 1 minuto) e tiles (cache de borda de 2 horas).
- **Leaflet (via Unpkg):** Recursos de biblioteca de mapas (com proxy por segurança, cache imutável de 1 ano).
- **Mapbox (via Mapbox CDN):** Recursos de biblioteca de mapas (com proxy por segurança, cache imutável de 1 ano).

## Armazenamento local

Preferências guardadas localmente no navegador:

- **theme:** `light` ou `dark`
- **unit:** `metric` ou `imperial`
- **language:** o seu idioma selecionado (ex. `pt-BR`, `en-US`)
- **windOverlay:** `true` ou `false` (lembra se a camada de animação de vento está habilitada)
- **f1_schedule_cache:** faz cache dos dados do calendário da F1 (cache de 7 dias)

## Open source

[github.com/circuit-weather/circuit-weather](https://github.com/circuit-weather/circuit-weather)

## Contacto

Para questões de privacidade, abra um issue no GitHub.
