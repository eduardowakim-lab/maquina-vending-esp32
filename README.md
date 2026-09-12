# Maquina de vendas ESP32

Firmware e pagina web da maquina de vendas com quatro motores, Wi-Fi configurado
por WiFiManager e atualizacao automatica OTA pelo GitHub.

Os quatro drivers A4988 compartilham `STEP` no GPIO 18 e `DIR` no GPIO 19.
Os pinos `ENABLE` dos motores 1 a 4 sao, respectivamente, GPIO 21, 13, 12 e 14.

## Controle pelo site

O painel administrativo possui um botao `Testar motor` para cada produto. O
ESP32 recebe comandos principalmente por MQTT com TLS. Enquanto MQTT estiver
conectado nao existe polling continuo. Se o broker ficar indisponivel por 30
segundos, o firmware volta temporariamente para a consulta HTTP a cada 3
segundos. Ao reconectar ao MQTT, o polling HTTP para automaticamente.

A chave privada HTTP e as credenciais MQTT ficam em
`Blink/arduino_secrets.h` e nao sao enviadas ao GitHub.

O botao de teste e exclusivo do administrador. No fluxo de venda, o comprador
clica em `Comprar agora`, a Cloudflare cria o checkout no Mercado Pago usando
o preco atual salvo no admin, e o ESP32 so recebe o comando depois que o
pagamento aprovado chega pelo webhook.

Existe tambem o botao `Novo pagamento (teste)`, que usa Mercado Pago Payment
Brick para manter Pix e cartao dentro da propria pagina. O checkout antigo
continua disponivel durante os testes.

## Mercado Pago

O admin altera nome, preco, foto e disponibilidade do produto. Nao e preciso
criar um link manual no Mercado Pago para cada preco.

Configure estes secrets no Worker:

- `MERCADO_PAGO_ACCESS_TOKEN`: access token da aplicacao Mercado Pago.
- `MERCADO_PAGO_PUBLIC_KEY`: public key da mesma aplicacao; usada pelo Payment Brick no frontend.
- `MERCADO_PAGO_WEBHOOK_SECRET`: chave do webhook gerada em Suas integracoes.
- `EMQX_API_SECRET`: segredo da Deployment API Key usada para publicar comandos.
- `EMQX_WEBHOOK_SECRET`: segredo compartilhado no header do webhook EMQX.

As configuracoes publicas `EMQX_API_ENDPOINT`, `EMQX_API_APP_ID` e
`MQTT_MACHINE_ID` ficam em `web/wrangler.jsonc`.

## MQTT

Broker TLS: `bd41a618.ala.us-east-1.emqxsl.com:8883`.

- ESP32 publica `vending/machine-001/up/#` e assina
  `vending/machine-001/down/#`.
- O Worker publica comandos em `vending/machine-001/down/command` pela API do
  EMQX, com QoS 1 e sem retained.
- O ESP32 publica status retained a cada 15 segundos e usa Last Will `offline`.
- Cada comando continua salvo na D1. Ao conectar, o ESP32 faz uma unica
  sincronizacao HTTP para recuperar comandos criados enquanto esteve offline.
- O ACK MQTT e acompanhado pela confirmacao HTTP do comando, preservando o
  funcionamento antes da ativacao do webhook.

Configure no EMQX uma integracao HTTP para `vending/+/up/status` e
`vending/+/up/ack`, enviando POST para:

`https://maquina-vending.eduardo-wakim.workers.dev/api/emqx/events`

O corpo deve conter `topic` e `payload`, e o header
`X-EMQX-Webhook-Secret` deve ter o mesmo valor do Secret do Worker.

URL do webhook para configurar no Mercado Pago:

`https://maquina-vending.eduardo-wakim.workers.dev/api/mercado-pago/webhook`

Evento/topico: `payment`.

## Deploy automatico pelo GitHub e Cloudflare

O codigo do Worker fica na pasta `web/`. Para a Cloudflare publicar
automaticamente quando houver commit no GitHub, conecte o Worker existente ao
repositorio pelo painel da Cloudflare:

1. Abra Cloudflare Dashboard > Workers & Pages.
2. Entre no Worker `maquina-vending`.
3. Va em Settings > Builds.
4. Clique em Connect e selecione o repositorio
   `eduardowakim-lab/maquina-vending-esp32`.
5. Configure:
   - Branch de producao: `main`
   - Root directory: `web`
   - Build command: deixe vazio
   - Deploy command: `npm run deploy`
6. Salve. Depois disso, cada commit/push na branch `main` dispara um novo
   deploy do site.

Integracao GitHub/Cloudflare ativada em 30/08/2026 para deploy automatico.

Atencao: secrets como `MERCADO_PAGO_ACCESS_TOKEN`,
`MERCADO_PAGO_WEBHOOK_SECRET` e chaves do ESP32 nao devem ser colocados no
GitHub. A `MERCADO_PAGO_PUBLIC_KEY` nao e secreta, mas foi mantida nas
configuracoes do Worker para facilitar a troca entre ambientes. As chaves
privadas ficam somente nas configuracoes da Cloudflare ou em arquivos locais
ignorados pelo Git.

## Compilar e enviar ao ESP32

Abra `Blink/Blink.ino` na Arduino IDE e selecione:

- Placa: `ESP32 Dev Module`
- Partition Scheme: `Minimal SPIFFS (1.9MB APP with OTA/128KB SPIFFS)`

Conecte o ESP32 por USB e use o botao Upload. O arquivo local
`Blink/arduino_secrets.h` precisa permanecer ao lado do sketch.

Instale tambem as bibliotecas `WiFiManager` e `PubSubClient` na Arduino IDE.

## Atualizacao OTA

O ESP32 consulta `ota/version.txt` somente quando liga ou reinicia e conecta ao
Wi-Fi. Quando o numero publicado for maior que `VERSAO_FIRMWARE`, ele baixa
`ota/firmware.bin`, instala a atualizacao e reinicia.

Para publicar uma nova versao:

1. Aumente `VERSAO_FIRMWARE` no sketch.
2. Exporte o binario compilado no Arduino IDE.
3. Renomeie o binario principal para `firmware.bin` e coloque-o em `ota/`.
4. Atualize `ota/version.txt` com o mesmo numero.
5. Envie os arquivos ao GitHub.

## Voltar para o teclado

A versao anterior foi preservada no Git e marcada com a tag
`firmware-teclado-v1`.
