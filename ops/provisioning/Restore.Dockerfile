ARG BACKUP_IMAGE
ARG OPERATIONS_IMAGE
FROM ${OPERATIONS_IMAGE} AS operations
FROM ${BACKUP_IMAGE}
RUN apk add --no-cache nodejs
COPY --from=operations /app/node_modules /app/node_modules
COPY apps/api/scripts/postgres-restore-audit.cjs /app/scripts/postgres-restore-audit.cjs
COPY ops/postgres-backup/restore-verify.sh ops/postgres-backup/lib.sh ops/postgres-backup/status.py /opt/aen-shift/backup/
ENTRYPOINT ["sh", "/opt/aen-shift/backup/restore-verify.sh"]
