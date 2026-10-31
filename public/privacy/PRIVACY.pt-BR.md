# Política de privacidade

**Última atualização:** Outubro 2026

**Aviso:** Esta tradução foi gerada automaticamente. Em caso de divergência, prevalece a versão em inglês.

## Visão geral

O Circuit Weather é uma aplicação web open source que mostra radar meteorológico em tempo real para circuitos de Formula 1.

## Coleta de dados

**O Circuit Weather não coleta, armazena nem processa dados pessoais.**

- Sem contas de usuário ou cadastro.
- Sem rastreamento interno ou analytics proprietários.
- Sem banco de dados de usuários.

A aplicação depende de serviços de terceiros que podem processar dados web padrão (IP e User Agent).

## Infraestrutura e cache

### Cloudflare

O site está hospedado em **Cloudflare Workers**.

- **Proxy de privacidade:** Calendário F1, traçados, assets Leaflet, assets Mapbox GL JS e tiles de radar e alertas meteorológicos (LibreWXR, com RainViewer como reserva) passam pelo nosso Worker.
- **Cache edge:** Respostas da API são armazenadas em cache para melhor desempenho.
- **Dados processados:** A Cloudflare processa IP e metadados de solicitação para entrega e segurança.
- **Política:** [cloudflare.com/privacypolicy](https://www.cloudflare.com/privacypolicy/)

## Serviços de terceiros

O navegador pode se conectar diretamente a serviços de terceiros para mapas, tiles e widgets.

### Dados de agendamento

**OpenF1**

- **Objetivo:** Fornece dados alternativos do calendário da F1 quando o provedor principal está indisponível.
- **Dados enviados:** Seu navegador se conecta diretamente à API do OpenF1. Seu endereço IP é visível para o OpenF1 como parte dessa solicitação da web padrão.
- **Política:** [openf1.org](https://openf1.org/)

### Dados meteorológicos

**Open-Meteo**

- **Objetivo:** Previsões de sessão.
- **Dados enviados:** IP e coordenadas do circuito selecionado.
- **Política:** [open-meteo.com/en/features#terms](https://open-meteo.com/en/features#terms)

**LibreWXR**

- **Objetivo:** Fonte principal do radar de precipitação, da previsão de chuva de 1 hora, das nuvens por satélite, dos raios, das células de tempestade e dos alertas meteorológicos oficiais.
- **Dados enviados:** Nenhum diretamente. As requisições passam pelo nosso Worker, que envia ao LibreWXR apenas as coordenadas arredondadas do circuito selecionado (para os alertas).
- **Política:** [librewxr.net](https://librewxr.net/)

**RainViewer**

- **Objetivo:** Camadas de radar de reserva, usadas apenas quando o LibreWXR está indisponível.
- **Dados enviados:** Nenhum diretamente; os dados passam por proxy.
- **Política:** [rainviewer.com/privacy](https://www.rainviewer.com/privacy.html)

### Mapas e recursos

**Mapbox**

- **Objetivo:** Fornece os tiles de fundo do mapa principal e renderização vetorial.
- **Dados enviados:** Seu navegador se conecta diretamente às APIs do Mapbox (`api.mapbox.com` e `events.mapbox.com`). Seu endereço IP e metadados de solicitação são visíveis para o Mapbox como parte de solicitações da web padrão.
- **Política:** [mapbox.com/legal/privacy](https://www.mapbox.com/legal/privacy/)

**Carto (OpenStreetMap)**

- **Objetivo:** Tiles de mapa base.
- **Dados enviados:** O navegador pede imagens diretamente ao Carto.
- **Política:** [carto.com/privacy](https://carto.com/privacy/)

**CDNs públicas**

- **Google Fonts**
- **FlagCDN**

### Comunidade e apoio

**Buy Me a Coffee**

- **Objetivo:** Doações opcionais.
- **Dados enviados:** Se usado, podem ser processados cookies e dados de pagamento/sessão.
- **Política:** [buymeacoffee.com/privacy-policy](https://www.buymeacoffee.com/privacy-policy)

### Fontes de dados (proxy)

- **Jolpica F1:** (cache de borda de 24 horas; uma última cópia válida é mantida por até 30 dias como alternativa caso a fonte esteja indisponível).
- **TheSportsDB:** Calendário e dados dos circuitos de todas as categorias exceto a Fórmula 1 (atualizados de hora em hora a cada mês, conforme a proximidade de cada etapa; a última cópia obtida é mantida por até 180 dias como alternativa).
- **GitHub (bacinger/f1-circuits):** (cache de borda de 24 horas).
- **LibreWXR:** Metadados de radar (cache de 1 minuto), tiles de radar (cache de borda de 2 horas; tiles de previsão 5 minutos), tiles de satélite (cache de borda de 12 horas) e alertas meteorológicos (cache de 5 minutos). Cópias de reserva de curta duração dos metadados (30 minutos) e dos alertas (1 hora) são mantidas caso o LibreWXR esteja indisponível.
- **RainViewer:** Metadados de radar (cache de 1 minuto) e tiles (cache de borda de 2 horas).
- **Leaflet (via Unpkg):** Recursos de biblioteca de mapas (com proxy por segurança, cache imutável de 1 ano).
- **Mapbox (via Mapbox CDN):** Recursos de biblioteca de mapas (com proxy por segurança, cache imutável de 1 ano).

## Armazenamento local

Preferências armazenadas localmente no navegador:

- **theme:** `light` ou `dark`
- **unit:** `metric` ou `imperial`
- **language:** seu idioma selecionado (ex. `pt-BR`, `en-US`)
- **series:** a última categoria escolhida (ex. `motogp`), exibida primeiro na sua próxima visita
- **autoAdvance:** `true` ou `false` (lembra se a página avança sozinha para a próxima sessão)
- **windOverlay:** `true` ou `false` (lembra se a camada de animação de vento está habilitada)
- **radarColour:** o número do esquema de cores do radar escolhido
- **radarArrows, radarCells, radarLightning, radarSatellite:** `true` ou `false` (lembra quais camadas extras do radar estão habilitadas)
- **weatherAlerts:** `true` ou `false` (lembra se os alertas meteorológicos são exibidos)
- **f1_schedule_cache:** faz cache dos dados do calendário da F1 (cache de 7 dias)
- **series_schedule_cache:** faz cache dos dados do calendário de todas as categorias exceto a Fórmula 1 (cache de 7 dias; 5 minutos enquanto o calendário ainda está carregando)

Esses dados permanecem no seu dispositivo e não são enviados aos nossos servidores.

## Open source

[github.com/circuit-weather/circuit-weather](https://github.com/circuit-weather/circuit-weather)

## Contato

Para questões de privacidade, abra um issue no GitHub.
