#include <WiFi.h>
#include <WiFiManager.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>
#include <Preferences.h>
#include "arduino_secrets.h"

// =========================
// ATUALIZACAO OTA PELO GITHUB
// =========================

// Aumente este numero antes de compilar e publicar uma nova versao.
#define VERSAO_FIRMWARE 5

const char* URL_VERSAO =
  "https://raw.githubusercontent.com/eduardowakim-lab/maquina-vending-esp32/main/ota/version.txt";
const char* URL_FIRMWARE =
  "https://raw.githubusercontent.com/eduardowakim-lab/maquina-vending-esp32/main/ota/firmware.bin";

const char* URL_COMANDOS =
  "https://maquina-vending.eduardo-wakim.workers.dev/api/device/commands/next?device_id=machine-1";
const char* URL_CONCLUIR_COMANDO =
  "https://maquina-vending.eduardo-wakim.workers.dev/api/device/commands/";

const unsigned long INTERVALO_COMANDOS_MS = 2000;
const unsigned long RETRY_CONFIRMACAO_MS = 500;
const int MAX_TENTATIVAS_CONFIRMACAO = 3;
unsigned long ultimaConsultaComandos = 0;

Preferences preferencias;
long ultimoComandoExecutado = 0;

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

  if (comandoId <= 0 || (motor != 1 && motor != 2)) {
    Serial.println("Comando recebido com valores invalidos.");
    return;
  }

  Serial.printf("Comando %ld recebido para motor %d em %lu ms.\n",
                comandoId, motor, duracaoConsulta);

  // Protecao para uma futura politica de retry no servidor/MQTT:
  // se o mesmo comando reaparecer apos o motor ja ter girado, NAO gira novamente.
  // Apenas tenta reenviar a confirmacao.
  if (comandoId == ultimoComandoExecutado) {
    Serial.printf("Comando %ld ja foi executado. Reenviando apenas confirmacao.\n", comandoId);
    confirmarComando(comandoId);
    return;
  }

  digitalWrite(ENABLE_MOTOR1, HIGH);
  digitalWrite(ENABLE_MOTOR2, HIGH);

  unsigned long inicioMotor = millis();
  if (motor == 1) {
    girarMotor(ENABLE_MOTOR1);
  } else {
    girarMotor(ENABLE_MOTOR2);
  }
  unsigned long duracaoMotor = millis() - inicioMotor;

  // O ID e salvo na memoria nao volatil ANTES de falar com o servidor.
  // Assim, se o motor girou e a internet cair durante a confirmacao, o ESP
  // lembra apos reiniciar e evita executar novamente o mesmo comando.
  registrarComandoExecutado(comandoId);

  Serial.printf("Motor %d concluiu comando %ld em %lu ms.\n",
                motor, comandoId, duracaoMotor);

  if (!confirmarComando(comandoId)) {
    Serial.printf("ATENCAO: motor girou, mas comando %ld ainda nao foi confirmado ao servidor.\n",
                  comandoId);
  }
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

  // Os dois motores comecam desligados
  digitalWrite(ENABLE_MOTOR1, HIGH);
  digitalWrite(ENABLE_MOTOR2, HIGH);

  digitalWrite(STEP_PIN, LOW);


  // -------------------------
  // WIFI MANAGER
  // -------------------------

  WiFiManager wifiManager;

  Serial.println("Tentando conectar ao Wi-Fi...");

  /*
     Se ja existir Wi-Fi salvo,
     conecta automaticamente.

     Se nao existir,
     cria a rede:

     Maquina-ESP32
  */

  bool conectado =
      wifiManager.autoConnect("Maquina-ESP32");


  // -------------------------
  // SE NAO CONECTAR
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
