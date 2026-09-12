import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker from "../src/worker.js";

function testEnv() {
  const calls = [];
  return {
    calls,
    env: {
      EMQX_WEBHOOK_SECRET: "test-webhook-secret-with-enough-entropy",
      DB: {
        prepare(sql) {
          return {
            bind(...values) {
              return {
                async run() {
                  calls.push({ sql, values });
                  return { meta: { changes: 1 } };
                }
              };
            }
          };
        }
      }
    }
  };
}

function eventRequest(body, secret = "test-webhook-secret-with-enough-entropy") {
  return new Request("https://example.com/api/emqx/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-EMQX-Webhook-Secret": secret
    },
    body: JSON.stringify(body)
  });
}

test("rejects an invalid EMQX webhook secret", async () => {
  const { env, calls } = testEnv();
  const response = await worker.fetch(eventRequest({ topic: "x", payload: {} }, "wrong"), env, {});
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test("records MQTT online status", async () => {
  const { env, calls } = testEnv();
  const response = await worker.fetch(eventRequest({
    topic: "vending/machine-001/up/status",
    payload: JSON.stringify({ status: "online", deviceId: "machine-1", firmwareVersion: 9 })
  }), env, {});
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /UPDATE devices SET last_seen/);
  assert.equal(calls[0].values[1], 9);
  assert.equal(calls[0].values[3], "machine-1");
});

test("completes a command from an MQTT ACK", async () => {
  const { env, calls } = testEnv();
  const response = await worker.fetch(eventRequest({
    topic: "vending/machine-001/up/ack",
    payload: { commandId: 42, motor: 3, status: "completed" }
  }), env, {});
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /UPDATE device_commands SET status = 'completed'/);
  assert.equal(calls[0].values[1], 42);
});

test("HTTP confirmation also completes a command delivered directly by MQTT", async () => {
  const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(source, /status IN \('pending', 'claimed'\)/);
});

test("stale test cleanup never expires a paid command", async () => {
  const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(source, /NOT EXISTS \(SELECT 1 FROM payment_orders WHERE payment_orders\.device_command_id = device_commands\.id\)/);
});

test("firmware avoids opening HTTP TLS when MQTT ACK was sent", async () => {
  const source = await readFile(new URL("../../Blink/Blink.ino", import.meta.url), "utf8");
  assert.match(source, /if \(!ackMqttEnviado && !confirmarComando\(comandoId\)\)/);
  assert.match(source, /bool publicarAckMqtt/);
});
