-- ==============================================================================
-- ColonyDeposit - Initial PostgreSQL Migration
-- ==============================================================================

-- Create Enums
CREATE TYPE "UserRole" AS ENUM ('RESIDENT', 'ADMIN', 'SUPER_ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING_VERIFICATION', 'SUSPENDED');
CREATE TYPE "HouseType" AS ENUM ('FLAT_1BHK', 'FLAT_2BHK', 'FLAT_3BHK', 'FLAT_4BHK', 'VILLA', 'PENTHOUSE', 'PLOT');
CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'REFUNDED');
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');
CREATE TYPE "PaymentMethod" AS ENUM ('UPI', 'NET_BANKING', 'DEBIT_CARD', 'CREDIT_CARD', 'CASH', 'CHEQUE', 'BANK_TRANSFER');
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');
CREATE TYPE "NotificationType" AS ENUM ('OTP', 'PAYMENT_DUE', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'PAYMENT_OVERDUE', 'REFUND_PROCESSED', 'SYSTEM_ALERT', 'RECEIPT_GENERATED');
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL', 'IN_APP');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED');
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'PAYMENT_INITIATED', 'PAYMENT_VERIFIED', 'OFFLINE_PAYMENT_RECORDED', 'REFUND_REQUESTED', 'REFUND_COMPLETED', 'SETTINGS_UPDATED');

-- Create Table: users
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255),
    "role" "UserRole" NOT NULL DEFAULT 'RESIDENT',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- Create Table: houses
CREATE TABLE "houses" (
    "id" TEXT NOT NULL,
    "block" VARCHAR(20) NOT NULL,
    "house_number" VARCHAR(30) NOT NULL,
    "type" "HouseType" NOT NULL DEFAULT 'FLAT_2BHK',
    "owner_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "houses_pkey" PRIMARY KEY ("id")
);

-- Create Table: deposits
CREATE TABLE "deposits" (
    "id" TEXT NOT NULL,
    "house_id" TEXT NOT NULL,
    "title" VARCHAR(150) NOT NULL DEFAULT 'Security Deposit',
    "amount_due" BIGINT NOT NULL,
    "amount_paid" BIGINT NOT NULL DEFAULT 0,
    "status" "DepositStatus" NOT NULL DEFAULT 'PENDING',
    "due_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- Create Table: payments
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "deposit_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "gateway_order_id" VARCHAR(100),
    "gateway_payment_id" VARCHAR(100),
    "gateway_signature" VARCHAR(255),
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "idempotency_key" VARCHAR(128) NOT NULL,
    "is_offline" BOOLEAN NOT NULL DEFAULT false,
    "offline_notes" TEXT,
    "offline_verified_by" VARCHAR(100),
    "offline_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- Create Table: refunds
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "gateway_refund_id" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- Create Table: receipts
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "receipt_number" VARCHAR(60) NOT NULL,
    "pdf_url" VARCHAR(500) NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- Create Table: notifications
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'PAYMENT_DUE',
    "channel" "NotificationChannel" NOT NULL DEFAULT 'SMS',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "read_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- Create Table: audit_logs
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_phone" VARCHAR(20),
    "action" "AuditAction" NOT NULL,
    "entity" VARCHAR(50) NOT NULL,
    "entity_id" VARCHAR(100) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- Create Table: settings
CREATE TABLE "settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "colony_name" VARCHAR(150) NOT NULL DEFAULT 'Residential Welfare Association',
    "logo_url" VARCHAR(500),
    "address" TEXT,
    "contact_phone" VARCHAR(20),
    "contact_email" VARCHAR(100),
    "deposit_rules" JSONB NOT NULL DEFAULT '{}',
    "late_fee_rules" JSONB NOT NULL DEFAULT '{}',
    "enabled_payment_methods" TEXT[] DEFAULT ARRAY['UPI', 'NET_BANKING', 'DEBIT_CARD', 'CREDIT_CARD', 'CASH', 'CHEQUE', 'BANK_TRANSFER']::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- Unique Constraints
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "houses_block_house_number_key" ON "houses"("block", "house_number");
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");
CREATE UNIQUE INDEX "receipts_payment_id_key" ON "receipts"("payment_id");
CREATE UNIQUE INDEX "receipts_receipt_number_key" ON "receipts"("receipt_number");

-- Performance & Foreign Key Indexes
CREATE INDEX "users_role_idx" ON "users"("role");
CREATE INDEX "users_status_idx" ON "users"("status");
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

CREATE INDEX "idx_houses_owner_id" ON "houses"("owner_id");
CREATE INDEX "houses_block_idx" ON "houses"("block");
CREATE INDEX "houses_deleted_at_idx" ON "houses"("deleted_at");
CREATE INDEX "houses_created_at_idx" ON "houses"("created_at");

CREATE INDEX "idx_deposits_house_id" ON "deposits"("house_id");
CREATE INDEX "idx_deposits_status" ON "deposits"("status");
CREATE INDEX "deposits_due_date_idx" ON "deposits"("due_date");
CREATE INDEX "idx_deposits_created_at" ON "deposits"("created_at");

CREATE INDEX "payments_deposit_id_idx" ON "payments"("deposit_id");
CREATE INDEX "idx_payments_user_id" ON "payments"("user_id");
CREATE INDEX "idx_payments_status" ON "payments"("status");
CREATE INDEX "idx_payments_gateway_order_id" ON "payments"("gateway_order_id");
CREATE INDEX "payments_gateway_payment_id_idx" ON "payments"("gateway_payment_id");
CREATE INDEX "idx_payments_created_at" ON "payments"("created_at");

CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");
CREATE INDEX "idx_refunds_status" ON "refunds"("status");
CREATE INDEX "refunds_gateway_refund_id_idx" ON "refunds"("gateway_refund_id");
CREATE INDEX "idx_refunds_created_at" ON "refunds"("created_at");

CREATE INDEX "receipts_receipt_number_idx" ON "receipts"("receipt_number");
CREATE INDEX "idx_receipts_created_at" ON "receipts"("created_at");

CREATE INDEX "idx_notifications_user_id" ON "notifications"("user_id");
CREATE INDEX "idx_notifications_status" ON "notifications"("status");
CREATE INDEX "notifications_type_idx" ON "notifications"("type");
CREATE INDEX "idx_notifications_created_at" ON "notifications"("created_at");

CREATE INDEX "idx_audit_logs_actor_id" ON "audit_logs"("actor_id");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs"("created_at");

-- Foreign Key Constraints
ALTER TABLE "houses" ADD CONSTRAINT "houses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_deposit_id_fkey" FOREIGN KEY ("deposit_id") REFERENCES "deposits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

