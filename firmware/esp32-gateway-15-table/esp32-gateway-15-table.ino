#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include "mbedtls/md.h"
#include <time.h>

// =========================
// WiFi + API configuration
// =========================
static const char* WIFI_SSID = "RGI";
static const char* WIFI_PASS = "rgijayajayajaya";

static const char* API_BASE     = "https://pos-api.v-luxe.id/api/v1";
static const char* DEVICE_ID    = "cmm5b9xe9000zdtmhseoe619f";
static const char* DEVICE_TOKEN = "iot-3c11a46251e9b5735932b1ef8d8d3a49";
static const char* HMAC_SECRET  = "billiard";

// =========================
// Timing
// =========================
static const uint32_t HEARTBEAT_INTERVAL_MS   = 30000;
static const uint32_t PULL_INTERVAL_MS        = 500;
static const uint32_t CONFIG_REFRESH_MS       = 60000;
static const uint32_t RELAY_SYNC_INTERVAL_MS  = 3000;
static const uint32_t BUTTON_SCAN_MS          = 20;
static const uint32_t BUTTON_DEBOUNCE_MS      = 40;
static const uint32_t BUTTON_API_FAIL_HOLD_MS = 300;
static const uint32_t WIFI_RECONNECT_INTERVAL_MS = 10000;

// =========================
// Relay config (ACTIVE LOW)
// =========================
static const bool RELAY_ACTIVE_LOW = true;

static const int RELAY_GPIO_PINS[16] = {
  23, 19, 18, 27,
  26, 25, 33, 32,
  14, 13, 15, 5,
  17, 16, 4, 2
};

// =========================
// PCF8574 (2 modul)
// =========================
static const uint8_t PCF0_ADDR = 0x20; // CH0..CH7
static const uint8_t PCF1_ADDR = 0x21; // CH8..CH15
static const int I2C_SDA = 21;
static const int I2C_SCL = 22;

// =========================
// Data
// =========================
struct ApiResponse {
  int statusCode;
  String body;
  bool ok;
};

struct ButtonEventResult {
  bool httpOk;
  bool accepted;
  bool hasShouldOn;
  bool shouldOn;
  String blockedReason;
  String message;
};

struct TableConfig {
  String tableId;
  String tableName;
  uint8_t relayChannel;
};

TableConfig TABLES[16];
uint8_t TABLE_COUNT = 0;

bool channelState[16] = {false};

bool btnStable[16];
bool btnLastRead[16];
uint32_t btnLastChangeMs[16];
uint32_t lastBtnScanAt = 0;

uint32_t lastHeartbeatAt = 0;
uint32_t lastPullAt = 0;
uint32_t lastConfigAt = 0;
uint32_t lastRelaySyncAt = 0;

uint32_t buttonApiFailHoldUntil[16] = {0};

// non-blocking blink 1x
struct BlinkJob {
  bool active;
  uint8_t channel;
  bool baseState;
  bool toggledState;
  uint8_t transitionsDone;
  uint8_t transitionsTarget;
  uint16_t pulseMs;
  uint32_t lastStepAt;
};
BlinkJob blinkJob{false, 0, false, false, 0, 0, 140, 0};

bool isButtonApiFailHold(uint8_t ch) { return millis() < buttonApiFailHoldUntil[ch]; }

const char* wifiStatusName(wl_status_t st) {
  switch (st) {
    case WL_CONNECTED: return "CONNECTED";
    case WL_IDLE_STATUS: return "IDLE";
    case WL_NO_SSID_AVAIL: return "NO_SSID";
    case WL_SCAN_COMPLETED: return "SCAN_DONE";
    case WL_CONNECT_FAILED: return "CONNECT_FAILED";
    case WL_CONNECTION_LOST: return "CONNECTION_LOST";
    case WL_DISCONNECTED: return "DISCONNECTED";
    default: return "UNKNOWN";
  }
}

// =========================
// Utility
// =========================
String genNonce() {
  uint32_t a = esp_random();
  uint32_t b = esp_random();
  return String(a, HEX) + String(b, HEX) + String(millis(), HEX);
}

String hmacSha256(const String& message, const char* secret) {
  uint8_t hmac[32];
  mbedtls_md_context_t ctx;
  const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);

  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, info, 1);
  mbedtls_md_hmac_starts(&ctx, (const unsigned char*)secret, strlen(secret));
  mbedtls_md_hmac_update(&ctx, (const unsigned char*)message.c_str(), message.length());
  mbedtls_md_hmac_finish(&ctx, hmac);
  mbedtls_md_free(&ctx);

  char out[65];
  for (int i = 0; i < 32; i++) sprintf(out + (i * 2), "%02x", hmac[i]);
  out[64] = '\0';
  return String(out);
}

String nowTs() { return String((long)time(nullptr)); }

// =========================
// WiFi + NTP
// =========================
bool ensureWifi() {
  wl_status_t st = WiFi.status();
  if (st == WL_CONNECTED) return true;

  static uint32_t lastReconnectAttempt = 0;
  uint32_t now = millis();
  if (now - lastReconnectAttempt < WIFI_RECONNECT_INTERVAL_MS) return false;

  lastReconnectAttempt = now;
  Serial.printf("[WiFi] reconnect attempt, status=%s\n", wifiStatusName(st));

  if (st == WL_DISCONNECTED || st == WL_NO_SSID_AVAIL || st == WL_CONNECT_FAILED) {
    WiFi.begin(WIFI_SSID, WIFI_PASS);
  } else {
    WiFi.reconnect();
  }

  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < 800) {
    delay(20);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WiFi] connected ip=%s\n", WiFi.localIP().toString().c_str());
    return true;
  }
  return false;
}

void syncNtpTime() {
  configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  uint32_t start = millis();
  while (time(nullptr) < 100000 && (millis() - start) < 15000) delay(200);
}

// =========================
// Relay
// =========================
void initRelaysFailSafeOff() {
  for (int ch = 0; ch < 16; ch++) {
    pinMode(RELAY_GPIO_PINS[ch], OUTPUT);
    digitalWrite(RELAY_GPIO_PINS[ch], RELAY_ACTIVE_LOW ? HIGH : LOW);
    channelState[ch] = false;
  }
}

void setRelayChannel(uint8_t ch, bool on) {
  if (ch > 15) return;
  uint8_t level = RELAY_ACTIVE_LOW ? (on ? LOW : HIGH) : (on ? HIGH : LOW);
  digitalWrite(RELAY_GPIO_PINS[ch], level);
  channelState[ch] = on;
  Serial.printf("[Relay] CH=%u => %s\n", ch, on ? "ON" : "OFF");
}

void scheduleBlink1x(uint8_t ch) {
  if (ch > 15) return;
  blinkJob.active = true;
  blinkJob.channel = ch;
  blinkJob.baseState = channelState[ch];
  blinkJob.toggledState = channelState[ch];
  blinkJob.transitionsDone = 0;
  blinkJob.transitionsTarget = 2;
  blinkJob.lastStepAt = 0;
}

void processBlinkJob() {
  if (!blinkJob.active) return;
  uint32_t now = millis();
  if (blinkJob.lastStepAt != 0 && (now - blinkJob.lastStepAt) < blinkJob.pulseMs) return;

  blinkJob.toggledState = !blinkJob.toggledState;
  setRelayChannel(blinkJob.channel, blinkJob.toggledState);
  blinkJob.transitionsDone++;
  blinkJob.lastStepAt = now;

  if (blinkJob.transitionsDone >= blinkJob.transitionsTarget) {
    setRelayChannel(blinkJob.channel, blinkJob.baseState);
    blinkJob.active = false;
  }
}

// =========================
// HTTPS request
// =========================
ApiResponse apiRequest(const String& method,
                       const String& url,
                       const String& body,
                       const String& signature,
                       const String& timestamp,
                       const String& nonce) {
  ApiResponse out{0, "", false};
  if (!ensureWifi()) { out.statusCode = -1; return out; }

  HTTPClient http;
  static WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(12000);

  http.begin(client, url);
  http.setTimeout(12000);
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);

  if (body.length() > 0) http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-id", DEVICE_ID);
  http.addHeader("x-device-token", DEVICE_TOKEN);
  http.addHeader("x-timestamp", timestamp);
  http.addHeader("x-nonce", nonce);
  http.addHeader("x-signature", signature);

  int code = -1;
  if (method == "POST") code = http.POST(body);
  else if (method == "GET") code = http.GET();

  out.statusCode = code;
  out.body = http.getString();
  out.ok = (code >= 200 && code < 300);
  http.end();
  return out;
}

// =========================
// API helpers
// =========================
bool fetchDeviceConfig() {
  String ts = nowTs();
  String nonce = genNonce();
  String msg = String(DEVICE_ID) + ":" + ts + ":" + nonce + ":";
  String sig = hmacSha256(msg, HMAC_SECRET);

  String url = String(API_BASE) + "/iot/devices/config?deviceId=" + String(DEVICE_ID);
  ApiResponse res = apiRequest("GET", url, "", sig, ts, nonce);
  if (!res.ok) {
    Serial.printf("[Sync] fail code=%d\n", res.statusCode);
    return false;
  }

  StaticJsonDocument<8192> root;
  if (deserializeJson(root, res.body)) return false;

  JsonArray tables = root["tables"].as<JsonArray>();
  if (tables.isNull()) { TABLE_COUNT = 0; return false; }

  TABLE_COUNT = 0;
  for (JsonObject t : tables) {
    if (TABLE_COUNT >= 16) break;
    TABLES[TABLE_COUNT].tableId = String((const char*)t["id"]);
    TABLES[TABLE_COUNT].tableName = String((const char*)t["name"]);
    TABLES[TABLE_COUNT].relayChannel = (uint8_t)(t["relayChannel"] | 0);
    TABLE_COUNT++;
  }

  return true;
}

String findTableIdByRelayCh(uint8_t ch) {
  for (int i = 0; i < TABLE_COUNT; i++) {
    if (TABLES[i].relayChannel == ch) return TABLES[i].tableId;
  }
  return "";
}

bool syncRelayStateFromBackend() {
  String ts = nowTs();
  String nonce = genNonce();
  String msg = String(DEVICE_ID) + ":" + ts + ":" + nonce + ":";
  String sig = hmacSha256(msg, HMAC_SECRET);

  String url = String(API_BASE) + "/iot/devices/relay-state?deviceId=" + String(DEVICE_ID);
  ApiResponse res = apiRequest("GET", url, "", sig, ts, nonce);
  if (!res.ok) return false;

  StaticJsonDocument<4096> root;
  if (deserializeJson(root, res.body)) return false;

  JsonArray states = root["states"].as<JsonArray>();
  if (states.isNull()) return false;

  for (JsonObject st : states) {
    int ch = st["relayChannel"] | -1;
    bool shouldOn = st["shouldOn"] | false;
    if (ch < 0 || ch > 15) continue;
    if (isButtonApiFailHold((uint8_t)ch)) continue;
    if (channelState[ch] != shouldOn) {
      Serial.printf("[Sync] CH=%d shouldOn=%s apply\n", ch, shouldOn ? "true" : "false");
      setRelayChannel((uint8_t)ch, shouldOn);
    }
  }

  return true;
}

bool sendHeartbeat() {
  String url = String(API_BASE) + "/iot/devices/heartbeat?deviceId=" + String(DEVICE_ID);
  String body = "{\"signalStrength\":-55}";

  String ts = nowTs();
  String nonce = genNonce();
  String msg = String(DEVICE_ID) + ":" + ts + ":" + nonce + ":";
  String sig = hmacSha256(msg, HMAC_SECRET);

  ApiResponse res = apiRequest("POST", url, body, sig, ts, nonce);
  return res.ok;
}

bool sendAck(const String& commandId, bool success) {
  StaticJsonDocument<128> doc;
  doc["commandId"] = commandId;
  doc["success"] = success;

  String body;
  serializeJson(doc, body);

  String ts = nowTs();
  String nonce = genNonce();
  String msg = String(DEVICE_ID) + ":" + ts + ":" + nonce + ":" + body;
  String sig = hmacSha256(msg, HMAC_SECRET);

  String url = String(API_BASE) + "/iot/commands/ack?deviceId=" + String(DEVICE_ID);
  ApiResponse res = apiRequest("POST", url, body, sig, ts, nonce);
  return res.ok;
}

void pullAndExecuteCommand() {
  String ts = nowTs();
  String nonce = genNonce();
  String msg = String(DEVICE_ID) + ":" + ts + ":" + nonce + ":";
  String sig = hmacSha256(msg, HMAC_SECRET);

  String url = String(API_BASE) + "/iot/commands/pull?deviceId=" + String(DEVICE_ID);
  ApiResponse res = apiRequest("GET", url, "", sig, ts, nonce);
  if (!res.ok) return;

  StaticJsonDocument<2048> root;
  if (deserializeJson(root, res.body)) return;

  JsonVariant cmd = root["command"];
  if (cmd.isNull()) return;

  String commandId = cmd["id"] | "";
  String type = cmd["type"] | "";
  int relayCh = cmd["payload"]["relayChannel"] | -1;

  bool success = false;
  if (relayCh >= 0 && relayCh <= 15) {
    if (type == "LIGHT_ON") { setRelayChannel((uint8_t)relayCh, true); success = true; }
    else if (type == "LIGHT_OFF") { setRelayChannel((uint8_t)relayCh, false); success = true; }
    else if (type == "ALL_OFF") {
      for (int ch = 0; ch < 16; ch++) setRelayChannel((uint8_t)ch, false);
      success = true;
    } else if (type == "BLINK_3X") {
      scheduleBlink1x((uint8_t)relayCh);
      success = true;
    }
  }

  if (commandId.length()) sendAck(commandId, success);
}

// =========================
// PCF8574 low-level
// =========================
bool i2cWriteByte(uint8_t addr, uint8_t data) {
  Wire.beginTransmission(addr);
  Wire.write(data);
  return Wire.endTransmission() == 0;
}

bool i2cReadByte(uint8_t addr, uint8_t &data) {
  Wire.requestFrom((int)addr, 1);
  if (Wire.available() < 1) return false;
  data = Wire.read();
  return true;
}

bool pcfInit(uint8_t addr) {
  return i2cWriteByte(addr, 0xFF);
}

bool readButtons16(bool pressed[16]) {
  uint8_t b0 = 0xFF, b1 = 0xFF;
  if (!i2cReadByte(PCF0_ADDR, b0)) return false;
  if (!i2cReadByte(PCF1_ADDR, b1)) return false;

  uint8_t p0 = ~b0;
  uint8_t p1 = ~b1;

  for (int i = 0; i < 8; i++) pressed[i] = (p0 >> i) & 1;
  for (int i = 0; i < 8; i++) pressed[i + 8] = (p1 >> i) & 1;
  return true;
}

void initButtonsPCF() {
  Wire.begin(I2C_SDA, I2C_SCL);
  pcfInit(PCF0_ADDR);
  pcfInit(PCF1_ADDR);

  bool pressed[16] = {false};
  readButtons16(pressed);

  uint32_t now = millis();
  for (int ch = 0; ch < 16; ch++) {
    bool level = pressed[ch] ? LOW : HIGH;
    btnStable[ch] = level;
    btnLastRead[ch] = level;
    btnLastChangeMs[ch] = now;
  }
}

ButtonEventResult sendButtonEventToBackend(uint8_t ch, const String& tableId, const char* action) {
  ButtonEventResult out{false, false, false, false, "", ""};

  StaticJsonDocument<256> doc;
  doc["relayChannel"] = ch;
  if (tableId.length()) doc["tableId"] = tableId;
  doc["action"] = action;

  String body;
  serializeJson(doc, body);

  String ts = nowTs();
  String nonce = genNonce();
  String msg = String(DEVICE_ID) + ":" + ts + ":" + nonce + ":" + body;
  String sig = hmacSha256(msg, HMAC_SECRET);

  String url = String(API_BASE) + "/iot/devices/button";
  ApiResponse res = apiRequest("POST", url, body, sig, ts, nonce);
  out.httpOk = res.ok;
  Serial.printf("[BTN->API] CH=%u action=%s code=%d\n", ch, action, res.statusCode);

  if (!res.ok) {
    if (res.body.length()) Serial.printf("[BTN->API] body=%s\n", res.body.c_str());
    return out;
  }

  StaticJsonDocument<768> root;
  if (deserializeJson(root, res.body)) return out;

  out.accepted = root["accepted"] | false;
  out.hasShouldOn = !root["shouldOn"].isNull();
  out.shouldOn = root["shouldOn"] | false;
  out.blockedReason = String((const char*)(root["blockedReason"] | ""));
  out.message = String((const char*)(root["message"] | ""));
  Serial.printf("[BTN<-API] accepted=%s hasShouldOn=%s shouldOn=%s reason=%s msg=%s\n",
    out.accepted ? "true" : "false",
    out.hasShouldOn ? "true" : "false",
    out.shouldOn ? "true" : "false",
    out.blockedReason.c_str(),
    out.message.c_str());
  return out;
}

void scanButtonsPCF() {
  uint32_t now = millis();
  if (now - lastBtnScanAt < BUTTON_SCAN_MS) return;
  lastBtnScanAt = now;

  bool pressed[16] = {false};
  if (!readButtons16(pressed)) return;

  for (int ch = 0; ch < 16; ch++) {
    bool currentLevel = pressed[ch] ? LOW : HIGH;

    if (currentLevel != btnLastRead[ch]) {
      btnLastRead[ch] = currentLevel;
      btnLastChangeMs[ch] = now;
    }

    if ((now - btnLastChangeMs[ch]) > BUTTON_DEBOUNCE_MS && btnStable[ch] != btnLastRead[ch]) {
      bool oldStable = btnStable[ch];
      btnStable[ch] = btnLastRead[ch];

      if (isButtonApiFailHold((uint8_t)ch)) continue;

      bool requestOn = (btnStable[ch] == LOW);
      const char* action = requestOn ? "ON" : "OFF";

      String tableId = findTableIdByRelayCh((uint8_t)ch);
      Serial.printf("[BTN] state change CH=%d %s->%s request=%s tableId=%s\n",
        ch,
        oldStable == LOW ? "ON" : "OFF",
        btnStable[ch] == LOW ? "ON" : "OFF",
        action,
        tableId.c_str());

      // Self-locking switch: apply requested state immediately for fast response.
      if (channelState[ch] != requestOn) {
        setRelayChannel((uint8_t)ch, requestOn);
      }

      ButtonEventResult result = sendButtonEventToBackend((uint8_t)ch, tableId, action);

      if (!result.httpOk) {
        buttonApiFailHoldUntil[ch] = millis() + BUTTON_API_FAIL_HOLD_MS;
        Serial.printf("[BTN] API fail, keep local CH=%d=%s hold=%ums\n",
          ch,
          channelState[ch] ? "ON" : "OFF",
          BUTTON_API_FAIL_HOLD_MS);
        continue;
      }

      if (result.hasShouldOn && channelState[ch] != result.shouldOn) {
        Serial.printf("[BTN] reconcile CH=%d -> shouldOn=%s\n", ch, result.shouldOn ? "ON" : "OFF");
        setRelayChannel((uint8_t)ch, result.shouldOn);
      } else if (!result.accepted) {
        Serial.printf("[BTN] blocked CH=%d reason=%s\n", ch, result.blockedReason.c_str());
      }
    }
  }
}

// =========================
// Setup & loop
// =========================
void setup() {
  Serial.begin(115200);
  delay(300);

  initRelaysFailSafeOff();

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  ensureWifi();
  syncNtpTime();

  initButtonsPCF();
  fetchDeviceConfig();

  for (int i = 0; i < 5; i++) {
    if (syncRelayStateFromBackend()) break;
    delay(500);
  }

  sendHeartbeat();

  lastHeartbeatAt = millis();
  lastPullAt = millis();
  lastConfigAt = millis();
  lastRelaySyncAt = millis();
  lastBtnScanAt = millis();
}

void loop() {
  scanButtonsPCF();
  processBlinkJob();

  uint32_t now = millis();

  if (now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
    sendHeartbeat();
    lastHeartbeatAt = now;
  }

  if (now - lastPullAt >= PULL_INTERVAL_MS) {
    pullAndExecuteCommand();
    lastPullAt = now;
  }

  if (now - lastConfigAt >= CONFIG_REFRESH_MS) {
    fetchDeviceConfig();
    lastConfigAt = now;
  }

  if (now - lastRelaySyncAt >= RELAY_SYNC_INTERVAL_MS) {
    syncRelayStateFromBackend();
    lastRelaySyncAt = now;
  }
}
