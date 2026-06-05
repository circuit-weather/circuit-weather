# Politica de privacidade

**Ultima atualizacao:** Janeiro 2026

## Visao geral

O Circuit Weather e uma aplicacao web open source que mostra radar meteorologico em tempo real para circuitos de Formula 1.

## Recolha de dados

**O Circuit Weather nao recolhe, armazena ou processa dados pessoais.**

- Sem contas de utilizador ou registo.
- Sem rastreamento interno ou analytics proprietarios.
- Sem base de dados de utilizadores.

A aplicacao depende de servicos de terceiros que podem processar dados web padrao (IP e User Agent).

## Infraestrutura e cache

### Cloudflare

O website esta alojado em **Cloudflare Workers**.

- **Proxy de privacidade:** Calendario F1, tracados, assets Leaflet e tiles RainViewer passam pelo nosso Worker.
- **Cache edge:** Respostas API sao guardadas em cache para melhor desempenho.
- **Dados processados:** A Cloudflare processa IP e metadados de pedido para entrega e seguranca.
- **Politica:** [cloudflare.com/privacypolicy](https://www.cloudflare.com/privacypolicy/)

## Servicos de terceiros

O navegador pode ligar-se diretamente a servicos terceiros para mapas, tiles e widgets.

### Dados de Agendamento

**OpenF1**

- **Propósito:** Fornece dados alternativos do calendário da F1 quando o provedor principal está indisponível.
- **Dados Enviados:** Seu navegador se conecta diretamente à API do OpenF1. Seu endereço IP é visível para o OpenF1 como parte dessa solicitação da web padrão.
- **Política de Privacidade:** [openf1.org](https://openf1.org/)

### Dados meteorologicos

**Open-Meteo**

- **Objetivo:** Previsoes de sessao.
- **Dados enviados:** IP e coordenadas do circuito selecionado.
- **Politica:** [open-meteo.com/en/features#terms](https://open-meteo.com/en/features#terms)

**RainViewer**

- **Objetivo:** Camadas de radar.
- **Dados enviados:** Nenhum diretamente; os dados passam por proxy.
- **Politica:** [rainviewer.com/privacy](https://www.rainviewer.com/privacy.html)

### Mapas e recursos

**Mapbox**

- **Proposito:** Fornece os blocos de fundo do mapa principal e renderizacao vetorial.
- **Dados Enviados:** Seu navegador se conecta diretamente as APIs do Mapbox (`api.mapbox.com` e `events.mapbox.com`). Seu endereco IP e metadados de solicitacao sao visiveis para o Mapbox como parte de solicitacoes da web padrao.
- **Politica de privacidade:** [mapbox.com/legal/privacy](https://www.mapbox.com/legal/privacy/)

**Carto (OpenStreetMap)**

- **Objetivo:** Tiles de mapa base.
- **Dados enviados:** O navegador pede imagens diretamente ao Carto.
- **Politica:** [carto.com/privacy](https://carto.com/privacy/)

**CDNs publicas**

- **Google Fonts**
- **FlagCDN**

### Comunidade e apoio

**Buy Me a Coffee**

- **Objetivo:** Donativos opcionais.
- **Dados enviados:** Se usado, podem ser processados cookies e dados de pagamento/sessao.
- **Politica:** [buymeacoffee.com/privacy-policy](https://www.buymeacoffee.com/privacy-policy)

## Fontes de dados (proxy)

- **Jolpica F1**
- **GitHub (bacinger/f1-circuits)**
- **RainViewer**
- **Leaflet (via Unpkg)**
- **Mapbox (via Mapbox CDN):** Recursos de biblioteca de mapas (com proxy por segurança).

## Armazenamento local

Preferencias guardadas localmente no navegador:

- **theme:** `light` ou `dark`
- **unit:** `metric` ou `imperial`
- **language:** o seu idioma selecionado (ex. `pt-BR`, `en-US`)
- **windOverlay:** `true` ou `false` (lembra se a camada de animação de vento está habilitada)
- **f1_schedule_cache:** faz cache dos dados do calendário da F1 (cache de 7 dias)

## Open source

[github.com/circuit-weather/circuit-weather](https://github.com/circuit-weather/circuit-weather)

## Contacto

Para questoes de privacidade, abra um issue no GitHub.
