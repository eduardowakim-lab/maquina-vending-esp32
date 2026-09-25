#include <WiFi.h>
#include <WiFiManager.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include "arduino_secrets.h"

// =========================
// ATUALIZACAO OTA PELO GITHUB
// =========================

// Aumente este numero antes de compilar e publicar uma nova versao.
#define VERSAO_FIRMWARE 14

const char* URL_VERSAO =
  "https://raw.githubusercontent.com/eduardowakim-lab/maquina-vending-esp32/main/ota/version.txt";
const char* URL_FIRMWARE =
  "https://raw.githubusercontent.com/eduardowakim-lab/maquina-vending-esp32/main/ota/firmware.bin";

const char* URL_COMANDOS =
  "https://maquina-vending.eduardo-wakim.workers.dev/api/device/commands/next?device_id=machine-1";
const char* URL_CONCLUIR_COMANDO =
  "https://maquina-vending.eduardo-wakim.workers.dev/api/device/commands/";

const unsigned long INTERVALO_COMANDOS_FALLBACK_MS = 3000;
const unsigned long ATRASO_ATIVAR_FALLBACK_MS = 10000;
const unsigned long MQTT_RETRY_MAX_MS = 30000;
const unsigned long RETRY_CONFIRMACAO_MS = 500;
const int MAX_TENTATIVAS_CONFIRMACAO = 3;
unsigned long ultimaConsultaComandos = 0;
unsigned long mqttDesconectadoDesde = 0;
unsigned long proximaTentativaMqtt = 0;
unsigned long atrasoRetryMqtt = 2000;
unsigned long ultimoHeartbeatMqtt = 0;

const char* MQTT_HOST = "bd41a618.ala.us-east-1.emqxsl.com";
const uint16_t MQTT_PORT = 8883;
const char* MQTT_CLIENT_ID = "machine-001";
const char* MQTT_TOPICO_COMANDOS = "vending/machine-001/down/command";
const char* MQTT_TOPICO_STATUS = "vending/machine-001/up/status";
const char* MQTT_TOPICO_ACK = "vending/machine-001/up/ack";

static const char MQTT_CA_CERT[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIDjjCCAnagAwIBAgIQAzrx5qcRqaC7KGSxHQn65TANBgkqhkiG9w0BAQsFADBh
MQswCQYDVQQGEwJVUzEVMBMGA1UEChMMRGlnaUNlcnQgSW5jMRkwFwYDVQQLExB3
d3cuZGlnaWNlcnQuY29tMSAwHgYDVQQDExdEaWdpQ2VydCBHbG9iYWwgUm9vdCBH
MjAeFw0xMzA4MDExMjAwMDBaFw0zODAxMTUxMjAwMDBaMGExCzAJBgNVBAYTAlVT
MRUwEwYDVQQKEwxEaWdpQ2VydCBJbmMxGTAXBgNVBAsTEHd3dy5kaWdpY2VydC5j
b20xIDAeBgNVBAMTF0RpZ2lDZXJ0IEdsb2JhbCBSb290IEcyMIIBIjANBgkqhkiG
9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuzfNNNx7a8myaJCtSnX/RrohCgiN9RlUyfuI
2/Ou8jqJkTx65qsGGmvPrC3oXgkkRLpimn7Wo6h+4FR1IAWsULecYxpsMNzaHxmx
1x7e/dfgy5SDN67sH0NO3Xss0r0upS/kqbitOtSZpLYl6ZtrAGCSYP9PIUkY92eQ
q2EGnI/yuum06ZIya7XzV+hdG82MHauVBJVJ8zUtluNJbd134/tJS7SsVQepj5Wz
tCO7TG1F8PapspUwtP1MVYwnSlcUfIKdzXOS0xZKBgyMUNGPHgm+F6HmIcr9g+UQ
vIOlCsRnKPZzFBQ9RnbDhxSJITRNrw9FDKZJobq7nMWxM4MphQIDAQABo0IwQDAP
BgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIBhjAdBgNVHQ4EFgQUTiJUIBiV
5uNu5g/6+rkS7QYXjzkwDQYJKoZIhvcNAQELBQADggEBAGBnKJRvDkhj6zHd6mcY
1Yl9PMWLSn/pvtsrF9+wX3N3KjITOYFnQoQj8kVnNeyIv/iPsGEMNKSuIEyExtv4
NeF22d+mQrvHRAiGfzZ0JFrabA0UWTW98kndth/Jsw1HKj2ZL7tcu7XUIOGZX1NG
Fdtom/DzMNU+MeKNhJ7jitralj41E6Vf8PlwUHBHQRFXGU7Aj64GxJUTFy8bJZ91
8rGOmaFvE7FBcf6IKshPECBV1/MUReXgRPTqh5Uykw7+U0b6LJ3/iyK5S9kJRaTe
pLiaWN0bfVKfjllDiIGknibVb63dDcY3fe0Dkhvld1927jyNxF1WW6LZZm6zNTfl
MrY=
-----END CERTIFICATE-----
)EOF";

WiFiClientSecure clienteMqttTls;
PubSubClient clienteMqtt(clienteMqttTls);
WiFiManager wifiManager;

const unsigned long WIFI_RETRY_INTERVAL_MS = 10000;
unsigned long proximaTentativaWifi = 0;
bool portalWifiAtivo = false;

Preferences preferencias;
long ultimoComandoExecutado = 0;

// A atualizacao e consultada somente quando o ESP32 liga ou reinicia.
// Build v8 republicado apos ajuste do fluxo OTA.

// =========================
// LED DO WIFI
// =========================

#define LED_WIFI 2


// =========================
// MOTORES
// =========================

#define STEP_PIN 18
#define DIR_PIN  19

#define ENABLE_MOTOR1 21
#define ENABLE_MOTOR2 13
#define ENABLE_MOTOR3 12
#define ENABLE_MOTOR4 14

// NEMA 17 de 200 passos/volta.
// Velocidade final mantida em aproximadamente 30 RPM.
// A partida agora usa rampa de aceleracao para reduzir perda de passos
// quando a mola estiver com carga maior.
#define DELAY_PASSO_FINAL_US 5000
#define DELAY_PASSO_INICIAL_US 9000
#define PASSOS_RAMPA 50
#define PASSOS_POR_VOLTA 200


// =========================
// ATUALIZACAO AUTOMATICA
// =========================

void verificarAtualizacao() {

  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  Serial.println("Verificando atualizacao no GitHub...");

  WiFiClientSecure clienteVersao;

  // Facilita o primeiro teste, mas nao valida o certificado do servidor.
  // Veja a observacao de seguranca nas instrucoes do projeto.
  clienteVersao.setInsecure();

  HTTPClient http;
  http.setConnectTimeout(10000);
  http.setTimeout(10000);

  if (!http.begin(clienteVersao, URL_VERSAO)) {
    Serial.println("Nao foi possivel iniciar a consulta OTA.");
    return;
  }

  int codigoHttp = http.GET();

  if (codigoHttp != HTTP_CODE_OK) {
    Serial.printf("Falha ao consultar versao. HTTP: %d\n", codigoHttp);
    http.end();
    return;
  }

  String textoVersao = http.getString();
  textoVersao.trim();
  int novaVersao = textoVersao.toInt();
  http.end();

  if (novaVersao <= VERSAO_FIRMWARE) {
    Serial.printf("Firmware atual (%d) ja esta atualizado.\n", VERSAO_FIRMWARE);
    return;
  }

  Serial.printf("Nova versao encontrada: %d. Baixando...\n", novaVersao);

  // Garante que nenhum motor fique energizado durante a gravacao.
  digitalWrite(ENABLE_MOTOR1, HIGH);
  digitalWrite(ENABLE_MOTOR2, HIGH);
  digitalWrite(ENABLE_MOTOR3, HIGH);
  digitalWrite(ENABLE_MOTOR4, HIGH);

  WiFiClientSecure clienteFirmware;
  clienteFirmware.setInsecure();

  httpUpdate.rebootOnUpdate(true);
  httpUpdate.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);

  t_httpUpdate_return resultado =
    httpUpdate.update(clienteFirmware, URL_FIRMWARE, String(VERSAO_FIRMWARE));

  switch (resultado) {
    case HTTP_UPDATE_FAILED:
      Serial.printf("OTA falhou (%d): %s\n",
                    httpUpdate.getLastError(),
                    httpUpdate.getLastErrorString().c_str());
      break;

    case HTTP_UPDATE_NO_UPDATES:
      Serial.println("Servidor informou que nao ha atualizacao.");
      break;

    case HTTP_UPDATE_OK:
      // Com rebootOnUpdate(true), o ESP32 reinicia automaticamente.
      Serial.println("Atualizacao concluida.");
      break;
  }
}


// =========================
// FUNCAO PARA GIRAR MOTOR
// =========================

void girarMotor(int enablePin) {

  // Habilita somente o motor escolhido
  digitalWrite(enablePin, LOW);

  // Pequena pausa para o driver/motor estabilizar antes do primeiro passo.
  delay(20);

  // Define o sentido
  digitalWrite(DIR_PIN, HIGH);

  // Uma volta completa com rampa suave nos primeiros passos.
  // Comeca mais devagar para aumentar a margem contra perda de passos
  // e vai acelerando ate a velocidade final ja usada pela maquina.
  for (int i = 0; i < PASSOS_POR_VOLTA; i++) {

    int delayPassoUs = DELAY_PASSO_FINAL_US;

    if (i < PASSOS_RAMPA) {
      long diferenca = DELAY_PASSO_INICIAL_US - DELAY_PASSO_FINAL_US;
      delayPassoUs = DELAY_PASSO_INICIAL_US -
                     ((long)i * diferenca / PASSOS_RAMPA);
    }

    digitalWrite(STEP_PIN, HIGH);
    delayMicroseconds(delayPassoUs);

    digitalWrite(STEP_PIN, LOW);
    delayMicroseconds(delayPassoUs);
  }

  // Desliga o motor novamente
  digitalWrite(enablePin, HIGH);
}


// =========================
// COMANDOS RECEBIDOS DO SITE
// =========================

bool confirmarComandoUmaVez(long comandoId) {

  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  WiFiClientSecure cliente;
  cliente.setInsecure();

  HTTPClient http;
  http.setConnectTimeout(3000);
  http.setTimeout(3000);

  String url = String(URL_CONCLUIR_COMANDO) + comandoId +
               "/complete?device_id=machine-1";

  if (!http.begin(cliente, url)) {
    Serial.println("Nao foi possivel iniciar a confirmacao do comando.");
    return false;
  }

  http.addHeader("X-Device-Key", CHAVE_DISPOSITIVO);
  http.addHeader("Content-Type", "text/plain");
  int codigoHttp = http.POST("");
  http.end();

  Serial.printf("Confirmacao do comando %ld: HTTP %d\n", comandoId, codigoHttp);

  // 200 = confirmou agora. 404 pode significar que o servidor ja nao considera
  // o comando claimed; nesse caso mantemos o ID salvo para evitar giro duplicado.
  return codigoHttp >= 200 && codigoHttp < 300;
}

bool confirmarComando(long comandoId) {
  for (int tentativa = 1; tentativa <= MAX_TENTATIVAS_CONFIRMACAO; tentativa++) {
    if (confirmarComandoUmaVez(comandoId)) {
      return true;
    }

    Serial.printf("Falha ao confirmar comando %ld. Tentativa %d/%d.\n",
                  comandoId, tentativa, MAX_TENTATIVAS_CONFIRMACAO);

    if (tentativa < MAX_TENTATIVAS_CONFIRMACAO) {
      delay(RETRY_CONFIRMACAO_MS);
    }
  }
  return false;
}

void registrarComandoExecutado(long comandoId) {
  ultimoComandoExecutado = comandoId;
  preferencias.putLong("ultimo_cmd", comandoId);
}

bool publicarAckMqtt(long comandoId, int motor, const char* status) {
  if (!clienteMqtt.connected()) {
    return false;
  }

  char payload[160];
  snprintf(payload, sizeof(payload),
           "{\"commandId\":%ld,\"motor\":%d,\"status\":\"%s\",\"deviceId\":\"machine-1\"}",
           comandoId, motor, status);
  return clienteMqtt.publish(MQTT_TOPICO_ACK, payload, false);
}

void executarComando(long comandoId, int motor, const char* transporte) {
  if (comandoId <= 0 || motor < 1 || motor > 4) {
    Serial.println("Comando recebido com valores invalidos.");
    return;
  }

  Serial.printf("Comando %ld recebido para motor %d via %s.\n",
                comandoId, motor, transporte);

  if (comandoId == ultimoComandoExecutado) {
    Serial.printf("Comando %ld ja foi executado. Reenviando confirmacoes.\n", comandoId);
    if (!publicarAckMqtt(comandoId, motor, "completed")) {
      confirmarComando(comandoId);
    }
    return;
  }

  digitalWrite(ENABLE_MOTOR1, HIGH);
  digitalWrite(ENABLE_MOTOR2, HIGH);
  digitalWrite(ENABLE_MOTOR3, HIGH);
  digitalWrite(ENABLE_MOTOR4, HIGH);

  unsigned long inicioMotor = millis();
  if (motor == 1) {
    girarMotor(ENABLE_MOTOR1);
  } else if (motor == 2) {
    girarMotor(ENABLE_MOTOR2);
  } else if (motor == 3) {
    girarMotor(ENABLE_MOTOR3);
  } else {
    girarMotor(ENABLE_MOTOR4);
  }

  registrarComandoExecutado(comandoId);
  Serial.printf("Motor %d concluiu comando %ld em %lu ms.\n",
                motor, comandoId, millis() - inicioMotor);

  bool ackMqttEnviado = publicarAckMqtt(comandoId, motor, "completed");
  if (!ackMqttEnviado && !confirmarComando(comandoId)) {
    Serial.printf("ATENCAO: comando %ld executado, mas a confirmacao HTTP falhou.\n",
                  comandoId);
  }
}

void aoReceberMqtt(char* topico, byte* bytes, unsigned int tamanho) {
  if (strcmp(topico, MQTT_TOPICO_COMANDOS) != 0 || tamanho == 0 || tamanho >= 80) {
    return;
  }

  char payload[80];
  memcpy(payload, bytes, tamanho);
  payload[tamanho] = '\0';

  char* separador = strchr(payload, ',');
  if (!separador) {
    Serial.println("Payload MQTT de comando invalido.");
    return;
  }

  *separador = '\0';
  long comandoId = atol(payload);
  int motor = atoi(separador + 1);
  executarComando(comandoId, motor, "mqtt");
}

bool publicarStatusMqtt(const char* status) {
  char payload[160];
  snprintf(payload, sizeof(payload),
           "{\"status\":\"%s\",\"deviceId\":\"machine-1\",\"mqttClientId\":\"machine-001\",\"firmwareVersion\":%d}",
           status, VERSAO_FIRMWARE);
  if (!clienteMqtt.publish(MQTT_TOPICO_STATUS, payload, true)) {
    Serial.println("Falha ao publicar heartbeat MQTT. Forcando reconexao.");
    clienteMqtt.disconnect();
    return false;
  }
  return true;
}

bool conectarMqtt() {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  const char* offline = "{\"status\":\"offline\",\"deviceId\":\"machine-1\",\"mqttClientId\":\"machine-001\"}";
  Serial.println("Tentando conectar ao MQTT com TLS...");

  bool conectado = clienteMqtt.connect(
    MQTT_CLIENT_ID,
    MQTT_USUARIO,
    MQTT_SENHA,
    MQTT_TOPICO_STATUS,
    1,
    true,
    offline,
    false
  );

  if (!conectado) {
    Serial.printf("MQTT indisponivel. Estado: %d\n", clienteMqtt.state());
    return false;
  }

  if (!clienteMqtt.subscribe(MQTT_TOPICO_COMANDOS, 1)) {
    Serial.println("Falha ao assinar topico de comandos MQTT.");
    clienteMqtt.disconnect();
    return false;
  }

  if (!publicarStatusMqtt("online")) {
    return false;
  }
  ultimoHeartbeatMqtt = millis();
  mqttDesconectadoDesde = 0;
  atrasoRetryMqtt = 2000;
  Serial.println("MQTT conectado e aguardando comandos.");

  // Nao abre uma segunda conexao TLS/HTTPS enquanto o MQTT esta conectado.
  // Comandos criados durante uma queda sao recuperados pelo fallback HTTP antes
  // da reconexao ou pela sessao persistente do MQTT.
  return true;
}

void manterMqtt() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  if (clienteMqtt.connected()) {
    clienteMqtt.loop();
    unsigned long agora = millis();
    if (agora - ultimoHeartbeatMqtt >= 15000) {
      publicarStatusMqtt("online");
      ultimoHeartbeatMqtt = agora;
    }
    return;
  }

  unsigned long agora = millis();
  if (mqttDesconectadoDesde == 0) {
    mqttDesconectadoDesde = agora;
  }

  if ((long)(agora - proximaTentativaMqtt) < 0) {
    return;
  }

  if (conectarMqtt()) {
    return;
  }

  proximaTentativaMqtt = agora + atrasoRetryMqtt;
  atrasoRetryMqtt = min(atrasoRetryMqtt * 2, MQTT_RETRY_MAX_MS);
}

void consultarComandos() {

  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  unsigned long inicioConsulta = millis();

  WiFiClientSecure cliente;
  cliente.setInsecure();

  HTTPClient http;
  http.setConnectTimeout(3000);
  http.setTimeout(3000);

  if (!http.begin(cliente, URL_COMANDOS)) {
    Serial.println("Nao foi possivel consultar comandos.");
    return;
  }

  http.addHeader("X-Device-Key", CHAVE_DISPOSITIVO);
  http.addHeader("X-Firmware-Version", String(VERSAO_FIRMWARE));
  http.addHeader("X-Transport", clienteMqtt.connected() ? "mqtt-sync" : "http");
  int codigoHttp = http.GET();
  unsigned long duracaoConsulta = millis() - inicioConsulta;

  if (codigoHttp == HTTP_CODE_NO_CONTENT) {
    http.end();
    if (duracaoConsulta > 2500) {
      Serial.printf("Consulta sem comando demorou %lu ms.\n", duracaoConsulta);
    }
    return;
  }

  if (codigoHttp != HTTP_CODE_OK) {
    Serial.printf("Falha ao consultar comandos. HTTP: %d. Tempo: %lu ms.\n",
                  codigoHttp, duracaoConsulta);
    http.end();
    return;
  }

  String comando = http.getString();
  http.end();
  comando.trim();

  int separador = comando.indexOf(',');
  if (separador <= 0) {
    Serial.println("Comando recebido em formato invalido.");
    return;
  }

  long comandoId = comando.substring(0, separador).toInt();
  int motor = comando.substring(separador + 1).toInt();

  Serial.printf("Comando HTTP obtido em %lu ms.\n", duracaoConsulta);
  executarComando(comandoId, motor, "http");
}


// =========================
// SETUP
// =========================

void setup() {

  Serial.begin(115200);

  // Guarda somente o ultimo ID executado. Nao muda configuracao de Wi-Fi
  // nem qualquer outro comportamento existente.
  preferencias.begin("vending", false);
  ultimoComandoExecutado = preferencias.getLong("ultimo_cmd", 0);
  Serial.printf("Ultimo comando executado salvo: %ld\n", ultimoComandoExecutado);


  // -------------------------
  // LED WIFI
  // -------------------------

  pinMode(LED_WIFI, OUTPUT);

  // Comeca apagado
  digitalWrite(LED_WIFI, LOW);


  // -------------------------
  // MOTORES
  // -------------------------

  pinMode(STEP_PIN, OUTPUT);
  pinMode(DIR_PIN, OUTPUT);

  pinMode(ENABLE_MOTOR1, OUTPUT);
  pinMode(ENABLE_MOTOR2, OUTPUT);
  pinMode(ENABLE_MOTOR3, OUTPUT);
  pinMode(ENABLE_MOTOR4, OUTPUT);

  // Os quatro motores comecam desligados
  digitalWrite(ENABLE_MOTOR1, HIGH);
  digitalWrite(ENABLE_MOTOR2, HIGH);
  digitalWrite(ENABLE_MOTOR3, HIGH);
  digitalWrite(ENABLE_MOTOR4, HIGH);

  digitalWrite(STEP_PIN, LOW);


  // -------------------------
  // WIFI MANAGER
  // -------------------------

  Serial.println("Tentando conectar ao Wi-Fi...");

  /*
     Mantem as credenciais ja salvas, mas nao bloqueia a inicializacao
     caso o roteador esteja desligado no momento em que o ESP32 ligar.

     Se a rede salva estiver indisponivel, o portal Maquina-ESP32 pode
     ficar ativo para reconfiguracao, enquanto o loop continua tentando
     reconectar automaticamente em segundo plano.
  */

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);

  wifiManager.setConfigPortalBlocking(false);
  bool conectado = wifiManager.autoConnect("Maquina-ESP32");
  portalWifiAtivo = !conectado;

  if (conectado || WiFi.status() == WL_CONNECTED) {
    digitalWrite(LED_WIFI, HIGH);

    Serial.println();
    Serial.println("Wi-Fi conectado!");

    Serial.print("IP do ESP32: ");
    Serial.println(WiFi.localIP());
  } else {
    digitalWrite(LED_WIFI, LOW);
    proximaTentativaWifi = millis();
    Serial.println("Wi-Fi indisponivel no boot. Continuarei tentando a rede salva automaticamente.");
  }

  clienteMqttTls.setCACert(MQTT_CA_CERT);
  clienteMqttTls.setHandshakeTimeout(5);
  clienteMqtt.setServer(MQTT_HOST, MQTT_PORT);
  clienteMqtt.setCallback(aoReceberMqtt);
  clienteMqtt.setKeepAlive(45);
  clienteMqtt.setSocketTimeout(8);

  // Verifica uma nova versao logo depois de conectar.
  verificarAtualizacao();

  mqttDesconectadoDesde = millis();

  // Preserva primeiro o caminho HTTP que ja era estavel. A tentativa MQTT
  // ocorre depois no loop e nao impede a inicializacao completa da maquina.
  consultarComandos();
}


// =========================
// LOOP
// =========================

void loop() {

  // =========================
  // VERIFICA WIFI
// =========================

  // Mantem o portal nao bloqueante responsivo, caso esteja ativo.
  wifiManager.process();

  if (WiFi.status() == WL_CONNECTED) {

    // Wi-Fi conectado
    digitalWrite(LED_WIFI, HIGH);

    if (portalWifiAtivo) {
      wifiManager.stopConfigPortal();
      portalWifiAtivo = false;
      Serial.println("Rede salva voltou. Portal Wi-Fi encerrado.");
    }

    unsigned long agora = millis();
    bool fallbackHttpAtivo = !clienteMqtt.connected() &&
      mqttDesconectadoDesde != 0 &&
      agora - mqttDesconectadoDesde >= ATRASO_ATIVAR_FALLBACK_MS;

    if (fallbackHttpAtivo &&
        agora - ultimaConsultaComandos >= INTERVALO_COMANDOS_FALLBACK_MS) {
      ultimaConsultaComandos = agora;
      consultarComandos();
    }

    // Executa o fallback antes de uma nova tentativa TLS do MQTT.
    manterMqtt();

  } else {

    // Wi-Fi caiu ou ainda nao estava disponivel desde o boot.
    digitalWrite(LED_WIFI, LOW);
    if (mqttDesconectadoDesde == 0) {
      mqttDesconectadoDesde = millis();
    }

    unsigned long agora = millis();
    if ((long)(agora - proximaTentativaWifi) >= 0) {
      Serial.println("Tentando reconectar ao Wi-Fi salvo...");
      WiFi.reconnect();
      proximaTentativaWifi = agora + WIFI_RETRY_INTERVAL_MS;
    }
  }
}
