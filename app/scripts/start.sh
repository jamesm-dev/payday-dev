#!/bin/sh
# Container entrypoint. On an empty volume — a new machine, or the restore drill — restore the
# database from the latest backup first, then run the app under Litestream so every write is
# replicated. With no replica configured the app runs alone and says so loudly.
set -eu

: "${DATABASE_URL:?DATABASE_URL must be set}"

if [ -z "${REPLICA_BUCKET:-}" ]; then
	echo '{"level":"warn","msg":"REPLICA_BUCKET is not set: running WITHOUT backups"}'
	exec node build
fi

litestream restore -config /app/litestream.yml -if-db-not-exists -if-replica-exists "$DATABASE_URL"
exec litestream replicate -config /app/litestream.yml -exec "node build"
