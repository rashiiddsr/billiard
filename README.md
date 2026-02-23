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
```

**apps/web/.env.local:**
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
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

## Default Login Credentials

| Role | Email | Password | PIN |
|------|-------|----------|-----|
| OWNER | owner@billiard.com | owner123 | 123456 |
| MANAGER | manager@billiard.com | manager123 | - |
| CASHIER | cashier@billiard.com | cashier123 | - |

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
- 2 IoT devices (linked to Meja 1 & 2)
- 20 menu items across 5 categories
- 5 operational assets
