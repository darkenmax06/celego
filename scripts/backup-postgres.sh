#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/home/server/home/apps/celego}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_DIR/docker-compose.yml}"
DB_SERVICE="${DB_SERVICE:-db}"
POSTGRES_USER="${POSTGRES_USER:-celego}"
POSTGRES_DB="${POSTGRES_DB:-celego}"
KEEP_BACKUPS="${KEEP_BACKUPS:-5}"
DOCKER_BIN="${DOCKER_BIN:-docker}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$BACKUP_DIR/celego-$timestamp.sql.gz"
tmp_file="$backup_file.tmp"

mkdir -p "$BACKUP_DIR"

cleanup() {
  rm -f "$tmp_file"
}
trap cleanup EXIT

"$DOCKER_BIN" compose -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  | gzip -9 > "$tmp_file"

mv "$tmp_file" "$backup_file"

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'celego-*.sql.gz' -printf '%T@ %p\n' \
  | sort -rn \
  | awk -v keep="$KEEP_BACKUPS" 'NR > keep { $1=""; sub(/^ /, ""); print }' \
  | xargs -r rm -f

echo "Backup created: $backup_file"
