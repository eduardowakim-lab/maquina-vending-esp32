# Maquina de vendas ESP32

Firmware e pagina web da maquina de vendas com dois motores, Wi-Fi configurado
por WiFiManager e atualizacao automatica OTA pelo GitHub.

## Controle pelo site

O painel administrativo possui um botao `Testar motor` para cada produto. O
ESP32 consulta a Cloudflare a cada 2 segundos, recebe o comando e gira somente
o motor solicitado. A chave privada do dispositivo fica em
`Blink/arduino_secrets.h` e nao e enviada ao GitHub.

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
