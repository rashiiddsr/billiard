# Billiard POS — Billing + Cafe + IoT System

A production-ready POS system for billiard halls with:
- **Server-side billing timer** (survives browser refresh)
- **IoT light control** via HTTP polling with HMAC auth
- **F&B POS** with stock management
- **RBAC** (OWNER / MANAGER / CASHIER)
- **Finance reporting** & audit logs

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| Backend | NestJS + TypeScript |
| Database | MySQL + Prisma ORM |
| Auth | JWT (access 15m + refresh 7d) + RBAC |
| IoT | HTTP polling + HMAC-SHA256 signature |

---

## Monorepo Structure

```
billiard-pos/
├── apps/
│   ├── api/          # NestJS backend
│   │   ├── src/
│   │   │   ├── auth/         # JWT auth + re-auth
│   │   │   ├── billing/      # Billing sessions + server timer
│   │   │   ├── iot/          # IoT device polling endpoints
│   │   │   ├── menu/         # F&B menu management
│   │   │   ├── orders/       # Order creation
│   │   │   ├── payments/     # Checkout + receipts
│   │   │   ├── finance/      # Reports + expenses
│   │   │   ├── stock/        # F&B stock + operational assets
│   │   │   ├── audit/        # Audit log viewer
│   │   │   ├── users/        # User CRUD
│   │   │   └── tables/       # Billiard tables
│   │   └── prisma/
│   │       ├── schema.prisma
│   │       └── seed.ts
│   └── web/          # Next.js frontend
│       └── src/
│           ├── app/
│           │   ├── login/
│           │   ├── cashier/   # Dashboard, billing, orders, checkout
│           │   ├── owner/     # Dashboard, finance, users, audit
│           │   └── manager/   # Dashboard, menu, stock, expenses
│           ├── components/
│           └── lib/           # API client, auth context, utils
└── docker-compose.yml
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- MySQL 8+ (or use Docker)
- npm / yarn

### 1. Clone & Install

```bash
git clone <repo>
cd billiard-pos

# Install all dependencies
cd apps/api && npm install
cd ../web && npm install
```

### 2. Start MySQL

```bash
docker compose up -d mysql
```

### 3. Configure Environment

```bash
# API
cd apps/api
cp .env.example .env
# Edit .env with your DB credentials

# Web
cd ../web
cp .env.example .env.local
```

**apps/api/.env:**
```env
DATABASE_URL="mysql://root:password@localhost:3306/billiard_pos"
JWT_SECRET="change-this-in-production-32chars+"
JWT_REFRESH_SECRET="change-this-refresh-secret-32chars+"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
PORT=3001
CORS_ORIGIN="http://localhost:3000"
IOT_HMAC_SECRET="change-this-iot-secret"
IOT_NONCE_WINDOW_SECONDS=300
# Optional: enable single-ESP gateway mode (all tables routed to this device ID)
IOT_GATEWAY_DEVICE_ID=""
```

**apps/web/.env.local:**
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
# Optional: QZ Tray as primary desktop printing path
NEXT_PUBLIC_QZ_TRAY_ENABLED=true
NEXT_PUBLIC_QZ_PRINTER=POS-58
# Optional override (default already points to jsdelivr qz-tray js)
NEXT_PUBLIC_QZ_SCRIPT_URL=https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js
# Optional: desktop print bridge endpoint (fallback path)
NEXT_PUBLIC_PRINT_BRIDGE_URL=http://127.0.0.1:18181/print
```

### 4. Database Setup

```bash
cd apps/api

# Run migrations
npx prisma migrate dev --name init

# Seed initial data
npm run prisma:seed
```

Atau jika ingin import manual ke MySQL, gunakan backup schema di:

```bash
schema/schema.sql
```

### 5. Start Development Servers

```bash
# Terminal 1 - API (port 3001)
cd apps/api
npm run start:dev

# Terminal 2 - Web (port 3000)
cd apps/web
npm run dev
```

Open http://localhost:3000

---

### Desktop Receipt Printing (QZ Tray)

Untuk adopsi **QZ Tray print** di PC kasir:

1. Install dan jalankan QZ Tray di Windows PC kasir.
2. Set env web:
   - `NEXT_PUBLIC_QZ_TRAY_ENABLED=true`
   - `NEXT_PUBLIC_QZ_PRINTER=<nama printer thermal di Windows>`
3. Saat tombol **Tutup** di checkout atau **Cetak Ulang Struk** di transaksi ditekan, frontend akan mencoba urutan:
   - QZ Tray (silent desktop print)
   - Print Bridge HTTP (opsional)
   - Browser print fallback (iframe)

#### Env yang wajib diisi untuk mode hosting (recommended)

Karena aplikasi web di-hosting, **private key jangan taruh di frontend**. Simpan di API.

1) Generate default certificate + private key (sekali saja):

```bash
cd apps/api
npm run qz:generate-cert
```

Perintah di atas akan men-generate pair dan langsung menampilkan format isi `.env` (cross-platform, tidak butuh bash). Jika OpenSSL tidak ada, script otomatis pakai default demo certificate supaya tetap langsung jalan.

2) Isi API env: (frontend cukup pakai API URL + printer)

**apps/api/.env (contoh production):**
```env
DATABASE_URL="mysql://user:password@127.0.0.1:3306/billiard_pos"
JWT_SECRET="ganti-dengan-random-32-char-lebih"
JWT_REFRESH_SECRET="ganti-dengan-random-32-char-lebih"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
PORT=3001
CORS_ORIGIN="https://pos.domainanda.com"
IOT_HMAC_SECRET="ganti-dengan-secret-iot"
IOT_NONCE_WINDOW_SECONDS=300

# QZ signing (WAJIB untuk hilangkan mode untrusted/anonymous)
QZ_CERTIFICATE="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
QZ_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
QZ_SIGN_API_KEY="isi-api-key-random-panjang"
```

**apps/web/.env.local (contoh production):**
```env
# WAJIB
NEXT_PUBLIC_API_URL=https://api.domainanda.com/api/v1
NEXT_PUBLIC_QZ_TRAY_ENABLED=true
NEXT_PUBLIC_QZ_PRINTER=POS-58-MM

# Opsional
NEXT_PUBLIC_QZ_SCRIPT_URL=https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js
NEXT_PUBLIC_QZ_CERTIFICATE_ENDPOINT=https://api.domainanda.com/api/v1/print/qz/certificate
NEXT_PUBLIC_QZ_SIGN_ENDPOINT=https://api.domainanda.com/api/v1/print/qz/sign
NEXT_PUBLIC_QZ_SIGN_API_KEY=isi-api-key-random-panjang
```

**Kalau mau paling simpel, isi ini saja:**
```env
NEXT_PUBLIC_API_URL=https://api.domainanda.com/api/v1
NEXT_PUBLIC_QZ_TRAY_ENABLED=true
NEXT_PUBLIC_QZ_PRINTER=POS-58-MM
```

> Jika ingin paling simpel: Anda cukup kelola **env API** (`QZ_CERTIFICATE`, `QZ_PRIVATE_KEY`, `QZ_SIGN_API_KEY`).
> Di sisi web, minimum hanya `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_QZ_TRAY_ENABLED`, dan `NEXT_PUBLIC_QZ_PRINTER`.
> Tidak wajib install OpenSSL untuk mulai cepat (ada fallback default demo cert).

#### Checklist supaya tidak popup terus

- QZ Tray ter-install di **PC kasir lokal** (meski web di-hosting).
- User kasir sudah login (endpoint signing dilindungi JWT).
- `CORS_ORIGIN` API mengizinkan domain web produksi.
- `QZ_CERTIFICATE` + `QZ_PRIVATE_KEY` valid dan berpasangan.

## Default Login Credentials

| Role | Email | Password | PIN |
|------|-------|----------|-----|
| OWNER | bayu@billiard.com | bayu123 | 123456 |
| OWNER | apis@billiard.com | apis123 | 123456 |

---

## API Documentation

Swagger available at: http://localhost:3001/api/docs

### Key Endpoints

#### Auth
```
POST /api/v1/auth/login         # Login
POST /api/v1/auth/refresh       # Refresh tokens
POST /api/v1/auth/re-auth       # Owner re-auth (PIN/password)
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

#### Billing
```
POST   /api/v1/billing/sessions            # Create session (OWNER needs reAuthToken)
GET    /api/v1/billing/sessions/active     # All active sessions
GET    /api/v1/billing/sessions/:id        # Session detail
PATCH  /api/v1/billing/sessions/:id/extend
PATCH  /api/v1/billing/sessions/:id/stop
```

#### IoT Devices (HMAC authenticated)
```
POST /api/v1/iot/devices/heartbeat    # Device heartbeat
GET  /api/v1/iot/commands/pull?deviceId=...  # Poll for commands
POST /api/v1/iot/commands/ack         # Acknowledge command
```

#### Payments
```
POST  /api/v1/payments/checkout       # Create checkout
PATCH /api/v1/payments/:id/confirm    # Confirm payment (Uang Diterima)
PATCH /api/v1/payments/:id/print      # Mark as printed
GET   /api/v1/payments/:id/receipt    # Get receipt JSON
```

#### Finance
```
GET  /api/v1/finance/report           # Period report
GET  /api/v1/finance/report/daily     # Daily report
POST /api/v1/finance/expenses         # Create expense
GET  /api/v1/finance/expenses         # List expenses
```

---

## RBAC Permissions

| Feature | OWNER | MANAGER | CASHIER |
|---------|-------|---------|---------|
| Start billing | ✅ (re-auth required) | ❌ | ✅ |
| Extend/stop billing | ✅ | ❌ | ✅ |
| Create F&B orders | ✅ | ❌ | ✅ |
| Checkout & payments | ✅ | ❌ | ✅ |
| Menu management | ✅ | ✅ | View only |
| Stock F&B adjust | ✅ | ✅ | View only |
| Operational assets | ✅ | ✅ | ❌ |
| Finance reports | ✅ | ✅ (limited) | ❌ |
| Expenses | ✅ | ✅ | ❌ |
| User management | ✅ | ❌ | ❌ |
| Audit logs | ✅ | Read-only | ❌ |

---

## IoT Integration

Devices use HTTP polling with HMAC-SHA256 security:

### Device Flow
1. Device sends heartbeat every 30s
2. Device polls `GET /iot/commands/pull` every 5s
3. On receiving command, device executes and sends ACK

### Security Headers (all device requests)
```
x-device-id: <device_id>
x-device-token: <raw_token>
x-timestamp: <unix_timestamp>
x-nonce: <unique_uuid_per_request>
x-signature: hmac_sha256(device_id:timestamp:nonce:body, IOT_HMAC_SECRET)
```

### Commands
- `LIGHT_ON` — Turn on table lamp (session start)
- `BLINK_3X` — Blink 3 times (1 minute remaining warning)
- `LIGHT_OFF` — Turn off lamp (session end)

### Single ESP Gateway Mode (optional)
If you use one ESP to control relays for all tables, set `IOT_GATEWAY_DEVICE_ID` in API env.
When set, billing commands for any table are queued to this one device and include `payload.tableId` so ESP can route to the correct relay channel.


### Troubleshooting compile Arduino (ESP32)

Jika muncul error seperti:
- `ApiResponse does not name a type`
- `WiFiClientSecure was not declared in this scope`

Pastikan sketch sudah memuat 2 hal berikut:
1. `#include <WiFiClientSecure.h>`
2. deklarasi `struct ApiResponse` **sebelum** fungsi `apiRequest(...)`

Di sketch repo ini (`firmware/esp32-gateway-15-table/esp32-gateway-15-table.ino`) keduanya sudah disiapkan.

### Arduino IDE Preferences (Board Manager URLs)

Jika install board ESP32 gagal dari Arduino IDE, tambahkan URL berikut di:
`File -> Preferences -> Additional Boards Manager URLs`

```
https://espressif.github.io/arduino-esp32/package_esp32_index.json
```

Jika sudah ada URL lain, pisahkan dengan koma, contoh:

```
https://espressif.github.io/arduino-esp32/package_esp32_index.json,https://downloads.arduino.cc/packages/package_index.json
```

Setelah itu:
1. Buka `Tools -> Board -> Boards Manager`
2. Cari `esp32 by Espressif Systems`
3. Install versi yang stabil (mis. 3.3.7)

### Contoh koneksi ESP (Arduino) untuk 1 device kontrol banyak meja

Kode siap pakai untuk ESP32 + relay 16 channel + 15 push button tersedia di:
`firmware/esp32-gateway-15-table/esp32-gateway-15-table.ino`

### Cara mendapatkan `tableId` untuk firmware ESP

Nilai `TABLE_ID_1` s/d `TABLE_ID_15` di firmware harus diisi dengan `id` tabel dari backend (bukan nama meja).

Pilihan paling mudah:

1. **Dari API `GET /api/v1/tables`** (setelah login)
   - Endpoint mengembalikan data tabel, termasuk field `id` dan `name`.
   - Cocokkan `name` (mis. `Meja 1`) lalu salin nilai `id` ke mapping firmware.

2. **Dari database MySQL**

```sql
SELECT id, name FROM tables ORDER BY name ASC;
```

3. **Dari Prisma Studio**
   - Jalankan `cd apps/api && npm run prisma:studio`
   - Buka model `Table`, lalu copy kolom `id`.

Contoh mapping di firmware:

```cpp
TableConfig TABLES[15] = {
  {"cm8x...id_meja_1", 0, 0},
  {"cm8x...id_meja_2", 1, 1},
  // dst
};
```

Urutan pin relay ke ID meja (update: relay dari GPIO ESP32 langsung, push button dari MCP23X17):

| Meja | tableId | Relay Channel | GPIO Relay (ESP32) | Button MCP23X17 |
|---|---|---:|---:|---:|
| 1 | `cmlzdgfo60003kqbmjflzka01` | 0 | 13 | 0 |
| 2 | `cmlzdgfoa0004kqbmdf5pfuuf` | 1 | 14 | 1 |
| 3 | `cmlzdgfoc0005kqbmf004hwk9` | 2 | 27 | 2 |
| 4 | `cmlzdgfof0006kqbm5ffnxs0` | 3 | 26 | 3 |
| 5 | `cmlzdgfoh0007kqbmxtikli5j` | 4 | 25 | 4 |
| 6 | `cmlzdgfoj0008kqbmu91qjuz` | 5 | 33 | 5 |
| 7 | `cmlzdgfom0009kqbmtvck1i8g` | 6 | 32 | 6 |
| 8 | `cmlzdgfoo000akqbm9cmkk8x1` | 7 | 23 | 7 |
| 9 | `cmlzdgfoq000bkqbmzxb5d33f` | 8 | 22 | 8 |
| 10 | `cmlzdgfos000ckqbm7xn5lpt9` | 9 | 21 | 9 |

Catatan: channel relay 10-15 masih kosong/spare untuk meja tambahan berikutnya.

Catatan: relay output memakai GPIO ESP32 (`RELAY_GPIO_PINS`), sedangkan tombol manual membaca pin MCP23X17 (`buttonChannel`).

Di mode gateway, ESP melakukan 3 hal berulang:
1. Heartbeat (`POST /api/v1/iot/devices/heartbeat`)
2. Pull command (`GET /api/v1/iot/commands/pull?deviceId=...`)
3. ACK command setelah eksekusi (`POST /api/v1/iot/commands/ack`)

Contoh sketch Arduino (ESP32/ESP8266) sederhana:

```cpp
#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "mbedtls/md.h"

const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASS";
const char* API_BASE = "http://192.168.1.10:3001/api/v1";

// Dari seed / database
const char* DEVICE_ID = "cm...";
const char* DEVICE_TOKEN = "iot-device-1-secret-...";
const char* HMAC_SECRET = "change-this-iot-secret";

// Mapping meja ke relay pin (sesuaikan wiring)
struct RelayMap { const char* tableId; int pin; };
RelayMap relays[] = {
  {"table-id-1", 23},
  {"table-id-2", 22},
  {"table-id-3", 21},
};
const int relayCount = sizeof(relays) / sizeof(relays[0]);

String genNonce() {
  return String((uint32_t)esp_random(), HEX) + String((uint32_t)esp_random(), HEX);
}

String hmacSha256(const String& message, const char* secret) {
  byte hmac[32];
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
  out[64] = 0;
  return String(out);
}

int relayPinByTableId(const String& tableId) {
  for (int i = 0; i < relayCount; i++) {
    if (tableId == relays[i].tableId) return relays[i].pin;
  }
  return -1;
}

void heartbeat() {
  HTTPClient http;
  String path = String(API_BASE) + "/iot/devices/heartbeat";
  String body = "{\"signalStrength\":-50}";

  String ts = String((long)time(nullptr));
  String nonce = genNonce();
  String msg = String(DEVICE_ID) + ":" + ts + ":" + nonce + ":"; // body heartbeat tidak dipakai verify di backend
  String sig = hmacSha256(msg, HMAC_SECRET);

  http.begin(path);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-id", DEVICE_ID);
  http.addHeader("x-device-token", DEVICE_TOKEN);
  http.addHeader("x-timestamp", ts);
  http.addHeader("x-nonce", nonce);
  http.addHeader("x-signature", sig);
  http.POST(body);
  http.end();
}

bool ackCommand(const String& commandId, bool success) {
  HTTPClient http;
  String path = String(API_BASE) + "/iot/commands/ack";

  StaticJsonDocument<128> doc;
  doc["commandId"] = commandId;
  doc["success"] = success;
  String body;
  serializeJson(doc, body);

  String ts = String((long)time(nullptr));
  String nonce = genNonce();
  String msg = String(DEVICE_ID) + ":" + ts + ":" + nonce + ":" + body;
  String sig = hmacSha256(msg, HMAC_SECRET);

  http.begin(path);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-id", DEVICE_ID);
  http.addHeader("x-device-token", DEVICE_TOKEN);
  http.addHeader("x-timestamp", ts);
  http.addHeader("x-nonce", nonce);
  http.addHeader("x-signature", sig);
  int code = http.POST(body);
  http.end();
  return code >= 200 && code < 300;
}

void pullAndExecute() {
  HTTPClient http;
  String path = String(API_BASE) + "/iot/commands/pull?deviceId=" + DEVICE_ID;

  String ts = String((long)time(nullptr));
  String nonce = genNonce();
  String msg = String(DEVICE_ID) + ":" + ts + ":" + nonce + ":";
  String sig = hmacSha256(msg, HMAC_SECRET);

  http.begin(path);
  http.addHeader("x-device-token", DEVICE_TOKEN);
  http.addHeader("x-timestamp", ts);
  http.addHeader("x-nonce", nonce);
  http.addHeader("x-signature", sig);

  int code = http.GET();
  if (code < 200 || code >= 300) { http.end(); return; }

  String resp = http.getString();
  http.end();

  StaticJsonDocument<512> root;
  if (deserializeJson(root, resp) != DeserializationError::Ok) return;
  if (root["command"].isNull()) return;

  String commandId = root["command"]["id"].as<String>();
  String type = root["command"]["type"].as<String>();
  String tableId = root["command"]["payload"]["tableId"] | "";

  int pin = relayPinByTableId(tableId);
  bool ok = false;

  if (pin != -1) {
    if (type == "LIGHT_ON") {
      digitalWrite(pin, HIGH);
      ok = true;
    } else if (type == "LIGHT_OFF") {
      digitalWrite(pin, LOW);
      ok = true;
    } else if (type == "BLINK_3X") {
      for (int i = 0; i < 3; i++) {
        digitalWrite(pin, HIGH); delay(200);
        digitalWrite(pin, LOW);  delay(200);
      }
      ok = true;
    }
  }

  ackCommand(commandId, ok);
}

void setup() {
  Serial.begin(115200);

  for (int i = 0; i < relayCount; i++) {
    pinMode(relays[i].pin, OUTPUT);
    digitalWrite(relays[i].pin, LOW);
  }

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(500);

  configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  while (time(nullptr) < 100000) delay(200);
}

void loop() {
  static unsigned long lastHeartbeat = 0;
  static unsigned long lastPull = 0;

  if (millis() - lastHeartbeat > 30000) {
    heartbeat();
    lastHeartbeat = millis();
  }

  if (millis() - lastPull > 5000) {
    pullAndExecute();
    lastPull = millis();
  }
}
```

Catatan penting:
- Pastikan API env mengisi `IOT_GATEWAY_DEVICE_ID` dengan device ID ESP gateway Anda.
- ESP harus pakai jam yang akurat (NTP) karena backend memvalidasi `x-timestamp` dalam window tertentu.
- `x-nonce` wajib unik setiap request agar tidak ditolak sebagai replay attack.

---

## Server-side Timer

The NestJS `BillingService` uses `@Cron(EVERY_30_SECONDS)` to:
1. Auto-complete expired sessions and send `LIGHT_OFF`
2. Send `BLINK_3X` when ≤60 seconds remain

This runs server-side — **independent of any browser connection**.

---

## Payment Flow

```
1. Cashier clicks "Checkout"
2. System creates Payment with status: PENDING_PAYMENT
3. Cashier enters amount received
4. Cashier clicks "Uang Diterima"
5. Status → PAID, stock deducted, receipt JSON generated
6. Cashier clicks "Tandai Tercetak" → isPrinted = true
```

---

## Receipt Structure

```json
{
  "paymentNumber": "PAY-20240115-0001",
  "cashier": "Citra Kasir",
  "table": "Meja 3",
  "billingSession": { "duration": 60, "rate": 30000, "amount": 30000 },
  "fnbItems": [{ "name": "Es Teh", "qty": 2, "subtotal": 10000 }],
  "subtotal": 40000,
  "discount": 0,
  "tax": 0,
  "total": 40000,
  "amountPaid": 50000,
  "change": 10000,
  "method": "CASH",
  "paidAt": "2024-01-15T14:30:00Z"
}
```

---

## Production Deployment

### Environment Variables (Production)
- Use strong random values for JWT_SECRET, JWT_REFRESH_SECRET, IOT_HMAC_SECRET
- Set NODE_ENV=production
- Configure CORS_ORIGIN to your actual domain
- Use Redis for nonce storage (replace in-memory Map)

### Build
```bash
# API
cd apps/api
npm run build
npm run prisma:deploy
npm start

# Web
cd apps/web
npm run build
npm start
```

---

## Seeded Data

After `npm run prisma:seed`:
- 3 users (owner/manager/cashier)
- 10 billiard tables (Meja 1-10, rate Rp30k-40k/jam)
- 1 IoT gateway device (single ESP architecture, token rotated each seed run)
- 20 menu items across 5 categories
- 5 operational assets
