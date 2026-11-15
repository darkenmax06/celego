#!/usr/bin/env bash
# Dumps the Celego database and hands the file to $BACKUP_HOOK, which ships it
# off the server. The local copy is removed once the hook succeeds; if the hook
# fails, the dump stays in $BACKUP_DIR (last $KEEP_FAILED files) so nothing is lost.
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/home/server/home/apps/celego}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
COMPOSE_FILE="${COMPOSE_FILE:-}"
DB_SERVICE="${DB_SERVICE:-db}"
KEEP_FAILED="${KEEP_FAILED:-3}"
DOCKER_BIN="${DOCKER_BIN:-docker}"
BACKUP_HOOK="${BACKUP_HOOK:-}"
export BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-15}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$BACKUP_DIR/celego-$timestamp.sql.gz"
tmp_file="$backup_file.tmp"

mkdir -p "$BACKUP_DIR"

cleanup() {
  rm -f "$tmp_file"
}
trap cleanup EXIT

# Without COMPOSE_FILE, compose runs in PROJECT_DIR so docker-compose.override.yml
# applies. Credentials come from the db container's own environment.
compose_args=()
[[ -n "$COMPOSE_FILE" ]] && compose_args=(-f "$COMPOSE_FILE")
(cd "$PROJECT_DIR" && "$DOCKER_BIN" compose "${compose_args[@]}" exec -T "$DB_SERVICE" \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists') \
  | gzip -9 > "$tmp_file"

# An empty or corrupt archive must never reach the remote (it would count as a
# valid backup and push a good one out of the retention window).
gzip -t "$tmp_file"
mv "$tmp_file" "$backup_file"
echo "Backup created: $backup_file"

if [[ -z "$BACKUP_HOOK" ]]; then
  echo "BACKUP_HOOK not set; keeping local copy only." >&2
  exit 1
fi

if "$BACKUP_HOOK" "$backup_file"; then
  rm -f "$backup_file"
  echo "Backup shipped and local copy removed."
  status=0
else
  echo "Backup hook failed; local copy kept: $backup_file" >&2
  status=1
fi

# Cap leftovers from failed uploads so the server disk never fills up.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'celego-*.sql.gz' -printf '%T@ %p\n' \
  | sort -rn \
  | awk -v keep="$KEEP_FAILED" 'NR > keep { $1=""; sub(/^ /, ""); print }' \
  | xargs -r rm -f

exit "$status"
