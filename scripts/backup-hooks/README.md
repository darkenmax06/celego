# Backup hooks

`scripts/backup-postgres.sh` creates the dump and then calls the executable set in
`BACKUP_HOOK`. The backup script knows nothing about where the file ends up.

## Contract

```
"$BACKUP_HOOK" <backup-file>
```

- `BACKUP_RETENTION_DAYS` is exported (default `15`).
- The hook ships the file to its destination and deletes copies older than the
  retention window there.
- Exit `0` on success; any other code marks the systemd run as failed.
- On success the local dump is deleted, so nothing stays on the server. On
  failure it is kept in `backups/` (at most the last `KEEP_FAILED`, default `3`).

To change the destination, write a new hook with the same contract and point
`BACKUP_HOOK` at it in `deploy/systemd/celego-backup.service`.

## Google Drive (`gdrive.sh`)

Uses [rclone](https://rclone.org/drive/). One-time setup on the server, as the user
the service runs as (`root` by default):

```bash
sudo apt install rclone
sudo rclone config        # new remote, name "gdrive", type "drive", scope "drive.file"
sudo rclone lsd gdrive:   # confirm access
```

On a headless server, `rclone config` prints an `rclone authorize "drive"` command:
run it on a machine with a browser and paste the token back.

Variables: `GDRIVE_REMOTE` (default `gdrive`), `GDRIVE_FOLDER` (default
`celego-backups`), `RCLONE_BIN` (default `rclone`). Pruning runs only after the new
upload is confirmed, touches only `celego-*.sql.gz`, and deletes permanently
(`--drive-use-trash=false`) so old dumps do not eat Drive quota.

Schedule: `celego-backup.timer` runs every 4 hours (6 backups/day), so Drive holds
about 90 backups at any time.
