# ColonyDeposit 🏢💰

ColonyDeposit is a purpose-built web application engineered for collecting and managing residential security deposits in Indian housing colonies, apartment complexes, and Resident Welfare Associations (RWAs).

Residents pay securely from their smartphones (mobile-first PWA with UPI / Net Banking), while the management committee monitors balances, records offline collections (cash/cheque), approves refunds, and issues printable receipts from a desktop workstation.

---

## 🛠️ Tech Stack

- **Frontend (`/apps/web`)**: Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui design tokens, TanStack React Query, Zod. Mobile-first PWA with unified desktop responsiveness.
- **Backend Services**:
  - Next.js API Routes for fast edge BFF & client routes.
  - **NestJS Service (`/apps/api`)** for payment processing, webhook verification, and BullMQ background workers.
- **Database (`/packages/database`)**: PostgreSQL 16 managed via Prisma ORM with connection pooling (PgBouncer/Supabase compatible).
- **Cache & Message Broker**: Redis 7 + BullMQ for asynchronous job queues (receipt PDF generation, notification delivery, reconciliation).
- **Authentication**: Phone OTP login (MSG91 / Twilio), JWT Access & Refresh tokens, Role-Based Access Control (RBAC: `RESIDENT`, `ADMIN`, `SUPER_ADMIN`).
- **Payment Gateway**: Razorpay integrated behind an abstracted gateway provider interface.
- **Storage & Monitoring**: Cloudflare R2 (S3-compatible) for receipt PDFs and documents; Sentry for exception tracking and performance tracing.

---

## 📐 Project Architecture (Monorepo)

```text
colonydeposit/
├── apps/
│   ├── web/                     # Next.js 15 App Router (Resident PWA & Admin Portal)
│   │   ├── src/app/             # Pages, layouts, and server actions
│   │   ├── tailwind.config.ts   # Shared design system theme tokens
│   │   └── Dockerfile           # Multi-stage production container
│   └── api/                     # NestJS Service (Payments, Webhooks, BullMQ Queues)
│       ├── src/main.ts          # API Bootstrap (port 4000)
│       ├── src/app.module.ts    # Module configuration
│       └── Dockerfile           # Multi-stage production container
├── packages/
│   ├── database/                # Prisma ORM, migrations, and seed scripts
│   │   ├── prisma/
│   │   │   ├── schema.prisma    # PostgreSQL Schema
│   │   │   ├── migrations/      # Version-controlled SQL migrations
│   │   │   └── seed.ts          # Comprehensive seed script
│   │   └── src/index.ts         # Singleton client with connection pooling & BigInt JSON serialization
│   └── shared/                  # Shared Zod validation schemas, types, and currency math
│       ├── src/schemas/         # User, House, Deposit, Payment, Receipt, Refund schemas
│       ├── src/utils/currency.ts# Safe integer paise currency conversion utilities
│       └── src/constants/       # System enums & constants
├── docker-compose.yml           # PostgreSQL 16 and Redis 7 local development services
├── .env.example                 # Environment variables specification
├── tsconfig.base.json           # Base TypeScript configuration
└── package.json                 # Monorepo workspace configuration
```

---

## 🪙 Core System Rules

1. **Paise Integer Storage**:
   - Monetary figures are **strictly stored as integers in paise** (`BigInt` / integer), never as floating-point numbers.
   - Example: ₹50,000 is stored as `5000000` paise.
   - All conversions are handled by verified math utilities in `@colony/shared/utils/currency`.

2. **Immutable Audit Trails**:
   - Every financial action (payment order creation, verification, offline cash logging, refund approval, settings alteration) writes an immutable record to the `audit_logs` table containing actor ID, IP address, user agent, and a before/after JSON snapshot.

3. **Unified Design System**:
   - Mobile and desktop share identical color palettes, typography, UI components, and icons.
   - Layout is adaptive:
     - **Mobile (< 768px)**: Single column, bottom navigation bar, touch-first cards.
     - **Desktop (≥ 768px)**: Collapsible sidebar, multi-column dashboard, dense data tables.

4. **Zero Secrets in Code**:
   - All keys, secrets, and database credentials are read exclusively from environment variables.

---

## 🗄️ Database Schema & Entity Relationships

### Model Summary

| Table | Description | Key Fields |
| :--- | :--- | :--- |
| `users` | Residents, Admins, Super Admins | `phone` (unique), `role`, `status`, `deleted_at` |
| `houses` | Residential units in the colony | `block`, `house_number`, `type`, `owner_id`, `deleted_at` |
| `deposits` | Security deposit assessment per house | `house_id`, `amount_due`, `amount_paid`, `status`, `due_date` |
| `payments` | Transactions (online gateway & offline) | `deposit_id`, `user_id`, `amount`, `idempotency_key`, `is_offline` |
| `refunds` | Move-out or excess deposit reversals | `payment_id`, `amount`, `status`, `gateway_refund_id` |
| `receipts` | Official printable PDF payment slips | `payment_id`, `receipt_number` (unique), `pdf_url` |
| `notifications`| SMS / WhatsApp / Email alerts | `user_id`, `title`, `type`, `channel`, `status` |
| `audit_logs` | Immutable audit trail | `actor_id`, `action`, `entity`, `entity_id`, `before`, `after` |
| `settings` | Colony-wide rules & configuration | `colony_name`, `deposit_rules`, `late_fee_rules`, `enabled_methods` |

### Key Entity Relationships

1. **User ↔ House**: A `User` can own or occupy zero or more `House` units (`owner_id` FK). A unique composite constraint `(block, house_number)` ensures no duplicate units exist. Soft deletion (`deleted_at`) is maintained on both models.
2. **House ↔ Deposit**: A `House` has `Deposit` records representing scheduled deposit obligations.
3. **Deposit ↔ Payment**: A `Deposit` can receive multiple `Payment` installments until `amount_paid >= amount_due`.
4. **Payment ↔ User**: Every `Payment` links directly to the paying `User` (`user_id` FK) as well as the target `Deposit`.
5. **Payment ↔ Receipt**: Successful payments have a 1-to-1 relationship with an official `Receipt` featuring a unique sequential receipt number.
6. **Payment ↔ Refund**: A `Payment` can have associated `Refund` records tracking partial or full deposit returns.
7. **AuditLog**: Retains an actor relation to `User` (`onDelete: SetNull`) ensuring audit history is preserved even if a user account is removed.

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 20+ (Node 22 or 24 recommended)
- Docker & Docker Compose (or local PostgreSQL 16 & Redis 7 instances)

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### 3. Spin up Postgres & Redis (Docker)
```bash
docker compose up -d
```

### 4. Install Dependencies
```bash
npm install
```

### 5. Run Database Migrations & Seed Sample Data
```bash
# Generate Prisma Client
npm run db:generate

# Execute migration against PostgreSQL
npm run db:migrate

# Seed 1 super admin, 2 admins, 50 residents/houses, sample deposits & payments
npm run db:seed
```

### 6. Start Development Servers
```bash
# Start both Next.js web application and NestJS API service
npm run dev

# Or start individually:
npm run dev:web  # Web app at http://localhost:3000
npm run dev:api  # NestJS API at http://localhost:4000/api/v1
```

### 7. Inspect Database with Prisma Studio
```bash
npm run db:studio
```
Prisma Studio will launch at `http://localhost:5555`.

