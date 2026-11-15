#!/usr/bin/env bash
# Backup hook: uploads <backup-file> to Google Drive with rclone, then deletes
# remote backups older than $BACKUP_RETENTION_DAYS. See README.md.
set -euo pipefail

backup_file="${1:?usage: gdrive.sh <backup-file>}"
RCLONE_BIN="${RCLONE_BIN:-rclone}"
GDRIVE_REMOTE="${GDRIVE_REMOTE:-gdrive}"
GDRIVE_FOLDER="${GDRIVE_FOLDER:-celego-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-15}"

dest="$GDRIVE_REMOTE:$GDRIVE_FOLDER"
name="$(basename "$backup_file")"

"$RCLONE_BIN" copyto "$backup_file" "$dest/$name" --retries 5 --low-level-retries 10

# Make sure the upload really landed before pruning anything.
"$RCLONE_BIN" lsf "$dest" --files-only --include "$name" | grep -qx "$name"

# Prune only after a successful upload, and only our own files.
"$RCLONE_BIN" delete "$dest" \
  --min-age "${RETENTION_DAYS}d" \
  --include 'celego-*.sql.gz' \
  --drive-use-trash=false

echo "Uploaded $name to $dest; pruned backups older than ${RETENTION_DAYS}d."
