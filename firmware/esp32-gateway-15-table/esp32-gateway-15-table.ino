#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_MCP23X17.h>
#include "mbedtls/md.h"
#include <time.h>

/**
 * ESP32 Gateway 15 Meja
 * - 1 ESP32 menerima command dari API backend (/iot/commands/pull)
 * - Relay dikontrol LANGSUNG dari GPIO ESP32
 * - Push button dibaca via MCP23X17 (I2C input expander)
 * - Command server membawa payload.tableId (dan bisa relayChannel/gpioPin)
 */

// =========================
// WiFi + API configuration
// =========================
static const char* WIFI_SSID = "YOUR_WIFI";
static const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

static const char* API_BASE = "http://192.168.1.10:3001/api/v1"; // ganti sesuai IP server API
static const char* DEVICE_ID = "YOUR_IOT_DEVICE_ID";
static const char* DEVICE_TOKEN = "YOUR_RAW_DEVICE_TOKEN";
static const char* HMAC_SECRET = "YOUR_IOT_HMAC_SECRET";

// =========================
// Timing
// =========================
static const uint32_t HEARTBEAT_INTERVAL_MS = 30000;
static const uint32_t PULL_INTERVAL_MS = 5000;
static const uint32_t BUTTON_SCAN_INTERVAL_MS = 20;

// =========================
// Hardware config
// =========================
// MCP23X17 I2C address (A0/A1/A2 all GND -> 0x20)
static const uint8_t MCP_ADDR = 0x20;

// true: tombol dibaca dari MCP23X17, false: tombol langsung dari GPIO ESP32 (mode testing cepat)
static const bool USE_MCP23X17_BUTTONS = false;

// Jika USE_MCP23X17_BUTTONS=false, urutan tombol 0..15 dibaca dari GPIO berikut
static const int BUTTON_GPIO_PINS[16] = {
  34, 35, 32, 33, 25,
  26, 27, 14, 12, 13,
  23, 22, 21, 19, 18,
  5
};

// Relay active level (kebanyakan board relay: active LOW)
static const bool RELAY_ACTIVE_LOW = true;

// Urutan relay channel 0..15 -> GPIO output ESP32 (ubah sesuai wiring Anda)
static const int RELAY_GPIO_PINS[16] = {
  13, 14, 27, 26, 25,
  33, 32, 23, 22, 21,
  19, 18, 17, 16, 4,
  5
};

// =========================
// Mapping meja -> relay channel ESP + button input channel
// =========================
struct TableConfig {
  const char* tableId;
  uint8_t relayChannel;   // 0..15 (index ke RELAY_GPIO_PINS)
  uint8_t buttonChannel;  // 0..15 (pin MCP atau index BUTTON_GPIO_PINS)
};

// ID tabel dari phpMyAdmin user (saat ini 10 meja)
TableConfig TABLES[] = {
  {"cmlzdgfo60003kqbmjflzka01", 0, 0},  // Meja 1
  {"cmlzdgfoa0004kqbmdf5pfuuf", 1, 1},  // Meja 2
  {"cmlzdgfoc0005kqbmf004hwk9", 2, 2},  // Meja 3
  {"cmlzdgfof0006kqbm5ffnxs0", 3, 3},   // Meja 4
  {"cmlzdgfoh0007kqbmxtikli5j", 4, 4},  // Meja 5
  {"cmlzdgfoj0008kqbmu91qjuz", 5, 5},   // Meja 6
  {"cmlzdgfom0009kqbmtvck1i8g", 6, 6},  // Meja 7
  {"cmlzdgfoo000akqbm9cmkk8x1", 7, 7},  // Meja 8
  {"cmlzdgfoq000bkqbmzxb5d33f", 8, 8},  // Meja 9
  {"cmlzdgfos000ckqbm7xn5lpt9", 9, 9},  // Meja 10
};

static const uint8_t TABLE_COUNT = sizeof(TABLES) / sizeof(TABLES[0]);

Adafruit_MCP23X17 mcp;

// State lamp per meja (true = ON)
bool lampState[16] = {false};

// Debounce state button
bool btnStable[16];
bool btnLastRead[16];
uint32_t btnLastChangeMs[16];

uint32_t lastHeartbeatAt = 0;
uint32_t lastPullAt = 0;
uint32_t lastButtonScanAt = 0;

struct ApiResponse {
  int statusCode;
  String body;
  bool ok;
};

ApiResponse apiRequest(const String& method,
                       const String& path,
                       const String& body,
                       const String& signature,
                       const String& timestamp,
                       const String& nonce,
                       bool includeDeviceIdHeader = false) {
  ApiResponse out{0, "", false};

  HTTPClient http;

  if (path.startsWith("https://")) {
    WiFiClientSecure client;
    client.setInsecure();
    http.begin(client, path);
  } else {
    WiFiClient client;
    http.begin(client, path);
  }

  if (body.length() > 0) http.addHeader("Content-Type", "application/json");
  if (includeDeviceIdHeader) http.addHeader("x-device-id", DEVICE_ID);
  http.addHeader("x-device-token", DEVICE_TOKEN);
  http.addHeader("x-timestamp", timestamp);
  http.addHeader("x-nonce", nonce);
  http.addHeader("x-signature", signature);

  int code = 0;
  if (method == "POST") {
    code = http.POST(body);
  } else if (method == "GET") {
    code = http.GET();
  } else {
    code = -1;
  }

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
  for (int i = 0; i < 32; i++) {
    sprintf(out + (i * 2), "%02x", hmac[i]);
  }
  out[64] = '\0';
  return String(out);
}

String nowTs() {
  return String((long)time(nullptr));
}

int findTableIndexById(const String& tableId) {
  for (int i = 0; i < TABLE_COUNT; i++) {
    if (tableId.equals(TABLES[i].tableId)) return i;
  }
  return -1;
}

void setRelayChannel(uint8_t channel, bool on) {
  if (channel > 15) return;

  const int gpio = RELAY_GPIO_PINS[channel];
  if (gpio < 0) return;

  bool outLevel;
  if (RELAY_ACTIVE_LOW) {
    outLevel = !on; // ON => LOW
  } else {
    outLevel = on;  // ON => HIGH
  }

  digitalWrite(gpio, outLevel ? HIGH : LOW);
}

void setLampByTableIndex(int idx, bool on) {
  if (idx < 0 || idx >= TABLE_COUNT) return;
  lampState[idx] = on;
  setRelayChannel(TABLES[idx].relayChannel, on);
}

void blinkTable(int idx, uint8_t times, uint16_t intervalMs) {
  if (idx < 0 || idx >= TABLE_COUNT) return;

  bool original = lampState[idx];
  for (uint8_t i = 0; i < times; i++) {
    setRelayChannel(TABLES[idx].relayChannel, true);
    delay(intervalMs);
    setRelayChannel(TABLES[idx].relayChannel, false);
    delay(intervalMs);
  }
  setRelayChannel(TABLES[idx].relayChannel, original);
}

bool ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;

  WiFi.disconnect(true, true);
  delay(200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(300);
  }

  return WiFi.status() == WL_CONNECTED;
}

void syncNtpTime() {
  configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  uint32_t start = millis();
  while (time(nullptr) < 100000 && millis() - start < 15000) {
    delay(200);
  }
}

void printMappingTable() {
  Serial.println("=== Relay(GPIO ESP32) / Button Input -> Table ID Mapping ===");
  for (int i = 0; i < TABLE_COUNT; i++) {
    const uint8_t relayCh = TABLES[i].relayChannel;
    const uint8_t btnCh = TABLES[i].buttonChannel;
    const int relayGpio = (relayCh <= 15) ? RELAY_GPIO_PINS[relayCh] : -1;
    Serial.printf("MejaIndex=%d | tableId=%s | relayCH=%d | relayGPIO=%d | buttonInput=%d\n", i + 1, TABLES[i].tableId, relayCh, relayGpio, btnCh);
  }
  Serial.println("=================================================================");
}

// =========================
// API calls
// =========================
bool sendHeartbeat() {
  if (!ensureWifi()) return false;

  String path = String(API_BASE) + "/iot/devices/heartbeat";
  String body = "{\"signalStrength\":-55}";

  String ts = nowTs();
  String nonce = genNonce();
  String message = String(DEVICE_ID) + ":" + ts + ":" + nonce + ":";
  String sig = hmacSha256(message, HMAC_SECRET);

  ApiResponse res = apiRequest("POST", path, body, sig, ts, nonce, true);
  Serial.printf("[Heartbeat] code=%d resp=%s\n", res.statusCode, res.body.c_str());
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
  String message = String(DEVICE_ID) + ":" + ts + ":" + nonce + ":" + body;
  String sig = hmacSha256(message, HMAC_SECRET);

  String path = String(API_BASE) + "/iot/commands/ack";

  ApiResponse res = apiRequest("POST", path, body, sig, ts, nonce, true);
  Serial.printf("[ACK] cmd=%s success=%d code=%d resp=%s\n", commandId.c_str(), success, res.statusCode, res.body.c_str());
  return res.ok;
}

void pullAndExecuteCommand() {
  if (!ensureWifi()) return;

  String ts = nowTs();
  String nonce = genNonce();
  String message = String(DEVICE_ID) + ":" + ts + ":" + nonce + ":";
  String sig = hmacSha256(message, HMAC_SECRET);

  String path = String(API_BASE) + "/iot/commands/pull?deviceId=" + DEVICE_ID;

  ApiResponse res = apiRequest("GET", path, "", sig, ts, nonce, false);
  if (!res.ok) {
    Serial.printf("[Pull] code=%d err=%s\n", res.statusCode, res.body.c_str());
    return;
  }

  String resp = res.body;
  Serial.printf("[Pull] resp=%s\n", resp.c_str());

  StaticJsonDocument<1024> root;
  DeserializationError de = deserializeJson(root, resp);
  if (de) {
    Serial.printf("[Pull] JSON parse error: %s\n", de.c_str());
    return;
  }

  JsonVariant cmd = root["command"];
  if (cmd.isNull()) return;

  String commandId = cmd["id"] | "";
  String type = cmd["type"] | "";

  // Prioritas routing:
  // 1) payload.relayChannel dari backend owner setting
  // 2) payload.tableId -> lookup TABLES[]
  int relayChannelFromPayload = cmd["payload"]["relayChannel"] | -1;
  String tableId = cmd["payload"]["tableId"] | "";

  bool success = false;

  if (relayChannelFromPayload >= 0 && relayChannelFromPayload <= 15) {
    if (type == "LIGHT_ON") {
      setRelayChannel((uint8_t)relayChannelFromPayload, true);
      success = true;
    } else if (type == "LIGHT_OFF") {
      setRelayChannel((uint8_t)relayChannelFromPayload, false);
      success = true;
    } else if (type == "BLINK_3X") {
      for (int i = 0; i < 3; i++) {
        setRelayChannel((uint8_t)relayChannelFromPayload, true); delay(200);
        setRelayChannel((uint8_t)relayChannelFromPayload, false); delay(200);
      }
      success = true;
    }
  } else {
    int idx = findTableIndexById(tableId);
    if (idx == -1) {
      Serial.printf("[Exec] tableId tidak terdaftar: %s\n", tableId.c_str());
      success = false;
    } else {
      if (type == "LIGHT_ON") {
        setLampByTableIndex(idx, true);
        success = true;
      } else if (type == "LIGHT_OFF") {
        setLampByTableIndex(idx, false);
        success = true;
      } else if (type == "BLINK_3X") {
        blinkTable(idx, 3, 200);
        success = true;
      } else {
        Serial.printf("[Exec] unknown command type: %s\n", type.c_str());
        success = false;
      }
    }
  }

  if (commandId.length() > 0) {
    sendAck(commandId, success);
  }
}

// =========================
// Button handling (MCP23X17 or ESP32 GPIO)
// =========================
void initButtonsInput() {
  if (USE_MCP23X17_BUTTONS) {
    Wire.begin();
    if (!mcp.begin_I2C(MCP_ADDR, &Wire)) {
      Serial.println("[MCP] init gagal, cek wiring/address!");
      while (true) delay(1000);
    }

    for (int i = 0; i < TABLE_COUNT; i++) {
      const uint8_t btnCh = TABLES[i].buttonChannel;
      mcp.pinMode(btnCh, INPUT_PULLUP);

      bool r = mcp.digitalRead(btnCh);
      btnStable[i] = r;
      btnLastRead[i] = r;
      btnLastChangeMs[i] = millis();
    }

    Serial.println("[Button] mode MCP23X17 aktif");
  } else {
    for (int i = 0; i < TABLE_COUNT; i++) {
      const uint8_t btnIdx = TABLES[i].buttonChannel;
      const int gpio = BUTTON_GPIO_PINS[btnIdx];
      pinMode(gpio, INPUT_PULLUP);

      bool r = digitalRead(gpio);
      btnStable[i] = r;
      btnLastRead[i] = r;
      btnLastChangeMs[i] = millis();
    }

    Serial.println("[Button] mode GPIO ESP32 aktif (testing)");
  }
}

void scanButtons() {
  uint32_t now = millis();
  if (now - lastButtonScanAt < BUTTON_SCAN_INTERVAL_MS) return;
  lastButtonScanAt = now;

  for (int i = 0; i < TABLE_COUNT; i++) {
    const uint8_t btnCh = TABLES[i].buttonChannel;
    bool current = USE_MCP23X17_BUTTONS
      ? mcp.digitalRead(btnCh)
      : digitalRead(BUTTON_GPIO_PINS[btnCh]);

    if (current != btnLastRead[i]) {
      btnLastRead[i] = current;
      btnLastChangeMs[i] = now;
    }

    // debounce 40ms
    if ((now - btnLastChangeMs[i]) > 40 && btnStable[i] != btnLastRead[i]) {
      bool oldStable = btnStable[i];
      btnStable[i] = btnLastRead[i];

      // tombol ditekan: HIGH -> LOW (karena pull-up)
      if (oldStable == HIGH && btnStable[i] == LOW) {
        lampState[i] = !lampState[i];
        setRelayChannel(TABLES[i].relayChannel, lampState[i]);
        Serial.printf("[Button] table=%s toggled -> %s\n", TABLES[i].tableId, lampState[i] ? "ON" : "OFF");
      }
    }
  }
}

// =========================
// Relay output (ESP32 GPIO)
// =========================
void initEspRelayOutputs() {
  for (int ch = 0; ch < 16; ch++) {
    const int gpio = RELAY_GPIO_PINS[ch];
    pinMode(gpio, OUTPUT);

    // default OFF
    if (RELAY_ACTIVE_LOW) {
      digitalWrite(gpio, HIGH);
    } else {
      digitalWrite(gpio, LOW);
    }
  }

  Serial.println("[ESP32 GPIO] relay output siap");
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  initEspRelayOutputs();
  initButtonsInput();

  WiFi.mode(WIFI_STA);
  ensureWifi();
  syncNtpTime();

  printMappingTable();

  // heartbeat awal
  sendHeartbeat();
  lastHeartbeatAt = millis();
  lastPullAt = millis();

  Serial.printf("[System] ESP32 gateway ready, table_count=%d\n", TABLE_COUNT);
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
}
