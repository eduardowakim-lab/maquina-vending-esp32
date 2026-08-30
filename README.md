# Maquina de vendas ESP32

Firmware e pagina web da maquina de vendas com dois motores, Wi-Fi configurado
por WiFiManager e atualizacao automatica OTA pelo GitHub.

## Controle pelo site

O painel administrativo possui um botao `Testar motor` para cada produto. O
ESP32 consulta a Cloudflare a cada 2 segundos, recebe o comando e gira somente
o motor solicitado. A chave privada do dispositivo fica em
`Blink/arduino_secrets.h` e nao e enviada ao GitHub.

O botao de teste e exclusivo do administrador. No fluxo de venda definitivo,
o comando devera ser criado no servidor apenas depois que o Mercado Pago
confirmar o pagamento por webhook.

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
