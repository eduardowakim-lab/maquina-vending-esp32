# Máquina de vendas ESP32

Firmware da máquina de vendas com teclado 4x4, dois motores, Wi-Fi configurado
por WiFiManager e atualização automática OTA pelo GitHub.

## Atualização OTA

O ESP32 consulta `ota/version.txt` ao conectar ao Wi-Fi e depois a cada seis
horas. Quando o número publicado for maior que `VERSAO_FIRMWARE`, ele baixa
`ota/firmware.bin`, instala a atualização e reinicia.

Para publicar uma nova versão:

1. Aumente `VERSAO_FIRMWARE` no sketch.
2. Exporte o binário compilado no Arduino IDE.
3. Renomeie o binário principal para `firmware.bin` e coloque-o em `ota/`.
4. Atualize `ota/version.txt` com o mesmo número.
5. Envie os arquivos ao GitHub.

Use no Arduino IDE um esquema de partição que ofereça suporte a OTA.
