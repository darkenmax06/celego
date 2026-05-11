#!/bin/sh
set -eu

is_true() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

if is_true "${RUN_DB_PUSH:-true}"; then
  echo "==> Aplicando schema Prisma"
  npx prisma db push --skip-generate
fi

if is_true "${RUN_DB_BOOTSTRAP:-true}"; then
  echo "==> Ejecutando bootstrap de catalogos"
  npm run db:bootstrap
fi

echo "==> Iniciando app"
exec npm run start
