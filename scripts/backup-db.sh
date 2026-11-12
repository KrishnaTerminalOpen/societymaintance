#!/usr/bin/env bash
# ==============================================================================
# ColonyDeposit - Automated Daily PostgreSQL Backup & PITR Archival Script
# ==============================================================================
set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/colonydeposit}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DATE_DAY=$(date +"%Y%m%d")
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-colony_deposit_production}"
DB_USER="${POSTGRES_USER:-colony_prod_admin}"
S3_BACKUP_BUCKET="${S3_BACKUP_BUCKET:-s3://colony-db-backups/production}"

mkdir -p "${BACKUP_DIR}"

BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.dump.gz"
CHECKSUM_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sha256"

echo "================================================================="
echo "🗄️ Starting ColonyDeposit Automated Database Backup: ${TIMESTAMP}"
echo "================================================================="

# 1. Execute pg_dump with custom compression format
echo "⏳ Dumping database '${DB_NAME}' from ${DB_HOST}:${DB_PORT}..."
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -F c \
  -b \
  -v \
  -d "${DB_NAME}" | gzip -9 > "${BACKUP_FILE}"

echo "✅ Database dump completed: ${BACKUP_FILE} ($(du -h "${BACKUP_FILE}" | cut -f1))"

# 2. Generate SHA-256 Checksum for integrity verification
sha256sum "${BACKUP_FILE}" > "${CHECKSUM_FILE}"
echo "🔒 SHA-256 Checksum generated: $(cat "${CHECKSUM_FILE}")"

# 3. Encrypt backup if ENCRYPTION_KEY is provided
if [ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]; then
  echo "🔐 Encrypting backup archive using AES-256..."
  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
    -in "${BACKUP_FILE}" \
    -out "${BACKUP_FILE}.enc" \
    -pass pass:"${BACKUP_ENCRYPTION_PASSPHRASE}"
  rm "${BACKUP_FILE}"
  BACKUP_FILE="${BACKUP_FILE}.enc"
fi

# 4. Upload to Cloudflare R2 / AWS S3 if AWS CLI or Rclone is configured
if command -v aws &> /dev/null && [ -n "${S3_BACKUP_BUCKET:-}" ]; then
  echo "☁️ Uploading encrypted dump and checksum to ${S3_BACKUP_BUCKET}/daily/..."
  aws s3 cp "${BACKUP_FILE}" "${S3_BACKUP_BUCKET}/daily/"
  aws s3 cp "${CHECKSUM_FILE}" "${S3_BACKUP_BUCKET}/daily/"
  echo "✅ Remote upload successful."
fi

# 5. Backup Retention Pruning: Keep local daily backups for 30 days
echo "🧹 Pruning local database dumps older than 30 days..."
find "${BACKUP_DIR}" -type f -name "${DB_NAME}_*.dump.gz*" -mtime +30 -exec rm -f {} +
find "${BACKUP_DIR}" -type f -name "${DB_NAME}_*.sha256" -mtime +30 -exec rm -f {} +

echo "================================================================="
echo "🎉 Backup workflow finished successfully."
echo "================================================================="

