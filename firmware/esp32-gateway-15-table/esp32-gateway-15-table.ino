#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_MCP23X17.h>
#include "mbedtls/md.h"
#include <time.h>
#include <Preferences.h>

/**
 * FIXED:
 * 1) BLINK_3X diabaikan -> relay tidak kedip, langsung ON/OFF.
 * 2) Auto-resume -> state relay disimpan ke NVS (Preferences) dan di-restore saat boot.
 * 3) Proteksi konflik pin: kalau BUTTON_GPIO_PINS memakai pin yang sama dengan RELAY_GPIO_PINS,
 *    maka tombol channel itu di-skip (agar tidak mengubah pin relay jadi INPUT_PULLUP).
 */

// =========================
// WiFi + API configuration
// =========================
static const char* WIFI_SSID = "RGI";
static const char* WIFI_PASS = "rgijayajayajaya";

static const char* API_BASE     = "http://192.168.1.8:3001/api/v1";
static const char* DEVICE_ID    = "cmm36u339000khdjuzl3vi12t";
static const char* DEVICE_TOKEN = "iot-58870926cd126c4792546875023d8471";
static const char* HMAC_SECRET  = "billiard";

// =========================
// Timing
// =========================
static const uint32_t HEARTBEAT_INTERVAL_MS = 30000;
static const uint32_t PULL_INTERVAL_MS = 700;
static const uint32_t BUTTON_SCAN_INTERVAL_MS = 20;
static const uint32_t CONFIG_REFRESH_INTERVAL_MS = 60000;

// =========================
// Hardware config
// =========================
static const uint8_t MCP_ADDR = 0x20;

// true: tombol dari MCP23017 (REKOMENDASI), false: tombol dari GPIO (raw/testing)
static const bool USE_MCP23X17_BUTTONS = false;

// ⚠️ WARNING: di mode GPIO button, pastikan pin tombol tidak konflik dengan pin relay.
static const int BUTTON_GPIO_PINS[16] = {
  34, 35, 32, 33, 25,
  26, 27, 14, 12, 13,
  23, 22, 21, 19, 18,
  5
};

// Relay board biasanya active LOW
static const bool RELAY_ACTIVE_LOW = true;

// Relay channel 0..15 -> GPIO output ESP32
static const int RELAY_GPIO_PINS[16] = {
  23, 19, 18, 27,
  26, 25, 33, 32,
  14, 13, 12, 5,
  17, 16, 4, 15
};

// MCP button pins 0..15
static const uint8_t MCP_BTN_PINS[16] = {
  0, 1, 2, 3, 4, 5, 6, 7,
  8, 9, 10, 11, 12, 13, 14, 15
};

// =========================
// Auto Resume (NVS)
// =========================
Preferences prefs;
static const char* NVS_NS = "billiard";
uint16_t relayBitmap = 0;          // bit0=CH0 ... bit15=CH15
bool channelState[16] = {false};   // mirror runtime

void nvsBegin() {
  prefs.begin(NVS_NS, false);
  relayBitmap = prefs.getUShort("relayBm", 0);
  Serial.printf("[NVS] relayBm=0x%04X\n", relayBitmap);
}

void nvsSaveBitmap() {
  prefs.putUShort("relayBm", relayBitmap);
}

void applyBitmapToRelays() {
  Serial.println("[BOOT] Restoring relay state from NVS...");
  for (int ch = 0; ch < 16; ch++) {
    bool on = ((relayBitmap >> ch) & 1) != 0;
    channelState[ch] = on;

    int gpio = RELAY_GPIO_PINS[ch];
    pinMode(gpio, OUTPUT);

    uint8_t level = RELAY_ACTIVE_LOW ? (on ? LOW : HIGH) : (on ? HIGH : LOW);
    // pulse OFF dulu untuk “lepas” kondisi aneh pada relay board
    digitalWrite(gpio, RELAY_ACTIVE_LOW ? HIGH : LOW);
    delay(2);
    digitalWrite(gpio, level);

    Serial.printf("  CH%d(GPIO%d) -> %s\n", ch, gpio, on ? "ON" : "OFF");
  }
}

// =========================
// Dynamic table config
// =========================
struct TableConfig {
  String tableId;
  String tableName;
  uint8_t relayChannel;   // 0..15
  uint8_t gpioPin;        // metadata dari backend
  uint8_t buttonChannel;  // 0..15 (MCP pin atau index BUTTON_GPIO_PINS)
};

TableConfig TABLES[16];
uint8_t TABLE_COUNT = 0;

Adafruit_MCP23X17 mcp;

// debounce tombol
bool btnStable[16];
bool btnLastRead[16];
uint32_t btnLastChangeMs[16];

uint32_t lastHeartbeatAt = 0;
uint32_t lastPullAt = 0;
uint32_t lastButtonScanAt = 0;
uint32_t lastConfigRefreshAt = 0;

// =========================
// Helpers: detect pin conflict
// =========================
bool isRelayPin(int gpio) {
  for (int i = 0; i < 16; i++) {
    if (RELAY_GPIO_PINS[i] == gpio) return true;
  }
  return false;
}

// =========================
// HTTP/API helper
// =========================
struct ApiResponse {
  int statusCode;
  String body;
  bool ok;
};

ApiResponse apiRequest(const String& method,
                       const String& url,
                       const String& body,
                       const String& signature,
                       const String& timestamp,
                       const String& nonce,
                       bool includeDeviceIdHeader = false) {
  ApiResponse out{0, "", false};

  HTTPClient http;

  if (url.startsWith("https://")) {
    WiFiClientSecure client;
    client.setInsecure();
    http.begin(client, url);
  } else {
    WiFiClient client;
    http.begin(client, url);
  }

  if (body.length() > 0) http.addHeader("Content-Type", "application/json");
  if (includeDeviceIdHeader) http.addHeader("x-device-id", DEVICE_ID);

  http.addHeader("x-device-token", DEVICE_TOKEN);
  http.addHeader("x-timestamp", timestamp);
  http.addHeader("x-nonce", nonce);
  http.addHeader("x-signature", signature);

  int code = 0;
  if (method == "POST") code = http.POST(body);
  else if (method == "GET") code = http.GET();
  else code = -1;

  out.statusCode = code;
  out.body = http.getString();
  out.ok = (code >= 200 && code < 300);
  http.end();
  return out;
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

bool ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;

  WiFi.disconnect(true, true);
  delay(200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) delay(300);
  return WiFi.status() == WL_CONNECTED;
}

void syncNtpTime() {
  configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  uint32_t start = millis();
  while (time(nullptr) < 100000 && millis() - start < 15000) delay(200);
}

// =========================
// Relay output + SAVE STATE
// =========================
void initEspRelayOutputs() {
  for (int ch = 0; ch < 16; ch++) {
    int gpio = RELAY_GPIO_PINS[ch];
    pinMode(gpio, OUTPUT);
    digitalWrite(gpio, RELAY_ACTIVE_LOW ? HIGH : LOW); // OFF sementara
  }
  Serial.println("[Relay] output pins ready");
}

void setRelayChannel(uint8_t channel, bool on) {
  if (channel > 15) return;

  int gpio = RELAY_GPIO_PINS[channel];
  uint8_t level = RELAY_ACTIVE_LOW ? (on ? LOW : HIGH) : (on ? HIGH : LOW);

  pinMode(gpio, OUTPUT);
  digitalWrite(gpio, level);

  channelState[channel] = on;

  if (on) relayBitmap |= (1 << channel);
  else    relayBitmap &= ~(1 << channel);
  nvsSaveBitmap();

  Serial.printf("[Relay] CH=%d gpio=%d <= %s | bm=0x%04X\n",
                channel, gpio, on ? "ON" : "OFF", relayBitmap);
}

// =========================
// Config fetch (tables)
// =========================
void printMappingTable() {
  Serial.println("=== Table Mapping (from config) ===");
  for (int i = 0; i < TABLE_COUNT; i++) {
    uint8_t ch = TABLES[i].relayChannel;
    Serial.printf("idx=%d | id=%s | name=%s | relayCH=%d | relayGPIO=%d | button=%d\n",
      i + 1,
      TABLES[i].tableId.c_str(),
      TABLES[i].tableName.c_str(),
      ch,
      (ch <= 15) ? RELAY_GPIO_PINS[ch] : -1,
      TABLES[i].buttonChannel
    );
  }
  Serial.println("==================================");
}

bool fetchDeviceConfig() {
  if (!ensureWifi()) return false;

  String ts = nowTs();
  String nonce = genNonce();
  String message = String(DEVICE_ID) + ":" + ts + ":" + nonce + ":";
  String sig = hmacSha256(message, HMAC_SECRET);

  String url = String(API_BASE) + "/iot/devices/config?deviceId=" + String(DEVICE_ID);
  ApiResponse res = apiRequest("GET", url, "", sig, ts, nonce, false);

  if (!res.ok) {
    Serial.printf("[Config] code=%d err=%s\n", res.statusCode, res.body.c_str());
    return false;
  }

  StaticJsonDocument<8192> root;
  if (deserializeJson(root, res.body)) {
    Serial.println("[Config] JSON parse error");
    return false;
  }

  JsonArray tables = root["tables"].as<JsonArray>();
  if (tables.isNull()) {
    Serial.println("[Config] tables null");
    TABLE_COUNT = 0;
    return false;
  }

  struct TempTable { String id; String name; int relay; } temp[16];
  int count = 0;
  for (JsonObject t : tables) {
    if (count >= 16) break;
    temp[count].id    = String((const char*)t["id"]);
    temp[count].name  = String((const char*)t["name"]);
    temp[count].relay = t["relayChannel"] | -1;
    count++;
  }

  // sort by relayChannel
  for (int i = 0; i < count - 1; i++) {
    for (int j = i + 1; j < count; j++) {
      if (temp[i].relay > temp[j].relay) { TempTable x = temp[i]; temp[i] = temp[j]; temp[j] = x; }
    }
  }

  TABLE_COUNT = 0;
  for (int i = 0; i < count; i++) {
    if (temp[i].relay < 0 || temp[i].relay > 15) continue;

    TABLES[TABLE_COUNT].tableId      = temp[i].id;
    TABLES[TABLE_COUNT].tableName    = temp[i].name;
    TABLES[TABLE_COUNT].relayChannel = (uint8_t)temp[i].relay;

    // tombol 1:1 mengikuti relayChannel
    TABLES[TABLE_COUNT].buttonChannel = MCP_BTN_PINS[TABLES[TABLE_COUNT].relayChannel];
    TABLE_COUNT++;
  }

  Serial.printf("[Config] loaded tables=%d\n", TABLE_COUNT);
  printMappingTable();
  return true;
}

// =========================
// Buttons
// =========================
void initButtonsInput() {
  if (USE_MCP23X17_BUTTONS) {
    Wire.begin(21, 22);
    if (!mcp.begin_I2C(MCP_ADDR, &Wire)) {
      Serial.println("[MCP] init gagal, cek wiring/address!");
      while (true) delay(1000);
    }
    for (int ch = 0; ch < 16; ch++) {
      mcp.pinMode(MCP_BTN_PINS[ch], INPUT_PULLUP);
      bool r = mcp.digitalRead(MCP_BTN_PINS[ch]);
      btnStable[ch] = r;
      btnLastRead[ch] = r;
      btnLastChangeMs[ch] = millis();
    }
    Serial.println("[Button] MCP mode OK");
  } else {
    for (int ch = 0; ch < 16; ch++) {
      int gpioBtn = BUTTON_GPIO_PINS[ch];

      // PROTEKSI: jangan ubah pin relay jadi INPUT
      if (isRelayPin(gpioBtn)) {
        Serial.printf("[WARN] Button CH%d uses GPIO%d (relay pin). SKIP to avoid conflict.\n", ch, gpioBtn);
        continue;
      }

      pinMode(gpioBtn, INPUT_PULLUP);
      bool r = digitalRead(gpioBtn);
      btnStable[ch] = r;
      btnLastRead[ch] = r;
      btnLastChangeMs[ch] = millis();
    }
    Serial.println("[Button] GPIO mode (with conflict-skip)");
  }
}

void scanButtons() {
  uint32_t now = millis();
  if (now - lastButtonScanAt < BUTTON_SCAN_INTERVAL_MS) return;
  lastButtonScanAt = now;

  for (int ch = 0; ch < 16; ch++) {
    bool current;

    if (USE_MCP23X17_BUTTONS) {
      current = mcp.digitalRead(MCP_BTN_PINS[ch]);
    } else {
      int gpioBtn = BUTTON_GPIO_PINS[ch];
      if (isRelayPin(gpioBtn)) continue; // skip conflicting button pin
      current = digitalRead(gpioBtn);
    }

    if (current != btnLastRead[ch]) {
      btnLastRead[ch] = current;
      btnLastChangeMs[ch] = now;
    }

    if ((now - btnLastChangeMs[ch]) > 40 && btnStable[ch] != btnLastRead[ch]) {
      bool oldStable = btnStable[ch];
      btnStable[ch] = btnLastRead[ch];

      if (oldStable == HIGH && btnStable[ch] == LOW) {
        setRelayChannel((uint8_t)ch, !channelState[ch]);
        Serial.printf("[Button] CH%d -> %s\n", ch, channelState[ch] ? "ON" : "OFF");
      }
    }
  }
}

// =========================
// API calls
// =========================
bool sendHeartbeat() {
  if (!ensureWifi()) return false;

  String url = String(API_BASE) + "/iot/devices/heartbeat";
  String body = "{\"signalStrength\":-55}";

  String ts = nowTs();
  String nonce = genNonce();
  String msg = String(DEVICE_ID) + ":" + ts + ":" + nonce + ":";
  String sig = hmacSha256(msg, HMAC_SECRET);

  ApiResponse res = apiRequest("POST", url, body, sig, ts, nonce, true);
  Serial.printf("[Heartbeat] code=%d\n", res.statusCode);
  return res.ok;
}

bool sendAck(const String& commandId, bool success) {
  if (!ensureWifi()) return false;

  StaticJsonDocument<128> doc;
  doc["commandId"] = commandId;
  doc["success"] = success;

  String body;
  serializeJson(doc, body);

  String ts = nowTs();
  String nonce = genNonce();
  String msg = String(DEVICE_ID) + ":" + ts + ":" + nonce + ":" + body;
  String sig = hmacSha256(msg, HMAC_SECRET);

  String url = String(API_BASE) + "/iot/commands/ack";
  ApiResponse res = apiRequest("POST", url, body, sig, ts, nonce, true);
  Serial.printf("[ACK] code=%d success=%d\n", res.statusCode, success ? 1 : 0);
  return res.ok;
}

void pullAndExecuteCommand() {
  if (!ensureWifi()) return;

  String ts = nowTs();
  String nonce = genNonce();
  String msg = String(DEVICE_ID) + ":" + ts + ":" + nonce + ":";
  String sig = hmacSha256(msg, HMAC_SECRET);

  String url = String(API_BASE) + "/iot/commands/pull?deviceId=" + String(DEVICE_ID);
  ApiResponse res = apiRequest("GET", url, "", sig, ts, nonce, false);

  if (!res.ok) {
    Serial.printf("[Pull] code=%d err=%s\n", res.statusCode, res.body.c_str());
    return;
  }

  StaticJsonDocument<1024> root;
  if (deserializeJson(root, res.body)) {
    Serial.println("[Pull] JSON parse error");
    return;
  }

  JsonVariant cmd = root["command"];
  if (cmd.isNull()) return;

  String commandId = cmd["id"] | "";
  String type = cmd["type"] | "";
  int relayCh = cmd["payload"]["relayChannel"] | -1;

  bool success = false;

  if (relayCh >= 0 && relayCh <= 15) {
    if (type == "LIGHT_ON") {
      setRelayChannel((uint8_t)relayCh, true);
      success = true;
    } else if (type == "LIGHT_OFF") {
      // LANGSUNG OFF, tanpa kedip
      setRelayChannel((uint8_t)relayCh, false);
      success = true;
    } else if (type == "BLINK_3X") {
      // DIABAIKAN supaya tidak kedip sebelum OFF
      Serial.println("[CMD] BLINK_3X ignored");
      success = true;
    }
  }

  if (commandId.length() > 0) sendAck(commandId, success);
}

// =========================
// Setup & loop
// =========================
void setup() {
  Serial.begin(115200);
  delay(800);

  // 1) load NVS state
  nvsBegin();

  // 2) init relay pins (OFF sementara)
  initEspRelayOutputs();

  // 3) tunggu power relay stabil + restore (mengurangi kasus “baru bisa setelah reset”)
  delay(500);
  applyBitmapToRelays();
  delay(80);
  applyBitmapToRelays(); // apply ulang sekali

  // 4) wifi + time
  WiFi.mode(WIFI_STA);
  ensureWifi();
  syncNtpTime();

  // 5) config (tidak reset state relay)
  fetchDeviceConfig();

  // 6) buttons
  initButtonsInput();

  // 7) heartbeat
  sendHeartbeat();

  lastHeartbeatAt = millis();
  lastPullAt = millis();
  lastConfigRefreshAt = millis();

  Serial.println("[System] Ready");
}

void loop() {
  scanButtons();

  uint32_t now = millis();

  if (now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
    sendHeartbeat();
    lastHeartbeatAt = now;
  }

  if (now - lastPullAt >= PULL_INTERVAL_MS) {
    pullAndExecuteCommand();
    lastPullAt = now;
  }

  if (now - lastConfigRefreshAt >= CONFIG_REFRESH_INTERVAL_MS) {
    fetchDeviceConfig();
    lastConfigRefreshAt = now;
  }
}
