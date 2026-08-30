#include <WiFi.h>
#include <WiFiManager.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>
#include "arduino_secrets.h"

// =========================
// ATUALIZACAO OTA PELO GITHUB
// =========================

// Aumente este numero antes de compilar e publicar uma nova versao.
#define VERSAO_FIRMWARE 2

const char* URL_VERSAO =
  "https://raw.githubusercontent.com/eduardowakim-lab/maquina-vending-esp32/main/ota/version.txt";
const char* URL_FIRMWARE =
  "https://raw.githubusercontent.com/eduardowakim-lab/maquina-vending-esp32/main/ota/firmware.bin";

const char* URL_COMANDOS =
  "https://maquina-vending.eduardo-wakim.workers.dev/api/device/commands/next?device_id=machine-1";
const char* URL_CONCLUIR_COMANDO =
  "https://maquina-vending.eduardo-wakim.workers.dev/api/device/commands/";

const unsigned long INTERVALO_COMANDOS_MS = 2000;
unsigned long ultimaConsultaComandos = 0;

// A atualizacao e consultada somente quando o ESP32 liga ou reinicia.

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
// FUNÇÃO PARA GIRAR MOTOR
// =========================

void girarMotor(int enablePin) {

  // Habilita somente o motor escolhido
  digitalWrite(enablePin, LOW);

  // Define o sentido
  digitalWrite(DIR_PIN, HIGH);

  // 200 passos
  for (int i = 0; i < 200; i++) {

    digitalWrite(STEP_PIN, HIGH);
    delayMicroseconds(1000);

    digitalWrite(STEP_PIN, LOW);
    delayMicroseconds(1000);
  }

  // Desliga o motor novamente
  digitalWrite(enablePin, HIGH);
}


// =========================
// COMANDOS RECEBIDOS DO SITE
// =========================

void confirmarComando(long comandoId) {

  WiFiClientSecure cliente;
  cliente.setInsecure();

  HTTPClient http;
  http.setConnectTimeout(5000);
  http.setTimeout(5000);

  String url = String(URL_CONCLUIR_COMANDO) + comandoId +
               "/complete?device_id=machine-1";

  if (!http.begin(cliente, url)) {
    Serial.println("Nao foi possivel confirmar o comando.");
    return;
  }

  http.addHeader("X-Device-Key", CHAVE_DISPOSITIVO);
  http.addHeader("Content-Type", "text/plain");
  int codigoHttp = http.POST("");
  Serial.printf("Confirmacao do comando %ld: HTTP %d\n", comandoId, codigoHttp);
  http.end();
}

void consultarComandos() {

  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  WiFiClientSecure cliente;
  cliente.setInsecure();

  HTTPClient http;
  http.setConnectTimeout(5000);
  http.setTimeout(5000);

  if (!http.begin(cliente, URL_COMANDOS)) {
    Serial.println("Nao foi possivel consultar comandos.");
    return;
  }

  http.addHeader("X-Device-Key", CHAVE_DISPOSITIVO);
  int codigoHttp = http.GET();

  if (codigoHttp == HTTP_CODE_NO_CONTENT) {
    http.end();
    return;
  }

  if (codigoHttp != HTTP_CODE_OK) {
    Serial.printf("Falha ao consultar comandos. HTTP: %d\n", codigoHttp);
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

  if (comandoId <= 0 || (motor != 1 && motor != 2)) {
    Serial.println("Comando recebido com valores invalidos.");
    return;
  }

  Serial.printf("Site solicitou o motor %d. Comando %ld.\n", motor, comandoId);

  digitalWrite(ENABLE_MOTOR1, HIGH);
  digitalWrite(ENABLE_MOTOR2, HIGH);

  if (motor == 1) {
    girarMotor(ENABLE_MOTOR1);
  } else {
    girarMotor(ENABLE_MOTOR2);
  }

  confirmarComando(comandoId);
}


// =========================
// SETUP
// =========================

void setup() {

  Serial.begin(115200);


  // -------------------------
  // LED WIFI
  // -------------------------

  pinMode(LED_WIFI, OUTPUT);

  // Começa apagado
  digitalWrite(LED_WIFI, LOW);


  // -------------------------
  // MOTORES
  // -------------------------

  pinMode(STEP_PIN, OUTPUT);
  pinMode(DIR_PIN, OUTPUT);

  pinMode(ENABLE_MOTOR1, OUTPUT);
  pinMode(ENABLE_MOTOR2, OUTPUT);

  // Os dois motores começam desligados
  digitalWrite(ENABLE_MOTOR1, HIGH);
  digitalWrite(ENABLE_MOTOR2, HIGH);

  digitalWrite(STEP_PIN, LOW);


  // -------------------------
  // WIFI MANAGER
  // -------------------------

  WiFiManager wifiManager;

  Serial.println("Tentando conectar ao Wi-Fi...");

  /*
     Se já existir Wi-Fi salvo,
     conecta automaticamente.

     Se não existir,
     cria a rede:

     Maquina-ESP32
  */

  bool conectado =
      wifiManager.autoConnect("Maquina-ESP32");


  // -------------------------
  // SE NÃO CONECTAR
  // -------------------------

  if (!conectado) {

    digitalWrite(LED_WIFI, LOW);

    Serial.println("Falha ao conectar ao Wi-Fi.");

    delay(3000);

    ESP.restart();
  }


  // -------------------------
  // WIFI CONECTADO
  // -------------------------

  digitalWrite(LED_WIFI, HIGH);

  Serial.println();
  Serial.println("Wi-Fi conectado!");

  Serial.print("IP do ESP32: ");
  Serial.println(WiFi.localIP());

  // Verifica uma nova versao logo depois de conectar.
  verificarAtualizacao();
}


// =========================
// LOOP
// =========================

void loop() {

  // =========================
  // VERIFICA WIFI
  // =========================

  if (WiFi.status() == WL_CONNECTED) {

    // Wi-Fi conectado
    digitalWrite(LED_WIFI, HIGH);

    unsigned long agora = millis();
    if (agora - ultimaConsultaComandos >= INTERVALO_COMANDOS_MS) {
      ultimaConsultaComandos = agora;
      consultarComandos();
    }

  } else {

    // Wi-Fi caiu
    digitalWrite(LED_WIFI, LOW);
  }
}
