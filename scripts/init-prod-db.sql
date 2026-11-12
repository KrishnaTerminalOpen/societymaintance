-- ColonyDeposit Production PostgreSQL Initialization Script
-- Enables performance monitoring & cryptographic extensions on initial DB creation

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

