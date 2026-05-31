#!/usr/bin/env sh
# Container entrypoint for the Galleria Principii API.
#
# Responsibilities:
#   1. Ensure the /data volume is writable for the runtime user.
#   2. Apply any pending Prisma migrations (idempotent).
#   3. Exec the API process so it inherits PID 1 signals from tini.
#
# Skipping migrations is supported for ops drills via SKIP_MIGRATIONS=1.

set -eu

DATA_DIR="${DATA_DIR:-/data}"

if [ ! -d "${DATA_DIR}" ]; then
  echo "[entrypoint] creating data dir ${DATA_DIR}"
  mkdir -p "${DATA_DIR}"
fi

if [ ! -w "${DATA_DIR}" ]; then
  echo "[entrypoint] FATAL: ${DATA_DIR} is not writable by $(id -un)" >&2
  exit 1
fi

if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  echo "[entrypoint] running prisma migrate deploy"
  # `--schema` keeps this resilient to the working directory.
  npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
else
  echo "[entrypoint] SKIP_MIGRATIONS=1, skipping prisma migrate deploy"
fi

echo "[entrypoint] starting API: $*"
exec "$@"
